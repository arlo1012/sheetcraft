import { describe, expect, expectTypeOf, test } from "vitest";
import {
  ensureChartRangeSeriesIdentity,
  lookupChartRangeSeriesId,
  mapChartRangeSeries,
  reconcileChartRangeSeriesForRange,
} from "../../chart-range-series.js";
import { createChartSourceFromRange } from "../../chart-source.js";
import { mapChartSourceVectorCells } from "../../chart-source-references.js";
import type { RestoreSheetAxisSliceCommand } from "../../commands/contracts.js";
import { getSheetChartData, normalizeSheetChart, type SheetChart } from "../../sheet-charts.js";
import {
  mapDrawingSource,
  normalizeSheetDrawing,
  type SheetChartDrawing,
} from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createDeleteCellsCommand,
  createDeleteSheetAxisCommand,
  createInsertCellsCommand,
  createInsertSheetAxisCommand,
  createMoveCellRangeCommand,
  createMoveSheetAxisCommand,
} from "../../commands/index.js";
import { prepareExternalDrawingCollections } from "../../commands/text-references.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV83,
} from "../../serialization.js";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbook,
  getActiveSheet,
  setCellContent,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

function boundChart(): SheetChart {
  return {
    ...elementChart(),
    rectangleSeries: {
      rows: [
        { index: 0, id: "header-row" },
        { index: 1, id: "row-one" },
        { index: 2, id: "row-two" },
      ],
      columns: [
        { index: 0, id: "header-column" },
        { index: 1, id: "col-one" },
        { index: 2, id: "col-two" },
      ],
    },
    format: {
      series: [
        { id: "col-one", color: "#123456", axis: "secondary", strokeWidth: 3 },
        { id: "retired", color: "#abcdef" },
      ],
    },
  };
}
function drawing(): SheetChartDrawing {
  return { ...elementDrawing(), anchor: { row: 10, column: 10 }, chart: boundChart() };
}
function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  sheet.drawings = [normalizeSheetDrawing(drawing())];
  const current = () => sheet.drawings![0]! as SheetChartDrawing;
  const roundtrip = (command: Parameters<typeof executeWorkbookCommand>[1], verify: () => void) => {
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    verify();
    const after = serializeWorkbook(session.workbook);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  };
  return { session, sheet, current, roundtrip };
}
function raw(value: unknown, version: number) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "source" }));
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [value] }] };
}

describe("strict sparse live-rectangle series identities", () => {
  test("retains both orientations and dormant headers, detaching every binding", () => {
    const input = boundChart(),
      output = normalizeSheetChart(input);
    expect(output).toEqual(input);
    output.rectangleSeries!.rows[0]!.id = "other";
    expect(input.rectangleSeries!.rows[0]!.id).toBe("header-row");
    expect(lookupChartRangeSeriesId(input, { seriesBy: "columns", index: 1 })).toBe("col-one");
    expect(
      lookupChartRangeSeriesId(elementChart(), { seriesBy: "columns", index: 1 }),
    ).toBeUndefined();
    expect(elementChart()).not.toHaveProperty("rectangleSeries");
  });

  test("rejects invalid prototypes, unknown/accessor/undefined fields and duplicates without getter effects", () => {
    let calls = 0;
    const getter = Object.defineProperty({ index: 1 }, "id", {
      get() {
        calls++;
        return "bad";
      },
    });
    const sparse: unknown[] = [];
    sparse.length = 1;
    const invalid: unknown[] = [
      undefined,
      null,
      {},
      { rows: [], columns: undefined },
      Object.create({ rows: [], columns: [] }),
      { rows: [getter], columns: [] },
      { rows: [{ index: 1, id: undefined }], columns: [] },
      { rows: [{ index: 1, id: "same" }], columns: [{ index: 1, id: "same" }] },
      {
        rows: [
          { index: 1, id: "one" },
          { index: 1, id: "two" },
        ],
        columns: [],
      },
      { rows: [{ index: 4, id: "outside" }], columns: [] },
      { rows: [{ index: 1, id: " " }], columns: [] },
      { rows: [{ index: 1, id: "one", extra: true }], columns: [] },
      { rows: sparse, columns: [] },
      { rows: Object.assign([], { extra: true }), columns: [] },
      { rows: [{ index: 1.5, id: "fraction" }], columns: [] },
    ];
    for (const rectangleSeries of invalid)
      expect(() =>
        normalizeSheetChart({ ...elementChart(), rectangleSeries } as SheetChart),
      ).toThrow();
    const chart = Object.defineProperty(elementChart(), "rectangleSeries", {
      get() {
        calls++;
        return {};
      },
    });
    expect(() => normalizeSheetChart(chart)).toThrow(/own data/);
    const inherited = Object.assign(
      Object.create({ rectangleSeries: { rows: [], columns: [] } }) as SheetChart,
      elementChart(),
    );
    expect(() => normalizeSheetChart(inherited)).toThrow(/own data/);
    expect(calls).toBe(0);
  });

  test("bounds each direction at256; rejects all nonrectangle source ownership", () => {
    const chart = {
      ...elementChart(),
      range: { start: { row: 0, column: 0 }, end: { row: 4999, column: 1 } },
      rectangleSeries: {
        rows: Array.from({ length: 256 }, (_, index) => ({ index, id: `r${index}` })),
        columns: [],
      },
    };
    expect(() => normalizeSheetChart(chart)).not.toThrow();
    chart.rectangleSeries.rows.push({ index: 256, id: "overflow" });
    expect(() => normalizeSheetChart(chart)).toThrow(/budget/);
    for (const replacement of [
      { range: null },
      { pivotTableId: "pivot" },
      { dataCache: { categories: [], series: [], records: [] } },
      { range: null, source: sourceDrawing().chart.source },
    ])
      expect(() => normalizeSheetChart({ ...boundChart(), ...replacement })).toThrow(/rectangle/);
  });

  test("allocates a token excluding both bindings and all dormant style IDs with no input mutation", () => {
    const input = {
      ...elementChart(),
      rectangleSeries: { rows: [{ index: 1, id: "range-series-1" }], columns: [] },
      format: { series: [{ id: "range-series-2", color: "#fff" }] },
    };
    const { chart, id } = ensureChartRangeSeriesIdentity(input, { seriesBy: "columns", index: 2 });
    expect(id).toBe("range-series-3");
    expect(chart.rectangleSeries!.columns).toEqual([{ index: 2, id }]);
    expect(input.rectangleSeries.columns).toEqual([]);
    expect(chart.source).toBeUndefined();
    expect(chart.range).toEqual(input.range);
    expect(ensureChartRangeSeriesIdentity(chart, { seriesBy: "columns", index: 2 })).toEqual({
      chart,
      id,
    });
    expect(() => ensureChartRangeSeriesIdentity(input, { seriesBy: "columns", index: 0 })).toThrow(
      /active/,
    );
    expect(() => ensureChartRangeSeriesIdentity(input, { seriesBy: "rows", index: 1 })).toThrow(
      /active/,
    );
  });
});

describe("read and explicit source lifecycles preserve rectangle authority", () => {
  test.each(["column", "bar", "line", "area", "radar"] as const)(
    "%s data emits physical bands and existing IDs without allocation or raw-value changes",
    (type) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      for (const [row, values] of [
        ["Category", "A", "B"],
        ["X", 1, 2],
        ["Y", 3, 4],
        ["Z", 5, 6],
      ].entries())
        for (const [column, value] of values.entries())
          setCellContent(sheet, { row, column }, { kind: "literal", value });
      const read = (chart: SheetChart) =>
        getSheetChartData(sheet, chart, createSheetEvaluator(sheet));
      const input = { ...elementChart(), type },
        before = JSON.stringify(input),
        ordinary = read(input);
      expect(ordinary.series.map((entry) => entry.rangeBand)).toEqual([
        { seriesBy: "columns", index: 1 },
        { seriesBy: "columns", index: 2 },
      ]);
      expect(ordinary.series.every((entry) => entry.id === undefined)).toBe(true);
      expect(JSON.stringify(input)).toBe(before);
      const chart = { ...boundChart(), type };
      sheet.hiddenColumns = new Set([1]);
      const visible = read(chart);
      expect(visible.series[0]).toMatchObject({
        id: "col-two",
        rangeBand: { seriesBy: "columns", index: 2 },
        name: "B",
        values: [2, 4, 6],
      });
      chart.showHidden = true;
      expect(read(chart).series[0]!.id).toBe("col-one");
      chart.seriesBy = "rows";
      expect(read(chart).series[0]).toMatchObject({
        id: "row-one",
        rangeBand: { seriesBy: "rows", index: 1 },
        values: [1, 2],
      });
      chart.headerRow = false;
      expect(read(chart).series[0]!.id).toBe("header-row");
      expect(chart.range).toEqual(input.range);
    },
  );

  test("same-sheet range edits preserve only intersecting fixed coordinates; disjoint or cross-sheet clears bindings", () => {
    const input = boundChart();
    expect(reconcileChartRangeSeriesForRange(input, input.range)).toEqual(input);
    const next = reconcileChartRangeSeriesForRange(input, {
      start: { row: 1, column: 1 },
      end: { row: 5, column: 4 },
    });
    expect(next.rectangleSeries).toEqual({
      rows: [
        { index: 1, id: "row-one" },
        { index: 2, id: "row-two" },
      ],
      columns: [
        { index: 1, id: "col-one" },
        { index: 2, id: "col-two" },
      ],
    });
    const distant = { start: { row: 20, column: 0 }, end: { row: 25, column: 2 } };
    expect(reconcileChartRangeSeriesForRange(input, distant).rectangleSeries).toBeUndefined();
    expect(
      reconcileChartRangeSeriesForRange(input, input.range, false).rectangleSeries,
    ).toBeUndefined();
    expect(reconcileChartRangeSeriesForRange(input, null).rectangleSeries).toBeUndefined();
    expect(next.format).toEqual(input.format);
  });

  test("explicit promotion reuses active bound IDs, preserves styles and avoids dormant generated-ID collisions", () => {
    const chart = boundChart();
    chart.rectangleSeries!.columns = [{ index: 1, id: "col-one" }];
    chart.format!.series!.push({ id: "series-1", color: "#fff" });
    const source = createChartSourceFromRange("source", chart);
    expect(source.series.map((entry) => entry.id)).toEqual(["col-one", "series-2"]);
    expect(source.series.map((entry) => entry.colorIndex)).toEqual([0, 1]);
    expect(chart.rectangleSeries!.columns[0]!.id).toBe("col-one");
    expect(chart.source).toBeUndefined();
    const { rectangleSeries: _bindings, ...promoted } = chart;
    expect(normalizeSheetChart({ ...promoted, range: null, source }).format).toEqual(chart.format);
  });

  test("customsource/cache/pivot reads and old chart envelopes never acquire rectangle identities", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const source = sourceDrawing(sheet.id).chart;
    expect(
      getSheetChartData(sheet, source, createSheetEvaluator(sheet)).series.every(
        (entry) => entry.rangeBand === undefined,
      ),
    ).toBe(true);
    const cache = {
      ...elementChart(),
      dataCache: { categories: ["A"], series: [{ name: "S", values: [2] }], records: [["A", 2]] },
    };
    expect(getSheetChartData(sheet, cache, createSheetEvaluator(sheet))).toEqual(cache.dataCache);
    expect(
      getSheetChartData(
        sheet,
        { ...elementChart(), pivotTableId: "missing" },
        createSheetEvaluator(sheet),
      ),
    ).toEqual({ categories: [], series: [], records: [] });
    const loaded = deserializeWorkbook(raw(elementDrawing(), 82));
    const drawing = getActiveSheet(loaded).drawings![0]! as SheetChartDrawing;
    getSheetChartData(getActiveSheet(loaded), drawing.chart, createSheetEvaluator(sheet));
    expect(drawing.chart.rectangleSeries).toBeUndefined();
    expect(serializeWorkbook(loaded).version).toBe(43);
  });
});

describe("physical band structural planning and exact Undo/Redo", () => {
  test("full dual-direction exact-cell fallback visits at most twice the10000-cell rectangle", () => {
    const chart = normalizeSheetChart({
      ...elementChart(),
      range: { start: { row: 0, column: 0 }, end: { row: 99, column: 99 } },
      rectangleSeries: {
        rows: Array.from({ length: 100 }, (_, index) => ({ index, id: `row-${index}` })),
        columns: Array.from({ length: 100 }, (_, index) => ({ index, id: `column-${index}` })),
      },
    });
    let cells = 0;
    const mapped = mapChartRangeSeries(chart, chart.range, (band) =>
      mapChartSourceVectorCells(band, (cell) => {
        cells++;
        return { ...cell };
      }),
    );
    expect(cells).toBe(20000);
    expect(mapped).toEqual(chart);
  });

  test.each(["row", "column"] as const)(
    "internal%s reorder keeps the rectangle and physical identities through exact Undo/Redo",
    (axis) => {
      const f = fixture();
      // Keep the existing endpoint-based range-move contract: reorder an
      // interior band with both rectangle endpoints outside the moved bands.
      if (axis === "column") f.current().chart.range!.end.column = 3;
      const range = structuredClone(f.current().chart.range);
      f.roundtrip(createMoveSheetAxisCommand(f.sheet.id, axis, 1, 1, 2), () => {
        const direction = axis === "row" ? "rows" : "columns";
        expect(f.current().chart.range).toEqual(range);
        expect(lookupChartRangeSeriesId(f.current().chart, { seriesBy: direction, index: 2 })).toBe(
          axis === "row" ? "row-one" : "col-one",
        );
        expect(lookupChartRangeSeriesId(f.current().chart, { seriesBy: direction, index: 1 })).toBe(
          axis === "row" ? "row-two" : "col-two",
        );
        expect(f.current().chart.format).toEqual(boundChart().format);
      });
    },
  );

  test("forged axis inverse rectangle identity rejects before workbook or history effects", () => {
    const f = fixture();
    expect(
      executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, "row", 1)),
    ).toBe(true);
    const inverse = structuredClone(
      f.session.history.undoStack[0]!.command,
    ) as RestoreSheetAxisSliceCommand;
    const chart = (inverse.slice.metadata.drawings![0]! as SheetChartDrawing).chart;
    chart.rectangleSeries!.rows[1]!.id = "forged-before-insert";
    const before = serializeWorkbook(f.session.workbook),
      history = structuredClone(f.session.history);
    expect(() => executeWorkbookCommand(f.session, inverse)).toThrow(/associated/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history).toEqual(history);
  });

  test.each(["row", "column"] as const)(
    "%s insertion/deletion maps both directions and drops deleted bindings before compaction",
    (axis) => {
      const f = fixture();
      f.roundtrip(createInsertSheetAxisCommand(f.sheet.id, axis, 1), () => {
        const meta = f.current().chart.rectangleSeries!;
        expect(meta[axis === "row" ? "rows" : "columns"].map((entry) => entry.index)).toEqual([
          0, 2, 3,
        ]);
        expect(meta[axis === "row" ? "columns" : "rows"].map((entry) => entry.index)).toEqual([
          0, 1, 2,
        ]);
        expect(f.current().chart.format).toEqual(boundChart().format);
      });
      const g = fixture();
      g.roundtrip(createDeleteSheetAxisCommand(g.sheet.id, axis, 1), () => {
        const entries = g.current().chart.rectangleSeries![axis === "row" ? "rows" : "columns"];
        expect(entries).toEqual([
          { index: 0, id: axis === "row" ? "header-row" : "header-column" },
          { index: 1, id: axis === "row" ? "row-two" : "col-two" },
        ]);
        expect(g.current().chart.format).toEqual(boundChart().format);
      });
    },
  );

  test.each(["row", "column"] as const)(
    "whole %s move preserves identities; split or complete delete removes metadata and retains dormant style",
    (axis) => {
      const f = fixture(),
        length = axis === "row" ? 4 : 3;
      f.roundtrip(createMoveSheetAxisCommand(f.sheet.id, axis, 0, length, 5), () => {
        expect(
          f
            .current()
            .chart.rectangleSeries![axis === "row" ? "rows" : "columns"].map(
              (entry) => entry.index,
            ),
        ).toEqual([5, 6, 7]);
      });
      const g = fixture();
      g.roundtrip(createMoveSheetAxisCommand(g.sheet.id, axis, 1, 1, 6), () => {
        expect(g.current().chart.range).toBeNull();
        expect(g.current().chart.rectangleSeries).toBeUndefined();
        expect(g.current().chart.format).toEqual(boundChart().format);
      });
      const h = fixture();
      h.roundtrip(createDeleteSheetAxisCommand(h.sheet.id, axis, 0, length), () => {
        expect(h.current().chart.range).toBeNull();
        expect(h.current().chart.rectangleSeries).toBeUndefined();
      });
    },
  );

  test("cell insert/delete full stripes preserves surviving bands; partial shift retires split rectangle", () => {
    for (const insert of [true, false]) {
      const f = fixture(),
        selected = { start: { row: 1, column: 0 }, end: { row: 1, column: 2 } };
      f.roundtrip(
        insert
          ? createInsertCellsCommand(f.sheet.id, selected, "down")
          : createDeleteCellsCommand(f.sheet.id, selected, "up"),
        () => {
          expect(f.current().chart.rectangleSeries!.columns).toEqual(
            boundChart().rectangleSeries!.columns,
          );
          expect(f.current().chart.rectangleSeries!.rows).toEqual(
            insert
              ? [
                  { index: 0, id: "header-row" },
                  { index: 2, id: "row-one" },
                  { index: 3, id: "row-two" },
                ]
              : [
                  { index: 0, id: "header-row" },
                  { index: 1, id: "row-two" },
                ],
          );
        },
      );
    }
    const f = fixture();
    f.roundtrip(
      createInsertCellsCommand(
        f.sheet.id,
        { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
        "right",
      ),
      () => {
        expect(f.current().chart.range).toBeNull();
        expect(f.current().chart.rectangleSeries).toBeUndefined();
      },
    );
  });

  test("cut moves retain legacy rectangle coordinates, retire destination victims and preserve moved band ID only when exact", () => {
    const f = fixture();
    f.roundtrip(
      createMoveCellRangeCommand(
        f.sheet.id,
        { start: { row: 0, column: 1 }, end: { row: 3, column: 1 } },
        { row: 0, column: 2 },
      ),
      () => {
        expect(f.current().chart.range).toEqual(boundChart().range);
        expect(f.current().chart.rectangleSeries!.columns).toEqual([
          { index: 0, id: "header-column" },
          { index: 2, id: "col-one" },
        ]);
        expect(f.current().chart.rectangleSeries!.rows).toEqual([]);
        expect(f.current().chart.format).toEqual(boundChart().format);
      },
    );
    const g = fixture();
    g.roundtrip(
      createMoveCellRangeCommand(g.sheet.id, boundChart().range!, { row: 20, column: 20 }),
      () => {
        expect(g.current().chart.range).toEqual(boundChart().range);
        expect(g.current().chart.rectangleSeries).toEqual({ rows: [], columns: [] });
      },
    );
  });

  test("mapped collisions retire every ambiguous identity and mapping invalidation never alters format", () => {
    const input = drawing();
    const mapped = mapChartRangeSeries(input.chart, input.chart.range, (band) =>
      band.start.column === band.end.column
        ? { start: { row: 0, column: 1 }, end: { row: 3, column: 1 } }
        : band,
    );
    expect(mapped.rectangleSeries!.columns).toEqual([]);
    expect(mapped.format).toEqual(input.chart.format);
    const lost = mapDrawingSource(input, () => null) as SheetChartDrawing;
    expect(lost.chart.rectangleSeries).toBeUndefined();
    expect(lost.chart.format).toEqual(input.chart.format);
  });
});

describe("conditional snapshot83 and protection zero effects", () => {
  test("uses83 only on metadata presence and roundtrips standalone/workbook with final mixed-feature precedence", () => {
    expectTypeOf<WorkbookSnapshotV83>().toExtend<WorkbookSnapshot>();
    for (const rectangleSeries of [boundChart().rectangleSeries, { rows: [], columns: [] }]) {
      const input = { ...drawing(), chart: { ...boundChart(), rectangleSeries } };
      const workbook = deserializeWorkbook(raw(input, 83)),
        saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(83);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const standalone = serializeSheet(getActiveSheet(workbook));
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      expect((saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.rectangleSeries).not.toBe(
        rectangleSeries,
      );
      const older = createSheet("Older", "older");
      older.drawings = [sourceDrawing("older")];
      workbook.sheets.set(older.id, older);
      expect(serializeWorkbook(workbook).version).toBe(83);
    }
    expect(serializeWorkbook(deserializeWorkbook(raw(elementDrawing(), 82))).version).toBe(43);
  });

  test.each([43, 78, 79, 80, 81, 82])(
    "version%s gates presence before payload getters, malformed data or earlier features",
    (version) => {
      let calls = 0;
      for (const value of [undefined, null, {}, boundChart().rectangleSeries]) {
        const chart = Object.defineProperty(
          { ...elementChart(), rectangleSeries: value },
          "presentation",
          {
            get() {
              calls++;
              return {};
            },
          },
        );
        expect(() => deserializeWorkbook(raw({ ...drawing(), chart }, version))).toThrow(
          /version 83/,
        );
      }
      const accessor = Object.defineProperty(elementChart(), "rectangleSeries", {
        get() {
          calls++;
          return {};
        },
      });
      expect(() => deserializeWorkbook(raw({ ...drawing(), chart: accessor }, version))).toThrow(
        /version 83/,
      );
      const inherited = Object.assign(
        Object.create({ rectangleSeries: boundChart().rectangleSeries }) as SheetChart,
        elementChart(),
      );
      expect(() => deserializeWorkbook(raw({ ...drawing(), chart: inherited }, version))).toThrow(
        /version 83/,
      );
      expect(calls).toBe(0);
    },
  );

  test("wrong drawing owners, undefined/accessor metadata and chart sources cannot be laundered through83", () => {
    for (const input of [
      { ...drawing(), kind: "textBox" },
      { ...drawing(), chart: { ...elementChart(), rectangleSeries: undefined } },
      {
        ...sourceDrawing(),
        chart: { ...sourceDrawing().chart, rectangleSeries: boundChart().rectangleSeries },
      },
    ])
      expect(() => deserializeWorkbook(raw(input, 83))).toThrow();
  });

  test("first effective series format uses one isolated command with exact Undo/Redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [elementDrawing()];
    const before = serializeWorkbook(session.workbook);
    const ensured = ensureChartRangeSeriesIdentity(elementDrawing().chart, {
      seriesBy: "columns",
      index: 1,
    });
    ensured.chart.format = { series: [{ id: ensured.id, color: "#123456" }] };
    const input = { ...elementDrawing(), chart: ensured.chart },
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.rectangleSeries!.columns[0]!.id = "caller";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(83);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("protected direct edits and forged external rectangle metadata have zero workbook/history effects", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    const before = serializeWorkbook(f.session.workbook),
      history = structuredClone(f.session.history);
    const changed = drawing();
    changed.chart.rectangleSeries!.columns[1]!.id = "forged";
    expect(() =>
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [changed])),
    ).toThrow(/protect|locked/i);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history).toEqual(history);
    const owner = createSheet("Owner", "owner");
    owner.drawings = [drawing()];
    owner.properties.protected = true;
    owner.protection = { editableRanges: [] };
    f.session.workbook.sheets.set(owner.id, owner);
    const externalBefore = serializeWorkbook(f.session.workbook);
    expect(() =>
      prepareExternalDrawingCollections(f.session.workbook, f.sheet.id, [
        { sheetId: owner.id, drawings: [changed] },
      ]),
    ).toThrow(/maintenance/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(externalBefore);
    expect(f.session.history).toEqual(history);
  });
});
