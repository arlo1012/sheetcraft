import {
  formatCellNumberValue,
  getNumberFormatLocaleId,
  toCellNumberFormatCode,
} from "@idea10/core/number-format";
import type { CellNumberFormat } from "@idea10/core/style";
import type { MessageKey } from "../../../shared/i18n";
import { getDateFormatPresets } from "./date-presets";

export type NumberFormatCategory = "general" | CellNumberFormat["kind"];
export type NumberFormatPreset = Readonly<{
  id?: string;
  code: string;
  label: string;
  aliasIds?: readonly string[];
}>;
type Translate = (key: MessageKey) => string;

export const NUMBER_FORMAT_CATEGORY_ORDER: readonly NumberFormatCategory[] = [
  "general",
  "number",
  "currency",
  "accounting",
  "date",
  "time",
  "percent",
  "fraction",
  "scientific",
  "text",
  "special",
  "custom",
];

export const NUMBER_FORMAT_DESCRIPTION_KEYS: Record<NumberFormatCategory, MessageKey> = {
  general: "cellFormat.generalDescription",
  number: "cellFormat.numericDescription",
  currency: "cellFormat.currencyDescription",
  accounting: "cellFormat.accountingDescription",
  date: "cellFormat.dateDescription",
  time: "cellFormat.timeDescription",
  percent: "cellFormat.percentDescription",
  fraction: "cellFormat.fractionDescription",
  scientific: "cellFormat.scientificDescription",
  text: "cellFormat.textDescription",
  special: "cellFormat.specialDescription",
  custom: "cellFormat.customDescription",
};

const TIME_CODES = [
  "h:mm:ss",
  "h:mm",
  "h:mm AM/PM",
  "h:mm:ss AM/PM",
  "hh:mm:ss",
  "[h]:mm:ss",
  "mm:ss",
  "mm:ss.0",
];
const CHINESE_TIME_CODES = [
  "h:mm:ss",
  "h:mm",
  "h:mm AM/PM",
  "h:mm:ss AM/PM",
  'h"时"mm"分"',
  'h"时"mm"分"ss"秒"',
  "[h]:mm:ss",
  "mm:ss",
  "mm:ss.0",
];
const FRACTION_PRESETS: ReadonlyArray<readonly [string, MessageKey]> = [
  ["# ?/?", "cellFormat.fractionOneDigit"],
  ["# ??/??", "cellFormat.fractionTwoDigits"],
  ["# ???/???", "cellFormat.fractionThreeDigits"],
  ["# ?/2", "cellFormat.fractionHalves"],
  ["# ?/4", "cellFormat.fractionQuarters"],
  ["# ?/8", "cellFormat.fractionEighths"],
  ["# ??/16", "cellFormat.fractionSixteenths"],
  ["# ?/10", "cellFormat.fractionTenths"],
  ["# ??/100", "cellFormat.fractionHundredths"],
];

export function getNumberFormatPresets(
  category: NumberFormatCategory,
  region: string,
  t: Translate,
): NumberFormatPreset[] {
  const chinese = region.toLowerCase().startsWith("zh");
  if (category === "date") return getDateFormatPresets(region);
  if (category === "time") {
    const codes = chinese ? CHINESE_TIME_CODES : TIME_CODES;
    // The type list always uses the same civil date and time, independent of the selected cell.
    const sample = (13 * 3600 + 30 * 60 + 55) / 86400;
    const localeId = getNumberFormatLocaleId(region);
    return codes.map((presetCode) => {
      // Carry the chosen region into XLSX, where application locale metadata is absent.
      const code =
        /\[\$[^\]]*-[\da-f]+\]/i.test(presetCode) || !localeId
          ? presetCode
          : `[$-${localeId}]${presetCode}`;
      try {
        return {
          code,
          label: formatCellNumberValue(sample, { kind: category, code, locale: region }).text,
        };
      } catch {
        return { code, label: code };
      }
    });
  }
  if (category === "fraction")
    return FRACTION_PRESETS.map(([code, label]) => ({ code, label: t(label) }));
  if (category === "special") {
    return chinese
      ? [
          { code: "000000", label: t("cellFormat.postalCode") },
          { code: "[DBNum1][$-804]General", label: t("cellFormat.chineseLower") },
          { code: "[DBNum2][$-804]General", label: t("cellFormat.chineseUpper") },
        ]
      : [{ code: "00000", label: t("cellFormat.postalCode") }];
  }
  return [];
}

export function getCustomFormatPresets(region: string): string[] {
  const currency = region.toLowerCase().startsWith("zh") ? "CNY" : "USD";
  return [
    "General",
    "0",
    "0.00",
    "#,##0",
    "#,##0.00",
    toCellNumberFormatCode({ kind: "accounting", currency, fractionDigits: 0 }),
    toCellNumberFormatCode({ kind: "accounting", currency, fractionDigits: 2 }),
    "#,##0;-#,##0",
    "#,##0;[Red]-#,##0",
    "#,##0.00;-#,##0.00",
    "#,##0.00;[Red]-#,##0.00",
    "0%",
    "0.00%",
    "0.00E+00",
    "# ?/?",
    "# ??/??",
    "yyyy/m/d",
    "yyyy-mm-dd",
    "h:mm",
    "h:mm:ss",
    "h:mm AM/PM",
    "[h]:mm:ss",
    "@",
    "000000",
  ];
}
