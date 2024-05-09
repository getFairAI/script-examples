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
import { IEdge, IrysTx, OperatorParams, UrlConfig } from './interfaces';
import {
  CURATOR_PERCENTAGE_FEE,
  MARKETPLACE_PERCENTAGE_FEE,
  N_IMAGES_TAG,
  VAULT_EVM_ADDRESS,
  secondInMS,
} from './constants';
import {
  queryOperatorRegistrations,
  isRegistrationCancelled,
  getModelOwnerAndName,
  isEvmWalletLinked,
  queryTransactionAnswered,
} from './queries';
import { JWKInterface } from 'arweave/node/lib/wallet';
import workerpool from 'workerpool';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mutex } from 'async-mutex';
import NodeBundlr from '@bundlr-network/client/build/esm/node/index';
import { arbitrum } from 'viem/chains';
import { Log, PrivateKeyAccount, PublicClient, WalletClient, createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, formatEther, formatUnits, getContract, hexToBigInt, hexToString, http, parseUnits, stringToHex, serializeSignature, recoverPublicKey } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Query } from '@irys/query';
import { getEncryptionPublicKey } from '@metamask/eth-sig-util';

const NATIVE_USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const CHAIN = arbitrum;

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);

let arweaveAddress: string;
let evmAccount: PrivateKeyAccount;
let walletClient: WalletClient;
let publicClient: PublicClient;
const registrations: OperatorParams[] = [];
const mutexes: Mutex[] = [];
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

let pool: workerpool.WorkerPool;

const JWK: JWKInterface = JSON.parse(fs.readFileSync('wallet.json').toString());
const EVM_PK: string = fs.readFileSync('./operator-metamask-pk', { encoding: 'utf-8' });
// initialize ar-io bundler
const bundlr = new NodeBundlr('https://up.arweave.net', 'arweave', JWK);

/* const lastProofTimestamp */

const findRegistrations = async () => {
  const registrationTxs = await queryOperatorRegistrations(arweaveAddress);

  // filtered cancelled registrations
  const filtered = [];
  for (const tx of registrationTxs) {
    const txid = tx.node.id;
    const isTxCancelled = await isRegistrationCancelled(txid, arweaveAddress);
    // filter by scripts that have config  url
    const urls = Object.keys(CONFIG.urls);
    const scriptTx = tx.node.tags.find((tag) => tag.name === 'Script-Transaction')?.value;
    const scriptName = tx.node.tags.find((tag) => tag.name === 'Script-Name')?.value;
    const hasUrlForScript = scriptTx && urls.includes(scriptTx);

    const hasNewerRegistration = filtered.filter(existing => {
      const existingScriptTx = existing.node.tags.find((tag) => tag.name === 'Script-Transaction')?.value;
      const existingScriptName = existing.node.tags.find((tag) => tag.name === 'Script-Name')?.value;

      return scriptTx === existingScriptTx && scriptName === existingScriptName;
    }).length > 0;

    if (!isTxCancelled && hasUrlForScript && !hasNewerRegistration) {
      filtered.push(tx);
    } else if (!hasUrlForScript && !isTxCancelled) {
      logger.info(
        `Script ${scriptName}(id: '${scriptTx}') not found in config, Registration for this script will be ignored. Skipping...`,
      );
    } else {
      logger.info(`Registration with id '${txid}' is cancelled. Skipping...`);
    }
  }

  return filtered;
};

const validateRegistration = async (tx: IEdge) => {
  const urls = CONFIG.urls;
  let hasErrors = false;
  const txid = tx.node.id;
  const tags = tx.node.tags;

  const scriptName = tags.find((tag) => tag.name === 'Script-Name')?.value;
  const scriptCurator = tags.find((tag) => tag.name === 'Script-Curator')?.value;
  const scriptId = tags.find((tag) => tag.name === 'Script-Transaction')?.value;
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

  const { creatorAddr: modelOwner, modelName } = await getModelOwnerAndName(
    scriptName as string,
    scriptCurator as string,
  );
  if (!modelOwner) {
    logger.error(`Could not find Model Owner for registration '${txid}'. Ignoring...`);
    hasErrors = true;
  }

  if (!modelName) {
    logger.error(`Could not find Model Name for registration '${txid}'. Ignoring...`);
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
      modelName,
      scriptId: scriptId as string,
      operatorFee: opFee,
      scriptName: scriptName as string,
      scriptCurator: scriptCurator as string,
      registrationTx: tx,
    });
  } else {
    // ignore registrations with errors
  }
};

const sendProofOfLife = async () => {
  // dispatch tx
  const tx = await bundlr.upload(`Operator ${arweaveAddress} Running`, {
    tags: [
      { name: 'Protocol-Name', value: 'FairAI' },
      { name: 'Protocol-Version', value: '2.0' },
      { name: 'Operation-Name', value: 'Operator Active Proof' },
      /* { name: 'Operator-Irys-Balance', value: convertedBalance.toString() }, */
      { name: 'Unix-Time', value: (Date.now() / secondInMS).toString() },
    ],
  });
  logger.info(`Proof of Life Transaction: ${tx.id}`);
};

const startThread = (
  txData: IrysTx,
  nMissingResponses: number,
  currentRegistration: OperatorParams,
  lock: Mutex,
  txid: string,
  userPubKey: string
) => {
  return lock.runExclusive(async () => {
    logger.info(`Thread ${txData.id} acquired lock`);
    if (lastProcessedTxs.includes(txid)) {
      // if txid is already processed skip launching thread
      logger.info(`Thread ${txData.id} released lock`);
      return;
    }
    await pool.exec('processRequestLock', [txData, nMissingResponses, currentRegistration, EVM_PK, userPubKey], {
      on: (payload) => handleWorkerEvents(payload, txid),
    });

    logger.info(`Thread ${txData.id} released lock`);
  });
};

const handleWorkerEvents = (
  payload: { type: 'info' | 'error' | 'result'; message: string | boolean },
  txid: string,
) => {
  if (payload.type === 'error') {
    logger.error(payload.message);
  } else if (payload.type === 'info') {
    logger.info(payload.message);
  } else {
    const result = payload.message;
    if (typeof result === 'string') {
      // save latest tx id only for successful processed requests
      lastProcessedTxs.push(txid);
    }
  }
};

const sendUSDC = async (target: `0x${string}`, amount: number, arweaveTx: string) => {
  if (!walletClient || !publicClient) {
    throw new Error('Client Not Set. Please Call setProvider()');
  }

  // Convert the amount to send to decimals (6 decimals for USDC)
  const contract = getContract({
    address: NATIVE_USDC_ARB,
    abi: erc20Abi,
    client: {
      wallet: walletClient,
      public: publicClient
    }
  });
  const decimals = (await contract.read.decimals()) as number;
  const amountParsed = parseUnits(amount.toString(), decimals);

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [ target, amountParsed ]
  });

  const memo = stringToHex(arweaveTx).slice(2); // 0x prefix is removed

  const request = await walletClient.prepareTransactionRequest({
    account: walletClient.account!,
    to: NATIVE_USDC_ARB,
    chain: CHAIN,
    data: `${data}${memo}`, // encoded data for the transaction (transfer call plus arweave memo)
  });

  const serializedTransaction = await walletClient.signTransaction(request);
  const hash = await walletClient.sendRawTransaction({ serializedTransaction });
  console.log(hash);
};

const proccessPastReceivedTransfer = async (transferLog: Log) => {
  const paymentBlockNumber = transferLog.blockNumber;
  const transaction = await publicClient.getTransaction({ 
    hash: transferLog.transactionHash!
  });

  const signature = serializeSignature({
    v: transaction.v,
    r: transaction.r,
    s: transaction.s,
  });
  const userPubKey = await recoverPublicKey({
    hash: transaction.hash,
    signature
  });
  const data = transaction.input;
  const memoSliceStart = 138;// 0x + function selector 4bytes-8chars + 2 32bytes arguments = 138 chars;
  const hexMemo = data.substring(memoSliceStart, data.length);

  const arweaveTx = hexToString(`0x${hexMemo}`);

  if (!arweaveTx) {
    // not a fairAI request
    return;
  }

  const reqUserAddr = transaction.from;
  const irysQuery = new Query();

  const [ txData ] = await irysQuery.search('irys:transactions').ids([arweaveTx]).limit(1);

  if (!txData) {
    // invalid arweave request
    return;
  }

  const protocolName = txData.tags.find(tag => tag.name === 'Protocol-Name')?.value;
  const protocolVersion = txData.tags.find(tag => tag.name === 'Protocol-Version')?.value;
  const operationName = txData.tags.find(tag => tag.name === 'Operation-Name')?.value;

  if (protocolName !== 'FairAI' && protocolVersion !== '2.0' && operationName !== 'Inference Request') {
    // not a fairAI inference request
    return;
  }
  const scriptTx = txData.tags.find(tag => tag.name === 'Script-Transaction')?.value!;
  const nImages = parseInt(txData.tags.find((tag) => tag.name === N_IMAGES_TAG)?.value ?? '0', 10);
  
  const registrationIdx = registrations.findIndex(
    (reg) =>
      reg.scriptId === scriptTx,
  );
  const receivedFee = Number(formatUnits(hexToBigInt(transferLog.data), 6)); // value of transfer in usdc

  let finalOperatorFee = registrations[registrationIdx].operatorFee;
  let necessaryAnswers = 1;
  if (nImages > 0 && registrations[registrationIdx].payloadFormat === 'webui') {
    finalOperatorFee = finalOperatorFee * nImages;
    necessaryAnswers = nImages;
  } else {
    // only one response is required and operator fee remains the same
  }

  if (receivedFee >= finalOperatorFee) {
    const responseTxs = await queryTransactionAnswered(
      txData.id,
      arweaveAddress,
      registrations[registrationIdx].scriptName,
      registrations[registrationIdx].scriptCurator,
    );

    if (responseTxs.length > 0  && responseTxs.length >= necessaryAnswers) {
      // If the request has already been answered, we don't need to do anything
      return;
    } else {
      startThread(txData, necessaryAnswers - responseTxs.length, registrations[registrationIdx], mutexes[registrationIdx], transferLog.transactionHash!, userPubKey);
    }

    // execute fee distribution async
    setTimeout(async () => {
      // get curator wallet
      const { isLinked: curatorEvmWalletLinked, evmWallet: curatorEvmWallet } = await isEvmWalletLinked(registrations[registrationIdx].scriptCurator);
      
      const recipients: `0x${string}`[] = [
        VAULT_EVM_ADDRESS,
      ];
      
      if (curatorEvmWalletLinked && curatorEvmWallet) {
        recipients.push(curatorEvmWallet);
      }

      const marketplaceCut = MARKETPLACE_PERCENTAGE_FEE * finalOperatorFee;
      const curatorCut = CURATOR_PERCENTAGE_FEE * finalOperatorFee;
      // get usdc transfers from operator wallet
      const operatorTransfers = await publicClient.getContractEvents({
        address: NATIVE_USDC_ARB,
        abi: erc20Abi,
        eventName: 'Transfer',
        fromBlock: paymentBlockNumber ?? 'pending',
        toBlock: 'latest',
        args: {
          from: evmAccount.address,
          to: recipients
        },
        strict: true,
      });

      let hasPaidCurator = false;
      let hasPaidMarketplace = false;
      for (const sentPayment of operatorTransfers) {
        if (hasPaidMarketplace && (hasPaidCurator || !curatorEvmWalletLinked)) {
          // if payments already found no need to query further          
          break;
        }
        const value = hexToBigInt(sentPayment.data);
        const transfer = await publicClient.getTransaction({ 
          hash: sentPayment.transactionHash!
        });
        const memoSliceStart = 138;// 0x + function selector 4bytes-8chars + 2 32bytes arguments = 138 chars;
        const txMemo = hexToString(`0x${transfer.input.substring(memoSliceStart, transfer.input.length)}`);

        if (txMemo === arweaveTx && sentPayment.args.from === evmAccount.address && sentPayment.args.to === VAULT_EVM_ADDRESS && value >= parseUnits(marketplaceCut.toString(), 6)) {
          // found a payment with the right amount to marketplace and refering to the correct arweave tx
          hasPaidMarketplace = true;
        } else if (!!curatorEvmWallet && txMemo === arweaveTx && sentPayment.args.from === evmAccount.address && sentPayment.args.to === curatorEvmWallet && value >= parseUnits(curatorCut.toString(), 6)) {
          // found a payment with the right amount to curator and refering to the correct arweave tx
          hasPaidCurator = true;
        } else {
          // continue
        }
      }

      if (!hasPaidMarketplace) {
        await sendUSDC(VAULT_EVM_ADDRESS, marketplaceCut, arweaveTx);
      }

      if (curatorEvmWallet && !hasPaidCurator) {
        await sendUSDC(curatorEvmWallet, marketplaceCut, arweaveTx);
      }
    }, 0);
  } else {
    logger.info('Transfer value below operator fee. Skipping...');
  }
};

(async () => {
  arweaveAddress = await arweave.wallets.jwkToAddress(JWK);
  evmAccount = privateKeyToAccount(EVM_PK as `0x${string}`);

  logger.info(`EVM Wallet address: ${evmAccount.address}`);
  logger.info(`Wallet address: ${arweaveAddress}`);
  logger.info('Fetching Operator Registrations...');

  let tempRegistrations: IEdge[] = [];
  try {
    tempRegistrations = await findRegistrations();
  } catch (err) {
    logger.error('Error Fetching Operator Registrations');
    logger.info('Shutting down...');

    process.exit(1);
  }

  try {
    for (const tx of tempRegistrations) {
      await validateRegistration(tx);
    }
  } catch (err) {
    logger.error('Error Fetching Model Owners for registrations');
    logger.info('Shutting down...');

    process.exit(1);
  }

  if (registrations.length === 0) {
    logger.error('No registrations found. Shutting down...');
    process.exit(1);
  }

  const nThreads = registrations.length > workerpool.cpus ? workerpool.cpus : registrations.length;
  registrations.forEach(() => mutexes.push(new Mutex())); // start one mutex for each registration
  // start pool
  pool = workerpool.pool(dirName + '/worker.cjs', { maxWorkers: nThreads });
  logger.info(pool.stats());

  // create interval for proofs every 30 min
  const minuteInSeconds = 60;
  const halfHourInMinutes = 30;

  walletClient = createWalletClient({
    account: evmAccount,
    chain: CHAIN,
    // transport: webSocket('wss://arb-sepolia.g.alchemy.com/v2/FW_nrdwBZaPL0d2O7HPcPcZIXx_zyuoq'),
    // transport: http('https://arb-sepolia.g.alchemy.com/v2/FW_nrdwBZaPL0d2O7HPcPcZIXx_zyuoq')
    transport: http('https://arb1.arbitrum.io/rpc'),
  });
  publicClient = createPublicClient({
    chain: CHAIN,
    // transport: webSocket('wss://arb-sepolia.g.alchemy.com/v2/FW_nrdwBZaPL0d2O7HPcPcZIXx_zyuoq')
    // transport: http('https://arb-sepolia.g.alchemy.com/v2/FW_nrdwBZaPL0d2O7HPcPcZIXx_zyuoq')
    transport: http('https://arb1.arbitrum.io/rpc'),
  });
  const balance = await publicClient.getBalance({ address: evmAccount.address });
  
  if (Number(formatEther(balance)) < 0.001) {
    logger.error('Not Enough Eth balance');
    process.exit(1);
  }

  // check if evm wallet is linked
  const { isLinked: evmLinked } = await isEvmWalletLinked(arweaveAddress, evmAccount.address);
  const publicKey = getEncryptionPublicKey(EVM_PK);
  if (!evmLinked) {
    const linkTags = [
      { name: 'Protocol-Name', value: 'FairAI' },
      { name: 'Protocol-Version', value: '2.0' },
      { name: 'Operation-Name', value: 'EVM Wallet Link' },
      { name: 'EVM-Public-Key', value: publicKey },
      { name: 'Unix-Time', value: (Date.now() / secondInMS).toString() },
    ];
    const linkTx = await bundlr.upload(evmAccount.address, {
      tags: linkTags
    });
    console.log(linkTx);
  }

  await sendProofOfLife(); // run first time;
  // create interval every 30 min
  setInterval(async () => {
    await sendProofOfLife();
  }, secondInMS * minuteInSeconds * halfHourInMinutes);


  const handleLatestUsdcReceived = async (logs: Log[]) => {
    const latest = logs[logs.length - 1];
    
    await proccessPastReceivedTransfer(latest);
  };

  logger.info('Listening to usdc contract events');
  const blockNumber = await publicClient.getBlockNumber(); 
  const logs = await publicClient.getContractEvents({
    address: NATIVE_USDC_ARB,
    abi: erc20Abi,
    eventName: 'Transfer',
    fromBlock: blockNumber - 1000000n,
    toBlock: 'latest',
    args: {
      to: evmAccount.address
    },
  });

  // on first run check if there are previous requests
  for (const log of logs) {
    await proccessPastReceivedTransfer(log);
  }

  /* await handlePaymentReceived(logs); */
  publicClient.watchContractEvent({
    abi: erc20Abi,
    address: NATIVE_USDC_ARB,
    eventName: 'Transfer',
    args: {  
      to: evmAccount.address,
    },
    onLogs: handleLatestUsdcReceived,
  });
})();
