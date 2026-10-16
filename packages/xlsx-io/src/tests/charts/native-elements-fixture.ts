import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartElementSettings } from "@sheetcraft/core/sheet-charts";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";

/** One workbook for actual Excel Online / WPS Online / WPS Desktop inspection. */
export function nativeElementsFixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const cases: Array<{
    sheet: string;
    type: "column" | "bar" | "line";
    title: string;
    legend: boolean;
    labels: boolean;
    elements?: ChartElementSettings;
  }> = [];
  const positions = ["top", "bottom", "left", "right", "topRight"] as const;
  const labelPositions = ["center", "insideEnd", "insideBase", "outsideEnd"] as const;
  for (const type of ["column", "bar", "line"] as const) {
    for (const [index, legendPosition] of positions.entries()) {
      const sheet = `${type}-${legendPosition}`;
      const overlay = index % 2 === 0;
      cases.push({
        sheet,
        type,
        title: sheet,
        legend: true,
        labels: type !== "line",
        elements: {
          titlePosition: overlay ? "overlay" : "above",
          legendPosition,
          legendOverlay: overlay,
          ...(type !== "line" ? { labelPosition: labelPositions[index % 4]! } : {}),
          dataTable: "none",
          labelContent: "value",
          labelScope: "all",
        },
      });
    }
  }
  cases.push(
    {
      sheet: "default-bottom",
      type: "column",
      title: "Default bottom legend",
      legend: true,
      labels: false,
    },
    {
      sheet: "no-title-or-legend",
      type: "column",
      title: "",
      legend: false,
      labels: true,
      elements: { titlePosition: "none", labelPosition: "outsideEnd" },
    },
  );
  for (const [index, testCase] of cases.entries()) {
    const sheet =
      index === 0 ? getActiveSheet(workbook) : createSheet(testCase.sheet, undefined, idFactory);
    sheet.name = testCase.sheet;
    if (index > 0) insertSheet(workbook, sheet);
    [
      ["Region", "Apples", "Pears"],
      ["East", 60, 70],
      ["North", -100, 80],
      ["South", 0, null],
    ].forEach((row, r) =>
      row.forEach((value, column) => {
        setCellContent(
          sheet,
          { row: r, column },
          value === null ? null : { kind: "literal", value: value! },
        );
      }),
    );
    sheet.drawings = [
      normalizeSheetDrawing({
        id: `elements-${index}`,
        name: testCase.sheet,
        kind: "chart",
        anchor: { row: 5, column: 0 },
        offsetX: 8,
        offsetY: 8,
        width: 640,
        height: 380,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#d1d5db",
        strokeWidth: 1,
        color: "#111827",
        fontSize: 14,
        bold: false,
        italic: false,
        rotation: 0,
        chart: {
          type: testCase.type,
          range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
          title: testCase.title,
          legend: testCase.legend,
          labels: testCase.labels,
          headerRow: true,
          headerColumn: true,
          seriesBy: "columns",
          stacked: false,
          showHidden: false,
          ...(testCase.elements ? { elements: testCase.elements } : {}),
        },
      }),
    ];
  }
  return { workbook, cases };
}
