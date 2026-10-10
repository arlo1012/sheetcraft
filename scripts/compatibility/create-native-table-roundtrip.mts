import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deserializeWorkbook } from "@sheetcraft/core/serialization";
import { getCellContent, setCellContent, type Workbook } from "@sheetcraft/core/workbook";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { decodeXlsx, encodeXlsx } from "../../packages/xlsx-io/dist/index.js";

const [inputPath, outputPath, mode] = process.argv.slice(2);
const totalsModes = [
  "--mixed-totals",
  "--mixed-supported-totals",
  "--label-total",
  "--mean-total",
  "--custom-total",
  "--constant-total",
];
if (
  !inputPath ||
  !outputPath ||
  (mode !== undefined && !totalsModes.includes(mode)) ||
  process.argv.length > 5
)
  throw new Error(
    `Usage: bun scripts/compatibility/create-native-table-roundtrip.mts input.xlsx|input.json distinct-output.xlsx [${totalsModes.join(" | ")}]`,
  );
const input = resolve(inputPath);
const output = resolve(outputPath);
if (input === output)
  throw new Error("Preserve the original producer file with a distinct output.");
const bytes = new Uint8Array(await readFile(input));
let workbook: Workbook;
let importReport: unknown;
if (input.endsWith(".json")) {
  workbook = deserializeWorkbook(JSON.parse(new TextDecoder().decode(bytes)));
} else {
  const decoded = await decodeXlsx(bytes);
  workbook = decoded.workbook;
  importReport = decoded.report;
}
if (mode !== undefined) {
  const sheet = [...workbook.sheets.values()].find((candidate) =>
    candidate.tables?.some((table) => table.totalRow && table.columns.length >= 5),
  );
  const table = sheet?.tables?.find(
    (candidate) => candidate.totalRow && candidate.columns.length >= 5,
  );
  if (!sheet || !table)
    throw new Error("Mixed totals require an existing five-column total-row table.");
  const row = table.range.end.row;
  const column = table.range.start.column;
  const dataStart = table.range.start.row + (table.headerRow ? 1 : 0);
  const ownRange = (offset: number) =>
    `${formatCellAddress({ row: dataStart, column: column + offset })}:${formatCellAddress({ row: row - 1, column: column + offset })}`;
  if (mode === "--mixed-totals" || mode === "--mixed-supported-totals" || mode === "--label-total")
    setCellContent(sheet, { row, column }, { kind: "literal", value: "Total & <" });
  if (mode === "--mixed-totals" || mode === "--mixed-supported-totals")
    setCellContent(
      sheet,
      { row, column: column + 1 },
      { kind: "formula", formula: { source: `=SUBTOTAL(109,${ownRange(1)})` } },
    );
  if (mode === "--mixed-totals" || mode === "--mixed-supported-totals" || mode === "--mean-total")
    setCellContent(
      sheet,
      { row, column: column + 2 },
      { kind: "formula", formula: { source: `=SUBTOTAL(101,${ownRange(2)})` } },
    );
  if (mode === "--mixed-totals" || mode === "--mixed-supported-totals" || mode === "--custom-total")
    setCellContent(
      sheet,
      { row, column: column + 3 },
      { kind: "formula", formula: { source: `=SUM(${ownRange(3)})+1` } },
    );
  if (mode === "--mixed-totals" || mode === "--constant-total")
    setCellContent(sheet, { row, column: column + 4 }, { kind: "literal", value: 99 });
  if (mode === "--mixed-supported-totals")
    setCellContent(sheet, { row, column: column + 4 }, undefined);
}
const encoded = await encodeXlsx(workbook);
await writeFile(output, encoded.bytes);
console.log(
  JSON.stringify(
    {
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      outputSha256: createHash("sha256").update(encoded.bytes).digest("hex"),
      importReport,
      exportReport: encoded.report,
      tables: [...workbook.sheets.values()].flatMap((sheet) =>
        (sheet.tables ?? []).map((table) => ({
          sheet: sheet.name,
          table: table.name,
          range: table.range,
          headerRow: table.headerRow,
          totalRow: table.totalRow,
          filterButton: table.filterButton,
          filter: table.filter,
          totals: table.totalRow
            ? table.columns.map((_, index) =>
                getCellContent(sheet, {
                  row: table.range.end.row,
                  column: table.range.start.column + index,
                }),
              )
            : [],
        })),
      ),
    },
    null,
    2,
  ),
);
