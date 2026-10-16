import { normalizeChartFormat } from "@sheetcraft/core/chart-format";
import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { setCellContent } from "@sheetcraft/core/workbook";
import {
  DEFAULT_CHART_PALETTE,
  resolveChartSeriesColors,
} from "@sheetcraft/core/chart-presentation";
import { encodeXlsx, decodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { unsupportedNativeChartStyles } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

function imported(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const sheet = [...result.workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((d) => d.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing native chart");
  return { chart: drawing.chart, sheet };
}
function xml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["xl/charts/chart1.xml"]!);
}
function explicit() {
  const fixture = nativeColumnFixture();
  fixture.drawing.chart.presentation = { palette: ["#2468ac", "#d15a28"] };
  fixture.drawing.chart.format = {
    title: { fontFamily: "Arial", fontSize: 15, bold: false, color: "#123456" },
    categoryAxis: { text: { fontFamily: "Arial", fontSize: 12, bold: true, color: "#234567" } },
    valueAxis: { text: { fontFamily: "Arial", fontSize: 16, bold: false, color: "#345678" } },
  };
  return fixture;
}
for (const type of ["column", "bar", "line"] as const)
  describe(`${type} native shared styles`, () => {
    test("preserves explicit RGB and uniform text through snapshot/live source edit", async () => {
      const f = explicit();
      f.drawing.chart.type = type;
      const before = serializeWorkbook(f.workbook);
      const out = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(xml(out.bytes)).toContain('sz="1125" b="0"');
      expect(xml(out.bytes)).toContain('<a:srgbClr val="2468AC"/>');
      expect(xml(out.bytes)).not.toContain("schemeClr");
      const first = await decodeXlsx(out.bytes),
        a = imported(first);
      expect(a.chart.format).toEqual(f.drawing.chart.format);
      expect(a.chart.presentation).toEqual(f.drawing.chart.presentation);
      expect(a.chart.rectangleSeries).toBeUndefined();
      expect(a.chart.format?.series).toBeUndefined();
      const snapshot = deserializeWorkbook(serializeWorkbook(first.workbook));
      const sheet = [...snapshot.sheets.values()][0]!;
      setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 90 });
      const second = await encodeXlsx(snapshot);
      expect(xml(second.bytes)).toContain("<c:v>90</c:v>");
      const b = imported(await decodeXlsx(second.bytes));
      expect(b.chart.format).toEqual(a.chart.format);
      expect(b.chart.presentation).toEqual(a.chart.presentation);
      // This is serialization proof only; real application acceptance is separate.
      expect(second.report.issues.some((issue) => issue.code === "style-omitted")).toBe(true);
    });
    test("writes actual default blue/green and a 15px regular Arial title", async () => {
      const f = nativeColumnFixture();
      f.drawing.chart.type = type;
      const out = await encodeXlsx(f.workbook);
      expect(xml(out.bytes)).toContain('<a:srgbClr val="2563EB"/>');
      expect(xml(out.bytes)).toContain('<a:srgbClr val="16A34A"/>');
      expect(xml(out.bytes)).toContain('<a:defRPr sz="1125" b="0">');
      expect(xml(out.bytes)).toContain('<a:ea typeface="Arial"/>');
      expect(imported(await decodeXlsx(out.bytes)).chart.presentation).toBeUndefined();
      expect(DEFAULT_CHART_PALETTE.slice(0, 2)).toEqual(["#2563eb", "#16a34a"]);
    });
  });

test("palette resolver shares name cache, blank progression and explicit-slot semantics", () => {
  expect(
    resolveChartSeriesColors(
      [
        { name: "same" },
        { name: "same" },
        { name: "", color: "custom" },
        { name: "" },
        { name: "" },
        { name: "next" },
      ],
      ["a", "b", "c", "d"],
    ),
  ).toEqual(["a", "a", "custom", "b", "c", "d"]);
});
test("same-name native series reuse the Web color without creating identities", async () => {
  const f = nativeColumnFixture();
  setCellContent(f.sheet, { row: 0, column: 2 }, { kind: "literal", value: "apple" });
  const out = await encodeXlsx(f.workbook);
  expect(xml(out.bytes).match(/<a:srgbClr val="2563EB"\/>/g)).toHaveLength(2);
  const chart = imported(await decodeXlsx(out.bytes)).chart;
  expect(chart.presentation).toBeUndefined();
  expect(chart.rectangleSeries).toBeUndefined();
});

test.each([
  ["font list", { title: { fontFamily: "Arial, sans-serif" } }, "format.title.fontFamily"],
  ["generic font", { title: { fontFamily: "sans-serif" } }, "format.title.fontFamily"],
  ["transparent text", { title: { color: "transparent" } }, "format.title.color"],
  ["alpha text", { title: { color: "#1234" } }, "format.title.color"],
  ["italic", { title: { italic: false } }, "format.title.italic"],
  ["sub-hundredth pt", { title: { fontSize: 15.001 } }, "format.title.fontSize"],
  ["plot", { plot: { fill: "#fff" } }, "format.plot"],
  ["axis bounds", { valueAxis: { min: 0 } }, "format.valueAxis.min"],
  ["series IDs", { series: [{ id: "made-up", color: "#fff" }] }, "format.series"],
] as const)("blocks unsupported %s at its leaf before resources", async (_name, format, path) => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = normalizeChartFormat(format);
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([path]);
  const resources = vi.fn(() => []);
  await expect(
    encodeXlsx(f.workbook, {
      get images() {
        return resources();
      },
    }),
  ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  expect(resources).not.toHaveBeenCalled();
});
test("style accessors and prototype choices are blocked without invocation", () => {
  const f = nativeColumnFixture(),
    getter = vi.fn(() => "Arial");
  f.drawing.chart.format = { title: {} };
  Object.defineProperty(f.drawing.chart.format.title!, "fontFamily", { get: getter });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format.title"]);
  expect(getter).not.toHaveBeenCalled();
  f.drawing.chart.format = Object.create({ title: { fontFamily: "Arial" } });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format"]);
});
test("only palette presentation opens; 17 series and source metadata stay blocked", () => {
  const f = explicit();
  f.drawing.chart.presentation = { palette: ["#abc"], lineMarkers: true, background: "#fff" };
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([
    "presentation.lineMarkers",
    "presentation.background",
  ]);
  f.drawing.chart.presentation = { palette: ["#abc"] };
  f.drawing.chart.range!.end.column = 17;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format", "presentation"]);
});
test("different script fonts warn on the exact leaf while retaining size/bold/color", async () => {
  const f = explicit(),
    out = await encodeXlsx(f.workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    xml(out.bytes).replace('<a:ea typeface="Arial"/>', '<a:ea typeface="宋体"/>'),
  );
  const read = await decodeXlsx(zipSync(entries)),
    chart = imported(read).chart;
  expect(chart.format?.title).toEqual({ fontSize: 15, bold: false, color: "#123456" });
  expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
    "xl/charts/chart1.xml.format.title.fontFamily",
  );
});
test("nonuniform rich title style warns instead of using its first run", async () => {
  const f = explicit(),
    out = await encodeXlsx(f.workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    xml(out.bytes).replace(
      "<a:r><a:t>Sales</a:t></a:r>",
      '<a:r><a:rPr b="1"/><a:t>Sa</a:t></a:r><a:r><a:rPr b="0"/><a:t>les</a:t></a:r>',
    ),
  );
  const read = await decodeXlsx(zipSync(entries)),
    chart = imported(read).chart;
  expect(chart.title).toBe("Sales");
  expect(chart.format?.title?.bold).toBeUndefined();
  expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
    "xl/charts/chart1.xml.format.title.bold",
  );
});
test("opaque short RGB expands without alpha and roundtrips hundredth-point sizes", async () => {
  const f = explicit();
  f.drawing.chart.presentation = { palette: ["#abc", "#def"] };
  f.drawing.chart.format!.title = {
    fontFamily: "Arial",
    fontSize: 1001 / 75,
    color: "#abc",
    bold: true,
  };
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
  const out = await encodeXlsx(f.workbook);
  expect(xml(out.bytes)).toContain('sz="1001" b="1"');
  const chart = imported(await decodeXlsx(out.bytes)).chart;
  expect(chart.format?.title).toEqual({
    fontFamily: "Arial",
    fontSize: 1001 / 75,
    color: "#aabbcc",
    bold: true,
  });
  expect(chart.presentation?.palette).toEqual(["#aabbcc", "#ddeeff"]);
});
test("missing title fonts and unresolved theme colors warn on their exact leaves", async () => {
  const f = explicit(),
    out = await encodeXlsx(f.workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    xml(out.bytes)
      .replace('<a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/>', "")
      .replace('<a:srgbClr val="123456"/>', '<a:schemeClr val="tx1"/>'),
  );
  const read = await decodeXlsx(zipSync(entries)),
    chart = imported(read).chart;
  expect(chart.format?.title).toEqual({ fontSize: 15, bold: false });
  const locations = read.report.issues.flatMap((issue) => issue.locations);
  expect(locations).toContain("xl/charts/chart1.xml.format.title.fontFamily");
  expect(locations).toContain("xl/charts/chart1.xml.format.title.color");
});

test("actual WPS RGB producer preserves three editable styles and B2=90", async () => {
  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(
    await readFile(new URL("./fixtures/wps-native-styles-b2-90.xlsx", import.meta.url)),
  );
  const read = await decodeXlsx(bytes);
  const sheet = [...read.workbook.sheets.values()][0]!;
  const charts = (sheet.drawings ?? []).filter((drawing) => drawing.kind === "chart");
  expect(charts).toHaveLength(3);
  for (const drawing of charts) {
    if (drawing.kind !== "chart") throw new Error("Not a chart");
    expect(drawing.chart.presentation).toEqual({ palette: ["#2468ac", "#d15a28"] });
    expect(drawing.chart.format).toEqual(explicit().drawing.chart.format);
    expect(drawing.chart.rectangleSeries).toBeUndefined();
    expect(drawing.chart.format?.series).toBeUndefined();
  }
  const { getSheetChartData } = await import("@sheetcraft/core/sheet-charts");
  const { createWorkbookEvaluator } = await import("@sheetcraft/core/workbook");
  for (const drawing of charts) {
    if (drawing.kind !== "chart") continue;
    expect(
      getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(read.workbook, sheet.id))
        .series[0]!.values,
    ).toEqual([90, 100, 120]);
  }
  const reexported = await encodeXlsx(deserializeWorkbook(serializeWorkbook(read.workbook)));
  expect(xml(reexported.bytes)).toContain('sz="1125" b="0"');
  expect(xml(reexported.bytes)).toContain("<c:v>90</c:v>");
});

test.each(["solid", "dash", "solid-extra-attribute", "solid-text", "wrong-namespace"])(
  "bounds WPS marker stroke leaf %s",
  async (choice) => {
    const f = explicit();
    f.drawing.chart.type = "line";
    const out = await encodeXlsx(f.workbook),
      entries = unzipSync(out.bytes);
    const leaf =
      choice === "solid-extra-attribute"
        ? '<a:prstDash val="solid" extra="1"/>'
        : choice === "solid-text"
          ? '<a:prstDash val="solid">text</a:prstDash>'
          : choice === "wrong-namespace"
            ? '<c:prstDash val="solid"/>'
            : `<a:prstDash val="${choice}"/>`;
    entries["xl/charts/chart1.xml"] = strToU8(
      xml(out.bytes).replace(
        /<c:marker>([\s\S]*?)<\/c:marker>/g,
        (_full, body: string) =>
          `<c:marker>${body.replace("</a:ln>", `${leaf}</a:ln>`)}</c:marker>`,
      ),
    );
    const input = zipSync(entries);
    if (choice === "solid")
      expect(imported(await decodeXlsx(input)).chart.presentation).toEqual(
        f.drawing.chart.presentation,
      );
    else await expect(decodeXlsx(input)).rejects.toBeInstanceOf(XlsxCompatibilityError);
  },
);
test("marker solid-dash allowance does not admit the same leaf in chart title text", async () => {
  const f = explicit(),
    out = await encodeXlsx(f.workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    xml(out.bytes).replace("<a:pPr>", '<a:pPr><a:prstDash val="solid"/>'),
  );
  await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
});
