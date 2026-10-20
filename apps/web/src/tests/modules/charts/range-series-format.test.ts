import { describe, expect, test } from "vitest";
import {
  getSheetChartData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import { createSheetEvaluator, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { applyChartFormatIntent } from "../../../modules/charts/chart-format-intents";
import {
  chartFormatTargetKey,
  getChartFormatTargets,
  resolveChartFormatSeriesId,
  type ChartFormatTarget,
} from "../../../modules/charts/chart-format-pane";
import { getChartFormatClickTarget } from "../../../modules/charts/chart-format-selection";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";
import { applyChartDesignIntent } from "../../../modules/charts/chart-design-intents";

function fixture() {
  const workbook = createWorkbook({ id: "range-format", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  const values = [
    ["region", "same", "same"],
    ["east", 10, 100],
    ["west", 20, 200],
  ];
  values.forEach((row, r) =>
    row.forEach((value, c) =>
      sheet.cells.set(`${r}:${c}`, { content: { kind: "literal", value } }),
    ),
  );
  const chart: SheetChart = {
    type: "column",
    title: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
  };
  const read = (value: SheetChart) => getSheetChartData(sheet, value, createSheetEvaluator(sheet));
  const target = getChartFormatTargets(chart, read(chart)).find(
    (entry) => entry.kind === "series" && entry.rangeBand?.index === 2,
  );
  if (!target || target.kind !== "series") throw new Error("Missing captured range band");
  return { workbook, sheet, chart, read, target };
}

describe("ordinary range series formatting", () => {
  test("shape edits bind the physical range series without source promotion and preserve size through reset", () => {
    const f = fixture();
    const chart: SheetChart = { ...f.chart, type: "line" };
    const shaped = applyChartFormatIntent(chart, f.target, {
      kind: "series",
      seriesId: f.target.seriesId,
      format: { markerSymbol: "square", markerSizePt: 9, markers: true },
    });
    const id = resolveChartFormatSeriesId(shaped, f.target);
    expect(id).toBeTruthy();
    expect(id).not.toBe(f.target.seriesId);
    expect(shaped.rectangleSeries?.columns).toHaveLength(1);
    expect(shaped.source).toBeUndefined();
    expect(shaped.range).toEqual(chart.range);
    const option = createChartOption(shaped, f.read(shaped), { width: 480, height: 300 });
    expect(option).toMatchObject({
      series: [{ type: "line" }, { id, type: "line", symbol: "rect", symbolSize: 12 }],
    });
    const reset = applyChartFormatIntent(shaped, f.target, {
      kind: "series",
      seriesId: f.target.seriesId,
      format: { markerSizePt: 9, markers: true },
    });
    expect(resolveChartFormatSeriesId(reset, f.target)).toBe(id);
    expect(reset.format?.series).toEqual([{ id, markerSizePt: 9, markers: true }]);
    expect(chart.rectangleSeries).toBeUndefined();
    expect(chart.format).toBeUndefined();
  });
  test("reading targets creates no document identity and native series-index events resolve the physical band", () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook),
      data = f.read(f.chart);
    expect(data.series.every((entry) => entry.id === undefined)).toBe(true);
    expect(
      getChartFormatTargets(f.chart, data).filter((entry) => entry.kind === "series"),
    ).toHaveLength(2);
    expect(
      getChartFormatClickTarget(
        { componentType: "series", seriesIndex: 1, seriesId: "native-generated" },
        f.chart,
        data,
      ),
    ).toEqual(f.target);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.chart.rectangleSeries).toBeUndefined();
  });
  test("first format attaches one identity and real native bar color and secondary domain without source promotion", () => {
    const f = fixture();
    const next = applyChartFormatIntent(f.chart, f.target, {
      kind: "series",
      seriesId: f.target.seriesId,
      format: { color: "#f12345", axis: "secondary" },
    });
    expect(next.range).toEqual(f.chart.range);
    expect(next.source).toBeUndefined();
    expect(next.rectangleSeries?.columns).toHaveLength(1);
    expect(next.rectangleSeries?.rows).toEqual([]);
    const id = resolveChartFormatSeriesId(next, f.target);
    expect(id).toBeTruthy();
    expect(f.read(next).series[1]?.id).toBe(id);
    const target = getChartFormatTargets(next, f.read(next)).find(
      (entry) => chartFormatTargetKey(entry) === chartFormatTargetKey(f.target),
    );
    expect(target).toMatchObject({ seriesId: id, rangeBand: f.target.rangeBand });
    const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
    try {
      engine.setOption(createChartOption(next, f.read(next), { width: 480, height: 300 }));
      expect(engine.renderToSVGString()).toContain("#f12345");
      expect(engine.getOption()).toMatchObject({
        series: [{ type: "bar" }, { type: "bar", yAxisIndex: 1 }],
      });
    } finally {
      engine.dispose();
    }
    expect(f.chart.rectangleSeries).toBeUndefined();
  });
  test("reset and invalid formatting never allocate identities; direction or header drift rejects the old band", () => {
    const f = fixture();
    expect(
      applyChartFormatIntent(f.chart, f.target, {
        kind: "series",
        seriesId: f.target.seriesId,
        format: undefined,
      }),
    ).toEqual(f.chart);
    expect(() =>
      applyChartFormatIntent(f.chart, f.target, {
        kind: "series",
        seriesId: f.target.seriesId,
        format: { color: "not-a-color" },
      }),
    ).toThrow();
    expect(() =>
      applyChartFormatIntent({ ...f.chart, seriesBy: "rows" }, f.target, {
        kind: "series",
        seriesId: f.target.seriesId,
        format: { color: "#123456" },
      }),
    ).toThrow();
    const header: ChartFormatTarget = {
      kind: "series",
      seriesId: "unbound",
      rangeBand: { seriesBy: "columns", index: 0 },
    };
    expect(() =>
      applyChartFormatIntent(f.chart, header, {
        kind: "series",
        seriesId: "unbound",
        format: { color: "#123456" },
      }),
    ).toThrow();
    expect(f.chart.rectangleSeries).toBeUndefined();
  });
  test("switching row/column preserves dormant style and uses a different identity for the opposite orientation", () => {
    const f = fixture();
    const columns = applyChartFormatIntent(f.chart, f.target, {
      kind: "series",
      seriesId: f.target.seriesId,
      format: { color: "#123456" },
    });
    const rows = normalizeSheetChart({ ...columns, seriesBy: "rows" });
    const target = getChartFormatTargets(rows, f.read(rows)).find(
      (entry) => entry.kind === "series" && entry.rangeBand?.index === 2,
    );
    if (!target || target.kind !== "series") throw new Error("Missing row band");
    const styled = applyChartFormatIntent(rows, target, {
      kind: "series",
      seriesId: target.seriesId,
      format: { color: "#654321" },
    });
    expect(resolveChartFormatSeriesId(styled, target)).not.toBe(
      resolveChartFormatSeriesId(columns, f.target),
    );
    expect(styled.format?.series).toHaveLength(2);
    const back = normalizeSheetChart({ ...styled, seriesBy: "columns" });
    expect(f.read(back).series[1]?.id).toBe(resolveChartFormatSeriesId(columns, f.target));
    expect(back.range).toEqual(f.chart.range);
    expect(back.source).toBeUndefined();
    const refreshed = applyChartDesignIntent(back, { kind: "style", style: "dark" });
    expect(
      refreshed.format?.series?.find(
        (entry) => entry.id === resolveChartFormatSeriesId(back, f.target),
      )?.color,
    ).toBeUndefined();
    expect(
      refreshed.format?.series?.find(
        (entry) => entry.id === resolveChartFormatSeriesId(styled, target),
      )?.color,
    ).toBe("#654321");
  });
  test("temporary UI tokens never activate a dormant native style or secondary-axis target", () => {
    const f = fixture();
    const chart = {
      ...f.chart,
      format: { series: [{ id: f.target.seriesId, color: "#ff0011", axis: "secondary" as const }] },
    };
    const data = f.read(chart);
    expect(
      getChartFormatTargets(chart, data).some((entry) => entry.kind === "secondaryValueAxis"),
    ).toBe(false);
    expect(data.series[1]?.id).toBeUndefined();
    expect(createChartOption(chart, data)).not.toMatchObject({
      series: [{}, { itemStyle: { color: "#ff0011" } }],
    });
    const next = applyChartFormatIntent(chart, f.target, {
      kind: "series",
      seriesId: f.target.seriesId,
      format: { color: "#123456" },
    });
    expect(resolveChartFormatSeriesId(next, f.target)).not.toBe(f.target.seriesId);
  });
});
