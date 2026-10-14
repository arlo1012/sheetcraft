import type { ChartSeriesSource } from "../../chart-source.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { elementDrawing } from "./chart-elements-fixture.js";

export const vectorRange = (column: number, start = 1, end = 3) => ({
  start: { row: start, column },
  end: { row: end, column },
});
export function seriesSource(sheetId = "source"): ChartSeriesSource {
  return {
    kind: "series",
    categories: { kind: "range", sheetId, range: vectorRange(0) },
    series: [
      {
        id: "apple",
        colorIndex: 4,
        name: { kind: "cell", sheetId, cell: { row: 0, column: 1 } },
        values: { kind: "range", sheetId, range: vectorRange(1) },
      },
      {
        id: "pear",
        colorIndex: 8,
        name: { kind: "cell", sheetId, cell: { row: 0, column: 2 } },
        values: { kind: "range", sheetId, range: vectorRange(2) },
      },
    ],
  };
}
export function sourceDrawing(sheetId = "source"): SheetChartDrawing {
  return {
    ...elementDrawing({ legendPosition: "left", legendOverlay: false }),
    anchor: { row: 10, column: 10 },
    chart: {
      ...elementDrawing({ legendPosition: "left", legendOverlay: false }).chart,
      range: null,
      source: seriesSource(sheetId),
    },
  };
}
