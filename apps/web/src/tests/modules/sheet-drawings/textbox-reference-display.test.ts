// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import { createSheetDisplaySnapshot } from "../../../modules/sheet-grid/canvas/sheet-display-snapshot";
import { createTextBoxReferenceResolver } from "../../../modules/sheet-drawings/textbox-reference-display";

function fixture() {
  const workbook = createWorkbook({ id: "linked-text", sheetId: "owner" });
  const owner = getActiveSheet(workbook);
  const source = createSheet("Source name", "stable-source-id");
  workbook.sheets.set(source.id, source);
  const cell = { row: 0, column: 0 };
  const reference = { sheetId: source.id, cell };
  return { workbook, owner, source, cell, reference };
}

describe("single-cell text box reference display", () => {
  test("resolves table number formats then direct overrides, without transferring cell appearance", () => {
    const { workbook, source, reference } = fixture();
    source.cells.set("0:0", { content: { kind: "literal", value: 0.25 } });
    source.tables = [
      {
        id: "source-table",
        name: "Table",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        columns: [{ id: "value", name: "Value" }],
        style: {
          id: "custom",
          name: "Custom",
          category: "custom",
          elements: {
            wholeTable: {
              style: {
                numberFormat: { kind: "percent", fractionDigits: 2 },
                textColor: "#ff0000",
                fontSize: 50,
              },
            },
          },
        },
        headerRow: false,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: false,
        bandedColumns: false,
        filterButton: false,
        filter: null,
      },
    ];
    const resolver = createTextBoxReferenceResolver({
      workbook,
      evaluator: createWorkbookEvaluator(workbook, "owner"),
      locale: "en-US",
    });
    expect(resolver.resolve(reference)).toEqual({ status: "ready", text: "25.00%" });
    source.cells.get("0:0")!.style = { numberFormat: { kind: "custom", code: '0.0" direct"' } };
    expect(resolver.resolve(reference)).toEqual({ status: "ready", text: "0.3 direct" });
  });

  test("formats current source values and number format without changing the source", () => {
    const { workbook, source, reference, cell } = fixture();
    source.cells.set("0:0", {
      content: { kind: "literal", value: 1234.5 },
      style: {
        numberFormat: { kind: "number", fractionDigits: 2, useGrouping: true },
        textColor: "#ff0000",
        fontSize: 50,
        bold: true,
      },
    });
    const before = JSON.stringify([...source.cells]);
    const evaluator = createWorkbookEvaluator(workbook, "owner");
    const resolver = createTextBoxReferenceResolver({ workbook, evaluator, locale: "de-DE" });
    const first = resolver.resolve(reference);
    expect(first).toEqual({ status: "ready", text: "1.234,50" });
    expect(JSON.stringify([...source.cells])).toBe(before);
    source.name = "Renamed without rebinding";
    expect(resolver.resolve(reference)).toEqual(first);
    source.cells.set("0:0", {
      content: { kind: "literal", value: 0.125 },
      style: { numberFormat: { kind: "percent", fractionDigits: 1 } },
    });
    expect(resolver.resolve(reference)).toEqual({
      status: "ready",
      text: formatCellNumberValue(0.125, source.cells.get("0:0")!.style!.numberFormat, {
        locale: "de-DE",
        dateSystem: workbook.dateSystem,
      }).text,
    });
    expect(cell).toEqual({ row: 0, column: 0 });
  });

  test("uses the same conditional and spill-root number formats as source cell display", () => {
    const { workbook, source, reference } = fixture();
    source.cells.set("0:0", {
      content: { kind: "formula", formula: { source: "=SEQUENCE(1,2)" } },
      style: { numberFormat: { kind: "percent", fractionDigits: 1 } },
    });
    source.conditionalFormats = [
      {
        id: "format",
        anchor: { row: 0, column: 1 },
        ranges: [{ start: { row: 0, column: 1 }, end: { row: 0, column: 1 } }],
        condition: { kind: "cellValue", operator: "greaterThan", value: 1 },
        style: { numberFormat: { kind: "custom", code: '0.00" units"' }, textColor: "#ff0000" },
      },
    ];
    const evaluator = createWorkbookEvaluator(workbook, "owner");
    const resolver = createTextBoxReferenceResolver({ workbook, evaluator, locale: "en-US" });
    const target = { ...reference, cell: { row: 0, column: 1 } };
    expect(resolver.resolve(target)).toEqual({ status: "ready", text: "2.00 units" });
    const display = createSheetDisplaySnapshot({
      sheet: source,
      evaluator: evaluator.forSheet!(source.id),
    });
    expect(resolver.resolve(target)).toEqual({
      status: "ready",
      text: formatCellNumberValue(
        display.getComputedValue(target.cell),
        display.getCellStyle(target.cell)?.numberFormat,
      ).text,
    });
    source.conditionalFormats = [];
    expect(resolver.resolve(target)).toEqual({ status: "ready", text: "200.0%" });
  });

  test.each(["1900", "1904"] as const)("honors workbook %s date system", (dateSystem) => {
    const { workbook, source, reference } = fixture();
    workbook.dateSystem = dateSystem;
    source.cells.set("0:0", {
      content: { kind: "literal", value: 1 },
      style: { numberFormat: { kind: "custom", code: "yyyy-mm-dd" } },
    });
    const resolver = createTextBoxReferenceResolver({
      workbook,
      evaluator: createWorkbookEvaluator(workbook, "owner"),
      locale: "en-US",
    });
    expect(resolver.resolve(reference)).toEqual({
      status: "ready",
      text: dateSystem === "1904" ? "1904-01-02" : "1900-01-01",
    });
  });

  test("preserves blank, error and broken-reference meanings", () => {
    const { workbook, source, reference } = fixture();
    const resolver = createTextBoxReferenceResolver({
      workbook,
      evaluator: createWorkbookEvaluator(workbook, "owner"),
      locale: "en-US",
    });
    expect(resolver.resolve(reference)).toEqual({ status: "ready", text: "" });
    source.cells.set("0:0", {
      content: { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
    });
    expect(resolver.resolve(reference)).toEqual({ status: "ready", text: "#DIV/0!" });
    expect(resolver.resolve({ ...reference, cell: null })).toEqual({
      status: "ready",
      text: "#REF!",
    });
    workbook.sheets.delete(source.id);
    expect(resolver.resolve(reference)).toEqual({ status: "ready", text: "#REF!" });
  });

  test("reuses the supplied calculation cycle, including manual cached values", () => {
    const { workbook, source, reference } = fixture();
    source.cells.set("0:0", { content: { kind: "formula", formula: { source: "=40+2" } } });
    const manual = createWorkbookEvaluator(workbook, "owner", { getCachedFormulaValue: () => 7 });
    expect(
      createTextBoxReferenceResolver({ workbook, evaluator: manual, locale: "en-US" }).resolve(
        reference,
      ),
    ).toEqual({ status: "ready", text: "7" });
    const recalculated = createWorkbookEvaluator(workbook, "owner");
    expect(
      createTextBoxReferenceResolver({
        workbook,
        evaluator: recalculated,
        locale: "en-US",
      }).resolve(reference),
    ).toEqual({ status: "ready", text: "42" });
  });

  test("memoizes only within a pass and does not evaluate unrelated worksheet formulas", () => {
    const { workbook, reference } = fixture();
    const getComputedValue = vi.fn(() => 12);
    const forSheet = vi.fn(() => ({ getComputedValue }));
    const evaluator: SheetEvaluator = { getComputedValue: vi.fn(), forSheet };
    const resolver = createTextBoxReferenceResolver({ workbook, evaluator, locale: "en-US" });
    const pass = resolver.createPass!();
    expect(pass.resolve(reference)).toEqual({ status: "ready", text: "12" });
    pass.resolve({ ...reference, cell: { ...reference.cell } });
    expect(forSheet).toHaveBeenCalledExactlyOnceWith(reference.sheetId);
    expect(getComputedValue).toHaveBeenCalledExactlyOnceWith(reference.cell);
    resolver.resolve(reference);
    expect(getComputedValue).toHaveBeenCalledTimes(2);
    expect(evaluator.getComputedValue).not.toHaveBeenCalled();
  });

  test("reports unavailable context, evaluator failures and oversized text rather than empty text", () => {
    const { workbook, reference } = fixture();
    const resolve = (evaluator: SheetEvaluator) =>
      createTextBoxReferenceResolver({
        workbook,
        evaluator,
        locale: "en-US",
      }).resolve(reference);
    expect(resolve({ getComputedValue: () => 1 })).toMatchObject({
      status: "unavailable",
      reason: "evaluator-unavailable",
    });
    expect(
      resolve({
        getComputedValue: () => 1,
        forSheet: () => {
          throw new Error("cycle unavailable");
        },
      }),
    ).toEqual({ status: "unavailable", reason: "evaluation-failed", message: "cycle unavailable" });
    expect(
      resolve({
        getComputedValue: () => 1,
        forSheet: () => ({ getComputedValue: () => "x".repeat(100001) }),
      }),
    ).toMatchObject({ status: "unavailable", reason: "display-budget" });
  });
});
