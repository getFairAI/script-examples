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

const fs = require('fs');
const NodeBundlr = require('@bundlr-network/client');
const { WarpFactory } = require('warp-contracts');
const { ApolloClient, gql, InMemoryCache } = require('@apollo/client/core');
const { DeployPlugin } = require('warp-contracts-plugin-deploy');
const workerpool = require('workerpool');

const APP_VERSION_TAG = 'App-Version';
const CONVERSATION_IDENTIFIER_TAG = 'Conversation-Identifier';
const APP_NAME_TAG = 'App-Name';
const CONTENT_TYPE_TAG = 'Content-Type';
const UNIX_TIME_TAG = 'Unix-Time';
const SCRIPT_CURATOR_TAG = 'Script-Curator';
const SCRIPT_NAME_TAG = 'Script-Name';
const SCRIPT_USER_TAG = 'Script-User';
const REQUEST_TRANSACTION_TAG = 'Request-Transaction';
const OPERATION_NAME_TAG = 'Operation-Name';
const INFERENCE_TRANSACTION_TAG = 'Inference-Transaction';
const CONTRACT_TAG = 'Contract';
const INPUT_TAG = 'Input';
const SEQUENCE_OWNER_TAG = 'Sequencer-Owner';
const SCRIPT_TRANSACTION_TAG = 'Script-Transaction';
const NET_ARWEAVE_URL = 'https://arweave.net';
const secondInMS = 1000;
const VAULT_ADDRESS = 'tXd-BOaxmxtgswzwMLnryROAYlX5uDC9-XK2P4VNCQQ';
const MARKETPLACE_PERCENTAGE_FEE = 0.15;
const CURATOR_PERCENTAGE_FEE = 0.025;
const CREATOR_PERCENTAGE_FEE = 0.025;
const U_CONTRACT_ID = 'KTzTXT_ANmF84fWEKHzWURD1LWd9QaFR9yfYUwH2Lxw';
const ATOMIC_TOKEN_CONTRACT_ID = '37n5Z9NZUUPuXPdbbjXa2iYb9Wl39nAjkaSoz5DsxZQ';
const NODE2_BUNDLR_URL = 'https://node2.bundlr.network';

const JWK = JSON.parse(fs.readFileSync('wallet.json').toString());
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

const parseQueryResult = (result) =>
  result.data.transactions.edges;

const queryTransactionAnswered = async (transactionId, address, scriptName, scriptcurator) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Script Inference Response'],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [ scriptName ],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [ scriptcurator ],
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
  inferenceTransaction,
  userAddress,
  inputValues,
  scriptId,
) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Inference Payment'],
    },
    {
      name: SCRIPT_TRANSACTION_TAG,
      values: [ scriptId ],
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

const sendToBundlr = async (
  responses,
  prompt,
  appVersion,
  userAddress,
  requestTransaction,
  conversationIdentifier,
  scriptId,
) => {
  const type = Array.isArray(responses) ? 'image/png' : 'audio/wav';

  // Get loaded balance in atomic units
  const atomicBalance = await bundlr.getLoadedBalance();

  workerpool.workerEmit({ type: 'info', message: `node balance (atomic units) = ${atomicBalance}` });

  // Convert balance to an easier to read format
  const convertedBalance = bundlr.utils.fromAtomic(atomicBalance);
  workerpool.workerEmit({ type: 'info', message: `node balance (converted) = ${convertedBalance}` });

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
      workerpool.workerEmit({ type: 'info', message: `Data uploaded ==> https://arweave.net/${transaction.id}` });
      try {
        const { contractTxId } = await warp.register(transaction.id, 'node1'); // must use same node as uploaded data
        workerpool.workerEmit({ type: 'info', message: `Token Registered ==> https://arweave.net/${contractTxId}` });
      } catch (e) {
        workerpool.workerEmit({ type: 'error', message: `Could not register token: ${e}` });
      }
    }
  } catch (e) {
    // throw error to be handled by caller
    throw new Error(`Could not upload to bundlr: ${e}`);
  }
};

const inference = async function (requestTx, url, format) {
  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.node.id}`);
  const text = await (await requestData.blob()).text();
  workerpool.workerEmit({ type: 'info', message: `User Prompt: ${text}` });

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
  const tempData = await res.json();

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
  txid,
  userAddress,
  creatorAddress,
  curatorAddress,
  operatorFee,
  scriptId,
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

  const paymentTxs = await queryCheckUserPayment(txid, userAddress, [
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

const getRequest = async (transactionId) => {
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

const processRequest = async (requestId, reqUserAddr, registration, address) => {  
  const requestTx = await getRequest(requestId);
  if (!requestTx) {
    // If the request doesn't exist, skip
    workerpool.workerEmit({ type: 'error', message: `Request ${requestId} does not exist. Skipping...` });
    return false;
  }

  const responseTxs = await queryTransactionAnswered(requestId, address, registration.scripName, registration.scriptCurator);
  if (responseTxs.length > 0) {
    // If the request has already been answered, we don't need to do anything
    workerpool.workerEmit({ type: 'info', message: `Request ${requestId} has already been answered. Skipping...` });
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
    workerpool.workerEmit({ type: 'error', message: `Could not find payment for request ${requestId}. Skipping...` });
    return false;
  }

  const appVersion = requestTx.node.tags.find((tag) => tag.name === 'App-Version')?.value;
  const conversationIdentifier = requestTx.node.tags.find(
    (tag) => tag.name === 'Conversation-Identifier',
  )?.value;
  if (!appVersion || !conversationIdentifier) {
    // If the request doesn't have the necessary tags, skip
    workerpool.workerEmit({ type: 'error', message: `Request ${requestId} does not have the necessary tags.` });
    return false;
  }

  const inferenceResult = await inference(requestTx, registration.url, registration.payloadFormat);
  workerpool.workerEmit({ type: 'info', message: `Inference Result: ${JSON.stringify(inferenceResult)}` });

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

const processRequestLock = async (requestId, reqUserAddr, registration, address, lock) => {
  workerpool.workerEmit({ type: 'info', message: `Thread working on request ${requestId}...` });
  await lock.runExclusive(async () => {
    workerpool.workerEmit({ type: 'info', message: `Thread ${requestId} acquired lock` });
    await processRequest(requestId, reqUserAddr, registration, address);
    workerpool.workerEmit({ type: 'info', message: `Thread ${requestId} released lock` });
  });
};

workerpool.worker({
  processRequestLock,
});