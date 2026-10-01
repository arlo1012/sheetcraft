import { describe, expect, test } from "vitest";
import {
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createSetSheetPageSetupCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { DEFAULT_SHEET_PAGE_SETUP, getPagePaperSize } from "../../page-setup.js";
import { deserializeSheet, serializeSheet } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet page setup", () => {
  test("persists a canonical setup and restores it through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const setup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      orientation: "landscape" as const,
      scale: 85,
      printArea: { start: { row: 4, column: 3 }, end: { row: 1, column: 1 } },
      rowBreaks: [10, 4, 10],
      columnBreaks: [8, 2, 2],
      header: { left: "&F", center: "Report", right: "&P" },
    };
    expect(executeWorkbookCommand(session, createSetSheetPageSetupCommand(sheet.id, setup))).toBe(
      true,
    );
    expect(sheet.pageSetup).toMatchObject({
      orientation: "landscape",
      printArea: { start: { row: 1, column: 1 }, end: { row: 4, column: 3 } },
      rowBreaks: [4, 10],
      columnBreaks: [2, 8],
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageSetup).toEqual(DEFAULT_SHEET_PAGE_SETUP);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet))).pageSetup).toEqual(
      sheet.pageSetup,
    );
  });

  test("keeps page references valid when rows and columns are structured", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        printArea: { start: { row: 2, column: 2 }, end: { row: 5, column: 5 } },
        rowBreaks: [3, 7],
        columnBreaks: [3],
      }),
    );
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 3, 2));
    executeWorkbookCommand(session, createMoveSheetAxisCommand(sheet.id, "column", 2, 1, 5));
    expect(sheet.pageSetup).toMatchObject({
      // Moving the leading printed column into the middle would split the area,
      // so retaining a stale rectangle is worse than clearing it.
      printArea: null,
      rowBreaks: [5, 9],
      columnBreaks: [2],
    });
  });

  test("returns paper dimensions after orientation", () => {
    expect(getPagePaperSize(DEFAULT_SHEET_PAGE_SETUP)).toEqual({ width: 210, height: 297 });
    expect(getPagePaperSize({ paperSize: "letter", orientation: "landscape" })).toEqual({
      width: 279.4,
      height: 215.9,
    });
  });

  test("does not mutate the shared default and rejects protected or invalid page settings", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const input = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      margins: { ...DEFAULT_SHEET_PAGE_SETUP.margins, top: 25 },
      header: { ...DEFAULT_SHEET_PAGE_SETUP.header, center: "Draft" },
    };
    const command = createSetSheetPageSetupCommand(sheet.id, input);
    input.margins.top = 30;
    input.header.center = "Changed outside command";
    expect(command.pageSetup).toMatchObject({ margins: { top: 25 }, header: { center: "Draft" } });
    expect(DEFAULT_SHEET_PAGE_SETUP).toMatchObject({
      margins: { top: 19.05 },
      header: { center: "" },
    });

    sheet.properties.protected = true;
    expect(tryApplyWorkbookCommand(session.workbook, command).ok).toBe(false);
    sheet.properties.protected = false;
    expect(() =>
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        margins: { ...DEFAULT_SHEET_PAGE_SETUP.margins, top: 10, header: 11 },
      }),
    ).toThrow("Header and footer margins");
  });
});
