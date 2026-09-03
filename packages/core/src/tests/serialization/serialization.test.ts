import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "../../errors.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  getCellValue,
  getWorkbookSheets,
  insertSheet,
  moveSheet,
  setActiveSheet,
  setCellStyle,
  setCellValue,
  setColumnWidth,
  setRowHeight,
} from "../../workbook.js";

describe("workbook snapshots", () => {
  test("round trips ordered workbook state without sharing mutable maps", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    const firstSheet = getActiveSheet(workbook);
    setCellValue(firstSheet, { row: 2, column: 1 }, "Budget");
    setCellStyle(
      firstSheet,
      { row: 0, column: 0 },
      {
        bold: true,
        fillColor: "#AABBCC",
        numberFormat: { kind: "currency", currency: "cny", fractionDigits: 2 },
      },
    );
    setRowHeight(firstSheet, 2, 40);
    setColumnWidth(firstSheet, 1, 144);
    insertSheet(workbook, createSheet("Summary", "sheet-2"));
    setActiveSheet(workbook, "sheet-2");

    const snapshot = serializeWorkbook(workbook);
    const clonedSnapshot = structuredClone(snapshot);
    const restored = deserializeWorkbook(clonedSnapshot);

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    expect([...restored.sheets]).not.toBe([...workbook.sheets]);
    expect(getCellValue(restored.sheets.get("sheet-1")!, { row: 2, column: 1 })).toBe("Budget");
    expect(getCellStyle(restored.sheets.get("sheet-1")!, { row: 0, column: 0 })).toEqual({
      bold: true,
      fillColor: "#aabbcc",
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
    });
  });

  test("serializes sparse entries in deterministic address and dimension order", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 9, column: 2 }, "later");
    setCellValue(sheet, { row: 1, column: 7 }, "earlier");
    setRowHeight(sheet, 8, 30);
    setRowHeight(sheet, 2, 31);

    expect(serializeWorkbook(workbook).sheets[0]).toMatchObject({
      cells: [
        { address: { row: 1, column: 7 }, value: "earlier" },
        { address: { row: 9, column: 2 }, value: "later" },
      ],
      rowHeights: [
        { index: 2, size: 31 },
        { index: 8, size: 30 },
      ],
    });
  });

  test("round trips a reordered workbook in map order without changing the active sheet", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    insertSheet(workbook, createSheet("Sheet3", "sheet-3"));
    setActiveSheet(workbook, "sheet-2");
    moveSheet(workbook, "sheet-3", 0);

    const restored = deserializeWorkbook(serializeWorkbook(workbook));

    expect(getWorkbookSheets(restored).map((sheet) => sheet.id)).toEqual([
      "sheet-3",
      "sheet-1",
      "sheet-2",
    ]);
    expect(restored.activeSheetId).toBe("sheet-2");
  });

  test("rejects unknown snapshot versions with a stable error code", () => {
    expect(() => deserializeWorkbook({ version: 2 })).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "unsupported_snapshot_version", details: { version: 2 } },
      }),
    );
  });

  test.each([
    ["duplicate sheet IDs", { activeSheetId: "sheet-1", duplicate: "id" }],
    ["duplicate sheet names", { activeSheetId: "sheet-1", duplicate: "name" }],
    ["missing active sheet", { activeSheetId: "missing", duplicate: null }],
  ])("rejects %s", (_label, options) => {
    const secondId = options.duplicate === "id" ? "sheet-1" : "sheet-2";
    const secondName = options.duplicate === "name" ? "Sheet1" : "Sheet2";
    expect(() =>
      deserializeWorkbook({
        version: 1,
        id: "workbook-1",
        activeSheetId: options.activeSheetId,
        sheets: [
          {
            id: "sheet-1",
            name: "Sheet1",
            cells: [],
            rowHeights: [],
            columnWidths: [],
          },
          {
            id: secondId,
            name: secondName,
            cells: [],
            rowHeights: [],
            columnWidths: [],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ data: expect.objectContaining({ code: "invalid_snapshot" }) }),
    );
  });

  test("rejects invalid addresses, values, styles, and dimensions", () => {
    const base = {
      version: 1,
      id: "workbook-1",
      activeSheetId: "sheet-1",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet1",
          cells: [],
          rowHeights: [],
          columnWidths: [],
        },
      ],
    } as const;

    const invalidStates = [
      { cells: [{ address: { row: -1, column: 0 }, value: "x" }] },
      { cells: [{ address: { row: 0, column: 0 }, value: Number.NaN }] },
      { cells: [{ address: { row: 0, column: 0 }, style: { fontSize: 2 } }] },
      { rowHeights: [{ index: 0, size: 2 }] },
    ];

    for (const invalidState of invalidStates) {
      const snapshot = structuredClone(base);
      Object.assign(snapshot.sheets[0], invalidState);
      expect(() => deserializeWorkbook(snapshot)).toThrowError(
        expect.objectContaining({ data: expect.objectContaining({ code: "invalid_snapshot" }) }),
      );
    }
  });
});
