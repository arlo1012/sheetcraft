import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "../../errors.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
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
  getCellContent,
  setCellContent,
  setCellValue,
  setColumnWidth,
  setRowHeight,
  setSheetMetadata,
} from "../../workbook.js";

describe("workbook snapshots", () => {
  test("rejects V8 names that collide with formula tokens and A1 references", () => {
    const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "sheet" }));
    for (const name of ["A1", "TRUE", "false", "R1C1"]) {
      const invalid = {
        ...snapshot,
        definedNames: [
          {
            id: `workbook:${name}`,
            name,
            reference: {
              sheetId: "sheet",
              start: { row: 0, column: 0 },
              end: { row: 0, column: 0 },
            },
          },
        ],
      };
      expect(() => deserializeWorkbook(invalid)).toThrow(
        expect.objectContaining({
          data: expect.objectContaining({
            code: "invalid_snapshot",
            details: expect.objectContaining({ path: "$.definedNames[0].name" }),
          }),
        }),
      );
    }
  });

  test("round trips ordered workbook state without sharing mutable maps", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    const firstSheet = getActiveSheet(workbook);
    setCellValue(firstSheet, { row: 2, column: 1 }, "Budget");
    setCellStyle(
      firstSheet,
      { row: 0, column: 0 },
      {
        bold: true,
        underline: "singleAccounting",
        strikethrough: true,
        fontScript: "subscript",
        fillGradient: {
          type: "path",
          left: 0.5,
          right: 0.5,
          top: 0.5,
          bottom: 0.5,
          stops: [
            { position: 0, color: "#AABBCC" },
            { position: 1, color: "#112233" },
          ],
        },
        horizontalAlign: "centerContinuous",
        verticalAlign: "distributed",
        indent: 3,
        shrinkToFit: true,
        textDirection: "rtl",
        textRotation: "vertical",
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
      underline: "singleAccounting",
      strikethrough: true,
      fontScript: "subscript",
      fillGradient: {
        type: "path",
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        stops: [
          { position: 0, color: "#aabbcc" },
          { position: 1, color: "#112233" },
        ],
      },
      horizontalAlign: "centerContinuous",
      verticalAlign: "distributed",
      indent: 3,
      shrinkToFit: true,
      textDirection: "rtl",
      textRotation: "vertical",
      numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
    });
  });

  test("round trips regional currency symbol variants", () => {
    const workbook = createWorkbook({ id: "regional-currency", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        numberFormat: {
          kind: "currency",
          currency: "USD",
          currencySymbol: "US$",
          fractionDigits: 2,
          locale: "en-US",
        },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        numberFormat: {
          kind: "accounting",
          currency: "USD",
          currencySymbol: "US$",
          fractionDigits: 2,
          locale: "en-US",
        },
      },
    );

    const restored = deserializeWorkbook(serializeWorkbook(workbook));
    const restoredSheet = getActiveSheet(restored);
    expect(getCellStyle(restoredSheet, { row: 0, column: 0 })?.numberFormat).toMatchObject({
      kind: "currency",
      currency: "USD",
      currencySymbol: "US$",
      locale: "en-US",
    });
    expect(getCellStyle(restoredSheet, { row: 0, column: 1 })?.numberFormat).toMatchObject({
      kind: "accounting",
      currency: "USD",
      currencySymbol: "US$",
      locale: "en-US",
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
        {
          address: { row: 1, column: 7 },
          content: { kind: "literal", value: "earlier" },
        },
        {
          address: { row: 9, column: 2 },
          content: { kind: "literal", value: "later" },
        },
      ],
      rowHeights: [
        { index: 2, size: 31 },
        { index: 8, size: 30 },
      ],
    });
  });

  test("round trips extended border line styles", () => {
    const workbook = createWorkbook({ id: "borders", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderTop: { style: "mediumDashDotDot", color: "#112233" },
      },
    );

    const restored = deserializeWorkbook(serializeWorkbook(workbook));
    expect(getCellStyle(getActiveSheet(restored), { row: 0, column: 0 })).toEqual({
      borderTop: { style: "mediumDashDotDot", color: "#112233" },
    });
  });

  test("round trips expanded number formats without changing their format codes", () => {
    const workbook = createWorkbook({ id: "number-formats", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        numberFormat: { kind: "date", code: '[DBNum1][$-804]yyyy"年"m"月"d"日"' },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        numberFormat: { kind: "custom", code: "[Red][<0]0.00;0.00;0;@" },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 2 },
      {
        numberFormat: { kind: "accounting", currency: "USD", fractionDigits: 2 },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 3 },
      {
        numberFormat: {
          kind: "special",
          code: "[DBNum2][$-804]General",
          chineseUpperStyle: "compact",
        },
      },
    );

    const restored = deserializeWorkbook(serializeWorkbook(workbook));
    expect(serializeWorkbook(restored)).toEqual(serializeWorkbook(workbook));
    expect(getCellStyle(getActiveSheet(restored), { row: 0, column: 0 })?.numberFormat).toEqual({
      kind: "date",
      code: '[DBNum1][$-804]yyyy"年"m"月"d"日"',
    });
    expect(getCellStyle(getActiveSheet(restored), { row: 0, column: 3 })?.numberFormat).toEqual({
      kind: "special",
      code: "[DBNum2][$-804]General",
      chineseUpperStyle: "compact",
    });
  });

  test("persists sheet metadata and accepts V2 snapshots without metadata fields", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    setSheetMetadata(sheet, {
      freezePanes: { rows: 2, columns: 1 },
      mergedCells: [{ start: { row: 3, column: 3 }, end: { row: 3, column: 4 } }],
      filter: {
        range: { start: { row: 7, column: 0 }, end: { row: 10, column: 1 } },
        columns: [{ column: 0, allowedValues: [{ kind: "number", value: 1 }] }],
      },
    });

    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.sheets[0]).toMatchObject({
      freezePanes: { rows: 2, columns: 1 },
      mergedCells: [{ start: { row: 3, column: 3 }, end: { row: 3, column: 4 } }],
      filter: {},
    });
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);

    const { dateSystem: _dateSystem, ...current } = structuredClone(snapshot);
    const legacyV2 = { ...current, version: 2 };
    delete legacyV2.sheets[0]?.freezePanes;
    delete legacyV2.sheets[0]?.filter;
    delete legacyV2.sheets[0]?.mergedCells;
    const restored = deserializeWorkbook(legacyV2);
    expect(getActiveSheet(restored).freezePanes).toEqual({
      rows: 0,
      columns: 0,
    });
    expect(getActiveSheet(restored).filter).toBeNull();
    expect(getActiveSheet(restored).mergedCells).toEqual([]);
  });

  test("migrates V1 values and writes current raw formula content without a computed cache", () => {
    const v1 = {
      version: 1,
      id: "workbook-1",
      activeSheetId: "sheet-1",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet1",
          rowHeights: [],
          columnWidths: [],
          cells: [{ address: { row: 0, column: 0 }, value: 2 }],
        },
      ],
    };
    const migrated = deserializeWorkbook(v1);
    expect(getCellContent(getActiveSheet(migrated), { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: 2,
    });

    setCellValue(getActiveSheet(migrated), { row: 0, column: 1 }, null);
    const formulaSheet = getActiveSheet(migrated);
    setCellContent(
      formulaSheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SUM(" } },
    );
    const snapshot = serializeWorkbook(migrated);
    expect(snapshot.version).toBe(9);
    expect(snapshot.dateSystem).toBe("1900");
    expect(snapshot.sheets[0]?.cells).toContainEqual({
      address: { row: 0, column: 1 },
      content: { kind: "formula", formula: { source: "=SUM(" } },
    });
    expect(JSON.stringify(snapshot)).not.toContain("computed");
  });

  test("deserializes an independent V1 sheet snapshot", () => {
    const sheet = deserializeSheet({
      id: "sheet-1",
      name: "Sheet1",
      cells: [{ address: { row: 0, column: 0 }, value: "legacy" }],
      rowHeights: [],
      columnWidths: [],
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "legacy",
    });
  });

  test("round trips standalone V5 sheet image transforms", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: {
          assetId: "cell",
          altText: "Cell",
          transform: { rotation: 90 },
        },
      },
    );
    sheet.floatingImages.push({
      id: "floating",
      assetId: "floating",
      altText: "Floating",
      anchor: { row: 1, column: 1 },
      offsetX: 0,
      offsetY: 0,
      width: 120,
      height: 60,
      transform: { crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } },
    });
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
  });

  test("rejects V2 value fields and formula sources without an equals prefix", () => {
    const base = {
      version: 2,
      id: "workbook-1",
      activeSheetId: "sheet-1",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet1",
          rowHeights: [],
          columnWidths: [],
          cells: [],
        },
      ],
    };
    expect(() =>
      deserializeWorkbook({
        ...base,
        sheets: [
          {
            ...base.sheets[0],
            cells: [{ address: { row: 0, column: 0 }, value: 2 }],
          },
        ],
      }),
    ).toThrow("V2 cells use content");
    expect(() =>
      deserializeWorkbook({
        ...base,
        sheets: [
          {
            ...base.sheets[0],
            cells: [
              {
                address: { row: 0, column: 0 },
                content: { kind: "formula", formula: { source: "A1" } },
              },
            ],
          },
        ],
      }),
    ).toThrow("beginning with '='");
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
    expect(() => deserializeWorkbook({ version: 10 })).toThrowError(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: { code: "unsupported_snapshot_version", details: { version: 10 } },
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
      expect.objectContaining({
        data: expect.objectContaining({ code: "invalid_snapshot" }),
      }),
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
        expect.objectContaining({
          data: expect.objectContaining({ code: "invalid_snapshot" }),
        }),
      );
    }
  });

  test("rejects malformed V7 properties and hidden workbook visibility states", () => {
    const workbook = createWorkbook({ id: "workbook-1", sheetId: "sheet-1" });
    insertSheet(workbook, createSheet("Sheet2", "sheet-2"));
    const base = serializeWorkbook(workbook);
    const malformed = structuredClone(base);
    malformed.sheets[0]!.properties = {
      pinned: false,
      hidden: false,
      protected: false,
      tabColor: "blue",
    } as never;
    expect(() => deserializeWorkbook(malformed)).toThrow("tabColor");
    const activeHidden = structuredClone(base);
    activeHidden.sheets[0]!.properties.hidden = true;
    expect(() => deserializeWorkbook(activeHidden)).toThrow("active sheet");
    const allHidden = structuredClone(base);
    for (const sheet of allHidden.sheets) sheet.properties.hidden = true;
    expect(() => deserializeWorkbook(allHidden)).toThrow("visible sheet");
  });
});
