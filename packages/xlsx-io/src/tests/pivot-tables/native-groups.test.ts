import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { datePartsToExcelSerial } from "@sheetcraft/core/formula";
import {
  buildPivotResult,
  getPivotDetails,
  getPivotGroupLabels,
  type PivotFieldGroup,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
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
  group: PivotFieldGroup,
  values: number[],
  system: "1900" | "1904" = "1900",
  filter?: string,
) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory, dateSystem: system });
  const source = getActiveSheet(workbook);
  source.name = "Raw";
  const output = createSheet("Grouped", "grouped");
  insertSheet(workbook, output);
  [["Raw value"], ...values.map((value) => [value])].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value: value! }),
    ),
  );
  const table: SheetPivotTable = {
    id: "groups",
    name: "Grouped",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: values.length, column: 0 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    groups: [group],
    rowFields: [0],
    columnFields: [],
    values: [{ field: 0, aggregate: "sum", caption: "Raw sum" }],
    filters: [],
    ...(filter ? { axisFilters: [{ axis: "rows" as const, field: 0, values: [filter] }] } : {}),
    sort: "source",
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
      bandedRows: false,
      bandedColumns: false,
    },
  };
  executeWorkbookCommand(
    createWorkbookSession({ workbook, idFactory }),
    createSetPivotTableCommand(output.id, table),
  );
  return { workbook, output, table: output.pivotTables![0]!, values };
}
function parts(bytes: Uint8Array, strip = true) {
  const entries = unzipSync(bytes);
  const pivot = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  if (strip)
    entries[pivot] = strToU8(
      strFromU8(entries[pivot]!).replace(
        /<ext\b[^>]*\buri="urn:idea10:pivot:1"[^>]*>[\s\S]*?<\/ext>/g,
        "",
      ),
    );
  const cache = Object.keys(entries).find((name) =>
    /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/.test(name),
  )!;
  const records = Object.keys(entries).find((name) =>
    /^xl\/pivotCache\/pivotCacheRecords[^/]*\.xml$/.test(name),
  )!;
  return { entries, pivot, cache, records };
}
async function imported(bytes: Uint8Array) {
  const decoded = await decodeXlsx(bytes);
  const output = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Grouped")!;
  return { ...decoded, output, table: output.pivotTables?.[0] };
}
function numeric(filter?: string) {
  return fixture(
    { field: 0, kind: "number", start: 0, end: 29, interval: 10, autoStart: false, autoEnd: false },
    [2, 7, 12, 25],
    "1900",
    filter,
  );
}

describe("native in-place pivot grouping", () => {
  test.each([false, true])(
    "numeric grouping preserves raw cache, SUM and details with grouped filter=%s",
    async (filtered) => {
      const f = numeric(filtered ? "0-9" : undefined);
      const expected = buildPivotResult(f.workbook, f.table, { useCache: true });
      const encoded = await encodeXlsx(f.workbook);
      expect(encoded.report.issues.filter((issue) => issue.code === "feature-omitted")).toEqual([]);
      const p = parts(encoded.bytes);
      const cache = strFromU8(p.entries[p.cache]!);
      expect(cache).toContain('<cacheFields count="1">');
      expect(cache).toContain('<fieldGroup base="0">');
      expect(cache).toContain('startNum="0" endNum="29" groupInterval="10"');
      expect(cache).toContain('<n v="2"/>');
      expect(strFromU8(p.entries[p.records]!)).toContain('<r><x v="0"/></r>');
      const decoded = await imported(zipSync(p.entries));
      expect(decoded.table).toBeDefined();
      expect(decoded.table!.groups![0]).toMatchObject(f.table.groups![0]!);
      expect(decoded.table!.dataCache!.records).toEqual(f.values.map((value) => [value]));
      expect(buildPivotResult(decoded.workbook, decoded.table!, { useCache: true }).matrix).toEqual(
        expected.matrix,
      );
      const address = { row: expected.dataRows[0]!, column: expected.rowLabelColumns };
      expect(getCellValue(decoded.output, address)).toBe(9);
      expect(getPivotDetails(decoded.workbook, decoded.table!, address).records).toEqual([
        [2],
        [7],
      ]);
      expect(decoded.table!.axisFilters).toEqual(f.table.axisFilters);
    },
  );

  test.each([false, true])(
    "exact numeric endpoints round trip without singleton bins (autoEnd=%s)",
    async (autoEnd) => {
      const f = fixture(
        { field: 0, kind: "number", start: 0, end: 20, interval: 10, autoEnd },
        [2, 9.5, 20],
      );
      const expected = buildPivotResult(f.workbook, f.table, { useCache: true });
      expect(expected.rowLabels).toEqual(["0-10", "10-20"]);
      const p = parts((await encodeXlsx(f.workbook)).bytes);
      expect(strFromU8(p.entries[p.cache]!)).toContain('<groupItems count="4">');
      const decoded = await imported(zipSync(p.entries));
      expect(decoded.table).toBeDefined();
      expect(buildPivotResult(decoded.workbook, decoded.table!, { useCache: true }).matrix).toEqual(
        expected.matrix,
      );
      expect(decoded.table!.dataCache!.records).toEqual([[2], [9.5], [20]]);
    },
  );

  test.each(["1900", "1904"] as const)(
    "date grouping round trips native date cache in the %s date system",
    async (system) => {
      const serial = (month: number, day: number) =>
        datePartsToExcelSerial(
          { year: 2026, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
          system,
        );
      const values = [serial(1, 2), serial(1, 20), serial(2, 4)];
      const f = fixture(
        {
          field: 0,
          kind: "date",
          unit: "months",
          start: serial(1, 1),
          end: serial(12, 31),
          interval: 1,
          autoStart: false,
          autoEnd: false,
        },
        values,
        system,
      );
      const p = parts((await encodeXlsx(f.workbook)).bytes);
      const cache = strFromU8(p.entries[p.cache]!);
      expect(cache).toContain('groupBy="months"');
      expect(cache).toContain('<d v="2026-01-02T00:00:00.000"/>');
      const decoded = await imported(zipSync(p.entries));
      expect(decoded.workbook.dateSystem).toBe(system);
      expect(decoded.table!.groups![0]).toMatchObject(f.table.groups![0]!);
      expect(decoded.table!.dataCache!.records).toEqual(values.map((value) => [value]));
      const result = buildPivotResult(decoded.workbook, decoded.table!, { useCache: true });
      expect(result.matrix).toEqual(
        buildPivotResult(f.workbook, f.table, { useCache: true }).matrix,
      );
      const address = { row: result.dataRows[0]!, column: result.rowLabelColumns };
      expect(getCellValue(decoded.output, address)).toBe(values[0]! + values[1]!);
      expect(getPivotDetails(decoded.workbook, decoded.table!, address).records).toEqual(
        values.slice(0, 2).map((value) => [value]),
      );
    },
  );

  test("native range edits win over the stale product group extension", async () => {
    const f = numeric();
    const p = parts((await encodeXlsx(f.workbook)).bytes, false);
    const changed: PivotFieldGroup = { ...f.table.groups![0]!, start: 1 };
    const labels = getPivotGroupLabels(changed, "1900");
    p.entries[p.cache] = strToU8(
      strFromU8(p.entries[p.cache]!)
        .replace('startNum="0"', 'startNum="1"')
        .replace(
          /<groupItems\b[^>]*>[\s\S]*?<\/groupItems>/,
          `<groupItems count="${labels.length}">${labels.map((label) => `<s v="${label.replace(/</g, "&lt;").replace(/>/g, "&gt;")}"/>`).join("")}</groupItems>`,
        ),
    );
    const decoded = await imported(zipSync(p.entries));
    expect(decoded.table!.groups![0]!.start).toBe(1);
  });

  test.each(["nested", "discrete"] as const)(
    "explicitly omits unsupported %s grouping and retains physical report cells",
    async (kind) => {
      const f = numeric();
      const p = parts((await encodeXlsx(f.workbook)).bytes);
      p.entries[p.cache] = strToU8(
        strFromU8(p.entries[p.cache]!).replace(
          '<fieldGroup base="0">',
          kind === "nested"
            ? '<fieldGroup base="0" par="1">'
            : '<fieldGroup base="0"><discretePr count="1"><x v="0"/></discretePr>',
        ),
      );
      const decoded = await imported(zipSync(p.entries));
      expect(decoded.table).toBeUndefined();
      expect(decoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
      expect(getCellValue(decoded.output, { row: 2, column: 1 })).toBe(
        getCellValue(f.output, { row: 2, column: 1 }),
      );
    },
  );

  test.each([0, 60])(
    "Excel-only serial %s omits native date grouping with a warning and retains physical cells",
    async (serial) => {
      const f = fixture(
        { field: 0, kind: "date", unit: "days", start: serial, end: serial + 1, interval: 1 },
        [serial],
        "1900",
      );
      const encoded = await encodeXlsx(f.workbook);
      expect(encoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
      const decoded = await imported(encoded.bytes);
      expect(getCellValue(decoded.output, { row: 2, column: 1 })).toBe(serial);
    },
  );

  test("a raw Excel-only date cache value warns even when the group bounds are valid XML dates", async () => {
    const f = fixture(
      { field: 0, kind: "date", unit: "days", start: 1, end: 61, interval: 1 },
      [60],
      "1900",
    );
    const encoded = await encodeXlsx(f.workbook);
    expect(encoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
    const decoded = await imported(encoded.bytes);
    expect(getCellValue(decoded.output, { row: 2, column: 1 })).toBe(60);
  });

  test.each(["numgroup", "dategroup"] as const)(
    "imports independent ClosedXML shared-%s.xlsx fixture without product metadata",
    async (kind) => {
      const bytes = new Uint8Array(
        await readFile(new URL(`./fixtures/closedxml-shared-${kind}.xlsx`, import.meta.url)),
      );
      const decoded = await decodeXlsx(bytes);
      const tables = [...decoded.workbook.sheets.values()].flatMap(
        (sheet) => sheet.pivotTables ?? [],
      );
      expect(tables).toHaveLength(2);
      expect(
        decoded.report.issues.filter(
          (issue) =>
            issue.code === "feature-omitted" &&
            issue.locations.some((location) => location.includes("pivotTable")),
        ),
      ).toEqual([]);
      for (const table of tables) {
        expect(table.groups!.find((group) => group.field === 0)).toMatchObject({
          kind: "date",
          unit: "years",
        });
        if (kind === "numgroup")
          expect(table.groups!.find((group) => group.field === 5)).toMatchObject({
            kind: "number",
            start: 32674,
            end: 107286,
            interval: 15000,
          });
        expect(table.dataCache!.records).toHaveLength(24);
        expect(typeof table.dataCache!.records[0]![0]).toBe("number");
      }
    },
  );
});
