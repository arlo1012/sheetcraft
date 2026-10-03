import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "../../errors.js";
import { createBuiltinCellStyles, type CellStyleDefinition } from "../../cell-styles.js";
import {
  createApplyCellStyleCommand,
  createSetWorkbookCellStylesCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, getCellStyle, setCellStyle } from "../../workbook.js";
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
    expect(snapshot.version).toBe(14);
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
});
