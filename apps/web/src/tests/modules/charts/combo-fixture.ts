import {
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
export function comboChart(): SheetChart {
  return normalizeSheetChart({
    type: "combo",
    range: null,
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    source: {
      kind: "series",
      categories: { kind: "generated" },
      series: [
        {
          id: "apple",
          colorIndex: 0,
          name: { kind: "literal", text: "apple" },
          values: { kind: "literal", values: [60, 100, 120] },
        },
        {
          id: "pear",
          colorIndex: 1,
          name: { kind: "literal", text: "pear" },
          values: { kind: "literal", values: [7, 8, 9] },
        },
      ],
    },
    format: {
      series: [
        {
          id: "pear",
          drawType: "line",
          axis: "secondary",
          markers: false,
          color: "#a1b2c3",
          strokeWidth: 5,
          smooth: true,
        },
      ],
    },
  });
}
export const comboData: ChartData = {
  categories: ["east", "north", "south"],
  records: [],
  series: [
    { id: "apple", colorIndex: 0, name: "apple", values: [60, 100, 120] },
    { id: "pear", colorIndex: 1, name: "pear", values: [7, 8, 9] },
  ],
};
