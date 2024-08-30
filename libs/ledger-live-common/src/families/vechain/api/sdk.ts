import network from "@ledgerhq/live-network/network";
import { AccountResponse, VetTxsQuery, TokenTxsQuery, Query, QueryResponse } from "./types";
import type { Operation } from "@ledgerhq/types-live";
import { mapVetTransfersToOperations, mapTokenTransfersToOperations } from "../utils/mapping-utils";
import { padAddress } from "../utils/pad-address";
import { TransferEventSignature } from "../contracts/constants";
import { Transaction } from "thor-devkit";
import { HEX_PREFIX } from "../constants";
import { getEnv } from "@ledgerhq/live-env";
import BigNumber from "bignumber.js";
import { moreThanOrEqual } from "../utils/semantic-version";

const BASE_URL = getEnv("API_VECHAIN_THOREST");

export const getAccount = async (address: string): Promise<AccountResponse> => {
  const { data } = await network({
    method: "GET",
    url: `${BASE_URL}/accounts/${address}`,
  });

  return data;
};

export const getLastBlockHeight = async (): Promise<number> => {
  const { data } = await network({
    method: "GET",
    url: `${BASE_URL}/blocks/best`,
  });

  return data.number;
};


/**
 * Get the revision of the blockchain
 * @returns the revision of the blockchain
 */
export const getRevision = async (): Promise<string> => {
  const { data } = await network({
    method: "GET",
    url: `${BASE_URL}/blocks/best`,
  });


  let revision = "best"

  if (data.headers.get && typeof data.headers.get === "function") {
      const thorVersion = data.headers.get("x-thorest-ver")

      if (
          typeof thorVersion === "string" &&
          moreThanOrEqual(thorVersion, "2.1.3")
      ) {
          revision = "next"
      }
  }

  return revision;
};

/**
 * Get VET operations
 * @param accountId
 * @param addr
 * @param startAt
 * @returns an array of operations
 */
export const getOperations = async (
  accountId: string,
  addr: string,
  startAt: number,
): Promise<Operation[]> => {
  const query: VetTxsQuery = {
    range: {
      unit: "block",
      from: startAt,
    },
    criteriaSet: [{ sender: addr }, { recipient: addr }],
    order: "desc",
  };

  const { data } = await network({
    method: "POST",
    url: `${BASE_URL}/logs/transfer`,
    data: JSON.stringify(query),
  });

  const operations: Operation[] = await mapVetTransfersToOperations(data, accountId, addr);

  return operations;
};

/**
 * Get operations for a fungible token
 * @param accountId
 * @param addr
 * @param tokenAddr - The token address (The VTHO token address is available from constants.ts)
 * @param startAt
 * @returns an array of operations
 */
export const getTokenOperations = async (
  accountId: string,
  addr: string,
  tokenAddr: string,
  startAt: number,
): Promise<Operation[]> => {
  const paddedAddress = padAddress(addr);

  const query: TokenTxsQuery = {
    range: {
      unit: "block",
      from: startAt,
    },
    criteriaSet: [
      {
        address: tokenAddr,
        topic0: TransferEventSignature,
        topic1: paddedAddress,
      },
      {
        address: tokenAddr,
        topic0: TransferEventSignature,
        topic2: paddedAddress,
      },
    ],
    order: "desc",
  };

  const { data } = await network({
    method: "POST",
    url: `${BASE_URL}/logs/event`,
    data: JSON.stringify(query),
  });

  const operations = await mapTokenTransfersToOperations(data, accountId, addr);
  return operations;
};

/**
 * Submit a transaction and return the ID
 * @param tx - The transaction to submit
 * @returns transaction ID
 */
export const submit = async (tx: Transaction): Promise<string> => {
  const encodedRawTx = {
    raw: `${HEX_PREFIX}${tx.encode().toString("hex")}`,
  };

  const { data } = await network({
    method: "POST",
    url: `${BASE_URL}/transactions`,
    data: encodedRawTx,
  });

  // Expect a transaction ID
  if (!data.id) throw Error("Expected an ID to be returned");

  return data.id;
};

/**
 * Query the blockchain to simulate a transaction
 * @param queryData - The query data
 * @returns a result of the query
 */
export const simulateTransaction = async (queryData: Query[]): Promise<QueryResponse[]> => {
  const revision = await getRevision();
  const { data } = await network({
    method: "POST",
    url: `${BASE_URL}/accounts/*?revision=${revision}`,
    data: { clauses: queryData },
  });

  return data;
};

/**
 * Get the block ref to use in a transaction
 * @returns the block ref of head
 */
export const getBlockRef = async (): Promise<string> => {
  const { data } = await network({
    method: "GET",
    url: `${BASE_URL}/blocks/best`,
  });

  return data.id.slice(0, 18);
};

/**
 * Get fees paid for the transaction
 * @param transactionId - the id of the transaction
 * @return the fee paid in VTHO or 0
 */
export const getFees = async (transactionID: string): Promise<BigNumber> => {
  const { data } = await network({
    method: "GET",
    url: `${BASE_URL}/transactions/${transactionID}/receipt`,
    params: { id: transactionID },
  });

  if (!data || !data.paid) return new BigNumber(0);
  return new BigNumber(data.paid);
};
