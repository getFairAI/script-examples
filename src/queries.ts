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
  OPERATION_NAME_TAG,
  PROTOCOL_NAME,
  PROTOCOL_NAME_TAG,
  PROTOCOL_VERSION_TAG,
  REGISTRATION_TRANSACTION_TAG,
  REQUEST_TRANSACTION_TAG,
  SOLUTION_TRANSACTION_TAG,
} from './constants';
import { IEdge, ITransactions } from './interfaces';
import CONFIG from '../config.json' assert { type: 'json' };

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
            timestamp
          }
          owner {
            address
          }
        }
      }
    }
  }
`;

const gqlQueryWithOwners = gql`
query FIND_BY_TAGS($tags: [TagFilter!], $first: Int!, $after: String, $owners: [String!]) {
  transactions(tags: $tags, first: $first, after: $after, sort: HEIGHT_DESC, owners: $owners) {
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
        owner {
          address
        }
      }
    }
  }
}
`;

const parseQueryResult = (result: { data: { transactions: ITransactions } }) =>
  result.data.transactions.edges;

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
  solutionTransaction: string,
) => {
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: ['FairAI'],
    },
    {
      name: PROTOCOL_VERSION_TAG,
      values: ['2.0'],
    },
    {
      name: OPERATION_NAME_TAG,
      values: ['Inference Response'],
    },
    {
      name: SOLUTION_TRANSACTION_TAG,
      values: [solutionTransaction],
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

export const isRegistrationCancelled = async (txid: string, opAddress: string) => {
  const cancelTags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: [PROTOCOL_NAME],
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
  const tags = [
    {
      name: PROTOCOL_NAME_TAG,
      values: ['FairAI'],
    },
    {
      name: 'Protocol-Version',
      values: ['2.0'],
    },
    {
      name: OPERATION_NAME_TAG,
      values: ['Operator Registration'],
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
      query: gqlQueryWithOwners,
      variables: { tags, first, after, owners: [ address ] },
    });

    registrationTxs = registrationTxs.concat(data.transactions.edges);
    hasNextPage = data.transactions.pageInfo.hasNextPage;
  } while (hasNextPage);

  return registrationTxs;
};

export const isEvmWalletLinked = async (arweaveAddress: string, evmAddress?: string) => {
   const linkTags = [
    { name: 'Protocol-Name', values: ['FairAI'] },
    { name: 'Protocol-Version', values: ['2.0'] },
    { name: 'Operation-Name', values: ['EVM Wallet Link'] },
  ];
  
  const { data }: { data: { transactions: ITransactions } } = await clientGateway.query({
    query: gqlQueryWithOwners,
    variables: { tags: linkTags, first: 1, owners: [ arweaveAddress ] },
  });

  if (!data || data.transactions.edges.length === 0) {
    return { isLinked: false, blockTimestamp: undefined };
  }

  const foundLink = data.transactions.edges[0];
  const response = await fetch('https://arweave.net/' + foundLink.node.id);
  const evmWallet = await response.text() as `0x${string}`;

  return { isLinked: evmAddress ? evmWallet === evmAddress : !!evmWallet, blockTimestamp: foundLink.node.block?.timestamp, evmWallet };
}