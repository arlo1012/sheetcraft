import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { applyWorkbookCommand, createSetCellContentCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx } from "@sheetcraft/xlsx-io";

// Contains synthetic data only. The caller chooses an isolated local output directory.
const directory = process.argv[2];
if (!directory) throw new Error("Pass an isolated local output directory.");
await mkdir(directory, { recursive: true });
const workbook = createWorkbook({
  id: "calculated-column-acceptance",
  sheetId: "data",
  sheetName: "Data",
});
const sheet = getActiveSheet(workbook);
for (const [column, value] of ["Item", "Qty", "Result"].entries())
  setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
for (let row = 1; row <= 3; row++) {
  setCellContent(
    sheet,
    { row, column: 0 },
    { kind: "literal", value: String.fromCharCode(64 + row) },
  );
  setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row + 1 });
}
sheet.tables = [
  {
    id: "sales",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    columns: ["Item", "Qty", "Result"].map((name, index) => ({ id: String(index + 1), name })),
    style: createBuiltinTableStyles()[1],
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  },
];
async function save(name) {
  const result = await encodeXlsx(workbook, { filename: `${name}.xlsx` });
  await writeFile(join(directory, `${name}.xlsx`), result.bytes);
  await writeFile(
    join(directory, `${name}.json`),
    JSON.stringify(serializeWorkbook(workbook), null, 2),
  );
  console.log(
    JSON.stringify({
      name,
      report: result.report,
      table: sheet.tables[0],
      members: [1, 2, 3, 4].map((row) => getCellContent(sheet, { row, column: 2 })),
    }),
  );
}
await save("calc-empty");
applyWorkbookCommand(
  workbook,
  createSetCellContentCommand(
    sheet.id,
    { row: 1, column: 2 },
    { kind: "formula", formula: { source: "=B2*2" } },
    { inputIntent: "manual" },
  ),
);
await save("calc-filled");
applyWorkbookCommand(
  workbook,
  createSetCellContentCommand(
    sheet.id,
    { row: 2, column: 2 },
    { kind: "literal", value: 99 },
    { inputIntent: "manual" },
  ),
);
applyWorkbookCommand(
  workbook,
  createSetCellContentCommand(sheet.id, { row: 3, column: 2 }, null, { inputIntent: "manual" }),
);
await save("calc-exceptions");
