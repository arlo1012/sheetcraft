import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { buildPivotResult, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellValue,
  insertSheet,
  setCellContent,
  setCellStyle,
  type CellRange,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { attr, child, nodes, parseXml } from "../../pivot-xml.js";

function write(sheet: Sheet, rows: Array<Array<string | number>>, start = { row: 0, column: 0 }) {
  rows.forEach((row, index) =>
    row.forEach((value, column) =>
      setCellContent(
        sheet,
        { row: start.row + index, column: start.column + column },
        {
          kind: "literal",
          value,
        },
      ),
    ),
  );
}
function structuredTable(id: string, name: string, range: CellRange): SheetTable {
  return {
    id,
    name,
    range,
    columns: [
      { id: "label", name: "Label" },
      { id: "amount", name: "Amount" },
    ],
    style: { id: "table-none", name: "None", category: "custom", elements: {} },
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: false,
    bandedColumns: false,
    filterButton: false,
    filter: null,
  };
}
function fixture(bound = true) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  source.name = "Source";
  write(source, [
    ["Label", "Amount"],
    ["A", 10],
    ["B", 20],
  ]);
  const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } };
  const sourceTable = structuredTable("original-nonnative-id", "Sales", range);
  source.tables = [sourceTable];
  const output = createSheet("Report", "report");
  insertSheet(workbook, output);
  const pivot: SheetPivotTable = {
    id: "bound-pivot",
    name: "BoundPivot",
    sourceSheetId: source.id,
    ...(bound ? { sourceTableId: sourceTable.id } : {}),
    source: range,
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: "Total" }],
    filters: [],
    sort: "source",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "Product-only blank",
    reportLayout: {
      rowLabel: "Label",
      columnLabel: "Column",
      allLabel: "Every item",
      multipleLabel: "Several",
    },
    presentation: {
      layout: "tabular",
      subtotals: "off",
      repeatLabels: false,
      blankRows: false,
      rowHeaders: true,
      columnHeaders: true,
      bandedRows: false,
      bandedColumns: false,
    },
  };
  const session = createWorkbookSession({ workbook, idFactory });
  executeWorkbookCommand(session, createSetPivotTableCommand(output.id, pivot));
  return { workbook, source, sourceTable, output, pivot: output.pivotTables![0]!, session };
}
function sheetNamed(workbook: Workbook, name: string) {
  return [...workbook.sheets.values()].find((sheet) => sheet.name === name)!;
}
function pivotParts(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const cachePath = "xl/pivotCache/pivotCacheDefinition1.xml";
  const pivotPath = "xl/pivotTables/pivotTable1.xml";
  return {
    entries,
    cachePath,
    pivotPath,
    cache: child(parseXml(entries[cachePath]), "pivotCacheDefinition"),
    records: child(parseXml(entries["xl/pivotCache/pivotCacheRecords1.xml"]), "pivotCacheRecords"),
  };
}
function stripExtension(entries: Record<string, Uint8Array>) {
  for (const path of Object.keys(entries).filter((path) =>
    /^xl\/pivotTables\/[^/]+\.xml$/.test(path),
  ))
    entries[path] = strToU8(
      strFromU8(entries[path]!).replace(
        /<ext\b[^>]*\buri="urn:sheetcraft:pivot:1"[^>]*>[\s\S]*?<\/ext>/g,
        "",
      ),
    );
}
function omitted(report: Awaited<ReturnType<typeof encodeXlsx>>["report"]) {
  return report.issues.filter(
    (issue) =>
      issue.code === "feature-omitted" &&
      issue.locations.some((location) => /pivot/i.test(location)),
  );
}

describe("native dynamic table-backed pivot sources", () => {
  test("imports the independent WPS table source with native identity and six cached records", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("./fixtures/wps-table-source.xlsx", import.meta.url)),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "6f03fe0846ee7d1e408b185b21fa9e8f2dee68fd2d9d29899168dc9abb83d974",
    );
    const entries = unzipSync(bytes);
    expect(strFromU8(entries["xl/pivotTables/pivotTable1.xml"]!)).not.toContain("urn:sheetcraft");
    expect(
      child(
        child(parseXml(entries["xl/pivotCache/pivotCacheDefinition1.xml"]), "pivotCacheDefinition"),
        "cacheSource",
      ),
    ).toMatchObject({
      worksheetSource: { "@_name": "Table1" },
    });
    const decoded = await decodeXlsx(bytes);
    const source = [...decoded.workbook.sheets.values()].find((sheet) =>
      sheet.tables?.some((table) => table.name === "Table1"),
    )!;
    const sourceTable = source.tables!.find((table) => table.name === "Table1")!;
    const report = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.pivotTables?.length,
    )!;
    const pivot = report.pivotTables![0]!;
    expect(pivot.sourceSheetId).toBe(source.id);
    expect(pivot.sourceTableId).toBe(sourceTable.id);
    expect(pivot.source).toEqual({ start: { row: 0, column: 0 }, end: { row: 6, column: 3 } });
    expect(pivot.dataCache!.records).toHaveLength(6);
    expect(
      buildPivotResult(decoded.workbook, pivot, { useCache: true }).matrix.at(-1)!.at(-1),
    ).toBe(520);
    expect(omitted(decoded.report)).toEqual([]);
  });

  test.each([false, true])(
    "rebinds renumbered native table IDs with extension stripped=%s",
    async (strip) => {
      const f = fixture();
      const parts = pivotParts((await encodeXlsx(f.workbook)).bytes);
      expect(child(child(parts.cache, "cacheSource"), "worksheetSource")).toEqual({
        "@_name": "Sales",
      });
      expect(attr(child(parseXml(parts.entries["xl/tables/table1.xml"]), "table"), "id")).toBe("1");
      if (strip) stripExtension(parts.entries);
      const decoded = await decodeXlsx(zipSync(parts.entries));
      const source = sheetNamed(decoded.workbook, "Source");
      const pivot = sheetNamed(decoded.workbook, "Report").pivotTables![0]!;
      expect(source.tables![0]!.id).not.toBe(f.sourceTable.id);
      expect(pivot.sourceTableId).toBe(source.tables![0]!.id);
      expect(pivot.sourceSheetId).toBe(source.id);
      expect(pivot.dataCache!.records).toEqual(f.pivot.dataCache!.records);
      expect(omitted(decoded.report)).toEqual([]);
      if (!strip) {
        expect(pivot.id).toBe(f.pivot.id);
        expect(pivot.emptyLabel).toBe("Product-only blank");
      }
    },
  );

  test.each(["missing-table", "hidden-header"] as const)(
    "rejects an independent WPS %s source without discarding saved report cells",
    async (kind) => {
      const bytes = new Uint8Array(
        await readFile(new URL("./fixtures/wps-table-source.xlsx", import.meta.url)),
      );
      const parts = pivotParts(bytes);
      if (kind === "missing-table")
        parts.entries[parts.cachePath] = strToU8(
          strFromU8(parts.entries[parts.cachePath]!).replace(
            'name="Table1"',
            'name="MissingTable"',
          ),
        );
      else
        parts.entries["xl/tables/table1.xml"] = strToU8(
          strFromU8(parts.entries["xl/tables/table1.xml"]!).replace(
            "<table ",
            '<table headerRowCount="0" ',
          ),
        );
      const decoded = await decodeXlsx(zipSync(parts.entries));
      expect(
        [...decoded.workbook.sheets.values()].flatMap((sheet) => sheet.pivotTables ?? []),
      ).toEqual([]);
      expect(omitted(decoded.report)).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          locations: expect.arrayContaining(["xl/pivotTables/pivotTable1.xml"]),
        }),
      );
      expect(getCellValue(sheetNamed(decoded.workbook, "Sheet2"), { row: 7, column: 3 })).toBe(520);
    },
  );

  test.each([false, true])(
    "row growth, totals and rename preserve last-refresh cache and report with extension stripped=%s",
    async (strip) => {
      const f = fixture();
      const originalCache = structuredClone(f.pivot.dataCache);
      const originalResult = buildPivotResult(f.workbook, f.pivot, { useCache: true });
      f.sourceTable.range.end.row = 4;
      f.sourceTable.totalRow = true;
      f.sourceTable.name = "CurrentSales";
      write(
        f.source,
        [
          ["C", 100],
          ["Totals", 130],
        ],
        { row: 3, column: 0 },
      );
      // This cache-isolation scenario needs a supported total formula. Literal
      // numeric totals now have a separate compatibility-block regression below.
      setCellContent(
        f.source,
        { row: 4, column: 1 },
        {
          kind: "formula",
          formula: { source: "=SUM(B2:B4)" },
        },
      );
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const parts = pivotParts(encoded.bytes);
      expect(child(child(parts.cache, "cacheSource"), "worksheetSource")).toEqual({
        "@_name": "CurrentSales",
      });
      expect(attr(parts.cache, "refreshOnLoad")).toBe("0");
      expect(attr(parts.records, "count")).toBe("2");
      expect(omitted(encoded.report)).toEqual([]);
      if (strip) stripExtension(parts.entries);
      const decoded = await decodeXlsx(zipSync(parts.entries));
      const pivot = sheetNamed(decoded.workbook, "Report").pivotTables![0]!;
      expect(pivot.source).toEqual({
        start: { row: 0, column: 0 },
        end: { row: strip ? 3 : 2, column: 1 },
      });
      expect(pivot.sourceTableId).toBe(sheetNamed(decoded.workbook, "Source").tables![0]!.id);
      expect(pivot.dataCache).toEqual(originalCache);
      expect(buildPivotResult(decoded.workbook, pivot, { useCache: true }).matrix).toEqual(
        originalResult.matrix,
      );
      expect(getCellValue(sheetNamed(decoded.workbook, "Report"), pivot.outputRange!.end)).toBe(30);
      if (!strip) expect(pivot.emptyLabel).toBe("Product-only blank");
    },
  );

  test("blocks a numeric total in a table-backed pivot source without modifying its cached report", async () => {
    const f = fixture();
    f.sourceTable.range.end.row = 3;
    f.sourceTable.totalRow = true;
    write(f.source, [["Totals", 130]], { row: 3, column: 0 });
    const before = serializeWorkbook(f.workbook);
    await expect(encodeXlsx(f.workbook)).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            code: "table-totals-numeric-constant",
            severity: "block",
            count: 1,
            locations: ["Source!B4 (Sales[Amount])"],
          },
        ],
      },
    });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("pure native table row growth retains eligible product metadata", async () => {
    const parts = pivotParts((await encodeXlsx(fixture().workbook)).bytes);
    parts.entries["xl/tables/table1.xml"] = strToU8(
      strFromU8(parts.entries["xl/tables/table1.xml"]!).replaceAll('ref="A1:B3"', 'ref="A1:B4"'),
    );
    const decoded = await decodeXlsx(zipSync(parts.entries));
    const pivot = sheetNamed(decoded.workbook, "Report").pivotTables![0]!;
    expect(pivot.id).toBe("bound-pivot");
    expect(pivot.emptyLabel).toBe("Product-only blank");
    expect(pivot.source!.end.row).toBe(2);
    expect(sheetNamed(decoded.workbook, "Source").tables![0]!.range.end.row).toBe(3);
    expect(pivot.dataCache!.records).toHaveLength(2);
  });

  test.each([
    "deleted",
    "missing-id",
    "wrong-sheet",
    "null-range",
    "hidden-header",
    "schema-width",
    "schema-header",
  ] as const)(
    "omits invalid %s binding parts, warns and retains worksheet report cells",
    async (kind) => {
      const f = fixture();
      if (kind === "deleted") f.source.tables = [];
      if (kind === "missing-id") f.pivot.sourceTableId = "missing";
      if (kind === "wrong-sheet") f.pivot.sourceSheetId = f.output.id;
      if (kind === "null-range") f.pivot.source = null;
      if (kind === "hidden-header") f.sourceTable.headerRow = false;
      if (kind === "schema-width") {
        f.sourceTable.range.end.column = 2;
        f.sourceTable.columns.push({ id: "extra", name: "Extra" });
        setCellContent(f.source, { row: 0, column: 2 }, { kind: "literal", value: "Extra" });
      }
      if (kind === "schema-header") {
        f.sourceTable.columns[1]!.name = "Changed";
        setCellContent(f.source, { row: 0, column: 1 }, { kind: "literal", value: "Changed" });
      }
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(omitted(encoded.report)).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          locations: ["BoundPivot.sourceTableId"],
        }),
      );
      const entries = unzipSync(encoded.bytes);
      expect(Object.keys(entries).some((path) => /^xl\/pivot(?:Tables|Cache)\//.test(path))).toBe(
        false,
      );
      expect(strFromU8(entries["xl/workbook.xml"]!)).not.toContain("pivotCaches");
      expect(
        Object.values(entries).some((bytes) =>
          strFromU8(bytes).includes("relationships/pivotTable"),
        ),
      ).toBe(false);
      const decoded = await decodeXlsx(encoded.bytes);
      expect(sheetNamed(decoded.workbook, "Report").pivotTables ?? []).toEqual([]);
      expect(getCellValue(sheetNamed(decoded.workbook, "Report"), f.pivot.outputRange!.end)).toBe(
        30,
      );
    },
  );

  test.each(["range", "other-table"] as const)(
    "native source edit to %s overrides stale bound metadata",
    async (kind) => {
      const f = fixture();
      write(
        f.source,
        [
          ["Label", "Amount"],
          ["X", 100],
          ["Y", 200],
        ],
        { row: 0, column: 3 },
      );
      f.source.tables!.push(
        structuredTable("other-original-id", "OtherSales", {
          start: { row: 0, column: 3 },
          end: { row: 2, column: 4 },
        }),
      );
      const parts = pivotParts((await encodeXlsx(f.workbook)).bytes);
      parts.entries[parts.cachePath] = strToU8(
        strFromU8(parts.entries[parts.cachePath]!).replace(
          '<worksheetSource name="Sales"/>',
          kind === "range"
            ? '<worksheetSource ref="A1:B3" sheet="Source"/>'
            : '<worksheetSource name="OtherSales"/>',
        ),
      );
      const decoded = await decodeXlsx(zipSync(parts.entries));
      const source = sheetNamed(decoded.workbook, "Source");
      const pivot = sheetNamed(decoded.workbook, "Report").pivotTables![0]!;
      expect(pivot.id).not.toBe("bound-pivot");
      expect(pivot.emptyLabel).toBe("(blank)");
      expect(pivot.sourceTableId).toBe(
        kind === "range"
          ? undefined
          : source.tables!.find((table) => table.name === "OtherSales")!.id,
      );
      expect(pivot.source!.start.column).toBe(kind === "range" ? 0 : 3);
      expect(pivot.dataCache!.records).toEqual(f.pivot.dataCache!.records);
      expect(omitted(decoded.report)).toEqual([]);
    },
  );

  test.each([false, true])(
    "a deleted table cannot fall back to a same-name defined range with own binding stripped=%s",
    async (strip) => {
      const f = fixture();
      const parts = pivotParts((await encodeXlsx(f.workbook)).bytes);
      parts.entries["xl/tables/table1.xml"] = strToU8(
        strFromU8(parts.entries["xl/tables/table1.xml"]!)
          .replaceAll('name="Sales"', 'name="DifferentSales"')
          .replaceAll('displayName="Sales"', 'displayName="DifferentSales"'),
      );
      parts.entries["xl/workbook.xml"] = strToU8(
        strFromU8(parts.entries["xl/workbook.xml"]!).replace(
          "</sheets>",
          '</sheets><definedNames><definedName name="Sales">Source!$A$1:$B$3</definedName></definedNames>',
        ),
      );
      if (strip) stripExtension(parts.entries);
      const decoded = await decodeXlsx(zipSync(parts.entries));
      const output = sheetNamed(decoded.workbook, "Report");
      expect(getCellValue(output, f.pivot.outputRange!.end)).toBe(30);
      if (!strip) {
        expect(output.pivotTables ?? []).toEqual([]);
        expect(omitted(decoded.report)).toContainEqual(
          expect.objectContaining({
            severity: "warning",
            locations: expect.arrayContaining(["xl/pivotTables/pivotTable1.xml"]),
          }),
        );
      } else {
        // Native-only named ranges do not carry the table's historical intent.
        expect(output.pivotTables).toHaveLength(1);
        expect(output.pivotTables![0]!.sourceTableId).toBeUndefined();
        expect(output.pivotTables![0]!.source).toEqual(f.pivot.source);
        expect(omitted(decoded.report)).toEqual([]);
      }
    },
  );

  test("samples source number formats at current bound coordinates", async () => {
    const f = fixture();
    f.sourceTable.range = { start: { row: 4, column: 4 }, end: { row: 6, column: 5 } };
    write(
      f.source,
      [
        ["Label", "Amount"],
        ["A", 10],
        ["B", 20],
      ],
      { row: 4, column: 4 },
    );
    const code = '"£"#,##0.00';
    setCellStyle(f.source, { row: 5, column: 5 }, { numberFormat: { kind: "custom", code } });
    setCellStyle(
      f.source,
      { row: 1, column: 1 },
      { numberFormat: { kind: "custom", code: "0.0000" } },
    );
    const parts = pivotParts((await encodeXlsx(f.workbook)).bytes);
    const styles = child(parseXml(parts.entries["xl/styles.xml"]), "styleSheet");
    const format = nodes(child(styles, "numFmts").numFmt).find(
      (item) => attr(item, "formatCode") === code,
    )!;
    expect(format).toBeDefined();
    expect(attr(nodes(child(parts.cache, "cacheFields").cacheField)[1]!, "numFmtId")).toBe(
      attr(format, "numFmtId"),
    );
    expect(f.pivot.source!.start).toEqual({ row: 0, column: 0 });
  });

  test("fixed sources remain fixed even when a structured table occupies the same range", async () => {
    const f = fixture(false);
    f.sourceTable.range.end.row = 3;
    write(f.source, [["C", 100]], { row: 3, column: 0 });
    const parts = pivotParts((await encodeXlsx(f.workbook)).bytes);
    expect(child(child(parts.cache, "cacheSource"), "worksheetSource")).toEqual({
      "@_ref": "A1:B3",
      "@_sheet": "Source",
    });
    const decoded = await decodeXlsx(zipSync(parts.entries));
    const pivot = sheetNamed(decoded.workbook, "Report").pivotTables![0]!;
    expect(pivot.sourceTableId).toBeUndefined();
    expect(pivot.source).toEqual(f.pivot.source);
    expect(pivot.emptyLabel).toBe("Product-only blank");
    expect(pivot.dataCache!.records).toHaveLength(2);
  });
});
