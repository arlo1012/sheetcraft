import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "../../errors.js";
import { createBuiltinCellStyles, type CellStyleDefinition } from "../../cell-styles.js";
import {
  createApplyCellStyleCommand,
  createSetCellHyperlinkCommand,
  createMarkCellHyperlinkVisitedCommand,
  createSetWorkbookCellStylesCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  getActiveSheet,
  getCellHyperlink,
  getCellNamedStyle,
  getCellStyle,
  setCellStyle,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("named cell styles", () => {
  test("provides the WPS gallery groups through stable IDs", () => {
    const styles = createBuiltinCellStyles();
    expect(styles.find((style) => style.id === "normal")?.builtinId).toBe(0);
    expect(styles.filter((style) => style.category === "theme")).toHaveLength(24);
    expect(styles.map((style) => style.id)).toEqual(
      expect.arrayContaining([
        "good",
        "bad",
        "neutral",
        "hyperlink",
        "heading-4",
        "total",
        "number-percent",
      ]),
    );
  });

  test("materializes a named style and restores all old fields when Normal is undone", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    setCellStyle(sheet, range.start, {
      bold: true,
      textColor: "#112233",
      fillColor: "#445566",
      numberFormat: { kind: "number", fractionDigits: 2 },
    });
    const normal = createBuiltinCellStyles().find((style) => style.id === "normal")!;

    expect(
      executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, normal)),
    ).toBe(true);
    expect(getCellStyle(sheet, range.start)).toBeUndefined();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, range.start)).toEqual({
      bold: true,
      textColor: "#112233",
      fillColor: "#445566",
      numberFormat: { kind: "number", fractionDigits: 2 },
    });
  });

  test("serializes custom definitions and rejects non-custom snapshot entries", () => {
    const session = createTestWorkbookSession();
    const custom: CellStyleDefinition = {
      id: "custom-emphasis",
      name: "Custom Emphasis",
      category: "custom",
      style: { bold: true, fillColor: "#d9eaf7" },
    };
    expect(executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([custom]))).toBe(
      true,
    );
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(18);
    expect(snapshot.cellStyles).toEqual([custom]);
    expect(deserializeWorkbook(snapshot).cellStyles).toEqual([custom]);
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        cellStyles: [{ ...custom, category: "theme" }],
      }),
    ).toThrow(
      expect.objectContaining({ data: expect.objectContaining({ code: "invalid_snapshot" }) }),
    );
  });

  test("reports invalid custom libraries as command payload errors", () => {
    expect(() =>
      createSetWorkbookCellStylesCommand([
        { id: "builtin", name: "Builtin", category: "theme", style: {} },
      ]),
    ).toThrow(
      expect.objectContaining<Partial<WorkbookDomainError>>({
        data: expect.objectContaining({
          code: "invalid_command_payload",
          details: expect.objectContaining({ field: "styles" }),
        }),
      }),
    );
  });

  test("updates bound custom styles while retaining a direct key override", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
    const first: CellStyleDefinition = {
      id: "emphasis",
      name: "Emphasis",
      category: "custom",
      style: { bold: true, textColor: "#112233", fillColor: "#d9eaf7" },
      includes: ["font", "fill"],
    };
    executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([first]));
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, first));
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, { bold: null }));
    const second = {
      ...first,
      style: { bold: true as const, textColor: "#445566", fillColor: "#c6efce" },
    };
    executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([second]));
    expect(getCellStyle(sheet, range.start)).toEqual({
      textColor: "#445566",
      fillColor: "#c6efce",
    });
    expect(getCellNamedStyle(sheet, range.start)?.overrides).toEqual(["bold"]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellStyle(sheet, range.start)?.textColor).toBe("#112233");
  });

  test("uses updated style include groups for existing bindings without clearing direct overrides", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } };
    const initial: CellStyleDefinition = {
      id: "linked",
      name: "Linked",
      category: "custom",
      style: { bold: true, textColor: "#112233", fillColor: "#d9eaf7" },
      includes: ["font", "fill"],
    };
    executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([initial]));
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, initial));
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, { bold: null }));
    const changed: CellStyleDefinition = {
      ...initial,
      style: { bold: true, textColor: "#445566", fillColor: "#c6efce" },
      includes: ["font"],
    };
    executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([changed]));
    expect(getCellStyle(sheet, range.start)).toEqual({
      textColor: "#445566",
      fillColor: "#d9eaf7",
    });
    expect(getCellNamedStyle(sheet, range.start)).toMatchObject({
      includes: ["font"],
      overrides: ["bold"],
    });
  });

  test("allows unrelated library additions on a protected sheet but blocks an applied style edit", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 3, column: 0 }, end: { row: 3, column: 0 } };
    const applied: CellStyleDefinition = {
      id: "protected-style",
      name: "Protected Style",
      category: "custom",
      style: { bold: true },
      includes: ["font"],
    };
    const unrelated: CellStyleDefinition = {
      id: "unrelated-style",
      name: "Unrelated Style",
      category: "custom",
      style: { fillColor: "#d9eaf7" },
      includes: ["fill"],
    };
    executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([applied]));
    executeWorkbookCommand(session, createApplyCellStyleCommand(sheet.id, range, applied));
    sheet.properties.protected = true;
    expect(
      executeWorkbookCommand(session, createSetWorkbookCellStylesCommand([applied, unrelated])),
    ).toBe(true);
    expect(() =>
      executeWorkbookCommand(
        session,
        createSetWorkbookCellStylesCommand([{ ...applied, style: { italic: true } }, unrelated]),
      ),
    ).toThrow(
      expect.objectContaining({ data: expect.objectContaining({ code: "sheet_protected" }) }),
    );
  });

  test("keeps hyperlink target and display text through undo, redo, and visit state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 2, column: 1 };
    executeWorkbookCommand(
      session,
      createSetCellHyperlinkCommand(
        sheet.id,
        address,
        { target: "https://example.com", tooltip: "Example" },
        "Example",
      ),
    );
    expect(getCellHyperlink(sheet, address)?.target).toBe("https://example.com");
    expect(getCellStyle(sheet, address)).toMatchObject({ textColor: "#0000ff", underline: true });
    executeWorkbookCommand(session, createMarkCellHyperlinkVisitedCommand(sheet.id, address));
    expect(getCellHyperlink(sheet, address)?.visited).toBe(true);
    expect(getCellStyle(sheet, address)?.textColor).toBe("#800080");
    const restored = deserializeWorkbook(serializeWorkbook(session.workbook));
    expect(getCellHyperlink(getActiveSheet(restored), address)).toMatchObject({
      target: "https://example.com",
      visited: true,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellHyperlink(sheet, address)?.visited).toBeFalsy();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellHyperlink(sheet, address)).toBeUndefined();
  });
});
