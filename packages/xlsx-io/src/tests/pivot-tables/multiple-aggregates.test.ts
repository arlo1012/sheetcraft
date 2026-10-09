import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { decodeXlsx, encodeXlsx } from "../../index.js";

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const aggregates = [
  "sum",
  "count",
  "average",
  "max",
  "min",
  "product",
  "countNums",
  "stdev",
  "stdevp",
  "var",
  "varp",
] as const;
const subtotals = [
  "sum",
  "count",
  "average",
  "max",
  "min",
  "product",
  "countNums",
  "stdDev",
  "stdDevp",
  "var",
  "varp",
];
// Arithmetic oracle for [2, 4, 8], [16, 32], and the combined sample.
// These expectations do not come from either XLSX reader or writer.
const expectedValues = [
  [14, 3, 14 / 3, 8, 2, 64, 3, Math.sqrt(28 / 3), Math.sqrt(56 / 9), 28 / 3, 56 / 9],
  [48, 2, 24, 32, 16, 512, 2, Math.sqrt(128), 8, 128, 64],
  [62, 5, 12.4, 32, 2, 32768, 5, Math.sqrt(148.8), Math.sqrt(119.04), 148.8, 119.04],
];

function fixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  const output = createSheet("Aggregates", "aggregates");
  insertSheet(workbook, output);
  [
    ["Region", "Quarter", "Amount", "Units"],
    ["East", "Q1", 2, 1],
    ["East", "Q1", 4, 1],
    ["East", "Q2", 8, 1],
    ["West", "Q1", 16, 1],
    ["West", "Q2", 32, 1],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetPivotTable = {
    id: "all-aggregates",
    name: "AllAggregates",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 5, column: 3 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: aggregates.map((aggregate) => ({ field: 2, aggregate, caption: aggregate })),
    filters: [],
    sort: "ascending",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    presentation: {
      layout: "tabular",
      subtotals: "off",
      repeatLabels: true,
      blankRows: false,
      rowHeaders: true,
      columnHeaders: true,
      bandedRows: false,
      bandedColumns: false,
    },
  };
  executeWorkbookCommand(
    createWorkbookSession({ workbook, idFactory }),
    createSetPivotTableCommand(output.id, table),
  );
  return { workbook, output };
}

describe("multiple native aggregates of one source field", () => {
  test("independent ClosedXML fixture uses repeated fld and an optional item layout", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("./fixtures/closedxml-two-values.xlsx", import.meta.url)),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "9f25de4a5ee25afb0631eda0e320b065b6f1a6f9568a96c242df6000d8b46583",
    );
    const xml = strFromU8(unzipSync(bytes)["xl/pivotTables/pivotTable.xml"]!);
    expect(xml).not.toContain("urn:sheetcraft");
    const root = parser.parse(xml).pivotTableDefinition;
    expect(root.dataFields.dataField).toEqual([
      { "@_name": "Sum of B", "@_fld": "1" },
      { "@_name": "Count of B", "@_fld": "1", "@_subtotal": "count" },
    ]);
    expect(root.colFields.field.map((field: Record<string, unknown>) => field["@_x"])).toEqual([
      "0",
      "-2",
    ]);
    expect(root.rowItems).toBeUndefined();
    expect(root.colItems).toBeUndefined();
  });

  test("publicly imports the unmodified prefixed fixture and its root-level cache without false omission warnings", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("./fixtures/closedxml-two-values.xlsx", import.meta.url)),
    );
    const { workbook, report } = await decodeXlsx(bytes);
    expect(report.issues.filter((issue) => issue.severity === "block")).toEqual([]);
    expect(
      report.issues
        .flatMap((issue) => issue.locations)
        .filter((location) => /pivot/i.test(location)),
    ).toEqual([]);
    const source = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet1")!;
    const output = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet2")!;
    expect(getCellValue(source, { row: 1, column: 1 })).toBe(2);
    expect(output.pivotTables).toHaveLength(1);
    const table = output.pivotTables![0]!;
    expect(table.values).toEqual([
      { field: 1, aggregate: "sum", caption: "Sum of B" },
      { field: 1, aggregate: "count", caption: "Count of B" },
    ]);
    expect(table.columnFields).toEqual([0]);
    expect(table.sourceSheetId).toBe(source.id);
    expect(table.dataCache).toEqual({ headers: ["A", "B"], records: [[1, 2]] });
    expect(buildPivotResult(workbook, table, { useCache: true }).matrix.at(-1)).toEqual([
      "Grand Total",
      2,
      1,
      2,
      1,
    ]);
    // The unrelated upstream package metadata is still diagnosed as unsupported.
    expect(report.issues.flatMap((issue) => issue.locations)).toEqual([
      "package/services/metadata/core-properties/e3d4c09b96d24462bb2a045203548a77.psmdcp",
    ]);
  });

  test("exports all eleven fld=2 functions and restores their independent numeric results without metadata", async () => {
    const f = fixture();
    const encoded = await encodeXlsx(f.workbook);
    expect(encoded.report.issues.filter((issue) => issue.code === "feature-omitted")).toEqual([]);
    const entries = unzipSync(encoded.bytes);
    const part = "xl/pivotTables/pivotTable1.xml";
    const xml = strFromU8(entries[part]!);
    const root = parser.parse(xml).pivotTableDefinition;
    expect(root.dataFields["@_count"]).toBe("11");
    expect(
      root.dataFields.dataField.map((field: Record<string, unknown>) => field["@_fld"]),
    ).toEqual(Array(11).fill("2"));
    expect(
      root.dataFields.dataField.map((field: Record<string, unknown>) => field["@_subtotal"]),
    ).toEqual(subtotals);
    expect(
      root.dataFields.dataField.map((field: Record<string, unknown>) => field["@_name"]),
    ).toEqual(aggregates);
    expect(root.colFields.field["@_x"]).toBe("-2");
    expect(root["@_dataPosition"]).toBe("0");
    expect(root.pivotFields.pivotField[2]["@_dataField"]).toBe("1");

    // Check saved worksheet numbers before going through the public decoder.
    const worksheet = parser.parse(strFromU8(entries["xl/worksheets/sheet2.xml"]!)).worksheet;
    for (const [rowIndex, values] of expectedValues.entries()) {
      const cells = worksheet.sheetData.row[rowIndex + 1].c;
      for (const [index, value] of values.entries())
        expect(Number(cells[index + 1].v)).toBeCloseTo(value, 10);
    }

    entries[part] = strToU8(
      xml.replace(/<ext\b[^>]*\buri="urn:sheetcraft:pivot:1"[^>]*>[\s\S]*?<\/ext>/g, ""),
    );
    expect(strFromU8(entries[part]!)).not.toContain("urn:sheetcraft:pivot:1");
    const decoded = await decodeXlsx(zipSync(entries));
    const output = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === "Aggregates",
    )!;
    expect(output.pivotTables).toHaveLength(1);
    const table = output.pivotTables![0]!;
    expect(
      table.values.map(({ field, aggregate, caption }) => ({ field, aggregate, caption })),
    ).toEqual(aggregates.map((aggregate) => ({ field: 2, aggregate, caption: aggregate })));
    const result = buildPivotResult(decoded.workbook, table, { useCache: true });
    expect(result.matrix[0]).toEqual(["Region", ...aggregates]);
    expect(result.matrix.slice(1).map((row) => row[0])).toEqual(["East", "West", "Grand Total"]);
    for (const [rowIndex, values] of expectedValues.entries()) {
      for (const [index, value] of values.entries()) {
        expect(result.matrix[rowIndex + 1]![index + 1]).toBeCloseTo(value, 10);
        expect(getCellValue(output, { row: rowIndex + 1, column: index + 1 })).toBeCloseTo(
          value,
          10,
        );
      }
    }
  });
});
