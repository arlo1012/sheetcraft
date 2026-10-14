import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbookEvaluator, setCellContent, type Workbook } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

function fixture() {
  const f = nativeColumnFixture();
  f.drawing.chart.type = "line";
  return f;
}
function imported(workbook: Workbook) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((item) => item.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing live line.");
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
describe("ordinary native straight marker lines", () => {
  test.each(["solid", "dash", "payload", "attribute", "wrong-location"])(
    "admits only the observed inert WPS post-save solid line-style leaf: %s",
    async (mode) => {
      const f = fixture();
      const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
      let xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      const leaf =
        mode === "payload"
          ? '<a:prstDash val="solid"><a:noFill/></a:prstDash>'
          : mode === "attribute"
            ? '<a:prstDash val="solid" unknown="1"/>'
            : `<a:prstDash val="${mode === "dash" ? "dash" : "solid"}"/>`;
      xml =
        mode === "wrong-location"
          ? xml.replace(
              "<c:marker><c:symbol",
              `<c:marker><c:spPr><a:ln>${leaf}</a:ln></c:spPr><c:symbol`,
            )
          : xml.replace("<a:round/>", leaf + "<a:round/>");
      entries["xl/charts/chart1.xml"] = strToU8(xml);
      if (mode === "solid")
        expect(imported((await decodeXlsx(zipSync(entries))).workbook).drawing.chart.type).toBe(
          "line",
        );
      else
        await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
    },
  );
  test.each(options)(
    "keeps proven numeric/blank $seriesBy/$headerRow/$headerColumn source live",
    async (option) => {
      const f = fixture();
      Object.assign(f.drawing.chart, option);
      for (let row = 0; row < 4; row++)
        for (let column = 0; column < 3; column++)
          setCellContent(
            f.sheet,
            { row, column },
            {
              kind: "literal",
              value:
                option.headerRow && row === 0
                  ? `S${column}`
                  : option.headerColumn && column === 0
                    ? `K${row}`
                    : row * 10 + column,
            },
          );
      setCellContent(f.sheet, { row: 2, column: 2 }, null);
      const expected = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
      const before = serializeWorkbook(f.workbook);
      const out = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(out.report.issues.some((i) => i.code === "feature-omitted")).toBe(false);
      const entries = unzipSync(out.bytes);
      const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
      expect(xml).toContain('<c:lineChart><c:grouping val="standard"/>');
      expect(xml).not.toContain("<c:barChart>");
      expect(xml).not.toContain("pivotSource");
      expect(xml).toContain('<c:marker><c:symbol val="circle"/><c:size val="5"/>');
      expect(xml).toContain('<c:dispBlanksAs val="gap"/>');
      const first = (await decodeXlsx(out.bytes)).workbook;
      const current = imported(first);
      expect(current.drawing.chart).toEqual(f.drawing.chart);
      expect(current.data).toEqual(expected);
      const snapshot = deserializeWorkbook(serializeWorkbook(first));
      const second = (await decodeXlsx((await encodeXlsx(snapshot)).bytes)).workbook;
      expect(imported(second).data).toEqual(expected);
      const last = imported(second);
      setCellContent(last.sheet, { row: 2, column: 1 }, { kind: "literal", value: 111 });
      const changed = getSheetChartData(
        last.sheet,
        last.drawing.chart,
        createWorkbookEvaluator(second, last.sheet.id),
      );
      expect(changed.series.flatMap((s) => s.values)).toContain(111);
      expect(imported((await decodeXlsx((await encodeXlsx(second)).bytes)).workbook).data).toEqual(
        changed,
      );
    },
  );
  test("keeps empty names, missing gaps, negative/zero values and presentation flags", async () => {
    const f = fixture();
    f.drawing.chart.legend = false;
    f.drawing.chart.labels = true;
    f.drawing.chart.showHidden = true;
    setCellContent(f.sheet, { row: 0, column: 1 }, { kind: "literal", value: "" });
    setCellContent(f.sheet, { row: 1, column: 0 }, null);
    setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: 0 });
    setCellContent(f.sheet, { row: 2, column: 1 }, { kind: "literal", value: -5 });
    setCellContent(f.sheet, { row: 2, column: 2 }, null);
    (f.sheet.hiddenRows ??= new Set()).add(2);
    const result = imported((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook);
    expect(result.drawing.chart).toEqual(f.drawing.chart);
    expect(result.data.categories[0]).toBe("");
    expect(result.data.series[0]).toMatchObject({ name: "", values: [0, -5, 120] });
    expect(result.data.series[1]!.values).toEqual([70, null, 90]);
  });
  test.each([
    "text",
    "empty-string",
    "whitespace",
    "numeric-text",
    "boolean",
    "formula-error",
    "text-formula",
    "detached",
    "rotated",
    "hidden",
    "numeric-category",
    "headerless1x1",
  ])("omits unproven %s without detached parts", async (mode) => {
    const f = fixture();
    const values: Record<string, string | boolean> = {
      text: "apple",
      "empty-string": "",
      whitespace: " ",
      "numeric-text": "10",
      boolean: true,
    };
    if (mode in values)
      setCellContent(f.sheet, { row: 2, column: 1 }, { kind: "literal", value: values[mode]! });
    if (mode === "formula-error" || mode === "text-formula")
      setCellContent(
        f.sheet,
        { row: 2, column: 1 },
        { kind: "formula", formula: { source: mode === "formula-error" ? "=1/0" : '="text"' } },
      );
    if (mode === "detached")
      f.drawing.chart.dataCache = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
    if (mode === "rotated") f.drawing.rotation = 30;
    if (mode === "hidden") (f.sheet.hiddenRows ??= new Set()).add(2);
    if (mode === "numeric-category")
      setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    if (mode === "headerless1x1")
      Object.assign(f.drawing.chart, {
        headerRow: false,
        headerColumn: false,
        range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      });
    const before = serializeWorkbook(f.workbook);
    const out = await encodeXlsx(f.workbook);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(out.report.issues.some((i) => i.code === "feature-omitted")).toBe(true);
    expect(Object.keys(unzipSync(out.bytes)).some((p) => /^xl\/(charts|drawings)\//.test(p))).toBe(
      false,
    );
  });
  test.each([
    "smooth",
    "series-smooth",
    "no-markers",
    "marker-none",
    "marker-square",
    "marker-size",
    "zero-gap",
    "blank-cache-zero",
    "text-cache-zero",
    "axis-position",
    "wrong-reference",
  ])("omits safe but unproven native %s atomically", async (mode) => {
    const f = fixture();
    if (mode === "blank-cache-zero") setCellContent(f.sheet, { row: 1, column: 1 }, null);
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    let xml = strFromU8(entries["xl/charts/chart1.xml"]!);
    const before = xml;
    if (mode === "smooth")
      xml = xml.replace(
        '<c:marker val="1"/><c:smooth val="0"/>',
        '<c:marker val="1"/><c:smooth val="1"/>',
      );
    if (mode === "series-smooth") xml = xml.replace('<c:smooth val="0"/>', '<c:smooth val="1"/>');
    if (mode === "no-markers") xml = xml.replace('<c:marker val="1"/>', '<c:marker val="0"/>');
    if (mode === "marker-none" || mode === "marker-square")
      xml = xml.replace(
        '<c:symbol val="circle"/>',
        `<c:symbol val="${mode === "marker-none" ? "none" : "square"}"/>`,
      );
    if (mode === "marker-size") xml = xml.replace('<c:size val="5"/>', '<c:size val="1"/>');
    if (mode === "zero-gap")
      xml = xml.replace('<c:dispBlanksAs val="gap"/>', '<c:dispBlanksAs val="zero"/>');
    if (mode === "axis-position") xml = xml.replace('<c:axPos val="b"/>', '<c:axPos val="t"/>');
    if (mode === "wrong-reference")
      xml = xml.replace("&apos;Data&apos;!$B$2:$B$4", "&apos;Data&apos;!$C$2:$C$4");
    if (mode === "blank-cache-zero")
      xml = xml.replace(
        /(<c:val>[\s\S]*?<c:ptCount val="3"\/>)/,
        '$1<c:pt idx="0"><c:v>0</c:v></c:pt>',
      );
    if (mode === "text-cache-zero") {
      const worksheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
      entries["xl/worksheets/sheet1.xml"] = strToU8(
        worksheet.replace(
          /(<c r="B2"[^>]*>)[\s\S]*?<\/c>/,
          '<c r="B2" t="inlineStr"><is><t>text</t></is></c>',
        ),
      );
      xml = xml.replace('<c:pt idx="0"><c:v>60</c:v></c:pt>', '<c:pt idx="0"><c:v>0</c:v></c:pt>');
    }
    expect(xml).not.toBe(before);
    entries["xl/charts/chart1.xml"] = strToU8(xml);
    const decoded = await decodeXlsx(zipSync(entries));
    expect([...decoded.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(decoded.report.issues.some((i) => i.code === "feature-omitted")).toBe(true);
    expect(decoded.report.issues.some((i) => i.code === "chart-cache-normalized")).toBe(false);
  });
  test.each([
    "mixed-family",
    "linked-line",
    "wrong-namespace",
    "unknown-leaf",
    "bar-with-line-payload",
  ])("retains package safety rejection for %s", async (mode) => {
    const f = fixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    let xml = strFromU8(entries["xl/charts/chart1.xml"]!);
    if (mode === "mixed-family") xml = xml.replace("</c:lineChart>", "</c:lineChart><c:barChart/>");
    if (mode === "linked-line")
      xml = xml.replace(
        "<c:chart>",
        '<c:pivotSource><c:name>[Book]Data!Pivot1</c:name><c:fmtId val="0"/></c:pivotSource><c:chart>',
      );
    if (mode === "wrong-namespace")
      xml = xml.replace(
        'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"',
        'xmlns:c="https://example.invalid/chart"',
      );
    if (mode === "unknown-leaf") xml = xml.replace("</c:lineChart>", "<c:unproven/></c:lineChart>");
    if (mode === "bar-with-line-payload")
      xml = xml
        .replace(/c:lineChart/g, "c:barChart")
        .replace(
          '<c:grouping val="standard"/>',
          '<c:barDir val="bar"/><c:grouping val="clustered"/>',
        );
    entries["xl/charts/chart1.xml"] = strToU8(xml);
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
