import type { ChartFormatSettings } from "../../chart-format.js";
import type { ChartElementSettings } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { elementDrawing } from "./chart-elements-fixture.js";

export function chartLayoutElements(): ChartElementSettings {
  return {
    titlePosition: "above",
    legendPosition: "right",
    legendOverlay: false,
    labelPosition: "outsideEnd",
    dataTable: "withLegendKeys",
    labelContent: "seriesAndValue",
    labelScope: "lastCategory",
  };
}
export function chartLayoutFormat(): ChartFormatSettings {
  return {
    categoryAxis: { title: "My regions", titleVisible: false },
    valueAxis: {
      majorGridlines: true,
      minorGridlines: false,
      title: "My sales",
      titleVisible: true,
    },
    secondaryValueAxis: {
      majorGridlines: false,
      minorGridlines: true,
      title: "My units",
      titleVisible: false,
    },
  };
}
export function layoutDrawing(): SheetChartDrawing {
  const drawing = elementDrawing(chartLayoutElements());
  return { ...drawing, chart: { ...drawing.chart, format: chartLayoutFormat() } };
}
