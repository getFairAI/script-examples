import fs from 'fs';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import NodeBundlr from '@bundlr-network/client/build/cjs/node/index';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { default as Pino } from 'pino';
import { IEdge, OperatorParams, ServerResponse, payloadFormatOptions } from './interfaces';
import {
  APP_NAME_TAG,
  APP_VERSION_TAG,
  ATOMIC_TOKEN_CONTRACT_ID,
  CONTENT_TYPE_TAG,
  CONVERSATION_IDENTIFIER_TAG,
  CREATOR_PERCENTAGE_FEE,
  CURATOR_PERCENTAGE_FEE,
  INPUT_TAG,
  MARKETPLACE_PERCENTAGE_FEE,
  NET_ARWEAVE_URL,
  OPERATION_NAME_TAG,
  REQUEST_TRANSACTION_TAG,
  SCRIPT_TRANSACTION_TAG,
  SCRIPT_USER_TAG,
  UNIX_TIME_TAG,
  VAULT_ADDRESS,
  secondInMS,
} from './constants';
import {
  getRequest,
  queryTransactionAnswered,
  queryCheckUserPayment,
} from './queries';

const logger = Pino({
  name: 'Operator Loop',
  level: 'info',
});

const JWK: JWKInterface = JSON.parse(fs.readFileSync('wallet.json').toString());
// initailze the bundlr SDK
// const bundlr: Bundlr = new (Bundlr as any).default(
const bundlr = new NodeBundlr('https://node1.bundlr.network', 'arweave', JWK);
const warp = WarpFactory.forMainnet().use(new DeployPlugin());

const sendToBundlr = async (
  responses: string[] | string,
  prompt: string,
  appVersion: string,
  userAddress: string,
  requestTransaction: string,
  conversationIdentifier: string,
  scriptId: string,
) => {
  const type = Array.isArray(responses) ? 'image/png' : 'audio/wav';

  // Get loaded balance in atomic units
  const atomicBalance = await bundlr.getLoadedBalance();
  logger.info(`node balance (atomic units) = ${atomicBalance}`);

  // Convert balance to an easier to read format
  const convertedBalance = bundlr.utils.fromAtomic(atomicBalance);
  logger.info(`node balance (converted) = ${convertedBalance}`);

  const tags = [
    { name: 'Custom-App-Name', value: 'Fair Protocol' },
    { name: 'Custom-App-Version', value: appVersion },
    { name: SCRIPT_TRANSACTION_TAG, value: scriptId },
    { name: SCRIPT_USER_TAG, value: userAddress },
    { name: REQUEST_TRANSACTION_TAG, value: requestTransaction },
    { name: OPERATION_NAME_TAG, value: 'Script Inference Response' },
    { name: CONVERSATION_IDENTIFIER_TAG, value: conversationIdentifier },
    { name: CONTENT_TYPE_TAG, value: type },
    { name: UNIX_TIME_TAG, value: (Date.now() / secondInMS).toString() },
    // add atomic token tags
    { name: APP_NAME_TAG, value: 'SmartWeaveContract' },
    { name: APP_VERSION_TAG, value: '0.3.0' },
    { name: 'Contract-Src', value: ATOMIC_TOKEN_CONTRACT_ID }, // use contract source here
    {
      name: 'Init-State',
      value: JSON.stringify({
        owner: userAddress,
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
  // turn into array to use same code for single and multiple responses
  responses = Array.isArray(responses) ? responses : [responses];

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

const inference = async function (requestTx: IEdge, url: string, format: payloadFormatOptions) {
  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.node.id}`);
  const text = await (await requestData.blob()).text();
  logger.info(`User Prompt: ${text}`);
  
  let payload;
  if (format === 'webui') {
    payload = JSON.stringify({
      'enable_hr': 'true',
      'denoising_strength': 0.5,
      'hr_scale': 2,
      'hr_upscaler': 'Latent',
      'hr_second_pass_steps': 20,
      prompt: `masterpiece, best quality, ${text}`,
      seed: -1,
      'n_iter': 4,
      steps: 20,
      'cfg_scale': 7,
      'negative_prompt': 'EasyNegative, drawn by bad-artist, sketch by bad-artist-anime, (bad_prompt:0.8), (artist name, signature, watermark:1.4), (ugly:1.2), (worst quality, poor details:1.4), bad-hands-5, badhandv4, blurry,',
      'sampler_index': 'Euler a',
    });
  } else {
    payload = text;
  }

  const res = await fetch(`${url}/`, {
    method: 'POST',
    body: payload,
  });
  const tempData: ServerResponse = await res.json();

  if (tempData.images) {
    const imgPaths = tempData.images.map((el, i)=>{
      fs.writeFileSync(`output_${requestTx.node.id}_${i}.png`, Buffer.from(el, 'base64'));
      return `./output_${requestTx.node.id}_${i}.png`;
    });
    return { imgPaths, prompt: text };
  } else if (tempData.imgPaths) {
    return {
      imgPaths: tempData.imgPaths,
      prompt: text,
    };
  } else if (tempData.audioPath) {
    return {
      audioPath: tempData.audioPath,
      prompt: text,
    };
  } else {
    throw new Error('Invalid response from server');
  }
};

const checkUserPaidInferenceFees = async (
  txid: string,
  userAddress: string,
  creatorAddress: string,
  curatorAddress: string,
  operatorFee: number,
  scriptId: string,
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
  ], scriptId);
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

const processRequest = async (requestId: string, reqUserAddr: string, registration: OperatorParams, address: string) => {
  const requestTx: IEdge = await getRequest(requestId);
  if (!requestTx) {
    // If the request doesn't exist, skip
    logger.error(`Request ${requestId} does not exist. Skipping...`);
    return false;
  }

  const responseTxs: IEdge[] = await queryTransactionAnswered(requestId, address, registration.scriptId);
  if (responseTxs.length > 0) {
    // If the request has already been answered, we don't need to do anything
    logger.info(`Request ${requestId} has already been answered. Skipping...`);
    return true;
  }

  if (
    !(await checkUserPaidInferenceFees(
      requestTx.node.id,
      reqUserAddr,
      registration.modelOwner,
      registration.scriptCurator,
      registration.operatorFee,
      registration.scriptId,
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

  const inferenceResult = await inference(requestTx, registration.url, registration.payloadFormat);
  logger.info(`Inference Result: ${inferenceResult}`);

  await sendToBundlr(
    inferenceResult.imgPaths || inferenceResult.audioPath,
    inferenceResult.prompt,
    appVersion,
    requestTx.node.owner.address,
    requestTx.node.id,
    conversationIdentifier,
    registration.scriptId
  );

  return requestId;
};

export default processRequest;