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

/** Default report formatting keeps empty intersections clear of worksheet gridlines. */
export const DEFAULT_PIVOT_TABLE_STYLE: PivotTableStyleDefinition = {
  id: "pivot-default",
  name: "Pivot default",
  category: "light",
  elements: {
    wholeTable: { style: { fillColor: "#ffffff", textColor: "#000000", bold: false } },
    headerRow: {
      style: {
        fillColor: "#dce6f1",
        bold: true,
        borderBottom: { style: "thin", color: "#8db4e2" },
      },
    },
    totalRow: {
      style: {
        fillColor: "#dce6f1",
        bold: true,
        borderTop: { style: "thin", color: "#8db4e2" },
      },
    },
    lastColumn: { style: { bold: true } },
    pageFieldLabels: { style: { fillColor: "#dce6f1", textColor: "#000000" } },
    pageFieldValues: { style: { fillColor: "#dce6f1", textColor: "#000000" } },
  },
};
export function clonePivotTableStyleDefinition(
  style: PivotTableStyleDefinition,
): PivotTableStyleDefinition {
  return JSON.parse(JSON.stringify(style)) as PivotTableStyleDefinition;
}
