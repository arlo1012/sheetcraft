import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { executeWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheet, insertSheet, setCellContent } from "@sheetcraft/core/workbook";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { encodeXlsx } from "../../index.js";
import { attr, child, nodes, parseXml, relationships } from "../../pivot-xml.js";
import { nativeChartFixture } from "./native-chart-fixture.js";

function parts(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const charts = Object.keys(entries).filter((path) => /^xl\/charts\/chart\d+\.xml$/.test(path));
  return {
    entries,
    charts,
    chart: charts.length ? child(parseXml(entries[charts[0]!]), "chartSpace") : {},
  };
}
function caches(chart: ReturnType<typeof child>) {
  const bar = child(child(child(chart, "chart"), "plotArea"), "barChart");
  return nodes(bar.ser).map((series) => ({
    name: child(child(child(child(series, "tx"), "strRef"), "strCache"), "pt").v,
    categories: nodes(child(child(child(series, "cat"), "strRef"), "strCache").pt),
    values: nodes(child(child(child(series, "val"), "numRef"), "numCache").pt),
  }));
}

describe("native linked PivotChart export", () => {
  test("uses the actual output identity, report-cell references and populated caches, preserving Core", async () => {
    const f = nativeChartFixture();
    const before = serializeWorkbook(f.workbook);
    const result = await encodeXlsx(f.workbook, { filename: "sc-product.xlsx" });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
    const p = parts(result.bytes);
    expect(p.charts).toHaveLength(1);
    const definition = child(
      parseXml(p.entries["xl/pivotTables/pivotTable1.xml"]),
      "pivotTableDefinition",
    );
    expect(
      nodes(child(definition, "rowItems").i).map((item) => attr(child(item, "x"), "v")),
    ).toEqual(["2", "0", "1", "0"]);
    expect(
      nodes(child(definition, "colItems").i).map((item) => attr(child(item, "x"), "v")),
    ).toEqual(["0", "1", "0"]);
    const source = child(p.chart, "pivotSource");
    expect(source).toMatchObject({ name: "[sc-product.xlsx]Report!PivotTable1" });
    expect(attr(child(source, "fmtId"), "val")).toBe("0");
    const xml = strFromU8(p.entries[p.charts[0]!]!);
    expect(xml).toContain("&apos;Report&apos;!$A$5:$A$7");
    expect(xml).toContain("&apos;Report&apos;!$B$5:$B$7");
    expect(xml).not.toContain("$B$8");
    const data = caches(p.chart);
    expect(data.map((series) => series.name)).toEqual(["apple", "pear"]);
    expect(data.map((series) => series.values.map((point) => Number(point.v)))).toEqual([
      [60, 100, 120],
      [70, 80, 90],
    ]);
    expect(data[0]!.categories.map((point) => point.v)).toEqual(["east", "north", "south"]);
    expect(strFromU8(p.entries["[Content_Types].xml"]!)).toContain(
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
    );
  });

  test("source edits stay stale until explicit refresh, then chart caches follow the refreshed report", async () => {
    const f = nativeChartFixture();
    setCellContent(f.source, { row: 1, column: 2 }, { kind: "literal", value: 110 });
    const stale = parts((await encodeXlsx(f.workbook)).bytes);
    expect(caches(stale.chart)[0]!.values.map((point) => Number(point.v))).toEqual([60, 100, 120]);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.output.id, f.output.pivotTables![0]!),
    );
    const refreshed = parts((await encodeXlsx(f.workbook)).bytes);
    expect(caches(refreshed.chart)[0]!.values.map((point) => Number(point.v))).toEqual([
      60, 110, 120,
    ]);
  });

  test("links duplicate names to the emitted owner and actual renamed native table", async () => {
    const f = nativeChartFixture();
    const second = createSheet("Other_Report", "other");
    insertSheet(f.workbook, second);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(
        second.id,
        { ...f.pivot, id: "second-pivot", outputRange: null },
        { chartId: "second-chart" },
      ),
    );
    const p = parts((await encodeXlsx(f.workbook)).bytes);
    expect(p.charts).toHaveLength(2);
    expect(strFromU8(p.entries[p.charts[1]!]!)).toContain(
      "[workbook.xlsx]Other_Report!PivotTable1_2",
    );
    expect(strFromU8(p.entries["xl/pivotTables/pivotTable2.xml"]!)).toContain(
      'name="PivotTable1_2"',
    );
  });

  test("native axis membership also stays stale until explicit refresh", async () => {
    const f = nativeChartFixture();
    setCellContent(f.source, { row: 1, column: 0 }, { kind: "literal", value: "west" });
    setCellContent(f.source, { row: 2, column: 0 }, { kind: "literal", value: "west" });
    const stale = parts((await encodeXlsx(f.workbook)).bytes);
    expect(caches(stale.chart)[0]!.categories.map((point) => point.v)).toEqual([
      "east",
      "north",
      "south",
    ]);
    expect(strFromU8(stale.entries["xl/pivotCache/pivotCacheDefinition1.xml"]!)).not.toContain(
      'v="west"',
    );
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.output.id, f.output.pivotTables![0]!),
    );
    const refreshed = parts((await encodeXlsx(f.workbook)).bytes);
    expect(caches(refreshed.chart)[0]!.categories.map((point) => point.v)).toEqual([
      "east",
      "south",
      "west",
    ]);
  });

  test("reuses the image drawing with unique ids and valid independent note/background relationships", async () => {
    const f = nativeChartFixture();
    f.output.floatingImages.push({
      id: "image",
      assetId: "image",
      altText: "Synthetic image",
      anchor: { row: 10, column: 0 },
      offsetX: 1,
      offsetY: 2,
      width: 20,
      height: 30,
    });
    f.output.pageDecoration = { backgroundAssetId: "image" };
    setCellContent(f.output, { row: 20, column: 0 }, { kind: "literal", value: "Note" });
    f.output.cells.get("20:0")!.note = { text: "Synthetic note" };
    const result = await encodeXlsx(f.workbook, {
      images: [
        {
          assetId: "image",
          bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
          extension: "png",
          width: 1,
          height: 1,
        },
      ],
    });
    const p = parts(result.bytes);
    const worksheet = strFromU8(p.entries["xl/worksheets/sheet2.xml"]!);
    expect(worksheet.match(/<drawing\b/g)).toHaveLength(1);
    expect(worksheet).toContain("<legacyDrawing ");
    expect(worksheet).toContain("<picture ");
    const drawingRel = [...relationships(p.entries, "xl/worksheets/sheet2.xml").values()].find(
      (rel) => rel.type.endsWith("/drawing"),
    )!;
    const drawing = strFromU8(p.entries[drawingRel.target]!);
    const ids = [...drawing.matchAll(/<xdr:cNvPr id="(\d+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const rels = relationships(p.entries, drawingRel.target);
    expect([...rels.values()].map((rel) => rel.type.split("/").at(-1)).sort()).toEqual([
      "chart",
      "image",
    ]);
    for (const part of Object.keys(p.entries).filter((path) => path.endsWith(".xml")))
      for (const relationship of relationships(p.entries, part).values())
        expect(p.entries[relationship.target], `${part}: ${relationship.target}`).toBeDefined();
  });

  test.each([
    "missing",
    "stacked",
    "rotated",
    "empty-filename",
    "static-cache",
    "out-of-bounds",
    "row-only",
  ])("omits unsupported %s without dangling chart parts", async (mode) => {
    const f = nativeChartFixture();
    if (f.chart.kind !== "chart") throw new Error("Expected chart.");
    if (mode === "missing") f.chart.chart.pivotTableId = "missing";
    if (mode === "stacked") f.chart.chart.stacked = true;
    if (mode === "rotated") f.chart.rotation = 30;
    if (mode === "out-of-bounds") {
      f.chart.anchor.column = 16383;
      f.chart.offsetX = 100;
    }
    if (mode === "row-only") f.output.pivotTables![0]!.columnFields = [];
    if (mode === "static-cache")
      f.chart.chart.dataCache = getSheetChartData(
        f.output,
        f.chart.chart,
        createWorkbookEvaluator(f.workbook, f.output.id),
      );
    const result = await encodeXlsx(f.workbook, {
      filename: mode === "empty-filename" ? "" : "workbook.xlsx",
    });
    expect(parts(result.bytes).charts).toHaveLength(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        locations: ['Report.drawings["chart"]'],
      }),
    );
  });
});
