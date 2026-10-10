import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import {
  createWorkbook,
  createSheet,
  insertSheet,
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
  ![
    "seed",
    "product",
    "options",
    "options-blanks",
    "line-product",
    "line-options",
    "bar-product",
    "bar-options",
    "roundtrip",
  ].includes(mode!) ||
  (mode === "roundtrip" ? !secondPath : secondPath !== undefined)
)
  throw new Error(
    "Usage: bun scripts/compatibility/create-native-column-chart.mts seed|product|options|options-blanks|line-product|line-options|bar-product|bar-options output.xlsx OR roundtrip input.xlsx output.xlsx",
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
  const idFactory = createSequentialIdFactory();
  workbook = createWorkbook({ idFactory });
  const matrix = mode.startsWith("options") || mode === "line-options" || mode === "bar-options";
  const line = mode.startsWith("line-");
  const bar = mode.startsWith("bar-");
  const options = matrix
    ? (["columns", "rows"] as const).flatMap((seriesBy) =>
        [true, false].flatMap((headerRow) =>
          [true, false].map((headerColumn) => ({ seriesBy, headerRow, headerColumn })),
        ),
      )
    : [{ seriesBy: "columns" as const, headerRow: true, headerColumn: true }];
  for (const [index, option] of options.entries()) {
    const optionName = matrix
      ? `${option.seriesBy === "columns" ? "C" : "R"}-${Number(option.headerRow)}${Number(option.headerColumn)}`
      : "Sales";
    const sheet =
      index === 0 ? getActiveSheet(workbook) : createSheet(optionName, undefined, idFactory);
    sheet.name = matrix ? optionName : "Data";
    if (index > 0) insertSheet(workbook, sheet);
    [
      ["region", mode === "options-blanks" ? "" : "apple", "pear"],
      [mode === "options-blanks" ? "" : "east", 60, 70],
      ["north", 100, mode === "options-blanks" || line || bar ? null : 80],
      ["south", 120, 90],
    ].forEach((row, r) =>
      row.forEach((initialValue, column) => {
        const resolved =
          (mode === "line-options" || mode === "bar-options") &&
          !(option.headerRow && r === 0) &&
          !(option.headerColumn && column === 0)
            ? r === 2 && column === 2
              ? null
              : r * 10 + column
            : initialValue;
        setCellContent(
          sheet,
          { row: r, column },
          resolved === null ? null : { kind: "literal", value: resolved! },
        );
      }),
    );
    if (mode !== "seed")
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
            type: line ? "line" : bar ? "bar" : "column",
            range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
            title: optionName,
            headerRow: option.headerRow,
            headerColumn: option.headerColumn,
            seriesBy: option.seriesBy,
            legend: true,
            labels: false,
            stacked: false,
            showHidden: false,
          },
        }),
      ];
  }
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
