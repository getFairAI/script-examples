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
const crypto = require('crypto');
const NodeBundlr = require('@bundlr-network/client');
const { WarpFactory } = require('warp-contracts');
const { DeployPlugin } = require('warp-contracts-plugin-deploy');
const workerpool = require('workerpool');
const FairSDK = require('@fair-protocol/sdk/cjs');
const PDFParser = require('pdf2json');
const { Transform, Readable, Writable } = require('stream');
const pdfParser = new PDFParser(this, 1);
const { decryptSafely, encryptSafely } = require('@metamask/eth-sig-util');

const APP_NAME_TAG = 'App-Name';
const APP_VERSION_TAG = 'App-Version';
const PROTOCOL_NAME_TAG = 'Protocol-Name';
const PROTOCOL_VERSION_TAG = 'Protocol-Version';
const CONVERSATION_IDENTIFIER_TAG = 'Conversation-Identifier';
const CONTENT_TYPE_TAG = 'Content-Type';
const UNIX_TIME_TAG = 'Unix-Time';
const SOLUTION_USER_TAG = 'Solution-User';
const SOLUTION_NAME_TAG = 'Solution-Name';
const SOLUTION_CREATOR_TAG = 'Solution-Creator';
const REQUEST_TRANSACTION_TAG = 'Request-Transaction';
const OPERATION_NAME_TAG = 'Operation-Name';
const INFERENCE_TRANSACTION_TAG = 'Inference-Transaction';
const CONTRACT_TAG = 'Contract';
const INPUT_TAG = 'Input';
const SEQUENCE_OWNER_TAG = 'Sequencer-Owner';
const SOLUTION_TRANSACTION_TAG = 'Solution-Transaction';
const ASSET_NAMES_TAG = 'Asset-Names';
const NEGATIVE_PROMPT_TAG = 'Negative-Prompt';
const PROMPT_TAG = 'Prompt';
const INDEXED_BY_TAG = 'Indexed-By';
const TOPIC_AI_TAG = 'topic:ai-generated';
const MODEL_NAME_TAG = 'Model-Name';
const DESCRIPTION_TAG = 'Description';
const USER_CUSOM_TAGS_TAG = 'User-Custom-Tags';
const INFERENCE_SEED_TAG = 'Inference-Seed';
const RESPONSE_TRANSACTION_TAG = 'Response-Transaction';
const REGISTRATION_TRANSACTION_TAG = 'Registration-Transaction';
const SOLUTION_OPERATOR_TAG = 'Solution-Operator';
const LICENSE_CONFIG_TAG = 'License-Config';
const CREATOR_TAG = 'Creator';
const IMAGES_WIDTH_TAG = 'Images-Width';
const IMAGES_HEIGHT_TAG = 'Images-Height';

const NOT_OVERRIDABLE_TAGS = [
  APP_NAME_TAG,
  APP_VERSION_TAG,
  PROTOCOL_NAME_TAG,
  PROTOCOL_VERSION_TAG,
  SOLUTION_NAME_TAG,
  SOLUTION_CREATOR_TAG,
  OPERATION_NAME_TAG,
  SOLUTION_TRANSACTION_TAG,
  INFERENCE_TRANSACTION_TAG,
  REQUEST_TRANSACTION_TAG,
  RESPONSE_TRANSACTION_TAG,
  REGISTRATION_TRANSACTION_TAG,
  CONTRACT_TAG,
  INPUT_TAG,
  SEQUENCE_OWNER_TAG,
  UNIX_TIME_TAG,
  MODEL_NAME_TAG,
  PROMPT_TAG,
  NEGATIVE_PROMPT_TAG,
  INFERENCE_SEED_TAG,
  SOLUTION_USER_TAG,
  CONTENT_TYPE_TAG,
  SOLUTION_OPERATOR_TAG,
  CONVERSATION_IDENTIFIER_TAG,
  CREATOR_TAG,
];

const NET_ARWEAVE_URL = 'https://arweave.net';
const UDL_ID = 'yRj4a5KMctX_uOmKWCFJIjmY8DeJcusVk6-HzLiM_t8';

const MAX_STR_SIZE = 1000;
const secondInMS = 1000;

const JWK = JSON.parse(fs.readFileSync('wallet.json').toString());
// initailze the bundlr SDK
// const bundlr: Bundlr = new (Bundlr as any).default(
const bundlr = new NodeBundlr('https://up.arweave.net', 'arweave', JWK);
const warp = WarpFactory.forMainnet().use(new DeployPlugin());

const registerAsset = async (transactionId) => {
  try {
    const { contractTxId } = await warp.register(transactionId, 'arweave'); // must use same node as uploaded data
    workerpool.workerEmit({
      type: 'info',
      message: `Token Registered ==> https://arweave.net/${contractTxId}`,
    });
  } catch (e) {
    workerpool.workerEmit({ type: 'error', message: `Could not register token: ${e}` });
  }
};


const getAssetName = (idx, assetNames) => {
  if (!assetNames) {
    return undefined;
  }

  try {
    const names = JSON.parse(assetNames);
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
  inferenceResult,
  userAddress,
  requestTransaction,
  requestTags,
  conversationIdentifier,
  registration,
) => {
  let type;
  let contentType;
  
  const toEncrypt = requestTags.find((tag) => tag.name === 'Private-Mode')?.value === 'true';
  const inMemory = !!inferenceResult.images || !!inferenceResult.content || toEncrypt || inferenceResult.answer;
  
  if (toEncrypt) {
    type = 'encrypted';
    contentType = 'application/json';
  } else if (inferenceResult.imgPaths || inferenceResult.images) {
    type = 'image';
    contentType = 'image/png';
  } else if (inferenceResult.audioPath) {
    type = 'audio';
    contentType = 'audio/wav';
  } else {
    type = 'text';
    contentType = 'text/plain';
  }
  // const protocolVersion = requestTags.find((tag) => tag.name === PROTOCOL_VERSION_TAG)?.value;
  const modelName = requestTags.find((tag) => tag.name === MODEL_NAME_TAG)?.value ?? registration.modelName;
  let prompt = registration.settings?.prompt ? `${registration.settings?.prompt}, ${inferenceResult.prompt}` : inferenceResult.prompt;
  if (prompt.length > MAX_STR_SIZE) {
    prompt = prompt.substring(0, MAX_STR_SIZE);
  }

  const settingsNegativePrompt = registration.settings?.['negative_prompt'];
  const requestNegativePrompt = requestTags.find((tag) => tag.name === NEGATIVE_PROMPT_TAG)?.value;

  let negativePrompt;
  if (settingsNegativePrompt && requestNegativePrompt) {
    negativePrompt = `${settingsNegativePrompt}, ${requestNegativePrompt}`;
  } else if (settingsNegativePrompt) {
    negativePrompt = settingsNegativePrompt;
  } else if (requestNegativePrompt) {
    negativePrompt = requestNegativePrompt;
  } else {
    // ignore
  }

  let description = requestTags.find((tag) => tag.name === DESCRIPTION_TAG)?.value;

  const generalTags = [
    { name: PROTOCOL_NAME_TAG, value: 'FairAI' },
    { name: PROTOCOL_VERSION_TAG, value: '2.0' },
    // add logic tags
    { name: OPERATION_NAME_TAG, value: 'Inference Response' },
   
    { name: SOLUTION_TRANSACTION_TAG, value: registration.solutionId },
    { name: SOLUTION_USER_TAG, value: userAddress },
    { name: REQUEST_TRANSACTION_TAG, value: requestTransaction },
    { name: PROMPT_TAG, value: prompt },
    { name: CONVERSATION_IDENTIFIER_TAG, value: conversationIdentifier },
    // ans 110 tags discoverability
    { name: 'Title', value: 'FairAI Response' },
    { name: 'Type', value: type },
    { name: INDEXED_BY_TAG, value: 'ucm' },
    { name: CREATOR_TAG, value: userAddress },

    // add license tags
    { name: 'License', value: UDL_ID },
    { name: 'Derivation', value: 'Allowed-With-License-Passthrough' },
    { name: 'Commercial-Use', value: 'Allowed' },
    // add extra tags

    { name: UNIX_TIME_TAG, value: (Date.now() / secondInMS).toString() },
    { name: TOPIC_AI_TAG, value: 'ai-generated' }
  ];

  if (modelName) {
    generalTags.splice(2, 0, { name: MODEL_NAME_TAG, value: modelName });
  }

  if (inMemory) {
    generalTags.splice(0, 0, { name:'Content-Type', value: contentType },);
  } else {
    // ignore, content type will be added by irys sdk in uploadFile
  }

  if (toEncrypt) {
    const appendIdx = generalTags.findIndex((tag) => tag.name === CONVERSATION_IDENTIFIER_TAG) + 1;
    generalTags.splice(appendIdx, 0, { name: 'Private-Mode', value: 'true' });
  }

  const generateAssets = requestTags.find((tag) => tag.name === FairSDK.utils.TAG_NAMES.generateAssets)?.value;

  if (generateAssets === 'fair-protocol') {
    const appendIdx = generalTags.findIndex((tag) => tag.name === CONVERSATION_IDENTIFIER_TAG) + 1;
    // add asset tags
    FairSDK.utils.addAtomicAssetTags(generalTags, userAddress, 'Fair Protocol Atomic Asset', 'FPAA', 1000, appendIdx);
  } else {
    // do not add asset tags
  }

  // optional tags
  const licenseConfig = requestTags.find((tag) => tag.name === LICENSE_CONFIG_TAG)?.value;

  if (licenseConfig) {
    try {
      const parsed = JSON.parse(licenseConfig);

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
        if (customTag.value !== 'string') {
          customTag.value = JSON.stringify(customTag.value);
        } else {
          // eslint-disable-next-line no-useless-escape
          customTag.value = customTag.value.replaceAll('\"', '');
        }
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

        // if custom user tag is init state override Creator and Solution User with firstOwner
        if (customTag.name === 'Init-State') {
          const firstOwner = JSON.parse(customTag.value).firstOwner;
          const creatorIdx = generalTags.findIndex((tag) => tag.name === CREATOR_TAG);
          const solutionUserIdx = generalTags.findIndex((tag) => tag.name === SOLUTION_USER_TAG);

          if (creatorIdx >= 0) {
            generalTags.splice(creatorIdx, 1, { name: CREATOR_TAG, value: firstOwner });
          } else {
            // ignore
          }

          if (solutionUserIdx >= 0) {
            generalTags.splice(solutionUserIdx, 1, { name: SOLUTION_USER_TAG, value: firstOwner });
          } else {
            // ignore
          }
        }
      }
    } catch (err) {
      // ignore custom tags if invalid
    }
  }


  return generalTags;
};

const sendToBundlr = async (
  inferenceResult,
  userAddress,
  requestTransaction,
  requestTags,
  conversationIdentifier,
  registration,
  userPubKey
) => {
  let responses;
  const toEncrypt = requestTags.find((tag) => tag.name === 'Private-Mode')?.value === 'true';
  const inMemory = !!inferenceResult.images || !!inferenceResult.content || !!inferenceResult.answer;
  
  if (inMemory && inferenceResult.images && toEncrypt) {
    responses = inferenceResult.images;
  } else if (inMemory && inferenceResult.images) {
    responses = inferenceResult.images.map((el) => Buffer.from(el, 'base64')); // map paths to 
  } else if (inMemory && inferenceResult.content) {
    responses = inferenceResult.content;
  } else if (inMemory && inferenceResult.answer) {
    responses = JSON.stringify({
      response: inferenceResult.answer,
      ...(!!inferenceResult.history) && { promptHistory: inferenceResult.history },
    });
  } else {
    responses = inferenceResult.imgPaths ?? inferenceResult.audioPath;
  }
  // turn into array to use same code for single and multiple responses
  responses = Array.isArray(responses) ? responses : [responses];
  
  const responsesClone = [ ...responses ];
  if (toEncrypt) {
    for (let i = 0; i < responsesClone.length; i++) {
      if (fs.existsSync(responsesClone[i])) {
        const data = fs.readFileSync(responsesClone[i]);
        const encrypted = encryptSafely({
          data: JSON.stringify(data.toJSON()),
          publicKey: userPubKey,
          version: 'x25519-xsalsa20-poly1305'
        });
        responses[i] = JSON.stringify(encrypted);
      } else {
        const encrypted = encryptSafely({
          data: responsesClone[i],
          publicKey: userPubKey,
          version: 'x25519-xsalsa20-poly1305'
        });
        responses[i] = JSON.stringify(encrypted);
      }
    }
  }

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
        tags.splice(inferenceSeedIdx, 0, { name: INFERENCE_SEED_TAG, value: currentImageSeed });
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
      
      let transaction;
      if (inMemory || toEncrypt) {
        transaction = await bundlr.upload(response, { tags });
      } else {
        transaction = await bundlr.uploadFile(response, { tags });
      }
  
      workerpool.workerEmit({ type: 'info', message: `Data uploaded ==> https://arweave.net/${transaction.id}` });
      
      const generateAssets = requestTags.find((tag) => tag.name === FairSDK.utils.TAG_NAMES.generateAssets)?.value;
      if (!!generateAssets && generateAssets !== 'none') {
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

const fetchSeed = async (url, imageStr) => {
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

    const result = await secRes.json();
    const seedStrStartIdx = result.info.indexOf('Seed:');
    const seedStrEndIdx = result.info.indexOf(',', seedStrStartIdx); // search for next comma after 'Seed:' substring

    const seedStr = result.info.substring(seedStrStartIdx, seedStrEndIdx);
    const seed = seedStr.split('Seed:')[1].trim();

    return seed;
  } catch (e) {
    return '';
  }
};

const isValidSize = (size) => {
  try {
    const width = parseInt(size.width, 10);
    const height = parseInt(size.height, 10);
    if (width === 960 && height === 1280) { // portrait sizes
      return true;
    } else if (width === 1280 && height === 720) { // landscape sizes
      return true;
    } else if (width === 1024 && height === 1024) { // square sizes
      return true;
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }
};

const parsePayload = (format, payloadType, text, settings, negativePrompt, conversationData = '', customImagesSize, contextData = '') => {
  let payload;

  if (format === 'webui') {
    const webuiPayload = {
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

    if (isValidSize(customImagesSize)) {
      // get upscale from settings
      const scale = webuiPayload['hr_scale'] ?? 1;

      // if setting has upscaling, reduce sizes by scale
      webuiPayload['width'] = Math.floor(parseInt(customImagesSize.width, 10) / scale);
      webuiPayload['height'] = Math.floor(parseInt(customImagesSize.height, 10) / scale);
    }

    // force n_iter 1
    webuiPayload['n_iter'] = 1;
  
    payload = JSON.stringify(webuiPayload);
  } else if (format === 'llama.cpp') {
    // load previous mesages from same conversation
    // parse previous messages and add to payload
    let formattedPrompt = '';

    formattedPrompt = conversationData ? `<s>${conversationData}</s> [INST] ${text} [/INST]` : `[INST] ${text} [/INST]`;

    payload = JSON.stringify({
      prompt: formattedPrompt,
      ['n_predict']: 100, // Set the maximum number of tokens to predict when generating text. -1 = infinity.
      ['n_keep']: -1, // keep all tokens
      ['repeat_last_n']: 1, // use context size for repetition penalty
    });
  } else if (format === 'ollama') {
    let newPrompt;

    if (contextData && !conversationData) {
      newPrompt = {
        role: 'user',
        content: `Using this data: ${contextData}. Answer to this prompt: ${text}`
      }; 
    } else {
      newPrompt = {
        role: 'user',
        content: `${text}`
      };
    }
    let messages = [];
    try {
      messages = messages.concat(...JSON.parse(conversationData), newPrompt);
    } catch (err) {
      // 
      messages.push(newPrompt);
    }

    payload = JSON.stringify({
      messages
    });
  } else if (format === 'arbitrum') {
    payload = JSON.stringify({
      prompt: text,
      type: payloadType
    });
  } else {
    payload = text;
  }

  return payload;
};

const runInference = async (url, format, payload, text) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...((format === 'webui' || format === 'ollama' || format === 'arbitrum') && { headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      }}),
      body: payload,
    });
    const tempData = await res.json();

    if (tempData.images) {
      const imgSeeds = [];

      for (const el of tempData.images) {
        const seed = await fetchSeed(url, el);
        imgSeeds.push(seed);
      }

      return { images: tempData.images, prompt: text, seeds: imgSeeds };
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
    } else if (tempData.content) {
      return {
        formattedPrompt: JSON.parse(payload).prompt,
        prompt: text,
        content: tempData.content,
      };
    } else if (tempData.answer) {
      // arbitrum response
      return {
        prompt: text,
        answer: tempData.answer
      };
    } else if (tempData.messages && tempData.answer) {
      // ollama and response
      return {
        history: JSON.stringify(tempData.messages),
        prompt: text,
        answer: tempData.answer
      };
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (err) {
    console.log(err);
  }
};

class StringifyStream extends Transform {
  constructor(options) {
      super(options);

      this._readableState.objectMode = false;
      this._writableState.objectMode = true;    
  }

  _transform = (obj, encoding, callback) => {
    const onlyTexts = obj['Pages'].reduce(
      (acc, curr) => {
        const result = curr['Texts'].flatMap((textObj) => textObj['R'].flatMap((r) => decodeURI(r['T']).trim()));
        acc = acc.concat(...result);
        return acc;
      }, []);
    this.push(onlyTexts.join(''));
    callback();
  };
}

const inference = async (requestTx, registration, nImages, cid, negativePrompt, operatorPk, userPubKey) => {
  const modelName = requestTx.tags.find(tag => tag.name === 'Model-Name')?.value;
  // find matching model name or use first available from config
  const modelConfig = registration.models.find((model) => model.name === modelName) || registration.models[0];
  const { url, settings, payloadFormat: format, payloadType } = modelConfig;

  const requestData = await fetch(`${NET_ARWEAVE_URL}/${requestTx.id}`);
  const successStatusCode = 200;
  const acceptedStatusCode = 202;
  if (![successStatusCode, acceptedStatusCode].includes(requestData.status)) {
    throw new Error(`Could not retrieve Tx data from '${NET_ARWEAVE_URL}/${requestTx.id}'`);
  }

  const contentType = requestData.headers.get('Content-Type');

  const isEncrypted = requestTx.tags.find((tag) => tag.name === 'Private-Mode')?.value === 'true';
  if (!userPubKey && isEncrypted) {
    throw new Error('Missing public key for encryption');
  }

  let text = '';
  let promptHistory = '';
  let contextData = '';
  if (contentType.includes('pdf')) {
    /* throw new Error('PDF NOT SUPPORTED'); */
    try {
      const output = new Writable();

      output._write = (chunk, encoding, next) => {
        text += chunk.toString();
        next();
      };

      await new Promise((resolve, reject) => {
        output.on('finish', () => {
          output.end();
          resolve();
        });
        output.on('error', (error) => reject(error));
        
        Readable.fromWeb(requestData.body).pipe(pdfParser.createParserStream()).pipe(new StringifyStream()).pipe(output); 
      });

      if (text === '') {
        // empty pdf
        const protocolVersion = requestTx.tags.find((tag) => tag.name === PROTOCOL_VERSION_TAG)?.value;
        const modelName = requestTx.tags.find((tag) => tag.name === MODEL_NAME_TAG)?.value ?? registration.modelName;
        const errorTags = [
          { name:'Content-Type', value: 'text/plain' },
          { name: PROTOCOL_NAME_TAG, value: 'FairAI' },
          { name: PROTOCOL_VERSION_TAG, value: protocolVersion },
          // add logic tags
          { name: OPERATION_NAME_TAG, value: 'Inference Response' },
          { name: MODEL_NAME_TAG, value: modelName },
          { name: SOLUTION_TRANSACTION_TAG, value: registration.solutionId },
          { name: SOLUTION_USER_TAG, value:  requestTx.address, },
          { name: REQUEST_TRANSACTION_TAG, value: requestTx.id },
          { name: PROMPT_TAG, value: `https://arweave.net/${requestTx.id}` },
          { name: CONVERSATION_IDENTIFIER_TAG, value: cid },
          // add extra tags
      
          { name: UNIX_TIME_TAG, value: (Date.now() / secondInMS).toString() },
        ];
        await bundlr.upload('We apologise for the inconvenience but the requested file could not be parsed into audio. Please try a different format.', { tags: errorTags });
        workerpool.workerEmit({ type: 'info', message: `Data uploaded ==> https://arweave.net/${requestTx.id}` });

        return;
      }

      } catch (err) {
        workerpool.workerEmit({ type: 'error', message: err.message });
      }
  } else if (isEncrypted && (format === 'llama.cpp' || format === 'ollama')) {
    // decrypt with pk
    const encData = await requestData.text();
    const decData = decryptSafely({ encryptedData: JSON.parse(encData).encForOperator, privateKey: operatorPk.replace('0x', '') });
    text = decData.prompt;
    promptHistory = decData.promptHistory;
    if (promptHistory) {
      // no need to have contextData
    } else {
      const contextDataFileUrl = requestTx.tags.find(tag => tag.name === 'Context-File-Url')?.value;
      try {
        const res = await fetch(contextDataFileUrl); // try to fetch url
        if (res.headers.get('Content-Type')?.includes('text')) {
          contextData = await contextDataFileUrl.text();
        } else {
          const { encForOperator } = JSON.parse(await res.text());
          contextData = decryptSafely({ encryptedData: encForOperator, privateKey: operatorPk.replace('0x', '') });
        }
      } catch (err) {
        // ignore context
      }
    }
  } else if (isEncrypted) {
    const encData = await requestData.text();
    const result = decryptSafely({ encryptedData: JSON.parse(encData).encForOperator, privateKey: operatorPk.replace('0x', '') });
    text = result;
  } else if (format === 'llama.cpp' || format === 'ollama' || format === 'arbitrum') {
    const data = await requestData.text();
    
    text = JSON.parse(data).prompt;
    promptHistory = JSON.parse(data).promptHistory;
    if (promptHistory) {
      // ignore
    } else {
      try {
        const contextDataFileUrl = requestTx.tags.find(tag => tag.name === 'Context-File-Url')?.value;
        const res = await fetch(contextDataFileUrl); // try to fetch url
        contextData = await res.text();
      } catch (err) {
        // ignore context
      }
    }
  } else {
    text = await requestData.text();
  }

  workerpool.workerEmit({ type: 'info', message: `User Prompt: ${text}` });

  const customWith = requestTx.tags.find((tag) => tag.name === IMAGES_WIDTH_TAG)?.value;
  const customHeight = requestTx.tags.find((tag) => tag.name === IMAGES_HEIGHT_TAG)?.value;
  const customImagesSize = { width: customWith, height: customHeight };
  const payload = parsePayload(format, payloadType, text, settings, negativePrompt, promptHistory, customImagesSize, contextData);

  const maxImages = 10;

  let nIters =  format === 'webui' ? settings['n_iter'] || 4 : 1;

  if (format === 'webui' && nImages && nImages > 0 && nImages <= maxImages) {
    nIters = nImages;
  } else {
    // use default
  }

  for (let i = 0; i < nIters; i++) {
    const result = await runInference(url, format, payload, text);

    await sendToBundlr(
      result,
      requestTx.address,
      requestTx.id,
      requestTx.tags,
      cid,
      registration,
      userPubKey
    );
  }
};

const processRequest = async (requestTx, nMissingResponses, registration, operatorPk, userPubKey) => {  
  if (!requestTx) {
    // If the request doesn't exist, skip
    workerpool.workerEmit({ type: 'error', message: `Request ${requestTx.id} does not exist. Skipping...` });
    return false;
  }

  workerpool.workerEmit({
    type: 'info',
    message: `Request ${requestTx.id} has ${nMissingResponses} missing answers. Processing...`,
  });

  const protocolVersion = requestTx.tags.find((tag) => tag.name === PROTOCOL_VERSION_TAG)?.value;
  const conversationIdentifier = requestTx.tags.find(
    (tag) => tag.name === 'Conversation-Identifier',
  )?.value;
  if (!protocolVersion || !conversationIdentifier) {
    // If the request doesn't have the necessary tags, skip
    workerpool.workerEmit({ type: 'error', message: `Request ${requestTx.id} does not have the necessary tags.` });
    return false;
  }

  const negativePrompt = requestTx.tags.find((tag) => tag.name === NEGATIVE_PROMPT_TAG)?.value;
  await inference(requestTx, registration, nMissingResponses, conversationIdentifier, negativePrompt, operatorPk, userPubKey);

  return requestTx.id;
};

const processRequestLock = async (requestTx, nMissingResponses, registration, operatorPk, userPubKey) => {
  try {
    workerpool.workerEmit({ type: 'info', message: `Thread working on request ${requestTx.id}...` });
    
    const result = await processRequest(requestTx, nMissingResponses, registration, operatorPk, userPubKey);
    
    workerpool.workerEmit({ type: 'result', message: result });
  } catch (e) {
    workerpool.workerEmit({ type: 'error', message: `Thread ${requestTx.id} released with error: ${e}` });
    workerpool.workerEmit({ type: 'result', message: false });
  }
};

workerpool.worker({
  processRequestLock,
});