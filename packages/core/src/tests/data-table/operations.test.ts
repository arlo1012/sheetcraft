import { describe, expect, test } from "vitest";
import { createDataTableCommand, previewDataTable } from "../../data-table.js";
import { serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

function fixture() {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
  setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: 2 });
  setCellContent(sheet, { row: 1, column: 3 }, { kind: "formula", formula: { source: "=A1*2" } });
  return {
    workbook,
    sheet,
    request: {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 3 }, end: { row: 1, column: 4 } },
      rowInput: { sheetId: sheet.id, address: { row: 0, column: 0 } },
    },
  };
}
function rejected(reason: string, mutate: (f: ReturnType<typeof fixture>) => void) {
  const f = fixture();
  mutate(f);
  const before = serializeWorkbook(f.workbook);
  expect(previewDataTable(f.workbook, f.request)).toMatchObject({ ok: false, reason });
  expect(() => createDataTableCommand(f.workbook, f.request)).toThrow();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
}

describe("Data Table validation", () => {
  test("rejects protected, merged, and table-overlapping inputs without mutation", () => {
    rejected("protected", (f) => {
      f.sheet.properties.protected = true;
    });
    rejected("overlap", (f) => {
      f.sheet.mergedCells = [{ start: { row: 1, column: 4 }, end: { row: 1, column: 5 } }];
    });
    rejected("overlap", (f) => {
      f.request.rowInput.address = { row: 1, column: 4 };
    });
  });

  test("rejects duplicate inputs and non-finite headers", () => {
    const f = fixture();
    const duplicate = {
      ...f.request,
      columnInput: { sheetId: f.sheet.id, address: { row: 0, column: 0 } },
    };
    expect(previewDataTable(f.workbook, duplicate)).toMatchObject({
      ok: false,
      reason: "invalid-input",
    });
    setCellContent(
      f.sheet,
      { row: 0, column: 4 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    expect(previewDataTable(f.workbook, f.request)).toMatchObject({
      ok: false,
      reason: "invalid-input",
    });
  });

  test("rejects dynamic-array spill projections as inputs", () => {
    const f = fixture();
    setCellContent(
      f.sheet,
      { row: 3, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    f.request.rowInput.address = { row: 4, column: 0 };
    expect(previewDataTable(f.workbook, f.request)).toMatchObject({ ok: false, reason: "overlap" });
  });

  test("rejects formula results that violate stopping data validation without mutation", () => {
    const f = fixture();
    f.sheet.dataValidations = [
      {
        id: "limit",
        range: { start: { row: 1, column: 4 }, end: { row: 1, column: 4 } },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "3",
        allowBlank: false,
        showError: true,
      },
    ];
    const before = serializeWorkbook(f.workbook);
    expect(previewDataTable(f.workbook, f.request)).toMatchObject({
      ok: false,
      reason: "formula-error",
    });
    expect(() => createDataTableCommand(f.workbook, f.request)).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
