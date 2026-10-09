import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { XMLParser } from "fast-xml-parser";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { buildPivotResult, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellValue,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture(
  headers = ["title1", "title2", "title3", "title4"],
  patch: Partial<SheetPivotTable> = {},
) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  const output = createSheet("Headers", "headers");
  insertSheet(workbook, output);
  [
    headers,
    ...Array.from({ length: 11 }, (_, i) => [i + 2, 2 * i + 3, 3 * i + 4, 4 * i + 5]),
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetPivotTable = {
    id: "headers",
    name: "Headers",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 11, column: 3 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [2],
    columnFields: [1],
    values: [{ field: 3, aggregate: "sum", caption: "Sum of title4" }],
    filters: [{ field: 0, values: [], all: true }],
    sort: "source",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    reportLayout: {
      rowLabel: "Generic row",
      columnLabel: "Generic column",
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    },
    ...patch,
  };
  executeWorkbookCommand(
    createWorkbookSession({ workbook, idFactory }),
    createSetPivotTableCommand(output.id, table),
  );
  return { workbook, source, output, table: output.pivotTables![0]! };
}
function native(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const path = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  const xml = strFromU8(entries[path]!);
  const root = new XMLParser({ ignoreAttributes: false }).parse(xml).pivotTableDefinition;
  entries[path] = strToU8(
    xml.replace(/<ext\b[^>]*\buri="urn:idea10:pivot:1"[^>]*>[\s\S]*?<\/ext>/g, ""),
  );
  return { xml, root, bytes: zipSync(entries) };
}
async function imported(bytes: Uint8Array) {
  const decoded = await decodeXlsx(bytes);
  const output = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Headers")!;
  return { ...decoded, output, table: output.pivotTables![0]! };
}

describe("native pivot field header captions", () => {
  test("exports actual title3/title2 captions and preserves physical headers and total275", async () => {
    const f = fixture();
    const p = native((await encodeXlsx(f.workbook)).bytes);
    expect(p.root["@_rowHeaderCaption"]).toBe("title3");
    expect(p.root["@_colHeaderCaption"]).toBe("title2");
    const decoded = await imported(p.bytes);
    expect(decoded.table.reportLayout).toMatchObject({ rowLabel: "title3", columnLabel: "title2" });
    expect(getCellValue(decoded.output, { row: 2, column: 1 })).toBe("title2");
    expect(getCellValue(decoded.output, { row: 3, column: 0 })).toBe("title3");
    expect(getCellValue(decoded.output, { row: 15, column: 12 })).toBe(275);
    expect(buildPivotResult(decoded.workbook, decoded.table, { useCache: true }).matrix).toEqual(
      buildPivotResult(f.workbook, f.table, { useCache: true }).matrix,
    );
  });

  test("XML-escapes actual field names and restores their captions without product metadata", async () => {
    const f = fixture(["Filter", 'Column & "name"', "Row <name>", "Value"]);
    const p = native((await encodeXlsx(f.workbook)).bytes);
    expect(p.xml).toContain('rowHeaderCaption="Row &lt;name&gt;"');
    expect(p.xml).toContain('colHeaderCaption="Column &amp; &quot;name&quot;"');
    const decoded = await imported(p.bytes);
    expect(decoded.table.reportLayout).toMatchObject({
      rowLabel: "Row <name>",
      columnLabel: 'Column & "name"',
    });
  });

  test("compact rows use the first row field and multiple column fields use their joined display caption", async () => {
    const f = fixture(["Row first", "Column A", "Row second", "Column B"], {
      rowFields: [0, 2],
      columnFields: [1, 3],
      filters: [],
      values: [{ field: 3, aggregate: "sum", caption: "Total" }],
      presentation: {
        layout: "compact",
        subtotals: "off",
        repeatLabels: false,
        blankRows: false,
        rowHeaders: true,
        columnHeaders: true,
        bandedRows: false,
        bandedColumns: false,
      },
    });
    const p = native((await encodeXlsx(f.workbook)).bytes);
    expect(p.root["@_rowHeaderCaption"]).toBe("Row first");
    expect(p.root["@_colHeaderCaption"]).toBe("Column A / Column B");
  });

  test("consolidation keeps the configured displayed column caption", async () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      consolidation: {
        labels: ["Merged rows", "Raw columns", "Value"],
        pageFields: { mode: "custom", count: 0 },
        ranges: [{ sheetId: f.source.id, range: f.table.source!, label: "Source", pageItems: [] }],
      },
      rowFields: [0],
      columnFields: [1],
      values: [{ field: 2, aggregate: "sum", caption: "Total" }],
      filters: [],
      reportLayout: { ...f.table.reportLayout!, columnLabel: "Displayed columns" },
    };
    executeWorkbookCommand(
      createWorkbookSession({ workbook: f.workbook, idFactory: createSequentialIdFactory() }),
      createSetPivotTableCommand(f.output.id, table),
    );
    const p = native((await encodeXlsx(f.workbook)).bytes);
    expect(p.root["@_rowHeaderCaption"]).toBe("Merged rows");
    expect(p.root["@_colHeaderCaption"]).toBe("Displayed columns");
    const decoded = await imported(p.bytes);
    expect(decoded.table.reportLayout!.columnLabel).toBe("Displayed columns");
  });
});
