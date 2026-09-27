import { describe, expect, test } from "vitest";
import { createSheet, createWorkbook } from "@idea10/core/workbook";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";

describe("range references", () => {
  test("formats absolute sheet-qualified references", () => {
    expect(
      formatRangeReference("North America", {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 2 },
      }),
    ).toBe("='North America'!$A$1:$C$5");
  });

  test("resolves absolute, quoted-sheet, and scoped defined-name references", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "summary" });
    const summary = workbook.sheets.get("summary")!;
    summary.name = "Summary";
    const inputs = createSheet("North America", "inputs");
    workbook.sheets.set(inputs.id, inputs);
    workbook.definedNames.set("global:Sales", {
      id: "global:Sales",
      name: "Sales",
      reference: {
        sheetId: inputs.id,
        start: { row: 0, column: 0 },
        end: { row: 4, column: 2 },
      },
    });
    workbook.definedNames.set("summary:Sales", {
      id: "summary:Sales",
      name: "Sales",
      scopeSheetId: summary.id,
      reference: {
        sheetId: summary.id,
        start: { row: 2, column: 1 },
        end: { row: 2, column: 1 },
      },
    });

    expect(resolveRangeReference(workbook, "$A$1:$C$5", summary.id)).toEqual({
      sheetId: summary.id,
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    });
    expect(resolveRangeReference(workbook, "='North America'!$A$1:$C$5", summary.id)).toEqual({
      sheetId: inputs.id,
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    });
    expect(resolveRangeReference(workbook, "=Sales", summary.id)).toEqual({
      sheetId: summary.id,
      range: { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
    });
  });

  test("rejects expressions, unions, and out-of-bounds references", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "summary" });
    expect(resolveRangeReference(workbook, "=SUM(A1:A2)", "summary")).toBeUndefined();
    expect(resolveRangeReference(workbook, "=A1,B2", "summary")).toBeUndefined();
    expect(resolveRangeReference(workbook, "=XFE1", "summary")).toBeUndefined();
  });
});
