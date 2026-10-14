import type { ChartFormatSettings } from "../../chart-format.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { elementDrawing } from "./chart-elements-fixture.js";

export function chartFormat(): ChartFormatSettings {
  return {
    title: { fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: false },
    plot: { fill: "transparent", stroke: "#654321", strokeWidth: 2 },
    categoryAxis: {
      show: true,
      reverse: true,
      labelAngle: -45,
      title: "Region",
      text: { fontSize: 11, italic: true },
      line: { stroke: "transparent", strokeWidth: 0 },
    },
    valueAxis: {
      show: true,
      min: 20,
      max: 180,
      majorUnit: 40,
      minorUnit: 8,
      reverse: false,
      title: "Sales",
      text: { fontFamily: "Arial", color: "#111111" },
      line: { stroke: "#222222", strokeWidth: 1 },
      numberFormat: { kind: "number", fractionDigits: 1, useGrouping: true },
      linkedToSource: false,
    },
    secondaryValueAxis: { show: false, min: 0, max: 140, majorUnit: 20, minorUnit: 4 },
    bar: { gapWidth: 50, overlap: 50 },
    series: [
      {
        id: "apple",
        axis: "secondary",
        color: "#112233",
        strokeWidth: 2,
        smooth: true,
        markers: false,
      },
      { id: "dormant", axis: "primary", color: "#445566" },
    ],
  };
}
export function formatDrawing(format?: ChartFormatSettings): SheetChartDrawing {
  const drawing = elementDrawing();
  return { ...drawing, chart: { ...drawing.chart, ...(format !== undefined ? { format } : {}) } };
}
