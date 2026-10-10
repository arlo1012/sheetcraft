import { strFromU8, unzipSync } from "fflate/browser";
import { createSheetFilterHiddenRowIntervals } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type CellRange,
  type SheetFilter,
} from "@sheetcraft/core/workbook";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

function fixture(range: CellRange = { start: { row: 0, column: 0 }, end: { row: 4, column: 4 } }) {
  const workbook = createWorkbook({ id: "table-filter-ownership", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  const values = [
    ["Region", "Quarter", "Amount", "Units", "Row Total"],
    ["West", "Q1", 40, 5, 200],
    ["East", "Q2", 30, 4, 120],
    ["East", "Q1", 20, 3, 60],
    ["East", "Q1", 10, 2, 20],
  ];
  for (const [row, cells] of values.entries())
    for (const [column, value] of cells.entries())
      setCellContent(
        sheet,
        { row: range.start.row + row, column: range.start.column + column },
        { kind: "literal", value },
      );
  sheet.tables = [
    {
      id: "sales-table",
      name: "SalesTable",
      range,
      columns: values[0]!.map((name, index) => ({ id: String(index + 1), name: String(name) })),
      style: createBuiltinTableStyles().find((style) => style.id === "table-medium-2")!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    },
  ];
  return workbook;
}

function parts(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  return {
    worksheet: strFromU8(entries["xl/worksheets/sheet1.xml"]!),
    table: strFromU8(entries["xl/tables/table1.xml"]!),
    styles: strFromU8(entries["xl/styles.xml"]!),
  };
}

function eastFilter(): SheetFilter {
  return {
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 3 } },
    columns: [{ column: 0, allowedValues: [{ kind: "string", value: "East" }] }],
  };
}

describe("native table filter ownership", () => {
  test("promotes a same-row contained worksheet filter without mutating source range or criteria", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.filter = eastFilter();
    const source = JSON.stringify(serializeWorkbook(workbook));
    const hidden = createSheetFilterHiddenRowIntervals(sheet);
    const encoded = await encodeXlsx(workbook);
    const xml = parts(encoded.bytes);
    expect(xml.worksheet).not.toContain("<autoFilter");
    expect(xml.table).toContain('<autoFilter ref="A1:E5"><filterColumn colId="0">');
    expect(xml.table).toContain('<filter val="East"/>');
    expect(xml.table).toContain('ref="A1:E5"');
    expect(encoded.report.issues).toContainEqual(
      expect.objectContaining({ code: "filter-table-normalized" }),
    );
    expect(encoded.report.issues.some((issue) => issue.code === "filter-omitted")).toBe(false);
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.filter).toBeNull();
    expect(restored.tables?.[0]?.filter).toEqual({
      ...eastFilter(),
      range: sheet.tables![0]!.range,
    });
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual(hidden);
    expect(restored.hiddenRows).toEqual(new Set());
  });

  test("recalculates colId from the table start while preserving absolute condition columns", async () => {
    const workbook = fixture({ start: { row: 3, column: 1 }, end: { row: 7, column: 5 } });
    const sheet = getActiveSheet(workbook);
    sheet.filter = {
      range: { start: { row: 3, column: 2 }, end: { row: 7, column: 4 } },
      columns: [{ column: 3, allowedValues: [{ kind: "number", value: 40 }] }],
    };
    const hidden = createSheetFilterHiddenRowIntervals(sheet);
    const encoded = await encodeXlsx(workbook);
    expect(parts(encoded.bytes).table).toContain(
      '<autoFilter ref="B4:F8"><filterColumn colId="2">',
    );
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.tables?.[0]?.filter?.columns).toEqual(sheet.filter.columns);
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual(hidden);
  });

  test("keeps a disjoint worksheet filter in its original worksheet ownership", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.filter = {
      range: { start: { row: 0, column: 6 }, end: { row: 4, column: 7 } },
      columns: [{ column: 6, allowedValues: [{ kind: "string", value: "East" }] }],
    };
    const encoded = await encodeXlsx(workbook);
    expect(parts(encoded.bytes).worksheet).toContain('<autoFilter ref="G1:H5">');
    expect(parts(encoded.bytes).table).not.toContain("<autoFilter");
    expect(encoded.report.issues.some((issue) => issue.code === "filter-table-normalized")).toBe(
      false,
    );
    expect(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).filter).toEqual(sheet.filter);
  });

  test("allocates the promoted color criterion in the shared DXF table", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.filter = {
      ...eastFilter(),
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "color", target: "fill", color: "#f4b183" },
        },
      ],
    };
    const encoded = await encodeXlsx(workbook);
    const xml = parts(encoded.bytes);
    expect(xml.worksheet).not.toContain("<autoFilter");
    const dxfId = Number(/<colorFilter dxfId="(\d+)"/.exec(xml.table)?.[1]);
    const dxfs = [
      ...(/<dxfs\b[^>]*>([\s\S]*?)<\/dxfs>/.exec(xml.styles)?.[1] ?? "").matchAll(
        /<dxf>([\s\S]*?)<\/dxf>/g,
      ),
    ];
    expect(dxfs[dxfId]?.[1]).toContain('rgb="FFF4B183"');
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.filter?.columns,
    ).toEqual(sheet.filter.columns);
  });

  test("excludes a table totals row from the promoted filter body", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.tables![0]!.totalRow = true;
    sheet.tables![0]!.range.end.row = 5;
    sheet.filter = eastFilter();
    const encoded = await encodeXlsx(workbook);
    expect(parts(encoded.bytes).table).toContain('ref="A1:E6"');
    expect(parts(encoded.bytes).table).toContain('<autoFilter ref="A1:E5">');
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables?.[0]?.filter?.range.end.row,
    ).toBe(4);
  });

  test("rejects a table-owned filter with conflicting criteria even when domains match", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.filter = { ...eastFilter(), range: sheet.tables![0]!.range };
    sheet.tables![0]!.filter = {
      range: sheet.tables![0]!.range,
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "West" }] }],
    };
    const source = JSON.stringify(serializeWorkbook(workbook));
    await expect(encodeXlsx(workbook)).rejects.toThrow("overlapping worksheet/table filter");
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
  });

  test("retains the existing deduplication of an identical worksheet and table filter", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.filter = { ...eastFilter(), range: sheet.tables![0]!.range };
    sheet.tables![0]!.filter = JSON.parse(JSON.stringify(sheet.filter)) as SheetFilter;
    const source = JSON.stringify(serializeWorkbook(workbook));
    const encoded = await encodeXlsx(workbook);
    expect(parts(encoded.bytes).worksheet).not.toContain("<autoFilter");
    expect(parts(encoded.bytes).table).toContain('<autoFilter ref="A1:E5">');
    expect(encoded.report.issues.some((issue) => issue.code === "filter-table-normalized")).toBe(
      false,
    );
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
  });

  test.each([false, true])(
    "rejects a worksheet filter spanning two tables (owned filters: %j)",
    async (owned) => {
      const workbook = fixture();
      const sheet = getActiveSheet(workbook);
      const first = sheet.tables![0]!;
      sheet.tables!.push({
        ...first,
        id: "other-table",
        name: "OtherTable",
        range: { start: { row: 0, column: 6 }, end: { row: 4, column: 7 } },
        columns: [
          { id: "1", name: "Other" },
          { id: "2", name: "Value" },
        ],
      });
      sheet.filter = {
        ...eastFilter(),
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 7 } },
      };
      if (owned)
        for (const table of sheet.tables!) table.filter = { range: table.range, columns: [] };
      const source = JSON.stringify(serializeWorkbook(workbook));
      await expect(encodeXlsx(workbook)).rejects.toThrow("overlapping worksheet/table filter");
      expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
    },
  );

  test("rejects an overlap with a table that has no header row", async () => {
    const workbook = fixture();
    const sheet = getActiveSheet(workbook);
    sheet.tables![0]!.headerRow = false;
    sheet.filter = eastFilter();
    const source = JSON.stringify(serializeWorkbook(workbook));
    await expect(encodeXlsx(workbook)).rejects.toThrow("overlapping worksheet/table filter");
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
  });

  test.each([
    { start: { row: 1, column: 0 }, end: { row: 4, column: 3 } },
    { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } },
    { start: { row: 0, column: 0 }, end: { row: 4, column: 5 } },
  ])("rejects an overlap that cannot preserve the filter row/column domain: %j", async (range) => {
    const workbook = fixture();
    getActiveSheet(workbook).filter = { ...eastFilter(), range };
    const source = JSON.stringify(serializeWorkbook(workbook));
    await expect(encodeXlsx(workbook)).rejects.toThrow("overlapping worksheet/table filter");
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(source);
  });
});
