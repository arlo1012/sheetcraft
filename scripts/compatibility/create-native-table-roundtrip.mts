import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { deserializeWorkbook } from "@sheetcraft/core/serialization";
import { getCellContent, type Workbook } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../packages/xlsx-io/dist/index.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || process.argv.length !== 4)
  throw new Error(
    "Usage: bun scripts/compatibility/create-native-table-roundtrip.mts input.xlsx|input.json distinct-output.xlsx",
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
