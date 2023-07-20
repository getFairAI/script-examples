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
import CONFIG from '../config.json' assert { type: 'json' };
import {
  CONTRACT_TAG,
  INFERENCE_TRANSACTION_TAG,
  INPUT_TAG,
  OPERATION_NAME_TAG,
  OPERATOR_PERCENTAGE_FEE,
  OPERATOR_REGISTRATION_AR_FEE,
  REQUEST_TRANSACTION_TAG,
  SCRIPT_CURATOR_TAG,
  SCRIPT_NAME_TAG,
  SCRIPT_OPERATOR_TAG,
  SEQUENCE_OWNER_TAG,
  U_CONTRACT_ID,
  U_DIVIDER,
  VAULT_ADDRESS,
} from './constants';
import { ITransactions } from './interfaces';

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

export const queryTransactionsReceived = async (address: string, opFee: number, after?: string) => {
  const feeShare = opFee * OPERATOR_PERCENTAGE_FEE;

  const paymentInput = JSON.stringify({
    function: 'transfer',
    target: address,
    qty: feeShare.toString(),
  });

  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Inference Payment'],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [CONFIG.scriptCurator],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [CONFIG.scriptName],
    },
    {
      name: INPUT_TAG,
      values: [paymentInput],
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

  return {
    requestTxs: parseQueryResult(result),
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
export const queryTransactionAnswered = async (transactionId: string, address: string) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Script Inference Response'],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [CONFIG.scriptCurator],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [CONFIG.scriptName],
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
) => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Inference Payment'],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [CONFIG.scriptCurator],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [CONFIG.scriptName],
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

export const queryOperatorFee = async (address: string) => {
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
      name: OPERATION_NAME_TAG,
      values: ['Operator Registration'],
    },
    {
      name: SCRIPT_CURATOR_TAG,
      values: [CONFIG.scriptCurator],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [CONFIG.scriptName],
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

  const result = await clientGateway.query({
    query: gqlQuery,
    variables: { tags, first: 1 },
  });

  return parseQueryResult(result);
};

export const getModelOwner = async () => {
  const tags = [
    {
      name: OPERATION_NAME_TAG,
      values: ['Script Creation'],
    },
    {
      name: SCRIPT_NAME_TAG,
      values: [CONFIG.scriptName],
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
    variables: { tags, first: 1, owner: [CONFIG.scriptCurator] },
  });

  const tx = parseQueryResult(result)[0];

  const creatorAddr = tx.node.tags.find((tag) => tag.name === 'Model-Creator')?.value;

  if (!creatorAddr) {
    throw new Error('Model creator not found');
  }

  return creatorAddr;
};
