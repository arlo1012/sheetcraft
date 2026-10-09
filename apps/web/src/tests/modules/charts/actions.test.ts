import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  setCellContent,
  createSheetEvaluator,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { useChartActions } from "../../../modules/charts/useChartActions";
function fixture() {
  let workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  let sheet = getActiveSheet(workbook);
  [
    ["Region", "Sales"],
    ["East", 10],
    ["West", 20],
  ].forEach((row, r) =>
    row.forEach((value, c) =>
      setCellContent(sheet, { row: r, column: c }, { kind: "literal", value }),
    ),
  );
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const actions = useChartActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "Sales",
  });
  return {
    actions,
    execute,
    getSheet: () => sheet,
    switchSheet: () => {
      sheet = createSheet("Other", "other");
      workbook.sheets.set(sheet.id, sheet);
    },
    replaceWorkbook: () => {
      workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
      sheet = getActiveSheet(workbook);
    },
  };
}
describe("chart actions", () => {
  test("inserts and edits a chart through Core without adding a duplicate", () => {
    const f = fixture();
    f.actions.insert("column");
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    expect(f.getSheet().drawings).toHaveLength(1);
    const drawing = f.getSheet().drawings![0] as SheetChartDrawing;
    f.actions.edit(drawing);
    f.actions.confirm(
      { ...drawing, chart: { ...drawing.chart, title: "Updated", type: "line" } },
      "A1:B3",
    );
    expect(f.getSheet().drawings).toHaveLength(1);
    expect((f.getSheet().drawings![0] as SheetChartDrawing).chart).toMatchObject({
      title: "Updated",
      type: "line",
    });
    expect(f.actions.editing.value).toBeUndefined();
  });
  test("creates four dashboard charts in one collection command", () => {
    const f = fixture();
    f.actions.insert("dashboard");
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    expect(f.execute).toHaveBeenCalledTimes(1);
    const drawings = f.getSheet().drawings! as SheetChartDrawing[];
    expect(drawings.map((drawing) => drawing.chart.type)).toEqual(["column", "line", "pie", "bar"]);
    expect(new Set(drawings.map((drawing) => drawing.id)).size).toBe(4);
    expect(drawings.map((drawing) => [drawing.offsetX, drawing.offsetY])).toEqual([
      [8, 8],
      [508, 8],
      [8, 328],
      [508, 328],
    ]);
  });
  test.each(["sheet", "workbook", "protection"] as const)(
    "rejects confirmation after %s changes",
    (change) => {
      const f = fixture();
      f.actions.insert("column");
      const draft = f.actions.editing.value!;
      if (change === "sheet") f.switchSheet();
      if (change === "workbook") f.replaceWorkbook();
      if (change === "protection") f.getSheet().properties.protected = true;
      f.actions.confirm(draft, "A1:B3");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.getSheet().drawings ?? []).toEqual([]);
    },
  );
  test("rejects nonnumeric chart data and retains the editor error state", () => {
    const f = fixture();
    setCellContent(f.getSheet(), { row: 1, column: 1 }, { kind: "literal", value: "ten" });
    setCellContent(f.getSheet(), { row: 2, column: 1 }, null);
    f.actions.insert("column");
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBeDefined();
  });
});
