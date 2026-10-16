import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate/browser";
import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeElementsFixture } from "./native-elements-fixture.js";
import { nativeChartFixture } from "../pivot-tables/native-chart-fixture.js";

// Actual WPS 12.1.2.29182 saves of this task's synthetic 17-sheet workbook.
// core/custom metadata and their root relationship/content-type entries were removed.
// Chart, drawing, worksheet, shared-string and theme bytes were not rewritten.
const fixtures = [
  [
    "wps-native-elements-sanitized.xlsx",
    60,
    "d0210ef366570079945cf48d1d16413e9de4f4c591543fe5fc7fc735e106006a",
  ],
  [
    "wps-native-elements-edited-sanitized.xlsx",
    90,
    "b3e1e5312e23b6bf9a8514c499fa8e11049f6907cf8a57bdd7edeed790494c1e",
  ],
] as const;
const bytes = (filename: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${filename}`, import.meta.url)));
const untouched = () => bytes(fixtures[0][0]);
function drawing(workbook: Workbook, sheetName: string) {
  const sheet = [...workbook.sheets.values()].find((sheet) => sheet.name === sheetName)!;
  const charts = (sheet.drawings ?? []).filter((node) => node.kind === "chart");
  expect(charts).toHaveLength(1);
  return { sheet, chart: charts[0]!.chart };
}
function effective(chart: SheetChart) {
  return {
    type: chart.type,
    title: chart.title,
    titlePosition: chart.title ? (chart.elements?.titlePosition ?? "above") : "none",
    legend: chart.legend,
    legendPosition: chart.legend ? (chart.elements?.legendPosition ?? "bottom") : undefined,
    legendOverlay: chart.legend ? (chart.elements?.legendOverlay ?? false) : undefined,
    labels: chart.labels,
    labelPosition:
      chart.labels && chart.type !== "line"
        ? (chart.elements?.labelPosition ?? "center")
        : undefined,
  };
}
function patchXml(transform: (xml: string) => string, part = "xl/charts/chart1.xml") {
  const entries = unzipSync(untouched());
  const before = strFromU8(entries[part]!);
  const after = transform(before);
  expect(after).not.toBe(before);
  entries[part] = strToU8(after);
  return zipSync(entries);
}
function firstSeries(xml: string, transform: (series: string) => string) {
  return xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/, transform);
}
function firstLabels(xml: string, transform: (labels: string) => string) {
  return firstSeries(xml, (series) => series.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/, transform));
}
async function rejectedOrOmitted(
  input: Uint8Array,
  sheetName = "column-top",
  part = "xl/charts/chart1.xml",
) {
  try {
    const result = await decodeXlsx(input);
    const sheet = [...result.workbook.sheets.values()].find((sheet) => sheet.name === sheetName)!;
    expect(sheet.drawings?.filter((node) => node.kind === "chart") ?? []).toHaveLength(0);
    expect(
      result.report.issues.some(
        (issue) => issue.code === "feature-omitted" && issue.locations.includes(part),
      ),
    ).toBe(true);
  } catch (error) {
    expect(error).toBeInstanceOf(XlsxCompatibilityError);
    expect(
      (error as XlsxCompatibilityError).report.issues.some((issue) => issue.severity === "block"),
    ).toBe(true);
  }
}

describe("actual WPS uniform native label roundtrip", () => {
  test.each(fixtures)(
    "imports and reexports all 17 charts from %s",
    async (filename, firstValue, sha) => {
      const input = bytes(filename);
      expect(createHash("sha256").update(input).digest("hex")).toBe(sha);
      const archive = unzipSync(input);
      expect(archive["docProps/core.xml"]).toBeUndefined();
      expect(archive["docProps/custom.xml"]).toBeUndefined();
      const result = await decodeXlsx(input);
      expect(
        result.report.issues.filter(
          (issue) => issue.severity === "block" || issue.code === "feature-omitted",
        ),
      ).toEqual([]);
      const expected = nativeElementsFixture();
      for (const original of expected.workbook.sheets.values()) {
        const { sheet, chart } = drawing(result.workbook, original.name);
        expect(effective(chart)).toEqual(
          effective(drawing(expected.workbook, original.name).chart),
        );
        const data = getSheetChartData(
          sheet,
          chart,
          createWorkbookEvaluator(result.workbook, sheet.id),
        );
        expect(data.series.map((entry) => entry.name)).toEqual(["Apples", "Pears"]);
        expect(data.series.map((entry) => entry.values)).toEqual([
          [original.name === "no-title-or-legend" ? firstValue : 60, -100, 0],
          [70, 80, null],
        ]);
      }
      const exported = await encodeXlsx(result.workbook);
      expect(
        exported.report.issues.some(
          (issue) => issue.severity === "block" || issue.code === "feature-omitted",
        ),
      ).toBe(false);
      const again = await decodeXlsx(exported.bytes);
      for (const sheet of result.workbook.sheets.values())
        expect(effective(drawing(again.workbook, sheet.name).chart)).toEqual(
          effective(drawing(result.workbook, sheet.name).chart),
        );
      const last = drawing(again.workbook, "no-title-or-legend");
      expect(
        getSheetChartData(
          last.sheet,
          last.chart,
          createWorkbookEvaluator(again.workbook, last.sheet.id),
        ).series[0]!.values[0],
      ).toBe(firstValue);
    },
  );

  test("namespace/schema rejection retains the exact chart part", async () => {
    const input = patchXml((xml) =>
      firstLabels(xml, (labels) =>
        labels.replace('<c15:showLeaderLines val="0"/>', '<c15:showLeaderLines val="1"/>'),
      ),
    );
    try {
      await decodeXlsx(input);
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxCompatibilityError);
      expect((error as XlsxCompatibilityError).report.issues).toContainEqual({
        code: "drawing-or-media",
        severity: "block",
        count: 1,
        locations: ["xl/charts/chart1.xml"],
      });
    }
  });

  const changes: Array<[string, (labels: string) => string]> = [
    [
      "different per-series position",
      (s) => s.replace('dLblPos val="ctr"', 'dLblPos val="outEnd"'),
    ],
    ["only one series override", () => ""],
    ["mixed disabled series", () => '<c:dLbls><c:delete val="1"/></c:dLbls>'],
    ["different label content", (s) => s.replace('showSerName val="0"', 'showSerName val="1"')],
    ["unlinked label format", (s) => s.replace('sourceLinked="1"', 'sourceLinked="0"')],
    ["non-General label format", (s) => s.replace('formatCode="General"', 'formatCode="0.00%"')],
    [
      "extra format attributes",
      (s) => s.replace('sourceLinked="1"', 'sourceLinked="1" surprise="1"'),
    ],
    [
      "true native leader lines",
      (s) => s.replace('<c:showLeaderLines val="0"/>', '<c:showLeaderLines val="1"/>'),
    ],
    [
      "true extension leader lines",
      (s) => s.replace('<c15:showLeaderLines val="0"/>', '<c15:showLeaderLines val="1"/>'),
    ],
    [
      "unknown extension UUID",
      (s) =>
        s.replace("CE6537A1-D6FC-4f65-9D91-7224C49458BB", "CE6537A1-D6FC-4f65-9D91-7224C49458BA"),
    ],
    ["unknown extension child", (s) => s.replace("<c15:layout/>", "<c15:unknown/>")],
    [
      "nonempty dormant layout",
      (s) => s.replace("<c15:layout/>", "<c15:layout><c:manualLayout/></c15:layout>"),
    ],
    [
      "nonempty dormant leader style",
      (s) =>
        s.replace(
          "<c15:leaderLines/>",
          '<c15:leaderLines><c:spPr><a:solidFill><a:srgbClr val="ff0000"/></a:solidFill></c:spPr></c15:leaderLines>',
        ),
    ],
    [
      "extra dormant layout attribute",
      (s) => s.replace("<c15:layout/>", '<c15:layout mode="edge"/>'),
    ],
    [
      "namespace spoofing",
      (s) =>
        s.replace("http://schemas.microsoft.com/office/drawing/2012/chart", "urn:untrusted-chart"),
    ],
    ["chart-namespace imitation", (s) => s.replace("<c15:layout/>", "<c:layout/>")],
    ["duplicate extension leaf", (s) => s.replace("<c15:layout/>", "<c15:layout/><c15:layout/>")],
    ["duplicate extension", (s) => s.replace(/(<c:ext uri="\{CE[\s\S]*?<\/c:ext>)/, "$1$1")],
    [
      "duplicate label position",
      (s) => s.replace('<c:dLblPos val="ctr"/>', '<c:dLblPos val="ctr"/><c:dLblPos val="ctr"/>'),
    ],
    ["missing extension leaf", (s) => s.replace("<c15:leaderLines/>", "")],
  ];
  test.each(changes)("does not admit %s", async (_label, change) => {
    await rejectedOrOmitted(patchXml((xml) => firstLabels(xml, change)));
  });

  test("does not discard a conflicting family label position", async () => {
    await rejectedOrOmitted(
      patchXml((xml) =>
        xml.replace(/(<c:dLbls>)(?=<c:showLegendKey)/, '$1<c:dLblPos val="outEnd"/>'),
      ),
    );
  });
  test("does not accept the label extension under a legend", async () => {
    await rejectedOrOmitted(
      patchXml((xml) => {
        const labels = xml.match(/<c:dLbls>[\s\S]*?<\/c:dLbls>/)![0];
        return xml.replace("</c:legend>", `${labels}</c:legend>`);
      }),
    );
  });
  test("does not extend line labels", async () => {
    const native = strFromU8(unzipSync(untouched())["xl/charts/chart1.xml"]!);
    const labels = native.match(/<c:dLbls>[\s\S]*?<\/c:dLbls>/)![0];
    await rejectedOrOmitted(
      patchXml((xml) => firstLabels(xml, () => labels), "xl/charts/chart11.xml"),
      "line-top",
      "xl/charts/chart11.xml",
    );
  });
  test("does not extend PivotChart labels or swallow their rejection", async () => {
    const fixture = nativeChartFixture();
    const entries = unzipSync((await encodeXlsx(fixture.workbook)).bytes);
    const native = strFromU8(unzipSync(untouched())["xl/charts/chart1.xml"]!);
    const labels = native.match(/<c:dLbls>[\s\S]*?<\/c:dLbls>/)![0];
    entries["xl/charts/chart1.xml"] = strToU8(
      firstSeries(strFromU8(entries["xl/charts/chart1.xml"]!), (s) =>
        s.replace("</c:ser>", `${labels}</c:ser>`),
      ),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
