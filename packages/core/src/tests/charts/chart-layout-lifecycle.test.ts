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
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
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
import { chartLayoutElements, chartLayoutFormat, layoutDrawing } from "./chart-layout-fixture.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing, vectorRange } from "./chart-source-fixture.js";

function fixture() {
  const session = createTestWorkbookSession(),
    source = getActiveSheet(session.workbook),
    owner = createSheet("Owner", "owner"),
    drawing = sourceDrawing(source.id);
  session.workbook.sheets.set(owner.id, owner);
  drawing.chart.elements = chartLayoutElements();
  drawing.chart.format = chartLayoutFormat();
  source.drawings = normalizeSheetDrawings([drawing]);
  owner.drawings = normalizeSheetDrawings([drawing]);
  owner.properties.hidden = true;
  owner.properties.protected = true;
  owner.protection = { editableRanges: [] };
  return { session, source, owner };
}

function expectLayout(chart: SheetChart) {
  expect(chart.elements).toEqual(chartLayoutElements());
  expect(chart.format).toEqual(chartLayoutFormat());
}

describe("chart layout lifecycle and unchanged authoritative data", () => {
  test("structural reference maintenance preserves all layout truth with exact Undo/Redo", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook);
    expect(
      executeWorkbookCommand(session, createInsertSheetAxisCommand(source.id, "row", 2, 1)),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const external = owner.drawings![0]! as SheetChartDrawing;
    expectLayout(external.chart);
    expect(external.chart.source!.series[0]!.values).toEqual({
      kind: "range",
      sheetId: source.id,
      range: vectorRange(1, 1, 4),
    });
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(82);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("protected reference-only signatures reject changes to each layout leaf", () => {
    const { session, source, owner } = fixture(),
      before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    const mutate = [
      (chart: SheetChart) => {
        chart.elements!.dataTable = "none";
      },
      (chart: SheetChart) => {
        chart.elements!.labelContent = "value";
      },
      (chart: SheetChart) => {
        chart.elements!.labelScope = "all";
      },
      (chart: SheetChart) => {
        chart.format!.categoryAxis!.titleVisible = true;
      },
      (chart: SheetChart) => {
        chart.format!.valueAxis!.majorGridlines = false;
      },
      (chart: SheetChart) => {
        chart.format!.valueAxis!.minorGridlines = true;
      },
      (chart: SheetChart) => {
        chart.format!.valueAxis!.titleVisible = false;
      },
      (chart: SheetChart) => {
        chart.format!.secondaryValueAxis!.majorGridlines = true;
      },
      (chart: SheetChart) => {
        chart.format!.secondaryValueAxis!.minorGridlines = false;
      },
      (chart: SheetChart) => {
        chart.format!.secondaryValueAxis!.titleVisible = true;
      },
    ];
    for (const change of mutate) {
      const drawings = normalizeSheetDrawings(owner.drawings);
      change((drawings[0]! as SheetChartDrawing).chart);
      expect(() =>
        prepareExternalDrawingCollections(session.workbook, source.id, [
          { sheetId: owner.id, drawings },
        ]),
      ).toThrow(/reference maintenance/);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history).toEqual(history);
    }
  });

  test("sheet duplication, actual clipboard clone and ordinary cross-sheet move are detached", () => {
    const { session, source, owner } = fixture(),
      original = source.drawings![0]! as SheetChartDrawing;
    const duplicate = createDuplicateSheetCommand(session.workbook, source.id, {
        id: "copy",
        name: "Copy",
      }),
      duplicateChart = (duplicate.sheet.drawings![0]! as SheetChartDrawing).chart;
    expectLayout(duplicateChart);
    expect(duplicateChart.source!.series[0]!.values).toMatchObject({ sheetId: "copy" });
    duplicateChart.elements!.dataTable = "none";
    duplicateChart.format!.valueAxis!.titleVisible = false;
    expectLayout(original.chart);
    const [clipboard] = cloneShapeRootsForClipboard(source.drawings!, {
      createId: () => "clipboard",
    });
    if (!clipboard || clipboard.kind !== "chart") throw Error("Expected chart clipboard");
    expect(clipboard.id).toBe("clipboard");
    expectLayout(clipboard.chart);
    clipboard.chart.elements!.labelScope = "all";
    clipboard.chart.format!.secondaryValueAxis!.minorGridlines = false;
    clipboard.chart.source!.series[0]!.id = "copied";
    expectLayout(original.chart);
    expect(original.chart.source!.series[0]!.id).toBe("apple");
    owner.properties.protected = false;
    const before = serializeWorkbook(session.workbook),
      input = normalizeSheetDrawings(source.drawings);
    const move = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: source.id, expectedDrawings: source.drawings!, drawings: [] },
      { sheetId: owner.id, expectedDrawings: owner.drawings!, drawings: input },
    ]);
    (input[0]! as SheetChartDrawing).chart.elements!.dataTable = "none";
    (input[0]! as SheetChartDrawing).chart.format!.categoryAxis!.titleVisible = true;
    expect(executeWorkbookCommand(session, move)).toBe(true);
    expect(source.drawings).toEqual([]);
    expectLayout((owner.drawings![0]! as SheetChartDrawing).chart);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("rectangle, ordered sources and cached data retain signed, zero and missing values", () => {
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
    const cells = createSheetSparseState(sheet).cells,
      rectangle = elementDrawing().chart,
      live = sourceDrawing(sheet.id).chart,
      read = (chart: SheetChart) => getSheetChartData(sheet, chart, createSheetEvaluator(sheet));
    for (const chart of [rectangle, live]) {
      const expected = read(chart),
        presented = normalizeSheetChart({
          ...chart,
          elements: chartLayoutElements(),
          format: chartLayoutFormat(),
        });
      expect(read(presented)).toEqual(expected);
      expect(read(presented).series.map(({ values }) => values)).toEqual([
        [10, -10, 0],
        [null, 20, -20],
      ]);
      expect(presented.source).toEqual(chart.source);
      sheet.drawings = [{ ...layoutDrawing(), chart: presented }];
      const saved = serializeWorkbook(session.workbook),
        restored = deserializeWorkbook(saved),
        restoredSheet = getActiveSheet(restored),
        restoredChart = (restoredSheet.drawings![0]! as SheetChartDrawing).chart;
      expect(
        getSheetChartData(restoredSheet, restoredChart, createSheetEvaluator(restoredSheet)),
      ).toEqual(expected);
      expect(createSheetSparseState(sheet).cells).toEqual(cells);
      expect(createSheetSparseState(restoredSheet).cells).toEqual(cells);
    }
    const cache = read(rectangle),
      beforeCache = structuredClone(cache),
      cached = normalizeSheetChart({
        ...rectangle,
        range: null,
        dataCache: cache,
        elements: chartLayoutElements(),
        format: chartLayoutFormat(),
      });
    expect(read(cached)).toEqual(normalizeChartDataCache(beforeCache));
    expect(read(cached).series.every((entry) => entry.rangeBand === undefined)).toBe(true);
    cached.dataCache!.series[0]!.values[0] = 999;
    cached.elements!.dataTable = "none";
    expect(cache).toEqual(beforeCache);
    expect(createSheetSparseState(sheet).cells).toEqual(cells);
  });

  test("Pivot refresh and detachment preserve layout and exact raw measure data", () => {
    const f = pivotFixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const original = f.destination.drawings![0]! as SheetChartDrawing,
      expected = getSheetChartData(
        f.destination,
        original.chart,
        createSheetEvaluator(f.destination),
      );
    const drawing = {
      ...original,
      chart: { ...original.chart, elements: chartLayoutElements(), format: chartLayoutFormat() },
    };
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.destination.id, [drawing])),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, { ...f.table, name: "Refreshed" }),
      ),
    ).toBe(true);
    const current = () => (f.destination.drawings![0]! as SheetChartDrawing).chart,
      read = () => getSheetChartData(f.destination, current(), createSheetEvaluator(f.destination));
    expectLayout(current());
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
    expectLayout(current());
    expect(current().dataCache).toEqual(expected);
    expect(read()).toEqual(expected);
    const after = serializeWorkbook(f.workbook);
    expect(after.version).toBe(82);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    expect(read()).toEqual(expected);
  });
});
