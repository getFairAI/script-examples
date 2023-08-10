/*
 * Copyright (c) 2023 Fair Protocol
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'node:fs';
import CONFIG from '../config.json' assert { type: 'json' };
import Arweave from 'arweave';
import { default as Pino } from 'pino';
import { IEdge, OperatorParams, UrlConfig } from './interfaces';
import {
  INFERENCE_TRANSACTION_TAG,
  SCRIPT_TRANSACTION_TAG,
  SEQUENCE_OWNER_TAG,
  secondInMS,
} from './constants';
import {
  queryTransactionsReceived,
  getModelOwner,
  queryOperatorRegistrations,
  isRegistrationCancelled,
} from './queries';
import { JWKInterface } from 'arweave/node/lib/wallet';
import workerpool from 'workerpool';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let address: string;
const registrations: OperatorParams[]  = [];
const lastProcessedTxs: string[] = [];

const logger = Pino({
  name: 'Operator Loop',
  level: 'info',
});

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

const pool = workerpool.pool(__dirname + '/worker.cjs', { maxWorkers: workerpool.cpus });
logger.info(pool.stats());

const JWK: JWKInterface = JSON.parse(fs.readFileSync('wallet.json').toString());

const findRegistrations = async () => {
  const registrationTxs = await queryOperatorRegistrations(address);
  
  // filtered cancelled registrations
  const filtered = [];
  for (const tx of registrationTxs) {
    const txid = tx.node.id;
    const isTxCancelled = await isRegistrationCancelled(txid, address);
    // filter by scripts that have config  url
    const urls = Object.keys(CONFIG.urls);
    const scriptTx = tx.node.tags.find(tag => tag.name === 'Script-Transaction')?.value;
    const scriptName = tx.node.tags.find(tag => tag.name === 'Script-Name')?.value;
    const hasUrlForScript = scriptTx && urls.includes(scriptTx);

    if (!isTxCancelled && hasUrlForScript) {
      filtered.push(tx);
    } else if (!hasUrlForScript && !isTxCancelled) {
      logger.info(`Script ${scriptName}(id: '${scriptTx}') not found in config, Registration for this script will be ignored. Skipping...`);
    } else {
      logger.info(`Registration with id '${txid}' is cancelled. Skipping...`);
    }
  }

  return filtered;
};

// eslint-disable-next-line no-unused-vars
const startThread = (reqTxId: string, reqUserAddr: string, currentRegistration: OperatorParams, address: string, handleWorkerEvents: (payload: { type: 'info' | 'error', message: string}) => void) => pool.exec('processRequest', [reqTxId, reqUserAddr, currentRegistration, address], { on: handleWorkerEvents });

const stopPool = () => pool.terminate();

const handleWorkerEvents = (payload: { type: 'info' | 'error', message: string}) => {
  if (payload.type === 'error') {
    logger.error(payload.message);
  } else {
    logger.info(payload.message);
  }
};

const start = async () => {
  try {
    /* const scriptNames = registrations.map(reg => reg.scripName);
    const scriptCurators = registrations.map(reg => reg.scriptCurator); */
    const scriptIds = registrations.map(reg => reg.scriptId);
    const operatorFees = registrations.map(reg => reg.operatorFee);
    // request only new txs
    const { requestTxs, hasNextPage } = await queryTransactionsReceived(address, operatorFees, scriptIds);

    const newRequestTxs = requestTxs.filter(
      (tx) => !lastProcessedTxs.find((txid) => txid === tx.node.id),
    );

    let fetchMore = hasNextPage;

    const pageSize = 10;
    // if lastProcessed request length is bigger than one page then script already processed all previous requests
    if (lastProcessedTxs.length <= pageSize) {
      while (fetchMore && newRequestTxs.length > 0) {
        const { requestTxs: nextPageTxs, hasNextPage: newHasNextPage } =
          await queryTransactionsReceived(
            address,
            operatorFees,
            scriptIds,
            newRequestTxs[newRequestTxs.length - 1].cursor,
          );

        newRequestTxs.push(...nextPageTxs);
        fetchMore = newHasNextPage;
      }
    }

    const threadPromises: workerpool.Promise<Promise<boolean | string>, Error>[] = [];

    for (const edge of newRequestTxs) {
      logger.info(`Processing request ${edge.node.id} ...`);
      // Check if request already answered:
      const reqTxId = edge.node.tags.find((tag) => tag.name === INFERENCE_TRANSACTION_TAG)?.value;
      const reqUserAddr = edge.node.tags.find((tag) => tag.name === SEQUENCE_OWNER_TAG)?.value;
      const currentRegistration = registrations.find((reg) => reg.scriptId === edge.node.tags.find((tag) => tag.name === SCRIPT_TRANSACTION_TAG)?.value);

      if (reqTxId && reqUserAddr && currentRegistration) {
        // successRequest = await processRequest(reqTxId, reqUserAddr, currentRegistration);
        threadPromises.push(startThread(reqTxId, reqUserAddr, currentRegistration, address, handleWorkerEvents));
      } else {
        logger.error('No Registration, inference Tx or userAddr found for request. Skipping...');
        // skip requests without inference transaction tag
      }
    }
    logger.info(pool.stats());
    // await pool excution
    const results = await Promise.all(threadPromises);
    // filter only successful processed requests
    const successfulProcessedRequests = newRequestTxs.filter(el => results.includes(el.node.tags.find((tag) => tag.name === INFERENCE_TRANSACTION_TAG)?.value as string));
    // save latest tx id only for successful processed requests
    lastProcessedTxs.push(...successfulProcessedRequests.map(el => el.node.id));
  } catch (e) {
    logger.error(`Errored with: ${e}`);
  }
  logger.info(`Sleeping for ${CONFIG.sleepTimeSeconds} second(s) ...`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const urls = CONFIG.urls;
  address = await arweave.wallets.jwkToAddress(JWK);

  logger.info(`Wallet address: ${address}. Fetching Registrations...`);

  let tempRegistrations: IEdge[] = [];
  try {
    tempRegistrations = await findRegistrations();
  } catch (err) {
    stopPool();
    logger.error('Error Fetching Operator Registrations');
    logger.info('Shutting down...');

    process.exit(1);
  }

  try {
    for (const tx of tempRegistrations) {
      let hasErrors = false;
      const txid = tx.node.id;
      const tags = tx.node.tags;

      
      const scriptName = tags.find(tag => tag.name === 'Script-Name')?.value;
      const scriptCurator = tags.find(tag => tag.name === 'Script-Curator')?.value;
      const scriptId = tags.find(tag => tag.name === 'Script-Transaction')?.value;
      const feeIndex = tags.findIndex((tag) => tag.name === 'Operator-Fee');

      if (!scriptCurator) {
        logger.error(`Could not find Script Curator for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }
      
      if (!scriptName) {
        logger.error(`Could not find Script Name for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }

      if (!scriptId) {
        logger.error(`Could not find Script Transaction for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }

      const modelOwner = await getModelOwner(scriptName as string, scriptCurator as string);
      if (!modelOwner) {
        logger.error(`Could not find Model Owner for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }

      if (feeIndex < 0) {
        logger.error(`Could not find Operator Fee Tag for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }

      const opFee = parseFloat(tags[feeIndex].value);
      if (Number.isNaN(opFee) || opFee <= 0) {
        logger.error(`Invalid Operator Fee Found for registration '${txid}'. Ignoring...`);
        hasErrors = true;
      }

      const urlConf: UrlConfig = (urls as any)[scriptId as string];

      if (!hasErrors) {
        registrations.push({
          ...urlConf,
          modelOwner,
          scriptId: scriptId as string,
          operatorFee: opFee,
          scripName: scriptName as string,
          scriptCurator: scriptCurator as string, 
          registrationTx: tx,
        });
      } else {
        // ignore registrations with errors
      }
    }
  } catch (err) {
    stopPool();
    logger.error('Error Fetching Model Owners for registrations');
    logger.info('Shutting down...');

    process.exit(1);
  }

  if (registrations.length === 0) {
    stopPool();
    logger.error('No registrations found. Shutting down...');
    process.exit(1);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await start();
    await sleep(CONFIG.sleepTimeSeconds * secondInMS);
  }
})();
