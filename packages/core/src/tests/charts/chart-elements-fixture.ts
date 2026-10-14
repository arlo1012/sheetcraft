import type { ChartElementSettings, SheetChart } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";

export function elementChart(elements?: ChartElementSettings): SheetChart {
  return {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: true,
    stacked: false,
    showHidden: false,
    ...(elements !== undefined ? { elements } : {}),
  };
}

export function elementDrawing(elements?: ChartElementSettings): SheetChartDrawing {
  return {
    id: "chart",
    kind: "chart",
    name: "Sales",
    anchor: { row: 5, column: 4 },
    offsetX: 0,
    offsetY: 0,
    width: 400,
    height: 240,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: elementChart(elements),
  };
}
