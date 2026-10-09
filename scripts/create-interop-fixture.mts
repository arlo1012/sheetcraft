import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setCellNote,
  setColumnWidth,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import { createFormulaError } from "@sheetcraft/core/formula";
import { encodeXlsx } from "../packages/xlsx-io/src/index.ts";

/** Synthetic, non-personal acceptance data only. Never reads a user's workbook. */
const workbook = createWorkbook({
  id: "interop-fixture",
  sheetId: "summary",
  sheetName: "Summary",
});
const sheet = getActiveSheet(workbook);
const value = (row: number, column: number, value: string | number | boolean) =>
  setCellContent(sheet, { row, column }, { kind: "literal", value });
value(0, 0, "Sheetcraft interoperability sample / 兼容性样例");
sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 0, column: 4 } });
setCellStyle(
  sheet,
  { row: 0, column: 0 },
  {
    fontFamily: "Liberation Sans",
    fontSize: 18,
    bold: true,
    fillColor: "#174f3b",
    textColor: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
  },
);
setRowHeight(sheet, 0, 42);
const headers = ["Item / 项目", "Quantity", "Unit price", "Total", "Progress"];
headers.forEach((text, column) => {
  value(2, column, text);
  setCellStyle(
    sheet,
    { row: 2, column },
    { bold: true, fillColor: "#dcecdf", borderBottom: { style: "thin", color: "#174f3b" } },
  );
});
const rows = [
  ["Notebook", 3, 12.5, 0.75],
  ["Pencil", 8, 1.25, 0.5],
  ["Folder", 2, 4.75, 1],
] as const;
rows.forEach(([name, quantity, price, progress], index) => {
  const row = index + 3;
  value(row, 0, name);
  value(row, 1, quantity);
  value(row, 2, price);
  value(row, 4, progress);
  setCellContent(
    sheet,
    { row, column: 3 },
    { kind: "formula", formula: { source: `=B${row + 1}*C${row + 1}` } },
  );
  for (const column of [2, 3])
    setCellStyle(
      sheet,
      { row, column },
      { numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 } },
    );
  setCellStyle(sheet, { row, column: 4 }, { numberFormat: { kind: "percent", fractionDigits: 0 } });
});
value(7, 2, "Grand total");
setCellContent(
  sheet,
  { row: 7, column: 3 },
  { kind: "formula", formula: { source: "=SUM(D4:D6)" } },
);
setCellStyle(
  sheet,
  { row: 7, column: 3 },
  {
    bold: true,
    numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 },
    borderTop: { style: "double", color: "#174f3b" },
  },
);
value(9, 0, "Date serial");
value(9, 1, 46000);
setCellStyle(sheet, { row: 9, column: 1 }, { numberFormat: { kind: "date", code: "yyyy-mm-dd" } });
value(10, 0, "Wrapped text\nSecond line / 第二行");
setCellStyle(sheet, { row: 10, column: 0 }, { wrapText: true, verticalAlign: "middle" });
setRowHeight(sheet, 10, 48);
value(12, 0, "Error value");
setCellContent(sheet, { row: 12, column: 1 }, { kind: "error", error: createFormulaError("DIV0") });
value(13, 0, "Boolean");
value(13, 1, true);
setCellNote(
  sheet,
  { row: 3, column: 0 },
  { text: "Synthetic review note. No personal information." },
);
for (let column = 0; column < 5; column++) setColumnWidth(sheet, column, column === 0 ? 320 : 145);
sheet.freezePanes = { rows: 3, columns: 1 };
const second = createSheet("Details", "details");
workbook.sheets.set(second.id, second);
setCellContent(
  second,
  { row: 0, column: 0 },
  { kind: "literal", value: "Second worksheet — 第二张表" },
);
setCellStyle(second, { row: 0, column: 0 }, { fontSize: 16, bold: true });
setColumnWidth(second, 0, 320);
setCellContent(second, { row: 2, column: 0 }, { kind: "literal", value: 42 });
sheet.floatingImages.push({
  id: "sample-image",
  assetId: "sample-image",
  altText: "Synthetic green checkerboard",
  anchor: { row: 15, column: 0 },
  offsetX: 4,
  offsetY: 4,
  width: 64,
  height: 64,
});
const sampleImage = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const destination = resolve(process.argv[2] ?? "artifacts/interoperability/sheetcraft-native.xlsx");
await mkdir(resolve(destination, ".."), { recursive: true });
const result = await encodeXlsx(workbook, {
  images: [
    { assetId: "sample-image", bytes: sampleImage, extension: "png", width: 32, height: 32 },
  ],
});
await writeFile(destination, result.bytes);
await writeFile(
  destination.replace(/\.xlsx$/, ".report.json"),
  JSON.stringify(result.report, null, 2) + "\n",
);
console.log(JSON.stringify({ destination, bytes: result.bytes.length, report: result.report }));
