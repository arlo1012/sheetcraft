import { describe, expect, test } from "vitest";
import {
  createSetSheetDrawingsCommand,
  createReplaceSheetDrawingCollectionsCommand,
} from "../../commands/drawings.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import { createInsertSheetAxisCommand } from "../../commands/structure.js";
import { createDuplicateSheetCommand } from "../../commands/sheets.js";
import {
  createRemovePivotTableCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import type { RestoreSheetAxisSliceCommand } from "../../commands/contracts.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  getSheetChartData,
  normalizeChartDataCache,
  normalizeSheetChart,
  type SheetChart,
} from "../../sheet-charts.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  createSheetEvaluator,
  createSheetSparseState,
  getActiveSheet,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture as pivotFixture } from "../pivot-tables/fixture.js";
import { chartPresentation, presentationDrawing } from "./chart-presentation-fixture.js";
import { sourceDrawing, vectorRange } from "./chart-source-fixture.js";

function fixture() {
  const session = createTestWorkbookSession(),
    source = getActiveSheet(session.workbook);
  const owner = createSheet("Owner", "owner");
  session.workbook.sheets.set(owner.id, owner);
  const drawing = sourceDrawing(source.id);
  drawing.chart.type = "line";
  drawing.chart.stacked = true;
  drawing.chart.presentation = chartPresentation();
  source.drawings = normalizeSheetDrawings([drawing]);
  owner.drawings = normalizeSheetDrawings([drawing]);
  owner.properties.hidden = true;
  owner.properties.protected = true;
  owner.protection = { editableRanges: [] };
  return { session, source, owner };
}

describe("chart presentation lifecycle, isolation and unchanged raw values", () => {
  test("structural references retain presentation with one exact Undo/Redo", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 2, 1)),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const external = owner.drawings![0]! as SheetChartDrawing;
    expect(external.chart.presentation).toEqual(chartPresentation());
    expect(external.chart.source!.series[0]!.values).toEqual({
      kind: "range",
      sheetId: source.id,
      range: vectorRange(1, 1, 4),
    });
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(81);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("protected reference-only signatures cover all new presentation fields", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook);
    const history = structuredClone(session.history);
    for (const mutate of [
      (drawing: SheetChartDrawing) => {
        delete drawing.chart.presentation;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.presentation = {};
      },
      (drawing: SheetChartDrawing) => {
        delete drawing.chart.presentation!.percentStacked;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.presentation!.lineMarkers = true;
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.presentation!.palette![0] = "#fff";
      },
      (drawing: SheetChartDrawing) => {
        drawing.chart.presentation!.background = "#fff";
      },
    ]) {
      const drawings = normalizeSheetDrawings(owner.drawings);
      mutate(drawings[0]! as SheetChartDrawing);
      expect(() =>
        prepareExternalDrawingCollections(session.workbook, source.id, [
          { sheetId: owner.id, drawings },
        ]),
      ).toThrow(/reference maintenance/);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history).toEqual(history);
    }
    expect(
      prepareExternalDrawingCollections(session.workbook, source.id, [
        { sheetId: owner.id, drawings: normalizeSheetDrawings(owner.drawings) },
      ]).next,
    ).toEqual([]);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 2, 1)),
    ).toBe(true);
    const inverse = structuredClone(
      session.history.undoStack[0]!.command,
    ) as RestoreSheetAxisSliceCommand;
    (
      inverse.slice.externalDrawingCollections![0]!.drawings[0]! as SheetChartDrawing
    ).chart.presentation!.palette![0] = "#fff";
    const stable = serializeWorkbook(session.workbook),
      stableHistory = structuredClone(session.history);
    expect(() => executeWorkbookCommand(session, inverse)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
    expect(session.history).toEqual(stableHistory);
  });

  test("sheet duplication and ordinary cross-sheet copy/move preserve detached palette choices", () => {
    const { session, source, owner } = fixture();
    const duplicate = createDuplicateSheetCommand(session.workbook, source.id, {
      id: "copy",
      name: "Copy",
    });
    const duplicateChart = (duplicate.sheet.drawings![0]! as SheetChartDrawing).chart;
    expect(duplicateChart.presentation).toEqual(chartPresentation());
    expect(duplicateChart.presentation).not.toBe(
      (source.drawings![0]! as SheetChartDrawing).chart.presentation,
    );
    expect(duplicateChart.source!.series[0]!.values).toMatchObject({ sheetId: "copy" });
    duplicateChart.presentation!.palette![0] = "#fff";
    expect((source.drawings![0]! as SheetChartDrawing).chart.presentation).toEqual(
      chartPresentation(),
    );
    owner.properties.protected = false;
    const copied = normalizeSheetDrawings(source.drawings);
    copied[0]!.id = "copied";
    const copyCommand = createSetSheetDrawingsCommand(owner.id, copied);
    (copied[0]! as SheetChartDrawing).chart.presentation!.palette![0] = "#fff";
    expect(executeWorkbookCommand(session, copyCommand)).toBe(true);
    expect((owner.drawings![0]! as SheetChartDrawing).chart.presentation).toEqual(
      chartPresentation(),
    );
    session.history.undoStack = [];
    session.history.redoStack = [];
    const before = serializeWorkbook(session.workbook),
      input = normalizeSheetDrawings(source.drawings);
    const move = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: source.id, expectedDrawings: source.drawings!, drawings: [] },
      { sheetId: owner.id, expectedDrawings: owner.drawings!, drawings: input },
    ]);
    (input[0]! as SheetChartDrawing).chart.presentation!.background = "#fff";
    expect(executeWorkbookCommand(session, move)).toBe(true);
    expect(source.drawings).toEqual([]);
    expect((owner.drawings![0]! as SheetChartDrawing).chart.presentation).toEqual(
      chartPresentation(),
    );
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("rectangle, ordered sources and cache keep signs, zeroes, gaps and underlying values", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const values = [
      ["Category", "Apple", "Pear"],
      ["A", 10, null],
      ["B", -10, 20],
      ["C", 0, -20],
    ];
    values.forEach((row, r) =>
      row.forEach((value, c) => setCellValue(sheet, { row: r, column: c }, value)),
    );
    const cells = createSheetSparseState(sheet).cells;
    const rectangle = presentationDrawing().chart;
    const live = { ...sourceDrawing(sheet.id).chart, type: "line", stacked: true } as SheetChart;
    const read = (chart: SheetChart) =>
      getSheetChartData(sheet, chart, createSheetEvaluator(sheet));
    for (const chart of [rectangle, live]) {
      const expected = read(chart),
        presented = normalizeSheetChart({ ...chart, presentation: chartPresentation() });
      expect(read(presented)).toEqual(expected);
      expect(read(presented).series.map(({ values }) => values)).toEqual([
        [10, -10, 0],
        [null, 20, -20],
      ]);
      sheet.drawings = [{ ...presentationDrawing(), chart: presented }];
      const saved = serializeWorkbook(session.workbook),
        restored = deserializeWorkbook(saved);
      const restoredSheet = getActiveSheet(restored),
        restoredChart = (restoredSheet.drawings![0]! as SheetChartDrawing).chart;
      expect(
        getSheetChartData(restoredSheet, restoredChart, createSheetEvaluator(restoredSheet)),
      ).toEqual(expected);
      expect(createSheetSparseState(sheet).cells).toEqual(cells);
      expect(createSheetSparseState(restoredSheet).cells).toEqual(cells);
    }
    const cache = read(rectangle),
      beforeCache = structuredClone(cache);
    const cached = normalizeSheetChart({
      ...rectangle,
      range: null,
      dataCache: cache,
      presentation: chartPresentation(),
    });
    expect(read(cached)).toEqual(normalizeChartDataCache(beforeCache));
    expect(read(cached).series.every((entry) => entry.rangeBand === undefined)).toBe(true);
    cached.dataCache!.series[0]!.values[0] = 999;
    cached.presentation!.palette![0] = "#fff";
    expect(cache).toEqual(beforeCache);
    expect(createSheetSparseState(sheet).cells).toEqual(cells);
  });

  test("Pivot refresh and detachment preserve presentation and exact raw measure data", () => {
    const f = pivotFixture();
    expect(
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
      ),
    ).toBe(true);
    const original = f.destination.drawings![0]! as SheetChartDrawing;
    const drawing = {
      ...original,
      chart: {
        ...original.chart,
        type: "line" as const,
        stacked: true,
        presentation: chartPresentation(),
      },
    };
    const expected = getSheetChartData(
      f.destination,
      original.chart,
      createSheetEvaluator(f.destination),
    );
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.destination.id, [drawing])),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, { ...f.table, name: "Refreshed" }),
      ),
    ).toBe(true);
    const current = () => (f.destination.drawings![0]! as SheetChartDrawing).chart;
    const read = () =>
      getSheetChartData(f.destination, current(), createSheetEvaluator(f.destination));
    expect(current().presentation).toEqual(chartPresentation());
    expect(read()).toEqual(expected);
    f.session.history.undoStack = [];
    f.session.history.redoStack = [];
    const before = serializeWorkbook(f.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createRemovePivotTableCommand(f.destination.id, f.table.id, true),
      ),
    ).toBe(true);
    expect(current().pivotTableId).toBeUndefined();
    expect(current().presentation).toEqual(chartPresentation());
    expect(current().dataCache).toEqual(expected);
    expect(read()).toEqual(expected);
    const after = serializeWorkbook(f.workbook);
    expect(after.version).toBe(81);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    expect(read()).toEqual(expected);
  });
});
