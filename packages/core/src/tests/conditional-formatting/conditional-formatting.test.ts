import { describe, expect, test } from "vitest";
import {
  applyConditionalFormatStyle,
  createConditionalFormatResolver,
  normalizeConditionalFormatRules,
  type SheetConditionalFormatRule,
} from "../../conditional-formatting.js";
import { createTestWorkbook } from "../helpers.js";
import { createWorkbookEvaluator, getActiveSheet, setCellValue } from "../../workbook.js";

const range = { start: { row: 0, column: 0 }, end: { row: 9, column: 9 } };
function rule(
  id: string,
  condition: SheetConditionalFormatRule["condition"],
  style: SheetConditionalFormatRule["style"],
  stopIfTrue?: boolean,
): SheetConditionalFormatRule {
  return {
    id,
    ranges: [range],
    anchor: { row: 0, column: 0 },
    condition,
    style,
    ...(stopIfTrue ? { stopIfTrue } : {}),
  };
}

describe("conditional-formatting resolver", () => {
  test("merges first-winning properties while allowing lower priority properties", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 10);
    sheet.conditionalFormats = [
      rule(
        "high",
        { kind: "cellValue", operator: "greaterThan", value: 0 },
        { fillColor: "#ff0000", bold: false },
      ),
      rule(
        "low",
        { kind: "cellValue", operator: "greaterThan", value: 0 },
        { fillColor: "#0000ff", textColor: "#00ff00", bold: true, italic: true },
      ),
    ];
    expect(
      createConditionalFormatResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 0, column: 0 }),
    ).toEqual({
      fillColor: "#ff0000",
      textColor: "#00ff00",
      bold: false,
      italic: true,
    });
  });

  test("stop-if-true prevents subsequent matching rules", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "ready");
    sheet.conditionalFormats = [
      rule(
        "stop",
        { kind: "text", operator: "contains", text: "ead" },
        { fillColor: "#ff0000" },
        true,
      ),
      rule("later", { kind: "text", operator: "contains", text: "ead" }, { textColor: "#0000ff" }),
    ];
    expect(
      createConditionalFormatResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 0, column: 0 }),
    ).toEqual({ fillColor: "#ff0000" });
  });

  test("uses Excel-style case-insensitive text equality and permits a styleless stop rule", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "Overdue");
    sheet.conditionalFormats = [
      rule("stop", { kind: "cellValue", operator: "equal", value: "overdue" }, {}, true),
      rule("later", { kind: "text", operator: "contains", text: "over" }, { fillColor: "#ff0000" }),
    ];
    expect(
      createConditionalFormatResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 0, column: 0 }),
    ).toBeUndefined();
  });

  test("translates relative formula rules and preserves absolute references", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellValue(sheet, { row: 1, column: 0 }, 0);
    setCellValue(sheet, { row: 0, column: 1 }, 1);
    setCellValue(sheet, { row: 1, column: 1 }, 0);
    sheet.conditionalFormats = [
      rule("formula", { kind: "formula", formula: "=A1=$A$1" }, { fillColor: "#123456" }),
    ];
    const resolve = createConditionalFormatResolver(
      sheet,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    expect(resolve({ row: 0, column: 1 })).toEqual({ fillColor: "#123456" });
    expect(resolve({ row: 1, column: 1 })).toBeUndefined();
  });

  test("handles blanks, errors, and duplicate values without treating errors as duplicates", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "Same");
    setCellValue(sheet, { row: 1, column: 0 }, "same");
    setCellValue(sheet, { row: 2, column: 0 }, "");
    setCellValue(sheet, { row: 3, column: 0 }, "  ");
    setCellValue(sheet, { row: 4, column: 0 }, "\t");
    sheet.conditionalFormats = [
      rule("duplicates", { kind: "duplicate", unique: false }, { fillColor: "#ff0000" }),
      rule("blanks", { kind: "blank", blank: true }, { textColor: "#0000ff" }),
    ];
    const resolve = createConditionalFormatResolver(
      sheet,
      createWorkbookEvaluator(workbook, sheet.id),
    );
    expect(resolve({ row: 0, column: 0 })).toEqual({ fillColor: "#ff0000" });
    expect(resolve({ row: 1, column: 0 })).toEqual({ fillColor: "#ff0000" });
    expect(resolve({ row: 2, column: 0 })).toEqual({ textColor: "#0000ff" });
    expect(resolve({ row: 3, column: 0 })).toEqual({ textColor: "#0000ff" });
    expect(resolve({ row: 4, column: 0 })).toBeUndefined();
  });

  test("keeps the persisted style immutable and clears incompatible fill representations", () => {
    const base = {
      fillGradient: {
        type: "linear" as const,
        angle: 0,
        stops: [
          { position: 0, color: "#ffffff" },
          { position: 1, color: "#000000" },
        ],
      },
      bold: true as const,
      italic: true as const,
    };
    const result = applyConditionalFormatStyle(base, {
      fillColor: "#abcdef",
      bold: false,
      italic: false,
    });
    expect(result).toEqual({ fillColor: "#abcdef" });
    expect(base).toEqual({ fillGradient: base.fillGradient, bold: true, italic: true });
    expect(applyConditionalFormatStyle(base, undefined)).toBe(base);
  });
});

describe("conditional-formatting normalization", () => {
  test("normalizes range direction and rejects duplicate IDs and invalid formulas", () => {
    const normalized = normalizeConditionalFormatRules([
      {
        ...rule(
          "one",
          { kind: "cellValue", operator: "between", value: 1, secondValue: 2 },
          { fillColor: "#abcdef" },
        ),
        ranges: [{ start: { row: 2, column: 3 }, end: { row: 1, column: 0 } }],
      },
    ]);
    expect(normalized[0]?.ranges[0]).toEqual({
      start: { row: 1, column: 0 },
      end: { row: 2, column: 3 },
    });
    expect(() =>
      normalizeConditionalFormatRules([
        rule("same", { kind: "formula", formula: "=A1" }, { fillColor: "#abcdef" }),
        rule("same", { kind: "formula", formula: "=" }, { fillColor: "#abcdef" }),
      ]),
    ).toThrow("conditional-formatting");
  });
});

describe("conditional-formatting custom styles", () => {
  test("normalizes, deep-clones, merges, and applies every supported style field", () => {
    const gradient = {
      type: "linear" as const,
      angle: 45,
      stops: [
        { position: 0, color: "#112233" },
        { position: 1, color: "#AABBCC" },
      ],
    };
    const normalized = normalizeConditionalFormatRules([
      rule(
        "custom",
        { kind: "cellValue", operator: "greaterThan", value: 0 },
        {
          fontFamily: "Arial",
          fontSize: 14,
          fontScript: "superscript",
          bold: false,
          italic: true,
          underline: "double",
          strikethrough: true,
          textColor: "#123456",
          fillGradient: gradient,
          numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 },
          borderTop: { style: "thin", color: "#654321" },
          borderDiagonalDown: null,
        },
      ),
    ])[0]!;
    gradient.stops[0]!.color = "#FFFFFF";
    expect(normalized.style).toMatchObject({
      fontFamily: "Arial",
      fontSize: 14,
      fontScript: "superscript",
      bold: false,
      italic: true,
      underline: "double",
      strikethrough: true,
      textColor: "#123456",
      borderTop: { style: "thin", color: "#654321" },
      borderDiagonalDown: false,
    });
    const normalizedGradient = normalized.style.fillGradient;
    expect(normalizedGradient).not.toBe(false);
    expect(normalizedGradient).not.toBeNull();
    if (!normalizedGradient) throw new Error("Expected gradient");
    expect(normalizedGradient.stops[0]).toEqual({ position: 0, color: "#112233" });

    const applied = applyConditionalFormatStyle(
      {
        bold: true,
        borderDiagonalDown: { style: "dashed", color: "#000000" },
        fillColor: "#FFFFFF",
      },
      normalized.style,
    );
    expect(applied).toMatchObject({
      fontFamily: "Arial",
      fontSize: 14,
      fontScript: "superscript",
      italic: true,
      underline: "double",
      strikethrough: true,
      textColor: "#123456",
      fillGradient: { type: "linear", angle: 45 },
      borderTop: { style: "thin", color: "#654321" },
    });
    expect(applied?.bold).toBeUndefined();
    expect(applied?.borderDiagonalDown).toBeUndefined();
    expect(applied?.fillColor).toBeUndefined();
  });

  test("keeps the first matching rule's explicit clear for each style property", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    sheet.conditionalFormats = [
      rule("high", { kind: "cellValue", operator: "greaterThan", value: 0 }, { underline: false }),
      rule(
        "low",
        { kind: "cellValue", operator: "greaterThan", value: 0 },
        { underline: true, borderLeft: { style: "double", color: "#123456" } },
      ),
    ];
    expect(
      createConditionalFormatResolver(
        sheet,
        createWorkbookEvaluator(workbook, sheet.id),
      )({ row: 0, column: 0 }),
    ).toEqual({ underline: false, borderLeft: { style: "double", color: "#123456" } });
  });
});

test("treats fill representations as one priority family across matching rules", () => {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  setCellValue(sheet, { row: 0, column: 0 }, 1);
  sheet.conditionalFormats = [
    rule(
      "solid",
      { kind: "cellValue", operator: "greaterThan", value: 0 },
      { fillColor: "#AABBCC" },
    ),
    rule(
      "gradient",
      { kind: "cellValue", operator: "greaterThan", value: 0 },
      {
        fillGradient: {
          type: "linear",
          angle: 90,
          stops: [
            { position: 0, color: "#112233" },
            { position: 1, color: "#445566" },
          ],
        },
      },
    ),
  ];
  const overlay = createConditionalFormatResolver(
    sheet,
    createWorkbookEvaluator(workbook, sheet.id),
  )({ row: 0, column: 0 });
  expect(overlay).toEqual({ fillColor: "#AABBCC" });
  expect(applyConditionalFormatStyle(undefined, overlay)).toEqual({ fillColor: "#aabbcc" });
});

test("keeps a matching rule's background and pattern together", () => {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  setCellValue(sheet, { row: 0, column: 0 }, 1);
  sheet.conditionalFormats = [
    rule(
      "pattern",
      { kind: "cellValue", operator: "greaterThan", value: 0 },
      { fillColor: "#AABBCC", fillPattern: "lightGrid", fillPatternColor: "#112233" },
    ),
  ];
  expect(
    createConditionalFormatResolver(
      sheet,
      createWorkbookEvaluator(workbook, sheet.id),
    )({
      row: 0,
      column: 0,
    }),
  ).toEqual({
    fillColor: "#AABBCC",
    fillPattern: "lightGrid",
    fillPatternColor: "#112233",
  });
});
