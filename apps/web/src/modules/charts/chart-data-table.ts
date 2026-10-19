import { chartAxisTitleExtent, chartAxisTitleWidthBudget } from "./chart-axis-title-layout";
import {
  createChartTextPlan,
  chartRichStyles,
  chartRichText,
  measureChartText,
  truncateChartText,
  type ChartTextPlan,
  type ChartFontContext,
} from "./chart-script-fonts";
import type {
  EChartsOption,
  EChartsType,
  GraphicComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { normalizeChartFormat, type ChartTextFormat } from "@sheetcraft/core/chart-format";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { getChartComboDataSeriesSettings } from "./chart-format-render";
import {
  getChartPresentationBackground,
  getChartPresentationTextColor,
} from "./chart-presentation-render";

export const CHART_DATA_TABLE_LIMITS = {
  categories: 32,
  series: 8,
  slots: 256,
  labelLength: 4096,
  numberLength: 256,
  textUnits: 256 * 1024,
  primitives: 1024,
  fontSize: 12,
  rowHeight: 20,
  columnWidth: 48,
  plotWidth: 96,
  plotHeight: 96,
} as const;
export const CHART_DATA_TABLE_GRAPHIC_ID = "sheetcraft-chart-data-table";
const X_PROBE = "sheetcraft-chart-data-table-x-span";
const Y_PROBE = "sheetcraft-chart-data-table-y-span";
const PAD = 6;
const MARGIN = 8;

type TableText = Readonly<{
  text: string;
  fontFamily: string;
  width: number;
  fontFormat?: ChartTextFormat;
  rich?: ReturnType<typeof chartRichStyles>;
  color?: string;
}>;
export type ChartDataTablePlan = Readonly<{
  mode: "withLegendKeys" | "withoutLegendKeys";
  width: number;
  height: number;
  categories: readonly Readonly<{ sourceOrdinal: number; label: TableText }>[];
  rows: readonly Readonly<{
    seriesIndex: number;
    id?: string;
    key: "column" | "line" | "markerLine";
    strokeWidth: number;
    label: TableText;
    cells: readonly Readonly<{ value: number | null; label: TableText }>[];
  }>[];
  fontSize: number;
  rowHeight: number;
  tableHeight: number;
  labelGutter: number;
  gap: number;
  textColor: string;
  backgroundColor: string;
  gridColor: string;
  /** Includes formatted numeric text, which is absent from raw-source print counts. */
  generatedTextUnits: number;
  primitiveUpperBound: number;
  document?: Document;
}>;
type Dimensions = ChartFontContext & {
  width: number;
  height: number;
  resolveFontFamily?: (original: string) => string;
  document?: Document;
};
type AxisWithoutMainType<T> = T extends unknown ? Omit<T, "mainType"> : never;
type CategoryAxis = AxisWithoutMainType<XAXisComponentOption>;
type ValueAxis = AxisWithoutMainType<YAXisComponentOption>;
type GraphicElement = NonNullable<
  Extract<GraphicComponentOption, { elements?: unknown }>["elements"]
>[number];

export class ChartDataTableUnavailableError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ChartDataTableUnavailableError";
  }
}

function unavailable(message: string): never {
  throw new ChartDataTableUnavailableError(
    `Chart data table ${message} Resize the chart or reduce its source/number format.`,
  );
}
type MeasurementSession = { measure(text: string, family: string): number; dispose(): void };
function createMeasurementSession(ownerDocument?: Document): MeasurementSession {
  const owner = ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!owner) unavailable("requires a native 2D text measurement context.");
  const canvas = owner.createElement("canvas");
  const release = () => {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  };
  try {
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) unavailable("requires a native 2D text measurement context.");
    return {
      measure(text, fontFamily) {
        context.font = `${CHART_DATA_TABLE_LIMITS.fontSize}px ${fontFamily}`;
        const width = context.measureText(text).width;
        if (!Number.isFinite(width) || width < 0) unavailable("has unsafe font measurements.");
        return width;
      },
      dispose: release,
    };
  } catch (error) {
    release();
    throw error;
  }
}

/** Count/format-only admission for source capture before print fonts are loaded.
 * Never touches native text measurement or claims final geometric fit. */
export function countChartDataTableText(chart: SheetChart, data: ChartData): number {
  if (
    !chart.elements?.dataTable ||
    chart.elements.dataTable === "none" ||
    !["column", "line", "area", "combo"].includes(chart.type) ||
    !data.categories.length ||
    !data.series.length
  )
    return 0;
  const limit = CHART_DATA_TABLE_LIMITS;
  if (
    data.categories.length > limit.categories ||
    data.series.length > limit.series ||
    data.categories.length * data.series.length > limit.slots
  )
    unavailable("exceeds the complete source budget.");
  let count = 0;
  const text = (value: string, numeric = false) => {
    if (
      typeof value !== "string" ||
      value.length > (numeric ? limit.numberLength : limit.labelLength)
    )
      unavailable("contains an over-budget label or formatted number.");
    const projected = numeric ? value : value.replace(/[\r\n\t]/g, " ");
    if (numeric && /[\r\n]/.test(projected))
      unavailable("formatted number must be a single readable line.");
    count += projected.length;
    if (count > limit.textUnits) unavailable("exceeds the generated-text budget.");
  };
  data.categories.forEach((value) => text(value));
  for (const series of data.series) {
    text(series.name);
    if (series.values.length !== data.categories.length)
      unavailable("source has mismatched lengths.");
    for (const value of series.values) {
      if (value === null) continue;
      if (!Number.isFinite(value)) unavailable("source values must be finite numbers or blank.");
      text(formatCellNumberValue(value, series.numberFormat).text, true);
    }
  }
  return count;
}

/** Raw, complete source projection. Percent stacking and axis formats never enter these cells. */
export function createChartDataTablePlan(
  chart: SheetChart,
  data: ChartData,
  dimensions: Dimensions,
  comboSeriesChanges?: readonly ChartComboSeriesChange[],
): ChartDataTablePlan | undefined {
  const mode = chart.elements?.dataTable;
  if (mode === undefined || mode === "none") return undefined;
  if (mode !== "withLegendKeys" && mode !== "withoutLegendKeys")
    unavailable("has an unsupported setting.");
  if (!["column", "line", "area", "combo"].includes(chart.type)) return undefined;
  if (
    data.diagnostics?.some(
      (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
    )
  )
    unavailable("source is unavailable or has mismatched lengths.");
  if (!data.categories.length || !data.series.length) return undefined;
  const limit = CHART_DATA_TABLE_LIMITS;
  if (
    data.categories.length > limit.categories ||
    data.series.length > limit.series ||
    data.categories.length * data.series.length > limit.slots
  )
    unavailable("exceeds the 32-category, 8-series, 256-cell budget; the full source is required.");
  const { width, height } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    unavailable("requires finite positive dimensions.");
  const format = chart.format === undefined ? undefined : normalizeChartFormat(chart.format);
  const textFormat = format?.categoryAxis?.text;
  const originalFamily = textFormat?.fontFamily ?? "Arial, sans-serif";
  // Tables retain their fixed 12px presentation, but inherit semantic script faces.
  const fontFormat = textFormat?.scriptFonts
    ? { scriptFonts: textFormat.scriptFonts, fontSize: 12 }
    : { fontFamily: originalFamily, fontSize: 12 };
  const rich =
    textFormat?.scriptFonts && typeof Intl.Segmenter === "function"
      ? chartRichStyles(fontFormat, dimensions.theme, originalFamily, dimensions.resolveFontFamily)
      : undefined;
  const resolvedFormat: ChartTextFormat | undefined = rich
    ? {
        scriptFonts: {
          latin: { kind: "family", family: rich.sc_latin!.fontFamily },
          eastAsia: { kind: "family", family: rich.sc_eastAsia!.fontFamily },
          complexScript: { kind: "family", family: rich.sc_complexScript!.fontFamily },
        },
      }
    : undefined;
  const measurement = createMeasurementSession(dimensions.document);
  try {
    let generatedTextUnits = 0;
    const text = (value: string, numeric = false, color?: string): TableText => {
      if (
        typeof value !== "string" ||
        value.length > (numeric ? limit.numberLength : limit.labelLength)
      )
        unavailable(
          numeric
            ? "formatted number exceeds its 256-character budget."
            : "label exceeds its 4096-character budget.",
        );
      const singleLine = numeric ? value : value.replace(/[\r\n\t]/g, " ");
      if (numeric && /[\r\n]/.test(singleLine))
        unavailable("formatted number must be a single readable line.");
      generatedTextUnits += singleLine.length;
      if (generatedTextUnits > limit.textUnits)
        unavailable("exceeds the 256 KiB generated-text budget.");
      // Resolve each actual run before either native measurement or later native paint.
      const fontFamily = dimensions.resolveFontFamily?.(originalFamily) ?? originalFamily;
      if (typeof fontFamily !== "string" || !fontFamily.trim() || fontFamily.length > 4096)
        unavailable("requires a valid resolved font family.");
      return {
        text: singleLine,
        fontFamily,
        ...(rich ? { rich, fontFormat: resolvedFormat } : {}),
        width: measureChartText(
          createChartTextPlan(singleLine, resolvedFormat ?? { fontFamily }, undefined, fontFamily),
          measurement.measure,
        ),
        ...(color ? { color } : {}),
      };
    };
    const categories = data.categories.map((label, sourceOrdinal) => ({
      sourceOrdinal,
      label: text(label),
    }));
    const rows = data.series.map((series, seriesIndex) => {
      if (series.values.length !== categories.length) unavailable("source has mismatched lengths.");
      const settings =
        series.id === undefined
          ? undefined
          : format?.series?.find((entry) => entry.id === series.id);
      const combo =
        chart.type === "combo"
          ? getChartComboDataSeriesSettings(chart, series, comboSeriesChanges)
          : undefined;
      const key: "column" | "line" | "markerLine" = combo
        ? combo.drawType === "column"
          ? "column"
          : combo.markers
            ? "markerLine"
            : "line"
        : chart.type === "column"
          ? "column"
          : (settings?.markers ??
              (chart.type === "line" ? chart.presentation?.lineMarkers : undefined) ??
              true)
            ? "markerLine"
            : "line";
      return {
        seriesIndex,
        ...(series.id !== undefined ? { id: series.id } : {}),
        key,
        strokeWidth: settings?.strokeWidth ?? 2,
        label: text(series.name),
        cells: series.values.map((value) => {
          if (value === null) return { value, label: text("", true) };
          if (typeof value !== "number" || !Number.isFinite(value))
            unavailable("source values must be finite numbers or blank.");
          const formatted = formatCellNumberValue(value, series.numberFormat);
          return { value, label: text(formatted.text, true, formatted.color) };
        }),
      };
    });
    const tableHeight = (rows.length + 1) * limit.rowHeight;
    const labelGutter = Math.max(
      72,
      Math.min(
        144,
        Math.max(...rows.map((row) => row.label.width)) +
          PAD * 2 +
          (mode === "withLegendKeys" ? 16 : 0),
      ),
    );
    const gap =
      MARGIN +
      (format?.categoryAxis?.title && format.categoryAxis.titleVisible !== false
        ? 32 +
          (format.categoryAxis.titleText !== undefined ||
          format.categoryAxis.titleRotation !== undefined
            ? chartAxisTitleExtent(
                format.categoryAxis,
                true,
                dimensions,
                chartAxisTitleWidthBudget(format.categoryAxis, true, dimensions),
              ).height
            : (format.categoryAxis.text?.fontSize ?? 12))
        : 0);
    const primitiveUpperBound =
      2 +
      categories.length +
      2 +
      rows.length +
      2 +
      categories.length +
      rows.length +
      categories.length * rows.length +
      (mode === "withLegendKeys"
        ? rows.reduce((count, row) => count + (row.key === "markerLine" ? 2 : 1), 0)
        : 0);
    if (primitiveUpperBound > limit.primitives) unavailable("exceeds the 1024-primitive budget.");
    if (
      tableHeight > height * 0.4 ||
      height - tableHeight - gap - MARGIN * 2 < limit.plotHeight ||
      width - labelGutter - 64 - MARGIN * 2 <
        Math.max(limit.plotWidth, categories.length * limit.columnWidth)
    )
      unavailable("does not fit its readable 48px columns, 20px rows and 96×96px plot budget.");
    const textColor = getChartPresentationTextColor(chart) ?? "#333333";
    return {
      mode,
      width,
      height,
      categories,
      rows,
      fontSize: limit.fontSize,
      rowHeight: limit.rowHeight,
      tableHeight,
      labelGutter,
      gap,
      textColor,
      backgroundColor: getChartPresentationBackground(chart),
      gridColor: textColor === "#e8eef7" ? "#64748b" : "#cbd5e1",
      generatedTextUnits,
      primitiveUpperBound,
      ...(dimensions.document ? { document: dimensions.document } : {}),
    };
  } finally {
    measurement.dispose();
  }
}

function pixels(value: unknown, total: number, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?%$/.test(value))
    return (Number.parseFloat(value) / 100) * total;
  if (value === undefined) return fallback;
  return unavailable("cannot reserve an unsupported grid position.");
}
function probe(id: string): CategoryAxis {
  return {
    id,
    type: "value",
    gridIndex: 0,
    min: 1,
    max: 2,
    scale: true,
    inverse: false,
    show: false,
    name: "",
    axisLabel: { show: false },
    axisLine: { show: false, onZero: false },
    axisTick: { show: false },
    splitLine: { show: false },
    minorTick: { show: false },
    minorSplitLine: { show: false },
    axisPointer: { show: false },
  };
}

/** Call only after all real primary/secondary axes and format choices have been applied. */
export function prepareChartDataTableOption(
  option: EChartsOption,
  plan: ChartDataTablePlan | undefined,
): EChartsOption {
  if (!plan) return option;
  if (!option.grid || Array.isArray(option.grid)) unavailable("requires one Cartesian plot grid.");
  const axes = option.xAxis ? (Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]) : [];
  const realAxes = axes.filter((axis) => axis.id !== X_PROBE);
  const categories = realAxes.filter((axis) => axis.type === "category");
  if (!categories.length) unavailable("requires an actual x category axis.");
  const endpoint =
    categories.some((axis) => axis.boundaryGap === false) && plan.categories.length > 1;
  // Keep complete endpoint cells on the surface even for future boundaryGap:false options.
  const endpointGuard = endpoint ? plan.width / (2 * plan.categories.length) : 0;
  const topNameClearance = categories.reduce(
    (space, axis) =>
      axis.position === "top" && axis.show !== false && axis.name
        ? Math.max(
            space,
            pixels(axis.nameGap, plan.height, 32) +
              pixels(axis.nameTextStyle?.fontSize, plan.height, 12),
          )
        : space,
    0,
  );
  const grid = {
    ...option.grid,
    left: pixels(option.grid.left, plan.width, 48) + plan.labelGutter + endpointGuard,
    right: pixels(option.grid.right, plan.width, 22) + endpointGuard,
    top: pixels(option.grid.top, plan.height, 45) + topNameClearance,
    bottom: pixels(option.grid.bottom, plan.height, 35) + plan.tableHeight + plan.gap,
  };
  if (
    plan.width - grid.left - grid.right < CHART_DATA_TABLE_LIMITS.plotWidth ||
    plan.height - grid.top - grid.bottom < CHART_DATA_TABLE_LIMITS.plotHeight
  )
    unavailable("reserved title, legend, axis and table strips leave less than a 96×96px plot.");
  const yAxes = option.yAxis ? (Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]) : [];
  // ECharts considers hidden opposing value axes for automatic real axis lines/ticks.
  // Preserve the pre-probe effective visibility, without changing explicit choices.
  const opposingValue = realAxes.some((axis) => axis.type === "value" || axis.type === "log");
  const realValueAxis = (axis: ValueAxis): ValueAxis =>
    axis.type !== "value"
      ? { ...axis }
      : {
          ...axis,
          axisLine: {
            ...axis.axisLine,
            ...(axis.axisLine?.show === undefined || axis.axisLine.show === "auto"
              ? { show: opposingValue }
              : {}),
          },
          axisTick: {
            ...axis.axisTick,
            ...(axis.axisTick?.show === undefined || axis.axisTick.show === "auto"
              ? { show: opposingValue }
              : {}),
          },
        };
  return {
    ...option,
    grid,
    xAxis: [
      ...realAxes.map((axis) =>
        axis.type === "category"
          ? {
              ...axis,
              axisLabel: { ...axis.axisLabel, show: false },
            }
          : { ...axis },
      ),
      probe(X_PROBE),
    ],
    yAxis: [
      ...yAxes.filter((axis) => axis.id !== Y_PROBE).map(realValueAxis),
      probe(Y_PROBE) as ValueAxis,
    ],
  };
}

function clear(instance: EChartsType) {
  const components = instance.getOption().graphic as
    | Array<{ elements?: Array<{ id?: string; parentId?: string }> }>
    | undefined;
  const entries = components?.flatMap((component) => component.elements ?? []) ?? [];
  if (!entries.some((entry) => entry.id === CHART_DATA_TABLE_GRAPHIC_ID)) return;
  // Remove children first. Native group removal also destroys their engine elements;
  // leaving their option records behind makes later public remove calls unsafe.
  const ids = entries
    .filter((entry) => entry.parentId === CHART_DATA_TABLE_GRAPHIC_ID)
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string")
    .reverse();
  // Native element updates follow old option order, regardless of the input order.
  // Two calls prevent the old parent from recursively removing children first.
  if (ids.length)
    instance.setOption(
      { graphic: { elements: ids.map((id) => ({ id, $action: "remove" as const })) } },
      { lazyUpdate: false, silent: true },
    );
  instance.setOption(
    { graphic: { elements: [{ id: CHART_DATA_TABLE_GRAPHIC_ID, $action: "remove" }] } },
    { lazyUpdate: false, silent: true },
  );
}

function scalar(instance: EChartsType, axis: "x" | "y", index: number, value: number): number {
  const pixel = instance.convertToPixel(
    axis === "x" ? { xAxisIndex: index } : { yAxisIndex: index },
    value,
  );
  if (typeof pixel !== "number" || !Number.isFinite(pixel))
    unavailable("native category coordinates are unavailable.");
  return pixel;
}
function tableTextPlan(label: TableText, text: string): ChartTextPlan {
  return createChartTextPlan(
    text,
    label.fontFormat ?? { fontFamily: label.fontFamily },
    undefined,
    label.fontFamily,
  );
}
function ellipsized(
  label: TableText,
  width: number,
  measurement: MeasurementSession,
): ChartTextPlan {
  if (label.width <= width) return tableTextPlan(label, label.text);
  if (measureChartText(tableTextPlan(label, "…"), measurement.measure) > width)
    unavailable("label gutter is too narrow for readable text.");
  return truncateChartText(
    label.text,
    width,
    (text) => tableTextPlan(label, text),
    measurement.measure,
  );
}

/** Pass 2: public native geometry and visuals, shared unchanged by screen SVG and print Canvas. */
export function applyChartDataTableGraphics(
  instance: EChartsType,
  plan: ChartDataTablePlan | undefined,
): void {
  if (!plan) {
    clear(instance);
    return;
  }
  let measurement: MeasurementSession | undefined;
  try {
    const option = instance.getOption();
    const xAxes = option.xAxis as CategoryAxis[] | undefined;
    const yAxes = option.yAxis as ValueAxis[] | undefined;
    const xProbe = xAxes?.findIndex((axis) => axis.id === X_PROBE) ?? -1;
    const yProbe = yAxes?.findIndex((axis) => axis.id === Y_PROBE) ?? -1;
    const categoryAxes =
      xAxes?.flatMap((axis, index) => (axis.type === "category" ? [index] : [])) ?? [];
    if (xProbe < 0 || yProbe < 0 || !categoryAxes.length)
      unavailable("native reservation probes are missing.");
    const start = scalar(instance, "x", xProbe, 1),
      end = scalar(instance, "x", xProbe, 2);
    const left = Math.min(start, end),
      right = Math.max(start, end);
    const yStart = scalar(instance, "y", yProbe, 1),
      yEnd = scalar(instance, "y", yProbe, 2);
    if (
      right - left < CHART_DATA_TABLE_LIMITS.plotWidth ||
      Math.abs(yEnd - yStart) < CHART_DATA_TABLE_LIMITS.plotHeight
    )
      unavailable("native axis labels leave less than a readable 96×96px plot.");
    const display = plan.categories
      .map((category) => ({
        ...category,
        center: scalar(instance, "x", categoryAxes[0]!, category.sourceOrdinal),
      }))
      .sort((a, b) => a.center - b.center);
    for (const category of display) {
      if (category.center < left - 0.5 || category.center > right + 0.5)
        unavailable("native category center lies outside the reserved plot.");
      for (const axis of categoryAxes.slice(1))
        if (Math.abs(scalar(instance, "x", axis, category.sourceOrdinal) - category.center) > 0.5)
          unavailable("primary and secondary category axes are misaligned.");
    }
    const endpoint = xAxes![categoryAxes[0]!]!.boundaryGap === false && display.length > 1;
    const edges = [
      endpoint ? display[0]!.center - (display[1]!.center - display[0]!.center) / 2 : left,
    ];
    for (let index = 1; index < display.length; index++) {
      if (display[index]!.center - display[index - 1]!.center <= 0.5)
        unavailable("native categories overlap or have duplicate coordinates.");
      edges.push((display[index - 1]!.center + display[index]!.center) / 2);
    }
    edges.push(
      endpoint
        ? display.at(-1)!.center + (display.at(-1)!.center - display.at(-2)!.center) / 2
        : right,
    );
    const grid = (option.grid as Array<{ bottom?: unknown }> | undefined)?.[0];
    const top = plan.height - pixels(grid?.bottom, plan.height, 35) + plan.gap;
    const tableLeft = edges[0]! - plan.labelGutter;
    if (
      tableLeft < MARGIN - 0.5 ||
      edges.at(-1)! > plan.width - MARGIN + 0.5 ||
      top < Math.max(yStart, yEnd) - 0.5 ||
      top + plan.tableHeight > plan.height - MARGIN + 0.5
    )
      unavailable("complete native table does not fit the reserved chart strip.");
    for (let index = 0; index < display.length; index++) {
      const width = edges[index + 1]! - edges[index]!;
      if (width < CHART_DATA_TABLE_LIMITS.columnWidth - 0.5)
        unavailable("native columns are below the 48px readable budget.");
      for (const row of plan.rows)
        if (row.cells[display[index]!.sourceOrdinal]!.label.width + PAD * 2 > width)
          unavailable(
            "formatted numeric text does not fit its native column; numbers are never truncated.",
          );
    }
    const paints =
      plan.mode === "withLegendKeys"
        ? plan.rows.map((row) => {
            const color = instance.getVisual({ seriesIndex: row.seriesIndex }, "color");
            if (typeof color !== "string" || !color)
              unavailable("native series key paint is unavailable.");
            return color;
          })
        : [];
    measurement = createMeasurementSession(plan.document);
    const children: GraphicElement[] = [
      {
        type: "rect",
        silent: true,
        shape: { x: tableLeft, y: top, width: edges.at(-1)! - tableLeft, height: plan.tableHeight },
        style: { fill: plan.backgroundColor },
      },
    ];
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      children.push({
        type: "line",
        silent: true,
        shape: { x1, y1, x2, y2 },
        style: { stroke: plan.gridColor, lineWidth: 1 },
      });
    for (const x of [tableLeft, ...edges]) line(x, top, x, top + plan.tableHeight);
    for (let row = 0; row <= plan.rows.length + 1; row++)
      line(tableLeft, top + row * plan.rowHeight, edges.at(-1)!, top + row * plan.rowHeight);
    const run = (
      label: TableText,
      x: number,
      y: number,
      width: number,
      align: "left" | "center",
      numeric = false,
    ) => {
      if (!label.text) return;
      const textPlan = numeric
        ? tableTextPlan(label, label.text)
        : ellipsized(label, width, measurement!);
      children.push({
        type: "text",
        silent: true,
        style: {
          text: label.rich ? chartRichText(textPlan) : textPlan.text,
          ...(label.rich ? { rich: label.rich } : {}),
          x,
          y,
          fontFamily: label.fontFamily,
          fontSize: plan.fontSize,
          fill: label.color ?? plan.textColor,
          align,
          verticalAlign: "middle",
        },
      });
    };
    display.forEach((category, index) =>
      run(
        category.label,
        category.center,
        top + plan.rowHeight / 2,
        edges[index + 1]! - edges[index]! - PAD * 2,
        "center",
      ),
    );
    plan.rows.forEach((row, rowIndex) => {
      const y = top + (rowIndex + 1.5) * plan.rowHeight;
      const keyWidth = plan.mode === "withLegendKeys" ? 16 : 0;
      if (keyWidth)
        if (row.key === "column")
          children.push({
            type: "rect",
            silent: true,
            shape: { x: tableLeft + PAD, y: y - 5, width: 10, height: 10 },
            style: { fill: paints[rowIndex] },
          });
        else {
          children.push({
            type: "line",
            silent: true,
            shape: { x1: tableLeft + PAD, y1: y, x2: tableLeft + PAD + 10, y2: y },
            style: { stroke: paints[rowIndex], lineWidth: row.strokeWidth },
          });
          if (row.key === "markerLine")
            children.push({
              type: "circle",
              silent: true,
              shape: { cx: tableLeft + PAD + 5, cy: y, r: 3 },
              style: { fill: paints[rowIndex] },
            });
        }
      run(row.label, tableLeft + PAD + keyWidth, y, plan.labelGutter - PAD * 2 - keyWidth, "left");
      display.forEach((category, index) =>
        run(
          row.cells[category.sourceOrdinal]!.label,
          category.center,
          y,
          edges[index + 1]! - edges[index]! - PAD * 2,
          "center",
          true,
        ),
      );
    });
    if (children.length + 1 > CHART_DATA_TABLE_LIMITS.primitives)
      unavailable("exceeds the 1024-primitive budget.");
    clear(instance);
    instance.setOption(
      {
        graphic: {
          elements: [
            {
              id: CHART_DATA_TABLE_GRAPHIC_ID,
              type: "group",
              $action: "replace",
              silent: true,
              z: 100,
              children: children.map((child, index) => ({
                ...child,
                id: `${CHART_DATA_TABLE_GRAPHIC_ID}:primitive:${index}`,
              })),
            },
          ],
        },
      },
      { lazyUpdate: false, silent: true },
    );
  } catch (error) {
    clear(instance);
    throw error;
  } finally {
    measurement?.dispose();
  }
}
