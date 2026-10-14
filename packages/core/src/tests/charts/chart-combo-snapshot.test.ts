import { describe, expect, test, vi } from "vitest";
import { planChartColumnLineCombo } from "../../chart-combo.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementDrawing } from "./chart-elements-fixture.js";

describe("conditional combo snapshot85 and history", () => {
  test("combo/dormant drawType writes85; absence keeps old exact envelope", () => {
    const book = createWorkbook({ id: "book", sheetId: "owner" }),
      sheet = getActiveSheet(book),
      original = elementDrawing();
    sheet.drawings = [original];
    const old = serializeWorkbook(book);
    expect(old.version).toBe(43);
    for (const chart of [
      { ...original.chart, type: "combo" as const },
      { ...original.chart, format: { series: [{ id: "retired", drawType: "line" as const }] } },
    ]) {
      sheet.drawings = [{ ...original, chart }];
      const saved = serializeWorkbook(book);
      expect(saved.version).toBe(85);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
      expect(() => deserializeWorkbook({ ...saved, version: 84 })).toThrow(/85/);
    }
    sheet.drawings = [original];
    expect(serializeWorkbook(book)).toEqual(old);
  });
  test("single command routes physical series and Undo/Redo restores exact old/new snapshots", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      drawing = elementDrawing();
    sheet.drawings = [drawing];
    const before = serializeWorkbook(session.workbook);
    const chart = planChartColumnLineCombo(drawing.chart, [
      {
        rangeBand: { seriesBy: "columns", index: 2 },
        drawType: "line",
        axis: "secondary",
        markers: true,
      },
    ]);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [{ ...drawing, chart }]),
      ),
    ).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(85);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
  test.each([80, 81, 82, 83, 84])(
    "version%d rejects routing before placement getter",
    (version) => {
      const book = createWorkbook({ id: "book", sheetId: "owner" }),
        drawing = elementDrawing(),
        getter = vi.fn(() => {
          throw Error("read");
        });
      drawing.chart.type = "combo";
      Object.defineProperty(drawing, "id", { get: getter });
      const snapshot = serializeWorkbook(book);
      expect(() =>
        deserializeWorkbook({
          ...snapshot,
          version,
          sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
        }),
      ).toThrow(/85/);
      expect(getter).not.toHaveBeenCalled();
    },
  );
});
