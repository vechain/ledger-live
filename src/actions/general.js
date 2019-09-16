// @flow

import type { BigNumber } from "bignumber.js";
import { createSelector } from "reselect";
import type { Currency } from "@ledgerhq/live-common/lib/types";
import {
  nestedSortAccounts,
  flattenSortAccounts,
  sortAccountsComparatorFromOrder,
} from "@ledgerhq/live-common/lib/account";
import type { State } from "../reducers";
import CounterValues from "../countervalues";
import {
  intermediaryCurrency,
  counterValueCurrencySelector,
  exchangeSettingsForPairSelector,
  orderAccountsSelector,
} from "../reducers/settings";
import { accountsSelector } from "../reducers/accounts";
import { flushAll } from "../components/DBSave";
import clearLibcore from "../helpers/clearLibcore";

export const calculateCountervalueSelector = (state: State) => {
  const counterValueCurrency = counterValueCurrencySelector(state);
  return (currency: Currency, value: BigNumber): ?BigNumber => {
    const intermediary = intermediaryCurrency(currency, counterValueCurrency);
    const fromExchange = exchangeSettingsForPairSelector(state, {
      from: currency,
      to: intermediary,
    });
    const toExchange = exchangeSettingsForPairSelector(state, {
      from: intermediary,
      to: counterValueCurrency,
    });
    return CounterValues.calculateWithIntermediarySelector(state, {
      from: currency,
      fromExchange,
      intermediary,
      toExchange,
      to: counterValueCurrency,
      value,
      disableRounding: true,
    });
  };
};

// $FlowFixMe go home you're drunk (works on desktop)
export const sortAccountsComparatorSelector = createSelector(
  orderAccountsSelector,
  calculateCountervalueSelector,
  sortAccountsComparatorFromOrder,
);

const nestedSortAccountsSelector = createSelector(
  accountsSelector,
  sortAccountsComparatorSelector,
  nestedSortAccounts,
);

// $FlowFixMe go home you're drunk (works on desktop)
export const flattenSortAccountsSelector = createSelector(
  accountsSelector,
  sortAccountsComparatorSelector,
  flattenSortAccounts,
);

export const refreshAccountsOrdering = () => (dispatch: *, getState: *) => {
  dispatch({
    type: "SET_ACCOUNTS",
    payload: nestedSortAccountsSelector(getState()),
  });
};

export const cleanCache = () => async (dispatch: *) => {
  dispatch({ type: "CLEAN_CACHE" });
  dispatch({ type: "LEDGER_CV:WIPE" });

  await clearLibcore();

  flushAll();
};
