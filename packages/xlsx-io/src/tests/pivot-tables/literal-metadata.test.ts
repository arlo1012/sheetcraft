import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in pivot metadata labels and identifiers", async () => {
  const workbook = createWorkbook({ id: "literal-pivot", sheetId: "source" });
  const source = getActiveSheet(workbook);
  [
    ["Group", "Amount"],
    ["A", 1],
    ["B", 2],
  ].forEach((row, rowIndex) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: rowIndex, column }, { kind: "literal", value }),
    ),
  );
  const output = createSheet("Pivot", "output");
  insertSheet(workbook, output);
  const text = "Cost $$ | $& | $` | $' | $1 | $2";
  const table: SheetPivotTable = {
    id: text,
    name: "LiteralPivot",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: text }],
    filters: [],
    sort: "source",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: text,
    emptyLabel: text,
  };
  output.pivotTables = [table];
  const encoded = await encodeXlsx(workbook);
  const entries = unzipSync(encoded.bytes);
  const part = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  const xml = strFromU8(entries[part]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(xml).toContain("Cost $$ | $&amp; | $` | $&apos; | $1 | $2");
  const decoded = await decodeXlsx(encoded.bytes);
  const restored = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Pivot")!;
  expect(restored.pivotTables?.[0]).toMatchObject({
    id: text,
    totalLabel: text,
    emptyLabel: text,
    values: [{ field: 1, aggregate: "sum", caption: text }],
  });
});
