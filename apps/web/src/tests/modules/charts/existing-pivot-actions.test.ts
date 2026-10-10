import { effectScope, ref, shallowRef, type EffectScope } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyWorkbookCommand,
  createCreateTableCommand,
  createSetPivotTableCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { getPivotTableSource, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  MAX_SHEET_COLUMNS,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { useChartActions } from "../../../modules/charts/useChartActions";

const scopes: EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
function fixture() {
  const book = createWorkbook({
    id: "pivot-chart-book",
    sheetId: "source",
    sheetName: "Source Data",
  });
  const source = getActiveSheet(book);
  [
    ["Region", "Amount"],
    ["East", 10],
    ["East", 20],
    ["West", 40],
  ].forEach((row, r) =>
    row.forEach((value, column) => setCellValue(source, { row: r, column }, value)),
  );
  applyWorkbookCommand(
    book,
    createCreateTableCommand(source.id, {
      id: "source-table",
      name: "Table1",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      columns: [
        { id: "region", name: "Region" },
        { id: "amount", name: "Amount" },
      ],
      style: createBuiltinTableStyles("#4f81bd")[0]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  const output = createSheet("Report", "report");
  insertSheet(book, output);
  book.activeSheetId = output.id;
  const definition: SheetPivotTable = {
    id: "pivot",
    name: "Sales Report",
    sourceSheetId: source.id,
    sourceTableId: "source-table",
    source: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    anchor: { row: 2, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
    filters: [],
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    sort: "ascending",
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
  };
  applyWorkbookCommand(book, createSetPivotTableCommand(output.id, definition));
  const report = output.pivotTables![0]!;
  const workbook = shallowRef(book),
    sheet = shallowRef(output),
    generation = ref(0),
    revision = ref(0),
    busy = ref(false);
  const session = createWorkbookSession({ workbook: book, idFactory: createSequentialIdFactory() });
  const execute = vi.fn((command: WorkbookCommand) => {
    session.workbook = workbook.value;
    const result = executeWorkbookCommand(session, command);
    revision.value++;
    return result;
  });
  const flush = vi.fn(() => true),
    onEditPivot = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() =>
    useChartActions({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getRange: () => ({ start: { ...report.anchor }, end: { ...report.anchor } }),
      getEvaluator: () => createSheetEvaluator(sheet.value),
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      isBusy: () => busy.value,
      flush,
      execute,
      name: () => "Chart",
      onEditPivot,
    }),
  )!;
  return {
    actions,
    workbook,
    sheet,
    source,
    output,
    report,
    session,
    execute,
    flush,
    busy,
    generation,
    revision,
    onEditPivot,
    scope,
  };
}
function linkedData(f: ReturnType<typeof fixture>) {
  return getSheetChartData(
    f.output,
    f.actions.editing.value!.chart,
    createSheetEvaluator(f.output),
  );
}
function withoutDrawings(sheet: ReturnType<typeof createSheet>) {
  const snapshot = serializeSheet(sheet);
  delete snapshot.drawings;
  return snapshot;
}
describe("existing report PivotChart actions", () => {
  test("opens without a command and appends only a linked chart, with one undo/redo and snapshot persistence", () => {
    const f = fixture();
    const sourceBefore = serializeSheet(f.source),
      outputBefore = withoutDrawings(f.output);
    f.actions.insertPivot(f.report.id);
    const dialog = f.actions.dialog.value!,
      draft = dialog.initial;
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(draft).toMatchObject({
      name: f.report.name,
      anchor: { row: 2, column: 3 },
      width: 480,
      height: 300,
      offsetX: 8,
      offsetY: 8,
      chart: {
        pivotTableId: f.report.id,
        range: f.report.outputRange,
        title: f.report.name,
        type: "column",
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        showHidden: true,
      },
    });
    expect(draft.chart.dataCache).toBeUndefined();
    const data = linkedData(f);
    expect(data.categories).toEqual(["East", "West"]);
    expect(data.series[0]!.values).toEqual([30, 40]);
    // The source field is locked; stale/renamed source text cannot change the authoritative link.
    f.output.name = "Renamed report sheet";
    dialog.confirm(
      {
        ...draft,
        chart: {
          ...draft.chart,
          type: "line",
          range: { start: { row: 0, column: 8 }, end: { row: 3, column: 9 } },
        },
      },
      "Missing source!A1:B4",
    );
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0]).toMatchObject({
      type: "setSheetDrawings",
      sheetId: f.output.id,
    });
    expect(f.actions.dialog.value).toBeUndefined();
    const drawing = f.output.drawings![0] as SheetChartDrawing;
    expect(drawing.chart).toMatchObject({
      pivotTableId: f.report.id,
      range: f.report.outputRange,
      type: "line",
    });
    expect(getSheetChartData(f.output, drawing.chart, createSheetEvaluator(f.output))).toEqual(
      data,
    );
    expect(f.output.pivotTables![0]).toBe(f.report);
    expect(serializeSheet(f.source)).toEqual(sourceBefore);
    expect(withoutDrawings(f.output)).toEqual({ ...outputBefore, name: f.output.name });
    expect(f.workbook.value.sheets.size).toBe(2);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.output.drawings ?? []).toEqual([]);
    expect(f.output.pivotTables![0]).toBe(f.report);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.output.drawings![0]).toEqual(drawing);
    const restored = deserializeWorkbook(serializeWorkbook(f.workbook.value));
    const restoredOutput = restored.sheets.get(f.output.id)!;
    expect(restoredOutput.drawings![0]).toEqual(drawing);
    expect(
      getSheetChartData(restoredOutput, drawing.chart, createSheetEvaluator(restoredOutput)),
    ).toEqual(data);
    dialog.confirm(draft, "");
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test.each(["changed", "grown", "table deleted", "source deleted"] as const)(
    "uses last materialized output after source is %s",
    (change) => {
      const f = fixture();
      if (change === "changed") setCellValue(f.source, { row: 1, column: 1 }, 999);
      if (change === "grown") {
        setCellValue(f.source, { row: 4, column: 0 }, "North");
        setCellValue(f.source, { row: 4, column: 1 }, 888);
        f.source.tables![0]!.range.end.row = 4;
      }
      if (change === "table deleted") f.source.tables = [];
      if (change === "source deleted") f.workbook.value.sheets.delete(f.source.id);
      if (change.endsWith("deleted"))
        expect(() => getPivotTableSource(f.workbook.value, f.report)).toThrow();
      const before = withoutDrawings(f.output);
      f.actions.insertPivot(f.report.id);
      expect(linkedData(f).series[0]!.values).toEqual([30, 40]);
      const dialog = f.actions.dialog.value!;
      dialog.confirm(dialog.initial, "invalid locked reference");
      expect(f.output.drawings).toHaveLength(1);
      expect(withoutDrawings(f.output)).toEqual(before);
      expect(f.execute.mock.calls[0]![0].type).toBe("setSheetDrawings");
    },
  );
  test("cancel and edit-linked-pivot only dismiss the captured dialog", () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook.value);
    f.actions.insertPivot(f.report.id);
    f.actions.dialog.value!.close();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    f.actions.insertPivot(f.report.id);
    const dialog = f.actions.dialog.value!;
    dialog.editPivot("other-report");
    expect(f.actions.dialog.value).toBe(dialog);
    dialog.editPivot(f.report.id);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.onEditPivot).toHaveBeenCalledExactlyOnceWith(f.report.id);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
  });
  test.each(["false", "throw"] as const)(
    "retains draft/error on execute %s and permits safe retry",
    (failure) => {
      const f = fixture();
      f.actions.insertPivot(f.report.id);
      const dialog = f.actions.dialog.value!,
        before = serializeWorkbook(f.workbook.value);
      if (failure === "false") f.execute.mockReturnValueOnce(false);
      else
        f.execute.mockImplementationOnce(() => {
          throw new Error("Rejected");
        });
      dialog.confirm(dialog.initial, "");
      expect(f.actions.dialog.value).toBe(dialog);
      expect(f.actions.error.value).toBe(true);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      dialog.confirm(dialog.initial, "");
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(f.output.drawings).toHaveLength(1);
      expect(f.session.history.undoStack).toHaveLength(1);
      dialog.confirm(dialog.initial, "");
      expect(f.execute).toHaveBeenCalledTimes(2);
    },
  );
  test("requires editObjects alone and permits workbook structure protection", () => {
    const f = fixture();
    f.output.properties.protected = true;
    f.output.protection = { editableRanges: [], editObjects: true };
    f.workbook.value.protection = { structure: true };
    f.actions.insertPivot(f.report.id);
    expect(f.actions.dialog.value).toBeDefined();
    const dialog = f.actions.dialog.value!;
    dialog.confirm(dialog.initial, "");
    expect(f.output.drawings).toHaveLength(1);
    f.output.protection = { editableRanges: [], pivotTables: true };
    f.actions.insertPivot(f.report.id);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test.each(["busy", "flush", "missing"] as const)(
    "does not open a chooser when %s blocks insertion",
    (blocker) => {
      const f = fixture();
      if (blocker === "busy") f.busy.value = true;
      if (blocker === "flush") f.flush.mockReturnValueOnce(false);
      f.actions.insertPivot(blocker === "missing" ? "missing" : f.report.id);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test.each([
    "busy",
    "permission",
    "generation",
    "sheet",
    "report deleted",
    "report replaced",
  ] as const)("rechecks %s after entry and confirmation flush", (change) => {
    for (const during of ["entry", "confirmation"]) {
      const f = fixture();
      if (during === "confirmation") f.actions.insertPivot(f.report.id);
      const dialog = f.actions.dialog.value;
      f.flush.mockImplementationOnce(() => {
        if (change === "busy") f.busy.value = true;
        if (change === "permission") f.output.properties.protected = true;
        if (change === "generation") f.generation.value++;
        if (change === "sheet") f.sheet.value = f.source;
        if (change === "report deleted") f.output.pivotTables = [];
        if (change === "report replaced") f.output.pivotTables = [{ ...f.report }];
        return true;
      });
      if (dialog) dialog.confirm(dialog.initial, "");
      else f.actions.insertPivot(f.report.id);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.output.drawings ?? []).toEqual([]);
      expect(f.session.history.undoStack).toHaveLength(0);
      if (during === "entry") expect(f.actions.dialog.value).toBeUndefined();
    }
  });
  test.each([
    "generation",
    "workbook",
    "same-ID sheet",
    "deleted report",
    "same-ID report",
  ] as const)("invalidates captured %s identity before callbacks", (change) => {
    const f = fixture();
    f.actions.insertPivot(f.report.id);
    const old = f.actions.dialog.value!;
    if (change === "generation") f.generation.value++;
    if (change === "workbook")
      f.workbook.value = deserializeWorkbook(serializeWorkbook(f.workbook.value));
    if (change === "same-ID sheet") {
      const replacement = createSheet(f.output.name, f.output.id);
      f.workbook.value.sheets.set(replacement.id, replacement);
      f.sheet.value = replacement;
    }
    if (change === "deleted report") {
      f.output.pivotTables = [];
      f.revision.value++;
    }
    if (change === "same-ID report") {
      f.output.pivotTables = [{ ...f.report }];
      f.revision.value++;
    }
    expect(f.actions.dialog.value).toBeUndefined();
    old.confirm(old.initial, "");
    old.close();
    old.editPivot(f.report.id);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.onEditPivot).not.toHaveBeenCalled();
  });
  test("old same-chart callbacks cannot confirm, close or edit a newer remounted session", () => {
    const f = fixture();
    f.actions.insertPivot(f.report.id);
    f.actions.dialog.value!.confirm(f.actions.editing.value!, "");
    const drawing = f.output.drawings![0] as SheetChartDrawing;
    f.execute.mockClear();
    f.actions.edit(drawing);
    const old = f.actions.dialog.value!;
    old.close();
    f.actions.edit(drawing);
    const current = f.actions.dialog.value!;
    expect(current.dialogId).not.toBe(old.dialogId);
    old.confirm({ ...drawing, chart: { ...drawing.chart, title: "Old" } }, "");
    old.close();
    old.editPivot(f.report.id);
    expect(f.actions.dialog.value).toBe(current);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.onEditPivot).not.toHaveBeenCalled();
    current.confirm({ ...drawing, chart: { ...drawing.chart, title: "New" } }, "");
    expect((f.output.drawings![0] as SheetChartDrawing).chart.title).toBe("New");
    expect(f.output.drawings).toHaveLength(1);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test("unchanged existing-chart confirmation closes without an error or extra history", () => {
    const f = fixture();
    f.actions.insertPivot(f.report.id);
    f.actions.dialog.value!.confirm(f.actions.editing.value!, "");
    const drawing = f.output.drawings![0] as SheetChartDrawing;
    const before = serializeWorkbook(f.workbook.value);
    f.actions.edit(drawing);
    f.execute.mockClear();
    f.actions.dialog.value!.confirm(drawing, "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.results[0]!.value).toBe(false);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    // A rejected actual change is different from the exact Core no-op above.
    f.actions.edit(drawing);
    const dialog = f.actions.dialog.value!;
    f.execute.mockReturnValueOnce(false);
    dialog.confirm({ ...drawing, chart: { ...drawing.chart, title: "Rejected change" } }, "");
    expect(f.actions.dialog.value).toBe(dialog);
    expect(f.actions.error.value).toBe(true);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("rejects a same-ID drawing replacement rather than overwriting it", () => {
    const f = fixture();
    f.actions.insertPivot(f.report.id);
    f.actions.dialog.value!.confirm(f.actions.editing.value!, "");
    const drawing = f.output.drawings![0] as SheetChartDrawing;
    f.actions.edit(drawing);
    const old = f.actions.dialog.value!;
    f.output.drawings = [{ ...drawing, chart: { ...drawing.chart, title: "Replacement" } }];
    f.revision.value++;
    f.execute.mockClear();
    old.confirm(drawing, "");
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
    expect((f.output.drawings[0] as SheetChartDrawing).chart.title).toBe("Replacement");
  });
  test.each(["link", "cache", "empty output", "nonnumeric", "scatter", "sankey"] as const)(
    "rejects invalid %s without history and retains the chooser",
    (invalid) => {
      const f = fixture();
      if (invalid === "empty output") f.report.outputRange = null;
      if (invalid === "nonnumeric") {
        setCellValue(f.output, { row: 3, column: 1 }, "bad");
        setCellValue(f.output, { row: 4, column: 1 }, "bad");
      }
      f.actions.insertPivot(f.report.id);
      const dialog = f.actions.dialog.value!,
        draft = { ...dialog.initial, chart: { ...dialog.initial.chart } };
      if (invalid === "link") draft.chart.pivotTableId = "forged";
      if (invalid === "cache") draft.chart.dataCache = { categories: [], series: [], records: [] };
      if (invalid === "scatter" || invalid === "sankey") draft.chart.type = invalid;
      dialog.confirm(draft, "");
      expect(f.actions.dialog.value).toBe(dialog);
      expect(f.actions.error.value).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("bounds the chart anchor beside the output and prevents reentrant duplicate confirmation", () => {
    const f = fixture();
    f.report.outputRange!.end.column = MAX_SHEET_COLUMNS - 1;
    f.actions.insertPivot(f.report.id);
    expect(f.actions.editing.value!.anchor.column).toBe(MAX_SHEET_COLUMNS - 1);
    f.report.outputRange!.end.column = 1;
    const dialog = f.actions.dialog.value!;
    f.flush.mockImplementationOnce(() => {
      dialog.confirm(dialog.initial, "");
      return true;
    });
    dialog.confirm(dialog.initial, "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.output.drawings).toHaveLength(1);
  });
  test("a nested newer open during entry flush wins and old opens cannot overwrite it", () => {
    const f = fixture();
    f.flush.mockImplementationOnce(() => {
      f.actions.insertPivot(f.report.id);
      return true;
    });
    f.actions.insertPivot(f.report.id);
    expect(f.flush).toHaveBeenCalledTimes(2);
    expect(f.actions.dialog.value!.dialogId).toBe(1);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("disposal blocks captured callbacks and later opens", () => {
    const f = fixture();
    f.actions.insertPivot(f.report.id);
    const dialog = f.actions.dialog.value!;
    f.scope.stop();
    dialog.confirm(dialog.initial, "");
    dialog.editPivot(f.report.id);
    f.actions.insertPivot(f.report.id);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.onEditPivot).not.toHaveBeenCalled();
  });
});
