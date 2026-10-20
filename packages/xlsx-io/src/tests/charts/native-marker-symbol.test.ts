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
function fixture(markerSymbol: "circle" | "square" = "square") {
  const f = nativeColumnFixture();
  f.drawing.chart.type = "line";
  f.drawing.chart.rectangleSeries = {
    rows: [],
    columns: [{ index: 1, id: "shaped" }],
  };
  f.drawing.chart.format = { series: [{ id: "shaped", markerSymbol }] };
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

describe("native ordinary circle and square markers", () => {
  test.each(["circle", "square"] as const)(
    "explicit %s preserves geometry through native and snapshot roundtrips",
    async (markerSymbol) => {
      const f = fixture(markerSymbol);
      const before = serializeWorkbook(f.workbook);
      expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(true);
      expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toContain(
        `<c:symbol val="${markerSymbol}"/><c:size val="5"/>`,
      );
      const first = await decodeXlsx(encoded.bytes);
      expect(imported(first).styles[0]).toMatchObject({ markerSizePt: 5, markers: true });
      expect(imported(first).styles[0]?.markerSymbol).toBe(
        markerSymbol === "square" ? "square" : undefined,
      );
      expect(serializeWorkbook(first.workbook).version).toBe(markerSymbol === "square" ? 93 : 92);
      expect(locations(first)).not.toContain(`${part}.format.series[0].markers`);
      expect(locations(first)).not.toContain(`${part}.format.series[0].markerSize`);
      expect(locations(first)).toContain(`${part}.format.series[0].markerStroke`);
      const second = await decodeXlsx(
        (await encodeXlsx(deserializeWorkbook(serializeWorkbook(first.workbook)))).bytes,
      );
      expect(imported(second).chart).toEqual(imported(first).chart);
    },
  );

  test.each([2, 9, 72])("square keeps its explicit %spt size", async (markerSizePt) => {
    const f = fixture();
    f.drawing.chart.format!.series![0]!.markerSizePt = markerSizePt;
    const encoded = await encodeXlsx(f.workbook);
    expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toContain(
      `<c:symbol val="square"/><c:size val="${markerSizePt}"/>`,
    );
    expect(imported(await decodeXlsx(encoded.bytes)).styles[0]).toMatchObject({
      markerSymbol: "square",
      markerSizePt,
    });
  });

  test.each(["columns", "rows"] as const)(
    "%s resolves reordered equal-name identities without moving symbol or size",
    async (seriesBy) => {
      const f = fixture();
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
          { id: "second", markers: false, strokeWidth: 4 },
          { id: "first", markerSymbol: "square", markerSizePt: 9, strokeWidth: 2 },
        ],
      };
      const read = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
      const styles = imported(read).styles;
      expect(styles[0]).toMatchObject({
        markerSymbol: "square",
        markerSizePt: 9,
        strokeWidth: 2,
      });
      expect(styles[1]).toMatchObject({ markers: false, strokeWidth: 4 });
      expect(styles[1]?.markerSymbol).toBeUndefined();
      expect(styles[1]?.markerSizePt).toBeUndefined();
    },
  );

  test("no explicit symbol preserves exact legacy native XML", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.type = "line";
    const encoded = await encodeXlsx(f.workbook);
    expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toBe(
      await readFile(new URL("./fixtures/native-line-default.xml", import.meta.url), "utf8"),
    );
    const read = await decodeXlsx(encoded.bytes);
    expect(imported(read).styles.every((entry) => entry?.markerSymbol === undefined)).toBe(true);
    expect(serializeWorkbook(read.workbook).version).toBe(92);
    expect(f.drawing.chart.format).toBeUndefined();
  });

  test("resetting only the symbol restores circle without clearing size or width", async () => {
    const f = fixture();
    Object.assign(f.drawing.chart.format!.series![0]!, { markerSizePt: 9, strokeWidth: 2 });
    delete f.drawing.chart.format!.series![0]!.markerSymbol;
    const read = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(imported(read).styles[0]).toMatchObject({ markerSizePt: 9, strokeWidth: 2 });
    expect(imported(read).styles[0]?.markerSymbol).toBeUndefined();
  });

  test("shape and size are recovered independently of unsupported marker paint", async () => {
    const read = await editXml((xml) =>
      xml.replace(
        '<c:spPr><a:solidFill><a:srgbClr val="2563EB"',
        '<c:spPr><a:solidFill><a:srgbClr val="FF0000"',
      ),
    );
    expect(imported(read).styles[0]).toMatchObject({ markerSymbol: "square", markerSizePt: 5 });
    expect(locations(read)).toContain(`${part}.format.series[0].markerPaint`);
    expect(locations(read)).toContain(`${part}.format.series[0].markerStroke`);
    expect(locations(read)).not.toContain(`${part}.format.series[0].markers`);
  });

  test.each([
    ["wps-native-marker-square9.xlsx", 9, true],
    ["wps-native-marker-square6.xlsx", 6, false],
  ] as const)(
    "actual WPS save %s retains square geometry and existing paint warnings",
    async (filename, markerSizePt, painted) => {
      const bytes = new Uint8Array(
        await readFile(new URL(`./fixtures/${filename}`, import.meta.url)),
      );
      expect(strFromU8(unzipSync(bytes)[part]!)).toContain(
        `<c:symbol val="square"/><c:size val="${markerSizePt}"/>`,
      );
      const read = await decodeXlsx(bytes);
      expect(imported(read).styles[0]).toMatchObject({ markerSymbol: "square", markerSizePt });
      expect(imported(read).styles[1]).toMatchObject({ markers: false });
      expect(locations(read)).not.toContain(`${part}.format.series[0].markers`);
      expect(locations(read)).not.toContain(`${part}.format.series[0].markerSize`);
      expect(locations(read)).toContain(
        `${part}.format.series[0].${painted ? "markerStroke" : "markerPaint"}`,
      );
      const again = await decodeXlsx((await encodeXlsx(read.workbook)).bytes);
      expect(imported(again).styles[0]).toMatchObject({ markerSymbol: "square", markerSizePt });
      expect(imported(again).styles[1]).toMatchObject({ markers: false });
    },
  );

  test("actual WPS switch back to circle restores the sparse legacy shape", async () => {
    const read = await decodeXlsx(
      new Uint8Array(
        await readFile(new URL("./fixtures/wps-native-marker-circle6.xlsx", import.meta.url)),
      ),
    );
    expect(imported(read).styles[0]).toMatchObject({ markerSizePt: 6 });
    expect(imported(read).styles[0]?.markerSymbol).toBeUndefined();
    expect(imported(read).styles[1]).toMatchObject({ markers: false });
    expect(serializeWorkbook(read.workbook).version).toBe(92);
    const encoded = await encodeXlsx(read.workbook);
    expect(strFromU8(unzipSync(encoded.bytes)[part]!)).toContain(
      '<c:symbol val="circle"/><c:size val="6"/>',
    );
  });
});

describe("marker symbol fail-closed export", () => {
  test.each([undefined, null, false, 1, "", "none", "auto", "triangle", "diamond", "Circle", {}])(
    "rejects malformed own symbol %s before resource access",
    async (markerSymbol) => {
      const f = fixture();
      Object.assign(f.drawing.chart.format!.series![0]!, { markerSymbol });
      const resources = vi.fn(() => []);
      expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(false);
      await expect(
        encodeXlsx(f.workbook, {
          get images() {
            return resources();
          },
        }),
      ).rejects.toBeInstanceOf(XlsxCompatibilityError);
      expect(resources).not.toHaveBeenCalled();
    },
  );

  test.each(["circle", "square"] as const)(
    "blocks hidden explicit %s without mutating latent Core geometry",
    async (markerSymbol) => {
      for (const hiddenAt of ["series", "chart"]) {
        const f = fixture(markerSymbol);
        if (hiddenAt === "series") f.drawing.chart.format!.series![0]!.markers = false;
        else f.drawing.chart.presentation = { lineMarkers: false };
        const before = serializeWorkbook(f.workbook);
        expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(false);
        await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
      }
    },
  );

  test("per-series visibility does not widen family-wide hidden-marker admission", async () => {
    const f = fixture();
    f.drawing.chart.presentation = { lineMarkers: false };
    f.drawing.chart.format!.series![0]!.markers = true;
    expect(supportsNativeLineSeriesStyles(f.drawing.chart)).toBe(true);
    expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["presentation.lineMarkers"]);
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
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
    "opposite",
    "header",
    "no-bindings",
    "getter",
    "inherited",
    "unknown-leaf",
  ])("rejects unsupported %s ownership without reading accessors", async (mode) => {
    const f = fixture();
    const chart = f.drawing.chart;
    const entry = chart.format!.series![0]!;
    const getter = vi.fn(() => "square");
    if (["column", "bar", "area", "radar", "combo"].includes(mode))
      Object.assign(chart, { type: mode });
    if (mode === "stacked") chart.stacked = true;
    if (mode === "pivot") chart.pivotTableId = "pivot";
    if (mode === "cache") Object.assign(chart, { dataCache: {} });
    if (mode === "source") Object.assign(chart, { source: {} });
    if (mode === "filter") chart.seriesFilter = { hiddenSeriesIds: ["shaped"] };
    if (mode === "dormant") entry.id = "retired";
    if (mode === "opposite") chart.rectangleSeries!.rows.push({ index: 1, id: "retired" });
    if (mode === "header") chart.rectangleSeries!.columns[0]!.index = 0;
    if (mode === "no-bindings") delete chart.rectangleSeries;
    if (mode === "getter") Object.defineProperty(entry, "markerSymbol", { get: getter });
    if (mode === "inherited") {
      delete entry.markerSymbol;
      Object.setPrototypeOf(entry, { markerSymbol: "square" });
    }
    if (mode === "unknown-leaf") Object.assign(entry, { markerShape: "square" });
    expect(supportsNativeLineSeriesStyles(chart)).toBe(false);
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("unsupported native marker geometry", () => {
  test.each(["auto", "diamond", "triangle", "star", "x", "plus", "dash", "dot", "picture", ""])(
    "omits %s markers rather than guessing a supported shape",
    async (symbol) => {
      const read = await editXml((xml) =>
        xml.replace('<c:symbol val="square"/>', `<c:symbol val="${symbol}"/>`),
      );
      expect([...read.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
      expect(locations(read)).toContain(`${part}.format.series[0].markers`);
      expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
    },
  );

  test.each([
    "",
    "<c:symbol/>",
    '<c:symbol val="square"/><c:symbol val="circle"/>',
    '<c:symbol val="square" other="1"/>',
    '<c:symbol val="square"><c:size val="9"/></c:symbol>',
    '<c:symbol val="square">text</c:symbol>',
  ])("omits malformed symbol leaves %s with a precise diagnostic", async (symbolXml) => {
    const read = await editXml((xml) => xml.replace('<c:symbol val="square"/>', symbolXml));
    expect([...read.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(locations(read)).toContain(`${part}.format.series[0].markers`);
    expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  });

  test.each([
    "",
    "<c:size/>",
    '<c:size val="1"/>',
    '<c:size val="73"/>',
    '<c:size val="2.5"/>',
    '<c:size val="9.0"/>',
    '<c:size val="9e0"/>',
    '<c:size val=" 9 "/>',
    '<c:size val="9"/><c:size val="9"/>',
    '<c:size val="9" other="1"/>',
  ])("square retains strict size validation for %s", async (sizeXml) => {
    const read = await editXml((xml) => xml.replace('<c:size val="5"/>', sizeXml));
    expect([...read.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(locations(read)).toContain(`${part}.format.series[0].markerSize`);
    expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  });

  test("none imports visibility, not a latent symbol or size", async () => {
    const read = await editXml((xml) =>
      xml.replace('<c:symbol val="square"/>', '<c:symbol val="none"/>'),
    );
    expect(imported(read).styles[0]).toMatchObject({ markers: false });
    expect(imported(read).styles[0]?.markerSymbol).toBeUndefined();
    expect(imported(read).styles[0]?.markerSizePt).toBeUndefined();
    expect(locations(read)).toContain(`${part}.format.series[0].markerGeometry`);
  });

  test("family marker=0 preserves proven all-hidden series", async () => {
    const read = await editXml((xml) =>
      xml
        .replace(/<c:marker>[\s\S]*?<\/c:marker>/g, '<c:marker><c:symbol val="none"/></c:marker>')
        .replace('<c:marker val="1"/>', '<c:marker val="0"/>'),
    );
    expect(imported(read).styles.every((entry) => entry?.markers === false)).toBe(true);
    expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
  });

  test("actual WPS square-to-none preserves absence without inventing latent shape or size", async () => {
    const bytes = new Uint8Array(
      await readFile(new URL("./fixtures/wps-native-marker-symbol-none.xlsx", import.meta.url)),
    );
    const native = strFromU8(unzipSync(bytes)[part]!);
    expect(native.match(/<c:marker>[\s\S]*?<\/c:marker>/g)).toEqual([
      '<c:marker><c:symbol val="none"/></c:marker>',
      '<c:marker><c:symbol val="none"/></c:marker>',
    ]);
    expect(native).toContain('<c:marker val="0"/>');
    const read = await decodeXlsx(bytes);
    expect(imported(read).styles.every((entry) => entry?.markers === false)).toBe(true);
    expect(imported(read).styles.every((entry) => entry?.markerSymbol === undefined)).toBe(true);
    expect(imported(read).styles.every((entry) => entry?.markerSizePt === undefined)).toBe(true);
    expect(read.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
    const again = await decodeXlsx((await encodeXlsx(read.workbook)).bytes);
    expect(imported(again).chart).toEqual(imported(read).chart);
  });

  test("per-point square markers stay outside the series-symbol contract", async () => {
    await expect(
      editXml((xml) =>
        xml.replace(
          "</c:marker>",
          '</c:marker><c:dPt><c:idx val="0"/><c:marker><c:symbol val="square"/><c:size val="9"/></c:marker></c:dPt>',
        ),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
