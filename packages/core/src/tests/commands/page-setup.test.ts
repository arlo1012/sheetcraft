import { describe, expect, test } from "vitest";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveSheetAxisCommand,
  createSetSheetPageSetupCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  DEFAULT_SHEET_HEADER_FOOTER_OPTIONS,
  DEFAULT_SHEET_PAGE_SETUP,
  DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  DEFAULT_SHEET_PRINT_TITLES,
  getPagePaperSize,
  getSheetHeaderFooterOptions,
} from "../../page-setup.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
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

  test("normalizes header/footer variants and restores them through command history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const headerFooter = {
      ...getSheetHeaderFooterOptions(DEFAULT_SHEET_PAGE_SETUP),
      differentFirst: true,
      differentOddEven: true,
      scaleWithDocument: false,
      alignWithMargins: false,
      firstHeader: { left: "&F", center: "First", right: "&P" },
      evenFooter: { left: "", center: "Even", right: "" },
    };
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetPageSetupCommand(sheet.id, {
          ...DEFAULT_SHEET_PAGE_SETUP,
          headerFooter,
        }),
      ),
    ).toBe(true);
    expect(sheet.pageSetup?.headerFooter).toEqual(headerFooter);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageSetup?.headerFooter).toEqual(DEFAULT_SHEET_HEADER_FOOTER_OPTIONS);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageSetup?.headerFooter).toEqual(headerFooter);
  });

  test("migrates V13 page setup without header/footer options to canonical defaults", () => {
    const session = createTestWorkbookSession();
    const snapshot = structuredClone(serializeWorkbook(session.workbook));
    snapshot.version = 13 as never;
    delete snapshot.sheets[0]?.pageSetup?.headerFooter;
    const restored = deserializeWorkbook(snapshot);
    expect(
      restored.sheets.get(getActiveSheet(session.workbook).id)?.pageSetup?.headerFooter,
    ).toEqual(DEFAULT_SHEET_HEADER_FOOTER_OPTIONS);
    expect(restored.sheets.get(getActiveSheet(session.workbook).id)?.pageSetup).toMatchObject({
      fitToPage: null,
      firstPageNumber: null,
      printQuality: 600,
      printOptions: DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
      printTitles: DEFAULT_SHEET_PRINT_TITLES,
    });
  });

  test("normalizes custom paper and print configuration as detached page metadata", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const setup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      paperSize: "custom" as const,
      customPaperSize: { width: 250, height: 350 },
      fitToPage: { width: 1, height: 0 },
      firstPageNumber: 3,
      printQuality: 1200,
      printOptions: {
        ...DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
        gridLines: true,
        errors: "dash" as const,
      },
      printTitles: {
        rows: { start: 1, end: 2 },
        columns: { start: 3, end: 4 },
        bottomRows: { start: 8, end: 9 },
      },
    };
    executeWorkbookCommand(session, createSetSheetPageSetupCommand(sheet.id, setup));
    setup.customPaperSize.width = 100;
    setup.printTitles.rows!.start = 0;
    expect(sheet.pageSetup).toMatchObject({
      customPaperSize: { width: 250, height: 350 },
      fitToPage: { width: 1, height: 0 },
      firstPageNumber: 3,
      printQuality: 1200,
      printOptions: { gridLines: true, errors: "dash" },
      printTitles: { rows: { start: 1, end: 2 } },
    });
    expect(getPagePaperSize(sheet.pageSetup!)).toEqual({ width: 250, height: 350 });
    expect(() =>
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        fitToPage: { width: 0, height: 0 },
      }),
    ).toThrow("Fit to page cannot");
    expect(() =>
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        firstPageNumber: 32768,
      }),
    ).toThrow("First page number");
    expect(() =>
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        paperSize: "a4",
        customPaperSize: { width: 5000, height: 5000 },
        margins: { ...DEFAULT_SHEET_PAGE_SETUP.margins, left: 110, right: 110 },
      }),
    ).toThrow("Page margins leave no usable paper area");
    expect(() =>
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        paperSize: "a4",
        customPaperSize: { width: 1, height: 1 },
      }),
    ).not.toThrow();
  });

  test("transforms repeated print titles with structural axes and restores them through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetPageSetupCommand(sheet.id, {
        ...DEFAULT_SHEET_PAGE_SETUP,
        printTitles: {
          rows: { start: 2, end: 4 },
          columns: { start: 2, end: 3 },
          bottomRows: { start: 10, end: 11 },
        },
      }),
    );
    executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 3, 2));
    executeWorkbookCommand(session, createDeleteSheetAxisCommand(sheet.id, "column", 2, 1));
    expect(sheet.pageSetup?.printTitles).toEqual({
      rows: { start: 2, end: 6 },
      columns: { start: 2, end: 2 },
      bottomRows: { start: 12, end: 13 },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageSetup?.printTitles).toEqual({
      rows: { start: 2, end: 4 },
      columns: { start: 2, end: 3 },
      bottomRows: { start: 10, end: 11 },
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageSetup?.printTitles).toEqual({
      rows: { start: 2, end: 6 },
      columns: { start: 2, end: 2 },
      bottomRows: { start: 12, end: 13 },
    });
  });
});
