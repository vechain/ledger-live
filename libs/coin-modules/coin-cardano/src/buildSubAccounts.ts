import {
  decodeTokenAccountId,
  emptyHistoryCache,
  encodeTokenAccountId,
} from "@ledgerhq/coin-framework/account/index";
import keyBy from "lodash/keyBy";
import groupBy from "lodash/groupBy";
import BigNumber from "bignumber.js";
import { findTokenById } from "@ledgerhq/cryptoassets";
import { utils as TyphonUtils } from "@stricahq/typhonjs";
import type { Account, TokenAccount } from "@ledgerhq/types-live";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { mergeOps } from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { CardanoOperation, CardanoOperationExtra, PaymentCredential, Token } from "./types";
import { getAccountChange, getMemoFromTx, isHexString } from "./logic";
import { APITransaction } from "./api/api-types";

export const getTokenAssetId = ({
  policyId,
  assetName,
}: {
  policyId: string;
  assetName: string;
}): string => `${policyId}${assetName}`;

export const decodeTokenAssetId = (id: string): { policyId: string; assetName: string } => {
  const policyId = id.slice(0, 56);
  const assetName = id.slice(56);
  return { policyId, assetName };
};

const encodeTokenCurrencyId = (parentCurrency: CryptoCurrency, assetId: string): string =>
  `${parentCurrency.id}/native/${assetId}`;

export const decodeTokenCurrencyId = (
  id: string,
): { parentCurrencyId: string; type: string; assetId: string } => {
  const [parentCurrencyId, type, assetId] = id.split("/");
  return {
    parentCurrencyId,
    type,
    assetId,
  };
};

/**
 * @returns operations of tokens that are defined in ledgerjs cryptoassets
 */
const mapTxToTokenAccountOperation = ({
  parentAccountId,
  parentCurrency,
  newTransactions,
  accountCredentialsMap,
}: {
  parentAccountId: string;
  parentCurrency: CryptoCurrency;
  newTransactions: Array<APITransaction>;
  accountCredentialsMap: Record<string, PaymentCredential>;
}): Array<CardanoOperation> => {
  const operations: Array<CardanoOperation> = [];

  newTransactions.forEach(tx => {
    const accountChange = getAccountChange(tx, accountCredentialsMap);
    accountChange.tokens.forEach(token => {
      const assetId = getTokenAssetId({
        policyId: token.policyId,
        assetName: token.assetName,
      });
      const tokenCurrencyId = encodeTokenCurrencyId(parentCurrency, assetId);
      const tokenCurrency = findTokenById(tokenCurrencyId);
      // skip the unsupported tokens by ledger-live
      if (tokenCurrency === null || tokenCurrency === undefined) {
        return;
      }

      const tokenAccountId = encodeTokenAccountId(parentAccountId, tokenCurrency);

      const tokenOperationType = token.amount.lt(0) ? "OUT" : "IN";
      const memo = getMemoFromTx(tx);
      const extra: CardanoOperationExtra = {};
      if (memo) {
        extra.memo = memo;
      }
      const operation: CardanoOperation = {
        accountId: tokenAccountId,
        id: encodeOperationId(tokenAccountId, tx.hash, tokenOperationType),
        hash: tx.hash,
        type: tokenOperationType,
        fee: new BigNumber(tx.fees),
        value: token.amount.absoluteValue(),
        senders: tx.inputs.map(i =>
          isHexString(i.address)
            ? TyphonUtils.getAddressFromHex(Buffer.from(i.address, "hex")).getBech32()
            : i.address,
        ),
        recipients: tx.outputs.map(o =>
          isHexString(o.address)
            ? TyphonUtils.getAddressFromHex(Buffer.from(o.address, "hex")).getBech32()
            : o.address,
        ),
        blockHeight: tx.blockHeight,
        date: new Date(tx.timestamp),
        extra,
        blockHash: undefined,
      };
      operations.push(operation);
    });
  });

  return operations;
};

export function buildSubAccounts({
  initialAccount,
  parentAccountId,
  parentCurrency,
  newTransactions,
  tokens,
  accountCredentialsMap,
}: {
  initialAccount: Account | undefined;
  parentAccountId: string;
  parentCurrency: CryptoCurrency;
  newTransactions: Array<APITransaction>;
  tokens: Array<Token>;
  accountCredentialsMap: Record<string, PaymentCredential>;
}): Array<TokenAccount> {
  const tokenAccountsById: Record<string, TokenAccount> = {};

  if (initialAccount && initialAccount.subAccounts) {
    for (const existingAccount of initialAccount.subAccounts) {
      if (existingAccount.type === "TokenAccount") {
        tokenAccountsById[existingAccount.id] = existingAccount;
      }
    }
  }

  const tokenOperations: Array<CardanoOperation> = mapTxToTokenAccountOperation({
    parentAccountId,
    parentCurrency,
    newTransactions: newTransactions,
    accountCredentialsMap,
  });
  const tokenOperationsByAccId = groupBy(tokenOperations, o => o.accountId);
  const tokensBalanceByAssetId = keyBy(tokens, t => getTokenAssetId(t));
  for (const tokenAccountId in tokenOperationsByAccId) {
    const initialTokenAccount = tokenAccountsById[tokenAccountId];
    const oldOperations = initialTokenAccount?.operations || [];
    const newOperations = tokenOperationsByAccId[tokenAccountId] || [];
    const operations = mergeOps(oldOperations, newOperations);
    const { token: tokenCurrency } = decodeTokenAccountId(tokenAccountId);
    if (tokenCurrency) {
      const accountBalance =
        tokensBalanceByAssetId[tokenCurrency.contractAddress]?.amount || new BigNumber(0);
      const tokenAccount: TokenAccount = {
        type: "TokenAccount",
        id: tokenAccountId,
        parentId: parentAccountId,
        token: tokenCurrency,
        balance: accountBalance,
        spendableBalance: accountBalance,
        creationDate: operations.length > 0 ? operations[operations.length - 1].date : new Date(),
        operationsCount: operations.length,
        operations,
        pendingOperations: [],
        balanceHistoryCache: emptyHistoryCache,
        swapHistory: [],
      };
      tokenAccountsById[tokenAccountId] = tokenAccount;
    }
  }
  return Object.values(tokenAccountsById);
}
