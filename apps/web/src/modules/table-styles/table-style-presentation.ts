import {
  hasHighlightedFirstColumn,
  resolveTableCellStyle,
  type TableStyleDefinition,
  type TableStyleElement,
} from "@sheetcraft/core/table-styles";
import type { CSSProperties } from "vue";
import type {
  PivotTableStyleDefinition,
  PivotTableStyleElement,
} from "@sheetcraft/core/pivot-table-styles";
import { mergeCellStyle, type CellStyle } from "@sheetcraft/core/style";
import { getCellFillStyle } from "../../shared/cell-fill/fill-presentation";
import { getCellTextDecorationStyle } from "../../shared/cell-text/font-presentation";

export const TABLE_STYLE_THEME_COLORS = [
  "#000000",
  "#4f81bd",
  "#c0504d",
  "#9bbb59",
  "#8064a2",
  "#4bacc6",
  "#f79646",
] as const;

export type TableStylePreviewCell = {
  row: number;
  column: number;
  style?: CellStyle;
};

const PREVIEW_TABLE = {
  range: { start: { row: 0, column: 0 }, end: { row: 6, column: 4 } },
  headerRow: true,
  totalRow: true,
  bandedRows: true,
  bandedColumns: false,
  lastColumn: false,
};

export type TablePreviewDimensions = {
  rows: number;
  columns: number;
};

const DEFAULT_TABLE_PREVIEW_DIMENSIONS: TablePreviewDimensions = { rows: 7, columns: 5 };

/**
 * Returns the editor preview size needed to show one complete selected stripe
 * cycle. The gallery stays deliberately fixed at five by seven cells.
 */
export function tablePreviewDimensions(
  style: TableStyleDefinition,
  selectedElement?: TableStyleElement,
): TablePreviewDimensions {
  if (selectedElement === "firstColumnStripe" || selectedElement === "secondColumnStripe") {
    const { first, second } = stripeSizes(
      style.elements.firstColumnStripe?.stripeSize,
      style.elements.secondColumnStripe?.stripeSize,
    );
    return {
      rows: DEFAULT_TABLE_PREVIEW_DIMENSIONS.rows,
      columns: Math.max(5, first + second),
    };
  }
  if (selectedElement === "firstRowStripe" || selectedElement === "secondRowStripe") {
    const { first, second } = stripeSizes(
      style.elements.firstRowStripe?.stripeSize,
      style.elements.secondRowStripe?.stripeSize,
    );
    return {
      rows: Math.max(7, first + second + 2),
      columns: DEFAULT_TABLE_PREVIEW_DIMENSIONS.columns,
    };
  }
  return DEFAULT_TABLE_PREVIEW_DIMENSIONS;
}

export function previewCells(
  style: TableStyleDefinition,
  selectedElement?: TableStyleElement,
): TableStylePreviewCell[] {
  const { rows, columns } = tablePreviewDimensions(style, selectedElement);
  const editingColumnStripes =
    selectedElement === "firstColumnStripe" || selectedElement === "secondColumnStripe";
  const editingRowStripes =
    selectedElement === "firstRowStripe" || selectedElement === "secondRowStripe";
  const hasColumnStripes = Boolean(
    style.elements.firstColumnStripe || style.elements.secondColumnStripe,
  );
  const table = {
    ...PREVIEW_TABLE,
    range: { start: { row: 0, column: 0 }, end: { row: rows - 1, column: columns - 1 } },
    bandedRows: editingColumnStripes ? false : PREVIEW_TABLE.bandedRows,
    bandedColumns:
      editingColumnStripes || (Boolean(selectedElement) && !editingRowStripes && hasColumnStripes),
    firstColumn: selectedElement
      ? Boolean(style.elements.firstColumn)
      : hasHighlightedFirstColumn(style),
    lastColumn: selectedElement ? Boolean(style.elements.lastColumn) : false,
    style,
  } as Parameters<typeof resolveTableCellStyle>[0];
  if (editingRowStripes) table.bandedRows = true;
  return Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      row,
      column,
      style: resolveTableCellStyle(table, { row, column }),
    };
  });
}

function stripeSizes(firstSize: number | undefined, secondSize: number | undefined) {
  const first = Math.max(1, Math.floor(firstSize ?? 1));
  return { first, second: Math.max(1, Math.floor(secondSize ?? first)) };
}

/**
 * A pivot preview uses the PivotTable-specific hierarchy rather than coercing
 * its elements into an ordinary table. The miniature exposes headers,
 * subheadings, subtotal bands, report filters, and grand totals at once.
 */
export function previewPivotCells(style: PivotTableStyleDefinition): TableStylePreviewCell[] {
  const sample = Array.from({ length: 35 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const elements: PivotTableStyleElement[] = ["wholeTable"];
    if (row === 0) elements.push("headerRow");
    if (row === 6) elements.push("totalRow");
    if (column === 0) elements.push("firstColumn");
    if (column === 4) elements.push("lastColumn");
    if (row > 0 && row < 6)
      elements.push(
        isFirstStripe(
          row - 1,
          style.elements.firstRowStripe?.stripeSize,
          style.elements.secondRowStripe?.stripeSize,
        )
          ? "firstRowStripe"
          : "secondRowStripe",
      );
    if (column > 0 && column < 4)
      elements.push(
        isFirstStripe(
          column - 1,
          style.elements.firstColumnStripe?.stripeSize,
          style.elements.secondColumnStripe?.stripeSize,
        )
          ? "firstColumnStripe"
          : "secondColumnStripe",
      );
    if (row >= 1 && row <= 3) {
      elements.push(
        (["firstRowSubheading", "secondRowSubheading", "thirdRowSubheading"] as const)[row - 1]!,
      );
      if (column === 0)
        elements.push(
          (["firstColumnSubheading", "secondColumnSubheading", "thirdColumnSubheading"] as const)[
            row - 1
          ]!,
        );
    }
    if (row === 5)
      elements.push(
        (["firstSubtotalRow", "secondSubtotalRow", "thirdSubtotalRow"] as const)[column % 3]!,
      );
    if (column >= 1 && column <= 3 && row === 5)
      elements.push(
        (["firstSubtotalColumn", "secondSubtotalColumn", "thirdSubtotalColumn"] as const)[
          column - 1
        ]!,
      );
    if (row === 4) elements.push("blankRow");
    if (row === 0 && column === 0) elements.push("firstHeaderCell", "pageFieldLabels");
    if (row === 0 && column === 1) elements.push("pageFieldValues");
    return { row, column, elements };
  });
  const contains = (row: number, column: number, element: PivotTableStyleElement): boolean =>
    row >= 0 &&
    row < 7 &&
    column >= 0 &&
    column < 5 &&
    sample[row * 5 + column]!.elements.includes(element);
  return sample.map(({ row, column, elements }) => {
    const effective = elements.reduce<CellStyle | undefined>(
      (current, element) =>
        mergeCellStyle(current, previewElementPatch(style, element, row, column, contains)),
      undefined,
    );
    return { row, column, style: effective };
  });
}

function isFirstStripe(position: number, firstSize = 1, secondSize = 1): boolean {
  const first = Math.max(1, Math.floor(firstSize));
  const second = Math.max(1, Math.floor(secondSize));
  return position % (first + second) < first;
}

function previewElementPatch(
  style: PivotTableStyleDefinition,
  element: PivotTableStyleElement,
  row: number,
  column: number,
  contains: (row: number, column: number, element: PivotTableStyleElement) => boolean,
) {
  const format = style.elements[element];
  if (!format) return {};
  const { borderTop, borderRight, borderBottom, borderLeft, ...patch } = format.style;
  const sharesTop = contains(row - 1, column, element);
  const sharesRight = contains(row, column + 1, element);
  const sharesBottom = contains(row + 1, column, element);
  const sharesLeft = contains(row, column - 1, element);
  return {
    ...patch,
    ...(sharesTop
      ? format.innerHorizontal !== undefined
        ? { borderTop: format.innerHorizontal }
        : {}
      : borderTop !== undefined
        ? { borderTop }
        : {}),
    ...(sharesRight
      ? format.innerVertical !== undefined
        ? { borderRight: format.innerVertical }
        : {}
      : borderRight !== undefined
        ? { borderRight }
        : {}),
    ...(sharesBottom
      ? format.innerHorizontal !== undefined
        ? { borderBottom: format.innerHorizontal }
        : {}
      : borderBottom !== undefined
        ? { borderBottom }
        : {}),
    ...(sharesLeft
      ? format.innerVertical !== undefined
        ? { borderLeft: format.innerVertical }
        : {}
      : borderLeft !== undefined
        ? { borderLeft }
        : {}),
  };
}

export function cellStyleToCss(style: CellStyle | undefined): CSSProperties {
  if (!style) return {};
  return {
    ...getCellFillStyle(style),
    ...getCellTextDecorationStyle(style),
    color: style.textColor,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ? `${Math.max(6, style.fontSize * 0.58)}px` : undefined,
    fontWeight: style.bold ? "700" : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    borderTop: borderToCss(style.borderTop),
    borderRight: borderToCss(style.borderRight),
    borderBottom: borderToCss(style.borderBottom),
    borderLeft: borderToCss(style.borderLeft),
  };
}

function borderToCss(border: CellStyle["borderTop"] | null): string | undefined {
  if (border === null) return "none";
  if (!border) return undefined;
  const width = border.style === "thick" || border.style === "double" ? 2 : 1;
  const style =
    border.style.includes("dash") || border.style === "dashed"
      ? "dashed"
      : border.style === "dotted"
        ? "dotted"
        : "solid";
  return `${width}px ${style} ${border.color}`;
}
