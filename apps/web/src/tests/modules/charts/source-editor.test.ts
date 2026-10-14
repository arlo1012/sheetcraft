import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import {
  parseChartSourceCategories,
  parseChartSourceName,
  parseChartSourceValues,
  formatChartSourceName,
  formatChartSourceValues,
} from "../../../modules/charts/chart-source-editor";
function fixture() {
  const workbook = createWorkbook({ id: "parse", sheetId: "first", sheetName: "Sheet1" });
  const sheet = getActiveSheet(workbook);
  const second = createSheet("Quarter's data", "second");
  insertSheet(workbook, second);
  return { workbook, sheet, second };
}
describe("bounded chart source input", () => {
  test("literal names and quoted cross-sheet cells round-trip without changing text", () => {
    const f = fixture();
    expect(parseChartSourceName(f.workbook, " 苹果 ", f.sheet.id)).toEqual({
      kind: "literal",
      text: " 苹果 ",
    });
    const name = parseChartSourceName(f.workbook, "='quarter''s data'!b1", f.sheet.id)!;
    expect(name).toEqual({ kind: "cell", sheetId: f.second.id, cell: { row: 0, column: 1 } });
    expect(formatChartSourceName(f.workbook, name)).toBe("='Quarter''s data'!$B$1");
  });
  test("finite literal vectors and within-workbook row/column references normalize", () => {
    const f = fixture();
    const values = parseChartSourceValues(f.workbook, "={10, -2.5, 3e2}", f.sheet.id)!;
    expect(values).toEqual({ kind: "literal", values: [10, -2.5, 300] });
    expect(formatChartSourceValues(f.workbook, values)).toBe("={10,-2.5,300}");
    expect(
      parseChartSourceCategories(f.workbook, "='Quarter''s data'!A2:A4", f.sheet.id),
    ).toMatchObject({ kind: "range", sheetId: f.second.id });
  });
  test.each([
    "={}",
    "={1,}",
    "={NaN,2}",
    "={1e309}",
    "={1;2}",
    "={1,+Sheet1!A1}",
    "=Sheet1!A1:B2",
    "=Missing!A1:A3",
    "=[Book]Sheet1!A1:A3",
    "=SUM(A1:A3)",
    "=A1:A10001",
  ])("rejects unsafe or unbounded values input %s", (text) => {
    const f = fixture();
    expect(parseChartSourceValues(f.workbook, text, f.sheet.id)).toBeUndefined();
  });
  test("a name reference must select exactly one cell and categories must remain a reference", () => {
    const f = fixture();
    expect(parseChartSourceName(f.workbook, "=A1:A2", f.sheet.id)).toBeUndefined();
    expect(parseChartSourceCategories(f.workbook, "={1,2,3}", f.sheet.id)).toBeUndefined();
    expect(parseChartSourceCategories(f.workbook, "=A1:B2", f.sheet.id)).toBeUndefined();
  });
});
