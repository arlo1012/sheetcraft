import { afterEach, describe, expect, test } from "vitest";
import type { EChartsType } from "echarts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";
import { comboChart, comboData } from "./combo-fixture";

const engines: EChartsType[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});
function render(chart = comboChart(), data = comboData) {
  const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 400 });
  engines.push(engine);
  engine.setOption(createChartOption(chart, data, { width: 640, height: 400 }), { notMerge: true });
  engine.getZr().flush();
  expect(engine.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  return engine;
}
function point(engine: EChartsType, seriesId: string, value: number) {
  const point: unknown = engine.convertToPixel({ seriesId }, [0, value]);
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    typeof point[0] !== "number" ||
    typeof point[1] !== "number"
  )
    throw Error("Missing native category/value layout");
  return { x: point[0], y: point[1] };
}

describe("actual ECharts bounded column–line layout", () => {
  test("column/secondary line share native category center with independent real domains", () => {
    const chart = comboChart(),
      before = structuredClone(chart),
      engine = render(chart);
    const a = point(engine, "apple", 60),
      p = point(engine, "pear", 7);
    expect(a.x).toBeCloseTo(p.x, 8);
    expect(a.y).not.toBeCloseTo(p.y, 1);
    expect(engine.getOption()).toMatchObject({
      series: [
        { type: "bar", xAxisIndex: 0, yAxisIndex: 0 },
        {
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 1,
          showSymbol: false,
          smooth: false,
          lineStyle: { color: "#a1b2c3", width: 5 },
        },
      ],
      legend: [
        {
          data: [
            { name: "apple" },
            { name: "pear", icon: "line", itemStyle: { borderColor: "auto", borderWidth: 5 } },
          ],
        },
      ],
    });
    const svg = engine.renderToSVGString();
    expect(svg).toContain("#a1b2c3");
    expect(svg).toContain('stroke-width="5"');
    expect(chart).toEqual(before);
  });
  test("secondary columns use a matching physical category axis and stay centered", () => {
    const chart = comboChart();
    chart.format!.series![0]!.drawType = "column";
    const engine = render(chart);
    expect(engine.getOption()).toMatchObject({
      series: [
        { type: "bar", xAxisIndex: 0 },
        { type: "bar", xAxisIndex: 1 },
      ],
      xAxis: [{ type: "category" }, { type: "category", show: false }],
    });
    expect(point(engine, "apple", 60).x).toBeCloseTo(point(engine, "pear", 7).x, 8);
  });
  test("plain/marker preview is ephemeral and all hidden/empty content stays empty", () => {
    const chart = comboChart(),
      before = structuredClone(chart);
    const option = createChartOption(chart, comboData, { width: 640, height: 400 }, [
      { seriesId: "pear", drawType: "line", axis: "primary", markers: true },
    ]);
    expect(option).toMatchObject({
      series: [
        { type: "bar" },
        { type: "line", yAxisIndex: 0, symbol: "circle", showSymbol: true },
      ],
    });
    expect(chart).toEqual(before);
    expect(
      createChartOption(
        { ...chart, seriesFilter: { hiddenSeriesIds: ["apple", "pear"] } },
        { ...comboData, series: [] },
      ),
    ).toEqual({ animation: false, backgroundColor: "#ffffff", series: [] });
  });
  test("outside column labels reserve clearance in Combo but a line-only Combo does not", () => {
    const chart = {
      ...comboChart(),
      labels: true,
      legend: false,
      elements: { titlePosition: "none" as const, labelPosition: "outsideEnd" as const },
    };
    function top(changes?: Parameters<typeof createChartOption>[3]) {
      const grid = createChartOption(chart, comboData, { width: 640, height: 400 }, changes).grid;
      if (!grid || Array.isArray(grid) || typeof grid.top !== "number")
        throw Error("Missing numerical grid top");
      return grid.top;
    }
    expect(top()).toBeGreaterThan(
      top([{ seriesId: "apple", drawType: "line", axis: "primary", markers: false }]),
    );
  });
});
