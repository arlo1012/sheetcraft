import { describe, expect, test } from "vitest";
import { createCellColorResolver } from "../../cell-color.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { DEFAULT_CELL_TEXT_COLOR } from "../../style.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import {
  createSheetEvaluator,
  createSheetSparseState,
  getActiveSheet,
  getCellNamedStyle,
  getCellStyle,
  getCellValue,
  replaceSheetSparseState,
  setCellNamedStyle,
  setCellStyle,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("default RGB direct-style snapshots", () => {
  test("normalizes old current-version direct RGB without changing the snapshot structure", () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    snapshot.sheets[0]!.cells = [
      { address: { row: 0, column: 0 }, style: { textColor: "#20242C" } },
      {
        address: { row: 0, column: 1 },
        content: { kind: "literal", value: "Header" },
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
      },
      {
        address: { row: 0, column: 2 },
        style: { fontSize: 18, textColor: DEFAULT_CELL_TEXT_COLOR },
      },
      { address: { row: 0, column: 3 }, style: { textColor: "#000000" } },
      { address: { row: 0, column: 4 }, style: { textColor: "#ff0000" } },
      {
        address: { row: 0, column: 5 },
        style: { textColor: DEFAULT_CELL_TEXT_COLOR, textColorTheme: { slot: "dark1" } },
      },
      {
        address: { row: 0, column: 6 },
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
        namedStyle: { styleId: "custom", includes: ["font"] },
      },
      {
        address: { row: 0, column: 7 },
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
        namedStyle: { styleId: "custom", includes: ["font"], overrides: ["textColor"] },
      },
    ];
    const restored = deserializeWorkbook(snapshot);
    const sheet = getActiveSheet(restored);
    expect(sheet.cells.has("0:0")).toBe(false);
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe("Header");
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toEqual({ fontSize: 18 });
    expect(getCellStyle(sheet, { row: 0, column: 3 })).toEqual({ textColor: "#000000" });
    expect(getCellStyle(sheet, { row: 0, column: 4 })).toEqual({ textColor: "#ff0000" });
    expect(getCellStyle(sheet, { row: 0, column: 5 })).toEqual({
      textColor: DEFAULT_CELL_TEXT_COLOR,
      textColorTheme: { slot: "dark1" },
    });
    expect(getCellStyle(sheet, { row: 0, column: 6 })).toEqual({
      textColor: DEFAULT_CELL_TEXT_COLOR,
    });
    expect(getCellStyle(sheet, { row: 0, column: 7 })).toBeUndefined();
    expect(getCellNamedStyle(sheet, { row: 0, column: 7 })?.overrides).toEqual(["textColor"]);
    const canonical = serializeWorkbook(restored);
    expect(canonical.version).toBe(snapshot.version);
    expect(canonical.version).toBe(42);
    expect(serializeWorkbook(deserializeWorkbook(canonical))).toEqual(canonical);
  });

  test("applies the same reset when loading V1 and standalone sheet snapshots", () => {
    const restored = deserializeWorkbook({
      version: 1,
      id: "legacy",
      activeSheetId: "sheet",
      sheets: [
        {
          id: "sheet",
          name: "Sheet1",
          cells: [
            { address: { row: 0, column: 0 }, style: { textColor: DEFAULT_CELL_TEXT_COLOR } },
            { address: { row: 0, column: 1 }, value: "Keep", style: { textColor: "#20242C" } },
            { address: { row: 0, column: 2 }, style: { textColor: "#000000" } },
          ],
          rowHeights: [],
          columnWidths: [],
        },
      ],
    });
    const sheet = getActiveSheet(restored);
    expect(sheet.cells.has("0:0")).toBe(false);
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe("Keep");
    expect(getCellStyle(sheet, { row: 0, column: 1 })).toBeUndefined();
    expect(getCellStyle(sheet, { row: 0, column: 2 })).toEqual({ textColor: "#000000" });
    const standalone = serializeSheet(sheet);
    standalone.cells.push({ address: { row: 2, column: 0 }, style: { textColor: "#20242C" } });
    expect(deserializeSheet(standalone).cells.has("2:0")).toBe(false);
  });

  test("canonicalizes raw old direct cells when serializing while preserving materialized named styles", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    sheet.cells.set("0:0", { style: { textColor: DEFAULT_CELL_TEXT_COLOR } });
    sheet.cells.set("0:1", { style: { textColor: DEFAULT_CELL_TEXT_COLOR, fontSize: 18 } });
    setCellNamedStyle(
      sheet,
      { row: 0, column: 2 },
      { textColor: DEFAULT_CELL_TEXT_COLOR },
      { styleId: "named", includes: ["font"] },
    );
    const cells = serializeWorkbook(workbook).sheets[0]!.cells;
    expect(cells).toEqual([
      { address: { row: 0, column: 1 }, style: { fontSize: 18 } },
      {
        address: { row: 0, column: 2 },
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
        namedStyle: { styleId: "named", includes: ["font"] },
      },
    ]);
  });

  test("does not rewrite table, named-style or conditional-format definitions", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    workbook.tableStyles = [
      {
        ...createBuiltinTableStyles()[0]!,
        id: "custom-rgb",
        name: "Custom RGB",
        category: "custom",
        elements: { headerRow: { style: { textColor: DEFAULT_CELL_TEXT_COLOR } } },
      },
    ];
    workbook.cellStyles = [
      {
        id: "named-rgb",
        name: "Named RGB",
        category: "custom",
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
      },
    ];
    sheet.conditionalFormats = [
      {
        id: "conditional-rgb",
        ranges: [range],
        anchor: range.start,
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: { textColor: "#20242C" },
      },
    ];
    setCellValue(sheet, range.start, 1);
    setCellStyle(sheet, range.start, { textColor: "#ff0000" });
    const restored = deserializeWorkbook(serializeWorkbook(workbook));
    const restoredSheet = getActiveSheet(restored);
    expect(restored.tableStyles![0]!.elements.headerRow!.style.textColor).toBe(
      DEFAULT_CELL_TEXT_COLOR,
    );
    expect(restored.cellStyles![0]!.style.textColor).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(restoredSheet.conditionalFormats![0]!.style.textColor).toBe("#20242C");
    expect(
      createCellColorResolver(restoredSheet, createSheetEvaluator(restoredSheet))(
        range.start,
        "text",
      ),
    ).toBe(DEFAULT_CELL_TEXT_COLOR);
  });

  test("still rejects invalid and duplicate sparse cells, including migrated empty style cells", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    const state = createSheetSparseState(sheet);
    expect(() =>
      replaceSheetSparseState(sheet, {
        ...state,
        cells: [{ address: { row: 0, column: 0 }, style: {} }],
      }),
    ).toThrow("Sparse state cells must contain");
    expect(() =>
      replaceSheetSparseState(sheet, {
        ...state,
        cells: [
          { address: { row: 0, column: 0 }, style: { textColor: DEFAULT_CELL_TEXT_COLOR } },
          { address: { row: 0, column: 0 }, style: { textColor: "#ff0000" } },
        ],
      }),
    ).toThrow("duplicate cell");
  });
});
