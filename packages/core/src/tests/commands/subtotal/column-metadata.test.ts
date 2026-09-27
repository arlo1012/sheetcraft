import { expect, test } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
} from "../../../commands/structure.js";
import { executeWorkbookCommand } from "../../../history.js";
import { getActiveSheet, getSheetMetadata, setSheetMetadata } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

test("tracks generated subtotal columns through column structure commands", () => {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  setSheetMetadata(sheet, {
    ...getSheetMetadata(sheet),
    subtotalMetadata: [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
        generatedRows: [1],
        generatedColumns: [1, 3],
      },
    ],
  });

  expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "column", 2))).toBe(
    true,
  );
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([1, 4]);

  expect(executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 1))).toBe(
    true,
  );
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([3]);

  expect(
    executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "column", 3, 1, 5)),
  ).toBe(true);
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([5]);
});

test("clones generated subtotal columns when changing rows", () => {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  setSheetMetadata(sheet, {
    ...getSheetMetadata(sheet),
    subtotalMetadata: [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
        generatedRows: [1],
        generatedColumns: [2],
      },
    ],
  });
  const columns = sheet.subtotalMetadata![0]!.generatedColumns;

  expect(executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 1))).toBe(
    true,
  );
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([2]);
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).not.toBe(columns);
});
