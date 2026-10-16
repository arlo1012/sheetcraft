import type { EChartsOption } from "echarts";

/** Assert displayed labels separately from the renderer's unique matching keys. */
export function displayedSeriesName(option: EChartsOption, name: string): string {
  const legend = Array.isArray(option.legend) ? option.legend[0] : option.legend;
  return typeof legend?.formatter === "function" ? legend.formatter(name) : name;
}
export function withDisplayedSeriesNames(option: EChartsOption): EChartsOption {
  return {
    ...option,
    ...(Array.isArray(option.series)
      ? {
          series: option.series.map((series) => ({
            ...series,
            ...(typeof series.name === "string"
              ? { name: displayedSeriesName(option, series.name) }
              : {}),
          })),
        }
      : {}),
  };
}
