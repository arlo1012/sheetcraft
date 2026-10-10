import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";

export function nativeColumnFixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.name = "Data";
  [
    ["region", "apple", "pear"],
    ["east", 60, 70],
    ["north", 100, 80],
    ["south", 120, 90],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value: value! }),
    ),
  );
  const drawing = normalizeSheetDrawing({
    id: "column-chart",
    name: "Sales",
    kind: "chart",
    anchor: { row: 6, column: 3 },
    offsetX: 8,
    offsetY: 8,
    width: 480,
    height: 300,
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
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  }) as SheetChartDrawing;
  sheet.drawings = [drawing];
  return { workbook, sheet, drawing };
}
