import type { CellNumberFormat } from "@sheetcraft/core/style";
import type { ChartValueAxisDraftError } from "./chart-format-pane";
import type { MessageKey } from "../../shared/i18n";
import type { NumericFieldSpec } from "../../shared/numeric-field/types";

export const chartAxisBoundSpec: NumericFieldSpec = {
  displayStep: 1,
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartAxisUnitSpec: NumericFieldSpec = {
  ...chartAxisBoundSpec,
  canonicalBounds: { min: 0, minExclusive: true },
};

export const chartFontSizeSpec: NumericFieldSpec = {
  displayUnit: "px",
  displayStep: 1,
  canonicalBounds: { min: 1, max: 256 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartLegendFontSizeSpec: NumericFieldSpec = {
  ...chartFontSizeSpec,
  displayUnit: "pt",
  toDisplay: (value) => value * 0.75,
  fromDisplay: (value) => (value * 4) / 3,
  displayStep: 1,
};

export const chartStrokeWidthSpec: NumericFieldSpec = {
  displayUnit: "px",
  displayStep: 0.25,
  canonicalBounds: { min: 0, max: 32 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartMarkerSizePtSpec: NumericFieldSpec = {
  displayUnit: "pt",
  displayStep: 1,
  canonicalBounds: { min: 2, max: 72 },
  integer: true,
  allowAuto: true,
};

export const chartLegendStrokeWidthSpec: NumericFieldSpec = {
  ...chartStrokeWidthSpec,
  displayUnit: "pt",
  toDisplay: (value) => value * 0.75,
  fromDisplay: (value) => (value * 4) / 3,
  displayPrecision: 2,
};

export const chartLabelAngleSpec: NumericFieldSpec = {
  displayUnit: "°",
  displayStep: 1,
  canonicalBounds: { min: -90, max: 90 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartGapWidthSpec: NumericFieldSpec = {
  displayUnit: "%",
  displayStep: 1,
  canonicalBounds: { min: 0, max: 500 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartOverlapSpec: NumericFieldSpec = {
  displayUnit: "%",
  displayStep: 1,
  canonicalBounds: { min: -100, max: 100 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};

export const chartDecimalsSpec: NumericFieldSpec = {
  displayStep: 1,
  canonicalBounds: { min: 0, max: 20 },
  integer: true,
};

export const chartAxisDraftErrorKeys: Record<ChartValueAxisDraftError, MessageKey> = {
  number: "chart.formatInvalidNumber",
  bounds: "chart.formatAxisBoundsOrder",
  positiveUnit: "chart.formatAxisPositiveUnit",
  minorTooLarge: "chart.formatAxisMinorTooLarge",
  divisionLimit: "chart.formatAxisDivisionLimit",
  unevenDivision: "chart.formatAxisUnevenDivision",
};

export type ChartNumberCategory = CellNumberFormat["kind"] | "general";

export const chartNumberCategoryKeys: Record<ChartNumberCategory, MessageKey> = {
  general: "cellFormat.general",
  number: "cellFormat.numeric",
  currency: "cellFormat.currency",
  accounting: "cellFormat.accounting",
  date: "cellFormat.date",
  time: "cellFormat.time",
  percent: "cellFormat.percent",
  fraction: "cellFormat.fraction",
  scientific: "cellFormat.scientific",
  text: "cellFormat.text",
  special: "cellFormat.special",
  custom: "cellFormat.custom",
};

export function createDefaultChartNumberFormat(
  category: ChartNumberCategory,
  locale: string,
  ordinaryPrimaryValueAxis: boolean,
): CellNumberFormat | undefined {
  const currency = locale === "zh-CN" ? "CNY" : "USD";
  switch (category) {
    case "general":
      return ordinaryPrimaryValueAxis ? { kind: "custom", code: "General" } : undefined;
    case "number":
      return { kind: "number", fractionDigits: 2 };
    case "percent":
      return { kind: "percent", fractionDigits: 2 };
    case "scientific":
      return { kind: "scientific", fractionDigits: 2 };
    case "currency":
      return { kind: "currency", currency, fractionDigits: 2 };
    case "accounting":
      return { kind: "accounting", currency, fractionDigits: 2 };
    case "date":
      return { kind: "date", code: "yyyy-mm-dd" };
    case "time":
      return { kind: "time", code: "hh:mm:ss" };
    case "fraction":
      return { kind: "fraction", code: "# ?/?" };
    case "text":
      return { kind: "text" };
    case "special":
      return { kind: "special", code: "00000" };
    case "custom":
      return { kind: "custom", code: "0.00" };
  }
}
