import {
  normalizeSheetChart,
  type ChartType,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";

export type CommonChartType = "column" | "bar" | "line" | "area";
export type ChartVariant =
  | "standard"
  | "stacked"
  | "percentStacked"
  | "standardMarkers"
  | "stackedMarkers"
  | "percentStackedMarkers";
export type ChartStyleId =
  | "colorful"
  | "office"
  | "forest"
  | "warm"
  | "cool"
  | "monochrome"
  | "dark"
  | "minimal";
export type ChartDesignIntent =
  | { kind: "variant"; variant: ChartVariant }
  | { kind: "style"; style: ChartStyleId };
export type ChartInsertIntent =
  | ChartType
  | "dashboard"
  | { type: CommonChartType; variant: ChartVariant };

const variants: readonly ChartVariant[] = [
  "standard",
  "stacked",
  "percentStacked",
  "standardMarkers",
  "stackedMarkers",
  "percentStackedMarkers",
];
const chartTypes: readonly (ChartType | "dashboard")[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
  "dashboard",
];
export function isCommonChartType(type: ChartType): type is CommonChartType {
  return type === "column" || type === "bar" || type === "line" || type === "area";
}
function dataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart design requires ordinary data.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Chart design requires ordinary data.");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Chart design requires known own data fields.");
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key))
      throw new TypeError("Chart design requires complete own data.");
  return result;
}
function normalizeVariant(value: unknown, type: ChartType): ChartVariant {
  if (!isCommonChartType(type) || !variants.includes(value as ChartVariant))
    throw new RangeError("Unknown common chart variant.");
  const variant = value as ChartVariant;
  if (variant.endsWith("Markers") && type !== "line")
    throw new RangeError("Marker variants require a line chart.");
  return variant;
}
export function normalizeChartInsertIntent(value: unknown): ChartInsertIntent {
  if (typeof value === "string") {
    if (!chartTypes.includes(value as ChartType | "dashboard"))
      throw new RangeError("Unknown chart insertion type.");
    return value as ChartType | "dashboard";
  }
  const data = dataRecord(value, ["type", "variant"]);
  if (typeof data.type !== "string" || !isCommonChartType(data.type as ChartType))
    throw new RangeError("Variant insertion requires a common chart type.");
  const type = data.type as CommonChartType;
  return { type, variant: normalizeVariant(data.variant, type) };
}
/** Existing line charts retain their marker-on default until an explicit choice. */
export function getChartVariant(chart: SheetChart): ChartVariant | undefined {
  if (!isCommonChartType(chart.type)) return undefined;
  const base =
    chart.presentation?.percentStacked === true
      ? "percentStacked"
      : chart.stacked
        ? "stacked"
        : "standard";
  if (chart.type === "line") {
    const baseline = chart.presentation?.lineMarkers !== false;
    const effective = (chart.source?.series ?? []).map(
      (series) =>
        chart.format?.series?.find((format) => format.id === series.id)?.markers ?? baseline,
    );
    if (effective.some((markers) => markers !== effective[0])) return undefined;
    if (effective[0] ?? baseline) return `${base}Markers` as ChartVariant;
  }
  return base;
}
/** Type changes retire only inapplicable variant fields; appearance stays intact. */
export function changeChartType(chart: SheetChart, type: ChartType): SheetChart {
  if (!chartTypes.includes(type)) throw new RangeError("Unknown chart type.");
  const next = normalizeSheetChart(chart);
  next.type = type;
  if (next.presentation) {
    if (!isCommonChartType(type)) delete next.presentation.percentStacked;
    if (type !== "line") delete next.presentation.lineMarkers;
    if (!Object.keys(next.presentation).length) delete next.presentation;
  }
  return normalizeSheetChart(next);
}

export type ChartStyleRecipe = {
  palette: readonly string[];
  background: string;
  text: string;
  axis: string;
  plotFill: string;
  plotStroke: string;
  titleSize: number;
  titleBold: boolean;
  axisSize: number;
  axisWidth: number;
  plotWidth: number;
};
/** Sheetcraft-owned appearance recipes. These IDs are never stored in a workbook. */
const recipes: Record<ChartStyleId, ChartStyleRecipe> = {
  colorful: {
    palette: ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#9a60b4"],
    background: "#ffffff",
    text: "#333333",
    axis: "#7b8491",
    plotFill: "#ffffff",
    plotStroke: "#e5e7eb",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 0,
  },
  office: {
    palette: ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"],
    background: "#ffffff",
    text: "#404040",
    axis: "#a6a6a6",
    plotFill: "#ffffff",
    plotStroke: "#d9d9d9",
    titleSize: 18,
    titleBold: false,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 1,
  },
  forest: {
    palette: ["#28664d", "#57966c", "#8ab17d", "#b9cd94", "#668c75", "#a5b89c"],
    background: "#f6faf5",
    text: "#254d38",
    axis: "#90aa91",
    plotFill: "#f6faf5",
    plotStroke: "#dbe7d9",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 0,
  },
  warm: {
    palette: ["#c85a34", "#e18b49", "#efb763", "#a95155", "#c9897c", "#d9a076"],
    background: "#fff8f0",
    text: "#6a3b2b",
    axis: "#bb9b82",
    plotFill: "#fff8f0",
    plotStroke: "#eedbc7",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 0,
  },
  cool: {
    palette: ["#277da1", "#43a6b5", "#577cb0", "#7dbbc3", "#8c9fcc", "#a6d7dc"],
    background: "#f4f9fc",
    text: "#294b63",
    axis: "#91a8b9",
    plotFill: "#f4f9fc",
    plotStroke: "#d7e5ef",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 0,
  },
  monochrome: {
    palette: ["#333333", "#565656", "#787878", "#969696", "#b2b2b2", "#c8c8c8"],
    background: "#ffffff",
    text: "#333333",
    axis: "#777777",
    plotFill: "#ffffff",
    plotStroke: "#cccccc",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 1,
  },
  dark: {
    palette: ["#73a7ff", "#95d5a2", "#ffd375", "#ff9393", "#7bd6e8", "#c8a1ef"],
    background: "#202936",
    text: "#e8eef7",
    axis: "#8f9eb2",
    plotFill: "#202936",
    plotStroke: "#40516a",
    titleSize: 18,
    titleBold: true,
    axisSize: 12,
    axisWidth: 1,
    plotWidth: 0,
  },
  minimal: {
    palette: ["#526d82", "#7b9aab", "#a1b8c6", "#bcb5a1", "#8b9d91", "#b3bec7"],
    background: "#ffffff",
    text: "#44515c",
    axis: "#c4cbd1",
    plotFill: "#ffffff",
    plotStroke: "#ffffff",
    titleSize: 16,
    titleBold: false,
    axisSize: 12,
    axisWidth: 0,
    plotWidth: 0,
  },
};
export function getChartStyleRecipe(style: ChartStyleId): ChartStyleRecipe {
  if (!Object.hasOwn(recipes, style)) throw new RangeError("Unknown chart style.");
  const recipe = recipes[style];
  return { ...recipe, palette: [...recipe.palette] };
}
function clearDefinedSeriesField(chart: SheetChart, field: "color" | "markers"): void {
  const active = new Set(chart.source?.series.map((entry) => entry.id) ?? []);
  for (const series of chart.format?.series ?? []) if (active.has(series.id)) delete series[field];
}
function applyRecipe(chart: SheetChart, recipe: ChartStyleRecipe): void {
  chart.presentation = {
    ...chart.presentation,
    palette: [...recipe.palette],
    background: recipe.background,
  };
  const format = chart.format ?? {};
  format.title = {
    ...format.title,
    color: recipe.text,
    fontSize: recipe.titleSize,
    bold: recipe.titleBold,
    italic: false,
  };
  format.plot = { fill: recipe.plotFill, stroke: recipe.plotStroke, strokeWidth: recipe.plotWidth };
  for (const key of ["categoryAxis", "valueAxis", "secondaryValueAxis"] as const)
    format[key] = {
      ...format[key],
      text: {
        ...format[key]?.text,
        color: recipe.text,
        fontSize: recipe.axisSize,
        bold: false,
        italic: false,
      },
      line: { stroke: recipe.axis, strokeWidth: recipe.axisWidth },
    };
  chart.format = format;
  clearDefinedSeriesField(chart, "color");
}
/** Strict detached design edit, preserving chart data, identity and unrelated format. */
export function applyChartDesignIntent(chart: SheetChart, intent: ChartDesignIntent): SheetChart {
  // Read the discriminant descriptor before consuming any caller-owned fields.
  if (!intent || typeof intent !== "object") throw new TypeError("Invalid chart design intent.");
  const kind = Object.getOwnPropertyDescriptor(intent, "kind");
  if (!kind || !("value" in kind)) throw new TypeError("Chart design requires an own kind.");
  const data = dataRecord(
    intent,
    kind.value === "variant" ? ["kind", "variant"] : ["kind", "style"],
  );
  const next = normalizeSheetChart(chart);
  if (data.kind === "variant") {
    const variant = normalizeVariant(data.variant, next.type);
    next.stacked = variant !== "standard" && variant !== "standardMarkers";
    const presentation = { ...next.presentation };
    if (variant === "percentStacked" || variant === "percentStackedMarkers")
      presentation.percentStacked = true;
    else delete presentation.percentStacked;
    if (next.type === "line") {
      presentation.lineMarkers = variant.endsWith("Markers");
      clearDefinedSeriesField(next, "markers");
    } else delete presentation.lineMarkers;
    if (Object.keys(presentation).length) next.presentation = presentation;
    else delete next.presentation;
  } else if (data.kind === "style") {
    if (typeof data.style !== "string" || !Object.hasOwn(recipes, data.style))
      throw new RangeError("Unknown chart style.");
    applyRecipe(next, getChartStyleRecipe(data.style as ChartStyleId));
  } else throw new TypeError("Unknown chart design intent.");
  return normalizeSheetChart(next);
}
/** Selection reflects saved appearance, including explicit active-series overrides. */
export function matchesChartStyle(chart: SheetChart, style: ChartStyleId): boolean {
  const recipe = getChartStyleRecipe(style),
    presentation = chart.presentation,
    format = chart.format;
  if (
    !presentation ||
    presentation.background !== recipe.background ||
    presentation.palette?.length !== recipe.palette.length ||
    presentation.palette.some((color, index) => color !== recipe.palette[index])
  )
    return false;
  if (
    !format ||
    format.title?.color !== recipe.text ||
    format.title.fontSize !== recipe.titleSize ||
    format.title.bold !== recipe.titleBold ||
    format.title.italic !== false ||
    format.plot?.fill !== recipe.plotFill ||
    format.plot.stroke !== recipe.plotStroke ||
    format.plot.strokeWidth !== recipe.plotWidth
  )
    return false;
  for (const key of ["categoryAxis", "valueAxis", "secondaryValueAxis"] as const) {
    const axis = format[key];
    if (
      axis?.text?.color !== recipe.text ||
      axis.text.fontSize !== recipe.axisSize ||
      axis.text.bold !== false ||
      axis.text.italic !== false ||
      axis.line?.stroke !== recipe.axis ||
      axis.line.strokeWidth !== recipe.axisWidth
    )
      return false;
  }
  const active = new Set(chart.source?.series.map((entry) => entry.id) ?? []);
  return !(format.series ?? []).some(
    (series) => active.has(series.id) && series.color !== undefined,
  );
}
