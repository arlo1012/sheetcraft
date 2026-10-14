import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  createWorkbookEvaluator,
} from "@sheetcraft/core/workbook";
import {
  parseChartSourceCategories,
  parseChartSourceName,
  parseChartSourceValues,
  formatChartSourceName,
  formatChartSourceValues,
  allocateChartSourceSeriesId,
  createChartSourceCandidate,
  planChartSourceVisibility,
  readChartSourceVisibilityProof,
  readChartSourcePreview,
} from "../../../modules/charts/chart-source-editor";
import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
function fixture() {
  const workbook = createWorkbook({ id: "parse", sheetId: "first", sheetName: "Sheet1" });
  const sheet = getActiveSheet(workbook);
  const second = createSheet("Quarter's data", "second");
  insertSheet(workbook, second);
  return { workbook, sheet, second };
}
describe("bounded chart source input", () => {
  test("literal names and quoted cross-sheet cells round-trip without changing text", () => {
    const f = fixture();
    expect(parseChartSourceName(f.workbook, " 苹果 ", f.sheet.id)).toEqual({
      kind: "literal",
      text: " 苹果 ",
    });
    const name = parseChartSourceName(f.workbook, "='quarter''s data'!b1", f.sheet.id)!;
    expect(name).toEqual({ kind: "cell", sheetId: f.second.id, cell: { row: 0, column: 1 } });
    expect(formatChartSourceName(f.workbook, name)).toBe("='Quarter''s data'!$B$1");
  });
  test("finite literal vectors and within-workbook row/column references normalize", () => {
    const f = fixture();
    const values = parseChartSourceValues(f.workbook, "={10, -2.5, 3e2}", f.sheet.id)!;
    expect(values).toEqual({ kind: "literal", values: [10, -2.5, 300] });
    expect(formatChartSourceValues(f.workbook, values)).toBe("={10,-2.5,300}");
    expect(
      parseChartSourceCategories(f.workbook, "='Quarter''s data'!A2:A4", f.sheet.id),
    ).toMatchObject({ kind: "range", sheetId: f.second.id });
  });
  test.each([
    "={}",
    "={1,}",
    "={NaN,2}",
    "={1e309}",
    "={1;2}",
    "={1,+Sheet1!A1}",
    "=Sheet1!A1:B2",
    "=Missing!A1:A3",
    "=[Book]Sheet1!A1:A3",
    "=SUM(A1:A3)",
    "=A1:A10001",
  ])("rejects unsafe or unbounded values input %s", (text) => {
    const f = fixture();
    expect(parseChartSourceValues(f.workbook, text, f.sheet.id)).toBeUndefined();
  });
  test("a name reference must select exactly one cell and categories must remain a reference", () => {
    const f = fixture();
    expect(parseChartSourceName(f.workbook, "=A1:A2", f.sheet.id)).toBeUndefined();
    expect(parseChartSourceCategories(f.workbook, "={1,2,3}", f.sheet.id)).toBeUndefined();
    expect(parseChartSourceCategories(f.workbook, "=A1:B2", f.sheet.id)).toBeUndefined();
  });
});

describe("range source identity drafts", () => {
  test("promotion removes rectangle metadata while retaining live IDs and every format", () => {
    const chart: SheetChart = {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title: "Identity source",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      rectangleSeries: {
        rows: [{ index: 2, id: "inactive-row" }],
        columns: [{ index: 1, id: "bound" }],
      },
      format: {
        series: [
          { id: "bound", color: "#ff0000" },
          { id: "series-1", color: "#00ff00" },
        ],
      },
    };
    const before = structuredClone(chart);
    const source = createChartSourceFromRange("first", chart);
    expect(source.series.map((entry) => entry.id)).toEqual(["bound", "series-2"]);
    const promoted = createChartSourceCandidate(chart, source);
    expect(promoted.rectangleSeries).toBeUndefined();
    expect(promoted.range).toBeNull();
    expect(promoted.source?.series).toEqual(source.series);
    expect(promoted.format).toEqual(chart.format);
    expect(() => normalizeSheetChart(promoted)).not.toThrow();
    expect(chart).toEqual(before);
  });

  test("Add cannot reuse a removed formatted ID or any current source ID", () => {
    const chart = normalizeSheetChart({
      type: "column",
      range: null,
      title: "Add draft",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "series-2",
            colorIndex: 1,
            name: { kind: "literal", text: "survivor" },
            values: { kind: "literal", values: [1] },
          },
        ],
      },
      format: {
        series: [
          { id: "series-1", color: "#ff0000" },
          { id: "series-3", strokeWidth: 4 },
        ],
      },
    });
    expect(allocateChartSourceSeriesId(chart, chart.source!)).toBe("series-4");
    expect(chart.source!.series).toHaveLength(1);
    expect(chart.format?.series).toHaveLength(2);
  });
});

describe("source-owned visibility planning", () => {
  function chart(): SheetChart {
    return {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title: "Keep",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    };
  }
  test("net-zero changes allocate nothing and inactive/header intents retain their exact physical owner", () => {
    const base = chart(),
      before = structuredClone(base);
    expect(planChartSourceVisibility(base, [])).toEqual(base);
    expect(
      planChartSourceVisibility(base, [
        { rangeBand: { seriesBy: "columns", index: 1 }, visible: true },
      ]),
    ).toEqual(base);
    const planned = planChartSourceVisibility({ ...base, seriesBy: "rows" }, [
      { rangeBand: { seriesBy: "columns", index: 1 }, visible: false },
      { rangeBand: { seriesBy: "rows", index: 0 }, visible: false },
    ]);
    expect(planned.seriesBy).toBe("rows");
    expect(planned.headerRow).toBe(true);
    expect(planned.rectangleSeries).toEqual({
      columns: [{ index: 1, id: "range-series-1" }],
      rows: [{ index: 0, id: "range-series-2" }],
    });
    expect(planned.seriesFilter?.hiddenSeriesIds).toEqual(["range-series-1", "range-series-2"]);
    expect(base).toEqual(before);
  });
  test("proofs reject accessors, unknown fields, duplicate targets and aggregate over-budget changes", () => {
    let calls = 0;
    const proof = {
      base: chart(),
      get changes() {
        calls++;
        return [];
      },
    };
    expect(() => readChartSourceVisibilityProof(proof)).toThrow(/accessor/);
    expect(calls).toBe(0);
    expect(() =>
      readChartSourceVisibilityProof({ base: chart(), changes: [], rogue: true }),
    ).toThrow();
    expect(() =>
      planChartSourceVisibility(chart(), [
        { rangeBand: { seriesBy: "columns", index: 1 }, visible: false },
        { rangeBand: { seriesBy: "columns", index: 1 }, visible: true },
      ]),
    ).toThrow(/distinct/);
    expect(() =>
      planChartSourceVisibility(
        chart(),
        Array.from({ length: 513 }, (_, index) => ({
          rangeBand: { seriesBy: "columns" as const, index },
          visible: false,
        })),
      ),
    ).toThrow(/512/);
  });
  test("Add reserves dormant filter IDs and hidden invalid source definitions remain invalid", () => {
    const f = fixture(),
      base = chart();
    const source = createChartSourceFromRange(f.sheet.id, base);
    const candidate = createChartSourceCandidate(base, source);
    candidate.seriesFilter = { hiddenSeriesIds: ["series-1", "series-3", "series-4"] };
    expect(allocateChartSourceSeriesId(candidate, source)).toBe("series-5");
    candidate.source.series[0]!.values = { kind: "range", sheetId: "missing", range: null };
    const preview = readChartSourcePreview(
      f.sheet,
      candidate,
      createWorkbookEvaluator(f.workbook, f.sheet.id),
      f.workbook,
    );
    expect(preview.invalid).toBe(true);
    expect(preview.sourceData.diagnostics).toContainEqual({
      code: "broken-reference",
      role: "values",
      seriesId: "series-1",
    });
  });
});
