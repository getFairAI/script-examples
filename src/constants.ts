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

export const APP_VERSION_TAG = 'App-Version';
export const CONVERSATION_IDENTIFIER_TAG = 'Conversation-Identifier';
export const APP_NAME_TAG = 'App-Name';
export const CONTENT_TYPE_TAG = 'Content-Type';
export const UNIX_TIME_TAG = 'Unix-Time';
export const SCRIPT_CURATOR_TAG = 'Script-Curator';
export const SCRIPT_NAME_TAG = 'Script-Name';
export const SCRIPT_USER_TAG = 'Script-User';
export const SCRIPT_OPERATOR_TAG = 'Script-Operator';
export const REQUEST_TRANSACTION_TAG = 'Request-Transaction';
export const RESPONSE_TRANSACTION_TAG = 'Response-Transaction';
export const OPERATION_NAME_TAG = 'Operation-Name';
export const PAYMENT_QUANTITY_TAG = 'Payment-Quantity';
export const PAYMENT_TARGET_TAG = 'Payment-Target';
export const REQUEST_TOKENS_TAG = 'Request-Tokens';
export const RESPONSE_TOKENS_TAG = 'Response-Tokens';
export const INFERENCE_TRANSACTION_TAG = 'Inference-Transaction';
export const CONTRACT_TAG = 'Contract';
export const INPUT_TAG = 'Input';
export const SEQUENCE_OWNER_TAG = 'Sequencer-Owner';
export const REGISTRATION_TRANSACTION_TAG = 'Registration-Transaction';
export const SCRIPT_TRANSACTION_TAG = 'Script-Transaction';
export const ASSET_NAMES_TAG = 'Asset-Names';
export const NEGATIVE_PROMPT_TAG = 'Negative-Prompt';
export const PROMPT_TAG = 'Prompt';
export const INDEXED_BY_TAG = 'Indexed-By';
export const TOPIC_AI_TAG = 'topic:ai-generated';
export const MODEL_NAME_TAG = 'Model-Name';
export const DESCRIPTION_TAG = 'Description';
export const USER_CUSOM_TAGS_TAG = 'User-Custom-Tags';
export const INIT_STATE_TAG = 'Init-State';
export const CUSTOM_APP_NAME_TAG = 'Custom-App-Name';
export const CUSTOM_APP_VERSION_TAG = 'Custom-App-Version';
export const INFERENCE_SEED_TAG = 'Inference-Seed';
export const N_IMAGES_TAG = 'N-Images';

export const NOT_OVERRIDABLE_TAGS = [
  CUSTOM_APP_NAME_TAG,
  CUSTOM_APP_VERSION_TAG,
  SCRIPT_NAME_TAG,
  SCRIPT_CURATOR_TAG,
  OPERATION_NAME_TAG,
  SCRIPT_TRANSACTION_TAG,
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
  SCRIPT_USER_TAG,
  CONTENT_TYPE_TAG,
  SCRIPT_OPERATOR_TAG,
  CONVERSATION_IDENTIFIER_TAG,
];

export const SCRIPT_INFERENCE_REQUEST = 'Script Inference Request';
export const CANCEL_OPERATION = 'Operator Cancellation';

export const NET_ARWEAVE_URL = 'https://arweave.net';
export const NODE2_BUNDLR_URL = 'https://node2.bundlr.network';

export const secondInMS = 1000;
export const successStatusCode = 200;

// https://github.com/facebookresearch/llama/issues/148
// according to discussing llama was trained on 2048 tokens so we will use the same number
// for the max tokens allowed to be passed in context
export const MAX_ALPACA_TOKENS = 2048;

export const VAULT_ADDRESS = 'tXd-BOaxmxtgswzwMLnryROAYlX5uDC9-XK2P4VNCQQ';
export const MARKETPLACE_FEE = '0.1';
export const SCRIPT_CREATION_FEE = '0.1';
export const OPERATOR_REGISTRATION_AR_FEE = '0.05';

export const OPERATOR_PERCENTAGE_FEE = 0.8;
export const MARKETPLACE_PERCENTAGE_FEE = 0.15;
export const CURATOR_PERCENTAGE_FEE = 0.025;
export const CREATOR_PERCENTAGE_FEE = 0.025;

export const U_CONTRACT_ID = 'KTzTXT_ANmF84fWEKHzWURD1LWd9QaFR9yfYUwH2Lxw';
export const U_DIVIDER = 1e6;

export const ATOMIC_TOKEN_CONTRACT_ID = 'h9v17KHV4SXwdW2-JHU6a23f6R0YtbXZJJht8LfP8QM';

export const UDL_ID = 'yRj4a5KMctX_uOmKWCFJIjmY8DeJcusVk6-HzLiM_t8';

export const MAX_STR_SIZE = 1000;