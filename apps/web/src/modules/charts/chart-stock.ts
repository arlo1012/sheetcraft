import type { CustomSeriesOption, EChartsOption } from "echarts";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import { stockSeriesCount, type StockStyle } from "@sheetcraft/core/chart-presentation";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";

const day = 86_400_000;
function roles(style: StockStyle) {
  const volume = style === "vhlc" || style === "vohlc";
  const open = style === "ohlc" || style === "vohlc";
  return { volume, open, firstPrice: volume ? 1 : 0, high: (volume ? 1 : 0) + (open ? 1 : 0) };
}

/** Choose Office-style major units, zooming the price axis when all values lie close together. */
function stockAxisBounds(
  low: number,
  high: number,
): { min?: number; max?: number; interval?: number } {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return {};
  if (low === 0 && high === 0) return { min: 0, max: 1, interval: 0.1 };
  const negative = high <= 0;
  const bottom = negative ? -high : low,
    top = negative ? -low : high;
  const span = top - bottom;
  const floor = bottom > 0 && span > 0 && span < top / 6 ? bottom - span / 2 : Math.min(0, bottom);
  const step = (top - floor) / 10;
  if (!Number.isFinite(step) || step <= 0) return {};
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const factor = [1, 2, 5, 10, 20].find((n) => n * magnitude > step);
  if (!factor) return {};
  const interval = factor * magnitude;
  const minTick = floor < 0 ? Math.ceil(floor / interval) - 1 : Math.floor(floor / interval);
  const maxTick = Math.floor(top / interval) + 1;
  const min = Number((minTick * interval).toPrecision(14)),
    max = Number((maxTick * interval).toPrecision(14));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {};
  return negative ? { min: -max, max: -min, interval } : { min, max, interval };
}

export function stockChartOption(
  chart: SheetChart,
  data: ChartData,
  common: EChartsOption,
  palette: readonly string[],
  plot?: { left: number; right: number; top: number; bottom: number },
): EChartsOption {
  const style = chart.presentation?.stockStyle ?? "hlc";
  const count = stockSeriesCount(style);
  if (data.series.length !== count)
    throw new RangeError(`Stock chart requires exactly ${count} numeric series.`);
  const { volume, open, firstPrice, high } = roles(style),
    close = count - 1;
  const axis = data.stockDateAxis;
  // Excel's serial on 1970-01-01 in the two supported workbook calendars.
  const epoch = axis?.dateSystem === "1904" ? 24107 : 25569;
  const rows = data.categories.flatMap((category, i) => {
    const serial = axis?.values[i];
    if (axis && serial == null) return [];
    const values = data.series.map((entry) => entry.values[i] ?? null);
    return [{ category, x: axis ? (serial! - epoch) * day : i, values }];
  });
  const points = rows.map((row) => [row.x, ...row.values.map((v) => v ?? "-")]);
  const times = rows.map((row) => row.x);
  const legends = data.series.map((s, i) => ({
    name: `stock-${i}`,
    label: s.name,
    icon: volume && i === 0 ? "rect" : !open && i === close ? "rect" : "none",
  }));
  const volumeColor =
      chart.presentation?.palette || chart.presentation?.themeAccent !== undefined
        ? palette[0]!
        : "#4472c4",
    closeColor = "#ffc000",
    ink = "#252525";
  const priceDimensions = data.series.slice(firstPrice).map((_, i) => firstPrice + i + 1);
  const series = data.series.map((entry, index): CustomSeriesOption => {
    const isVolume = volume && index === 0;
    return {
      type: "custom",
      name: legends[index]!.name,
      coordinateSystem: "cartesian2d",
      yAxisIndex: volume && !isVolume ? 1 : 0,
      z: isVolume ? 1 : 3,
      clip: true,
      encode: { x: 0, y: isVolume ? 1 : priceDimensions },
      data: points,
      itemStyle: { color: isVolume ? volumeColor : !open && index === close ? closeColor : ink },
      tooltip: {
        formatter: (params) => {
          const point = Array.isArray(params) ? params[0] : params,
            row = point && rows[point.dataIndex];
          return row
            ? [
                row.category,
                ...data.series
                  .map((s, i) =>
                    row.values[i] == null
                      ? ""
                      : `${s.name}: ${formatCellNumberValue(row.values[i]!, s.numberFormat).text}`,
                  )
                  .filter(Boolean),
              ].join("\n")
            : "";
        },
      },
      renderItem(params, api) {
        const row = rows[params.dataIndex];
        if (!row) return;
        const coord = (v: number) => api.coord([row.x, v]);
        const slot = api.size!([axis ? day : 1, 0]);
        const width = Math.max(1, Math.abs(Array.isArray(slot) ? slot[0]! : slot) * 0.4);
        const value = row.values[index];
        const label = (v: number) => {
          const [x, y] = coord(v);
          return {
            type: "text" as const,
            style: {
              text: formatCellNumberValue(v, entry.numberFormat).text,
              x: x! + (index === high ? 0 : width / 2 + 2),
              y: y! + (index === high ? -3 : 0),
              align: index === high ? ("center" as const) : ("left" as const),
              verticalAlign: index === high ? ("bottom" as const) : ("middle" as const),
              fill: ink,
              fontSize: 10,
            },
          };
        };
        const labels = chart.labels && value != null ? [label(value)] : [];
        if (isVolume) {
          if (value == null) return;
          const [x, y] = coord(value),
            zero = coord(0)[1]!;
          return {
            type: "group",
            children: [
              {
                type: "rect",
                shape: {
                  x: x! - width / 2,
                  y: Math.min(y!, zero),
                  width,
                  height: Math.abs(y! - zero),
                },
                style: { fill: volumeColor },
              },
              ...labels,
            ],
          };
        }
        if (index === high) {
          // The line spans every present price including open/close, even when high or low is missing.
          const prices = row.values.slice(firstPrice).filter((v): v is number => v !== null);
          if (!prices.length) return;
          const [x, y1] = coord(Math.min(...prices)),
            y2 = coord(Math.max(...prices))[1]!;
          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: { x1: x!, y1: y1!, x2: x!, y2 },
                style: { stroke: ink, lineWidth: 1 },
              },
              ...labels,
            ],
          };
        }
        if (index !== close || value == null)
          return labels.length ? { type: "group", children: labels } : undefined;
        const [x, y] = coord(value);
        if (!open)
          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: { x1: x!, y1: y!, x2: x! + Math.max(2, Math.min(5, width / 3)), y2: y! },
                style: { stroke: closeColor, lineWidth: 2 },
              },
              ...labels,
            ],
          };
        const opening = row.values[firstPrice];
        if (opening == null) return labels.length ? { type: "group", children: labels } : undefined;
        const yOpen = coord(opening)[1]!;
        if (opening === value)
          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: { x1: x! - width / 2, y1: y!, x2: x! + width / 2, y2: y! },
                style: { stroke: ink, lineWidth: 1 },
              },
              ...labels,
            ],
          };
        return {
          type: "group",
          children: [
            {
              type: "rect",
              shape: {
                x: x! - width / 2,
                y: Math.min(yOpen, y!),
                width,
                height: Math.abs(yOpen - y!),
              },
              style: { stroke: ink, lineWidth: 1, fill: value > opening ? "#fafafa" : "#404040" },
            },
            ...labels,
          ],
        };
      },
    };
  });
  const prices = data.series.slice(firstPrice);
  const priceFormat = prices.every(
    (s) => JSON.stringify(s.numberFormat) === JSON.stringify(prices[0]?.numberFormat),
  )
    ? prices[0]?.numberFormat
    : undefined;
  let low = Infinity,
    top = -Infinity,
    lowVolume = Infinity,
    highVolume = -Infinity;
  for (const row of rows) {
    row.values.forEach((v, index) => {
      if (v === null) return;
      if (volume && index === 0) {
        lowVolume = Math.min(lowVolume, v);
        highVolume = Math.max(highVolume, v);
      } else {
        low = Math.min(low, v);
        top = Math.max(top, v);
      }
    });
  }
  return {
    ...common,
    useUTC: true,
    legend: {
      ...(common.legend as object),
      data: legends.map(({ name, icon }) => ({ name, icon })),
      formatter: (key: string) => legends.find((entry) => entry.name === key)?.label ?? key,
    },
    grid: {
      ...(plot ?? {
        left: 8,
        right: 8,
        top: chart.title ? 38 : 12,
        bottom: chart.legend ? 38 : 10,
      }),
      containLabel: true,
    },
    xAxis: axis
      ? {
          type: "time",
          min: times.length ? Math.min(...times) - day / 2 : undefined,
          max: times.length ? Math.max(...times) + day / 2 : undefined,
          minInterval: day,
          axisLabel: {
            hideOverlap: true,
            showMinLabel: false,
            showMaxLabel: false,
            formatter: (ms: number) =>
              formatCellNumberValue(ms / day + epoch, axis.format, { dateSystem: axis.dateSystem })
                .text,
          },
        }
      : {
          type: "category",
          data: data.categories,
          boundaryGap: true,
          axisLabel: { hideOverlap: true },
        },
    yAxis: [
      ...(volume
        ? [
            {
              type: "value" as const,
              position: "left" as const,
              ...stockAxisBounds(lowVolume, highVolume),
              axisLabel: {
                formatter: (v: number) =>
                  formatCellNumberValue(v, data.series[0]?.numberFormat).text,
              },
            },
          ]
        : []),
      {
        type: "value",
        position: volume ? "right" : "left",
        ...stockAxisBounds(low, top),
        splitLine: { show: !volume },
        axisLabel: { formatter: (v: number) => formatCellNumberValue(v, priceFormat).text },
      },
    ],
    series,
  };
}
