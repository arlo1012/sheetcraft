import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
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
import { encodeXlsx, decodeXlsx } from "../../index.js";

function fixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  const output = createSheet("Sparse report", "sparse-report");
  insertSheet(workbook, output);
  [
    ["Region", "Quarter", "Amount"],
    ["East", "Q1", 0],
    ["West", "Q2", 9],
    [null, "Q1", 5],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(
        source,
        { row: r, column },
        value === null ? null : { kind: "literal", value },
      ),
    ),
  );
  const table: SheetPivotTable = {
    id: "sparse",
    name: "Sparse",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [1],
    values: [{ field: 2, aggregate: "sum", caption: "Sum of Amount" }],
    filters: [],
    sort: "source",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(空白)",
    reportLayout: {
      rowLabel: "Row",
      columnLabel: "Column",
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    },
  };
  executeWorkbookCommand(
    createWorkbookSession({ workbook, idFactory }),
    createSetPivotTableCommand(output.id, table),
  );
  return { workbook, table: output.pivotTables![0]! };
}
function pivotPart(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const path = Object.keys(entries).find((name) => /^xl\/pivotTables\/[^/]+\.xml$/.test(name))!;
  return { entries, path, xml: strFromU8(entries[path]!) };
}
function foreignBytes(bytes: Uint8Array, missingCaption: string) {
  const { entries, path, xml } = pivotPart(bytes);
  entries[path] = strToU8(
    xml
      .replace(/<ext\b[^>]*\buri="urn:sheetcraft:pivot:1"[^>]*>[\s\S]*?<\/ext>/g, "")
      .replace(/\bmissingCaption="[^"]*"/, `missingCaption="${missingCaption}"`),
  );
  return zipSync(entries);
}

describe("native pivot missing data cells", () => {
  test("exports an empty missing-data caption instead of the localized blank-member label", async () => {
    const f = fixture();
    const result = buildPivotResult(f.workbook, f.table, { useCache: true });
    expect(result.matrix.slice(2)).toEqual([
      ["East", 0, null, 0],
      ["West", null, 9, 9],
      ["(空白)", 5, null, 5],
      ["Grand Total", 5, 9, 14],
    ]);
    const { xml } = pivotPart((await encodeXlsx(f.workbook)).bytes);
    expect(xml).not.toContain('missingCaption="(空白)"');
    expect(/\bmissingCaption="([^"]*)"/.exec(xml)?.[1] ?? "").toBe("");
  });

  test("keeps physical empty intersections, actual zero, totals and localized member labels through product roundtrip", async () => {
    const f = fixture();
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    const output = [...decoded.workbook.sheets.values()].find(
      (sheet) => sheet.name === "Sparse report",
    )!;
    const restored = output.pivotTables![0]!;
    expect(restored.emptyLabel).toBe("(空白)");
    expect(buildPivotResult(decoded.workbook, restored, { useCache: true }).matrix).toEqual(
      buildPivotResult(f.workbook, f.table, { useCache: true }).matrix,
    );
    expect(getCellValue(output, { row: 2, column: 1 })).toBe(0);
    expect(getCellValue(output, { row: 2, column: 2 })).toBeNull();
    expect(getCellValue(output, { row: 3, column: 1 })).toBeNull();
    expect(getCellValue(output, { row: 4, column: 0 })).toBe("(空白)");
    expect(getCellValue(output, { row: 5, column: 3 })).toBe(14);
  });

  test.each(["", "N/A"])(
    "native-only missingCaption=%j does not redefine blank axis members or drop the pivot",
    async (missingCaption) => {
      const encoded = await encodeXlsx(fixture().workbook);
      const decoded = await decodeXlsx(foreignBytes(encoded.bytes, missingCaption));
      const output = [...decoded.workbook.sheets.values()].find(
        (sheet) => sheet.name === "Sparse report",
      )!;
      expect(
        decoded.report.issues.filter(
          (issue) =>
            issue.code === "feature-omitted" &&
            issue.locations.some((location) => location.includes("pivotTable")),
        ),
      ).toEqual([]);
      expect(output.pivotTables).toHaveLength(1);
      const restored = output.pivotTables![0]!;
      expect(restored.emptyLabel).toBe("(blank)");
      const result = buildPivotResult(decoded.workbook, restored, { useCache: true });
      expect(result.matrix[4]).toEqual(["(blank)", 5, null, 5]);
      expect(result.matrix[2]).toEqual(["East", 0, null, 0]);
      expect(result.matrix.at(-1)).toEqual(["Grand Total", 5, 9, 14]);
    },
  );
});
