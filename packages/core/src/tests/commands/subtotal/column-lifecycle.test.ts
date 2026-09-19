import { expect, test, vi } from "vitest";
import {
  createApplySubtotalsCommand,
  createRemoveSubtotalsCommand,
} from "../../../commands/subtotal.js";
import * as structure from "../../../commands/structure.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../../history.js";
import { serializeWorkbook } from "../../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  getCellValue,
  getCellContent,
  setCellValue,
  setCellContent,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  [
    ["Group", "Amount"],
    ["A", 2],
    ["A", 3],
    ["B", 4],
  ].forEach((values, row) =>
    values.forEach((value, column) =>
      setCellValue(sheet, { row: row + 2, column: column + 4 }, value),
    ),
  );
  setCellValue(sheet, { row: 0, column: 3 }, "left neighbor");
  setCellValue(sheet, { row: 0, column: 7 }, "right neighbor");
  const other = createSheet("Other", "other");
  session.workbook.sheets.set(other.id, other);
  setCellContent(
    other,
    { row: 0, column: 0 },
    { kind: "formula", formula: { source: `=${sheet.name}!F4` } },
  );
  session.workbook.definedNames.set("source", {
    id: "source",
    name: "source",
    reference: { sheetId: sheet.id, start: { row: 3, column: 5 }, end: { row: 3, column: 5 } },
  });
  const command = createApplySubtotalsCommand(
    sheet.id,
    { start: { row: 2, column: 4 }, end: { row: 5, column: 5 } },
    [4],
    [4, 5],
    "sum",
    {
      hasHeader: true,
      labels: { subtotal: "Subtotal", grandTotal: "Total" },
      replaceExisting: true,
    },
  );
  return { session, sheet, other, command };
}

test("inserting and removing label columns preserves neighbors, cross-sheet references, and history", () => {
  const { session, sheet, other, command } = fixture();
  const before = serializeWorkbook(session.workbook);
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect(getCellValue(sheet, { row: 0, column: 3 })).toBe("left neighbor");
  expect(getCellValue(sheet, { row: 0, column: 8 })).toBe("right neighbor");
  expect(getCellContent(other, { row: 0, column: 0 })).toMatchObject({
    formula: { source: `=${sheet.name}!G4` },
  });
  expect(session.workbook.definedNames.get("source")?.reference.start).toEqual({
    row: 3,
    column: 6,
  });
  const applied = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(applied);
  expect(executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id))).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(applied);
});

test("keeps user content subsequently added to the generated label column", () => {
  const { session, sheet, command } = fixture();
  executeWorkbookCommand(session, command);
  setCellValue(sheet, { row: 0, column: 4 }, "keep my note");
  executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id));
  expect(getCellValue(sheet, { row: 0, column: 4 })).toBe("keep my note");
  expect(getCellValue(sheet, { row: 2, column: 5 })).toBe("Group");
  expect(getCellValue(sheet, { row: 0, column: 8 })).toBe("right neighbor");
  expect(sheet.subtotalMetadata).toEqual([]);
});

test("rolls back the new column and external references when a later row insertion fails", () => {
  const { session, command } = fixture();
  const before = serializeWorkbook(session.workbook);
  const original = structure.applySheetAxisCommand;
  const failure = vi.spyOn(structure, "applySheetAxisCommand").mockImplementation((...args) => {
    const result = original(...args);
    if (args[1].axis === "row") throw new Error("row insertion failed");
    return result;
  });
  try {
    expect(() => executeWorkbookCommand(session, command)).toThrow("row insertion failed");
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  } finally {
    failure.mockRestore();
  }
});
