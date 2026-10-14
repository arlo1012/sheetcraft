import type { ChartPresentationSettings } from "../../chart-presentation.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { elementDrawing } from "./chart-elements-fixture.js";

export function chartPresentation(): ChartPresentationSettings {
  return {
    percentStacked: true,
    lineMarkers: false,
    palette: ["#123456", "#abc"],
    background: "#fefefe",
  };
}

export function presentationDrawing(presentation?: ChartPresentationSettings): SheetChartDrawing {
  const drawing = elementDrawing();
  return {
    ...drawing,
    chart: {
      ...drawing.chart,
      type: "line",
      stacked: true,
      ...(presentation !== undefined ? { presentation } : {}),
    },
  };
}
