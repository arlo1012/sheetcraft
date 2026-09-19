import { expect, test, vi } from "vitest";
import { createApplySubtotalsCommand } from "../../../commands/subtotal.js";
import * as structure from "../../../commands/structure.js";
import { executeWorkbookCommand } from "../../../history.js";
import { serializeWorkbook } from "../../../serialization.js";
import { createSheet, getActiveSheet, setCellContent, setCellValue } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

test("restores the entire edit when replacing subtotals fails after deleting old rows", () => {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const other = createSheet("Other", "other");
  session.workbook.sheets.set(other.id, other);
  setCellValue(sheet, { row: 0, column: 0 }, "A");
  setCellValue(sheet, { row: 1, column: 0 }, "A");
  setCellContent(
    other,
    { row: 0, column: 0 },
    {
      kind: "formula",
      formula: { source: `=${sheet.name}!A3` },
    },
  );
  const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } };
  executeWorkbookCommand(session, createApplySubtotalsCommand(sheet.id, range, [0], [0], "count"));
  const before = serializeWorkbook(session.workbook);
  const historySize = session.history.undoStack.length;
  const original = structure.applySheetAxisCommand;
  let deletions = 0;
  const failure = vi.spyOn(structure, "applySheetAxisCommand").mockImplementation((...args) => {
    const result = original(...args);
    if (args[1].type === "deleteSheetAxis" && ++deletions === 2)
      throw new Error("Injected failure after old subtotal deletion");
    return result;
  });
  try {
    expect(() =>
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(sheet.id, range, [0], [0], "product", {
          replaceExisting: true,
        }),
      ),
    ).toThrow("Injected failure");
    expect(deletions).toBe(2);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(historySize);
  } finally {
    failure.mockRestore();
  }
});

test("can replace the same subtotal range repeatedly with generated identifiers", () => {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  setCellValue(sheet, { row: 0, column: 0 }, "A");
  setCellValue(sheet, { row: 1, column: 0 }, "A");
  const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } };
  for (let iteration = 0; iteration < 4; iteration += 1) {
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(sheet.id, range, [0], [0], "count", { replaceExisting: true }),
      ),
    ).toBe(true);
    expect(sheet.subtotalMetadata).toHaveLength(1);
    expect(sheet.subtotalMetadata?.[0]?.generatedRows).toEqual([2, 3]);
  }
});
