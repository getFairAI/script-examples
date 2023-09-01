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
import crypto from 'node:crypto';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  IEdge,
  OperatorParams,
  ServerResponse,
  payloadFormatOptions,
  ITransactions,
  IOptionalSettings,
  InferenceResult,
} from './interfaces';
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
  CONTRACT_TAG,
  INFERENCE_TRANSACTION_TAG,
  SCRIPT_CURATOR_TAG,
  SCRIPT_NAME_TAG,
  SEQUENCE_OWNER_TAG,
  U_CONTRACT_ID,
  NODE2_BUNDLR_URL,
  UDL_ID,
  MAX_STR_SIZE,
  ASSET_NAMES_TAG,
  NEGATIVE_PROMPT_TAG
} from './constants';
import NodeBundlr from '@bundlr-network/client/build/esm/node/index';
import { gql, ApolloClient, InMemoryCache } from '@apollo/client/core';
import workerpool from 'workerpool';

const JWK: JWKInterface = JSON.parse(fs.readFileSync('wallet.json').toString());
// initailze the bundlr SDK
// const bundlr: Bundlr = new (Bundlr as any).default(
const bundlr = new NodeBundlr(NODE2_BUNDLR_URL, 'arweave', JWK);
const warp = WarpFactory.forMainnet().use(new DeployPlugin());

const clientGateway = new ApolloClient({
  uri: 'https://arweave.net:443/graphql',
  cache: new InMemoryCache(),
  defaultOptions: {
    query: {
      fetchPolicy: 'no-cache',
    },
    watchQuery: {
      fetchPolicy: 'no-cache',
    },
  },
});

const gqlQuery = gql`
  query FIND_BY_TAGS($tags: [TagFilter!], $first: Int!, $after: String) {
    transactions(tags: $tags, first: $first, after: $after, sort: HEIGHT_DESC) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }
`;

const parseQueryResult = (result: { data: { transactions: ITransactions } }) =>
  result.data.transactions.edges;

const queryTransactionAnswered = async (
  transactionId: string,
  address: string,
  scriptName: string,
  scriptcurator: string,
) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Script Inference Response'],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [scriptName],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [scriptcurator],
    },
    {
      name: REQUEST_TRANSACTION_TAG,
      values: [transactionId],
    },
  ];
  const result = await clientGateway.query({
    query: gql`
      query TransactionAnswered($tags: [TagFilter!], $owner: String!) {
        transactions(first: 1, tags: $tags, owners: [$owner], sort: HEIGHT_DESC) {
          edges {
            node {
              id
              owner {
                address
                key
              }
              quantity {
                winston
                ar
              }
              tags {
                name
                value
              }
            }
          }
        }
      }
    `,
    variables: { tags, owner: address },
  });

  return parseQueryResult(result);
};

const queryCheckUserPayment = async (
  inferenceTransaction: string,
  userAddress: string,
  inputValues: string[],
  scriptId: string,
) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Inference Payment'],
    },
    {
      name: SCRIPT_TRANSACTION_TAG,
      values: [scriptId],
    },
    {
      name: INFERENCE_TRANSACTION_TAG,
      values: [inferenceTransaction],
    },
    {
      name: CONTRACT_TAG,
      values: [U_CONTRACT_ID],
    },
    {
      name: SEQUENCE_OWNER_TAG,
      values: [userAddress],
    },
    {
      name: INPUT_TAG,
      values: inputValues,
    },
  ];
  const result = await clientGateway.query({
    query: gqlQuery,
    variables: { tags, first: 3 },
  });

  return parseQueryResult(result);
};

const getAssetName = (idx: number, assetNames?: string) => {
  if (!assetNames) {
    return undefined;
  }

  try {
    const names: string[] = JSON.parse(assetNames);
    const validNames = names.filter((assetName) => assetName.length > 0).map((assetName) => assetName.trim());

    if (idx < validNames.length) {
      return validNames[idx];
    } else {
      const divider = (idx % validNames.length);

      return validNames[divider];
    }
  } catch (error) {
    return undefined;
  }
};

const sendToBundlr = async (
  inferenceResult: InferenceResult,
  appVersion: string,
  userAddress: string,
  requestTransaction: string,
  conversationIdentifier: string,
  registration: OperatorParams,
  assetNames?: string,
) => {
  let responses = inferenceResult.imgPaths as string[] ?? inferenceResult.audioPath as string;
  const prompt = inferenceResult.prompt;

  const type = Array.isArray(responses) ? 'image/png' : 'audio/wav';

  // Get loaded balance in atomic units
  const atomicBalance = await bundlr.getLoadedBalance();

  workerpool.workerEmit({
    type: 'info',
    message: `node balance (atomic units) = ${atomicBalance}`,
  });

  // Convert balance to an easier to read format
  const convertedBalance = bundlr.utils.fromAtomic(atomicBalance);
  workerpool.workerEmit({
    type: 'info',
    message: `node balance (converted) = ${convertedBalance}`,
  });

  const commonTags = [
    { name: 'Custom-App-Name', value: 'Fair Protocol' },
    { name: 'Custom-App-Version', value: appVersion },
    { name: SCRIPT_TRANSACTION_TAG, value: registration.scriptId },
    { name: SCRIPT_CURATOR_TAG, value: registration.scriptCurator },
    { name: SCRIPT_NAME_TAG, value: registration.scriptName },
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
        firstOwner: userAddress,
        canEvolve: false,
        balances: {
          [userAddress]: 1,
        },
        name: 'Fair Protocol Atomic Asset',
        ticker: 'FPAA',
      }),
    },
    { name: 'Title', value: 'Fair Protocol Atomic Asset' },
    { name: 'Description', value:  prompt.length > MAX_STR_SIZE ? prompt.slice(0,MAX_STR_SIZE) : prompt }, // use request prompt
    { name: 'Type', value: 'Image' },
    // add license tags
    { name: 'License', value: UDL_ID },
    { name: 'Commercial-Use', value: 'Allowed' },
  ];
  // turn into array to use same code for single and multiple responses
  responses = Array.isArray(responses) ? responses : [responses];

  try {
    let i = 0;
    for (const response of responses) {
      const tags = [ ...commonTags ];
      const currentImageSeed = inferenceResult.seeds ? inferenceResult.seeds[i] : null;
      if (currentImageSeed) {
        tags.push({ name: 'Inference-Seed', value: currentImageSeed });
      }

      const assetName = getAssetName(i, assetNames);
      if (assetName) {
        // find title tag index
        const titleIdx = tags.findIndex((tag) => tag.name === 'Title');

        // replace title tag with asset name
        tags.splice(titleIdx, 1, { name: 'Title', value: assetName });
      } else {
        const hash = crypto.createHash('sha256').update(requestTransaction).update(i.toString()).digest('base64');
        const title = `Fair Protocol Atomic Asset [${hash.slice(0, 10)}]`;
        // find title tag index
        const titleIdx = tags.findIndex((tag) => tag.name === 'Title');

        // replace title tag with asset name
        tags.splice(titleIdx, 1, { name: 'Title', value: title });
      }

      const transaction = await bundlr.uploadFile(response, { tags });
      workerpool.workerEmit({
        type: 'info',
        message: `Data uploaded ==> https://arweave.net/${transaction.id}`,
      });
      try {
        const { contractTxId } = await warp.register(transaction.id, 'node2'); // must use same node as uploaded data
        workerpool.workerEmit({
          type: 'info',
          message: `Token Registered ==> https://arweave.net/${contractTxId}`,
        });
      } catch (e) {
        workerpool.workerEmit({ type: 'error', message: `Could not register token: ${e}` });
      }
      i++;
    }
  } catch (e) {
    // throw error to be handled by caller
    throw new Error(`Could not upload to bundlr: ${e}`);
  }
};

const fetchSeed = async (url: string, imageStr: string) => {
  try {
    const infoUrl = url.replace('/txt2img', '/png-info');
    
    const secRes = await fetch(infoUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: `data:image/png;base64,${imageStr}` }),
    });

    const result: { info: string, items: { parameters: string }} = await secRes.json();
    const seedStrStartIdx = result.info.indexOf('Seed:');
    const seedStrEndIdx = result.info.indexOf(',', seedStrStartIdx); // search for next comma after 'Seed:' substring

    const seedStr = result.info.substring(seedStrStartIdx, seedStrEndIdx);
    const seed = seedStr.split('Seed:')[1].trim();

    return seed;
  } catch (e) {
    return '';
  }
};

const inference = async function (requestTx: IEdge, scriptId: string, url: string, format: payloadFormatOptions, settings?: IOptionalSettings, negativePrompt?: string) {
  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.node.id}`);
  const text = await (await requestData.blob()).text();
  workerpool.workerEmit({ type: 'info', message: `User Prompt: ${text}` });

  let payload;
  if (format === 'webui') {
    const webuiPayload: IOptionalSettings = {
      ...(settings && { ...settings }),
      prompt: settings?.prompt ? `${settings?.prompt}${text}` : text,
    };

    if (negativePrompt && webuiPayload['negative_prompt']) {
      webuiPayload['negative_prompt'] = `${webuiPayload['negative_prompt']} ${negativePrompt}`;
    } else if (negativePrompt) {
      webuiPayload['negative_prompt'] = negativePrompt;
    } else {
      // ignore
    }
    payload = JSON.stringify(webuiPayload);
  } else {
    payload = text;
  }

  const res = await fetch(url, {
    method: 'POST',
    ...(format === 'webui' && { headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    }}),
    body: payload,
  });
  const tempData: ServerResponse = await res.json();

  if (tempData.images) {
    let i = 0;
    const imgPaths: string[] = [], imgSeeds: string[] = [];

    for (const el of tempData.images) {
      fs.writeFileSync(`output_${scriptId}_${i}.png`, Buffer.from(el, 'base64'));
      imgPaths.push(`./output_${scriptId}_${i}.png`);
  
      const seed = await fetchSeed(url, el);
      imgSeeds.push(seed);
      i++;
    }

    return { imgPaths, prompt: text, seeds: imgSeeds };
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

  const paymentTxs: IEdge[] = await queryCheckUserPayment(
    txid,
    userAddress,
    [marketpaceInput, curatorInput, creatorInput],
    scriptId,
  );
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

const getRequest = async (transactionId: string) => {
  const result = await clientGateway.query({
    query: gql`
      query tx($id: ID!) {
        transactions(first: 1, ids: [$id], sort: HEIGHT_DESC) {
          edges {
            node {
              id
              owner {
                address
                key
              }
              quantity {
                winston
                ar
              }
              tags {
                name
                value
              }
            }
          }
        }
      }
    `,
    variables: { id: transactionId },
  });

  return parseQueryResult(result)[0];
};

const processRequest = async (
  requestId: string,
  reqUserAddr: string,
  registration: OperatorParams,
  address: string,
) => {
  const requestTx: IEdge = await getRequest(requestId);
  if (!requestTx) {
    // If the request doesn't exist, skip
    workerpool.workerEmit({
      type: 'error',
      message: `Request ${requestId} does not exist. Skipping...`,
    });
    return false;
  }

  const responseTxs: IEdge[] = await queryTransactionAnswered(
    requestId,
    address,
    registration.scriptName,
    registration.scriptCurator,
  );
  if (responseTxs.length > 0) {
    // If the request has already been answered, we don't need to do anything
    workerpool.workerEmit({
      type: 'info',
      message: `Request ${requestId} has already been answered. Skipping...`,
    });
    return requestId;
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
    workerpool.workerEmit({
      type: 'error',
      message: `Could not find payment for request ${requestId}. Skipping...`,
    });
    return false;
  }

  const appVersion = requestTx.node.tags.find((tag) => tag.name === 'App-Version')?.value;
  const conversationIdentifier = requestTx.node.tags.find(
    (tag) => tag.name === 'Conversation-Identifier',
  )?.value;
  if (!appVersion || !conversationIdentifier) {
    // If the request doesn't have the necessary tags, skip
    workerpool.workerEmit({
      type: 'error',
      message: `Request ${requestId} does not have the necessary tags.`,
    });
    return false;
  }

  const assetNames = requestTx.node.tags.find((tag) => tag.name === ASSET_NAMES_TAG)?.value;
  const negativePrompt = requestTx.node.tags.find((tag) => tag.name === NEGATIVE_PROMPT_TAG)?.value;
  const inferenceResult = await inference(requestTx, registration.scriptId, registration.url, registration.payloadFormat, registration.settings, negativePrompt);
  workerpool.workerEmit({
    type: 'info',
    message: `Inference Result: ${JSON.stringify(inferenceResult)}`,
  });

  await sendToBundlr(
    inferenceResult,
    appVersion,
    requestTx.node.owner.address,
    requestTx.node.id,
    conversationIdentifier,
    registration,
    assetNames,
  );

  return requestId;
};

const processRequestLock = async (
  requestId: string,
  reqUserAddr: string,
  registration: OperatorParams,
  address: string,
) => {
  try {
    workerpool.workerEmit({ type: 'info', message: `Thread working on request ${requestId}...` });
    
    const result = await processRequest(requestId, reqUserAddr, registration, address);
    
    workerpool.workerEmit({ type: 'result', message: result });
  } catch (e) {
    workerpool.workerEmit({ type: 'error', message: `Thread ${requestId} released with error: ${e}` });
    workerpool.workerEmit({ type: 'result', message: false });
  }
};

workerpool.worker({
  processRequestLock,
});
