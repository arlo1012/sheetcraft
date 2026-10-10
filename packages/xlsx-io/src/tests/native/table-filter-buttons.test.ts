import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheetFilterHiddenRowIntervals } from "@sheetcraft/core/commands";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { decodeXlsx, encodeXlsx } from "../../index.js";

function fixture(buttons = false, criteria = false) {
  const workbook = createWorkbook({ id: "table-buttons", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  for (const [row, cells] of [
    ["Region", "Amount"],
    ["North", 10],
    ["South", 20],
  ].entries())
    cells.forEach((value, column) =>
      setCellContent(sheet, { row, column }, { kind: "literal", value }),
    );
  sheet.tables = [
    {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [
        { id: "region", name: "Region" },
        { id: "amount", name: "Amount" },
      ],
      style: createBuiltinTableStyles()[1]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: buttons,
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        columns: criteria
          ? [{ column: 0, allowedValues: [{ kind: "string", value: "North" }] }]
          : [],
      },
    },
  ];
  return { workbook, sheet };
}

function parts(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  return { entries, xml: strFromU8(entries["xl/tables/table1.xml"]!) };
}

describe("native table filter buttons", () => {
  test("does not silently collapse duplicated active filter criteria when hiding buttons", async () => {
    const f = fixture(false, true);
    f.sheet.tables![0]!.filter!.columns.push({
      column: 0,
      allowedValues: [{ kind: "string", value: "South" }],
    });
    const before = JSON.stringify(f.sheet.tables);
    await expect(encodeXlsx(f.workbook)).rejects.toThrow(
      /Filter columns must be unique|Invalid filter columns/,
    );
    expect(JSON.stringify(f.sheet.tables)).toBe(before);
  });
  test("keeps active criteria and numeric formula totals when buttons are hidden", async () => {
    const f = fixture(false, true);
    f.sheet.tables![0]!.totalRow = true;
    f.sheet.tables![0]!.range.end.row = 3;
    setCellContent(
      f.sheet,
      { row: 3, column: 1 },
      { kind: "formula", formula: { source: "=SUBTOTAL(109,B2:B3)" } },
    );
    const encoded = await encodeXlsx(f.workbook);
    expect(parts(encoded.bytes).xml).toContain('<autoFilter ref="A1:B3">');
    expect(parts(encoded.bytes).xml).toContain('totalsRowFunction="sum"');
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    expect(restored.tables![0]!.filterButton).toBe(false);
    expect(restored.tables![0]!.filter).toEqual(f.sheet.tables![0]!.filter);
    expect(createSheetFilterHiddenRowIntervals(restored)).toEqual(
      createSheetFilterHiddenRowIntervals(f.sheet),
    );
  });
  test("does not add filter metadata to a headerless buttons-off table", async () => {
    const f = fixture(false);
    f.sheet.tables![0]!.headerRow = false;
    f.sheet.tables![0]!.filter = null;
    const encoded = await encodeXlsx(f.workbook);
    expect(parts(encoded.bytes).xml).not.toContain("<autoFilter");
    const table = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables![0]!;
    expect(table.headerRow).toBe(false);
    expect(table.filterButton).toBe(false);
    expect(table.filter).toBeNull();
  });
  test.each(["0", "false"])("reads all native showButton=%s as hidden", async (flag) => {
    const f = fixture();
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    p.entries["xl/tables/table1.xml"] = strToU8(
      p.xml.replace(/hiddenButton="1"/g, `showButton="${flag}"`),
    );
    expect(
      getActiveSheet((await decodeXlsx(zipSync(p.entries))).workbook).tables![0]!.filterButton,
    ).toBe(false);
  });
  test("preserves the old product's misplaced attributes on read without writing them again", async () => {
    const f = fixture(true);
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    p.entries["xl/tables/table1.xml"] = strToU8(
      p.xml.replace(/<tableColumn\b/g, '<tableColumn hiddenButton="1"'),
    );
    const decoded = await decodeXlsx(zipSync(p.entries));
    expect(getActiveSheet(decoded.workbook).tables![0]!.filterButton).toBe(false);
    expect(parts((await encodeXlsx(decoded.workbook)).bytes).xml).not.toMatch(
      /<tableColumn\b[^>]*hiddenButton/,
    );
  });
  test.each([
    'colId="1e0" hiddenButton="1"',
    'colId="0" hiddenButton="1"',
    'colId="1" hiddenButton="maybe"',
  ])(
    "warns on malformed or repeated native visibility instead of silently treating it as all hidden (%s)",
    async (attrs) => {
      const f = fixture();
      const p = parts((await encodeXlsx(f.workbook)).bytes);
      p.entries["xl/tables/table1.xml"] = strToU8(
        p.xml.replace('colId="1" hiddenButton="1"', attrs),
      );
      const decoded = await decodeXlsx(zipSync(p.entries));
      expect(getActiveSheet(decoded.workbook).tables![0]!.filterButton).toBe(true);
      expect(decoded.report.issues).toContainEqual(
        expect.objectContaining({ code: "feature-omitted" }),
      );
    },
  );
  test.each([false, true])(
    "uses filterColumn visibility without changing criteria or source (criteria=%s)",
    async (criteria) => {
      const f = fixture(false, criteria);
      const before = serializeWorkbook(f.workbook);
      const hidden = createSheetFilterHiddenRowIntervals(f.sheet);
      const encoded = await encodeXlsx(f.workbook);
      const p = parts(encoded.bytes);
      expect(p.xml).not.toMatch(/<tableColumn\b[^>]*hiddenButton/);
      expect(p.xml.match(/hiddenButton="1"/g)).toHaveLength(2);
      expect(p.xml).toContain('<filterColumn colId="1" hiddenButton="1"/>');
      const decoded = await decodeXlsx(encoded.bytes);
      const restored = getActiveSheet(decoded.workbook);
      expect(restored.tables![0]!.filterButton).toBe(false);
      expect(restored.tables![0]!.filter).toEqual(f.sheet.tables![0]!.filter);
      expect(createSheetFilterHiddenRowIntervals(restored)).toEqual(hidden);
      expect(decoded.report.issues.some((issue) => issue.code === "filter-omitted")).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(
        parts((await encodeXlsx(decoded.workbook)).bytes).xml.match(/hiddenButton="1"/g),
      ).toHaveLength(2);
    },
  );
  test("exports visible buttons for an unfiltered header table even with null Core filter", async () => {
    const f = fixture(true);
    f.sheet.tables![0]!.filter = null;
    const encoded = await encodeXlsx(f.workbook);
    expect(parts(encoded.bytes).xml).toContain('<autoFilter ref="A1:B3">');
    expect(parts(encoded.bytes).xml).not.toContain("hiddenButton");
    expect(
      getActiveSheet((await decodeXlsx(encoded.bytes)).workbook).tables![0]!.filterButton,
    ).toBe(true);
    expect(f.sheet.tables![0]!.filter).toBeNull();
  });
  test("reads native removal of autoFilter as buttons off", async () => {
    const f = fixture(true);
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    p.entries["xl/tables/table1.xml"] = strToU8(
      p.xml.replace(/<autoFilter\b[\s\S]*?<\/autoFilter>/, ""),
    );
    const restored = getActiveSheet((await decodeXlsx(zipSync(p.entries))).workbook).tables![0]!;
    expect(restored.filterButton).toBe(false);
    expect(restored.filter).toBeNull();
  });
  test("does not reinterpret paired empty visibility columns as a filter that hides all rows", async () => {
    const f = fixture();
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    p.entries["xl/tables/table1.xml"] = strToU8(
      p.xml.replace(/(<filterColumn\b[^>]*?)\/>/g, "$1></filterColumn>"),
    );
    const decoded = await decodeXlsx(zipSync(p.entries));
    expect(getActiveSheet(decoded.workbook).tables![0]!.filter!.columns).toEqual([]);
    expect(createSheetFilterHiddenRowIntervals(getActiveSheet(decoded.workbook))).toEqual([]);
    expect(decoded.report.issues.some((issue) => issue.code === "filter-omitted")).toBe(false);
  });
  test("warns on a partially hidden native header rather than claiming a global off setting", async () => {
    const f = fixture();
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    p.entries["xl/tables/table1.xml"] = strToU8(
      p.xml.replace('<filterColumn colId="1" hiddenButton="1"/>', '<filterColumn colId="1"/>'),
    );
    const decoded = await decodeXlsx(zipSync(p.entries));
    expect(getActiveSheet(decoded.workbook).tables![0]!.filterButton).toBe(true);
    expect(decoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: expect.arrayContaining(["Sales.filterButtonVisibility"]),
      }),
    );
  });
});
