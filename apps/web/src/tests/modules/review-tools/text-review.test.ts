import { createSequentialIdFactory } from "@idea10/core/runtime";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  getCellContent,
  setCellNote,
  getCellNote,
  getCellStyle,
} from "@idea10/core/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import {
  collectReviewText,
  createReviewTextCommand,
  replaceSpellingIssues,
} from "../../../modules/review-tools/text-review";
const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
describe("text review", () => {
  test("collects only editable literal text in the requested selection", () => {
    const workbook = createWorkbook({ id: "text-review", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "helo" });
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: '= "helo"' } },
    );
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: 42 });
    setCellContent(sheet, { row: 9, column: 0 }, { kind: "literal", value: "outside" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "locked" });
    setCellStyle(sheet, { row: 0, column: 0 }, { unlocked: true });
    sheet.properties.protected = true;
    const result = collectReviewText(workbook, sheet.id, range, "selection");
    expect(result.cells.map((cell) => cell.text)).toEqual(["helo"]);
    expect(result.skipped).toBe(1);
  });
  test("replaces multiple offsets without corrupting later words; one undo preserves formatting and notes", () => {
    const workbook = createWorkbook({ id: "text-review", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook);
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "helo helo" });
    setCellStyle(sheet, address, { bold: true });
    setCellNote(sheet, address, { text: "keep" });
    const { cells } = collectReviewText(workbook, sheet.id, range, "sheet");
    const changes = replaceSpellingIssues(
      cells,
      [
        { cell: 0, start: 0, end: 4, word: "helo", suggestions: [] },
        { cell: 0, start: 5, end: 9, word: "helo", suggestions: [] },
      ],
      "hello",
    );
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    executeWorkbookCommand(session, createReviewTextCommand(workbook, cells, changes));
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "hello hello" });
    expect(getCellStyle(sheet, address)?.bold).toBe(true);
    expect(getCellNote(sheet, address)?.text).toBe("keep");
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "helo helo" });
  });
  test("rejects stale previews before creating any changes", () => {
    const workbook = createWorkbook({ id: "text-review", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook),
      address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "汉语" });
    const { cells } = collectReviewText(workbook, sheet.id, range, "sheet");
    setCellContent(sheet, address, { kind: "literal", value: "new" });
    expect(() => createReviewTextCommand(workbook, cells, [{ cell: 0, text: "漢語" }])).toThrow(
      "stale-text-review",
    );
  });
});
