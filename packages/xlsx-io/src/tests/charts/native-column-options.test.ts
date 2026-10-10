import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbookEvaluator,
  getCellValue,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
function imported(workbook: Workbook) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((item) => item.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing ordinary chart.");
  return {
    sheet,
    drawing,
    data: getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id)),
  };
}
const options = (["columns", "rows"] as const).flatMap((seriesBy) =>
  [true, false].flatMap((headerRow) =>
    [true, false].map((headerColumn) => ({ seriesBy, headerRow, headerColumn })),
  ),
);
describe("native column source options", () => {
  test.each(options)(
    "keeps $seriesBy/headerRow=$headerRow/headerColumn=$headerColumn live through repeated roundtrips",
    async (option) => {
      const f = nativeColumnFixture();
      Object.assign(f.drawing.chart, option);
      const expected = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
      const encoded = await encodeXlsx(f.workbook);
      expect(encoded.report.issues.some((item) => item.code === "feature-omitted")).toBe(false);
      const firstWorkbook = (await decodeXlsx(encoded.bytes)).workbook;
      const first = imported(firstWorkbook);
      expect(first.drawing.chart).toEqual(f.drawing.chart);
      expect(first.data).toEqual(expected);
      const snapshot = deserializeWorkbook(serializeWorkbook(firstWorkbook));
      const secondWorkbook = (await decodeXlsx((await encodeXlsx(snapshot)).bytes)).workbook;
      const second = imported(secondWorkbook);
      expect(second.drawing.chart).toEqual(f.drawing.chart);
      expect(second.data).toEqual(expected);
      setCellContent(second.sheet, { row: 2, column: 1 }, { kind: "literal", value: 111 });
      const changed = getSheetChartData(
        second.sheet,
        second.drawing.chart,
        createWorkbookEvaluator(secondWorkbook, second.sheet.id),
      );
      expect(changed.series.flatMap((item) => item.values)).toContain(111);
      expect(
        imported((await decodeXlsx((await encodeXlsx(secondWorkbook)).bytes)).workbook).data,
      ).toEqual(changed);
    },
  );
  test.each(["columns", "rows"] as const)(
    "preserves enabled empty/duplicate labels and missing values in %s",
    async (seriesBy) => {
      const f = nativeColumnFixture();
      f.drawing.chart.seriesBy = seriesBy;
      setCellContent(f.sheet, { row: 0, column: 1 }, null);
      setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: "" });
      setCellContent(f.sheet, { row: 2, column: 0 }, { kind: "literal", value: "south" });
      setCellContent(f.sheet, { row: 2, column: 2 }, null);
      setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: 0 });
      setCellContent(f.sheet, { row: 3, column: 1 }, { kind: "literal", value: -5 });
      const expected = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
      const result = imported((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook);
      expect(result.drawing.chart.seriesBy).toBe(seriesBy);
      expect(result.data).toEqual(expected);
      expect(result.data.series.flatMap((item) => item.values)).toContain(null);
      expect([...result.data.categories, ...result.data.series.map((item) => item.name)]).toContain(
        "",
      );
    },
  );
  test.each(options)(
    "keeps one series when label geometry proves $seriesBy/$headerRow/$headerColumn",
    async (option) => {
      const f = nativeColumnFixture();
      Object.assign(f.drawing.chart, option);
      const rowCount = Number(option.headerRow) + (option.seriesBy === "rows" ? 1 : 2);
      const columnCount = Number(option.headerColumn) + (option.seriesBy === "rows" ? 2 : 1);
      f.drawing.chart.range = {
        start: { row: 0, column: 0 },
        end: { row: rowCount - 1, column: columnCount - 1 },
      };
      for (let row = Number(option.headerRow); row < rowCount; row++)
        for (let column = Number(option.headerColumn); column < columnCount; column++)
          setCellContent(f.sheet, { row, column }, { kind: "literal", value: row + column + 1 });
      const result = imported((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook);
      expect(result.drawing.chart).toEqual(f.drawing.chart);
      expect(result.data.series).toHaveLength(1);
      expect(result.data.categories).toHaveLength(2);
    },
  );
  test.each(["columns", "rows"] as const)(
    "keeps a one-point one-series %s chart with both real label references",
    async (seriesBy) => {
      const f = nativeColumnFixture();
      f.drawing.chart.seriesBy = seriesBy;
      f.drawing.chart.range!.end = { row: 1, column: 1 };
      expect(
        imported((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook).drawing.chart,
      ).toEqual(f.drawing.chart);
    },
  );
  test.each(["columns", "rows"] as const)(
    "omits ambiguous headerless 1x1 %s without changing cells or Core configuration",
    async (seriesBy) => {
      const f = nativeColumnFixture();
      Object.assign(f.drawing.chart, {
        seriesBy,
        headerRow: false,
        headerColumn: false,
        range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      });
      const before = serializeWorkbook(f.workbook);
      const output = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(
        Object.keys(unzipSync(output.bytes)).some((path) => path.startsWith("xl/charts/")),
      ).toBe(false);
      expect(output.report.issues.some((item) => item.code === "feature-omitted")).toBe(true);
      expect(
        getCellValue([...(await decodeXlsx(output.bytes)).workbook.sheets.values()][0]!, {
          row: 1,
          column: 1,
        }),
      ).toBe(60);
    },
  );
  test.each([true, false])(
    "only accepts omitted WPS text cache points for independently proven blank labels: blank=%s",
    async (blank) => {
      const f = nativeColumnFixture();
      f.drawing.chart.seriesBy = "rows";
      if (blank) setCellContent(f.sheet, { row: 0, column: 1 }, null);
      const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
      const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      const changed = xml.replaceAll(
        /(<c:cat>[\s\S]*?<c:ptCount val="2"\/>)(<c:pt idx="0">[\s\S]*?<\/c:pt>)/g,
        "$1",
      );
      expect(changed).not.toBe(xml);
      entries["xl/charts/chart1.xml"] = strToU8(changed);
      const decoded = await decodeXlsx(zipSync(entries));
      if (blank) expect(imported(decoded.workbook).data.categories).toEqual(["", "pear"]);
      else expect([...decoded.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    },
  );
  test.each(["wrong-index", "absent-name", "expression"])(
    "does not invent generated labels from %s native title",
    async (mode) => {
      const f = nativeColumnFixture();
      f.drawing.chart.headerRow = false;
      const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
      const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      const changed =
        mode === "absent-name"
          ? xml.replace(/(<c:ser>[\s\S]*?)<c:tx>[\s\S]*?<\/c:tx>/, "$1")
          : xml.replace(
              "&quot;1&quot;",
              mode === "wrong-index" ? "&quot;9&quot;" : "CONCAT(&quot;1&quot;)",
            );
      expect(changed).not.toBe(xml);
      entries["xl/charts/chart1.xml"] = strToU8(changed);
      const decoded = await decodeXlsx(zipSync(entries));
      expect([...decoded.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
      expect(decoded.report.issues.some((item) => item.code === "feature-omitted")).toBe(true);
    },
  );
  test.each([
    { name: "plain-text", value: "apple", supported: true, normalized: true },
    { name: "empty-string", value: "", supported: false, normalized: false },
    { name: "whitespace", value: " ", supported: false, normalized: false },
    { name: "numeric-text", value: "10", supported: false, normalized: false },
    { name: "boolean", value: true, supported: false, normalized: false },
    { name: "blank", value: null, supported: false, normalized: false },
    { name: "formula-error", value: null, supported: false, normalized: false },
    { name: "text-formula", value: null, supported: false, normalized: false },
    { name: "real-zero", value: 0, supported: true, normalized: false },
    { name: "wrong-number", value: 5, supported: false, normalized: false },
    { name: "labels-expose-zero", value: "apple", supported: false, normalized: false },
  ])(
    "WPS text-zero cache adaptation keeps $name bounded",
    async ({ name, value, supported, normalized }) => {
      const f = nativeColumnFixture();
      f.drawing.chart.headerRow = false;
      if (name === "labels-expose-zero") f.drawing.chart.labels = true;
      setCellContent(
        f.sheet,
        { row: 0, column: 1 },
        name === "formula-error"
          ? { kind: "formula", formula: { source: "=1/0" } }
          : name === "text-formula"
            ? { kind: "formula", formula: { source: '="apple"' } }
            : value === null
              ? null
              : { kind: "literal", value },
      );
      const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
      const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      const changed =
        name === "real-zero"
          ? xml
          : name === "wrong-number"
            ? xml.replace('<c:pt idx="0"><c:v>5</c:v></c:pt>', '<c:pt idx="0"><c:v>0</c:v></c:pt>')
            : xml.replace(
                /(<c:val>[\s\S]*?<c:ptCount val="4"\/>)/,
                '$1<c:pt idx="0"><c:v>0</c:v></c:pt>',
              );
      if (name !== "real-zero") expect(changed).not.toBe(xml);
      entries["xl/charts/chart1.xml"] = strToU8(changed);
      const decoded = await decodeXlsx(zipSync(entries));
      expect(decoded.report.issues.some((item) => item.code === "chart-cache-normalized")).toBe(
        normalized,
      );
      if (supported)
        expect(imported(decoded.workbook).data.series[0]!.values[0]).toBe(
          name === "real-zero" ? 0 : null,
        );
      else expect([...decoded.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    },
  );
  test("WPS text-zero adaptation follows horizontal row-series references", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.seriesBy = "rows";
    f.drawing.chart.headerColumn = false;
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
    entries["xl/charts/chart1.xml"] = strToU8(
      xml.replace(/(<c:val>[\s\S]*?<c:ptCount val="3"\/>)/, '$1<c:pt idx="0"><c:v>0</c:v></c:pt>'),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(imported(decoded.workbook).data.series[0]!.values).toEqual([null, 60, 70]);
    expect(decoded.report.issues.some((item) => item.code === "chart-cache-normalized")).toBe(true);
  });
});
