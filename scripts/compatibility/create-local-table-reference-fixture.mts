import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyWorkbookCommand,
  createBuiltinTableStyles,
  createCreateTableCommand,
  createSetCellContentCommand,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  serializeWorkbook,
  type CellContent,
  type SheetTable,
} from "@sheetcraft/core";
import { encodeXlsx } from "../../packages/xlsx-io/src/index.ts";

/** Fresh synthetic fixture through actual Core commands and the native exporter. */
const workbook = createWorkbook({
  id: "local-table-reference-interop",
  sheetId: "sales",
  sheetName: "TableReferences",
});
const sheet = getActiveSheet(workbook);
const put = (row: number, column: number, content: CellContent) =>
  applyWorkbookCommand(workbook, createSetCellContentCommand(sheet.id, { row, column }, content));
const rows = [
  ["item", "qty", "price", "amount"],
  ["Notebook", 2, 12],
  ["Pencil", 3, 4],
  ["Folder", 3, 7],
] as const;
for (const [row, values] of rows.entries())
  for (const [column, value] of values.entries()) put(row, column, { kind: "literal", value });
const table: SheetTable = {
  id: "sales-table",
  name: "Sales",
  range: { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } },
  columns: rows[0].map((name, index) => ({ id: `column-${index + 1}`, name })),
  style: createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!,
  headerRow: true,
  totalRow: false,
  firstColumn: false,
  lastColumn: false,
  bandedRows: true,
  bandedColumns: false,
  filterButton: true,
  filter: null,
};
applyWorkbookCommand(workbook, createCreateTableCommand(sheet.id, table));
for (let row = 1; row <= 3; row++)
  put(row, 3, { kind: "formula", formula: { source: "=[@qty]*[@price]" } });
put(5, 2, { kind: "literal", value: "Total" });
put(5, 3, { kind: "formula", formula: { source: "=SUM(Sales[amount])" } });
const before = JSON.stringify(serializeWorkbook(workbook));
const evaluator = createWorkbookEvaluator(workbook, sheet.id);
const expected = [1, 2, 3, 5].map((row) => ({
  address: `D${row + 1}`,
  value: evaluator.getComputedValue({ row, column: 3 }),
}));
const encoded = await encodeXlsx(workbook);
if (before !== JSON.stringify(serializeWorkbook(workbook)))
  throw new Error("Native export mutated the Core fixture.");
const destination = resolve(process.argv[2] ?? "/tmp/sheetcraft-local-table-reference.xlsx");
await mkdir(resolve(destination, ".."), { recursive: true });
await writeFile(destination, encoded.bytes);
await writeFile(
  `${destination}.json`,
  JSON.stringify(
    {
      generator: "scripts/compatibility/create-local-table-reference-fixture.mts",
      generatedAt: new Date().toISOString(),
      fixtureKind: "actual Core commands plus native encodeXlsx",
      expected,
      coreSources: [1, 2, 3, 5].map((row) => ({
        address: `D${row + 1}`,
        content: sheet.cells.get(`${row}:3`)?.content,
      })),
      coreImmutableAfterExport: true,
      report: encoded.report,
    },
    null,
    2,
  ),
);
console.log(destination);
