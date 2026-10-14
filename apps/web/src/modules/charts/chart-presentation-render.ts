import {
  normalizeChartPresentation,
  type ChartPresentationSettings,
} from "@sheetcraft/core/chart-presentation";
import { normalizeChartFormat, type ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import {
  normalizeChartDataCache,
  type ChartData,
  type ChartSeries,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";

/** Strict at every render boundary, including empty sources and word clouds. */
export function getChartRenderPresentation(
  chart: SheetChart,
): ChartPresentationSettings | undefined {
  const field = Object.getOwnPropertyDescriptor(chart, "presentation");
  if (!field) {
    if ("presentation" in chart)
      throw new TypeError("Chart presentation requires an own data field.");
    return undefined;
  }
  if (!("value" in field)) throw new TypeError("Chart presentation requires an own data field.");
  const presentation = normalizeChartPresentation(field.value);
  if (
    presentation.percentStacked &&
    (chart.stacked !== true || !["column", "bar", "line", "area"].includes(chart.type))
  )
    throw new RangeError(
      "Percentage presentation requires a stacked column, bar, line or area chart.",
    );
  if (presentation.lineMarkers !== undefined && chart.type !== "line")
    throw new RangeError("Global line markers require a line chart.");
  return presentation;
}

/** Shared opaque screen/print fill. Omission preserves the legacy white background. */
export function getChartPresentationBackground(chart: SheetChart): string {
  return getChartRenderPresentation(chart)?.background ?? "#ffffff";
}

/** Presentation defaults depend on the surface, never on one edited element. */
export function getChartPresentationTextColor(chart: SheetChart): string | undefined {
  const background = getChartRenderPresentation(chart)?.background;
  if (background === undefined) return undefined;
  const luminance = (color: string) => {
    const hex =
      color.length === 4
        ? color
            .slice(1)
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : color.slice(1);
    const channels = [0, 2, 4].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const surface = luminance(background);
  const contrast = (color: string) => {
    const text = luminance(color);
    return (Math.max(surface, text) + 0.05) / (Math.min(surface, text) + 0.05);
  };
  return contrast("#333333") >= contrast("#e8eef7") ? "#333333" : "#e8eef7";
}

/** Convert percentage-point controls without changing persistent settings. */
export function chartPercentAxisSettings(
  settings: ChartValueAxisFormat | undefined,
): ChartValueAxisFormat | undefined {
  if (!settings) return undefined;
  return {
    ...settings,
    ...(settings.min !== undefined ? { min: settings.min / 100 } : {}),
    ...(settings.max !== undefined ? { max: settings.max / 100 } : {}),
    ...(settings.majorUnit !== undefined ? { majorUnit: settings.majorUnit / 100 } : {}),
    ...(settings.minorUnit !== undefined ? { minorUnit: settings.minorUnit / 100 } : {}),
  };
}

/** Keep the whole signed percentage domain visible when automatic bounds are used. */
export function chartPercentAxisDomain(entries: readonly ChartSeries[]): {
  min: number;
  max: number;
} {
  let negative = false,
    positive = false;
  for (const entry of entries)
    for (const value of entry.values) {
      if (value !== null && value < 0) negative = true;
      if (value !== null && value > 0) positive = true;
    }
  return { min: negative ? -1 : 0, max: positive || !negative ? 1 : 0 };
}

/**
 * Product definition for mixed signs: each category's absolute contributions sum
 * to one within its own value-axis group. This does not claim WPS negative-stack
 * semantics. Max scaling avoids overflow even for multiple Number.MAX_VALUEs.
 * Raw source/cache/Pivot data and number formats remain untouched.
 */
export function createChartPresentationData(
  chart: SheetChart,
  data: ChartData,
  presentation = getChartRenderPresentation(chart),
): ChartData {
  if (presentation) normalizeChartDataCache(data);
  if (!presentation?.percentStacked) return data;
  const field = Object.getOwnPropertyDescriptor(chart, "format");
  if (field && !("value" in field)) throw new TypeError("Chart format requires an own data field.");
  const format = field ? normalizeChartFormat(field.value) : undefined;
  const axis = data.series.map((entry) =>
    entry.id !== undefined &&
    format?.series?.find((item) => item.id === entry.id)?.axis === "secondary"
      ? 1
      : 0,
  );
  const values = data.series.map((entry) => [...entry.values]);
  for (let category = 0; category < data.categories.length; category++) {
    for (const group of [0, 1]) {
      let scale = 0;
      for (let index = 0; index < values.length; index++) {
        if (axis[index] !== group) continue;
        const value = values[index]![category];
        if (value !== null && value !== undefined) scale = Math.max(scale, Math.abs(value));
      }
      if (scale === 0) continue;
      let total = 0;
      for (let index = 0; index < values.length; index++) {
        if (axis[index] !== group) continue;
        const value = values[index]![category];
        if (value !== null && value !== undefined) total += Math.abs(value) / scale;
      }
      for (let index = 0; index < values.length; index++) {
        if (axis[index] !== group) continue;
        const value = values[index]![category];
        if (value !== null && value !== undefined) values[index]![category] = value / scale / total;
      }
    }
  }
  return {
    ...data,
    series: data.series.map((entry, index) => ({ ...entry, values: values[index]! })),
  };
}
