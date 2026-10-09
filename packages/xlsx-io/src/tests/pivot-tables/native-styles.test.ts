import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { XMLParser } from "fast-xml-parser";
import { createSetPivotTableCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { buildPivotResult, type SheetPivotTable } from "@idea10/core/pivot-tables";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  insertSheet,
  setCellContent,
  setCellStyle,
} from "@idea10/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";

type XmlNode = Record<string, unknown>;
const parser = new XMLParser({ ignoreAttributes: false });
const nodes = (value: unknown): XmlNode[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is XmlNode => item !== null && typeof item === "object",
  );
const child = (node: XmlNode, key: string): XmlNode => nodes(node[key])[0] ?? {};
function xmlPart(entries: Record<string, Uint8Array>, path: string, root: string): XmlNode {
  return child(parser.parse(strFromU8(entries[path]!)) as XmlNode, root);
}
function pivotStyle(entries: Record<string, Uint8Array>) {
  const pivot = xmlPart(entries, "xl/pivotTables/pivotTable1.xml", "pivotTableDefinition");
  const styles = xmlPart(entries, "xl/styles.xml", "styleSheet");
  const name = child(pivot, "pivotTableStyleInfo")["@_name"];
  const definitions = nodes(child(styles, "tableStyles").tableStyle);
  const definition = definitions.find((style) => style["@_name"] === name);
  expect(definition).toBeDefined();
  expect(definition!["@_pivot"]).toBe("1");
  const dxfs = nodes(child(styles, "dxfs").dxf);
  const dxf = (type: string) => {
    const element = nodes(definition!.tableStyleElement).find(
      (element) => element["@_type"] === type,
    );
    expect(element).toBeDefined();
    const index = Number(element!["@_dxfId"]);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(dxfs.length);
    return dxfs[index]!;
  };
  return { pivot, styles, definitions, name, dxf };
}
function fixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  source.name = "Source";
  const output = createSheet("Report", "pivot-report");
  insertSheet(workbook, output);
  const rows = [
    ["Region", "Amount", "Date"],
    ["East", 12.34, 45292],
    ["West", 56.78, 45293],
  ];
  rows.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetPivotTable = {
    id: "native-style-pivot",
    name: "StylePivot",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
    anchor: { row: 1, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: "Amount" }],
    filters: [],
    rowTotals: true,
    columnTotals: true,
    includeHidden: false,
    sort: "source",
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    reportLayout: {
      rowLabel: "Row",
      columnLabel: "Column",
      allLabel: "All",
      multipleLabel: "Multiple",
      fillColor: "#dcefe7",
      borderColor: "#b9ddcf",
    },
  };
  const session = createWorkbookSession({ workbook, idFactory });
  const install = () =>
    executeWorkbookCommand(session, createSetPivotTableCommand(output.id, table));
  return { workbook, source, output, table, install };
}

describe("native pivot styles and number formats", () => {
  test("exports the effective green Core report style and preserves it after import and refresh", async () => {
    const f = fixture();
    f.install();
    const original = getCellStyle(f.output, f.table.anchor);
    expect(original).toMatchObject({
      fillColor: "#dcefe7",
      borderBottom: { style: "thin", color: "#b9ddcf" },
    });
    const encoded = await encodeXlsx(f.workbook);
    const entries = unzipSync(encoded.bytes);
    const style = pivotStyle(entries);
    expect(style.dxf("headerRow")).toMatchObject({
      fill: { patternFill: { fgColor: { "@_rgb": "FFDCEFE7" } } },
      border: { bottom: { "@_style": "thin", color: { "@_rgb": "FFB9DDCF" } } },
    });
    expect(style.dxf("totalRow")).toMatchObject({
      fill: { patternFill: { fgColor: { "@_rgb": "FFDCEFE7" } } },
      border: { top: { "@_style": "thin", color: { "@_rgb": "FFB9DDCF" } } },
    });
    const imported = (await decodeXlsx(encoded.bytes)).workbook;
    const output = [...imported.sheets.values()].find((sheet) => sheet.name === "Report")!;
    const table = output.pivotTables![0]!;
    const session = createWorkbookSession({
      workbook: imported,
      idFactory: createSequentialIdFactory(),
    });
    executeWorkbookCommand(session, createSetPivotTableCommand(output.id, table));
    const result = buildPivotResult(imported, output.pivotTables![0]!);
    expect(
      getCellStyle(output, {
        row: table.anchor.row + result.headerStart,
        column: table.anchor.column,
      }),
    ).toEqual(original);
    expect(
      getCellStyle(output, {
        row: table.anchor.row + result.totalRow!,
        column: table.anchor.column,
      }),
    ).toMatchObject({ fillColor: "#dcefe7", borderTop: { style: "thin", color: "#b9ddcf" } });
  });

  test("binds a custom pivot to its renamed native style when ordinary table names collide", async () => {
    const f = fixture();
    f.workbook.tableStyles = [
      {
        id: "table-shared",
        name: "Shared",
        category: "custom",
        elements: { headerRow: { style: { fillColor: "#4472c4" } } },
      },
      {
        id: "table-occupied",
        name: "Idea10 Pivot Shared",
        category: "custom",
        elements: { headerRow: { style: { fillColor: "#70ad47" } } },
      },
    ];
    f.workbook.pivotTableStyles = [
      {
        id: "pivot-shared",
        name: "Shared",
        category: "custom",
        elements: { headerRow: { style: { fillColor: "#ed7d31" } } },
      },
    ];
    f.table.styleId = "pivot-shared";
    f.install();
    const before = JSON.stringify({
      tableStyles: f.workbook.tableStyles,
      pivotStyles: f.workbook.pivotTableStyles,
    });
    const encoded = await encodeXlsx(f.workbook);
    const style = pivotStyle(unzipSync(encoded.bytes));
    expect(style.name).toBe("Idea10 Pivot Shared 2");
    expect(style.definitions.find((definition) => definition["@_name"] === "Shared")).toMatchObject(
      { "@_table": "1", "@_pivot": "0" },
    );
    expect(style.dxf("headerRow")).toMatchObject({
      fill: { patternFill: { fgColor: { "@_rgb": "FFED7D31" } } },
    });
    expect(
      JSON.stringify({
        tableStyles: f.workbook.tableStyles,
        pivotStyles: f.workbook.pivotTableStyles,
      }),
    ).toBe(before);
  });

  test("uses real exported source currency/date formats in cache and measure IDs, while Count stays General", async () => {
    const f = fixture();
    const currency = '"€"#,##0.000';
    const date = "yyyy-mm-dd";
    for (const row of [1, 2]) {
      setCellStyle(
        f.source,
        { row, column: 1 },
        { numberFormat: { kind: "custom", code: currency } },
      );
      setCellStyle(f.source, { row, column: 2 }, { numberFormat: { kind: "date", code: date } });
    }
    f.table.values = [
      { field: 1, aggregate: "sum", caption: "Amount" },
      { field: 2, aggregate: "min", caption: "Earliest date" },
      { field: 2, aggregate: "count", caption: "Date count" },
    ];
    f.install();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    const { pivot, styles } = pivotStyle(entries);
    const formats = nodes(child(styles, "numFmts").numFmt);
    const xfs = nodes(child(styles, "cellXfs").xf);
    const rows = nodes(
      child(xmlPart(entries, "xl/worksheets/sheet1.xml", "worksheet"), "sheetData").row,
    );
    const cells = rows.flatMap((row) => nodes(row.c));
    const sourceFormat = (address: string) => {
      const cell = cells.find((cell) => cell["@_r"] === address)!;
      return Number(xfs[Number(cell["@_s"])]!["@_numFmtId"]);
    };
    const currencyId = sourceFormat("B2");
    const dateId = sourceFormat("C2");
    expect(
      formats.find((format) => Number(format["@_numFmtId"]) === currencyId)?.["@_formatCode"],
    ).toBe(currency);
    expect(
      formats.find((format) => Number(format["@_numFmtId"]) === dateId)?.["@_formatCode"],
    ).toBe(date);
    const cache = xmlPart(
      entries,
      "xl/pivotCache/pivotCacheDefinition1.xml",
      "pivotCacheDefinition",
    );
    const fields = nodes(child(cache, "cacheFields").cacheField);
    expect(Number(fields[1]!["@_numFmtId"])).toBe(currencyId);
    expect(Number(fields[2]!["@_numFmtId"])).toBe(dateId);
    const measures = nodes(child(pivot, "dataFields").dataField);
    expect(measures.map((measure) => Number(measure["@_numFmtId"]))).toEqual([
      currencyId,
      dateId,
      0,
    ]);
  });
});
