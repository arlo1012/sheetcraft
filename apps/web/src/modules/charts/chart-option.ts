import type { EChartsOption, SeriesOption } from "echarts";
import type { ChartData, SheetChart } from "@idea10/core/sheet-charts";
const colors = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#db2777"];
export function createChartOption(chart: SheetChart, data: ChartData): EChartsOption {
  const common: EChartsOption = {
    animation: false,
    color: colors,
    backgroundColor: "#ffffff",
    title: { text: chart.title, left: "center", textStyle: { fontSize: 15, fontWeight: "normal" } },
    tooltip: { trigger: "item", renderMode: "richText", confine: true },
    legend: { show: chart.legend, bottom: 0, type: "scroll" },
    textStyle: { fontFamily: "Arial, sans-serif" },
  };
  if (chart.type === "pie" || chart.type === "doughnut")
    return {
      ...common,
      series: [
        {
          type: "pie",
          radius: chart.type === "doughnut" ? ["35%", "65%"] : "65%",
          center: ["50%", "50%"],
          label: { show: chart.labels },
          data: data.categories.flatMap((name, index) => {
            const value = data.series[0]?.values[index];
            return value !== null && value !== undefined && value >= 0 ? [{ name, value }] : [];
          }),
        },
      ],
    };
  if (chart.type === "treemap")
    return {
      ...common,
      series: [
        {
          type: "treemap",
          top: chart.title ? 38 : 8,
          bottom: 8,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: { show: true },
          data: data.categories.flatMap((name, index) => {
            const value = data.series[0]?.values[index];
            return value !== null && value !== undefined && value > 0 ? [{ name, value }] : [];
          }),
        },
      ],
    };
  if (chart.type === "sankey") {
    const links = data.records.flatMap((row) =>
      typeof row[2] === "number" &&
      row[2] > 0 &&
      row[0] != null &&
      row[1] != null &&
      String(row[0]) !== String(row[1])
        ? [{ source: String(row[0]), target: String(row[1]), value: row[2] }]
        : [],
    );
    // Sankey requires an acyclic graph; reject the whole graph instead of omitting edges.
    const nodes = [...new Set(links.flatMap((link) => [link.source, link.target]))];
    const outgoing = new Map<string, string[]>();
    const indegree = new Map(nodes.map((node) => [node, 0]));
    for (const link of links) {
      outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link.target]);
      indegree.set(link.target, indegree.get(link.target)! + 1);
    }
    const queue = nodes.filter((node) => indegree.get(node) === 0);
    let visited = 0;
    for (let i = 0; i < queue.length; i++) {
      visited++;
      for (const target of outgoing.get(queue[i]!) ?? []) {
        const degree = indegree.get(target)! - 1;
        indegree.set(target, degree);
        if (!degree) queue.push(target);
      }
    }
    if (visited !== nodes.length) throw new RangeError("Sankey links must not form a cycle.");
    return {
      ...common,
      series: [
        {
          type: "sankey",
          top: chart.title ? 40 : 12,
          bottom: 18,
          label: { show: true },
          data: visited === nodes.length ? nodes.map((name) => ({ name })) : [],
          links: visited === nodes.length ? links : [],
          lineStyle: { color: "source", curveness: 0.5 },
        },
      ],
    };
  }
  if (chart.type === "radar") {
    const maximum = Math.max(
      1,
      ...data.series.flatMap((series) =>
        series.values.filter((value): value is number => value !== null),
      ),
    );
    return {
      ...common,
      radar: { radius: "60%", indicator: data.categories.map((name) => ({ name, max: maximum })) },
      series: [
        {
          type: "radar",
          data: data.series.map((series) => ({
            name: series.name,
            value: series.values.map((value) => value ?? "-"),
          })),
          label: { show: chart.labels },
        },
      ],
    };
  }
  if (chart.type === "river")
    return {
      ...common,
      singleAxis: { type: "category", data: data.categories, top: 40, bottom: 45 },
      series: [
        {
          type: "themeRiver",
          label: { show: chart.labels },
          data: data.series.flatMap((series) =>
            series.values.flatMap((value, index) =>
              value === null ? [] : [[index, value, series.name] as [number, number, string]],
            ),
          ),
        },
      ],
    };
  const horizontal = chart.type === "bar";
  const scatter = chart.type === "scatter";
  const series: SeriesOption[] = scatter
    ? data.series.slice(1).map((series) => ({
        type: "scatter",
        name: series.name,
        data: series.values.flatMap((value, index) => {
          const x = data.series[0]?.values[index];
          return x !== null && x !== undefined && value !== null ? [[x, value]] : [];
        }),
        label: { show: chart.labels },
      }))
    : data.series.map((series) =>
        chart.type === "line" || chart.type === "area"
          ? {
              type: "line",
              name: series.name,
              data: series.values,
              showSymbol: true,
              connectNulls: false,
              ...(chart.type === "area" ? { areaStyle: {} } : {}),
              ...(chart.stacked ? { stack: "total" } : {}),
              label: { show: chart.labels },
            }
          : {
              type: "bar",
              name: series.name,
              data: series.values,
              ...(chart.stacked ? { stack: "total" } : {}),
              label: { show: chart.labels },
            },
      );
  return {
    ...common,
    grid: { top: chart.title ? 45 : 15, left: 48, right: 22, bottom: chart.legend ? 58 : 35 },
    xAxis: horizontal || scatter ? { type: "value" } : { type: "category", data: data.categories },
    yAxis: horizontal ? { type: "category", data: data.categories } : { type: "value" },
    series,
  };
}
