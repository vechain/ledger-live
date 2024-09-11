import BigNumber from "bignumber.js";
import { AccountBridge } from "@ledgerhq/types-live";
import { calculateGasFees } from "./utils/transaction-utils";
import type { Transaction } from "./types";

/**
 * Estimate the maximum amount that can be spent from an account
 */
export const estimateMaxSpendable: AccountBridge<Transaction>["estimateMaxSpendable"] = async ({
  account,
  transaction,
  parentAccount
}): Promise<BigNumber> => {
  if (account.type === "Account" || !transaction) {
    return account.balance;
  }

  const { estimatedGasFees: maxTokenFees } = await calculateGasFees({
    transaction, 
    isTokenAccount: true,
    caller: parentAccount?.freshAddress
  });
  const spendable = account.balance.minus(maxTokenFees);
  if (spendable.gt(0)) return account.balance.minus(maxTokenFees);
  return new BigNumber(0);
};
