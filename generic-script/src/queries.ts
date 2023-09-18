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

import { gql, ApolloClient, InMemoryCache } from '@apollo/client/core';
import {
  CANCEL_OPERATION,
  CONTRACT_TAG,
  INFERENCE_TRANSACTION_TAG,
  INPUT_TAG,
  N_IMAGES_TAG,
  OPERATION_NAME_TAG,
  OPERATOR_PERCENTAGE_FEE,
  OPERATOR_REGISTRATION_AR_FEE,
  PROTOCOL_NAME,
  PROTOCOL_NAME_TAG,
  REGISTRATION_TRANSACTION_TAG,
  REQUEST_TRANSACTION_TAG,
  SCRIPT_CURATOR_TAG,
  SCRIPT_NAME_TAG,
  SCRIPT_OPERATOR_TAG,
  SCRIPT_TRANSACTION_TAG,
  SEQUENCE_OWNER_TAG,
  U_CONTRACT_ID,
  U_DIVIDER,
  VAULT_ADDRESS,
} from './constants';
import { IEdge, ITransactions } from './interfaces';

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
          block {
            height
          }
        }
      }
    }
  }
`;

const parseQueryResult = (result: { data: { transactions: ITransactions } }) =>
  result.data.transactions.edges;

export const queryTransactionsReceived = async (
  address: string,
  opFees: number[],
  scriptIds: string[],
  isStableDiffusion: boolean[],
  after?: string,
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
      values: scriptIds,
    },
    {
      name: CONTRACT_TAG,
      values: [U_CONTRACT_ID],
    },
    {
      name: SCRIPT_OPERATOR_TAG,
      values: [address],
    },
  ];

  const result = await clientGateway.query({
    query: gqlQuery,
    variables: { first: 10, tags, after },
  });

  // filter txs with incorrect payments
  const validPaymens = parseQueryResult(result).filter((tx) => {
    const input = tx.node.tags.find((tag) => tag.name === INPUT_TAG)?.value;

    if (!input) {
      return false;
    } else {
      const inputObj = JSON.parse(input);
      const feeIdx = scriptIds.indexOf(tx.node.tags.find((tag) => tag.name === SCRIPT_TRANSACTION_TAG)?.value ?? '');
      
      const nImages = parseInt(tx.node.tags.find((tag) => tag.name === N_IMAGES_TAG)?.value ?? '0', 10);
      if (nImages > 0 && isStableDiffusion[feeIdx]) {
        return inputObj.qty === (opFees[feeIdx] * nImages * OPERATOR_PERCENTAGE_FEE).toString() && inputObj.function === 'transfer' && inputObj.target === address;
      } else {
        return inputObj.qty === (opFees[feeIdx] * OPERATOR_PERCENTAGE_FEE).toString()&& inputObj.function === 'transfer' && inputObj.target === address;
      }
    }
  });
  return {
    requestTxs: validPaymens,
    hasNextPage: result.data.transactions.pageInfo.hasNextPage,
  };
};

export const getRequest = async (transactionId: string) => {
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
export const queryTransactionAnswered = async (
  transactionId: string,
  address: string,
  scriptName: string,
  scriptcurator: string,
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

export const queryCheckUserPayment = async (
  inferenceTransaction: string,
  userAddress: string,
  inputValues: string[],
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

export const getModelOwnerAndName = async (scriptName: string, scriptCurator: string) => {
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [ PROTOCOL_NAME ],
    },
    {
      name: OPERATION_NAME_TAG,
      values: ['Script Creation'],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [scriptName],
    },
  ];

  const result = await clientGateway.query({
    query: gql`
      query tx($tags: [TagFilter!], $first: Int, $owners: [String!]) {
        transactions(first: $first, tags: $tags, owners: $owners, sort: HEIGHT_DESC) {
          edges {
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
    `,
    variables: { tags, first: 1, owner: [scriptCurator] },
  });

  const tx = parseQueryResult(result)[0];

  const creatorAddr = tx.node.tags.find((tag) => tag.name === 'Model-Creator')?.value;
  const modelName = tx.node.tags.find((tag) => tag.name === 'Model-Name')?.value;

  if (!creatorAddr) {
    throw new Error('Model creator not found');
  }

  if (!modelName) {
    throw new Error('Model name not found');
  }

  return { creatorAddr, modelName };
};

export const isRegistrationCancelled = async (txid: string, opAddress: string) => {
  const cancelTags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [ PROTOCOL_NAME ],
    },
    { name: OPERATION_NAME_TAG, values: [CANCEL_OPERATION] },
    { name: REGISTRATION_TRANSACTION_TAG, values: [txid] },
  ];

  const { data }: { data: { transactions: ITransactions } } = await clientGateway.query({
    query: gql`
      query QUERY_TX_WITH_OWNERS($owners: [String!], $tags: [TagFilter!]) {
        transactions(owners: $owners, tags: $tags, sort: HEIGHT_DESC, first: 1) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              owner {
                address
                key
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
    variables: { tags: cancelTags, owners: [opAddress] },
  });

  return data.transactions.edges.length > 0;
};

export const queryOperatorRegistrations = async (address: string) => {
  const operatorPaymentInputStr = JSON.stringify({
    function: 'transfer',
    target: VAULT_ADDRESS,
    qty: (parseFloat(OPERATOR_REGISTRATION_AR_FEE) * U_DIVIDER).toString(),
  });

  const operatorPaymentInputNumber = JSON.stringify({
    function: 'transfer',
    target: VAULT_ADDRESS,
    qty: parseFloat(OPERATOR_REGISTRATION_AR_FEE) * U_DIVIDER,
  });
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [ PROTOCOL_NAME ],
    },
    {
      name: OPERATION_NAME_TAG,
      values: ['Operator Registration'],
    },
    {
      name: INPUT_TAG,
      values: [operatorPaymentInputStr, operatorPaymentInputNumber],
    },
    {
      name: CONTRACT_TAG,
      values: [U_CONTRACT_ID],
    },
    {
      name: SEQUENCE_OWNER_TAG,
      values: [address],
    },
  ];

  let hasNextPage = false;
  let registrationTxs: IEdge[] = [];
  do {
    const first = 10;
    const after: string | undefined = hasNextPage
      ? registrationTxs[registrationTxs.length - 1].cursor
      : undefined;

    const { data }: { data: { transactions: ITransactions } } = await clientGateway.query({
      query: gqlQuery,
      variables: { tags, first, after },
    });

    registrationTxs = registrationTxs.concat(data.transactions.edges);
    hasNextPage = data.transactions.pageInfo.hasNextPage;
  } while (hasNextPage);

  return registrationTxs;
};
