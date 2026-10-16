import { describe, expect, test, vi } from "vitest";
import {
  createAutoRowHeightCalculator,
  measureWrappedCellHeight,
  mergeRowHeightOverrides,
  type AutoRowHeightFont,
  type AutoRowHeightInput,
  type TextMeasurer,
} from "../../row-height.js";

const font: AutoRowHeightFont = { family: "Test", size: 10, weight: 400, italic: false };
const measurer: TextMeasurer = { measure: (text, current) => text.length * current.size };

function input(defaultRowHeight?: number): AutoRowHeightInput {
  return {
    cells: new Map([
      [
        "0:0",
        { content: { kind: "literal", value: "a" }, style: { fontSize: 10, wrapText: true } },
      ],
      [
        "1:0",
        { content: { kind: "literal", value: "a\nb" }, style: { fontSize: 10, wrapText: true } },
      ],
    ]),
    getComputedValue: (_address, cell) =>
      cell.content?.kind === "literal" ? cell.content.value : null,
    columnWidths: new Map(),
    rowCount: 3,
    columnCount: 1,
    defaultRowHeight,
  };
}

describe("sheet-owned automatic row-height baseline", () => {
  test("keeps legacy callers at 24 and uses 20 for short and empty text", () => {
    expect(measureWrappedCellHeight("a", 96, font, measurer)).toBe(24);
    expect(measureWrappedCellHeight("a", 96, font, measurer, true, 20)).toBe(20);
    expect(measureWrappedCellHeight("", 96, font, measurer, true, 20)).toBe(20);
    expect(measureWrappedCellHeight("a\nb", 96, font, measurer, true, 20)).toBe(30);
    expect(measureWrappedCellHeight("a", 96, { ...font, size: 20 }, measurer, true, 20)).toBe(30);
  });

  test("invalidates cached measurement floors when only the sheet baseline changes", () => {
    const measure = vi.fn(measurer.measure);
    const calculator = createAutoRowHeightCalculator({ measure });
    expect(calculator.reconcile(input())).toEqual(new Map([[1, 30]]));
    const before = measure.mock.calls.length;
    expect(calculator.reconcile(input())).toEqual(new Map([[1, 30]]));
    expect(measure).toHaveBeenCalledTimes(before);
    expect(calculator.reconcile(input(20))).toEqual(new Map([[1, 30]]));
    expect(measure.mock.calls.length).toBeGreaterThan(before);
    const after = measure.mock.calls.length;
    expect(calculator.reconcile(input(20))).toEqual(new Map([[1, 30]]));
    expect(measure).toHaveBeenCalledTimes(after);
    expect(calculator.reconcile(input(40))).toEqual(new Map());
    expect(calculator.reconcile(input(20))).toEqual(new Map([[1, 30]]));
  });

  test("propagates the same floor through rich, rotated and stacked measurements", () => {
    const calculator = createAutoRowHeightCalculator(measurer);
    const base = input(20);
    for (const textRotation of [0, 90, "vertical"] as const) {
      const layout: AutoRowHeightInput = {
        ...base,
        cells: new Map([
          [
            "0:0",
            {
              content: { kind: "literal", value: "a" },
              // Wrapped quarter-turn text reserves the available column width as
              // its vertical extent; use unwrapped text to isolate the row floor.
              style: { fontSize: 10, wrapText: textRotation !== 90, textRotation },
            },
          ],
        ]),
      };
      expect(calculator.reconcile(layout)).toEqual(new Map());
      expect(
        calculator.reconcile({
          ...layout,
          formatPresentation: () => ({
            text: "a",
            fontRuns: [{ start: 0, end: 1, fontFamily: "Test" }],
          }),
        }),
      ).toEqual(new Map());
    }
    const metrics: TextMeasurer = {
      ...measurer,
      measureMetrics: (text, current) => ({
        width: measurer.measure(text, current),
        ascent: 8,
        descent: 2,
      }),
    };
    expect(measureWrappedCellHeight("a", 96, font, metrics, true, 20)).toBe(20);
    expect(
      createAutoRowHeightCalculator(metrics).reconcile({
        ...base,
        cells: new Map([...base.cells].slice(0, 1)),
      }),
    ).toEqual(new Map());
  });

  test("preserves explicit 24 and other manual overrides over genuine text-fit growth", () => {
    const automatic = createAutoRowHeightCalculator(measurer).reconcile(input(20));
    expect(automatic).toEqual(new Map([[1, 30]]));
    expect(
      mergeRowHeightOverrides(
        automatic,
        new Map([
          [0, 24],
          [1, 24],
        ]),
      ),
    ).toEqual(
      new Map([
        [1, 24],
        [0, 24],
      ]),
    );
  });
});
