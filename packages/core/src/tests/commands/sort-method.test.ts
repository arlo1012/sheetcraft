import { describe, expect, test } from "vitest";
import {
  createMultiKeySortSheetRangeCommand,
  tryApplyWorkbookCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function writeValues(values: readonly string[]) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  for (const [row, value] of values.entries()) {
    setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
  }
  return { session, sheet };
}

function readValues(
  sheet: ReturnType<typeof getActiveSheet>,
  count: number,
): Array<string | undefined> {
  return Array.from({ length: count }, (_, row) => {
    const content = getCellContent(sheet, { row, column: 0 });
    return content?.kind === "literal" && typeof content.value === "string"
      ? content.value
      : undefined;
  });
}

describe("Chinese sort methods", () => {
  test("sorts with pinyin collation and restores the original rows through undo and redo", () => {
    const values = ["张", "李", "王", "A", "a", "B", "b"];
    const { session, sheet } = writeValues(values);
    const command = createMultiKeySortSheetRangeCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: values.length - 1, column: 0 } },
      [{ column: 0, direction: "ascending" }],
      { sortMethod: "pinyin", caseSensitive: true },
    );

    expect(command.sortMethod).toBe("pinyin");
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(readValues(sheet, values.length)).toEqual(["李", "王", "张", "A", "a", "B", "b"]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(readValues(sheet, values.length)).toEqual(values);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(readValues(sheet, values.length)).toEqual(["李", "王", "张", "A", "a", "B", "b"]);
  });

  test("uses stroke collation for the same Chinese values", () => {
    const values = ["张", "李", "王"];
    const { session, sheet } = writeValues(values);

    expect(
      executeWorkbookCommand(
        session,
        createMultiKeySortSheetRangeCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: values.length - 1, column: 0 } },
          [{ column: 0, direction: "ascending" }],
          { sortMethod: "stroke" },
        ),
      ),
    ).toBe(true);
    expect(readValues(sheet, values.length)).toEqual(["王", "张", "李"]);
  });

  test("rejects an unknown sort method without mutating the sheet", () => {
    const { session, sheet } = writeValues(["张", "李"]);
    const before = createSheetSparseState(sheet);
    const command: WorkbookCommand = {
      type: "sortSheetRange",
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      keyColumn: 0,
      direction: "ascending",
      sortMethod: "radical" as never,
    };

    expect(tryApplyWorkbookCommand(session.workbook, command)).toMatchObject({
      ok: false,
      error: { code: "invalid_command_payload" },
    });
    expect(createSheetSparseState(sheet)).toEqual(before);
  });
});
