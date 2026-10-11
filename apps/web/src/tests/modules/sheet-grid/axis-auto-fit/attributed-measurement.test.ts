import { describe, expect, test } from "vitest";
import {
  MIN_COLUMN_WIDTH,
  createSheet,
  setCellContent,
  setCellStyle,
  type Cell,
} from "@sheetcraft/core/workbook";
import type { CellStyle } from "@sheetcraft/core/style";
import type { FormulaValue } from "@sheetcraft/core/formula";
import type { CellTextDocument } from "@sheetcraft/core/text-font-runs";
import type { TextMeasurer } from "@sheetcraft/sheet-engine/text-layout";
import {
  getAutoFitColumnWidths,
  getAutoFitRowHeights,
  getAxisAutoFitFontFamilies,
  type AxisAutoFitInput,
} from "../../../../modules/sheet-grid/axis-auto-fit";
import { getCellValuePresentationForGrid } from "../../../../modules/sheet-grid/cell-value-presentation";
import { layoutCellText } from "../../../../shared/cell-text/text-presentation";

const address = { row: 0, column: 0 };
const range = { start: address, end: { row: 10, column: 10 } };
const measurer: TextMeasurer = {
  measure: (text, font) => Array.from(text).length * (font.family === "Wide" ? 20 : 10),
  measureMetrics: (text, font) => ({
    width: Array.from(text).length * (font.family === "Wide" ? 20 : 10),
    ascent: font.family === "Tall" ? 35 : 8,
    descent: font.family === "Tall" ? 5 : 2,
  }),
};

function input(document: CellTextDocument, style: CellStyle = {}): AxisAutoFitInput {
  const sheet = createSheet("Sheet1", "sheet-1");
  setCellContent(sheet, address, {
    kind: "literal",
    value: document.text,
    fontRuns: document.fontRuns,
  });
  setCellStyle(sheet, address, { fontFamily: "Arial", fontSize: 10, ...style });
  return {
    sheet,
    range,
    measurer,
    getComputedValue: (_address, cell: Readonly<Cell>) =>
      cell.content?.kind === "literal" ? cell.content.value : null,
    formatPresentation: () => document,
  };
}

describe("font-run axis auto fit", () => {
  test("matches uniform native multi-family bidi line advances for row and rotated column AutoFit", () => {
    const document = { text: "a\nTא", fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }] };
    const multiline = input(document);
    const layout = layoutCellText({
      ...document,
      style: multiline.sheet.cells.get("0:0")?.style,
      width: 100,
      height: 100,
      measurer,
    });
    expect(layout.height).toBe(80);
    expect(getAutoFitRowHeights(multiline).get(0)).toBe(85);
    const rotated = input(document, { textRotation: 45 });
    expect(getAutoFitRowHeights(rotated).get(0)).toBe(Math.ceil((20 + 80) / Math.sqrt(2) + 5));
    expect(getAutoFitColumnWidths(rotated).get(0)).toBe(Math.ceil((20 + 80) / Math.sqrt(2) + 6));
    expect(getAutoFitRowHeights(input({ ...document, text: "a\nTΩ" })).get(0)).toBe(58);
    const wrapped = input({ text: "a Tא", fontRuns: document.fontRuns }, { wrapText: true });
    wrapped.sheet.columnWidths.set(0, 35);
    expect(getAutoFitRowHeights(wrapped).get(0)).toBe(85);
  });

  test("measures actual family widths and retains the old no-runs height path", () => {
    const rich = input({ text: "aΩb", fontRuns: [{ start: 1, end: 2, fontFamily: "Wide" }] });
    expect(getAutoFitColumnWidths(rich).get(0)).toBe(46);
    expect(getAutoFitColumnWidths(input({ text: "aΩb" })).get(0)).toBe(36);
    const veryTallMetrics = {
      ...measurer,
      measureMetrics: () => ({ width: 30, ascent: 80, descent: 20 }),
    };
    expect(
      getAutoFitRowHeights({ ...input({ text: "aΩb" }), measurer: veryTallMetrics }).get(0),
    ).toBe(18);
  });

  test("wraps by mixed-family widths and preserves CRLF run offsets for actual extents", () => {
    const wrapped = input(
      { text: "aΩb", fontRuns: [{ start: 1, end: 2, fontFamily: "Wide" }] },
      { wrapText: true },
    );
    wrapped.sheet.columnWidths.set(0, 35);
    expect(getAutoFitRowHeights(wrapped).get(0)).toBe(43);
    const multiline = input({
      text: "a\r\nT",
      fontRuns: [{ start: 3, end: 4, fontFamily: "Tall" }],
    });
    expect(getAutoFitRowHeights(multiline).get(0)).toBe(58);
  });

  test("uses actual extents for rotated text and per-grapheme families for stacked paragraphs", () => {
    const document = { text: "aT", fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] };
    expect(getAutoFitRowHeights(input(document, { textRotation: 90 })).get(0)).toBe(26);
    expect(getAutoFitColumnWidths(input(document, { textRotation: 90 })).get(0)).toBe(46);
    const stacked = input(
      { text: "aT\r\nbb", fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] },
      { textRotation: "vertical" },
    );
    expect(getAutoFitRowHeights(stacked).get(0)).toBe(58);
    expect(getAutoFitColumnWidths(stacked).get(0)).toBe(MIN_COLUMN_WIDTH);
  });

  test("stacked rendering and AutoFit agree on each glyph advance and each column width", () => {
    const document = {
      text: "aT\r\nΩb",
      fontRuns: [
        { start: 1, end: 2, fontFamily: "Tall" },
        { start: 4, end: 5, fontFamily: "Wide" },
      ],
    };
    const stacked = input(document, { textRotation: "vertical" });
    const layout = layoutCellText({
      ...document,
      style: stacked.sheet.cells.get("0:0")?.style,
      width: 100,
      height: 100,
      measurer,
    });
    expect(layout.height).toBe(52.5);
    expect(layout.width).toBe(30);
    expect(
      layout.lines.map(({ text, y, height, x, width }) => [text, y, height, x, width]),
    ).toEqual([
      ["a", 0, 12.5, 0, 10],
      ["T", 12.5, 40, 0, 10],
      ["Ω", 0, 12.5, 10, 20],
      ["b", 12.5, 12.5, 10, 20],
    ]);
    expect(getAutoFitRowHeights(stacked).get(0)).toBe(Math.ceil(layout.height + 5));
    expect(getAutoFitColumnWidths(stacked).get(0)).toBe(layout.width + 6);
  });

  test("consumes the exact formatted presentation including literal prefixes and repeated placeholders", () => {
    const rich = input(
      { text: "Ω", fontRuns: [{ start: 0, end: 1, fontFamily: "Wide" }] },
      {
        numberFormat: { kind: "custom", code: '0;0;0;"Ω"@"-"@' },
      },
    );
    const formatted = {
      ...rich,
      formatPresentation: (_address: unknown, cell: Readonly<Cell>, value: FormulaValue) =>
        getCellValuePresentationForGrid(value, cell.style, "en-US", "1900", cell.content),
    };
    // The literal Ω remains Arial; only the two formatted @ copies use Wide.
    expect(getAutoFitColumnWidths(formatted).get(0)).toBe(66);
  });

  test("uses effective styles without changing stored ones and only requests measured families", () => {
    const rich = input({ text: "aΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Wide" }] });
    const effective = { ...rich, getCellStyle: () => ({ fontFamily: "Effective", fontSize: 30 }) };
    expect(getAutoFitRowHeights(effective).get(0)).toBe(43);
    expect(getAxisAutoFitFontFamilies(effective, "row")).toEqual(new Set(["Effective", "Wide"]));
    expect(rich.sheet.cells.get("0:0")?.style?.fontSize).toBe(10);
    rich.sheet.mergedCells.push({ start: address, end: { row: 0, column: 1 } });
    expect(getAxisAutoFitFontFamilies(effective, "row")).toEqual(new Set());
  });
});
