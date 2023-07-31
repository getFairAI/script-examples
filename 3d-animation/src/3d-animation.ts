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

import CONFIG from '../config.json' assert { type: 'json' };
import fs from 'fs';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import NodeBundlr from '@bundlr-network/client/build/esm/node/index';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { default as Pino } from 'pino';
import { IEdge } from './interfaces';
import {
  APP_NAME_TAG,
  APP_VERSION_TAG,
  ATOMIC_TOKEN_CONTRACT_ID,
  CONTENT_TYPE_TAG,
  CONVERSATION_IDENTIFIER_TAG,
  CREATOR_PERCENTAGE_FEE,
  CURATOR_PERCENTAGE_FEE,
  INFERENCE_TRANSACTION_TAG,
  INPUT_TAG,
  MARKETPLACE_PERCENTAGE_FEE,
  NET_ARWEAVE_URL,
  OPERATION_NAME_TAG,
  REQUEST_TRANSACTION_TAG,
  SCRIPT_CURATOR_TAG,
  SCRIPT_NAME_TAG,
  SCRIPT_USER_TAG,
  SEQUENCE_OWNER_TAG,
  UNIX_TIME_TAG,
  U_DIVIDER,
  VAULT_ADDRESS,
  secondInMS,
} from './constants';
import {
  getRequest,
  queryOperatorFee,
  queryTransactionAnswered,
  queryTransactionsReceived,
  queryCheckUserPayment,
  getModelOwner,
} from './queries';

let address: string;
let modelOwner: string;
let operatorFee: number;

const logger = Pino({
  name: '3d-animation',
  level: 'debug',
});

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

const JWK: JWKInterface = JSON.parse(fs.readFileSync('wallet.json').toString());
// initailze the bundlr SDK
// const bundlr: Bundlr = new (Bundlr as any).default(
const bundlr = new NodeBundlr('https://node1.bundlr.network', 'arweave', JWK);
const warp = WarpFactory.forMainnet().use(new DeployPlugin());

const sendToBundlr = async (
  responses: string[],
  prompt: string,
  appVersion: string,
  userAddress: string,
  requestTransaction: string,
  conversationIdentifier: string,
) => {
  // Get loaded balance in atomic units
  const atomicBalance = await bundlr.getLoadedBalance();
  logger.info(`node balance (atomic units) = ${atomicBalance}`);

  // Convert balance to an easier to read format
  const convertedBalance = bundlr.utils.fromAtomic(atomicBalance);
  logger.info(`node balance (converted) = ${convertedBalance}`);

  const tags = [
    { name: 'Custom-App-Name', value: 'Fair Protocol' },
    { name: 'Custom-App-Version', value: appVersion },
    { name: SCRIPT_CURATOR_TAG, value: CONFIG.scriptCurator },
    { name: SCRIPT_NAME_TAG, value: CONFIG.scriptName },
    { name: SCRIPT_USER_TAG, value: userAddress },
    { name: REQUEST_TRANSACTION_TAG, value: requestTransaction },
    { name: OPERATION_NAME_TAG, value: 'Script Inference Response' },
    { name: CONVERSATION_IDENTIFIER_TAG, value: conversationIdentifier },
    { name: CONTENT_TYPE_TAG, value: 'image/png' },
    { name: UNIX_TIME_TAG, value: (Date.now() / secondInMS).toString() },
    // add atomic token tags
    { name: APP_NAME_TAG, value: 'SmartWeaveContract' },
    { name: APP_VERSION_TAG, value: '0.3.0' },
    { name: 'Contract-Src', value: ATOMIC_TOKEN_CONTRACT_ID }, // use contract source here
    {
      name: 'Init-State',
      value: JSON.stringify({
        firstOwner: userAddress,
        canEvolve: false,
        balances: {
          [userAddress]: 1,
        },
        name: 'Fair Protocol NFT',
        ticker: 'FNFT',
      }),
    },
    { name: 'Title', value: 'Fair Protocol NFT' },
    { name: 'Description', value: prompt }, // use request prompt
    { name: 'Type', value: 'Image' },
  ];

  try {
    for (const response of responses) {
      const transaction = await bundlr.uploadFile(response, { tags });
      logger.info(`Data uploaded ==> https://arweave.net/${transaction.id}`);
      try {
        const { contractTxId } = await warp.register(transaction.id, 'node1'); // must use same node as uploaded data
        logger.info(`Token Registered ==> https://arweave.net/${contractTxId}`);
      } catch (e) {
        logger.error(`Could not register token: ${e}`); // just log error as tx can be registered after
      }
    }
  } catch (e) {
    // throw error to be handled by caller
    throw new Error(`Could not upload to bundlr: ${e}`);
  }
};

const inference = async function (requestTx: IEdge) {
  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.node.id}`);
  const text = await (await requestData.blob()).text();
  logger.info(`User Prompt: ${text}`);

  const payload = {
    enable_hr: "true",
    denoising_strength: 0.5,
    hr_scale: 2,
    hr_upscaler: "Latent",
    hr_second_pass_steps: 20,
    prompt: `masterpiece, best quality, ${text}`,
    seed: -1,
    n_iter: 4,
    steps: 20,
    cfg_scale: 7,
    negative_prompt: "EasyNegative, drawn by bad-artist, sketch by bad-artist-anime, (bad_prompt:0.8), (artist name, signature, watermark:1.4), (ugly:1.2), (worst quality, poor details:1.4), bad-hands-5, badhandv4, blurry,",
    sampler_index: "Euler a",
  }

  const res = await fetch(`${CONFIG.url}//sdapi/v1/txt2img`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const tempData: { images: string[] } = await res.json();
  const imgPaths = tempData.images.map((el, i)=>{
    fs.writeFileSync(`output_${i}.png`, Buffer.from(el, 'base64'))
    return `./output_${i}.png`
  });
  return { imgPaths, prompt: text };
};

const getOperatorFee = async (operatorAddress = address) => {
  const operatorRegistrationTxs: IEdge[] = await queryOperatorFee(operatorAddress);

  const firstValidRegistration = operatorRegistrationTxs[0];

  if (!firstValidRegistration) {
    throw new Error('Could Not Find Operator Registration.');
  }

  const tags = firstValidRegistration.node.tags;
  const feeIndex = tags.findIndex((tag) => tag.name === 'Operator-Fee');

  if (feeIndex < 0) {
    throw new Error('Could not find Operator Fee Tag for registration.');
  }

  const opFee = parseFloat(tags[feeIndex].value);
  if (Number.isNaN(opFee) || opFee <= 0) {
    throw new Error('Invalid Operator Fee Found for registration.');
  }

  return opFee;
};

const checkUserPaidInferenceFees = async (
  txid: string,
  userAddress: string,
  creatorAddress: string,
  curatorAddress: string,
) => {
  const marketplaceShare = operatorFee * MARKETPLACE_PERCENTAGE_FEE;
  const curatorShare = operatorFee * CURATOR_PERCENTAGE_FEE;
  const creatorShare = operatorFee * CREATOR_PERCENTAGE_FEE;

  const marketpaceInput = JSON.stringify({
    function: 'transfer',
    target: VAULT_ADDRESS,
    qty: parseInt(marketplaceShare.toString(), 10).toString(),
  });

  const curatorInput = JSON.stringify({
    function: 'transfer',
    target: curatorAddress,
    qty: parseInt(curatorShare.toString(), 10).toString(),
  });

  const creatorInput = JSON.stringify({
    function: 'transfer',
    target: creatorAddress,
    qty: parseInt(creatorShare.toString(), 10).toString(),
  });

  const paymentTxs: IEdge[] = await queryCheckUserPayment(txid, userAddress, [
    marketpaceInput,
    curatorInput,
    creatorInput,
  ]);
  const necessaryPayments = 3;

  if (paymentTxs.length < necessaryPayments) {
    return false;
  } else {
    // find marketplace payment
    const marketplacePayment = paymentTxs.find((tx) =>
      tx.node.tags.find((tag) => tag.name === INPUT_TAG && tag.value === marketpaceInput),
    );

    if (!marketplacePayment) {
      return false;
    }

    // find curator payment
    const curatorPayment = paymentTxs.find((tx) =>
      tx.node.tags.find((tag) => tag.name === INPUT_TAG && tag.value === curatorInput),
    );

    if (!curatorPayment) {
      return false;
    }

    // find creator payment
    const creatorPayment = paymentTxs.find((tx) =>
      tx.node.tags.find((tag) => tag.name === INPUT_TAG && tag.value === creatorInput),
    );

    if (!creatorPayment) {
      return false;
    }
  }

  return true;
};

const processRequest = async (requestId: string, reqUserAddr: string) => {
  const requestTx: IEdge = await getRequest(requestId);
  if (!requestTx) {
    // If the request doesn't exist, skip
    logger.error(`Request ${requestId} does not exist. Skipping...`);
    return false;
  }

  const responseTxs: IEdge[] = await queryTransactionAnswered(requestId, address);
  if (responseTxs.length > 0) {
    // If the request has already been answered, we don't need to do anything
    logger.info(`Request ${requestId} has already been answered. Skipping...`);
    return true;
  }

  if (
    !(await checkUserPaidInferenceFees(
      requestTx.node.id,
      reqUserAddr,
      modelOwner,
      CONFIG.scriptCurator,
    ))
  ) {
    logger.error(`Could not find payment for request ${requestId}. Skipping...`);
    return false;
  }

  const appVersion = requestTx.node.tags.find((tag) => tag.name === 'App-Version')?.value;
  const conversationIdentifier = requestTx.node.tags.find(
    (tag) => tag.name === 'Conversation-Identifier',
  )?.value;
  if (!appVersion || !conversationIdentifier) {
    // If the request doesn't have the necessary tags, skip
    logger.error(`Request ${requestId} does not have the necessary tags.`);
    return false;
  }

  const inferenceResult = await inference(requestTx);
  logger.info(`Inference Result: ${inferenceResult.imgPaths}`);

  await sendToBundlr(
    inferenceResult.imgPaths,
    inferenceResult.prompt,
    appVersion,
    requestTx.node.owner.address,
    requestTx.node.id,
    conversationIdentifier,
  );

  return true;
};

const lastProcessedTxs: string[] = [];

const start = async () => {
  try {
    // request only new txs
    const { requestTxs, hasNextPage } = await queryTransactionsReceived(address, operatorFee);

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
            operatorFee,
            newRequestTxs[newRequestTxs.length - 1].cursor,
          );

        newRequestTxs.push(...nextPageTxs);
        fetchMore = newHasNextPage;
      }
    }

    for (const edge of newRequestTxs) {
      logger.info(`Processing request ${edge.node.id} ...`);
      // Check if request already answered:
      const reqTxId = edge.node.tags.find((tag) => tag.name === INFERENCE_TRANSACTION_TAG)?.value;
      const reqUserAddr = edge.node.tags.find((tag) => tag.name === SEQUENCE_OWNER_TAG)?.value;

      let successRequest = false;

      if (reqTxId && reqUserAddr) {
        successRequest = await processRequest(reqTxId, reqUserAddr);
      } else {
        logger.error('No inference Tx or userAddr. Skipping...');
        // skip requests without inference transaction tag
      }

      if (successRequest) {
        // save latest tx id only for successful processed requests
        lastProcessedTxs.push(edge.node.id);
      } else {
        // if request was not processed successfully, do not add it to lastProcessedTxs
      }
    }
  } catch (e) {
    logger.error(`Errored with: ${e}`);
  }
  logger.info(`Sleeping for ${CONFIG.sleepTimeSeconds} second(s) ...`);
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  address = await arweave.wallets.jwkToAddress(JWK);

  logger.info(`Wallet address: ${address}`);

  try {
    modelOwner = await getModelOwner();
    logger.info(`Found Model owner: ${modelOwner}`);
  } catch (err) {
    logger.error('Error getting model owner');
    logger.info('Shutting down...');

    process.exit(1);
  }

  try {
    operatorFee = await getOperatorFee();
    logger.info(`Found Operator fee: ${operatorFee / U_DIVIDER} $u`);
  } catch (err) {
    logger.error('Error fetching operator fee');
    logger.info('Shutting down...');

    process.exit(1);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await start();
    await sleep(CONFIG.sleepTimeSeconds * secondInMS);
  }
})();
