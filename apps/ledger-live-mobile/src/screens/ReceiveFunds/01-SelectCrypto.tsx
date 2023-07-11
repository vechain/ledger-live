import React, { useCallback, useEffect, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FlatList } from "react-native";
import type { AccountLike, TokenAccount } from "@ledgerhq/types-live";
import type {
  CryptoCurrency,
  CryptoOrTokenCurrency,
  TokenCurrency,
} from "@ledgerhq/types-cryptoassets";
import {
  isCurrencySupported,
  listTokens,
  useCurrenciesByMarketcap,
  listSupportedCurrencies,
  findCryptoCurrencyByKeyword,
} from "@ledgerhq/live-common/currencies/index";

import { Flex, Text } from "@ledgerhq/native-ui";
import { useSelector } from "react-redux";
import { ScreenName } from "../../const";
import { track, TrackScreen } from "../../analytics";
import FilteredSearchBar from "../../components/FilteredSearchBar";
import BigCurrencyRow from "../../components/BigCurrencyRow";
import { flattenAccountsSelector } from "../../reducers/accounts";
import { ReceiveFundsStackParamList } from "../../components/RootNavigator/types/ReceiveFundsNavigator";
import { StackNavigatorProps } from "../../components/RootNavigator/types/helpers";
import { getEnv } from "@ledgerhq/live-common/env";

const SEARCH_KEYS = getEnv("CRYPTO_ASSET_SEARCH_KEYS");

type Props = {
  devMode?: boolean;
} & StackNavigatorProps<ReceiveFundsStackParamList, ScreenName.ReceiveSelectCrypto>;

const keyExtractor = (currency: CryptoCurrency | TokenCurrency) => currency.id;

const renderEmptyList = () => (
  <Flex px={6}>
    <Text textAlign="center">
      <Trans i18nKey="common.noCryptoFound" />
    </Text>
  </Flex>
);

const listSupportedTokens = () => listTokens().filter(t => isCurrencySupported(t.parentCurrency));

const findAccountByCurrency = (accounts: AccountLike[], currency: CryptoCurrency | TokenCurrency) =>
  accounts.filter(
    (acc: AccountLike) =>
      (acc.type === "Account" ? acc.currency?.id : (acc as TokenAccount).token?.id) === currency.id,
  );

export default function AddAccountsSelectCrypto({ navigation, route }: Props) {
  const paramsCurrency = route?.params?.currency;

  const { t } = useTranslation();
  const filterCurrencyIds = useMemo(
    () => route.params?.filterCurrencyIds || [],
    [route.params?.filterCurrencyIds],
  );
  const cryptoCurrencies = useMemo(
    () =>
      (listSupportedCurrencies() as (CryptoCurrency | TokenCurrency)[])
        .concat(listSupportedTokens())
        .filter(({ id }) => filterCurrencyIds.length <= 0 || filterCurrencyIds.includes(id)),
    [filterCurrencyIds],
  );

  const accounts = useSelector(flattenAccountsSelector);

  const sortedCryptoCurrencies = useCurrenciesByMarketcap(cryptoCurrencies);

  const onPressItem = useCallback(
    (currency: CryptoCurrency | TokenCurrency) => {
      track("asset_clicked", {
        asset: currency.name,
        page: "Choose a crypto to secure"
      });

      const accs = findAccountByCurrency(accounts, currency);
      if (accs.length > 0) {
        // if we found one or more accounts of the given currency we select account
        navigation.navigate(ScreenName.ReceiveSelectAccount, {
          currency,
        });
      } else if (currency.type === "TokenCurrency") {
        // cases for token currencies
        const parentAccounts = findAccountByCurrency(accounts, currency.parentCurrency);

        if (parentAccounts.length > 1) {
          // if we found one or more accounts of the parent currency we select account

          navigation.navigate(ScreenName.ReceiveSelectAccount, {
            currency,
            createTokenAccount: true,
          });
        } else if (parentAccounts.length === 1) {
          // if we found only one account of the parent currency we go straight to QR code
          navigation.navigate(ScreenName.ReceiveConfirmation, {
            accountId: parentAccounts[0].id,
            currency,
            createTokenAccount: true,
          });
        } else {
          // if we didn't find any account of the parent currency we add and create one
          navigation.navigate(ScreenName.ReceiveAddAccountSelectDevice, {
            currency: currency.parentCurrency,
            createTokenAccount: true,
          });
        }
      } else {
        // else we create a currency account
        navigation.navigate(ScreenName.ReceiveAddAccountSelectDevice, {
          currency,
        });
      }
    },
    [accounts, navigation],
  );

  useEffect(() => {
    if (paramsCurrency) {
      const selectedCurrency = findCryptoCurrencyByKeyword(paramsCurrency.toUpperCase());

      if (selectedCurrency) {
        onPressItem(selectedCurrency);
      }
    }
  }, [onPressItem, paramsCurrency]);

  const renderList = useCallback(
    (items: CryptoOrTokenCurrency[]) => (
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <BigCurrencyRow currency={item} onPress={onPressItem} subTitle={item.ticker} />
        )}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />
    ),
    [onPressItem],
  );

  return (
    <>
      <TrackScreen category="Receive" name="Choose a crypto to secure" />
      <Text variant="h4" fontWeight="semiBold" mx={6} mb={3} testID="receive-header-step1-title">
        {t("transfer.receive.selectCrypto.title")}
      </Text>
      <FilteredSearchBar
        keys={SEARCH_KEYS}
        inputWrapperStyle={{ marginHorizontal: 16, marginBottom: 8 }}
        list={sortedCryptoCurrencies}
        renderList={renderList}
        renderEmptySearch={renderEmptyList}
        newSearchBar
      />
    </>
  );
}
