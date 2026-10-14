import { describe, expect, test } from "vitest";
import {
  getSheetChartData,
  getSheetChartSourceData,
  type ChartType,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import { planChartSeriesVisibility } from "@sheetcraft/core/chart-series-filter";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { createChartOption } from "../../../modules/charts/chart-option";
import { getChartFormatTargets } from "../../../modules/charts/chart-format-pane";
import { preflightChartDataTable } from "../../../modules/charts/chart-data-table-preflight";
import { init } from "../../../modules/charts/chart-runtime";

function fixture(type: ChartType = "column", explicit = false) {
  const sheet = createSheet("Data", "data");
  const values = [
    ["Region", "Hidden", "Visible"],
    ["east", 10, 70],
    ["west", 20, 80],
  ];
  values.forEach((row, r) =>
    row.forEach((value, c) =>
      sheet.cells.set(`${r}:${c}`, { content: { kind: "literal", value } }),
    ),
  );
  const chart: SheetChart = {
    type,
    range: explicit ? null : { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
    title: "Stored title",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    ...(explicit
      ? {
          source: {
            kind: "series",
            categories: {
              kind: "range",
              sheetId: sheet.id,
              range: { start: { row: 1, column: 0 }, end: { row: 2, column: 0 } },
            },
            series: [
              {
                id: "hidden",
                colorIndex: 0,
                name: { kind: "literal", text: "Hidden" },
                values: { kind: "literal", values: [10, 20] },
              },
              {
                id: "visible",
                colorIndex: 1,
                name: { kind: "literal", text: "Visible" },
                values: { kind: "literal", values: [70, 80] },
              },
            ],
          },
        }
      : {}),
  };
  const evaluator = createSheetEvaluator(sheet);
  const read = (value: SheetChart) => getSheetChartData(sheet, value, evaluator);
  const raw = (value: SheetChart) => getSheetChartSourceData(sheet, value, evaluator);
  const change = (index: number, visible: boolean) =>
    explicit
      ? { seriesId: index === 1 ? "hidden" : "visible", visible }
      : { rangeBand: { seriesBy: "columns" as const, index }, visible };
  return { sheet, chart, read, raw, change };
}

for (const explicit of [false, true])
  describe(explicit ? "explicit source visibility" : "ordinary range visibility", () => {
    test.each(["column", "bar", "line", "area", "radar"] as const)(
      "%s real native model keeps palette and complete source",
      (type) => {
        const f = fixture(type, explicit),
          original = structuredClone(f.chart);
        const next = planChartSeriesVisibility(f.chart, [f.change(1, false)]),
          visible = f.read(next),
          raw = f.raw(next);
        expect(visible.series).toHaveLength(1);
        expect(visible.series[0]).toMatchObject({
          name: "Visible",
          colorIndex: 1,
          values: [70, 80],
        });
        expect(raw.series).toHaveLength(2);
        const engine = init(null, undefined, {
          renderer: "svg",
          ssr: true,
          width: 640,
          height: 400,
        });
        try {
          engine.setOption(createChartOption(next, visible, { width: 640, height: 400 }), {
            notMerge: true,
          });
          const output = engine.renderToSVGString();
          expect(output).toContain("Visible");
          expect(output).not.toContain(">Hidden<");
          expect(output).toContain("#16a34a");
          expect(output).not.toMatch(/NaN|Infinity/);
        } finally {
          engine.dispose();
        }
        expect(f.chart).toEqual(original);
        expect(next.range).toEqual(original.range);
        expect(next.source).toEqual(original.source);
      },
    );
    test.each(["column", "bar", "line", "area", "radar"] as const)(
      "%s all-hidden retains source and formats but clears actual native plot",
      (type) => {
        const f = fixture(type, explicit);
        const next = planChartSeriesVisibility(f.chart, [f.change(1, false), f.change(2, false)]);
        next.format = {
          valueAxis: { min: 0, max: 200, title: "Stored axis" },
          plot: { fill: "#f12345" },
        };
        const visible = f.read(next),
          raw = f.raw(next),
          option = createChartOption(next, visible);
        expect(visible.series).toEqual([]);
        expect(raw.series).toHaveLength(2);
        expect(option.series).toEqual([]);
        expect(option.xAxis).toBeUndefined();
        expect(option.yAxis).toBeUndefined();
        expect(option.radar).toBeUndefined();
        expect(option.title).toBeUndefined();
        const engine = init(null, undefined, {
          renderer: "svg",
          ssr: true,
          width: 640,
          height: 400,
        });
        try {
          engine.setOption(option, { notMerge: true });
          const output = engine.renderToSVGString();
          expect(output).not.toContain("Stored title");
          expect(output).not.toContain("Stored axis");
          expect(output).not.toContain(">Visible<");
        } finally {
          engine.dispose();
        }
        const targets = getChartFormatTargets(next, raw, visible);
        expect(targets.filter((target) => target.kind === "series")).toHaveLength(2);
        expect(targets.some((target) => target.kind === "valueAxis")).toBe(false);
        expect(
          f.read(planChartSeriesVisibility(next, [f.change(1, true), f.change(2, true)])).series,
        ).toHaveLength(2);
      },
    );
  });

test("data table admission counts full unfiltered definitions before detached native preparation", () => {
  const f = fixture("column", true);
  const source = f.chart.source!;
  source.series = Array.from({ length: 9 }, (_, index) => ({
    id: `s${index}`,
    colorIndex: index,
    name: { kind: "literal", text: `S${index}` },
    values: { kind: "literal", values: [index, index + 1] },
  }));
  const next = planChartSeriesVisibility(
    f.chart,
    source.series.slice(1).map((entry) => ({ seriesId: entry.id, visible: false })),
  );
  next.elements = { dataTable: "withLegendKeys" };
  expect(f.read(next).series).toHaveLength(1);
  expect(() =>
    preflightChartDataTable(next, f.read(next), { width: 900, height: 700 }, f.raw(next)),
  ).toThrow(/source budget/);
});
