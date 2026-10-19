import { initializeChartAxisTitle } from "./chart-format-pane";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";

export type ChartQuickLayoutId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
type LayoutRecipe = {
  title: "above" | "none";
  legend: "none" | "top" | "bottom" | "right";
  labels: "none" | "outside" | "lastCategory" | "inside";
  categoryTitle: boolean;
  valueTitle: boolean;
  valueAxis: boolean;
  grid: "none" | "major" | "majorMinor";
  table: boolean;
  gap: number;
  overlap: number;
};
// These are concrete element patches. No recipe identity is saved in a workbook.
// Exact gap/overlap and minor divisions are Sheetcraft's declared layout math;
// the reference establishes their visible topology, not those hidden values.
const layouts: Record<ChartQuickLayoutId, LayoutRecipe> = {
  1: {
    title: "above",
    legend: "right",
    labels: "none",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: 0,
  },
  2: {
    title: "above",
    legend: "top",
    labels: "outside",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: false,
    grid: "none",
    table: false,
    gap: 150,
    overlap: 0,
  },
  3: {
    title: "above",
    legend: "bottom",
    labels: "none",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: -25,
  },
  4: {
    title: "none",
    legend: "bottom",
    labels: "outside",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: true,
    grid: "none",
    table: false,
    gap: 150,
    overlap: 0,
  },
  5: {
    title: "above",
    legend: "none",
    labels: "none",
    categoryTitle: false,
    valueTitle: true,
    valueAxis: true,
    grid: "major",
    table: true,
    gap: 150,
    overlap: 0,
  },
  6: {
    title: "above",
    legend: "none",
    labels: "lastCategory",
    categoryTitle: false,
    valueTitle: true,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: 0,
  },
  7: {
    title: "none",
    legend: "right",
    labels: "none",
    categoryTitle: true,
    valueTitle: true,
    valueAxis: true,
    grid: "majorMinor",
    table: false,
    gap: 150,
    overlap: 0,
  },
  8: {
    title: "above",
    legend: "none",
    labels: "none",
    categoryTitle: true,
    valueTitle: true,
    valueAxis: true,
    grid: "none",
    table: false,
    gap: 0,
    overlap: 0,
  },
  9: {
    title: "above",
    legend: "right",
    labels: "none",
    categoryTitle: true,
    valueTitle: true,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: 0,
  },
  10: {
    title: "above",
    legend: "right",
    labels: "inside",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: 50,
  },
  11: {
    title: "none",
    legend: "right",
    labels: "none",
    categoryTitle: false,
    valueTitle: false,
    valueAxis: true,
    grid: "major",
    table: false,
    gap: 150,
    overlap: 0,
  },
};

function recipe(id: ChartQuickLayoutId): LayoutRecipe {
  if (!Number.isInteger(id) || !Object.hasOwn(layouts, id))
    throw new RangeError("Unknown chart quick layout.");
  return layouts[id];
}

/** Existing text, source, geometry and appearance survive concrete layout changes. */
export function applyChartQuickLayout(
  chart: SheetChart,
  id: ChartQuickLayoutId,
  axisTitle: string,
): SheetChart {
  if (chart.type !== "column")
    throw new RangeError("Quick layouts currently require a column chart.");
  if (typeof axisTitle !== "string" || !axisTitle.trim() || axisTitle.length > 1000)
    throw new RangeError("Chart axis placeholder must be bounded text.");
  const next = normalizeSheetChart(chart),
    choice = recipe(id);
  next.legend = choice.legend !== "none";
  next.labels = choice.labels !== "none";
  next.elements = {
    ...next.elements,
    titlePosition: choice.title,
    ...(choice.legend !== "none" ? { legendPosition: choice.legend } : {}),
    legendOverlay: false,
    labelPosition: choice.labels === "inside" ? "insideEnd" : "outsideEnd",
    labelContent: choice.labels === "lastCategory" ? "seriesAndValue" : "value",
    labelScope:
      choice.labels === "lastCategory" ? "lastCategory" : id === 10 ? "lastSeries" : "all",
    dataTable: choice.table ? "withLegendKeys" : "none",
  };
  next.format = {
    ...next.format,
    categoryAxis: {
      ...next.format?.categoryAxis,
      ...(choice.categoryTitle && !next.format?.categoryAxis?.title?.trim()
        ? initializeChartAxisTitle(
            next.format?.categoryAxis ?? {},
            next.type,
            "categoryAxis",
            axisTitle,
          )
        : {}),
      titleVisible: choice.categoryTitle,
      show: true,
    },
    valueAxis: {
      ...next.format?.valueAxis,
      ...(choice.valueTitle && !next.format?.valueAxis?.title?.trim()
        ? initializeChartAxisTitle(next.format?.valueAxis ?? {}, next.type, "valueAxis", axisTitle)
        : {}),
      titleVisible: choice.valueTitle,
      show: choice.valueAxis,
      majorGridlines: choice.grid !== "none",
      minorGridlines: choice.grid === "majorMinor",
    },
    bar: { ...next.format?.bar, gapWidth: choice.gap, overlap: choice.overlap },
  };
  return normalizeSheetChart(next);
}

/** Match only fields owned by the layout; source values and user titles are not IDs. */
export function getChartQuickLayout(chart: SheetChart): ChartQuickLayoutId | undefined {
  if (chart.type !== "column") return undefined;
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const) {
    const expected = applyChartQuickLayout(chart, id, "Axis Title");
    if (
      chart.legend === expected.legend &&
      chart.labels === expected.labels &&
      chart.elements?.titlePosition === expected.elements?.titlePosition &&
      (!chart.legend || chart.elements?.legendPosition === expected.elements?.legendPosition) &&
      chart.elements?.legendOverlay === false &&
      (!chart.labels ||
        (chart.elements?.labelPosition === expected.elements?.labelPosition &&
          chart.elements?.labelContent === expected.elements?.labelContent &&
          chart.elements?.labelScope === expected.elements?.labelScope)) &&
      chart.elements?.dataTable === expected.elements?.dataTable &&
      chart.format?.categoryAxis?.show === true &&
      chart.format?.categoryAxis?.titleVisible === expected.format?.categoryAxis?.titleVisible &&
      chart.format?.valueAxis?.show === expected.format?.valueAxis?.show &&
      chart.format?.valueAxis?.titleVisible === expected.format?.valueAxis?.titleVisible &&
      chart.format?.valueAxis?.majorGridlines === expected.format?.valueAxis?.majorGridlines &&
      chart.format?.valueAxis?.minorGridlines === expected.format?.valueAxis?.minorGridlines &&
      chart.format?.bar?.gapWidth === expected.format?.bar?.gapWidth &&
      chart.format?.bar?.overlap === expected.format?.bar?.overlap
    )
      return id;
  }
  return undefined;
}
