import { NUMBER_FORMAT_LOCALES } from "@sheetcraft/core/number-format";

/**
 * Currency choices derived from NUMBER_FORMAT_LOCALES, whose current tender
 * currency comes from Unicode CLDR supplemental currencyData. Symbols use the
 * platform Intl implementation rather than a maintained second symbol table,
 * so the output follows the user's browser/ICU locale data.
 */
export const CURRENCY_LOCALE_PRESETS = Object.freeze(
  NUMBER_FORMAT_LOCALES.flatMap((entry) => {
    if (!entry.currency) return [];
    const symbol = getNarrowCurrencySymbol(entry.locale, entry.currency);
    return symbol ? [{ locale: entry.locale, currency: entry.currency, symbol }] : [];
  }),
) satisfies readonly { locale: string; currency: string; symbol: string }[];

function getNarrowCurrencySymbol(locale: string, currency: string): string | undefined {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value;
  } catch {
    // Omit locales unavailable in the browser's Intl implementation. The core
    // LCID table remains the authoritative import/export lookup.
    return undefined;
  }
}
