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
  ITransactions,
  IOptionalSettings,
  InferenceResult,
  ITag,
} from './interfaces';
import {
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
  ASSET_NAMES_TAG,
  NEGATIVE_PROMPT_TAG,
  MODEL_NAME_TAG,
  PROMPT_TAG,
  DESCRIPTION_TAG,
  INDEXED_BY_TAG,
  TOPIC_AI_TAG,
  MAX_STR_SIZE,
  USER_CUSOM_TAGS_TAG,
  NOT_OVERRIDABLE_TAGS,
  N_IMAGES_TAG,
  PROTOCOL_NAME_TAG,
  PROTOCOL_VERSION,
  PROTOCOL_NAME,
  PROTOCOL_VERSION_TAG,
  LICENSE_CONFIG_TAG,
} from './constants';
import NodeBundlr from '@bundlr-network/client/build/esm/node/index';
import { gql, ApolloClient, InMemoryCache } from '@apollo/client/core';
import workerpool from 'workerpool';
import FairSDK from '@fair-protocol/sdk/node';

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
  scriptcurator: string
) => {
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [ PROTOCOL_NAME ],
    },
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
        transactions(first: 100, tags: $tags, owners: [$owner], sort: HEIGHT_DESC) {
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
  scriptId: string,
) => {
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [ PROTOCOL_NAME ],
    },
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
  ];

  const result = await clientGateway.query({
    query: gqlQuery,
    variables: { tags, first: 4 },
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

const getGeneralTags = (
  inferenceResult: InferenceResult,
  userAddress: string,
  requestTransaction: string,
  requestTags: { name: string; value: string }[],
  conversationIdentifier: string,
  registration: OperatorParams,
) => {
  let type;
  if (inferenceResult.imgPaths) {
    type = 'image';
  } else if (inferenceResult.audioPath) {
    type = 'audio';
  } else {
    type = 'text';
  }

  const protocolVersion = requestTags.find((tag) => tag.name === PROTOCOL_VERSION_TAG)?.value;
  const modelName = requestTags.find((tag) => tag.name === MODEL_NAME_TAG)?.value ?? registration.modelName;
  let prompt = registration.settings?.prompt ? `${registration.settings?.prompt}${inferenceResult.prompt}` : inferenceResult.prompt;
  if (prompt.length > MAX_STR_SIZE) {
    prompt = prompt.substring(0, MAX_STR_SIZE);
  }

  const settingsNegativePrompt = registration.settings?.['negative_prompt'];
  const requestNegativePrompt = requestTags.find((tag) => tag.name === NEGATIVE_PROMPT_TAG)?.value;

  let negativePrompt;
  if (settingsNegativePrompt && requestNegativePrompt) {
    negativePrompt = `${settingsNegativePrompt} ${requestNegativePrompt}`;
  } else if (settingsNegativePrompt) {
    negativePrompt = settingsNegativePrompt;
  } else if (requestNegativePrompt) {
    negativePrompt = requestNegativePrompt;
  } else {
    // ignore
  }

  let description = requestTags.find((tag) => tag.name === DESCRIPTION_TAG)?.value;

  const generalTags = [
    { name: PROTOCOL_NAME_TAG, value: PROTOCOL_NAME },
    { name: PROTOCOL_VERSION, value: protocolVersion as string },
    // add logic tags
    { name: OPERATION_NAME_TAG, value: 'Script Inference Response' },
    { name: MODEL_NAME_TAG, value: modelName },
    { name: SCRIPT_NAME_TAG, value: registration.scriptName },
    { name: SCRIPT_CURATOR_TAG, value: registration.scriptCurator },
    { name: SCRIPT_TRANSACTION_TAG, value: registration.scriptId },
    { name: SCRIPT_USER_TAG, value: userAddress },
    { name: REQUEST_TRANSACTION_TAG, value: requestTransaction },
    { name: PROMPT_TAG, value: prompt },
    { name: CONVERSATION_IDENTIFIER_TAG, value: conversationIdentifier },
    // ans 110 tags discoverability
    { name: 'Title', value: 'Fair Protocol Atomic Asset' },
    { name: 'Type', value: type },
    { name: INDEXED_BY_TAG, value: 'ucm' },
  
    // add license tags
    { name: 'License', value: UDL_ID },
    { name: 'Derivation', value: 'Allowed-With-License-Passthrough' },
    { name: 'Commercial-Use', value: 'Allowed' },
    // add extra tags

    { name: UNIX_TIME_TAG, value: (Date.now() / secondInMS).toString() },
    { name: TOPIC_AI_TAG, value: 'ai-generated' }
  ];

  const generateAssets = requestTags.find((tag) => tag.name === FairSDK.utils.TAG_NAMES.generateAssets)?.value;

  if (!generateAssets || generateAssets === 'fair-protocol') {
    const appendIdx = generalTags.findIndex((tag) => tag.name === CONVERSATION_IDENTIFIER_TAG) + 1;
    // add asset tags
    FairSDK.utils.addAtomicAssetTags(generalTags, userAddress, 'Fair Protocol Atomic Asset', 'FPAA', 1000, appendIdx);
  } else if (generateAssets && generateAssets === 'rareweave') {
    const appendIdx = generalTags.findIndex((tag) => tag.name === CONVERSATION_IDENTIFIER_TAG) + 1;
    const rareweaveConfig = requestTags.find((tag) => tag.name === FairSDK.utils.TAG_NAMES.rareweaveConfig)?.value;
    const royalty = rareweaveConfig ? JSON.parse(rareweaveConfig).royalty : 0;
    FairSDK.utils.addRareweaveTags(generalTags, userAddress, 'Fair Protocol Atomic Asset', 'Atomic Asset Generated in Fair Protocol. Compatible with Rareweave', royalty, type, 1000, appendIdx);
  } else {
    // do not add asset tags
  }
  
  // optional tags
  const licenseConfig = requestTags.find((tag) => tag.name === LICENSE_CONFIG_TAG)?.value;

  if (licenseConfig) {
    try {
      const parsed: ITag[] = JSON.parse(licenseConfig);

      if (!Array.isArray(parsed)) {
        throw new Error('Invalid license config');
      }

      const licenseIdx = generalTags.findIndex((tag) => tag.name === 'License');
      const defaultLicenseElements = 3;
      // remove default license tags and add all parsed tags
      generalTags.splice(licenseIdx, defaultLicenseElements, ...parsed);
    } catch (error) {
      // ignore
    }
  }

  if (description && description?.length > MAX_STR_SIZE) {
    description = description?.substring(0, MAX_STR_SIZE);
    // insert after title tag
    const descriptionIdx = generalTags.findIndex((tag) => tag.name === 'Title') + 1;
    generalTags.splice(descriptionIdx, 0, { name: DESCRIPTION_TAG, value: description });
  } else if (description) {
    const descriptionIdx = generalTags.findIndex((tag) => tag.name === 'Title') + 1;
    generalTags.splice(descriptionIdx, 0, { name: DESCRIPTION_TAG, value: description });
  } else {
    // ignore
  }

  if (negativePrompt && negativePrompt?.length >= MAX_STR_SIZE) {
    negativePrompt = negativePrompt?.substring(0, MAX_STR_SIZE);
    const negativePromptIdx = generalTags.findIndex((tag) => tag.name === 'Prompt') + 1;
    generalTags.splice(negativePromptIdx, 0, { name: NEGATIVE_PROMPT_TAG, value: negativePrompt });
  } else if (negativePrompt) {
    const negativePromptIdx = generalTags.findIndex((tag) => tag.name === 'Prompt') + 1;
    generalTags.splice(negativePromptIdx, 0, { name: NEGATIVE_PROMPT_TAG, value: negativePrompt });
  } else {
    // ignore
  }

  const customUserTags = requestTags.find((tag) => tag.name === USER_CUSOM_TAGS_TAG)?.value;
  if (customUserTags) {
    try {
      const customTags = JSON.parse(customUserTags);
      // filter custom tags to remove not overridavble ones
      let newTagsIdx = 1;
      for (const customTag of customTags) {
        const isOverridable = !NOT_OVERRIDABLE_TAGS.includes(customTag.name);
        const tagIdx = generalTags.findIndex((tag) => tag.name === customTag.name);

        if (tagIdx >= 0 && isOverridable) {
          generalTags.splice(tagIdx, 1, customTag);
        } else if (isOverridable) {
          // insert afer unix time tag
          const unixTimeIdx = generalTags.findIndex((tag) => tag.name === UNIX_TIME_TAG) + newTagsIdx;
          generalTags.splice(unixTimeIdx, 0, customTag);

          // only increment if tag was added after unixtimestamp tag
          newTagsIdx++;
        } else {
          // ignore
        }
      }
    } catch (err) {
      // ignore custom tags if invalid
    }
  }


  return generalTags;
};

const registerAsset = async (transactionId: string) => {
  try {
    const { contractTxId } = await warp.register(transactionId, 'node2'); // must use same node as uploaded data
    workerpool.workerEmit({
      type: 'info',
      message: `Token Registered ==> https://arweave.net/${contractTxId}`,
    });
  } catch (e) {
    workerpool.workerEmit({ type: 'error', message: `Could not register token: ${e}` });
  }
};

const sendToBundlr = async (
  inferenceResult: InferenceResult,
  userAddress: string,
  requestTransaction: string,
  requestTags: { name: string; value: string }[],
  conversationIdentifier: string,
  registration: OperatorParams,
) => {
  let responses = inferenceResult.imgPaths as string[] ?? inferenceResult.audioPath as string;
  // turn into array to use same code for single and multiple responses
  responses = Array.isArray(responses) ? responses : [responses];

  // Get loaded balance in atomic units
  const atomicBalance = await bundlr.getLoadedBalance();

  workerpool.workerEmit({ type: 'info', message: `node balance (atomic units) = ${atomicBalance}` });

  // Convert balance to an easier to read format
  const convertedBalance = bundlr.utils.fromAtomic(atomicBalance);
  workerpool.workerEmit({ type: 'info', message: `node balance (converted) = ${convertedBalance}` });

  const generalTags = getGeneralTags(inferenceResult, userAddress, requestTransaction, requestTags, conversationIdentifier, registration);

  const assetNames = requestTags.find((tag) => tag.name === ASSET_NAMES_TAG)?.value;
  try {
    let i = 0;
    for (const response of responses) {
      const tags = [ ...generalTags ];
      const currentImageSeed = inferenceResult.seeds ? inferenceResult.seeds[i] : null;
      if (currentImageSeed) {
        // insert after negative prompt tag
        const inferenceSeedIdx = tags.findIndex((tag) => tag.name === NEGATIVE_PROMPT_TAG) + 1;
        tags.splice(inferenceSeedIdx, 0, { name: 'Inference-Seed', value: currentImageSeed });
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

      const generateAssets = requestTags.find((tag) => tag.name === FairSDK.utils.TAG_NAMES.generateAssets)?.value;

      if (!generateAssets || generateAssets !== 'none') {
        // if there is no generate assets tag or it is not none, register the asset
        await registerAsset(transaction.id);
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

const parsePayload = (format: string, text: string, settings?: IOptionalSettings, negativePrompt?: string) => {
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

    // force n_iter 1
    webuiPayload['n_iter'] = '1';
  
    payload = JSON.stringify(webuiPayload);
  } else {
    payload = text;
  }

  return payload;
};

const runInference = async (url: string, format: 'webui' | 'default', payload: string, scriptId: string, text: string) => {
  const res = await fetch(url, {
    method: 'POST',
    ...(format === 'webui' && { headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    }}),
    body: payload,
  });
  const tempData = await res.json();

  if (tempData.images) {
    let i = 0;
    const imgPaths = [], imgSeeds = [];

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

const inference = async function (requestTx: IEdge, registration: OperatorParams, nImages: number, cid: string, negativePrompt?: string) {
  const { scriptId, url, settings, payloadFormat: format } = registration;

  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.node.id}`);
  const successStatusCode = 200;
  if (requestData.status !== successStatusCode) {
    throw new Error(`Could not retrieve Tx data from '${NET_ARWEAVE_URL}/${requestTx.node.id}'`);
  }

  const text = await (await requestData.blob()).text();
  workerpool.workerEmit({ type: 'info', message: `User Prompt: ${text}` });

  const payload = parsePayload(format, text, settings, negativePrompt);

  const maxImages = 10;

  let nIters =  parseInt(format === 'webui' ? settings?.['n_iter'] || '4' : '1', 10);

  if (format === 'webui' && nImages && nImages > 0 && nImages <= maxImages) {
    nIters = nImages;
  } else {
    // use default
  }

  for (let i = 0;i< nIters; i++) {
    const result = await runInference(url, format, payload, scriptId, text);
    workerpool.workerEmit({ type: 'info', message: `Inference Result: ${JSON.stringify(result)}` });

    await sendToBundlr(
      result,
      requestTx.node.owner.address,
      requestTx.node.id,
      requestTx.node.tags,
      cid,
      registration,
    );
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

  const paymentTxs = await queryCheckUserPayment(txid, userAddress, scriptId);
  const necessaryPayments = 3;

  if (paymentTxs.length < necessaryPayments) {
    return false;
  } else {
    const validPayments = paymentTxs.filter(tx => {
      try {
        const input = tx.node.tags.find((tag) => tag.name === INPUT_TAG)?.value;
        if (!input) {
          return false;
        }

        const inputObj = JSON.parse(input);
        const qty = parseInt(inputObj.qty, 10);
        if (inputObj.function !== 'transfer') {
          return false;
        } else if (qty >= marketplaceShare && inputObj.target === VAULT_ADDRESS) {
          return true;
        } else if (qty >= curatorShare && inputObj.target === curatorAddress) {
          return true;
        } else if (qty >= creatorShare && inputObj.target === creatorAddress) {
          return true;
        } else {
          return false;
        }
      } catch (error) {
        return false;
      }     
    });

    return validPayments.length >= necessaryPayments;
  }
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

  const nImages = parseInt(requestTx.node.tags.find((tag) => tag.name === N_IMAGES_TAG)?.value ?? '0', 10);

  let operatorFee = registration.operatorFee;
  let necessaryAnswers = 1;
  if (nImages > 0 && registration.payloadFormat === 'webui') {
    operatorFee = registration.operatorFee * nImages; 
    necessaryAnswers = nImages;
  } else if (registration.payloadFormat === 'webui') {
    operatorFee = registration.operatorFee * 4;
    necessaryAnswers = 4;
  }

  const responseTxs: IEdge[] = await queryTransactionAnswered(
    requestId,
    address,
    registration.scriptName,
    registration.scriptCurator,
  );

  if (responseTxs.length > 0 && responseTxs.length >= necessaryAnswers) {
    // If the request has already been answered, we don't need to do anything
    workerpool.workerEmit({
      type: 'info',
      message: `Request ${requestId} has already been answered. Skipping...`,
    });
    return requestId;
  } else if (responseTxs.length > 0 && responseTxs.length < necessaryAnswers) {
    workerpool.workerEmit({
      type: 'info',
      message: `Request ${requestId} has missing answers. Processing...`,
    });
  }

  if (
    !(await checkUserPaidInferenceFees(
      requestTx.node.id,
      reqUserAddr,
      registration.modelOwner,
      registration.scriptCurator,
      operatorFee,
      registration.scriptId,
    ))
  ) {
    workerpool.workerEmit({
      type: 'error',
      message: `Could not find payment for request ${requestId}. Skipping...`,
    });
    return false;
  }

  const protocolVersion = requestTx.node.tags.find((tag) => tag.name === PROTOCOL_VERSION_TAG)?.value;
  const conversationIdentifier = requestTx.node.tags.find(
    (tag) => tag.name === 'Conversation-Identifier',
  )?.value;
  if (!protocolVersion || !conversationIdentifier) {
    // If the request doesn't have the necessary tags, skip
    workerpool.workerEmit({
      type: 'error',
      message: `Request ${requestId} does not have the necessary tags.`,
    });
    return false;
  }

  const missingInferences = necessaryAnswers - responseTxs.length;
  const negativePrompt = requestTx.node.tags.find((tag) => tag.name === NEGATIVE_PROMPT_TAG)?.value;

  await inference(requestTx, registration, missingInferences, conversationIdentifier, negativePrompt);

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
