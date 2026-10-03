import type { TableStyleElementFormat } from "./table-styles.js";

export const PIVOT_TABLE_STYLE_ELEMENTS = [
  "wholeTable",
  "firstColumn",
  "headerRow",
  "totalRow",
  "lastColumn",
  "firstRowStripe",
  "secondRowStripe",
  "firstColumnStripe",
  "secondColumnStripe",
  "firstColumnSubheading",
  "secondColumnSubheading",
  "thirdColumnSubheading",
  "firstRowSubheading",
  "secondRowSubheading",
  "thirdRowSubheading",
  "firstSubtotalRow",
  "secondSubtotalRow",
  "thirdSubtotalRow",
  "firstSubtotalColumn",
  "secondSubtotalColumn",
  "thirdSubtotalColumn",
  "blankRow",
  "firstHeaderCell",
  "pageFieldLabels",
  "pageFieldValues",
] as const;
export type PivotTableStyleElement = (typeof PIVOT_TABLE_STYLE_ELEMENTS)[number];
export type PivotTableStyleDefinition = {
  id: string;
  name: string;
  category: "light" | "medium" | "dark" | "custom";
  accentColor?: string;
  elements: Partial<Record<PivotTableStyleElement, TableStyleElementFormat>>;
};
export function clonePivotTableStyleDefinition(
  style: PivotTableStyleDefinition,
): PivotTableStyleDefinition {
  return JSON.parse(JSON.stringify(style)) as PivotTableStyleDefinition;
}
