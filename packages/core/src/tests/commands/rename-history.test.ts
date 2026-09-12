import { expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createRenameSheetCommand,
  createUpsertDefinedNameCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheet,
  getActiveSheet,
  getCellContent,
  insertSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

test.each(["sheet", "name"] as const)(
  "undoing a %s rename with no affected formulas preserves unresolved references",
  (kind) => {
    const session = createTestWorkbookSession();
    const workbook = session.workbook;
    const sheet = getActiveSheet(workbook);
    const data = createSheet("Source", "source");
    insertSheet(workbook, data);
    applyWorkbookCommand(
      workbook,
      createUpsertDefinedNameCommand(workbook, {
        id: "range",
        name: "OriginalName",
        reference: "=Source!A1",
      }),
    );
    const source = kind === "sheet" ? "=Future!A1" : "=FutureName";
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source } });
    const command =
      kind === "sheet"
        ? createRenameSheetCommand(data.id, "Future")
        : createUpsertDefinedNameCommand(workbook, {
            id: "range",
            name: "FutureName",
            reference: "=Source!A1",
          });
    executeWorkbookCommand(session, command);
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source },
    });
    redoWorkbookCommand(session);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source },
    });
  },
);
