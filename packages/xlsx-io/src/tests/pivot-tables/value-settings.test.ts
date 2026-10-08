import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { XMLParser } from "fast-xml-parser";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSetPivotTableCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import {
  buildPivotResult,
  type PivotAggregate,
  type PivotValueDisplay,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  getCellStyle,
  getCellValue,
  insertSheet,
  setCellContent,
} from "@idea10/core/workbook";
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture(
  aggregate: PivotAggregate = "sum",
  display?: PivotValueDisplay,
  formatted = false,
) {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  const output = createSheet("Values", "values");
  insertSheet(workbook, output);
  [
    ["Region", "Team", "Quarter", "Amount"],
    ["East", "A", "Q1", 2],
    ["East", "A", "Q1", 4],
    ["East", "B", "Q2", 8],
    ["West", "A", "Q1", 16],
    ["West", "B", "Q2", 32],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetPivotTable = {
    id: "values",
    name: "Values",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 5, column: 3 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0, 1],
    columnFields: [2],
    values: [
      {
        field: 3,
        aggregate,
        caption: "Measure",
        ...(display ? { display } : {}),
        ...(formatted
          ? { numberFormat: { kind: "custom" as const, code: '"ratio "0.0000%' } }
          : {}),
      },
    ],
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
      allLabel: "All",
      multipleLabel: "Multiple",
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
  return { workbook, source, output, session, table: output.pivotTables![0]! };
}
function native(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const path = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  const xml = strFromU8(entries[path]!);
  const root = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(
    xml,
  ).pivotTableDefinition;
  entries[path] = strToU8(
    xml.replace(/<ext\b[^>]*\buri="urn:idea10:pivot:1"[^>]*>[\s\S]*?<\/ext>/g, ""),
  );
  return { entries, xml, field: root.dataFields.dataField, bytes: zipSync(entries) };
}
async function restored(bytes: Uint8Array) {
  const decoded = await decodeXlsx(bytes);
  const output = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Values")!;
  return { ...decoded, output, table: output.pivotTables?.[0] };
}
const fieldTypes = [
  "percent",
  "difference",
  "percentDiff",
  "runTotal",
  "percentOfParent",
  "percentOfRunningTotal",
  "rankAscending",
  "rankDescending",
];
const extended = [
  "percentOfParentRow",
  "percentOfParentCol",
  "percentOfParent",
  "percentOfRunningTotal",
  "rankAscending",
  "rankDescending",
];
const modes = [
  "normal",
  "percentOfTotal",
  "percentOfRow",
  "percentOfCol",
  "percent",
  "difference",
  "percentDiff",
  "runTotal",
  "index",
  "percentOfParentRow",
  "percentOfParentCol",
  "percentOfParent",
  "percentOfRunningTotal",
  "rankAscending",
  "rankDescending",
] as const;

describe("native pivot value settings", () => {
  test.each(modes)(
    "preserves %s display through native-only import without normal fallback",
    async (type) => {
      const display: PivotValueDisplay = {
        type,
        ...(fieldTypes.includes(type) ? { baseField: 0 } : {}),
        ...(["percent", "difference", "percentDiff"].includes(type)
          ? { baseItem: { kind: "previous" as const } }
          : {}),
      };
      const f = fixture("sum", display);
      const encoded = await encodeXlsx(f.workbook);
      expect(encoded.report.issues.filter((issue) => issue.code === "feature-omitted")).toEqual([]);
      const p = native(encoded.bytes);
      if (extended.includes(type)) {
        expect(p.field.extLst.ext["@_uri"]).toBe("{E15A36E0-9728-4E99-A89B-3F7291B0FE68}");
        expect(p.field.extLst.ext.dataField["@_pivotShowAs"]).toBe(type);
      } else expect(p.field["@_showDataAs"] ?? "normal").toBe(type);
      const decoded = await restored(p.bytes);
      expect(decoded.table).toBeDefined();
      expect(decoded.table!.values[0]!.display ?? { type: "normal" }).toEqual(display);
      expect(buildPivotResult(decoded.workbook, decoded.table!, { useCache: true }).matrix).toEqual(
        buildPivotResult(f.workbook, f.table, { useCache: true }).matrix,
      );
    },
  );

  test.each([
    ["product", "product", 32768],
    ["countNums", "countNums", 5],
    ["stdev", "stdDev", Math.sqrt(148.8)],
    ["stdevp", "stdDevp", Math.sqrt(119.04)],
    ["var", "var", 148.8],
    ["varp", "varp", 119.04],
  ] as const)(
    "round trips %s with the native %s subtotal and correct total",
    async (aggregate, subtotal, total) => {
      const f = fixture(aggregate);
      const p = native((await encodeXlsx(f.workbook)).bytes);
      expect(p.field["@_subtotal"]).toBe(subtotal);
      const decoded = await restored(p.bytes);
      expect(decoded.table!.values[0]!.aggregate).toBe(aggregate);
      const result = buildPivotResult(decoded.workbook, decoded.table!, { useCache: true });
      expect(result.matrix.at(-1)!.at(-1)).toBeCloseTo(total);
      expect(result.matrix).toEqual(
        buildPivotResult(f.workbook, f.table, { useCache: true }).matrix,
      );
    },
  );

  test.each([
    [{ kind: "previous" }, 1048828],
    [{ kind: "next" }, 1048829],
    [{ kind: "value", value: "East" }, 0],
  ] as const)("preserves base item %j and its native index", async (baseItem, index) => {
    const f = fixture("sum", { type: "difference", baseField: 0, baseItem });
    const p = native((await encodeXlsx(f.workbook)).bytes);
    expect(Number(p.field["@_baseField"])).toBe(0);
    expect(Number(p.field["@_baseItem"])).toBe(index);
    const decoded = await restored(p.bytes);
    expect(decoded.table!.values[0]!.display!.baseItem).toEqual(baseItem);
  });

  test("preserves explicit custom number formats through product/native imports and refresh", async () => {
    const f = fixture("sum", { type: "percentOfTotal" }, true);
    const encoded = await encodeXlsx(f.workbook);
    const p = native(encoded.bytes);
    expect(Number(p.field["@_numFmtId"])).toBeGreaterThanOrEqual(164);
    expect(strFromU8(p.entries["xl/styles.xml"]!)).toContain(
      'formatCode="&quot;ratio &quot;0.0000%"',
    );
    for (const bytes of [encoded.bytes, p.bytes]) {
      const decoded = await restored(bytes);
      expect(decoded.table!.values[0]!.numberFormat).toEqual(f.table.values[0]!.numberFormat);
      const result = buildPivotResult(decoded.workbook, decoded.table!, { useCache: true });
      const address = { row: result.dataRows[0]!, column: result.rowLabelColumns };
      const before = getCellStyle(decoded.output, address)?.numberFormat;
      executeWorkbookCommand(
        createWorkbookSession({
          workbook: decoded.workbook,
          idFactory: createSequentialIdFactory(),
        }),
        createSetPivotTableCommand(decoded.output.id, decoded.table!),
      );
      expect(getCellStyle(decoded.output, address)?.numberFormat).toEqual(before);
      expect(before).toEqual(f.table.values[0]!.numberFormat);
    }
  });

  test("distinct count reports native omission while retaining correct worksheet cells", async () => {
    const f = fixture("distinctCount");
    const encoded = await encodeXlsx(f.workbook);
    expect(encoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
    const entries = unzipSync(encoded.bytes);
    expect(
      Object.keys(entries).filter((path) => /^xl\/pivotTables\/[^/]+\.xml$/.test(path)),
    ).toEqual([]);
    const decoded = await restored(encoded.bytes);
    expect(decoded.table).toBeUndefined();
    const result = buildPivotResult(f.workbook, f.table, { useCache: true });
    expect(result.matrix.at(-1)!.at(-1)).toBe(5);
    expect(
      getCellValue(decoded.output, { row: result.totalRow!, column: result.matrix[0]!.length - 1 }),
    ).toBe(5);
  });
});
