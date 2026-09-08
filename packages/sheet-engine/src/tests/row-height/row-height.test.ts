import { describe, expect, test, vi } from "vitest";
import {
  createAutoRowHeightCalculator,
  measureWrappedCellHeight,
  mergeRowHeightOverrides,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "../../row-height.js";
import { DEFAULT_ROW_HEIGHT, MAX_ROW_HEIGHT } from "@idea10/core/workbook";

const baseFont: AutoRowHeightFont = {
  family: "Test Sans",
  size: 10,
  weight: 400,
  italic: false,
};

const fixedMeasurer: TextMeasurer = {
  measure: (text, font) => Array.from(text).length * font.size,
};

describe("automatic row height", () => {
  test("wraps English at words, CJK at graphemes, and long words anywhere", () => {
    const english = measureWrappedCellHeight("aa bb", 42, baseFont, fixedMeasurer);
    const cjk = measureWrappedCellHeight("中文测试", 42, baseFont, fixedMeasurer);
    const longWord = measureWrappedCellHeight("abcdefg", 42, baseFont, fixedMeasurer);

    expect(english).toBe(30);
    expect(cjk).toBe(30);
    expect(longWord).toBe(43);
    expect(measureWrappedCellHeight("short", 100, baseFont, fixedMeasurer)).toBe(
      DEFAULT_ROW_HEIGHT,
    );
    expect(measureWrappedCellHeight("a\nb", 42, baseFont, fixedMeasurer)).toBe(30);
    expect(measureWrappedCellHeight("a\nb", 42, baseFont, fixedMeasurer, false)).toBe(30);
    expect(measureWrappedCellHeight("abcdefg", 42, baseFont, fixedMeasurer, false)).toBe(
      DEFAULT_ROW_HEIGHT,
    );
    expect(measureWrappedCellHeight("", 42, baseFont, fixedMeasurer)).toBe(DEFAULT_ROW_HEIGHT);
  });

  test("responds to width and font metrics and caps extreme content", () => {
    const text = "中文测试";
    const narrow = measureWrappedCellHeight(text, 42, baseFont, fixedMeasurer);
    const wide = measureWrappedCellHeight(text, 100, baseFont, fixedMeasurer);
    const largeFont = measureWrappedCellHeight(
      text,
      42,
      { ...baseFont, family: "Wide Sans", size: 20, weight: 700 },
      fixedMeasurer,
    );

    expect(narrow).toBeGreaterThan(wide);
    expect(largeFont).toBeGreaterThan(narrow);
    expect(measureWrappedCellHeight("x".repeat(10_000), 32, baseFont, fixedMeasurer)).toBe(
      MAX_ROW_HEIGHT,
    );
  });

  test("derives only wrapped value rows, takes the row maximum, and reuses cached measurements", () => {
    const measure = vi.fn(fixedMeasurer.measure);
    const calculator = createAutoRowHeightCalculator({ measure });
    const cells = new Map([
      [
        "0:0",
        {
          content: { kind: "literal" as const, value: "abcdefg" },
          style: { wrapText: true as const },
        },
      ],
      [
        "0:1",
        {
          content: { kind: "literal" as const, value: "abc" },
          style: { wrapText: true as const, fontSize: 20 },
        },
      ],
      [
        "1:0",
        { content: { kind: "literal" as const, value: "ignored" }, style: { bold: true as const } },
      ],
      ["2:0", { style: { wrapText: true as const } }],
    ]);
    const input = {
      cells,
      getComputedValue: (address) => {
        const cell = cells.get(`${address.row}:${address.column}`);
        return cell?.content?.kind === "literal" ? cell.content.value : null;
      },
      columnWidths: new Map([
        [0, 42],
        [1, 42],
      ]),
      rowCount: 5,
      columnCount: 3,
      defaultFontFamily: "Test Sans",
    };

    const first = calculator.reconcile(input);
    const firstMeasureCount = measure.mock.calls.length;
    expect(first.get(0)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
    expect(first.has(1)).toBe(false);
    expect(first.has(2)).toBe(false);

    expect(calculator.reconcile(input)).toEqual(first);
    expect(measure).toHaveBeenCalledTimes(firstMeasureCount);

    cells.set("0:0", {
      content: { kind: "literal", value: "short" },
      style: { wrapText: true },
    });
    calculator.reconcile(input);
    expect(measure.mock.calls.length).toBeGreaterThan(firstMeasureCount);

    calculator.clear();
    calculator.reconcile(input);
    expect(measure.mock.calls.length).toBeGreaterThan(firstMeasureCount + 1);
  });

  test("lets every manual row height override the automatic result", () => {
    const automatic = new Map([
      [0, 80],
      [1, 60],
    ]);
    const effective = mergeRowHeightOverrides(
      automatic,
      new Map([
        [0, 20],
        [2, 40],
      ]),
    );

    expect(effective).toEqual(
      new Map([
        [0, 20],
        [1, 60],
        [2, 40],
      ]),
    );
  });

  test("derives height for explicit line breaks without a wrap style", () => {
    const calculator = createAutoRowHeightCalculator(fixedMeasurer);
    const heights = calculator.reconcile({
      cells: new Map([["0:0", { content: { kind: "formula", formula: { source: "=A1" } } }]]),
      getComputedValue: () => "first\nsecond",
      columnWidths: new Map([[0, 42]]),
      rowCount: 2,
      columnCount: 2,
    });

    expect(heights.get(0)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
  });

  test("measures the adapter's formatted value when supplied", () => {
    const calculator = createAutoRowHeightCalculator(fixedMeasurer);
    const heights = calculator.reconcile({
      cells: new Map([
        ["0:0", { content: { kind: "literal", value: 1 }, style: { wrapText: true } }],
      ]),
      getComputedValue: () => 1,
      formatValue: (_address, _cell, value) => (value === 1 ? "a\nb" : ""),
      columnWidths: new Map([[0, 42]]),
      rowCount: 2,
      columnCount: 2,
    });

    expect(heights.get(0)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
  });
});
