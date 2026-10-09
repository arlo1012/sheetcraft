import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { XMLParser } from "fast-xml-parser";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { datePartsToExcelSerial } from "@sheetcraft/core/formula";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { buildPivotResult, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type CellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { encodeXlsx, decodeXlsx } from "../../index.js";

const parser = new XMLParser({ ignoreAttributes: false });
function write(sheet: Sheet, rows: CellValue[][]) {
  rows.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, value === null ? null : { kind: "literal", value }),
    ),
  );
}
function fixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  source.name = "North & West";
  const output = createSheet("Sales report", "pivot-output");
  insertSheet(workbook, output);
  const session = createWorkbookSession({ workbook, idFactory });
  const table: SheetPivotTable = {
    id: "sales-pivot",
    name: "SalesPivot",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 4, column: 4 } },
    anchor: { row: 2, column: 2 },
    outputRange: null,
    rowFields: [0],
    columnFields: [1],
    values: [
      { field: 2, aggregate: "sum", caption: "Sales total" },
      { field: 3, aggregate: "average", caption: "Average units" },
    ],
    filters: [{ field: 4, all: false, values: ["Actual", "Budget"] }],
    axisFilters: [
      {
        axis: "rows",
        field: 0,
        values: ["East", "West"],
        labelCondition: { kind: "text", operator: "beginsWith", value: "E" },
        valueCondition: {
          measure: 0,
          condition: { kind: "number", operator: "greaterThan", value: 5 },
        },
      },
      {
        axis: "columns",
        field: 1,
        values: ["Q1", "Q2"],
        labelCondition: { kind: "text", operator: "notEquals", value: "Q3" },
      },
    ],
    sort: "source",
    sortFields: [
      { axis: "rows", field: 0, order: "descending", measure: 0 },
      { axis: "columns", field: 1, order: "ascending" },
    ],
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    reportLayout: {
      rowLabel: "Row",
      columnLabel: "Column",
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    },
    presentation: {
      layout: "tabular",
      subtotals: "off",
      repeatLabels: true,
      blankRows: false,
      rowHeaders: true,
      columnHeaders: true,
      bandedRows: true,
      bandedColumns: false,
    },
  };
  return { workbook, source, output, session, table };
}
function part(entries: Record<string, Uint8Array>, pattern: RegExp) {
  const names = Object.keys(entries).filter((name) => pattern.test(name));
  expect(names).toHaveLength(1);
  return { name: names[0]!, xml: strFromU8(entries[names[0]!]!) };
}
function noPivotOmission(report: {
  issues: readonly { code: string; locations: readonly string[] }[];
}) {
  expect(
    report.issues.filter(
      (issue) =>
        issue.code === "feature-omitted" &&
        issue.locations.some((location) => /pivot/i.test(location)),
    ),
  ).toEqual([]);
}
function nativeParts(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const table = part(entries, /^xl\/pivotTables\/[^/]+\.xml$/);
  const cache = part(entries, /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/);
  const records = part(entries, /^xl\/pivotCache\/pivotCacheRecords[^/]*\.xml$/);
  const types = strFromU8(entries["[Content_Types].xml"]!);
  for (const type of ["pivotTable", "pivotCacheDefinition", "pivotCacheRecords"])
    expect(types).toContain(
      `application/vnd.openxmlformats-officedocument.spreadsheetml.${type}+xml`,
    );
  const workbookXml = strFromU8(entries["xl/workbook.xml"]!);
  expect(workbookXml).toContain("pivotCaches");
  // calcPr precedes pivotCaches in CT_Workbook; final calculation patching must not invert them.
  if (workbookXml.includes("<calcPr"))
    expect(workbookXml.indexOf("<calcPr")).toBeLessThan(workbookXml.indexOf("<pivotCaches"));
  expect(strFromU8(entries["xl/_rels/workbook.xml.rels"]!)).toContain("/pivotCacheDefinition");
  expect(part(entries, /^xl\/pivotTables\/_rels\/[^/]+\.xml\.rels$/).xml).toContain(
    "/pivotCacheDefinition",
  );
  expect(
    part(entries, /^xl\/pivotCache\/_rels\/pivotCacheDefinition[^/]*\.xml\.rels$/).xml,
  ).toContain("/pivotCacheRecords");
  expect(
    Object.entries(entries)
      .filter(([name]) => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name))
      .some(([, xml]) => strFromU8(xml).includes("/pivotTable")),
  ).toBe(true);
  for (const [name, xml] of Object.entries(entries)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      expect(strFromU8(xml)).not.toContain("<pivotTableParts");
  }
  return {
    entries,
    table: parser.parse(table.xml).pivotTableDefinition,
    cache: parser.parse(cache.xml).pivotCacheDefinition,
    records: parser.parse(records.xml).pivotCacheRecords,
  };
}
function stripProductMetadata(entries: Record<string, Uint8Array>): string {
  const table = part(entries, /^xl\/pivotTables\/[^/]+\.xml$/);
  const native = table.xml
    .replace(/<ext uri="urn:sheetcraft:pivot:1">[\s\S]*?<\/ext>/g, "")
    .replace(/<extLst>\s*<\/extLst>/g, "");
  expect(native).not.toContain("i10:metadata");
  expect(native).toContain("2946ED86-A175-432a-8AC1-64E0C546D7DE");
  entries[table.name] = strToU8(native);
  return table.name;
}
function memberReport(members: CellValue[], selection: CellValue[]) {
  const f = fixture();
  write(f.source, [
    ["Member", "Amount"],
    ...members.map((member, index) => [member, (index + 1) * 10]),
  ]);
  f.table.source = { start: { row: 0, column: 0 }, end: { row: members.length, column: 1 } };
  f.table.columnFields = [];
  f.table.values = [{ field: 1, aggregate: "sum", caption: "Sales total" }];
  f.table.filters = [];
  f.table.axisFilters = [{ axis: "rows", field: 0, values: selection }];
  f.table.sortFields = undefined;
  return f;
}
function restoredReport(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  return [...result.workbook.sheets.values()].find((sheet) => sheet.name === "Sales report")!
    .pivotTables![0]!;
}

describe("native XLSX pivot round trips", () => {
  test("external native sort and page selection edits override retained product metadata", async () => {
    const f = fixture();
    write(f.source, [
      ["Region", "Quarter", "Amount", "Units", "Scenario"],
      ["East", "Q1", 10, 2, "Actual"],
      ["East", "Q2", 20, 3, "Budget"],
      ["West", "Q1", 30, 4, "Forecast"],
      ["West", "Q2", 40, 5, "Actual"],
    ]);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.output.id, f.table));
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    const table = part(entries, /^xl\/pivotTables\/[^/]+\.xml$/);
    let fieldIndex = 0;
    const edited = table.xml
      .replace(/<pivotField\b[^>]*>[\s\S]*?<\/pivotField>/g, (field) => {
        const index = fieldIndex++;
        if (index === 0) return field.replace('sortType="descending"', 'sortType="ascending"');
        if (index === 4)
          return field.replace(
            /<item x="(\d+)"[^>]*\/>/g,
            (_item, member: string) => `<item x="${member}"${member === "2" ? "" : ' h="1"'}/>`,
          );
        return field;
      })
      .replace(
        /<pageField\b([^>]*)\/>/,
        (_page, attributes: string) =>
          `<pageField${attributes.replace(/ item="[^"]*"/, "")} item="2"/>`,
      );
    expect(edited).toContain("i10:metadata");
    expect(edited).not.toBe(table.xml);
    entries[table.name] = strToU8(edited);
    const decoded = await decodeXlsx(zipSync(entries));
    const restored = restoredReport(decoded);
    expect(restored.sortFields).toContainEqual({
      axis: "rows",
      field: 0,
      order: "ascending",
      measure: 0,
    });
    expect(restored.filters).toEqual([{ field: 4, all: false, values: ["Forecast"] }]);
  });
  test("native mixed-type members, simple conditions and repeat labels survive without product metadata", async () => {
    const f = memberReport([1, "1", true, null, "", "Other"], [1, "1", true, null]);
    f.table.axisFilters![0]!.labelCondition = {
      kind: "text",
      operator: "doesNotBeginWith",
      value: "O",
    };
    f.table.axisFilters![0]!.valueCondition = {
      measure: 0,
      condition: { kind: "number", operator: "greaterThan", value: 5 },
    };
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.output.id, f.table));
    const expected = f.output.pivotTables![0]!;
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    stripProductMetadata(entries);
    const cache = part(entries, /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/).xml;
    for (const member of ['<n v="1"', '<s v="1"', '<b v="1"', "<m/>"])
      expect(cache).toContain(member);
    const decoded = await decodeXlsx(zipSync(entries));
    noPivotOmission(decoded.report);
    const restored = restoredReport(decoded);
    expect(restored.axisFilters).toEqual(expected.axisFilters);
    expect(restored.presentation?.repeatLabels).toBe(true);
    expect(buildPivotResult(decoded.workbook, restored).matrix).toEqual(
      buildPivotResult(f.workbook, expected).matrix,
    );
  });
  test.each(["1900", "1904"] as const)(
    "native date cache members preserve selected serials under %s",
    async (dateSystem) => {
      const dates = [1, 2].map((day) =>
        datePartsToExcelSerial(
          { year: 2026, month: 1, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
          dateSystem,
        ),
      );
      const f = memberReport(dates, [dates[1]!]);
      f.workbook.dateSystem = dateSystem;
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.output.id, f.table));
      const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
      stripProductMetadata(entries);
      const cache = part(entries, /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/);
      let native = cache.xml;
      dates.forEach((serial, index) => {
        expect(native).toContain(`<n v="${serial}"/>`);
        native = native.replace(`<n v="${serial}"/>`, `<d v="2026-01-0${index + 1}T00:00:00"/>`);
      });
      entries[cache.name] = strToU8(native);
      const decoded = await decodeXlsx(zipSync(entries));
      const restored = restoredReport(decoded);
      expect(decoded.workbook.dateSystem).toBe(dateSystem);
      expect(restored.axisFilters?.[0]?.values).toEqual([dates[1]]);
      expect(restored.presentation?.repeatLabels).toBe(true);
    },
  );
  test("ordinary ranges write native parts and preserve fields, multiselect pages, sort and axis rules", async () => {
    const f = fixture();
    write(f.source, [
      ["Region", "Quarter", "Amount", "Units", "Scenario"],
      ["East", "Q1", 10, 2, "Actual"],
      ["East", "Q2", 20, 3, "Budget"],
      ["West", "Q1", 30, 4, "Forecast"],
      ["West", "Q2", 40, 5, "Actual"],
    ]);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.output.id, f.table));
    const expected = f.output.pivotTables![0]!;
    const encoded = await encodeXlsx(f.workbook);
    noPivotOmission(encoded.report);
    const native = nativeParts(encoded.bytes);
    expect(native.cache.cacheSource["@_type"]).toBe("worksheet");
    expect(native.cache.cacheSource.worksheetSource).toMatchObject({
      "@_sheet": f.source.name,
      "@_ref": "A1:E5",
    });
    expect(Number(native.cache.cacheFields["@_count"])).toBe(5);
    expect(Number(native.records["@_count"])).toBe(4);
    expect(Number(native.table.rowFields["@_count"])).toBe(1);
    expect(Number(native.table.colFields["@_count"])).toBe(2);
    expect(native.table.colFields.field).toContainEqual({ "@_x": "-2" });
    expect(Number(native.table.dataFields["@_count"])).toBe(2);
    expect(Number(native.table.pageFields["@_count"])).toBe(1);
    const decoded = await decodeXlsx(encoded.bytes);
    noPivotOmission(decoded.report);
    const restoredOutput = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === f.output.name,
    )!;
    expect(restoredOutput.pivotTables).toHaveLength(1);
    const restored = restoredOutput.pivotTables![0]!;
    expect(decoded.workbook.sheets.get(restored.sourceSheetId)?.name).toBe(f.source.name);
    for (const key of [
      "name",
      "source",
      "anchor",
      "rowFields",
      "columnFields",
      "values",
      "filters",
      "axisFilters",
      "sort",
      "sortFields",
      "rowTotals",
      "columnTotals",
      "includeHidden",
      "totalLabel",
      "emptyLabel",
      "reportLayout",
      "presentation",
    ] as const)
      expect(restored[key], key).toEqual(expected[key]);
    expect(buildPivotResult(decoded.workbook, restored).matrix).toEqual(
      buildPivotResult(f.workbook, expected).matrix,
    );
    expect(decoded.workbook.sheets.size).toBe(2);
  });

  test("matrix consolidation writes native pages and rangeSets and preserves source page items without flattening sheets", async () => {
    const f = fixture();
    write(f.source, [
      ["Region", "Q1", "Q2"],
      ["East", 10, 20],
      ["West", 30, 40],
    ]);
    const second = createSheet("O'Brien", "second-source");
    insertSheet(f.workbook, second);
    write(second, [
      ["Region", "Q1", "Q2"],
      ["East", 50, 60],
      ["West", 70, 80],
    ]);
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } };
    f.table.source = range;
    f.table.consolidation = {
      labels: ["Row", "Column", "Value", "Area", "Year"],
      pageFields: { mode: "custom", count: 2 },
      ranges: [
        { sheetId: f.source.id, range, label: "North data", pageItems: ["North", "2026"] },
        { sheetId: second.id, range, label: "South data", pageItems: ["South", "2027"] },
      ],
    };
    f.table.values = [{ field: 2, aggregate: "sum", caption: "Sales total" }];
    f.table.filters = [
      { field: 3, all: false, values: ["North", "South"] },
      { field: 4, all: false, values: ["2026"] },
    ];
    f.table.axisFilters = undefined;
    f.table.sortFields = undefined;
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.output.id, f.table));
    const expected = f.output.pivotTables![0]!;
    const encoded = await encodeXlsx(f.workbook);
    noPivotOmission(encoded.report);
    const native = nativeParts(encoded.bytes);
    expect(native.cache.cacheSource["@_type"]).toBe("consolidation");
    const consolidation = native.cache.cacheSource.consolidation;
    expect(Number(consolidation.pages["@_count"])).toBe(2);
    expect(Number(consolidation.rangeSets["@_count"])).toBe(2);
    expect(Number(native.records["@_count"])).toBe(8);
    const decoded = await decodeXlsx(encoded.bytes);
    noPivotOmission(decoded.report);
    expect([...decoded.workbook.sheets.values()].map((sheet) => sheet.name).sort()).toEqual(
      [f.source.name, f.output.name, second.name].sort(),
    );
    const restored = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === f.output.name,
    )!.pivotTables![0]!;
    expect(restored.consolidation?.labels).toEqual(expected.consolidation!.labels);
    expect(restored.consolidation?.pageFields).toEqual(expected.consolidation!.pageFields);
    expect(
      restored.consolidation?.ranges.map((area) => ({
        ...area,
        sheetId: decoded.workbook.sheets.get(area.sheetId)?.name,
      })),
    ).toEqual(
      expected.consolidation!.ranges.map((area) => ({
        ...area,
        sheetId: f.workbook.sheets.get(area.sheetId)?.name,
      })),
    );
    expect(restored.filters).toEqual(expected.filters);
    expect(restored.values).toEqual(expected.values);
    expect(buildPivotResult(decoded.workbook, restored).matrix).toEqual(
      buildPivotResult(f.workbook, expected).matrix,
    );
  });
});
