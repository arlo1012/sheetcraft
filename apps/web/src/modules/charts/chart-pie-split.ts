import { color } from "echarts/core";
import type { EChartsOption, PieSeriesOption, CustomSeriesOption } from "echarts";
import type { PieSector } from "./chart-pie-perspective";

type Plot = { x: number; y: number; width: number; height: number };
export function splitPieOption(
  sectors: PieSector[],
  main: PieSeriesOption,
  plot: Plot,
  bars: boolean,
  showLabels: boolean,
  percentLabels: boolean,
): Pick<EChartsOption, "series" | "graphic"> {
  // WPS automatic position split places the final third (rounded up) on the right.
  const first = sectors.length - Math.ceil(sectors.length / 3);
  const tail = sectors.slice(first);
  const sum = tail.reduce((n, s) => n + (s.value === "-" ? 0 : s.value), 0);
  const share = tail.reduce((n, s) => n + s.fraction, 0);
  const radius = Math.max(1, Math.min(plot.height * 0.4, plot.width * 0.24)),
    small = radius * 0.75;
  const cy = plot.y + plot.height / 2,
    left = plot.x + plot.width * 0.27,
    right = plot.x + plot.width * 0.76;
  const aggregateColor = color.lerp(0.56, [sectors[0]?.color ?? "#4472c4", "#ffffff"])!;
  const totalLabel = percentLabels
    ? `${Math.round(share * 100)}%`
    : String(Number(sum.toPrecision(12)));
  const pie: PieSeriesOption = {
    ...main,
    center: [left, cy],
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    radius,
    startAngle: -180 * share,
    data: [
      ...sectors.map((s, i) => ({
        name: s.name,
        value: i < first ? s.value : 0,
        selected: !!main.selectedMode && i < first,
        itemStyle: { color: s.color },
        label: { show: showLabels && i < first, formatter: () => s.label },
      })),
      {
        name: "Σ",
        value: sum,
        itemStyle: { color: aggregateColor },
        label: { show: showLabels, formatter: () => totalLabel },
      },
    ],
    tooltip: {
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return p ? (sectors[p.dataIndex]?.text ?? `Σ: ${sum}`) : "";
      },
    },
  };
  const secondPie: PieSeriesOption = {
    ...main,
    center: [right, cy],
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    radius: small,
    data: tail.map((s) => ({
      name: s.name,
      value: s.value,
      selected: !!main.selectedMode,
      itemStyle: { color: s.color },
      label: { show: showLabels, formatter: () => s.label },
    })),
    tooltip: {
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return p ? (tail[p.dataIndex]?.text ?? "") : "";
      },
    },
  };
  let cumulative = 0;
  const segments = tail.map((s) => {
    const top = cumulative;
    cumulative += share ? s.fraction / share : 0;
    return { top, height: cumulative - top };
  });
  const barWidth = small * 0.89;
  const bar: CustomSeriesOption = {
    name: main.name,
    type: "custom",
    coordinateSystem: "none",
    data: tail.map((s) => ({ value: s.value, name: s.name })),
    tooltip: secondPie.tooltip,
    renderItem(params) {
      const s = tail[params.dataIndex]!,
        segment = segments[params.dataIndex]!;
      const y = cy - small + 2 * small * segment.top,
        height = 2 * small * segment.height;
      if (!height) return;
      return {
        type: "group",
        children: [
          {
            type: "rect",
            shape: { x: right - barWidth / 2, y, width: barWidth, height },
            style: { fill: s.color },
          },
          ...(showLabels
            ? [
                {
                  type: "text" as const,
                  style: {
                    x: right,
                    y: y + height / 2,
                    text: s.label,
                    align: "center" as const,
                    verticalAlign: "middle" as const,
                    fill: "#ffffff",
                  },
                },
              ]
            : []),
        ],
      };
    },
  };
  const slope = (radius - small) / Math.max(1, right - left),
    cos = Math.sqrt(1 - slope * slope);
  return {
    series: [pie, bars ? bar : secondPie],
    graphic: share
      ? [-1, 1].map((sign) => ({
          type: "line" as const,
          silent: true,
          shape: {
            x1: left + radius * slope,
            y1: cy + sign * radius * cos,
            x2: bars ? right - barWidth / 2 : right + small * slope,
            y2: cy + sign * small * (bars ? 1 : cos),
          },
          style: { stroke: "#6b7280", lineWidth: 1 },
        }))
      : [],
  };
}
