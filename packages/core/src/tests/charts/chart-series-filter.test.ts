import { describe, expect, test } from "vitest";
import {
  normalizeChartSeriesFilter,
  planChartSeriesVisibility,
  type ChartSeriesVisibilityChange,
} from "../../chart-series-filter.js";
import {
  ensureChartRangeSeriesIdentity,
  mapChartRangeSeries,
  reconcileChartRangeSeriesForRange,
} from "../../chart-range-series.js";
import { createChartSourceFromRange } from "../../chart-source.js";
import {
  getSheetChartData,
  getSheetChartSourceData,
  normalizeSheetChart,
  type SheetChart,
} from "../../sheet-charts.js";
import { normalizeSheetDrawing, type SheetChartDrawing } from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
} from "../../commands/structure.js";
import { createMoveCellRangeCommand } from "../../commands/values.js";
import { createDuplicateSheetCommand, createDeleteSheetCommand } from "../../commands/sheets.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellValue,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

const supported = ["column", "bar", "line", "area", "radar"] as const;
const band = (index: number, visible: boolean): ChartSeriesVisibilityChange => ({
  rangeBand: { seriesBy: "columns", index },
  visible,
});
function fixture(explicit = false) {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  [
    ["Region", "apple", "pear"],
    ["East", 10, 20],
    ["North", 30, 40],
    ["South", 50, 60],
  ].forEach((row, r) =>
    row.forEach((value, c) => setCellValue(sheet, { row: r, column: c }, value)),
  );
  const drawing = explicit ? sourceDrawing(sheet.id) : elementDrawing();
  sheet.drawings = [normalizeSheetDrawing(drawing)];
  const current = () => sheet.drawings![0]! as SheetChartDrawing;
  const source = (chart = current().chart) =>
    getSheetChartSourceData(sheet, chart, createSheetEvaluator(sheet));
  const read = (chart = current().chart) =>
    getSheetChartData(sheet, chart, createSheetEvaluator(sheet));
  return { session, sheet, current, source, read };
}

describe("strict source-owned series filter and pure atomic planner", () => {
  test("callable owners cannot silently discard filter state or invoke legacy getters", () => {
    let reads = 0;
    const owner = Object.assign(() => undefined, elementChart(), {
      seriesFilter: { hiddenSeriesIds: ["retired"] },
    });
    Object.defineProperty(owner, "type", {
      get() {
        reads++;
        return "column";
      },
    });
    expect(() => normalizeSheetChart(owner)).toThrow(/ordinary source owner/);
    expect(reads).toBe(0);
  });

  test("preserves and detaches explicit empty or dormant selections", () => {
    for (const hiddenSeriesIds of [[], ["retired", "header", "inactive"]]) {
      const input = { ...elementChart(), seriesFilter: { hiddenSeriesIds } },
        output = normalizeSheetChart(input);
      expect(output).toEqual(input);
      expect(output.seriesFilter).not.toBe(input.seriesFilter);
      expect(output.seriesFilter!.hiddenSeriesIds).not.toBe(hiddenSeriesIds);
    }
    expect(
      planChartSeriesVisibility({ ...elementChart(), seriesFilter: { hiddenSeriesIds: [] } }, [
        band(1, true),
      ]),
    ).not.toHaveProperty("seriesFilter");
  });

  test("rejects malformed plain records, dense arrays, IDs and accessors without getter effects", () => {
    let calls = 0;
    const sparse: unknown[] = [];
    sparse.length = 1;
    const getterArray = Object.defineProperty(["x"], "0", {
      get() {
        calls++;
        return "x";
      },
    });
    const invalid: unknown[] = [
      undefined,
      null,
      {},
      Object.create({ hiddenSeriesIds: [] }),
      { hiddenSeriesIds: undefined },
      { hiddenSeriesIds: [""] },
      { hiddenSeriesIds: [" "] },
      { hiddenSeriesIds: ["x".repeat(129)] },
      { hiddenSeriesIds: ["x", "x"] },
      { hiddenSeriesIds: [1] },
      { hiddenSeriesIds: sparse },
      { hiddenSeriesIds: getterArray },
      { hiddenSeriesIds: Object.assign([], { extra: true }) },
      { hiddenSeriesIds: [], extra: true },
      Object.defineProperty({}, "hiddenSeriesIds", {
        get() {
          calls++;
          return [];
        },
      }),
    ];
    for (const value of invalid) expect(() => normalizeChartSeriesFilter(value)).toThrow();
    const ownerGetter = Object.defineProperty(
      { ...elementChart(), seriesFilter: { hiddenSeriesIds: [] } },
      "title",
      {
        get() {
          calls++;
          return "Sales";
        },
      },
    );
    const rangeGetter = {
      ...elementChart(),
      seriesFilter: { hiddenSeriesIds: [] },
      range: {
        start: Object.defineProperty({ row: 0, column: 0 }, "row", {
          get() {
            calls++;
            return 0;
          },
        }),
        end: { row: 3, column: 2 },
      },
    };
    for (const chart of [ownerGetter, rangeGetter]) {
      expect(() => normalizeSheetChart(chart)).toThrow(/own data|accessors/);
      const f = fixture();
      expect(() => f.read(chart)).toThrow(/own data|accessors/);
    }
    for (const key of ["pivotTableId", "dataCache"]) {
      const chart = Object.defineProperty(
        { ...elementChart(), seriesFilter: { hiddenSeriesIds: [] } },
        key,
        {
          get() {
            calls++;
            return undefined;
          },
        },
      );
      expect(() => normalizeSheetChart(chart)).toThrow(/ordinary source/);
      expect(() => planChartSeriesVisibility(chart, [])).toThrow(/ordinary source/);
    }
    expect(calls).toBe(0);
  });

  test("showing unbound and already-visible series allocates nothing; hide identity/filter share one detached candidate", () => {
    const input = elementChart();
    expect(planChartSeriesVisibility(input, [band(1, true), band(2, true)])).toEqual(input);
    const candidate = planChartSeriesVisibility(input, [band(1, false)]);
    expect(candidate.source).toBeUndefined();
    expect(candidate.range).toEqual(input.range);
    expect(candidate.rectangleSeries).toEqual({
      rows: [],
      columns: [{ index: 1, id: "range-series-1" }],
    });
    expect(candidate.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(input).not.toHaveProperty("rectangleSeries");
    expect(input).not.toHaveProperty("seriesFilter");
    expect(planChartSeriesVisibility(candidate, [band(1, false)])).toEqual(candidate);
    const shown = planChartSeriesVisibility(candidate, [band(1, true)]);
    expect(shown).not.toHaveProperty("seriesFilter");
    expect(shown.rectangleSeries).toEqual(candidate.rectangleSeries);
  });

  test("rejects every invalid or conflicting target before allocation and never mutates the input", () => {
    const input = elementChart(),
      before = structuredClone(input);
    let calls = 0;
    const sparse: unknown[] = [];
    sparse.length = 1;
    const invalid: unknown[] = [
      [band(1, false), band(1, true)],
      [band(1, false), band(1, false)],
      [band(1, false), band(0, false)],
      [band(1, false), band(3, false)],
      [{ rangeBand: { seriesBy: "rows", index: 1 }, visible: false }],
      [{ seriesId: "range-series-1", visible: false }],
      [{ rangeBand: { seriesBy: "columns", index: 1.5 }, visible: false }],
      [{ ...band(1, false), seriesId: "both" }],
      [{ ...band(1, false), extra: true }],
      [{ ...band(1, false), visible: 1 }],
      sparse,
      [
        Object.defineProperty({ rangeBand: { seriesBy: "columns", index: 1 } }, "visible", {
          get() {
            calls++;
            return false;
          },
        }),
      ],
    ];
    for (const changes of invalid)
      expect(() =>
        planChartSeriesVisibility(input, changes as readonly ChartSeriesVisibilityChange[]),
      ).toThrow();
    const owner = Object.defineProperty(elementChart(), "type", {
      get() {
        calls++;
        return "column";
      },
    });
    expect(() => planChartSeriesVisibility(owner, [band(1, false)])).toThrow(/own data/);
    expect(input).toEqual(before);
    expect(calls).toBe(0);
  });

  test("bounded allocation excludes every dormant filter/style/binding ID; live bound hidden IDs are reused", () => {
    const input: SheetChart = {
      ...elementChart(),
      rectangleSeries: { rows: [{ index: 1, id: "range-series-1" }], columns: [] },
      format: { series: [{ id: "range-series-2", color: "#fff" }] },
      seriesFilter: { hiddenSeriesIds: ["range-series-3", "series-1"] },
    };
    expect(ensureChartRangeSeriesIdentity(input, { seriesBy: "columns", index: 1 }).id).toBe(
      "range-series-4",
    );
    const hidden = planChartSeriesVisibility(input, [band(1, false)]);
    expect(hidden.seriesFilter!.hiddenSeriesIds).toEqual([
      "range-series-3",
      "series-1",
      "range-series-4",
    ]);
    expect(createChartSourceFromRange("source", hidden).series.map((entry) => entry.id)).toEqual([
      "range-series-4",
      "series-2",
    ]);
    expect(planChartSeriesVisibility(hidden, [band(1, false)]).rectangleSeries).toEqual(
      hidden.rectangleSeries,
    );
  });

  test("full512 filter may replace one selection atomically, but overflow and identity exhaustion reject whole candidates", () => {
    const input = {
      ...elementChart(),
      seriesFilter: {
        hiddenSeriesIds: Array.from({ length: 512 }, (_, index) => `retired-${index}`),
      },
    };
    expect(() => planChartSeriesVisibility(input, [band(1, false)])).toThrow(/budget/);
    expect(input).not.toHaveProperty("rectangleSeries");
    const explicit = sourceDrawing().chart;
    explicit.seriesFilter = {
      hiddenSeriesIds: ["apple", ...Array.from({ length: 511 }, (_, index) => `retired-${index}`)],
    };
    const replaced = planChartSeriesVisibility(explicit, [
      { seriesId: "apple", visible: true },
      { seriesId: "pear", visible: false },
    ]);
    expect(replaced.seriesFilter!.hiddenSeriesIds).toHaveLength(512);
    expect(replaced.seriesFilter!.hiddenSeriesIds).not.toContain("apple");
    expect(replaced.seriesFilter!.hiddenSeriesIds).toContain("pear");
    const exhausted: SheetChart = {
      ...elementChart(),
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 257 } },
      rectangleSeries: {
        rows: [],
        columns: Array.from({ length: 256 }, (_, index) => ({ index, id: `bound-${index}` })),
      },
    };
    expect(() => planChartSeriesVisibility(exhausted, [band(256, false)])).toThrow(
      /identity budget/,
    );
    expect(exhausted).not.toHaveProperty("seriesFilter");
  });
});

describe("validated raw derivation and active series-only projection", () => {
  test.each(supported)(
    "%s range hide/show/all-hidden keeps categories, source, values and prefilter colors",
    (type) => {
      const f = fixture(),
        input = { ...f.current().chart, type },
        raw = f.source(input);
      expect(f.read(input)).toEqual(raw);
      const hidden = planChartSeriesVisibility(input, [band(1, false)]),
        visible = f.read(hidden);
      expect(f.source(hidden)).toEqual(
        f.source({ ...hidden, seriesFilter: { hiddenSeriesIds: [] } }),
      );
      expect(visible.categories).toEqual(raw.categories);
      expect(visible.records).toEqual(raw.records);
      expect(visible.series).toHaveLength(1);
      expect(visible.series[0]).toMatchObject({
        name: "pear",
        values: [20, 40, 60],
        colorIndex: 1,
      });
      expect(hidden.title).toBe(input.title);
      expect(hidden.range).toEqual(input.range);
      const all = planChartSeriesVisibility(hidden, [band(2, false)]);
      expect(f.read(all)).toMatchObject({
        categories: raw.categories,
        series: [],
        records: raw.records,
      });
      const shown = planChartSeriesVisibility(all, [band(1, true), band(2, true)]);
      expect(shown).not.toHaveProperty("seriesFilter");
      expect(f.read(shown).series.map(({ name, values }) => ({ name, values }))).toEqual(
        raw.series.map(({ name, values }) => ({ name, values })),
      );
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(supported)(
    "%s explicit hide/show/all-hidden retains all definitions and stable palette and projects only recordcolumns",
    (type) => {
      const f = fixture(true),
        input = { ...f.current().chart, type },
        raw = f.source(input);
      const hidden = planChartSeriesVisibility(input, [{ seriesId: "apple", visible: false }]);
      expect(hidden.source).toEqual(input.source);
      expect(f.source(hidden)).toEqual(raw);
      expect(f.read(hidden).series[0]).toMatchObject({
        id: "pear",
        colorIndex: 8,
        name: "pear",
        values: [20, 40, 60],
      });
      expect(f.read(hidden).records).toEqual([
        ["East", 20],
        ["North", 40],
        ["South", 60],
      ]);
      const all = planChartSeriesVisibility(hidden, [{ seriesId: "pear", visible: false }]);
      expect(f.read(all)).toMatchObject({
        categories: raw.categories,
        series: [],
        records: [["East"], ["North"], ["South"]],
      });
      const shown = planChartSeriesVisibility(all, [
        { seriesId: "apple", visible: true },
        { seriesId: "pear", visible: true },
      ]);
      expect(f.read(shown)).toEqual(raw);
      expect(shown).not.toHaveProperty("seriesFilter");
    },
  );

  test("inactive direction/header/orphan selections have no effect and reactivate with their original physical IDs", () => {
    const f = fixture();
    const input: SheetChart = {
      ...elementChart(),
      rectangleSeries: {
        rows: [{ index: 1, id: "row-one" }],
        columns: [
          { index: 0, id: "header" },
          { index: 1, id: "column-one" },
        ],
      },
      seriesFilter: { hiddenSeriesIds: ["row-one", "header", "orphan"] },
    };
    expect(f.read(input)).toEqual(f.source(input));
    const switched = { ...input, seriesBy: "rows" as const };
    expect(f.read(switched).series.map((entry) => entry.name)).toEqual(["North", "South"]);
    expect(f.read({ ...input, headerColumn: false }).series.map((entry) => entry.name)).toEqual([
      "apple",
      "pear",
    ]);
    const hidden = planChartSeriesVisibility(input, [band(1, false)]);
    expect(f.read(hidden).series[0]!.name).toBe("pear");
    expect(f.read({ ...hidden, seriesBy: "rows" }).series.map((entry) => entry.name)).toEqual([
      "North",
      "South",
    ]);
    expect(f.read({ ...hidden, type: "pie" })).toEqual(f.source({ ...hidden, type: "pie" }));
    expect(f.read(hidden).series[0]!.name).toBe("pear");
    const { rectangleSeries: _bindings, ...broken } = hidden;
    expect(normalizeSheetChart({ ...broken, range: null })).toBeDefined();
  });

  test("checkbox masks compose with worksheet-hidden stripes without changing category or series palette masks", () => {
    const f = fixture(),
      input = planChartSeriesVisibility(elementChart(), [band(2, false)]);
    f.sheet.hiddenRows = new Set([2]);
    f.sheet.hiddenColumns = new Set([1]);
    expect(f.read(input)).toMatchObject({ categories: ["East", "South"], series: [] });
    const shown = { ...input, showHidden: true };
    expect(f.read(shown).series[0]).toMatchObject({
      name: "apple",
      values: [10, 30, 50],
      colorIndex: 0,
    });
    expect(f.read(shown).categories).toEqual(["East", "North", "South"]);
  });

  test("hidden broken references, wrong lengths and malformed/overbudget full sources remain invalid", () => {
    const f = fixture(true),
      hidden = planChartSeriesVisibility(f.current().chart, [{ seriesId: "pear", visible: false }]);
    hidden.source!.series[1]!.values = { kind: "range", sheetId: f.sheet.id, range: null };
    expect(f.read(hidden)).toMatchObject({
      categories: [],
      series: [],
      diagnostics: [{ code: "broken-reference", role: "values", seriesId: "pear" }],
    });
    hidden.source!.series[1]!.values = { kind: "literal", values: [1] };
    expect(f.read(hidden)).toMatchObject({
      categories: [],
      series: [],
      diagnostics: [{ code: "length-mismatch", role: "values", seriesId: "pear" }],
    });
    hidden.source!.series[1]!.values = { kind: "literal", values: [Number.NaN] };
    expect(() => f.read(hidden)).toThrow(/finite/);
    hidden.source!.series[1]!.values = {
      kind: "literal",
      values: Array.from({ length: 10000 }, () => 1),
    };
    expect(() => f.read(hidden)).toThrow(/10,000/);
  });

  test("all hidden masks retain source diagnostics and reads/recomputation create no chart or history mutations", () => {
    const f = fixture(true),
      hidden = planChartSeriesVisibility(f.current().chart, [
        { seriesId: "apple", visible: false },
        { seriesId: "pear", visible: false },
      ]);
    setCellValue(f.sheet, { row: 1, column: 2 }, "bad");
    const before = structuredClone(hidden),
      data = f.read(hidden);
    expect(data.series).toEqual([]);
    expect(data.categories).toEqual(["East", "North", "South"]);
    expect(data.diagnostics).toContainEqual({
      code: "text",
      role: "values",
      seriesId: "pear",
      index: 0,
    });
    expect(hidden).toEqual(before);
    setCellValue(f.sheet, { row: 1, column: 2 }, 99);
    expect(f.source(hidden).series[1]!.values[0]).toBe(99);
    expect(f.read(hidden).diagnostics).toBeUndefined();
    expect(hidden).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("promotion preserves active filter identity/colors, while retired IDs never activate new promoted definitions", () => {
    const f = fixture(),
      hidden = planChartSeriesVisibility(elementChart(), [band(1, false)]);
    hidden.seriesFilter!.hiddenSeriesIds.push("series-1", "retired");
    const { rectangleSeries: _bindings, ...rest } = hidden;
    const promoted = {
      ...rest,
      range: null,
      source: createChartSourceFromRange(f.sheet.id, hidden, f.sheet),
    };
    expect(promoted.source.series.map((entry) => entry.id)).toEqual(["range-series-1", "series-2"]);
    expect(f.read(promoted).series[0]).toMatchObject({
      id: "series-2",
      colorIndex: 1,
      name: "pear",
    });
    expect(f.read(hidden).series[0]).toMatchObject({ colorIndex: 1, name: "pear" });
    expect(promoted.seriesFilter).toEqual(hidden.seriesFilter);
  });

  test("editing/reordering hidden source entries retains selection, deletion retires it, and fresh added entry starts visible", () => {
    const f = fixture(true),
      hidden = planChartSeriesVisibility(f.current().chart, [{ seriesId: "pear", visible: false }]);
    hidden.source!.series[1]!.name = { kind: "literal", text: "Edited pear" };
    hidden.source!.series.reverse();
    expect(f.source(hidden).series[0]).toMatchObject({ id: "pear", name: "Edited pear" });
    expect(f.read(hidden).series.map((entry) => entry.id)).toEqual(["apple"]);
    hidden.source!.series.splice(0, 1);
    hidden.source!.series.push({
      id: "fresh",
      colorIndex: 9,
      name: { kind: "literal", text: "New" },
      values: { kind: "literal", values: [1, 2, 3] },
    });
    expect(f.read(hidden).series.map((entry) => entry.id)).toEqual(["apple", "fresh"]);
    expect(hidden.seriesFilter!.hiddenSeriesIds).toEqual(["pear"]);
  });
});

describe("structural mapping, detached commands and single-command history", () => {
  test("whole-band mapping follows hidden ID; deleted, split, colliding and nonoverlapping bands retire without filterloss", () => {
    const hidden = planChartSeriesVisibility(elementChart(), [band(1, false)]);
    const movedRange = { start: { row: 4, column: 4 }, end: { row: 7, column: 6 } };
    const moved = mapChartRangeSeries(hidden, movedRange, (range) => ({
      start: { row: range.start.row + 4, column: range.start.column + 4 },
      end: { row: range.end.row + 4, column: range.end.column + 4 },
    }));
    expect(moved.rectangleSeries!.columns).toEqual([{ index: 5, id: "range-series-1" }]);
    expect(moved.seriesFilter).toEqual(hidden.seriesFilter);
    for (const mapped of [
      mapChartRangeSeries(hidden, hidden.range, () => null),
      mapChartRangeSeries(hidden, hidden.range, (range) => ({
        ...range,
        end: { ...range.end, row: range.end.row - 1 },
      })),
      reconcileChartRangeSeriesForRange(hidden, movedRange),
      mapChartRangeSeries(hidden, null, () => null),
    ]) {
      expect(mapped.rectangleSeries?.columns ?? []).toEqual([]);
      expect(mapped.seriesFilter).toEqual(hidden.seriesFilter);
    }
    const two = planChartSeriesVisibility(elementChart(), [band(1, false), band(2, false)]);
    const collision = mapChartRangeSeries(two, two.range, (range) => ({
      start: { ...range.start, column: 1 },
      end: { ...range.end, column: 1 },
    }));
    expect(collision.rectangleSeries!.columns).toEqual([]);
    expect(collision.seriesFilter).toEqual(two.seriesFilter);
  });

  test("first hide commits identity and filter together with isolated payload and exact one-step Undo/Redo", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    const candidate = {
      ...f.current(),
      chart: planChartSeriesVisibility(f.current().chart, [band(1, false)]),
    };
    const command = createSetSheetDrawingsCommand(f.sheet.id, [candidate]);
    candidate.chart.seriesFilter!.hiddenSeriesIds.push("caller-only");
    expect(executeWorkbookCommand(f.session, command)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.current().chart.seriesFilter!.hiddenSeriesIds).toEqual(["range-series-1"]);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(84);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    const noOp = {
      ...f.current(),
      chart: planChartSeriesVisibility(f.current().chart, [band(1, false)]),
    };
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [noOp])),
    ).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each(["insert", "delete", "move", "cut"] as const)(
    "%s preserves or retires the same hidden ID with exact structural Undo/Redo",
    (operation) => {
      const f = fixture();
      f.current().chart = planChartSeriesVisibility(f.current().chart, [band(1, false)]);
      f.current().anchor = { row: 10, column: 10 };
      const before = serializeWorkbook(f.session.workbook);
      const command =
        operation === "insert"
          ? createInsertSheetAxisCommand(f.sheet.id, "column", 1)
          : operation === "delete"
            ? createDeleteSheetAxisCommand(f.sheet.id, "column", 1)
            : operation === "move"
              ? createMoveSheetAxisCommand(f.sheet.id, "column", 0, 3, 5)
              : createMoveCellRangeCommand(f.sheet.id, elementChart().range!, {
                  row: 5,
                  column: 5,
                });
      expect(executeWorkbookCommand(f.session, command)).toBe(true);
      expect(f.current().chart.seriesFilter!.hiddenSeriesIds).toEqual(["range-series-1"]);
      expect(f.current().chart.rectangleSeries!.columns).toEqual(
        operation === "delete" || operation === "cut"
          ? []
          : [{ index: operation === "insert" ? 2 : 6, id: "range-series-1" }],
      );
      const after = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    },
  );

  test("an exact full-band in-range cut follows hidden ID without promoting or moving the legacy rectangle", () => {
    const f = fixture();
    f.current().chart = planChartSeriesVisibility(f.current().chart, [band(1, false)]);
    const before = serializeWorkbook(f.session.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createMoveCellRangeCommand(
          f.sheet.id,
          { start: { row: 0, column: 1 }, end: { row: 3, column: 1 } },
          { row: 0, column: 2 },
        ),
      ),
    ).toBe(true);
    expect(f.current().chart.range).toEqual(elementChart().range);
    expect(f.current().chart.rectangleSeries!.columns).toEqual([
      { index: 2, id: "range-series-1" },
    ]);
    expect(f.current().chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(f.current().chart.source).toBeUndefined();
    expect(f.read().series).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("duplicate and crosssheet source deletion preserve detached filter state and deletion diagnostics", () => {
    const f = fixture(true),
      owner = createSheet("Owner", "owner");
    f.current().chart = planChartSeriesVisibility(f.current().chart, [
      { seriesId: "pear", visible: false },
    ]);
    owner.drawings = [normalizeSheetDrawing(f.current())];
    f.session.workbook.sheets.set(owner.id, owner);
    const duplicate = createDuplicateSheetCommand(f.session.workbook, f.sheet.id, {
      id: "copy",
      name: "Copy",
    });
    const copy = duplicate.sheet.drawings![0]! as SheetChartDrawing;
    expect(copy.chart.seriesFilter).toEqual(f.current().chart.seriesFilter);
    expect(copy.chart.seriesFilter).not.toBe(f.current().chart.seriesFilter);
    const before = serializeWorkbook(f.session.workbook);
    expect(
      executeWorkbookCommand(f.session, createDeleteSheetCommand(f.session.workbook, f.sheet.id)),
    ).toBe(true);
    const chart = (owner.drawings![0]! as SheetChartDrawing).chart;
    expect(chart.seriesFilter).toEqual({ hiddenSeriesIds: ["pear"] });
    expect(
      getSheetChartData(owner, chart, createWorkbookEvaluator(f.session.workbook, owner.id), (id) =>
        f.session.workbook.sheets.get(id),
      ),
    ).toMatchObject({
      categories: [],
      series: [],
      diagnostics: expect.arrayContaining([
        { code: "broken-reference", role: "values", seriesId: "pear" },
      ]),
    });
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("protected edits and malformed filter commands have zero workbook/history effects", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook),
      history = structuredClone(f.session.history);
    const malformed = {
      ...f.current(),
      chart: { ...f.current().chart, seriesFilter: { hiddenSeriesIds: ["same", "same"] } },
    };
    expect(() => createSetSheetDrawingsCommand(f.sheet.id, [malformed])).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history).toEqual(history);
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    const protectedBefore = serializeWorkbook(f.session.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetSheetDrawingsCommand(f.sheet.id, [
          { ...f.current(), chart: planChartSeriesVisibility(f.current().chart, [band(1, false)]) },
        ]),
      ),
    ).toThrow(/protect|locked/i);
    expect(serializeWorkbook(f.session.workbook)).toEqual(protectedBefore);
    expect(f.session.history).toEqual(history);
  });
});
