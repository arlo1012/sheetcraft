import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbookEvaluator,
  getCellValue,
  setCellContent,
  setCellStyle,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
import { nativeChartFixture } from "../pivot-tables/native-chart-fixture.js";

function chart(workbook: Workbook) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((drawing) => drawing.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing ordinary chart.");
  return {
    sheet,
    drawing,
    data: getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id)),
  };
}
function rewrite(
  entries: Record<string, Uint8Array>,
  part: string,
  change: (xml: string) => string,
) {
  const before = strFromU8(entries[part]!);
  const after = change(before);
  if (after === before) throw new Error("No-op fixture mutation.");
  entries[part] = strToU8(after);
}

describe("ordinary native clustered-column charts", () => {
  test("exports live references and caches without pivot parts or field buttons, retaining Core", async () => {
    const f = nativeColumnFixture();
    const before = serializeWorkbook(f.workbook);
    const out = await encodeXlsx(f.workbook);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(out.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
    const entries = unzipSync(out.bytes);
    const xml = strFromU8(entries["xl/charts/chart1.xml"]!);
    expect(xml).toContain("&apos;Data&apos;!$A$2:$A$4");
    expect(xml).toContain("&apos;Data&apos;!$B$1");
    expect(xml).toContain("&apos;Data&apos;!$C$2:$C$4");
    expect(xml).not.toMatch(/pivotSource|pivotOptions|dropZone/);
    expect(
      Object.keys(entries).some(
        (path) => path.includes("pivotTable") || path.includes("pivotCache"),
      ),
    ).toBe(false);
    const decoded = await decodeXlsx(out.bytes);
    const imported = chart(decoded.workbook);
    expect(imported.drawing.chart).toEqual(f.drawing.chart);
    expect(imported.drawing.anchor).toEqual(f.drawing.anchor);
    expect(imported.data.series.map((series) => series.values)).toEqual([
      [60, 100, 120],
      [70, 80, 90],
    ]);
    expect(imported.sheet.pivotTables ?? []).toHaveLength(0);
  });

  test("ordinary changes are live immediately and survive snapshot and repeated XLSX roundtrips", async () => {
    const f = nativeColumnFixture();
    const firstWorkbook = (await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook;
    const first = chart(firstWorkbook);
    setCellContent(first.sheet, { row: 2, column: 1 }, { kind: "literal", value: 110 });
    expect(
      getSheetChartData(
        first.sheet,
        first.drawing.chart,
        createWorkbookEvaluator(firstWorkbook, first.sheet.id),
      ).series[0]!.values[1],
    ).toBe(110);
    const restored = deserializeWorkbook(serializeWorkbook(firstWorkbook));
    setCellContent(
      [...restored.sheets.values()][0]!,
      { row: 2, column: 1 },
      { kind: "literal", value: 120 },
    );
    const reloaded = (await decodeXlsx((await encodeXlsx(restored)).bytes)).workbook;
    expect(chart(reloaded).data.series[0]!.values[1]).toBe(120);
    const twice = (await decodeXlsx((await encodeXlsx(reloaded)).bytes)).workbook;
    expect(chart(twice).data).toEqual(chart(reloaded).data);
  });

  test("retains apostrophes and XML-sensitive sheet/title/category text", async () => {
    const f = nativeColumnFixture();
    f.sheet.name = "Sales O'Brien & co";
    f.drawing.chart.title = "A < B & C";
    setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: "<&\"'" });
    const result = chart((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook);
    expect(result.sheet.name).toBe(f.sheet.name);
    expect(result.drawing.chart.title).toBe(f.drawing.chart.title);
    expect(result.data.categories[0]).toBe("<&\"'");
  });

  test("keeps zero and negative numbers while text, blanks and formula errors stay missing", async () => {
    const f = nativeColumnFixture();
    setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: 0 });
    setCellContent(f.sheet, { row: 2, column: 1 }, { kind: "literal", value: "missing" });
    setCellContent(
      f.sheet,
      { row: 3, column: 1 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    setCellContent(f.sheet, { row: 1, column: 2 }, { kind: "literal", value: -5 });
    setCellContent(f.sheet, { row: 2, column: 2 }, null);
    const out = await encodeXlsx(f.workbook);
    const xml = strFromU8(unzipSync(out.bytes)["xl/charts/chart1.xml"]!);
    expect(xml).toContain('<c:ptCount val="3"/><c:pt idx="0"><c:v>0</c:v></c:pt>');
    expect(
      chart((await decodeXlsx(out.bytes)).workbook).data.series.map((series) => series.values),
    ).toEqual([
      [0, null, null],
      [-5, null, 90],
    ]);
  });

  test.each([
    "stacked",
    "rotated",
    "detached",
    "empty",
    "hidden-row",
    "hidden-column",
    "hidden-header-row",
    "hidden-category-column",
    "numeric-category",
    "oversized-drawing",
    "out-of-bounds-anchor",
  ])("omits unsupported %s without dangling parts", async (mode) => {
    const f = nativeColumnFixture();
    if (mode === "stacked") f.drawing.chart.stacked = true;
    if (mode === "rotated") f.drawing.rotation = 30;
    if (mode === "detached")
      f.drawing.chart.dataCache = getSheetChartData(
        f.sheet,
        f.drawing.chart,
        createWorkbookEvaluator(f.workbook, f.sheet.id),
      );
    if (mode === "empty") f.drawing.chart.range = null;
    if (mode === "hidden-row") (f.sheet.hiddenRows ??= new Set()).add(2);
    if (mode === "hidden-column") (f.sheet.hiddenColumns ??= new Set()).add(1);
    if (mode === "hidden-header-row") (f.sheet.hiddenRows ??= new Set()).add(0);
    if (mode === "hidden-category-column") (f.sheet.hiddenColumns ??= new Set()).add(0);
    if (mode === "numeric-category")
      setCellContent(f.sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    if (mode === "oversized-drawing") f.drawing.width = 20000;
    if (mode === "out-of-bounds-anchor") f.drawing.anchor.column = 16384;
    const out = await encodeXlsx(f.workbook);
    expect(
      Object.keys(unzipSync(out.bytes)).some((path) => /^xl\/(?:charts|drawings)\//.test(path)),
    ).toBe(false);
    expect(out.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: ['Data.drawings["column-chart"]'],
      }),
    );
  });

  test("keeps consistent number formats and presentation flags", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.labels = true;
    f.drawing.chart.legend = false;
    for (const row of [1, 2, 3])
      setCellStyle(
        f.sheet,
        { row, column: 1 },
        { numberFormat: { kind: "percent", fractionDigits: 2 } },
      );
    const out = await encodeXlsx(f.workbook);
    expect(strFromU8(unzipSync(out.bytes)["xl/charts/chart1.xml"]!)).toContain(
      "<c:formatCode>#,##0.00%</c:formatCode>",
    );
    const result = chart((await decodeXlsx(out.bytes)).workbook);
    expect(result.drawing.chart).toEqual(f.drawing.chart);
    expect(result.data.series[0]!.numberFormat).toEqual({ kind: "percent", fractionDigits: 2 });
  });

  test("keeps ordinary and linked reports distinct in the same workbook", async () => {
    const pivot = nativeChartFixture();
    const ordinary = nativeColumnFixture();
    // The existing source has a different rectangle; use a separate Core sheet.
    pivot.workbook.sheets.set(ordinary.sheet.id + "-ordinary", {
      ...ordinary.sheet,
      id: ordinary.sheet.id + "-ordinary",
    });
    const out = await encodeXlsx(pivot.workbook);
    const entries = unzipSync(out.bytes);
    expect(
      Object.keys(entries).filter((path) => /^xl\/charts\/chart\d+\.xml$/.test(path)),
    ).toHaveLength(2);
    const decoded = await decodeXlsx(out.bytes);
    const all = [...decoded.workbook.sheets.values()]
      .flatMap((sheet) => sheet.drawings ?? [])
      .filter((drawing) => drawing.kind === "chart");
    expect(all).toHaveLength(2);
    expect(
      all.filter((drawing) => drawing.kind === "chart" && drawing.chart.pivotTableId !== undefined),
    ).toHaveLength(1);
    expect(
      all.filter(
        (drawing) =>
          drawing.kind === "chart" &&
          drawing.chart.pivotTableId === undefined &&
          drawing.chart.dataCache === undefined,
      ),
    ).toHaveLength(1);
  });

  test("showHidden=true retains the entire contiguous source", async () => {
    const f = nativeColumnFixture();
    (f.sheet.hiddenRows ??= new Set()).add(2);
    f.drawing.chart.showHidden = true;
    const result = chart((await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).workbook);
    expect(result.drawing.chart.showHidden).toBe(true);
    expect(result.data.categories).toEqual(["east", "north", "south"]);
  });

  test("accepts the observed WPS default title and disabled series-label structure using a synthetic fixture", async () => {
    const f = nativeColumnFixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    rewrite(entries, "xl/charts/chart1.xml", (xml) =>
      xml
        .replace(
          /<c:title>[\s\S]*?<\/c:title>/,
          '<c:title><c:layout/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p/></c:txPr></c:title>',
        )
        .replaceAll("<c:cat>", '<c:dLbls><c:delete val="1"/></c:dLbls><c:cat>'),
    );
    const result = chart((await decodeXlsx(zipSync(entries))).workbook);
    expect(result.drawing.chart.title).toBe("");
    expect(result.drawing.chart.labels).toBe(false);
    expect(result.data.series[0]!.values).toEqual([60, 100, 120]);
  });

  test.each([
    "cross-sheet",
    "non-adjacent",
    "title-range",
    "disjoint-category",
    "stale-cache",
    "axis-reversed",
    "zero-fill-blanks",
    "series-labels",
  ])("omits unproven %s chart while preserving worksheet cells", async (mode) => {
    const f = nativeColumnFixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    rewrite(entries, "xl/charts/chart1.xml", (xml) => {
      if (mode === "cross-sheet")
        return xml.replace("&apos;Data&apos;!$B$2:$B$4", "&apos;Other&apos;!$B$2:$B$4");
      if (mode === "non-adjacent")
        return xml.replace("&apos;Data&apos;!$C$2:$C$4", "&apos;Data&apos;!$D$2:$D$4");
      if (mode === "title-range")
        return xml.replace("&apos;Data&apos;!$B$1", "&apos;Data&apos;!$B$1:$B$2");
      if (mode === "disjoint-category")
        return xml.replace("&apos;Data&apos;!$A$2:$A$4", "&apos;Data&apos;!$A$3:$A$4");
      if (mode === "stale-cache") return xml.replace("<c:v>100</c:v>", "<c:v>110</c:v>");
      if (mode === "axis-reversed")
        return xml.replace('orientation val="minMax"', 'orientation val="maxMin"');
      if (mode === "zero-fill-blanks")
        return xml.replace('dispBlanksAs val="gap"', 'dispBlanksAs val="zero"');
      return xml.replace("<c:cat>", '<c:dLbls><c:showVal val="1"/></c:dLbls><c:cat>');
    });
    const result = await decodeXlsx(zipSync(entries));
    const sheet = [...result.workbook.sheets.values()][0]!;
    expect(sheet.drawings ?? []).toHaveLength(0);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(100);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: "feature-omitted", locations: ["xl/charts/chart1.xml"] }),
    );
  });

  test("an ordinary chart cannot inherit PivotChart-only field-button extensions", async () => {
    const f = nativeColumnFixture();
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    rewrite(entries, "xl/charts/chart1.xml", (xml) =>
      xml.replace(
        "</c:chartSpace>",
        '<c:extLst><c:ext uri="x" xmlns:c14="http://schemas.microsoft.com/office/drawing/2007/8/2/chart"><c14:pivotOptions/></c:ext></c:extLst></c:chartSpace>',
      ),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
