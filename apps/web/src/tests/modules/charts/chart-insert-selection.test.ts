import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { applyWorkbookCommand } from "@sheetcraft/core/commands";
import { useChartActions } from "../../../modules/charts/useChartActions";
function fixture(options: { reject?: boolean; replaceAfterWrite?: boolean } = {}) {
  const workbook = createWorkbook({ id: "insert-selection", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  [1, 2, 3].forEach((value, row) =>
    setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
  );
  let current = workbook;
  let generation = 0;
  const onInserted = vi.fn();
  const execute = vi.fn((command: Parameters<typeof applyWorkbookCommand>[1]) => {
    if (options.reject) return false;
    const result = applyWorkbookCommand(workbook, command);
    if (options.replaceAfterWrite) {
      current = createWorkbook({ id: "replacement", sheetId: "other" });
      generation++;
    }
    return result !== null;
  });
  const actions = useChartActions({
    getWorkbook: () => current,
    getSheet: () => getActiveSheet(current),
    getGeneration: () => generation,
    getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }),
    getEvaluator: () => createSheetEvaluator(getActiveSheet(current)),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "Charts",
    title: () => "Chart Title",
    onInserted,
  });
  function confirm() {
    const dialog = actions.dialog.value!;
    dialog.confirm(dialog.initial, "=Sheet1!$A$1:$A$3");
  }
  return {
    workbook,
    sheet,
    actions,
    onInserted,
    execute,
    confirm,
    replace: () => {
      current = createWorkbook({ id: "replacement", sheetId: "other" });
      generation++;
    },
  };
}
describe("successful chart insertion view selection", () => {
  test("selects once after success and dialog close without a second workbook command", () => {
    const f = fixture();
    f.actions.insert("column");
    const id = f.actions.dialog.value!.drawingId;
    f.onInserted.mockImplementation(() => {
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.sheet.drawings?.[0]?.id).toBe(id);
    });
    f.confirm();
    expect(f.onInserted).toHaveBeenCalledExactlyOnceWith(id);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toHaveLength(1);
  });
  test("Cancel has no selection callback or write", () => {
    const f = fixture();
    f.actions.insert("column");
    f.actions.close();
    expect(f.onInserted).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings ?? []).toHaveLength(0);
  });
  test("a rejected command keeps the dialog and does not select", () => {
    const f = fixture({ reject: true });
    f.actions.insert("column");
    f.confirm();
    expect(f.actions.dialog.value).toBeDefined();
    expect(f.onInserted).not.toHaveBeenCalled();
    expect(f.sheet.drawings ?? []).toHaveLength(0);
  });
  test("an old confirm callback cannot select or write into a replacement document", () => {
    const f = fixture();
    f.actions.insert("column");
    const old = f.actions.dialog.value!;
    f.replace();
    old.confirm(old.initial, "=Sheet1!$A$1:$A$3");
    expect(f.onInserted).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("replacement during a successful command suppresses the stale view action", () => {
    const f = fixture({ replaceAfterWrite: true });
    f.actions.insert("column");
    f.confirm();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.onInserted).not.toHaveBeenCalled();
  });
  test("editing an existing drawing never runs the inserted selection callback", () => {
    const f = fixture();
    f.actions.insert("column");
    f.confirm();
    const drawing = f.sheet.drawings![0]!;
    if (drawing.kind !== "chart") throw new Error("chart");
    f.onInserted.mockClear();
    f.actions.edit(drawing);
    f.confirm();
    expect(f.onInserted).not.toHaveBeenCalled();
    expect(f.sheet.drawings).toHaveLength(1);
  });
  test("dashboard selects only the first new drawing after its one command", () => {
    const f = fixture();
    f.actions.insert("dashboard");
    const id = f.actions.dialog.value!.drawingId;
    f.confirm();
    expect(f.sheet.drawings).toHaveLength(4);
    expect(f.onInserted).toHaveBeenCalledExactlyOnceWith(id);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test("invalid data cannot trigger an inserted view action", () => {
    const f = fixture();
    f.actions.insert("column");
    const dialog = f.actions.dialog.value!;
    dialog.confirm(dialog.initial, "=Missing!$A$1:$A$3");
    expect(f.onInserted).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
  });
});
