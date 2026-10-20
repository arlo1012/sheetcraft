import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, setCellValue } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { supportsNativeLineSeriesStyles } from "../../native-chart-style-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

function fixture() {
  const f = nativeColumnFixture();
  f.drawing.chart.type = "line";
  return f;
}
async function withXml(edit: (xml: string) => string) {
  const f = fixture();
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries["xl/charts/chart1.xml"] = strToU8(edit(strFromU8(entries["xl/charts/chart1.xml"]!)));
  return decodeXlsx(zipSync(entries));
}
function line(workbook: Awaited<ReturnType<typeof decodeXlsx>>["workbook"]) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing line");
  return { sheet, drawing };
}

describe("native ordinary line series styling", () => {
  test.each(["columns", "rows"] as const)(
    "%s binds widths and marker visibility to physical bands",
    async (seriesBy) => {
      const f = fixture();
      f.drawing.chart.seriesBy = seriesBy;
      if (seriesBy === "rows") {
        // The existing fixture has three row series; give the first two equal labels.
        setCellValue(f.sheet, { row: 1, column: 0 }, "same");
        setCellValue(f.sheet, { row: 2, column: 0 }, "same");
      } else {
        setCellValue(f.sheet, { row: 0, column: 1 }, "same");
        setCellValue(f.sheet, { row: 0, column: 2 }, "same");
      }
      const chart = f.drawing.chart;
      chart.rectangleSeries = { rows: [], columns: [] };
      chart.rectangleSeries[seriesBy] = [
        { index: 1, id: "first" },
        { index: 2, id: "second" },
      ];
      chart.format = {
        series: [
          { id: "second", strokeWidth: 4, markers: false },
          { id: "first", strokeWidth: 2, markers: true },
        ],
      };
      chart.presentation = { palette: ["#aabbcc", "#ddeeff"] };
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const xml = strFromU8(unzipSync(encoded.bytes)["xl/charts/chart1.xml"]!);
      expect(xml).toContain('w="19050"');
      expect(xml).toContain('w="38100"');
      expect(xml).toContain('<c:marker><c:symbol val="none"/></c:marker>');
      const decoded = await decodeXlsx(encoded.bytes);
      const { sheet, drawing } = line(decoded.workbook);
      const data = getSheetChartData(
        sheet,
        drawing.chart,
        createWorkbookEvaluator(decoded.workbook, sheet.id),
      );
      expect(data.series.slice(0, 2).map((entry) => entry.name)).toEqual(["same", "same"]);
      const styles = data.series.map((entry) =>
        drawing.chart.format!.series!.find((style) => style.id === entry.id),
      );
      expect(styles[0]).toMatchObject({ strokeWidth: 2, markers: true });
      expect(styles[1]).toMatchObject({ strokeWidth: 4, markers: false });
      expect(new Set(data.series.map((entry) => entry.id)).size).toBe(data.series.length);
      expect(styles.every((entry) => entry?.color === undefined)).toBe(true);
      const again = await decodeXlsx((await encodeXlsx(decoded.workbook)).bytes);
      expect(line(again.workbook).drawing.chart).toEqual(drawing.chart);
    },
  );

  test("observed WPS contour leaf preserves explicit widths and none marker", async () => {
    const result = await withXml((xml) => {
      let ordinal = 0;
      return xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (series) => {
        const width = ordinal++ === 0 ? 19050 : 38100;
        return series
          .replace('w="28575"', `w="${width}"`)
          .replace("</a:ln></c:spPr>", `</a:ln><a:sp3d contourW="${width}"/></c:spPr>`)
          .replace(/<c:marker>[\s\S]*?<\/c:marker>/, (marker) =>
            ordinal === 2 ? '<c:marker><c:symbol val="none"/></c:marker>' : marker,
          );
      });
    });
    expect(
      line(result.workbook).drawing.chart.format?.series?.map(({ strokeWidth, markers }) => ({
        strokeWidth,
        markers,
      })),
    ).toEqual([
      { strokeWidth: 2, markers: true },
      { strokeWidth: 4, markers: false },
    ]);
    expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
      "xl/charts/chart1.xml.format.series[0].markerSize",
    );
  });

  test.each([
    "mismatched",
    "extra-attribute",
    "payload",
    "wrong-location",
    "duplicate-shape",
    "duplicate-contour",
  ])("rejects unproven WPS contour %s", async (mode) => {
    await expect(
      withXml((xml) => {
        const leaf =
          mode === "extra-attribute"
            ? '<a:sp3d contourW="28575" z="1"/>'
            : mode === "payload"
              ? '<a:sp3d contourW="28575"><a:solidFill/></a:sp3d>'
              : `<a:sp3d contourW="${mode === "mismatched" ? 123 : 28575}"/>`;
        if (mode === "wrong-location") return xml.replace("<c:plotArea>", `<c:plotArea>${leaf}`);
        if (mode === "duplicate-shape")
          return xml.replace(
            "</a:ln></c:spPr>",
            `</a:ln>${leaf}</c:spPr><c:spPr><a:ln w="28575"/></c:spPr>`,
          );
        return xml.replace(
          "</a:ln></c:spPr>",
          `</a:ln>${leaf}${mode === "duplicate-contour" ? leaf : ""}</c:spPr>`,
        );
      }),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test.each(["chartStyle", "colorStyle"])(
    "does not admit WPS contour payloads in %s companions",
    async (root) => {
      const entries = unzipSync((await encodeXlsx(fixture().workbook)).bytes);
      const style = root === "chartStyle";
      const part = `xl/charts/${style ? "style" : "colors"}1.xml`;
      entries[part] = strToU8(
        `<cs:${root} xmlns:cs="http://schemas.microsoft.com/office/drawing/2012/chartStyle" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:sp3d contourW="123" z="999"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:sp3d></cs:${root}>`,
      );
      entries["xl/charts/_rels/chart1.xml.rels"] = strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/${style ? "chartStyle" : "chartColorStyle"}" Target="${style ? "style" : "colors"}1.xml"/></Relationships>`,
      );
      entries["[Content_Types].xml"] = strToU8(
        strFromU8(entries["[Content_Types].xml"]!).replace(
          "</Types>",
          `<Override PartName="/${part}" ContentType="application/vnd.ms-office.chart${style ? "style" : "colorstyle"}+xml"/></Types>`,
        ),
      );
      await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
    },
  );

  test.each(["absent", "empty"])(
    "retains ordinary lines with %s series shape as approximate defaults",
    async (mode) => {
      const result = await withXml((xml) =>
        xml.replace(
          /<c:spPr><a:ln w="28575"[\s\S]*?<\/a:ln><\/c:spPr>/g,
          mode === "absent" ? "" : "<c:spPr/>",
        ),
      );
      const { drawing } = line(result.workbook);
      expect(drawing.chart.type).toBe("line");
      expect(drawing.chart.format?.series).toBeUndefined();
      expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
      expect(result.report.issues.some((issue) => issue.code === "style-omitted")).toBe(true);
    },
  );

  test.each(["absent", "empty"])(
    "preserves explicit marker absence independently of %s series shape",
    async (mode) => {
      const result = await withXml((xml) =>
        xml
          .replace(
            /<c:spPr><a:ln w="28575"[\s\S]*?<\/a:ln><\/c:spPr>/g,
            mode === "absent" ? "" : "<c:spPr/>",
          )
          .replace(
            /<c:marker>[\s\S]*?<\/c:marker>/g,
            '<c:marker><c:symbol val="none"/></c:marker>',
          ),
      );
      const { drawing } = line(result.workbook);
      expect(drawing.chart.format?.series).toEqual([
        { id: "range-series-1", markers: false },
        { id: "range-series-2", markers: false },
      ]);
      expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
      expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
        "xl/charts/chart1.xml.format.series[0]",
      );
      const exported = await encodeXlsx(result.workbook);
      expect(
        strFromU8(unzipSync(exported.bytes)["xl/charts/chart1.xml"]!).match(
          /<c:marker><c:symbol val="none"\/><\/c:marker>/g,
        ),
      ).toHaveLength(2);
    },
  );

  test.each(["size", "compound", "cap", "width", "marker-paint"])(
    "reports unrepresented %s instead of claiming visual equivalence",
    async (mode) => {
      const result = await withXml((xml) =>
        mode === "size"
          ? xml.replace('<c:size val="5"/>', '<c:size val="9"/>')
          : mode === "compound"
            ? xml.replace('w="28575"', 'w="28575" cmpd="dbl"')
            : mode === "cap"
              ? xml.replace('cap="rnd"', 'cap="sq"')
              : mode === "width"
                ? xml.replace('w="28575"', 'w="-1"')
                : xml.replace(
                    '<c:spPr><a:solidFill><a:srgbClr val="2563EB"',
                    '<c:spPr><a:solidFill><a:srgbClr val="FF0000"',
                  ),
      );
      expect(line(result.workbook).drawing.chart.type).toBe("line");
      const suffix =
        mode === "size"
          ? "markerSize"
          : mode === "width"
            ? "strokeWidth"
            : mode === "marker-paint"
              ? "markerPaint"
              : "strokeStyle";
      expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
        `xl/charts/chart1.xml.format.series[0].${suffix}`,
      );
    },
  );

  test.each([
    "column",
    "dormant",
    "opposite",
    "header",
    "color",
    "axis",
    "zero",
    "fraction",
    "getter",
  ])("keeps unsupported %s styles outside native admission", async (mode) => {
    const f = fixture();
    const chart = f.drawing.chart;
    chart.rectangleSeries = { rows: [], columns: [{ index: 1, id: "active" }] };
    chart.format = { series: [{ id: "active", strokeWidth: 2, markers: true }] };
    if (mode === "column") chart.type = "column";
    if (mode === "dormant") chart.format.series![0]!.id = "retired";
    if (mode === "opposite") chart.rectangleSeries.rows.push({ index: 1, id: "retired" });
    if (mode === "header") chart.rectangleSeries.columns[0]!.index = 0;
    if (mode === "color") chart.format.series![0]!.color = "#ff0000";
    if (mode === "axis") chart.format.series![0]!.axis = "secondary";
    if (mode === "zero") chart.format.series![0]!.strokeWidth = 0;
    if (mode === "fraction") chart.format.series![0]!.strokeWidth = 1.00001;
    const getter = vi.fn(() => 2);
    if (mode === "getter")
      Object.defineProperty(chart.format.series![0]!, "strokeWidth", { get: getter });
    expect(supportsNativeLineSeriesStyles(chart as SheetChart)).toBe(false);
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });
});

test("actual WPS-authored 1.5pt/3pt circle/none stays editable through re-export", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = await decodeXlsx(
    new Uint8Array(
      await readFile(new URL("./fixtures/wps-native-line-series-styles.xlsx", import.meta.url)),
    ),
  );
  const { drawing } = line(read.workbook);
  expect(drawing.chart.format?.series).toEqual([
    { id: "range-series-1", strokeWidth: 2, markers: true },
    { id: "range-series-2", strokeWidth: 4, markers: false },
  ]);
  expect(drawing.chart.presentation).toBeUndefined();
  const next = await decodeXlsx((await encodeXlsx(read.workbook)).bytes);
  expect(line(next.workbook).drawing.chart.format?.series).toEqual(drawing.chart.format?.series);
  expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
    "xl/charts/chart1.xml.format.series[0].markerSize",
  );
});

test("hidden physical bands never redirect native style binding", async () => {
  const f = fixture();
  f.drawing.chart.showHidden = true;
  f.sheet.hiddenColumns = new Set([1]);
  f.drawing.chart.rectangleSeries = {
    rows: [],
    columns: [
      { index: 1, id: "hidden-first" },
      { index: 2, id: "visible-second" },
    ],
  };
  f.drawing.chart.format = {
    series: [
      { id: "hidden-first", strokeWidth: 2 },
      { id: "visible-second", strokeWidth: 4 },
    ],
  };
  const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
  const { drawing } = line(decoded.workbook);
  expect(
    drawing.chart.rectangleSeries?.columns.map((binding) => ({
      index: binding.index,
      width: drawing.chart.format!.series!.find((entry) => entry.id === binding.id)!.strokeWidth,
    })),
  ).toEqual([
    { index: 1, width: 2 },
    { index: 2, width: 4 },
  ]);
  // Compacting hidden bands remains the existing unsupported export case.
  f.drawing.chart.showHidden = false;
  const out = await encodeXlsx(f.workbook);
  expect(out.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  expect(unzipSync(out.bytes)["xl/charts/chart1.xml"]).toBeUndefined();
});

test.each(["shape", "size"])(
  "unsupported native marker %s retains a precise diagnostic and existing fail-closed behavior",
  async (mode) => {
    const result = await withXml((xml) =>
      mode === "shape"
        ? xml.replace('<c:symbol val="circle"/>', '<c:symbol val="star"/>')
        : xml.replace('<c:size val="5"/>', '<c:size val="1"/>'),
    );
    expect([...result.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
      `xl/charts/chart1.xml.format.series[0].${mode === "shape" ? "markers" : "markerSize"}`,
    );
    expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
  },
);
