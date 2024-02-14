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

export interface ITag {
  name: string;
  value: string;
}

export interface IData {
  size: number;
  type: string | null;
}

export interface IFee {
  ar: string;
  winston: string;
}

export interface IOwner {
  address: string;
  key: string;
}

export interface IQuantity {
  ar: string;
  winston: string;
}

export interface IBlock {
  height: number;
  id: string;
  previous: string;
  timestamp: number;
}

export interface INode {
  id: string;
  tags: ITag[];
  anchor?: string;
  data: IData;
  fee: IFee;
  owner: IOwner;
  quantity: IQuantity;
  recipient: string;
  signature: string;
  block: IBlock;
}

export interface IEdge {
  node: INode;
  cursor?: string;
}

export interface ITransactions {
  edges: IEdge[];
  pageInfo: {
    hasNextPage: boolean;
  };
}

export type payloadFormatOptions = 'webui' | 'llama.cpp' | 'default';

export interface OperatorParams {
  modelName: string;
  modelOwner: string;
  operatorFee: number;
  scriptName: string;
  scriptCurator: string;
  scriptId: string;
  registrationTx: IEdge;
  url: string;
  payloadFormat: payloadFormatOptions;
  settings?: IOptionalSettings;
}

export interface ServerResponse {
  images?: string[];
  imgPaths?: string[];
  audioPath?: string;
}

export interface InferenceResult {
  imgPaths?: string[];
  seeds?: string[];
  audioPath?: string;
  prompt: string;
}

export interface UrlConfig {
  url: string;
  payloadFormat: payloadFormatOptions;
  settings?: IOptionalSettings;
}

export interface IOptionalSettings {
  [key: string]: string;
  prompt: string;
}
