import { DEFAULT_GAS_COEFFICIENT, HEX_PREFIX } from "../constants";
import crypto from "crypto";
import BigNumber from "bignumber.js";
import { Transaction as ThorTransaction } from "thor-devkit";
import params from "../contracts/abis/params";
import { BASE_GAS_PRICE_KEY, PARAMS_ADDRESS } from "../contracts/constants";
import { Query } from "../api/types";
import { simulateTransaction } from "../api/sdk";
import { Account, TokenAccount } from "@ledgerhq/types-live";
import { Transaction, TransactionInfo } from "../types";
import { isValid } from "./address-utils";
import { calculateClausesVet, calculateClausesVtho } from "../logic";
import { ImpossibleToCalculateAmountAndFees } from "../errors";

/**
 * Generate a Unique ID to be used as a nonce
 * @returns a unique string
 */
export const generateNonce = (): string => {
  const randBuffer = crypto.randomBytes(Math.ceil(4));
  if (!randBuffer) throw Error("Failed to generate random hex");
  return `${HEX_PREFIX}${randBuffer.toString("hex").substring(0, 8)}`;
};

/**
 * Estimate the gas that will be used by the transaction.
 * @param transaction - The transaction to estimate the gas for
 * @param caller - The caller of the transaction
 * @returns an estimate of the gas usage
 */
export const estimateGas = async ({
  transaction,
  caller,
}: {
  caller?: string;
  transaction: Transaction;
}): Promise<number> => {
  // estimate intrinsic gas (bytes submitted to the network):
  // The base fee for a transaction is 5000.
  // Each clause in the transaction incurs a cost of 16000.
  // Zero bytes in the transaction cost 4 each.
  // Non-zero bytes in the transaction cost 68 each.
  const intrinsicGas = ThorTransaction.intrinsicGas(transaction.body.clauses);

  // prepare clauses to simulate the transaction
  const formattedClauses = transaction.body.clauses.map(item => ({
    to: item.to as string,
    value: item.value || "0x0",
    data: item.data || "0x",
  }));

  // simulate transaction
  const simulatedTransaction = await simulateTransaction({ clauses: formattedClauses, caller });

  // calculate gas used from the simulated transaction
  const executionGas = simulatedTransaction.reduce((sum, out) => sum + out.gasUsed, 0);

  // there is a fee used for invoking the VM of 15000
  const VM_FEE = 15000;

  // sum intrinsic gas and execution gas to get the total gas used, add VM_FEE if execution gas is present
  return intrinsicGas + (executionGas ? executionGas + VM_FEE : 0);
};

const getBaseGasPrice = async (): Promise<string> => {
  const queryData: Query = {
    to: PARAMS_ADDRESS,
    data: params.get.encode(BASE_GAS_PRICE_KEY),
  };

  const response = await simulateTransaction({ clauses: [queryData] });

  // Expect 1 value
  if (response && response.length != 1) throw Error("Unexpected response received for query");

  return response[0].data;
};

/**
 * Calculate the fee in VTHO
 * @param gas - the gas used
 * @param gasPriceCoef - the gas price coefficient
 * @returns the fee in VTHO
 */
export const calculateFee = async (gas: BigNumber, gasPriceCoef: number): Promise<BigNumber> => {
  const baseGasPrice = await getBaseGasPrice();
  return new BigNumber(baseGasPrice).times(gasPriceCoef).idiv(255).plus(baseGasPrice).times(gas);
};

// Here there is a circular dependency between values, that is why we need the do-while loop
// dependencies are:
// useAllAmount: USER
// amount: useAllAmount & spendableBalance
// fees: amount
// spendableBalance: fees & balance
// balance: USER
// circular dependency is:
// amount -> spendableBalance -> fees -> amount

export const calculateTransactionInfo = async (
  account: Account,
  transaction: Transaction,
  fixedMaxTokenFees?: {
    estimatedGas: number;
    estimatedGasFees: BigNumber;
  },
): Promise<TransactionInfo> => {
  const { subAccounts } = account;
  const { amount: oldAmount, subAccountId, useAllAmount } = transaction;

  const tokenAccount =
    subAccountId && subAccounts
      ? (subAccounts.find(subAccount => {
          return subAccount.id === subAccountId;
        }) as TokenAccount)
      : undefined;
  const isTokenAccount = !!tokenAccount;

  let amount = oldAmount;
  let amountBackup;
  let tempTransaction = { ...transaction, amount };
  let balance = account.balance;
  let spendableBalance = account.balance;
  let maxEstimatedGasFees = new BigNumber(0);
  let maxEstimatedGas = 0;

  if (!amount.isNaN()) {
    const MAX_ITERATIONS = 5; // it should never reach more than 2 iterations, but just in case
    let iterations = 0;
    do {
      amountBackup = amount;

      const estimatedGasAndFees =
        fixedMaxTokenFees ||
        (await calculateGasFees({
          transaction: tempTransaction,
          isTokenAccount,
          caller: account.freshAddress,
        }));

      maxEstimatedGasFees = estimatedGasAndFees.estimatedGasFees;
      maxEstimatedGas = estimatedGasAndFees.estimatedGas;

      if (isTokenAccount && tokenAccount) {
        balance = tokenAccount.balance;
        spendableBalance = tokenAccount.balance.minus(maxEstimatedGasFees).gt(0)
          ? tokenAccount.balance.minus(maxEstimatedGasFees)
          : new BigNumber(0);
      } else {
        balance = account.balance;
        spendableBalance = account.balance;
      }

      amount = useAllAmount ? spendableBalance : oldAmount;

      tempTransaction = {
        ...tempTransaction,
        amount,
      };
      iterations++;
    } while (!amountBackup.isEqualTo(amount) && iterations < MAX_ITERATIONS);
    if (iterations === MAX_ITERATIONS) {
      throw new ImpossibleToCalculateAmountAndFees();
    }
  }

  return {
    isTokenAccount,
    amount,
    spendableBalance,
    balance,
    tokenAccount,
    estimatedFees: maxEstimatedGasFees.toString(),
    estimatedGas: maxEstimatedGas,
  };
};

/**
 * This function is used to calculate the gas fees for a transaction
 * @param transaction - The transaction to calculate the gas fees for
 * @param isTokenAccount - Whether the account is a token account
 * @returns the estimated gas and gas fees
 */
export const calculateGasFees = async ({
  transaction,
  isTokenAccount,
  caller,
}: {
  transaction: Transaction;
  isTokenAccount: boolean;
  caller?: string;
}): Promise<{
  estimatedGas: number;
  estimatedGasFees: BigNumber;
}> => {
  // check if the recipient is valid
  if (transaction.recipient && isValid(transaction.recipient)) {
    // calculate the clauses for the transaction
    let clauses;
    if (isTokenAccount) {
      clauses = await calculateClausesVtho(transaction.recipient, transaction.amount);
    } else {
      clauses = await calculateClausesVet(transaction.recipient, transaction.amount);
    }

    // estimate gas based on the clauses
    // bytes sent (intrinsic gas) + bytes changed (simulated used gas) + VM_FEE (15000 to call the VM)
    const estimatedGas = await estimateGas({
      transaction: {
        ...transaction,
        body: { ...transaction.body, clauses: clauses },
      },
      caller,
    });

    // calculate the fees based on the estimated gas and the gas price coefficient
    const estimatedGasFees = await calculateFee(
      new BigNumber(estimatedGas),
      transaction.body.gasPriceCoef || DEFAULT_GAS_COEFFICIENT,
    );

    return {
      estimatedGas,
      estimatedGasFees,
    };
  }
  //
  return {
    estimatedGas: 0,
    estimatedGasFees: new BigNumber(0),
  };
};
