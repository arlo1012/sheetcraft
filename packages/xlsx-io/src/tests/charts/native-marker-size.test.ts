import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, setCellValue } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import {
  supportsNativeLineSeriesStyles,
  unsupportedNativeChartStyles,
} from "../../native-chart-style-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

const part = "xl/charts/chart1.xml";
function fixture(size = 9) {
  const f = nativeColumnFixture();
  f.drawing.chart.type = "line";
  f.drawing.chart.rectangleSeries = {
    rows: [],
    columns: [{ index: 1, id: "sized" }],
  };
  f.drawing.chart.format = { series: [{ id: "sized", markerSizePt: size }] };
  return f;
}
function imported(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const sheet = [...result.workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing native marker line.");
  const data = getSheetChartData(
    sheet,
    drawing.chart,
    createWorkbookEvaluator(result.workbook, sheet.id),
  );
  return {
    chart: drawing.chart,
    styles: data.series.map((series) =>
      drawing.chart.format?.series?.find((entry) => entry.id === series.id),
    ),
  };
}
function locations(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  return result.report.issues.flatMap((issue) => issue.locations);
}
async function editXml(edit: (xml: string) => string) {
  const entries = unzipSync((await encodeXlsx(fixture().workbook)).bytes);
  entries[part] = strToU8(edit(strFromU8(entries[part]!)));
  return decodeXlsx(zipSync(entries));
}

describe("native ordinary circular marker size in points", () => {
  test.each([2, 5, 9, 72])(
    "size-only %spt survives native and snapshot roundtrips",
    async (size) => {
      const f = fixture(size);
      const before = serializeWorkbook(f.workbook);
      expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(true);
      expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toContain(`<c:size val="${size}"/>`);
      const first = await decodeXlsx(encoded.bytes);
      expect(imported(first).styles.map((entry) => entry?.markerSizePt)).toEqual([size, 5]);
      expect(locations(first)).not.toContain(`${part}.format.series[0].markerSize`);
      expect(locations(first)).toContain(`${part}.format.series[0].markerStroke`);
      expect(locations(first)).toContain(`${part}.format.series[0].strokeGeometry`);
      const second = await decodeXlsx(
        (await encodeXlsx(deserializeWorkbook(serializeWorkbook(first.workbook)))).bytes,
      );
      expect(imported(second).chart).toEqual(imported(first).chart);
    },
  );

  test.each(["columns", "rows"] as const)(
    "%s maps reordered identities and equal names without moving sizes",
    async (seriesBy) => {
      const f = fixture(2);
      const chart = f.drawing.chart;
      chart.seriesBy = seriesBy;
      if (seriesBy === "columns") {
        setCellValue(f.sheet, { row: 0, column: 1 }, "same");
        setCellValue(f.sheet, { row: 0, column: 2 }, "same");
      } else {
        setCellValue(f.sheet, { row: 1, column: 0 }, "same");
        setCellValue(f.sheet, { row: 2, column: 0 }, "same");
      }
      chart.rectangleSeries = { rows: [], columns: [] };
      chart.rectangleSeries[seriesBy] = [
        { index: 2, id: "second" },
        { index: 1, id: "first" },
      ];
      chart.format = {
        series: [
          { id: "second", markers: true, markerSizePt: 72 },
          { id: "first", strokeWidth: 2, markerSizePt: 2 },
        ],
      };
      const read = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
      expect(imported(read).styles.map((entry) => entry?.markerSizePt)).toEqual(
        seriesBy === "columns" ? [2, 72] : [2, 72, 5],
      );
    },
  );

  test("absence keeps the exact pre-feature native XML, including the legacy 5pt default", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.type = "line";
    const before = serializeWorkbook(f.workbook);
    const encoded = await encodeXlsx(f.workbook);
    expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toBe(
      await readFile(new URL("./fixtures/native-line-default.xml", import.meta.url), "utf8"),
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.drawing.chart.format).toBeUndefined();
  });

  test("resetting only the size restores 5pt without clearing line styling", async () => {
    const f = fixture();
    f.drawing.chart.format!.series![0]!.strokeWidth = 2;
    delete f.drawing.chart.format!.series![0]!.markerSizePt;
    const read = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(imported(read).styles[0]).toMatchObject({ markerSizePt: 5, strokeWidth: 2 });
  });

  test("circle size is recovered independently of unrepresented marker paint", async () => {
    const result = await editXml((xml) =>
      xml.replace(
        '<c:spPr><a:solidFill><a:srgbClr val="2563EB"',
        '<c:spPr><a:solidFill><a:srgbClr val="FF0000"',
      ),
    );
    expect(imported(result).styles[0]?.markerSizePt).toBe(9);
    expect(locations(result)).toContain(`${part}.format.series[0].markerPaint`);
    expect(locations(result)).toContain(`${part}.format.series[0].markerStroke`);
    expect(locations(result)).not.toContain(`${part}.format.series[0].markerSize`);
  });

  test.each([
    ["wps-native-marker-size9.xlsx", 9, true],
    ["wps-native-marker-size-none.xlsx", undefined, false],
  ] as const)(
    "actual WPS save %s retains its proven size and import boundary",
    async (filename, size, markers) => {
      const bytes = new Uint8Array(
        await readFile(new URL(`./fixtures/${filename}`, import.meta.url)),
      );
      const native = strFromU8(unzipSync(bytes)[part]!);
      const firstMarker = native.match(/<c:marker>[\s\S]*?<\/c:marker>/)![0]!;
      expect(firstMarker.includes("<c:size")).toBe(markers);
      const read = await decodeXlsx(bytes);
      if (!markers) {
        // Both series are hidden in this file, so WPS also writes family marker=0.
        // The pre-existing native all-hidden-family boundary is not widened here.
        expect(native).toContain('<c:marker val="0"/>');
        expect([...read.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
        expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
        return;
      }
      expect(imported(read).styles[0]?.markerSizePt).toBe(size);
      expect(imported(read).styles[0]?.markers).toBe(markers);
      expect(locations(read)).not.toContain(`${part}.format.series[0].markerSize`);
      if (markers) expect(locations(read)).toContain(`${part}.format.series[0].markerStroke`);
      const again = await decodeXlsx((await encodeXlsx(read.workbook)).bytes);
      expect(imported(again).chart).toEqual(imported(read).chart);
    },
  );
});

describe("marker size fail-closed export", () => {
  test.each([
    undefined,
    null,
    "9",
    -1,
    0,
    1,
    73,
    9.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -Infinity,
  ])("rejects malformed own marker size %s before resource access", async (size) => {
    const f = fixture();
    Object.assign(f.drawing.chart.format!.series![0]!, { markerSizePt: size });
    const resources = vi.fn(() => []);
    expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(false);
    expect(unsupportedNativeChartStyles(f.drawing.chart).length).toBeGreaterThan(0);
    await expect(
      encodeXlsx(f.workbook, {
        get images() {
          return resources();
        },
      }),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(resources).not.toHaveBeenCalled();
  });

  test.each(["series", "chart"] as const)(
    "blocks %s-hidden explicit size without mutating latent Core data",
    async (hiddenAt) => {
      const f = fixture();
      if (hiddenAt === "series") f.drawing.chart.format!.series![0]!.markers = false;
      else f.drawing.chart.presentation = { lineMarkers: false };
      const before = serializeWorkbook(f.workbook);
      expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(false);
      await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.drawing.chart.format!.series![0]!.markerSizePt).toBe(9);
    },
  );

  test("the effective per-series visibility overrides a global hidden default", () => {
    const f = fixture();
    f.drawing.chart.presentation = { lineMarkers: false };
    f.drawing.chart.format!.series![0]!.markers = true;
    expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(true);
    // Global presentation admission remains deliberately unchanged in this slice.
    expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["presentation.lineMarkers"]);
  });

  test.each([
    "column",
    "bar",
    "area",
    "radar",
    "combo",
    "stacked",
    "pivot",
    "cache",
    "source",
    "filter",
    "dormant",
    "unmatched-binding",
    "opposite",
    "header",
    "outside",
    "negative",
    "reversed",
    "row-overflow",
    "column-overflow",
    "fractional-source",
    "duplicate",
    "unknown-leaf",
    "no-bindings",
    "getter",
    "prototype",
    "inherited",
    "presentation-getter",
    "array-getter",
    "array-sparse",
    "array-extra",
    "symbol",
    "binding-getter",
  ])("rejects unrepresentable %s without invoking accessors", async (mode) => {
    const f = fixture();
    const chart = f.drawing.chart;
    const entry = chart.format!.series![0]!;
    const getter = vi.fn(() => 9);
    if (["column", "bar", "area", "radar", "combo"].includes(mode))
      Object.assign(chart, { type: mode });
    if (mode === "stacked") chart.stacked = true;
    if (mode === "pivot") chart.pivotTableId = "pivot";
    if (mode === "cache") Object.assign(chart, { dataCache: {} });
    if (mode === "source") Object.assign(chart, { source: {} });
    if (mode === "filter") chart.seriesFilter = { hiddenSeriesIds: ["sized"] };
    if (mode === "dormant") entry.id = "retired";
    if (mode === "unmatched-binding")
      chart.rectangleSeries!.columns.push({ index: 2, id: "other" });
    if (mode === "opposite") chart.rectangleSeries!.rows.push({ index: 1, id: "opposite" });
    if (mode === "header") chart.rectangleSeries!.columns[0]!.index = 0;
    if (mode === "outside") chart.rectangleSeries!.columns[0]!.index = 3;
    if (mode === "negative") chart.range!.start.row = -1;
    if (mode === "reversed") chart.range!.start.row = 4;
    if (mode === "row-overflow") chart.range!.end.row = 1_048_576;
    if (mode === "column-overflow") chart.range!.end.column = 16_384;
    if (mode === "fractional-source") chart.range!.start.row = 0.5;
    if (mode === "duplicate") chart.format!.series!.push({ ...entry });
    if (mode === "unknown-leaf") Object.assign(entry, { markerShape: "circle" });
    if (mode === "no-bindings") delete chart.rectangleSeries;
    if (mode === "getter") Object.defineProperty(entry, "markerSizePt", { get: getter });
    if (mode === "prototype") Object.setPrototypeOf(entry, { unrelated: true });
    if (mode === "inherited") {
      delete entry.markerSizePt;
      Object.setPrototypeOf(entry, { markerSizePt: 9 });
    }
    if (mode === "presentation-getter") {
      chart.presentation = {};
      Object.defineProperty(chart.presentation, "lineMarkers", { get: getter });
    }
    if (mode === "array-getter") Object.defineProperty(chart.format!.series!, "0", { get: getter });
    if (mode === "array-sparse") chart.format!.series!.length = 2;
    if (mode === "array-extra") Object.assign(chart.format!.series!, { other: true });
    if (mode === "symbol") Object.assign(entry, { [Symbol("unknown")]: 9 });
    if (mode === "binding-getter")
      Object.defineProperty(chart.rectangleSeries!.columns[0]!, "index", { get: getter });
    expect(supportsNativeLineSeriesStyles(chart)).toBe(false);
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });

  test("retains the existing sixteen-source-series admission limit", () => {
    const f = fixture();
    f.drawing.chart.range!.end.column = 16;
    expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(true);
    f.drawing.chart.range!.end.column = 17;
    expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(false);
  });
});

describe("malformed native marker sizes", () => {
  test.each([
    "",
    "<c:size/>",
    '<c:size val=""/>',
    '<c:size val="1"/>',
    '<c:size val="73"/>',
    '<c:size val="-2"/>',
    '<c:size val="2.5"/>',
    '<c:size val="9.0"/>',
    '<c:size val="9e0"/>',
    '<c:size val="0x9"/>',
    '<c:size val="NaN"/>',
    '<c:size val="Infinity"/>',
    '<c:size val=" 9 "/>',
    '<c:size val="9"/><c:size val="9"/>',
    '<c:size val="9" other="1"/>',
    '<c:size val="9"><c:symbol val="circle"/></c:size>',
    '<c:size val="9">text</c:size>',
  ])("omits rather than normalizing unsupported size XML %s", async (sizeXml) => {
    const result = await editXml((xml) => xml.replace('<c:size val="9"/>', sizeXml));
    expect([...result.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(locations(result)).toContain(`${part}.format.series[0].markerSize`);
    expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  });

  test("does not claim an unsupported none-plus-size geometry is preserved", async () => {
    const read = await editXml((xml) =>
      xml.replace('<c:symbol val="circle"/>', '<c:symbol val="none"/>'),
    );
    expect(imported(read).styles[0]).toMatchObject({ markers: false });
    expect(imported(read).styles[0]?.markerSizePt).toBeUndefined();
    expect(locations(read)).toContain(`${part}.format.series[0].markerGeometry`);
  });

  test("keeps per-point marker overrides outside the native series-size contract", async () => {
    await expect(
      editXml((xml) =>
        xml.replace(
          "</c:marker>",
          '</c:marker><c:dPt><c:idx val="0"/><c:marker><c:symbol val="circle"/><c:size val="9"/></c:marker></c:dPt>',
        ),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
