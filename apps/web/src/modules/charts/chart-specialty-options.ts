import type { EChartsOption } from "echarts";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { getChartPresentationTextColor } from "./chart-presentation-render";

type Size = { width: number; height: number; animate?: boolean };

// Distance between circle centres for the requested area of intersection.
function vennDistance(a: number, b: number, overlap: number): number {
  if (!overlap) return a + b;
  if (overlap >= Math.PI * Math.min(a, b) ** 2) return Math.abs(a - b);
  let lo = Math.abs(a - b),
    hi = a + b;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    const angle = (x: number, y: number) =>
      Math.acos(Math.max(-1, Math.min(1, (d * d + x * x - y * y) / (2 * d * x))));
    const u = angle(a, b),
      v = angle(b, a);
    const area = a * a * (u - Math.sin(2 * u) / 2) + b * b * (v - Math.sin(2 * v) / 2);
    if (area > overlap) lo = d;
    else hi = d;
  }
  return (lo + hi) / 2;
}

export function specialtyOption(
  chart: SheetChart,
  data: ChartData,
  common: EChartsOption,
  palette: readonly string[],
  size: Size,
): EChartsOption | undefined {
  if (!["funnel", "gauge", "liquid", "waterfall", "venn"].includes(chart.type)) return undefined;
  const values = data.series[0]?.values ?? [];
  const points = data.categories.flatMap((name, i) => {
    const value = values[i];
    return value != null && value >= 0 ? [{ name, value }] : [];
  });
  const top = chart.title && chart.elements?.titlePosition !== "none" ? 36 : 8;
  const cx = size.width / 2,
    cy = (size.height + top) / 2,
    radius = Math.max(2, Math.min(cx - 12, (size.height - top) / 2 - 12));
  const ink = getChartPresentationTextColor(chart) ?? "#333333";
  if (chart.type === "funnel")
    return {
      ...common,
      series: [
        {
          type: "funnel",
          top,
          bottom: chart.legend ? 36 : 8,
          left: "15%",
          width: "70%",
          gap: 2,
          sort: "descending",
          label: { show: chart.labels, position: "inside" },
          data: points,
        },
      ],
    };
  if (chart.type === "gauge" || chart.type === "liquid") {
    const index = values.findIndex((value) => value != null);
    const raw = values[index];
    if (raw == null) return { ...common, series: [] };
    const value = raw * (data.series[0]?.numberFormat?.kind === "percent" ? 100 : 1);
    if (!Number.isFinite(value) || value < 0 || value > 100)
      throw new RangeError("Expected a percentage between 0 and 100.");
    const label = String(Math.round(value * 100) / 100) + "%";
    const name = data.categories[index] ?? "";
    if (chart.type === "gauge")
      return {
        ...common,
        legend: { show: false },
        series: [
          {
            type: "gauge",
            center: [cx, cy],
            radius,
            axisLine: { lineStyle: { width: 10 } },
            progress: { show: true, width: 10, itemStyle: { color: palette[0] } },
            pointer: { width: 4 },
            splitNumber: 5,
            axisLabel: { color: ink },
            title: { color: ink, offsetCenter: [0, "67%"] },
            detail: { show: chart.labels, color: ink, fontSize: 20, formatter: () => label },
            data: [{ value, name }],
          },
        ],
      };
    const y = cy + radius * (1 - (2 * value) / 100);
    const amplitude = Math.min(radius * 0.05, (cy + radius - y) / 2, (y - cy + radius) / 2);
    const wavePoints = (phase: number) => {
      const points = Array.from({ length: 65 }, (_, i) => [
        cx - radius + (i * radius) / 32,
        y + Math.sin((i * Math.PI) / 16 + phase) * amplitude,
      ]);
      points.push([cx + radius, cy + radius], [cx - radius, cy + radius]);
      return points;
    };
    const motion =
      size.animate && amplitude > 0
        ? {
            keyframeAnimation: {
              duration: 2200,
              loop: true,
              keyframes: [0, 0.25, 0.5, 0.75, 1].map((percent) => ({
                percent,
                shape: { points: wavePoints(percent * 2 * Math.PI) },
              })),
            },
          }
        : {};
    return {
      ...common,
      legend: { show: false },
      graphic: [
        {
          type: "circle",
          shape: { cx, cy, r: radius },
          style: { fill: "transparent", stroke: palette[0], lineWidth: 2 },
        },
        {
          type: "polygon",
          shape: { points: wavePoints(0) },
          ...motion,
          clipPath: { type: "circle", shape: { cx, cy, r: radius } },
          style: { fill: palette[0], opacity: 0.72 },
        },
        ...(chart.labels
          ? [
              {
                type: "text" as const,
                x: cx,
                y: cy,
                style: {
                  text: label,
                  fontSize: 22,
                  fontWeight: "bold" as const,
                  fill: ink,
                  align: "center" as const,
                  verticalAlign: "middle" as const,
                },
              },
            ]
          : []),
      ],
    };
  }
  if (chart.type === "waterfall") {
    let total = 0;
    const steps = values.flatMap((delta, i) => {
      if (delta == null) return [];
      const start = total;
      total += delta;
      return [[i, start, total, delta]];
    });
    return {
      ...common,
      legend: { show: false },
      grid: { top, left: 44, right: 16, bottom: 36, containLabel: true },
      xAxis: { type: "category", data: data.categories },
      yAxis: { type: "value" },
      series: [
        {
          type: "custom",
          encode: { x: 0, y: [1, 2], tooltip: [3] },
          data: steps,
          renderItem: (_params, api) => {
            const i = Number(api.value(0)),
              start = api.coord([i, Number(api.value(1))]),
              end = api.coord([i, Number(api.value(2))]);
            const step = api.size!([1, 0]);
            const w = Math.abs(Array.isArray(step) ? step[0]! : step) * 0.56,
              delta = Number(api.value(3));
            return {
              type: "group",
              children: [
                {
                  type: "rect",
                  shape: {
                    x: start[0]! - w / 2,
                    y: Math.min(start[1]!, end[1]!),
                    width: w,
                    height: Math.max(1, Math.abs(start[1]! - end[1]!)),
                  },
                  style: { fill: palette[delta < 0 ? 1 : 0] },
                },
                ...(chart.labels
                  ? [
                      {
                        type: "text" as const,
                        x: start[0],
                        y: end[1],
                        style: {
                          text: String(delta),
                          align: "center" as const,
                          verticalAlign: delta < 0 ? ("top" as const) : ("bottom" as const),
                          fill: ink,
                        },
                      },
                    ]
                  : []),
              ],
            };
          },
        },
      ],
    };
  }
  if (chart.type === "venn") {
    const [a, b, overlap] = values;
    if (
      a == null ||
      b == null ||
      overlap == null ||
      ![a, b, overlap].every(Number.isFinite) ||
      a < 0 ||
      b < 0 ||
      overlap < 0 ||
      overlap > Math.min(a, b)
    )
      throw new RangeError("Expected two set sizes followed by their intersection.");
    if (!a && !b) return { ...common, series: [] };
    const r1 = Math.sqrt(a / Math.PI),
      r2 = Math.sqrt(b / Math.PI),
      d = vennDistance(r1, r2, overlap);
    const left = Math.min(-r1, d - r2),
      right = Math.max(r1, d + r2);
    const scale = Math.min((size.width - 20) / (right - left), radius / Math.max(r1, r2));
    const x1 = cx - ((left + right) * scale) / 2,
      x2 = x1 + d * scale;
    const circles = [
      { x: x1, r: r1 * scale },
      { x: x2, r: r2 * scale },
    ];
    return {
      ...common,
      legend: { show: false },
      graphic: [
        ...circles.map(({ x, r }, i) => ({
          type: "circle" as const,
          shape: { cx: x, cy, r },
          style: { fill: palette[i], opacity: 0.6 },
        })),
        ...(chart.labels
          ? [
              {
                type: "text" as const,
                x: cx,
                y: size.height - 3,
                style: {
                  text: data.categories
                    .slice(0, 3)
                    .map((name, i) => name + ": " + values[i])
                    .join("   "),
                  fill: ink,
                  align: "center" as const,
                  verticalAlign: "bottom" as const,
                },
              },
            ]
          : []),
      ],
    };
  }
  return undefined;
}
