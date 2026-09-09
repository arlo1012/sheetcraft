import { CURRENCY_LOCALE_PRESETS } from "./currency-locales";

export type CurrencySymbolChoice = Readonly<{
  currency: string;
  currencySymbol?: string;
  locale?: string;
}>;

export type CurrencySymbolOption = Readonly<{
  value: string;
  label: string;
  symbol: string;
  choice: CurrencySymbolChoice;
}>;

// Match Core's existing ISO-only formats when reopening an untouched document.
const LEGACY_CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  AUD: "A$",
  CAD: "CA$",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  JPY: "¥",
  KRW: "₩",
  SGD: "S$",
  TWD: "NT$",
  USD: "$",
};

export function getCurrencyChoiceValue(choice: CurrencySymbolChoice): string {
  return !choice.currency || (!choice.currencySymbol && !choice.locale)
    ? choice.currency
    : JSON.stringify([choice.currency, choice.currencySymbol ?? null, choice.locale ?? null]);
}

export function getCurrencySymbolDisplay(choice: CurrencySymbolChoice, noneLabel: string): string {
  return !choice.currency
    ? noneLabel
    : (choice.currencySymbol ?? LEGACY_CURRENCY_SYMBOLS[choice.currency] ?? choice.currency);
}

export function getCurrencySymbolOptions(
  displayLocale: string,
  noneLabel: string,
  current: CurrencySymbolChoice,
): CurrencySymbolOption[] {
  const names = new Intl.DisplayNames([displayLocale], {
    type: "language",
    languageDisplay: "standard",
  });
  const collator = new Intl.Collator(displayLocale);
  const makeOption = (choice: CurrencySymbolChoice, showLocale = true): CurrencySymbolOption => {
    const symbol = getCurrencySymbolDisplay(choice, noneLabel);
    return {
      value: getCurrencyChoiceValue(choice),
      label:
        showLocale && choice.locale
          ? `${symbol} ${names.of(choice.locale) ?? choice.locale}`
          : symbol,
      symbol,
      choice,
    };
  };
  const common = [
    { currency: "" },
    { currency: "CNY" },
    { currency: "EUR" },
    { currency: "USD" },
    { currency: "USD", currencySymbol: "US$", locale: "en-US" },
  ].map((choice) => makeOption(choice, false));
  const regional = CURRENCY_LOCALE_PRESETS.map(({ currency, symbol, locale }) =>
    makeOption({ currency, currencySymbol: symbol, locale }),
  ).sort((left, right) => {
    if (left.symbol !== right.symbol) return left.symbol < right.symbol ? -1 : 1;
    return collator.compare(left.label, right.label);
  });
  const selectedValue = getCurrencyChoiceValue(current);
  // Retain an imported symbol or locale even when it is outside this catalog.
  if (![...common, ...regional].some(({ value }) => value === selectedValue)) {
    common.push(makeOption(current));
  }
  return [...common, ...regional];
}
