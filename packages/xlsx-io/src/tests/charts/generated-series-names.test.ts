import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, setCellValue } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
function fixture(seriesBy: "columns" | "rows") {
  const f = nativeColumnFixture();
  f.sheet.cells.clear();
  [1, 2, 3].forEach((value, index) =>
    setCellValue(
      f.sheet,
      seriesBy === "columns" ? { row: index, column: 0 } : { row: 0, column: index },
      value,
    ),
  );
  f.drawing.chart = {
    ...f.drawing.chart,
    range: {
      start: { row: 0, column: 0 },
      end: seriesBy === "columns" ? { row: 2, column: 0 } : { row: 0, column: 2 },
    },
    seriesBy,
    headerRow: false,
    headerColumn: false,
    title: "Chart Title",
  };
  return f;
}
function importedChart(workbook: Awaited<ReturnType<typeof decodeXlsx>>["workbook"]) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((item) => item.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing chart after native import");
  return {
    drawing,
    data: getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id)),
  };
}
describe("generated series names native roundtrip", () => {
  test.each(["columns", "rows"] as const)(
    "%s use Series 1 consistently in Core, exported name/cache and native readback",
    async (seriesBy) => {
      const f = fixture(seriesBy);
      const data = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
      expect(data.series[0]!.name).toBe("Series 1");
      const out = await encodeXlsx(f.workbook);
      const entries = unzipSync(out.bytes);
      const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      expect(xml).toContain("&quot;Series 1&quot;");
      expect(xml).toContain("<c:v>Series 1</c:v>");
      expect(xml).toContain("Chart Title");
      const decoded = await decodeXlsx(out.bytes);
      const imported = importedChart(decoded.workbook);
      expect(imported.data.series[0]).toMatchObject({ name: "Series 1", values: [1, 2, 3] });
      expect(imported.drawing.chart.title).toBe("Chart Title");
      const second = await encodeXlsx(decoded.workbook);
      const secondXml = strFromU8(unzipSync(second.bytes)["xl/charts/chart1.xml"]!);
      expect(secondXml).toContain("&quot;Series 1&quot;");
      expect(secondXml).toContain("<c:v>Series 1</c:v>");
      const secondImported = importedChart((await decodeXlsx(second.bytes)).workbook);
      expect(secondImported.data).toEqual(imported.data);
    },
  );
  test("an established legacy ordinal generated name is accepted only for a headerless source", async () => {
    const f = fixture("columns");
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/charts/chart1.xml"] = strToU8(
      strFromU8(entries["xl/charts/chart1.xml"]!).replaceAll("Series 1", "1"),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(importedChart(decoded.workbook).data.series[0]!.name).toBe("Series 1");
    expect(decoded.report.issues.some((issue) => issue.code === "chart-cache-normalized")).toBe(
      true,
    );
  });
  test("an arbitrary literal name is not accepted as a generated default", async () => {
    const f = fixture("columns");
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/charts/chart1.xml"] = strToU8(
      strFromU8(entries["xl/charts/chart1.xml"]!).replaceAll("Series 1", "Business label"),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(
      [...decoded.workbook.sheets.values()][0]!.drawings?.some((item) => item.kind === "chart") ??
        false,
    ).toBe(false);
    expect(decoded.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  });
});
