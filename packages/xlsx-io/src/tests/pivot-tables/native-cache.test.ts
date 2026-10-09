import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import {
  buildPivotResult,
  getPivotDetails,
  isPivotValueCell,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { createFormulaError } from "@sheetcraft/core/formula";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellValue,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { readPivotCacheRecords } from "../../pivot-cache.js";
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture(consolidation = false, mixed = false) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory, dateSystem: "1904" });
  const source = getActiveSheet(workbook);
  source.name = "Source";
  const output = createSheet("Report", "report");
  insertSheet(workbook, output);
  const rows = mixed
    ? [
        ["Label", "Amount", "Flag", "Blank", "Error", "When", "Text"],
        ["A", 10, true, null, "error", 1, "last"],
        ["B", 20, false, null, "error", 2, "first"],
      ]
    : [
        ["Label", "Amount"],
        ["A", 10],
        ["B", 20],
      ];
  rows.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(
        source,
        { row: r, column },
        value === null ? null : { kind: "literal", value: value! },
      ),
    ),
  );
  const range = { start: { row: 0, column: 0 }, end: { row: 2, column: rows[0]!.length - 1 } };
  const table: SheetPivotTable = {
    id: "cache",
    name: "Cache",
    sourceSheetId: source.id,
    source: range,
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: consolidation ? 2 : 1, aggregate: "sum", caption: "Total amount" }],
    filters: [],
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
    ...(consolidation
      ? {
          consolidation: {
            labels: ["Row", "Column", "Value"],
            pageFields: { mode: "custom" as const, count: 0 },
            ranges: [{ sheetId: source.id, range, label: "Source", pageItems: [] }],
          },
        }
      : {}),
  };
  const session = createWorkbookSession({ workbook, idFactory });
  executeWorkbookCommand(session, createSetPivotTableCommand(output.id, table));
  return { workbook, source, output, session, table: output.pivotTables![0]! };
}
function nativeEntries(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const definition = Object.keys(entries).find((name) =>
    /^xl\/pivotTables\/[^/]+\.xml$/.test(name),
  )!;
  entries[definition] = strToU8(
    strFromU8(entries[definition]!).replace(
      /<ext\b[^>]*\buri="urn:sheetcraft:pivot:1"[^>]*>[\s\S]*?<\/ext>/g,
      "",
    ),
  );
  return {
    entries,
    cache: Object.keys(entries).find((name) =>
      /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/.test(name),
    )!,
    records: Object.keys(entries).find((name) =>
      /^xl\/pivotCache\/pivotCacheRecords[^/]*\.xml$/.test(name),
    )!,
  };
}
async function reopened(bytes: Uint8Array) {
  const decoded = await decodeXlsx(bytes);
  const output = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Report")!;
  return { ...decoded, output, table: output.pivotTables?.[0] };
}

describe("native pivot cache fidelity", () => {
  test.each([false, true])(
    "exports the last refresh cache independently of later source edits with consolidation=%s",
    async (consolidation) => {
      const f = fixture(consolidation);
      const firstResult = buildPivotResult(f.workbook, f.table, { useCache: true });
      const valueAddress = { row: firstResult.dataRows[0]!, column: firstResult.rowLabelColumns };
      setCellContent(f.source, { row: 1, column: 1 }, { kind: "literal", value: 99 });
      const encoded = await encodeXlsx(f.workbook);
      const native = nativeEntries(encoded.bytes);
      expect(strFromU8(native.entries[native.cache]!)).toContain('refreshOnLoad="0"');
      const decoded = await reopened(zipSync(native.entries));
      expect(decoded.table).toBeDefined();
      expect(decoded.report.issues.filter((issue) => issue.code === "feature-omitted")).toEqual([]);
      const source = [...decoded.workbook.sheets.values()].find(
        (sheet) => sheet.name === "Source",
      )!;
      expect(getCellValue(source, { row: 1, column: 1 })).toBe(99);
      expect(getCellValue(decoded.output, valueAddress)).toBe(10);
      expect(isPivotValueCell(decoded.table!, valueAddress)).toBe(true);
      expect(buildPivotResult(decoded.workbook, decoded.table!, { useCache: true }).matrix).toEqual(
        firstResult.matrix,
      );
      expect(
        getPivotDetails(decoded.workbook, decoded.table!, valueAddress).records[0]![
          consolidation ? 2 : 1
        ],
      ).toBe(10);
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.output.id, f.output.pivotTables![0]!),
      );
      const refreshedBytes = await encodeXlsx(f.workbook);
      const refreshedNative = nativeEntries(refreshedBytes.bytes);
      const refreshed = await reopened(zipSync(refreshedNative.entries));
      expect(getCellValue(refreshed.output, valueAddress)).toBe(99);
      expect(
        getPivotDetails(refreshed.workbook, refreshed.table!, valueAddress).records[0]![
          consolidation ? 2 : 1
        ],
      ).toBe(99);
    },
  );

  test("imports ordered mixed shared indices and direct values including 1904 dates", async () => {
    const encoded = await encodeXlsx(fixture(false, true).workbook);
    const native = nativeEntries(encoded.bytes);
    let field = -1;
    native.entries[native.cache] = strToU8(
      strFromU8(native.entries[native.cache]!).replace(
        /<sharedItems\b[^>]*>[\s\S]*?<\/sharedItems>/g,
        (original) => {
          field++;
          return field === 6
            ? '<sharedItems count="6"><s v="first"/><b v="1"/><m/><n v="9"/><e v="#N/A"/><s v="last"/></sharedItems>'
            : original;
        },
      ),
    );
    native.entries[native.records] = strToU8(
      '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2"><r><x v="0"/><n v="10"/><b v="1"/><m/><e v="#DIV/0!"/><d v="1904-01-02T12:00:00"/><x v="5"/></r><r><x v="1"/><x v="1"/><b v="0"/><m/><e v="#N/A"/><d v="1904-01-03T00:00:00"/><x v="0"/></r></pivotCacheRecords>',
    );
    const decoded = await reopened(zipSync(native.entries));
    expect(decoded.report.issues.filter((issue) => issue.code === "feature-omitted")).toEqual([]);
    expect(decoded.table!.dataCache!.records).toEqual([
      ["A", 10, true, null, createFormulaError("DIV0"), 1.5, "last"],
      ["B", 20, false, null, createFormulaError("NA"), 2, "first"],
    ]);
  });

  test.each(["index", "width", "oversized"] as const)(
    "reports malformed %s cache payloads instead of importing a misleading report",
    async (kind) => {
      const native = nativeEntries((await encodeXlsx(fixture().workbook)).bytes);
      let records = kind === "index" ? '<r><x v="999"/><x v="0"/></r>' : '<r><x v="0"/></r>';
      if (kind === "oversized") {
        const headers = Array.from({ length: 1000 }, (_, i) => `Field${i}`);
        records = "<r/>".repeat(700);
        const bytes = strToU8(`<pivotCacheRecords>${records}</pivotCacheRecords>`);
        expect(() =>
          readPivotCacheRecords(bytes, { headers, shared: headers.map(() => []) }, "1904"),
        ).toThrow("too large");
        native.entries[native.cache] = strToU8(
          strFromU8(native.entries[native.cache]!).replace(
            /<cacheFields\b[^>]*>[\s\S]*?<\/cacheFields>/,
            `<cacheFields count="1000">${headers.map((name) => `<cacheField name="${name}"><sharedItems count="1"><s v="A"/></sharedItems></cacheField>`).join("")}</cacheFields>`,
          ),
        );
      }
      native.entries[native.records] = strToU8(
        `<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${records}</pivotCacheRecords>`,
      );
      const decoded = await reopened(zipSync(native.entries));
      expect(decoded.table).toBeUndefined();
      expect(
        decoded.report.issues.some(
          (issue) =>
            issue.code === "feature-omitted" &&
            issue.locations.some((location) => location.includes("pivotTable")),
        ),
      ).toBe(true);
    },
  );
});
