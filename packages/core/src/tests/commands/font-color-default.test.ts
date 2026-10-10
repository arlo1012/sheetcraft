import { describe, expect, test } from "vitest";
import { createCellColorResolver, getCellColor } from "../../cell-color.js";
import type { CellStyleDefinition } from "../../cell-styles.js";
import {
  createApplyCellFormatCommand,
  createApplyCellStyleCommand,
  createSetWorkbookThemeCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { DEFAULT_CELL_TEXT_COLOR } from "../../style.js";
import { createBuiltinTableStyles, resolveTableCellStyle } from "../../table-styles.js";
import {
  createSheetEvaluator,
  getActiveSheet,
  getCellNamedStyle,
  getCellStyle,
  setCellStyle,
  setCellValue,
  type CellAddress,
  type CellRange,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function cellRange(address: CellAddress): CellRange {
  return { start: address, end: address };
}

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const style = {
    ...createBuiltinTableStyles()[0]!,
    elements: {
      wholeTable: { style: { textColor: "#334455" } },
      headerRow: { style: { textColor: "#ffffff", fillColor: "#112233", bold: true as const } },
    },
  };
  sheet.tables = [
    {
      id: "table",
      name: "TestTable",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 4 } },
      columns: Array.from({ length: 5 }, (_, index) => ({ id: `${index}`, name: `C${index}` })),
      style,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: false,
      bandedColumns: false,
      filterButton: false,
      filter: null,
    },
  ];
  const color = createCellColorResolver(sheet, createSheetEvaluator(sheet));
  return { session, sheet, color };
}

describe("direct default font color commands", () => {
  test("clears an existing red override and restores table inheritance through undo and redo", () => {
    const { session, sheet, color } = fixture();
    const address = { row: 0, column: 0 };
    setCellValue(sheet, address, "Header");
    setCellStyle(sheet, address, { textColor: "#ff0000", fontSize: 18, italic: true });
    const command = createApplyCellStyleCommand(sheet.id, cellRange(address), {
      textColor: "#20242C",
    });
    expect(command.patch).toEqual({ textColor: null });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(getCellStyle(sheet, address)).toEqual({ fontSize: 18, italic: true });
    expect(color(address, "text")).toBe("#ffffff");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe("#ff0000");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe("#ffffff");
    expect(session.history.undoStack).toHaveLength(1);
    expect(executeWorkbookCommand(session, command)).toBe(false);
  });

  test.each([
    ["cell", { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
    ["row range", { start: { row: 0, column: 0 }, end: { row: 0, column: 4 } }],
    ["column range", { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } }],
  ] as const)("uses the same reset semantics for a %s", (_label, range) => {
    const { session, sheet, color } = fixture();
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let column = range.start.column; column <= range.end.column; column++) {
        setCellStyle(sheet, { row, column }, { textColor: "#ff0000", fontSize: 18 });
      }
    }
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellFormatCommand(sheet.id, range, { style: { textColor: "#20242c" } }),
      ),
    ).toBe(true);
    for (let row = range.start.row; row <= range.end.row; row++) {
      for (let column = range.start.column; column <= range.end.column; column++) {
        expect(getCellStyle(sheet, { row, column })).toEqual({ fontSize: 18 });
        expect(color({ row, column }, "text")).toBe(row === 0 ? "#ffffff" : "#334455");
      }
    }
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(color(range.start, "text")).toBe("#ff0000");
  });

  test("enforces the rule for direct command payloads and low-level cell setters", () => {
    const { session, sheet, color } = fixture();
    const address = { row: 0, column: 0 };
    setCellStyle(sheet, address, { textColor: "#ff0000" });
    expect(
      executeWorkbookCommand(session, {
        type: "applyCellStyle",
        sheetId: sheet.id,
        range: cellRange(address),
        patch: { textColor: "#20242C" },
      }),
    ).toBe(true);
    expect(getCellStyle(sheet, address)).toBeUndefined();
    expect(color(address, "text")).toBe("#ffffff");
    setCellStyle(sheet, address, { textColor: "#000000" });
    expect(color(address, "text")).toBe("#000000");
    expect(setCellStyle(sheet, address, { textColor: "#20242C" })).toBe(true);
    expect(color(address, "text")).toBe("#ffffff");
  });

  test("keeps plain/default and size-only fallback fixed while explicit bindings follow theme changes", () => {
    const { session, sheet, color } = fixture();
    const plain = { row: 5, column: 0 };
    const sizeOnly = { row: 5, column: 1 };
    const literalBlack = { row: 0, column: 2 };
    const bound = { row: 0, column: 3 };
    const red = { row: 0, column: 4 };
    setCellStyle(sheet, plain, { textColor: DEFAULT_CELL_TEXT_COLOR });
    setCellStyle(sheet, sizeOnly, { fontSize: 18, textColor: DEFAULT_CELL_TEXT_COLOR });
    setCellStyle(sheet, literalBlack, { textColor: "#000000" });
    setCellStyle(sheet, red, { textColor: "#ff0000" });
    executeWorkbookCommand(
      session,
      createSetWorkbookThemeCommand({
        ...session.workbook.theme,
        colors: { ...session.workbook.theme.colors!, dark1: DEFAULT_CELL_TEXT_COLOR },
      }),
    );
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, cellRange(bound), {
        textColor: DEFAULT_CELL_TEXT_COLOR,
        textColorTheme: { slot: "dark1" },
      }),
    );
    expect(color(bound, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(getCellStyle(sheet, bound)?.textColorTheme).toEqual({ slot: "dark1" });
    executeWorkbookCommand(
      session,
      createSetWorkbookThemeCommand({
        ...session.workbook.theme,
        colors: { ...session.workbook.theme.colors!, dark1: "#123456" },
      }),
    );
    expect(color(bound, "text")).toBe("#123456");
    expect(color(plain, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(color(sizeOnly, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(getCellColor(sheet, plain, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(color(literalBlack, "text")).toBe("#000000");
    expect(color(red, "text")).toBe("#ff0000");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(color(bound, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, cellRange(bound), {
        textColor: DEFAULT_CELL_TEXT_COLOR,
      }),
    );
    expect(getCellStyle(sheet, bound)).toBeUndefined();
    expect(color(bound, "text")).toBe("#ffffff");
  });

  test("preserves a named definition color and restores binding ownership through history", () => {
    const { session, sheet, color } = fixture();
    const address = { row: 0, column: 0 };
    const definition: CellStyleDefinition = {
      id: "custom-default-rgb",
      name: "Custom Default RGB",
      category: "custom",
      includes: ["font"],
      style: { textColor: DEFAULT_CELL_TEXT_COLOR, fontSize: 18 },
    };
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, cellRange(address), definition),
    );
    expect(color(address, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, cellRange(address), { textColor: "#ff0000" }),
    );
    executeWorkbookCommand(
      session,
      createApplyCellStyleCommand(sheet.id, cellRange(address), {
        textColor: DEFAULT_CELL_TEXT_COLOR,
      }),
    );
    expect(color(address, "text")).toBe("#ffffff");
    expect(getCellNamedStyle(sheet, address)?.overrides).toEqual(["textColor"]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe("#ff0000");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
    expect(getCellNamedStyle(sheet, address)?.overrides).toBeUndefined();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe("#ff0000");
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(color(address, "text")).toBe("#ffffff");
    expect(definition.style.textColor).toBe(DEFAULT_CELL_TEXT_COLOR);
  });

  test("retains default-RGB table definition overlays", () => {
    const { sheet, color } = fixture();
    const table = sheet.tables![0]!;
    table.style.elements.headerRow!.style.textColor = DEFAULT_CELL_TEXT_COLOR;
    expect(resolveTableCellStyle(table, { row: 0, column: 0 })?.textColor).toBe(
      DEFAULT_CELL_TEXT_COLOR,
    );
    expect(color({ row: 0, column: 0 }, "text")).toBe(DEFAULT_CELL_TEXT_COLOR);
  });
});
