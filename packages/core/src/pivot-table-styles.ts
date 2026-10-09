import type { Workbook } from "./workbook.js";
import type { SheetPivotTable } from "./pivot-tables.js";
import { createThemedTableStyles } from "./table-styles.js";
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

/** The same report definition drives Core cells and native XLSX styles. */
export function resolvePivotTableStyle(
  workbook: Pick<Workbook, "pivotTableStyles" | "defaultPivotTableStyleId">,
  table: Pick<SheetPivotTable, "styleId" | "reportLayout">,
): PivotTableStyleDefinition {
  const customStyle = (workbook.pivotTableStyles ?? []).find(
    (style) => style.id === (table.styleId ?? workbook.defaultPivotTableStyleId),
  );
  const styles = createThemedTableStyles();
  const style: PivotTableStyleDefinition =
    customStyle ??
    styles.find((style) => style.id === table.styleId) ??
    (table.reportLayout ? DEFAULT_PIVOT_TABLE_STYLE : styles[0]!);
  return style === DEFAULT_PIVOT_TABLE_STYLE && table.reportLayout
    ? {
        ...style,
        elements: {
          ...style.elements,
          headerRow: {
            style: {
              ...style.elements.headerRow!.style,
              fillColor: table.reportLayout.fillColor ?? style.elements.headerRow!.style.fillColor,
              borderBottom: {
                style: "thin" as const,
                color: table.reportLayout.borderColor ?? "#8db4e2",
              },
            },
          },
          totalRow: {
            style: {
              ...style.elements.totalRow!.style,
              fillColor: table.reportLayout.fillColor ?? style.elements.totalRow!.style.fillColor,
              borderTop: {
                style: "thin" as const,
                color: table.reportLayout.borderColor ?? "#8db4e2",
              },
            },
          },
          pageFieldLabels: {
            style: {
              ...style.elements.pageFieldLabels!.style,
              fillColor:
                table.reportLayout.fillColor ?? style.elements.pageFieldLabels!.style.fillColor,
            },
          },
          pageFieldValues: {
            style: {
              ...style.elements.pageFieldValues!.style,
              fillColor:
                table.reportLayout.fillColor ?? style.elements.pageFieldValues!.style.fillColor,
            },
          },
        },
      }
    : style;
}
