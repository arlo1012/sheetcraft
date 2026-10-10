import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { decodeXlsx, encodeXlsx } from "../../packages/xlsx-io/dist/index.js";

const [inputPath, outputPath, mode] = process.argv.slice(2);
if (!inputPath || !outputPath || (mode !== undefined && mode !== "refresh"))
  throw new Error(
    "Usage: bun scripts/compatibility/create-native-chart-import-roundtrip.mts input.xlsx output.xlsx [refresh]",
  );
const input = resolve(inputPath);
const output = resolve(outputPath);
if (input === output)
  throw new Error("Choose a distinct output; producer evidence must remain unchanged.");
const decoded = await decodeXlsx(new Uint8Array(await readFile(input)));
const sheet = [...decoded.workbook.sheets.values()].find((candidate) =>
  candidate.drawings?.some((drawing) => drawing.kind === "chart"),
);
if (!sheet?.pivotTables?.length)
  throw new Error("No supported native linked PivotChart was imported.");
decoded.workbook.activeSheetId = sheet.id;
if (mode === "refresh") {
  const session = createWorkbookSession({
    workbook: decoded.workbook,
    idFactory: createSequentialIdFactory(),
  });
  for (const table of sheet.pivotTables)
    executeWorkbookCommand(session, createSetPivotTableCommand(sheet.id, table));
}
const encoded = await encodeXlsx(decoded.workbook, { filename: basename(output) });
// Never overwrite a previous GUI-saved artifact.
await writeFile(output, encoded.bytes, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      bytes: encoded.bytes.length,
      refreshed: mode === "refresh",
      import: decoded.report,
      export: encoded.report,
    },
    null,
    2,
  ),
);
