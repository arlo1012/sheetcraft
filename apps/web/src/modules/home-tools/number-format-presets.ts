import type { CellNumberFormat } from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import { getDateFormatPresets } from "../../shared/number-format/date-presets";

/** The concise set exposed by the Home ribbon, modelled after Excel's list. */
export const NUMBER_FORMAT_PRESET_CHOICES = [
  "general",
  "number",
  "currency",
  "accounting",
  "shortDate",
  "longDate",
  "time",
  "percent",
  "fraction",
  "scientific",
  "text",
] as const;

export type NumberFormatPresetChoice = (typeof NUMBER_FORMAT_PRESET_CHOICES)[number];

type NumberFormatState = SelectionCellStyleState["numberFormat"];

function defaultCurrency(locale: string): "CNY" | "USD" {
  return locale.toLowerCase().startsWith("zh") ? "CNY" : "USD";
}

function currencyFields(state: NumberFormatState, locale: string) {
  const current = state.mixed ? undefined : state.value;
  if (current && (current.kind === "currency" || current.kind === "accounting")) {
    return {
      currency: current.currency,
      ...(current.currencySymbol === undefined ? {} : { currencySymbol: current.currencySymbol }),
    };
  }
  return { currency: defaultCurrency(locale) };
}

function dateCode(locale: string, id: "date-short" | "date-long"): string {
  return getDateFormatPresets(locale).find((preset) => preset.id === id)?.code ?? "yyyy-mm-dd";
}

function dateCodesMatch(left: string, right: string): boolean {
  // Existing workbooks can omit an LCID prefix while ribbon presets include
  // one. The visible date pattern is still the same short or long choice.
  const withoutLocalePrefix = (code: string) => code.replace(/^\[\$-[\da-f]+\]/i, "");
  return withoutLocalePrefix(left) === withoutLocalePrefix(right);
}

/**
 * Returns the semantic cell number format for a Home ribbon preset.
 * `undefined` represents Excel's General format and must be applied as a
 * `numberFormat: null` style patch by the caller.
 */
export function createNumberFormatPreset(
  choice: NumberFormatPresetChoice,
  state: NumberFormatState,
  locale: string,
): CellNumberFormat | undefined {
  switch (choice) {
    case "general":
      return undefined;
    case "number":
      return { kind: "number", fractionDigits: 2 };
    case "currency":
      return { kind: "currency", ...currencyFields(state, locale), fractionDigits: 2 };
    case "accounting":
      return { kind: "accounting", ...currencyFields(state, locale), fractionDigits: 2 };
    case "shortDate":
      return { kind: "date", code: dateCode(locale, "date-short"), locale };
    case "longDate":
      return { kind: "date", code: dateCode(locale, "date-long"), locale };
    case "time":
      return { kind: "time", code: "h:mm", locale };
    case "percent":
      return { kind: "percent", fractionDigits: 0 };
    case "fraction":
      return { kind: "fraction", code: "# ?/?", locale };
    case "scientific":
      return { kind: "scientific", fractionDigits: 2 };
    case "text":
      return { kind: "text" };
  }
}

/** Matches the selected semantic preset without treating a mixed selection as uniform. */
export function isNumberFormatPresetSelected(
  choice: NumberFormatPresetChoice,
  state: NumberFormatState,
  locale: string,
): boolean {
  if (state.mixed) return false;
  const current = state.value;
  const preset = createNumberFormatPreset(choice, state, locale);
  if (!current || !preset) return !current && !preset;
  if (current.kind !== preset.kind) return false;
  if (current.kind === "date" && preset.kind === "date")
    return dateCodesMatch(current.code, preset.code);
  return true;
}
