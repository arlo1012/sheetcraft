import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSetPivotTableCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import {
  buildPivotResult,
  type PivotLabelCondition,
  type PivotValueCondition,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@idea10/core/workbook";
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture(
  labelCondition?: PivotLabelCondition,
  valueCondition?: PivotValueCondition,
  labels = ["A", "B", "C", "D"],
) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  const output = createSheet("Report", "report");
  insertSheet(workbook, output);
  [["Label", "Amount"], ...labels.map((label, i) => [label, [80, 10, 5, 5][i]!])].forEach(
    (row, r) =>
      row.forEach((value, column) =>
        setCellContent(source, { row: r, column }, { kind: "literal", value }),
      ),
  );
  const table: SheetPivotTable = {
    id: "conditions",
    name: "Conditions",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: "Sum of Amount" }],
    filters: [],
    axisFilters: [
      {
        axis: "rows",
        field: 0,
        ...(labelCondition ? { labelCondition } : {}),
        ...(valueCondition ? { valueCondition: { measure: 0, condition: valueCondition } } : {}),
      },
    ],
    sort: "source",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    reportLayout: {
      rowLabel: "Row Labels",
      columnLabel: "Column Labels",
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
  const session = createWorkbookSession({ workbook, idFactory });
  executeWorkbookCommand(session, createSetPivotTableCommand(output.id, table));
  return { workbook, table: output.pivotTables![0]! };
}

function nativeOnly(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const path = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  const original = strFromU8(entries[path]!);
  const xml = original.replace(/<ext\b[^>]*\buri="urn:idea10:pivot:1"[^>]*>[\s\S]*?<\/ext>/g, "");
  expect(xml).not.toContain('uri="urn:idea10:pivot:1"');
  expect(original).toContain("x14:pivotField");
  expect(xml).toContain("x14:pivotField");
  entries[path] = strToU8(xml);
  return { bytes: zipSync(entries), xml };
}

async function nativeRoundtrip(f: ReturnType<typeof fixture>) {
  const encoded = await encodeXlsx(f.workbook);
  expect(
    encoded.report.issues.filter((issue) =>
      ["filter-omitted", "feature-omitted"].includes(issue.code),
    ),
  ).toEqual([]);
  const native = nativeOnly(encoded.bytes);
  const decoded = await decodeXlsx(native.bytes);
  expect(
    decoded.report.issues.filter((issue) =>
      ["filter-omitted", "feature-omitted"].includes(issue.code),
    ),
  ).toEqual([]);
  const restored = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Report")!
    .pivotTables![0]!;
  expect(restored).toBeDefined();
  expect(buildPivotResult(decoded.workbook, restored).matrix).toEqual(
    buildPivotResult(f.workbook, f.table).matrix,
  );
  expect(restored.axisFilters).toEqual(f.table.axisFilters);
  return { ...native, restored };
}

describe("native XLSX pivot conditions", () => {
  test.each([
    ["doesNotBeginWith", "captionNotBeginsWith"],
    ["doesNotEndWith", "captionNotEndsWith"],
  ] as const)(
    "retains negative label %s without product metadata",
    async (operator, nativeType) => {
      const { xml } = await nativeRoundtrip(fixture({ kind: "text", operator, value: "A" }));
      expect(xml).toContain(`type="${nativeType}"`);
      expect(xml).toContain('operator="notEqual"');
    },
  );

  test("retains wildcard escapes and XML entities in label conditions", async () => {
    const { xml } = await nativeRoundtrip(
      fixture({ kind: "text", operator: "equals", value: "A~*&<" }, undefined, [
        "A*&<",
        "B",
        "C",
        "D",
      ]),
    );
    expect(xml).toContain('stringValue1="A~*&amp;&lt;"');
    expect(xml).toContain('val="A~*&amp;&lt;"');
  });

  test.each(["between", "notBetween"] as const)(
    "retains label %s bounds and native filter type",
    async (operator) => {
      const { xml } = await nativeRoundtrip(
        fixture({ kind: "text", operator, value: "B", value2: "C" }),
      );
      expect(xml).toContain(`type="caption${operator === "between" ? "Between" : "NotBetween"}"`);
      expect(xml).toContain('stringValue2="C"');
      expect(xml).toContain(`<customFilters and="${operator === "between" ? 1 : 0}">`);
    },
  );

  test.each(["between", "notBetween"] as const)(
    "retains aggregated numeric %s bounds",
    async (operator) => {
      const { xml } = await nativeRoundtrip(
        fixture(undefined, { kind: "number", operator, value: 5, value2: 10 }),
      );
      expect(xml).toContain(`type="value${operator === "between" ? "Between" : "NotBetween"}"`);
      expect(xml).toContain('iMeasureFld="0"');
      expect(xml).toContain('val="5"');
      expect(xml).toContain('val="10"');
    },
  );

  test.each([
    ["items", "count", 2],
    ["percent", "percent", 50],
    ["sum", "sum", 85],
  ] as const)("retains Top N %s mode using native rank attributes", async (mode, type, count) => {
    const { xml } = await nativeRoundtrip(
      fixture(undefined, { kind: "rank", bottom: false, percent: mode === "percent", mode, count }),
    );
    expect(xml).toContain(`type="${type}"`);
    expect(xml).toContain(
      `<top10 top="1" percent="${mode === "percent" ? 1 : 0}" val="${count}"/>`,
    );
  });

  test("reports unsupported compound native conditions while preserving the full product roundtrip", async () => {
    const f = fixture({
      kind: "compound",
      operator: "or",
      conditions: [
        { kind: "text", operator: "equals", value: "A" },
        { kind: "text", operator: "equals", value: "D" },
      ],
    });
    const encoded = await encodeXlsx(f.workbook);
    expect(encoded.report.issues.some((issue) => issue.code === "filter-omitted")).toBe(true);
    expect(
      strFromU8(unzipSync(encoded.bytes)["xl/pivotCache/pivotCacheDefinition1.xml"]!),
    ).toContain('refreshOnLoad="0"');
    const decoded = await decodeXlsx(encoded.bytes);
    const restored = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Report")!
      .pivotTables![0]!;
    expect(restored.axisFilters).toEqual(f.table.axisFilters);
    expect(buildPivotResult(decoded.workbook, restored).matrix).toEqual(
      buildPivotResult(f.workbook, f.table).matrix,
    );
  });
  test("warns about hidden-source exclusion and preserves its cached result on opening externally", async () => {
    const f = fixture();
    f.table.includeHidden = false;
    const encoded = await encodeXlsx(f.workbook);
    expect(
      encoded.report.issues.some(
        (issue) =>
          issue.code === "filter-omitted" &&
          issue.locations.some((location) => location.endsWith(".includeHidden")),
      ),
    ).toBe(true);
    expect(
      strFromU8(unzipSync(encoded.bytes)["xl/pivotCache/pivotCacheDefinition1.xml"]!),
    ).toContain('refreshOnLoad="0"');
    const decoded = await decodeXlsx(encoded.bytes);
    expect(
      [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Report")!
        .pivotTables![0]!.includeHidden,
    ).toBe(false);
  });
});
