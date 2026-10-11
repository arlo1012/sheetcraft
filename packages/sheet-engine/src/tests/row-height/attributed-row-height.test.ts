import { describe, expect, test, vi } from "vitest";
import { type CellTextDocument } from "@sheetcraft/core/text-font-runs";
import { DEFAULT_ROW_HEIGHT, MAX_ROW_HEIGHT } from "@sheetcraft/core/workbook";
import { type CellStyle } from "@sheetcraft/core/style";
import {
  createAutoRowHeightCalculator,
  measureWrappedCellHeight,
  mergeRowHeightOverrides,
  type AutoRowHeightInput,
  type TextMeasurer,
} from "../../row-height.js";
import { getCellTextGraphemes, type AutoRowHeightFont } from "../../text-layout.js";

const font: AutoRowHeightFont = { family: "Base", size: 10, weight: 400, italic: false };
const widths: TextMeasurer = {
  measure: (text, currentFont) =>
    getCellTextGraphemes(text).length * currentFont.size * (currentFont.family === "Wide" ? 2 : 1),
};

function input(
  document: CellTextDocument,
  style: CellStyle = { wrapText: true },
): AutoRowHeightInput {
  return {
    cells: new Map([
      [
        "0:0",
        { content: { kind: "literal", value: document.text }, style: { fontSize: 10, ...style } },
      ],
    ]),
    getComputedValue: () => document.text,
    formatPresentation: () => document,
    defaultFontFamily: "Base",
    columnWidths: new Map([[0, 51]]),
    rowCount: 1,
    columnCount: 1,
  };
}

describe("attributed automatic row height", () => {
  test("reserves a uniform native multi-family bidi advance across explicit newlines", () => {
    const tallMetrics: TextMeasurer = {
      ...widths,
      measureMetrics: (text, currentFont) => ({
        width: widths.measure(text, currentFont),
        ascent: currentFont.family === "Tall" ? 35 : 8,
        descent: currentFont.family === "Tall" ? 5 : 2,
      }),
    };
    const document = { text: "a\nTא", fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }] };
    expect(measureWrappedCellHeight(document, 100, font, tallMetrics, false)).toBe(85);
    const calculator = createAutoRowHeightCalculator(tallMetrics);
    expect(calculator.reconcile(input(document, {})).get(0)).toBe(85);
    expect(calculator.reconcile(input({ ...document, text: "a\nTΩ" }, {})).get(0)).toBe(58);
    expect(
      calculator.reconcile(input({ ...document, text: "a\nTΩ" }, { textDirection: "rtl" })).get(0),
    ).toBe(85);
    expect(calculator.reconcile(input(document, { textRotation: 45 })).get(0)).toBe(
      Math.ceil((20 + 80) / Math.sqrt(2) + 5),
    );
    expect(calculator.reconcile(input(document, { textRotation: "vertical" })).get(0)).toBe(58);
    const wrapped = input({ text: "a Tא", fontRuns: document.fontRuns });
    expect(calculator.reconcile({ ...wrapped, columnWidths: new Map([[0, 35]]) }).get(0)).toBe(85);
    expect(
      createAutoRowHeightCalculator({
        ...tallMetrics,
        measureMetrics: (text, currentFont) => ({
          width: widths.measure(text, currentFont),
          ascent: currentFont.family === "Tall" ? 1_000 : 8,
          descent: 2,
        }),
      })
        .reconcile(input(document, {}))
        .get(0),
    ).toBe(MAX_ROW_HEIGHT);
  });

  test("uses effective theme/table formatting without mutating sparse cell styles", () => {
    const calculator = createAutoRowHeightCalculator(widths);
    const document = { text: "abcdef" };
    const layout = input(document, {});
    const stored = [...layout.cells.values()][0]!.style;
    const plain = calculator.reconcile(layout).get(0);
    const themed = calculator
      .reconcile({
        ...layout,
        getCellStyle: () => ({ fontFamily: "Wide", fontSize: 10, wrapText: true }),
      })
      .get(0);
    expect(themed).toBeGreaterThan(plain ?? DEFAULT_ROW_HEIGHT);
    expect([...layout.cells.values()][0]!.style).toEqual(stored);
  });
  test("invalidates cached height when only font runs change the effective widths", () => {
    const measure = vi.fn(widths.measure);
    const calculator = createAutoRowHeightCalculator({ measure });
    let document: CellTextDocument = { text: "abcdef" };
    const layout = { ...input(document), formatPresentation: () => document };
    const first = calculator.reconcile(layout).get(0);
    const calls = measure.mock.calls.length;
    expect(calculator.reconcile(layout).get(0)).toBe(first);
    expect(measure).toHaveBeenCalledTimes(calls);
    document = { text: "abcdef", fontRuns: [{ start: 0, end: 6, fontFamily: "Wide" }] };
    expect(calculator.reconcile(layout).get(0)).toBeGreaterThan(first!);
    expect(measure.mock.calls.length).toBeGreaterThan(calls);
  });

  test("fingerprints actual family extents and grows tall unwrapped text", () => {
    let ascent = 30;
    const calculator = createAutoRowHeightCalculator({
      ...widths,
      measureMetrics: (text, currentFont) => ({
        width: widths.measure(text, currentFont),
        ascent: currentFont.family === "Tall" ? ascent : 7,
        descent: 3,
      }),
    });
    const document = { text: "ab", fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] };
    const layout = input(document, {});
    expect(calculator.reconcile(layout).get(0)).toBe(38);
    ascent = 40;
    expect(calculator.reconcile(layout).get(0)).toBe(48);
    expect(mergeRowHeightOverrides(calculator.reconcile(layout), new Map([[0, 24]])).get(0)).toBe(
      24,
    );
  });

  test("uses formatted projected runs before legacy formatValue", () => {
    const calculator = createAutoRowHeightCalculator(widths);
    const document = { text: "ab\r\ncd", fontRuns: [{ start: 4, end: 6, fontFamily: "Wide" }] };
    const heights = calculator.reconcile({ ...input(document), formatValue: () => "" });
    expect(heights.get(0)).toBe(30);
    expect(measureWrappedCellHeight(document, 51, font, widths, true)).toBe(30);
  });

  test("keeps fontless nominal heights and empty values unchanged", () => {
    for (const text of ["abcdef", "aa bb", "中文测试", "a\r\nb", ""]) {
      expect(measureWrappedCellHeight({ text }, 51, font, widths)).toBe(
        measureWrappedCellHeight(text, 51, font, widths),
      );
    }
    expect(createAutoRowHeightCalculator(widths).reconcile(input({ text: "a" }, {})).size).toBe(0);
    expect(measureWrappedCellHeight({ text: "" }, 51, font, widths)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("retains rotation, stacked paragraphs, and shrink-to-fit using actual families", () => {
    const calculator = createAutoRowHeightCalculator({
      ...widths,
      measureMetrics: (text, currentFont) => ({
        width: widths.measure(text, currentFont),
        ascent: currentFont.size * (currentFont.family === "Tall" ? 2 : 0.7),
        descent: currentFont.size * 0.3,
      }),
    });
    const document = { text: "abcd", fontRuns: [{ start: 0, end: 4, fontFamily: "Wide" }] };
    const natural = calculator.reconcile(input(document, { textRotation: 45 })).get(0)!;
    const shrunk = calculator
      .reconcile(input(document, { textRotation: 45, shrinkToFit: true }))
      .get(0)!;
    expect(natural).toBeGreaterThan(shrunk);
    expect(shrunk).toBeGreaterThanOrEqual(DEFAULT_ROW_HEIGHT);
    const stacked = { text: "ab\r\nc", fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] };
    expect(calculator.reconcile(input(stacked, { textRotation: "vertical" })).get(0)).toBe(41);
    expect(
      calculator
        .reconcile(
          input({
            text: "x".repeat(10_000),
            fontRuns: [{ start: 0, end: 10_000, fontFamily: "Wide" }],
          }),
        )
        .get(0),
    ).toBe(MAX_ROW_HEIGHT);
  });
});
