// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function icon(iconId: "arrow-right" | "letter-a" | "factory"): SheetGraphicDrawing {
  return {
    id: `icon-${iconId}`,
    kind: "icon",
    iconId,
    name: `Local ${iconId}`,
    anchor: { row: 2, column: 3 },
    offsetX: 8,
    offsetY: 8,
    width: 80,
    height: 80,
    text: "",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 2,
    color: "#111827",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
  };
}

describe("local vector icon drawings", () => {
  test.each(["arrow-right", "letter-a", "factory"] as const)(
    "normalizes and saves icon identity %s with its editable paint and placement",
    (id) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const original = icon(id);
      const before = structuredClone(original);
      const normalized = normalizeSheetDrawing(original) as SheetGraphicDrawing;
      expect(normalized).toEqual(before);
      expect(normalized).not.toBe(original);
      expect(normalized.anchor).not.toBe(original.anchor);
      expect(
        executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [original])),
      ).toBe(true);
      const snapshot = serializeWorkbook(session.workbook);
      const restored = deserializeWorkbook(snapshot);
      expect(restored.sheets.get(sheet.id)!.drawings).toEqual([before]);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(original).toEqual(before);
    },
  );

  test("an icon's fill and outline edits survive save and exact undo/redo without changing its vector identity", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const original = icon("factory");
    const empty = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [original])),
    ).toBe(true);
    const inserted = serializeWorkbook(session.workbook);
    const edited = {
      ...original,
      fill: "#ffcc00",
      stroke: "#334455",
      strokeWidth: 4,
      width: 120,
      height: 90,
      rotation: 15,
    };
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [edited]))).toBe(
      true,
    );
    const saved = serializeWorkbook(session.workbook);
    expect(session.history.undoStack).toHaveLength(2);
    expect(sheet.drawings).toEqual([edited]);
    expect((sheet.drawings![0] as SheetGraphicDrawing).iconId).toBe("factory");
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(inserted);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(empty);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(inserted);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(saved);
    expect(original.fill).toBe("#abcdef");
    expect(original.stroke).toBe("#123456");
  });
});
