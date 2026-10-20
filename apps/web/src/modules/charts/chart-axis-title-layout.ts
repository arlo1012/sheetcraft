import type { EChartsOption, XAXisComponentOption, YAXisComponentOption } from "echarts";
import { format } from "echarts/core";
import type { ChartTextFormat } from "@sheetcraft/core/chart-format";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartTextPlan, measureChartText, type ChartFontContext } from "./chart-script-fonts";

type AxisTitle = {
  title?: string;
  titleVisible?: boolean;
  titleText?: ChartTextFormat;
  titleRotation?: number;
  text?: ChartTextFormat;
};

/** Shared screen/print/table measurement of the actual title faces and rotation. */
export function chartAxisTitleExtent(
  settings: AxisTitle,
  horizontal: boolean,
  context?: ChartFontContext,
  maxWidth = Infinity,
) {
  const text = settings.titleText ?? settings.text;
  const size = text?.fontSize ?? 12;
  const family = text?.fontFamily ?? "Arial, sans-serif";
  const font = (face: string) =>
    `${text?.italic ? "italic" : "normal"} ${text?.bold ? "bold" : "normal"} ${size}px ${face}`;
  const width = Math.min(
    maxWidth,
    measureChartText(
      createChartTextPlan(
        settings.title ?? "",
        text,
        context?.theme,
        family,
        context?.resolveFontFamily,
      ),
      (value, face) => format.getTextRect(value, font(face)).width,
    ),
  );
  const height = size * 1.2 * (settings.title?.split(/\r?\n/).length ?? 1);
  const radians = ((settings.titleRotation ?? (horizontal ? 0 : -90)) * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height,
    height: Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height,
  };
}

/** One width budget for native names, rich plans, table clearance and print. */
export function chartAxisTitleWidthBudget(
  settings: AxisTitle,
  horizontal: boolean,
  dimensions: { width: number; height: number },
): number {
  const angle = ((settings.titleRotation ?? (horizontal ? 0 : -90)) * Math.PI) / 180;
  return Math.max(
    1,
    Math.min(
      // A title parallel to its axis uses the long span. Only the perpendicular
      // footprint belongs in the narrow title strip (e.g. a vertical x-axis name).
      (dimensions.width * (horizontal ? 0.6 : 0.3)) / Math.max(0.01, Math.abs(Math.cos(angle))),
      (dimensions.height * (horizontal ? 0.3 : 0.75)) / Math.max(0.01, Math.abs(Math.sin(angle))),
    ),
  );
}

/** Reserve independently styled titles in the existing Cartesian grid, never an overlay.
 * Old shared-style documents retain their original geometry. Oversize names use the
 * engine's bounded name truncation; the retained title is never shortened. */
export function reserveChartAxisTitles(
  option: EChartsOption,
  chart: SheetChart,
  dimensions?: { width: number; height: number } & ChartFontContext,
): EChartsOption {
  if (!option.grid || Array.isArray(option.grid)) return option;
  const width = dimensions?.width ?? 480,
    height = dimensions?.height ?? 300;
  const additions = { left: 0, right: 0, top: 0, bottom: 0 };
  type Axis = XAXisComponentOption | YAXisComponentOption;
  const titles: { axis: Axis; horizontal: boolean; settings: AxisTitle }[] = [];
  const axes = (entries: EChartsOption["xAxis"] | EChartsOption["yAxis"], horizontal: boolean) => {
    if (!entries) return entries;
    const apply = (axis: Axis, index: number): Axis => {
      const settings =
        axis.type === "category"
          ? chart.format?.categoryAxis
          : index > 0 && horizontal === (chart.type === "bar")
            ? chart.format?.secondaryValueAxis
            : chart.format?.valueAxis;
      if (
        !settings ||
        !axis.name ||
        axis.show === false ||
        (settings.titleText === undefined && settings.titleRotation === undefined)
      )
        return axis;
      const maxWidth = chartAxisTitleWidthBudget(settings, horizontal, { width, height });
      const extent = chartAxisTitleExtent(settings, horizontal, dimensions, maxWidth);
      const side = horizontal
        ? axis.position === "top"
          ? "top"
          : "bottom"
        : axis.position === "right"
          ? "right"
          : "left";
      // The data-table planner owns the category title strip beneath/above its grid.
      if (
        !(
          horizontal &&
          axis.type === "category" &&
          chart.elements?.dataTable &&
          chart.elements.dataTable !== "none"
        )
      )
        additions[side] = Math.max(
          additions[side],
          (horizontal ? extent.height : extent.width) + 8,
        );
      const result: Axis = {
        ...axis,
        nameTruncate: { ...axis.nameTruncate, maxWidth, ellipsis: "…" },
        nameTextStyle: { ...axis.nameTextStyle, width: maxWidth, overflow: "truncate" },
      };
      titles.push({ axis: result, horizontal, settings });
      return result;
    };
    return Array.isArray(entries) ? entries.map(apply) : apply(entries, 0);
  };
  const xAxis = axes(option.xAxis, true),
    yAxis = axes(option.yAxis, false);
  const grid = { ...option.grid };
  for (const side of ["left", "right", "top", "bottom"] as const) {
    if (!additions[side]) continue;
    const value = grid[side];
    const span = side === "left" || side === "right" ? width : height;
    const base =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.endsWith("%")
          ? (Number.parseFloat(value) * span) / 100
          : 0;
    grid[side] = base + additions[side];
  }
  const pixels = (value: unknown, span: number) =>
    typeof value === "number"
      ? value
      : typeof value === "string" && value.endsWith("%")
        ? (Number.parseFloat(value) * span) / 100
        : 0;
  // A small native drawing can have a perfectly usable plot below 96px before
  // titles are reserved. Keep at least half of that original plot span, capped
  // at the ordinary 96px budget, rather than imposing a new minimum chart size.
  // Only admission adapts: never shrink the document's fonts, move its existing
  // strips, or change the data-table planner's separate readability budget.
  const minimumPlot = (span: number, start: unknown, end: unknown) =>
    Math.max(1, Math.min(96, (span - pixels(start, span) - pixels(end, span)) / 2));
  const plotWidth = width - pixels(grid.left, width) - pixels(grid.right, width);
  const plotHeight = height - pixels(grid.top, height) - pixels(grid.bottom, height);
  if (
    Object.values(additions).some((value) => value > 0) &&
    (plotWidth < minimumPlot(width, option.grid.left, option.grid.right) ||
      plotHeight < minimumPlot(height, option.grid.top, option.grid.bottom))
  )
    throw new RangeError(
      "Axis titles exceed the adaptive plot budget (up to 96×96px); enlarge the chart or reduce title size.",
    );
  // On newly admitted compact plots a parallel title can use the real space
  // around its plot midpoint, not an arbitrary fraction of the canvas. This is
  // important with browser font metrics: a full title can fit the drawing while
  // exceeding the old 60%-width cap. Perpendicular footprints stay unchanged.
  // containLabel grids are subsequently moved by the engine; keep their existing
  // width budget rather than guessing that later midpoint.
  if (
    (plotWidth < 96 || plotHeight < 96) &&
    grid.containLabel !== true &&
    grid.outerBounds === undefined &&
    grid.outerBoundsMode === undefined
  ) {
    for (const { axis, horizontal, settings } of titles) {
      if (axis.nameLocation !== "middle" && axis.nameLocation !== "center") continue;
      if (axis.nameTextStyle?.align !== undefined && axis.nameTextStyle.align !== "center")
        continue;
      const radians = ((settings.titleRotation ?? (horizontal ? 0 : -90)) * Math.PI) / 180;
      const parallel = horizontal ? Math.abs(Math.sin(radians)) : Math.abs(Math.cos(radians));
      if (parallel > 1e-10) continue;
      const span = horizontal ? width : height;
      const start = pixels(horizontal ? grid.left : grid.top, span);
      const end = pixels(horizontal ? grid.right : grid.bottom, span);
      const center = (span + start - end) / 2;
      const maxWidth = Math.max(1, 2 * Math.min(center, span - center) - 8);
      axis.nameTruncate = { ...axis.nameTruncate, maxWidth };
      axis.nameTextStyle = { ...axis.nameTextStyle, width: maxWidth };
    }
  }
  return {
    ...option,
    grid,
    xAxis: xAxis as EChartsOption["xAxis"],
    yAxis: yAxis as EChartsOption["yAxis"],
  };
}
