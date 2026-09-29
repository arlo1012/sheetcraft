import { describe, expect, test } from "vitest";
import {
  createConditionalFormatResolver,
  createConditionalFormatVisualResolver,
  normalizeConditionalFormatRules,
  type ConditionalFormatCondition,
  type SheetConditionalFormatRule,
} from "../../conditional-formatting.js";
import { datePartsToExcelSerial } from "../../formula/date-system.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

const scope = { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } };
function rule(
  id: string,
  condition: ConditionalFormatCondition,
  style: SheetConditionalFormatRule["style"] = {},
): SheetConditionalFormatRule {
  return { id, ranges: [scope], anchor: { ...scope.start }, condition, style };
}
function resolver(rules: SheetConditionalFormatRule[], values: number[]) {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  values.forEach((value, row) => setCellValue(sheet, { row, column: 0 }, value));
  sheet.conditionalFormats = rules;
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  return { sheet, evaluator };
}

describe("conditional-formatting extended predicates", () => {
  test("handles large sparse numeric scopes without spread-argument limits", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const rowCount = 130_000;
    for (let row = 0; row < rowCount; row += 1) setCellValue(sheet, { row, column: 0 }, row);
    sheet.conditionalFormats = [
      {
        ...rule("top", { kind: "rank", count: 1 }, { fillColor: "#ff0000" }),
        ranges: [{ start: { row: 0, column: 0 }, end: { row: rowCount - 1, column: 0 } }],
      },
    ];
    const resolve = createConditionalFormatResolver(
      sheet,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    expect(resolve({ row: rowCount - 1, column: 0 })).toEqual({ fillColor: "#ff0000" });
    expect(resolve({ row: rowCount - 2, column: 0 })).toBeUndefined();
  });

  test("materializes formula spills before collecting sparse numeric rule values", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(3)" } },
    );
    sheet.conditionalFormats = [
      {
        ...rule("top", { kind: "rank", count: 1 }, { fillColor: "#ff0000" }),
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
      },
    ];
    expect(
      createConditionalFormatResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 2, column: 0 }),
    ).toEqual({ fillColor: "#ff0000" });
  });

  test("rejects statically descending thresholds", () => {
    expect(() =>
      normalizeConditionalFormatRules([
        rule("bad", {
          kind: "colorScale",
          stops: [
            { threshold: { kind: "num", value: 10 }, color: "#000000" },
            { threshold: { kind: "num", value: 1 }, color: "#ffffff" },
          ],
        }),
      ]),
    ).toThrow("conditional-formatting");
    for (const formula of ["=SUM(A:A)", "=SUM($A:A)", "=SUM(1:1)", "=SUM($1:1)"]) {
      expect(() =>
        normalizeConditionalFormatRules([
          rule("relative-axis", {
            kind: "dataBar",
            minimum: { kind: "formula", formula },
            maximum: { kind: "max" },
            color: "#00ff00",
          }),
        ]),
      ).toThrow("conditional-formatting");
    }
    expect(() =>
      normalizeConditionalFormatRules([
        rule("absolute-axis", {
          kind: "dataBar",
          minimum: { kind: "formula", formula: "=SUM($A:$A)+SUM($1:$1)" },
          maximum: { kind: "max" },
          color: "#00ff00",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      normalizeConditionalFormatRules([
        rule("array-constant", {
          kind: "dataBar",
          minimum: { kind: "formula", formula: "=SUM({1,2})" },
          maximum: { kind: "max" },
          color: "#00ff00",
        }),
      ]),
    ).toThrow("conditional-formatting");
  });

  test("evaluates absolute formula thresholds and rejects relative CFVO references", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 5);
    setCellValue(sheet, { row: 0, column: 1 }, 4);
    sheet.conditionalFormats = [
      rule("bar", {
        kind: "dataBar",
        minimum: { kind: "formula", formula: "=$B$1" },
        maximum: { kind: "formula", formula: "=10" },
        color: "#00ff00",
      }),
    ];
    expect(
      createConditionalFormatVisualResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 0, column: 0 })?.dataBar,
    ).toMatchObject({ start: 0, end: 1 / 6, axis: 0 });
    expect(() =>
      normalizeConditionalFormatRules([
        rule("relative", {
          kind: "dataBar",
          minimum: { kind: "formula", formula: "=B1" },
          maximum: { kind: "max" },
          color: "#00ff00",
        }),
      ]),
    ).toThrow("conditional-formatting");
  });

  test("uses rank semantics that include boundary ties and rounds top percentages up", () => {
    const { sheet, evaluator } = resolver(
      [
        rule("top", { kind: "rank", count: 2 }, { fillColor: "#ff0000" }),
        rule(
          "bottom-percent",
          { kind: "rank", count: 50, percent: true, bottom: true },
          { textColor: "#0000ff" },
        ),
      ],
      [100, 90, 90, 10],
    );
    const resolve = createConditionalFormatResolver(sheet, evaluator);
    expect(resolve({ row: 0, column: 0 })).toEqual({ fillColor: "#ff0000" });
    expect(resolve({ row: 1, column: 0 })).toEqual({ fillColor: "#ff0000", textColor: "#0000ff" });
    expect(resolve({ row: 2, column: 0 })).toEqual({ fillColor: "#ff0000", textColor: "#0000ff" });
    expect(resolve({ row: 3, column: 0 })).toEqual({ textColor: "#0000ff" });
  });

  test("calculates averages from finite numeric values only and uses injected date system/time", () => {
    const workbook = createTestWorkbook();
    workbook.dateSystem = "1904";
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellValue(sheet, { row: 1, column: 0 }, 3);
    setCellValue(sheet, { row: 2, column: 0 }, "ignored");
    setCellValue(
      sheet,
      { row: 3, column: 0 },
      datePartsToExcelSerial(
        { year: 2026, month: 9, day: 28, hour: 0, minute: 0, second: 0, millisecond: 0 },
        "1904",
      ),
    );
    sheet.conditionalFormats = [
      {
        ...rule("above", { kind: "average", above: true }, { fillColor: "#ff0000" }),
        ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
      },
      rule("today", { kind: "date", period: "today" }, { textColor: "#0000ff" }),
    ];
    const resolve = createConditionalFormatResolver(
      sheet,
      createWorkbookEvaluator(workbook, sheet.id),
      {
        dateSystem: "1904",
        now: () => new Date(2026, 8, 28, 12),
      },
    );
    expect(resolve({ row: 1, column: 0 })).toEqual({ fillColor: "#ff0000" });
    expect(resolve({ row: 3, column: 0 })).toEqual({ textColor: "#0000ff" });
  });
});

describe("conditional-formatting visuals", () => {
  test("provides interpolated color-scale fills and combines first data-bar and icon-set visuals", () => {
    const { sheet, evaluator } = resolver(
      [
        rule("scale", {
          kind: "colorScale",
          stops: [
            { threshold: { kind: "min" }, color: "#000000" },
            { threshold: { kind: "max" }, color: "#ffffff" },
          ],
        }),
        rule("bar", {
          kind: "dataBar",
          minimum: { kind: "num", value: -10 },
          maximum: { kind: "num", value: 10 },
          color: "#00ff00",
          negativeColor: "#ff0000",
          showValue: false,
        }),
        rule("icons", {
          kind: "iconSet",
          iconSet: "threeArrows",
          thresholds: [{ kind: "min" }, { kind: "num", value: 0 }, { kind: "max" }],
        }),
      ],
      [-10, 0, 10],
    );
    expect(createConditionalFormatResolver(sheet, evaluator)({ row: 1, column: 0 })).toEqual({
      fillColor: "#808080",
    });
    const visual = createConditionalFormatVisualResolver(sheet, evaluator)({ row: 0, column: 0 });
    expect(visual).toEqual({
      dataBar: {
        start: 0,
        end: 0.5,
        axis: 0.5,
        color: "#ff0000",
        negativeColor: "#ff0000",
        gradient: true,
        showValue: false,
        axisColor: "#000000",
        axisPosition: "automatic",
        axisVisible: true,
        direction: "context",
        negative: true,
      },
      iconSet: { iconSet: "threeArrows", iconIndex: 0, showValue: true },
    });
  });

  test("uses a stable full bar for an equal domain and honors stop-if-true for lower styles and visuals", () => {
    const { sheet, evaluator } = resolver(
      [
        {
          ...rule("stop", {
            kind: "dataBar",
            minimum: { kind: "num", value: 1 },
            maximum: { kind: "num", value: 1 },
            color: "#00ff00",
          }),
          stopIfTrue: true,
        },
        rule("icon", {
          kind: "iconSet",
          iconSet: "threeArrows",
          thresholds: [{ kind: "min" }, { kind: "percent", value: 50 }, { kind: "max" }],
        }),
        rule("style", { kind: "cellValue", operator: "equal", value: 1 }, { fillColor: "#ff0000" }),
      ],
      [1],
    );
    expect(createConditionalFormatVisualResolver(sheet, evaluator)({ row: 0, column: 0 })).toEqual({
      dataBar: {
        start: 0,
        end: 1,
        axis: 0,
        color: "#00ff00",
        gradient: true,
        showValue: true,
        axisColor: "#000000",
        axisPosition: "automatic",
        axisVisible: false,
        direction: "context",
        negative: false,
      },
    });
    expect(
      createConditionalFormatResolver(sheet, evaluator)({ row: 0, column: 0 }),
    ).toBeUndefined();
  });

  test("anchors bars at the correct edge for fully positive and fully negative domains", () => {
    const positive = resolver(
      [
        rule("bar", {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#00ff00",
        }),
      ],
      [2, 10],
    );
    expect(
      createConditionalFormatVisualResolver(
        positive.sheet,
        positive.evaluator,
      )({ row: 1, column: 0 })?.dataBar,
    ).toMatchObject({ start: 0, end: 1, axis: 0, color: "#00ff00" });
    const negative = resolver(
      [
        rule("bar", {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#00ff00",
          negativeColor: "#ff0000",
        }),
      ],
      [-10, -2],
    );
    expect(
      createConditionalFormatVisualResolver(
        negative.sheet,
        negative.evaluator,
      )({ row: 0, column: 0 })?.dataBar,
    ).toMatchObject({ start: 0, end: 1, axis: 1, color: "#ff0000" });
    const equalNegative = resolver(
      [
        rule("bar", {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#00ff00",
          negativeColor: "#ff0000",
        }),
      ],
      [-1],
    );
    expect(
      createConditionalFormatVisualResolver(
        equalNegative.sheet,
        equalNegative.evaluator,
      )({ row: 0, column: 0 })?.dataBar,
    ).toMatchObject({ start: 0, end: 1, axis: 1, color: "#ff0000" });
  });

  test("supports automatic bounds, axis modes, and right-to-left data bars", () => {
    const automatic = resolver(
      [
        rule("auto", {
          kind: "dataBar",
          minimum: { kind: "autoMin" },
          maximum: { kind: "autoMax" },
          color: "#00ff00",
        }),
      ],
      [2, 10],
    );
    expect(
      createConditionalFormatVisualResolver(
        automatic.sheet,
        automatic.evaluator,
      )({ row: 1, column: 0 })?.dataBar,
    ).toMatchObject({ start: 0, end: 1, axis: 0, axisVisible: false });

    const middle = resolver(
      [
        rule("middle", {
          kind: "dataBar",
          minimum: { kind: "num", value: -10 },
          maximum: { kind: "num", value: 10 },
          color: "#00ff00",
          negativeColor: "#ff0000",
          borderColor: "#008800",
          negativeBorderColor: "#880000",
          axisPosition: "middle",
          axisColor: "#123456",
          direction: "rightToLeft",
        }),
      ],
      [-10, 10],
    );
    expect(
      createConditionalFormatVisualResolver(middle.sheet, middle.evaluator)({ row: 0, column: 0 })
        ?.dataBar,
    ).toMatchObject({
      start: 0.5,
      end: 1,
      axis: 0.5,
      color: "#ff0000",
      negative: true,
      borderColor: "#008800",
      negativeBorderColor: "#880000",
      axisColor: "#123456",
      axisPosition: "middle",
      direction: "rightToLeft",
    });
    expect(
      createConditionalFormatVisualResolver(middle.sheet, middle.evaluator)({ row: 1, column: 0 })
        ?.dataBar,
    ).toMatchObject({ start: 0, end: 0.5, axis: 0.5, negative: false });

    const noAxis = resolver(
      [
        rule("none", {
          kind: "dataBar",
          minimum: { kind: "num", value: -10 },
          maximum: { kind: "num", value: 10 },
          color: "#00ff00",
          axisPosition: "none",
        }),
      ],
      [-10, 10],
    );
    expect(
      createConditionalFormatVisualResolver(noAxis.sheet, noAxis.evaluator)({ row: 1, column: 0 })
        ?.dataBar,
    ).toMatchObject({
      start: 0,
      end: 1,
      axis: 0,
      axisPosition: "none",
      axisVisible: false,
    });
  });

  test("accepts automatic bounds only in their matching data-bar position", () => {
    expect(() =>
      normalizeConditionalFormatRules([
        rule("valid", {
          kind: "dataBar",
          minimum: { kind: "autoMin" },
          maximum: { kind: "autoMax" },
          color: "#00ff00",
        }),
      ]),
    ).not.toThrow();
    expect(() =>
      normalizeConditionalFormatRules([
        rule("wrong-bound", {
          kind: "dataBar",
          minimum: { kind: "autoMax" },
          maximum: { kind: "max" },
          color: "#00ff00",
        }),
      ]),
    ).toThrow("conditional-formatting");
    expect(() =>
      normalizeConditionalFormatRules([
        rule("color-scale", {
          kind: "colorScale",
          stops: [
            { threshold: { kind: "autoMin" }, color: "#000000" },
            { threshold: { kind: "max" }, color: "#ffffff" },
          ],
        }),
      ]),
    ).toThrow("conditional-formatting");
  });
});
