import { describe, expect, test } from "vitest";
import type { StandalonePictureObject } from "../../picture-object.js";
import { isPictureGroup } from "../../picture-group.js";
import {
  createAddSheetCommand,
  createDeleteCellsCommand,
  createInsertCellsCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellContent,
  getCellValue,
  MAX_SHEET_COLUMNS,
  setCellContent,
  setCellStyle,
  setCellValue,
  setSheetMetadata,
  type FloatingImage,
} from "../../workbook.js";

function requireStandalone(image: FloatingImage | undefined): StandalonePictureObject | undefined {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
}

describe("rectangular cell shift commands", () => {
  test("inserts cells to the right, adjusts formulas, and restores exactly through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 2 }, "C");
    setCellContent(sheet, { row: 1, column: 3 }, { kind: "formula", formula: { source: "=C2" } });
    const before = createSheetSparseState(sheet);

    expect(
      executeWorkbookCommand(
        session,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
          "right",
        ),
      ),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBe("B");
    expect(getCellValue(sheet, { row: 1, column: 3 })).toBe("C");
    expect(getCellContent(sheet, { row: 1, column: 4 })).toEqual({
      kind: "formula",
      formula: { source: "=D2" },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(createSheetSparseState(sheet)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 3 })).toBe("C");
  });

  test("deletes a rectangle upward without moving other columns", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 1, column: 2 }, "remove");
    setCellValue(sheet, { row: 2, column: 2 }, "move");
    setCellValue(sheet, { row: 2, column: 3 }, "other");

    expect(
      executeWorkbookCommand(
        session,
        createDeleteCellsCommand(
          sheet.id,
          { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
          "up",
        ),
      ),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBe("move");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 3 })).toBe("other");
  });

  test("shrinks a defined name at a deleted edge instead of extending it", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 2, column: 0 },
      { kind: "formula", formula: { source: "=A1:B1" } },
    );
    session.workbook.definedNames.set("edge", {
      id: "edge",
      name: "Edge",
      reference: {
        sheetId: sheet.id,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
      },
    });

    expect(
      executeWorkbookCommand(
        session,
        createDeleteCellsCommand(
          sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
          "left",
        ),
      ),
    ).toBe(true);
    expect(session.workbook.definedNames.get("edge")?.reference).toEqual({
      sheetId: sheet.id,
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=A1:A1" },
    });
  });

  test("restores external formulas and names when an otherwise empty range is shifted", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(
      executeWorkbookCommand(session, createAddSheetCommand(session.workbook, { id: "sheet-2" })),
    ).toBe(true);
    const otherSheet = session.workbook.sheets.get("sheet-2");
    if (!otherSheet) throw new Error("Expected the second test sheet.");
    setCellContent(
      otherSheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Sheet1!A1" },
      },
    );
    session.workbook.definedNames.set("empty-shift", {
      id: "empty-shift",
      name: "EmptyShift",
      reference: { sheetId: sheet.id, start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    });

    expect(
      executeWorkbookCommand(
        session,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          "right",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(otherSheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=Sheet1!B1" },
    });
    expect(session.workbook.definedNames.get("empty-shift")?.reference.end).toEqual({
      row: 0,
      column: 1,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(otherSheet, { row: 0, column: 0 })?.kind).toBe("formula");
    expect(
      (
        getCellContent(otherSheet, { row: 0, column: 0 }) as {
          kind: "formula";
          formula: { source: string };
        }
      ).formula.source,
    ).toBe("=Sheet1!A1");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(
      (
        getCellContent(otherSheet, { row: 0, column: 0 }) as {
          kind: "formula";
          formula: { source: string };
        }
      ).formula.source,
    ).toBe("=Sheet1!B1");
  });

  test("rejects boundary insertion that would discard sparse cells or anchored images", () => {
    const cellSession = createTestWorkbookSession();
    const cellSheet = getActiveSheet(cellSession.workbook);
    setCellStyle(cellSheet, { row: 0, column: MAX_SHEET_COLUMNS - 1 }, { fillColor: "#ff0000" });
    const cellBefore = createSheetSparseState(cellSheet);
    expect(
      tryApplyWorkbookCommand(
        cellSession.workbook,
        createInsertCellsCommand(
          cellSheet.id,
          {
            start: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
            end: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
          },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(cellSheet)).toEqual(cellBefore);

    const imageSession = createTestWorkbookSession();
    const imageSheet = getActiveSheet(imageSession.workbook);
    imageSheet.floatingImages.push({
      id: "tail",
      assetId: "asset",
      altText: "tail",
      anchor: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
      offsetX: 0,
      offsetY: 0,
      width: 10,
      height: 10,
    });
    expect(
      tryApplyWorkbookCommand(
        imageSession.workbook,
        createInsertCellsCommand(
          imageSheet.id,
          {
            start: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
            end: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
          },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(requireStandalone(imageSheet.floatingImages[0])?.anchor).toEqual({
      row: 0,
      column: MAX_SHEET_COLUMNS - 1,
    });
  });

  test("moves floating image anchors with cells and restores them through undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.floatingImages.push({
      id: "moving",
      assetId: "asset",
      altText: "moving",
      anchor: { row: 0, column: 1 },
      offsetX: 0,
      offsetY: 0,
      width: 10,
      height: 10,
    });
    expect(
      executeWorkbookCommand(
        session,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          "right",
        ),
      ),
    ).toBe(true);
    expect(requireStandalone(sheet.floatingImages[0])?.anchor).toEqual({ row: 0, column: 2 });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(requireStandalone(sheet.floatingImages[0])?.anchor).toEqual({ row: 0, column: 1 });
  });

  test("rejects cross-stripe formula and defined-name ranges before mutation", () => {
    const formulaSession = createTestWorkbookSession();
    const formulaSheet = getActiveSheet(formulaSession.workbook);
    setCellContent(
      formulaSheet,
      { row: 3, column: 0 },
      { kind: "formula", formula: { source: "=Sheet1!A1:C2" } },
    );
    const formulaBefore = createSheetSparseState(formulaSheet);
    expect(
      tryApplyWorkbookCommand(
        formulaSession.workbook,
        createInsertCellsCommand(
          formulaSheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(formulaSheet)).toEqual(formulaBefore);

    const nameSession = createTestWorkbookSession();
    const nameSheet = getActiveSheet(nameSession.workbook);
    nameSession.workbook.definedNames.set("cross-stripe", {
      id: "cross-stripe",
      name: "CrossStripe",
      reference: {
        sheetId: nameSheet.id,
        start: { row: 0, column: 0 },
        end: { row: 1, column: 2 },
      },
    });
    const namesBefore = [...nameSession.workbook.definedNames.values()];
    expect(
      tryApplyWorkbookCommand(
        nameSession.workbook,
        createInsertCellsCommand(
          nameSheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect([...nameSession.workbook.definedNames.values()]).toEqual(namesBefore);
  });

  test("shrinks a range ending at deleted cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=A1:A5" } },
    );
    expect(
      executeWorkbookCommand(
        session,
        createDeleteCellsCommand(
          sheet.id,
          { start: { row: 3, column: 0 }, end: { row: 4, column: 0 } },
          "up",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=A1:A3" },
    });
  });

  test("leaves ranges outside the shifted cells unchanged", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 3, column: 0 },
      { kind: "formula", formula: { source: "=A1:A2" } },
    );
    session.workbook.definedNames.set("unaffected", {
      id: "unaffected",
      name: "Unaffected",
      reference: { sheetId: sheet.id, start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    });
    expect(
      executeWorkbookCommand(
        session,
        createDeleteCellsCommand(
          sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
          "left",
        ),
      ),
    ).toBe(false);
    expect(getCellContent(sheet, { row: 3, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=A1:A2" },
    });
    expect(session.workbook.definedNames.get("unaffected")?.reference).toEqual({
      sheetId: sheet.id,
      start: { row: 0, column: 0 },
      end: { row: 1, column: 0 },
    });
  });

  test("rejects shifts that would split merges or an active filter without mutation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells: [{ start: { row: 2, column: 2 }, end: { row: 2, column: 3 } }],
    });
    const before = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("rejects a shift that intersects conditional-format ranges or formula references", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.conditionalFormats = [
      {
        id: "rule",
        ranges: [{ start: { row: 2, column: 1 }, end: { row: 2, column: 3 } }],
        anchor: { row: 2, column: 1 },
        condition: { kind: "formula", formula: "=B3>0" },
        style: { fillColor: "#FF0000" },
      },
    ];
    const before = createSheetSparseState(sheet);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createInsertCellsCommand(
          sheet.id,
          { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } },
          "right",
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
    expect(createSheetSparseState(sheet)).toEqual(before);
  });
});
