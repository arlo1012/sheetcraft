import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  decodeXlsx,
  encodeXlsx,
  type XlsxCompatibilityReport,
} from "../../packages/xlsx-io/dist/index.js";

const [mode, firstPath, secondPath] = process.argv.slice(2);
if (
  !firstPath ||
  !["seed", "product", "roundtrip"].includes(mode!) ||
  (mode === "roundtrip" ? !secondPath : secondPath !== undefined)
)
  throw new Error(
    "Usage: bun scripts/compatibility/create-native-column-chart.mts seed|product output.xlsx OR roundtrip input.xlsx output.xlsx",
  );
const output = resolve(mode === "roundtrip" ? secondPath! : firstPath);
let workbook: Workbook;
let importReport: XlsxCompatibilityReport | undefined;
if (mode === "roundtrip") {
  if (resolve(firstPath) === output)
    throw new Error("Choose a distinct output to preserve producer evidence.");
  const decoded = await decodeXlsx(new Uint8Array(await readFile(resolve(firstPath))));
  workbook = decoded.workbook;
  importReport = decoded.report;
  const sheet = [...workbook.sheets.values()].find((candidate) =>
    candidate.drawings?.some(
      (drawing) =>
        drawing.kind === "chart" &&
        drawing.chart.pivotTableId === undefined &&
        drawing.chart.dataCache === undefined,
    ),
  );
  if (!sheet) throw new Error("No supported live ordinary chart was imported.");
  workbook.activeSheetId = sheet.id;
} else {
  workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
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
  if (mode === "product")
    sheet.drawings = [
      normalizeSheetDrawing({
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
      }),
    ];
}
const encoded = await encodeXlsx(workbook, { filename: basename(output) });
await writeFile(output, encoded.bytes, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      mode,
      bytes: encoded.bytes.length,
      import: importReport,
      export: encoded.report,
      charts: [...workbook.sheets.values()].flatMap((sheet) =>
        (sheet.drawings ?? []).flatMap((drawing) =>
          drawing.kind === "chart"
            ? [
                {
                  sheet: sheet.name,
                  chart: drawing.chart,
                  data: getSheetChartData(
                    sheet,
                    drawing.chart,
                    createWorkbookEvaluator(workbook, sheet.id),
                  ),
                },
              ]
            : [],
        ),
      ),
    },
    null,
    2,
  ),
);
