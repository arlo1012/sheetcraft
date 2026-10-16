import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator, setCellContent, type Workbook } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
import { nativeChartFixture } from "../pivot-tables/native-chart-fixture.js";

const legends = [
  ["top", "t"],
  ["bottom", "b"],
  ["left", "l"],
  ["right", "r"],
  ["topRight", "tr"],
] as const;
const labels = [
  ["center", "ctr"],
  ["insideEnd", "inEnd"],
  ["insideBase", "inBase"],
  ["outsideEnd", "outEnd"],
] as const;
function imported(workbook: Workbook) {
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((value) => value.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing editable native chart.");
  return { sheet, chart: drawing.chart };
}
// Test observable settings, not whether equivalent defaults survived as own properties.
function effective(chart: SheetChart) {
  const e = chart.elements;
  return {
    title: chart.title,
    titlePosition: chart.title ? (e?.titlePosition ?? "above") : "none",
    legend: chart.legend,
    legendPosition: chart.legend ? (e?.legendPosition ?? "bottom") : undefined,
    legendOverlay: chart.legend ? (e?.legendOverlay ?? false) : undefined,
    labels: chart.labels,
    labelPosition:
      chart.labels && chart.type !== "line" ? (e?.labelPosition ?? "center") : undefined,
    dataTable: e?.dataTable ?? "none",
    labelContent: e?.labelContent ?? "value",
    labelScope: e?.labelScope ?? "all",
  };
}
function chartXml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["xl/charts/chart1.xml"]!);
}

for (const type of ["column", "bar", "line"] as const)
  describe(`native ${type} element positions`, () => {
    test.each(legends)(
      "retains %s legend and both overlays through snapshots and live edits",
      async (position, token) => {
        for (const overlay of [false, true]) {
          const f = nativeColumnFixture();
          f.drawing.chart.type = type;
          f.drawing.chart.elements = {
            titlePosition: overlay ? "overlay" : "above",
            legendPosition: position,
            legendOverlay: overlay,
          };
          const before = serializeWorkbook(f.workbook),
            expected = effective(f.drawing.chart);
          const out = await encodeXlsx(f.workbook);
          expect(serializeWorkbook(f.workbook)).toEqual(before);
          expect(
            out.report.issues.some(
              (issue) => issue.severity === "block" || issue.code === "feature-omitted",
            ),
          ).toBe(false);
          const xml = chartXml(out.bytes);
          expect(xml).toContain(
            `<c:legend><c:legendPos val="${token}"/><c:layout/><c:overlay val="${Number(overlay)}"/>`,
          );
          expect(xml).toContain(`<c:overlay val="${Number(overlay)}"/></c:title>`);
          expect(xml).not.toMatch(/sheetcraft|<c:extLst|<c:pivotSource/);
          const first = await decodeXlsx(out.bytes);
          expect(effective(imported(first.workbook).chart)).toEqual(expected);
          expect(first.report.issues).toContainEqual(
            expect.objectContaining({
              code: "style-omitted",
              locations: expect.arrayContaining(["xl/charts/chart1.xml"]),
            }),
          );
          const snapshot = deserializeWorkbook(serializeWorkbook(first.workbook));
          const current = imported(snapshot);
          setCellContent(current.sheet, { row: 1, column: 1 }, { kind: "literal", value: 321 });
          const final = (await decodeXlsx((await encodeXlsx(snapshot)).bytes)).workbook;
          const recovered = imported(final);
          expect(effective(recovered.chart)).toEqual(expected);
          expect(
            getSheetChartData(
              recovered.sheet,
              recovered.chart,
              createWorkbookEvaluator(final, recovered.sheet.id),
            ).series[0]!.values[0],
          ).toBe(321);
        }
      },
    );

    test("uses the Web bottom default and accepts explicit equivalent defaults", async () => {
      const f = nativeColumnFixture();
      f.drawing.chart.type = type;
      const plain = await encodeXlsx(f.workbook);
      expect(chartXml(plain.bytes)).toContain('<c:legendPos val="b"/>');
      f.drawing.chart.elements = { dataTable: "none", labelContent: "value", labelScope: "all" };
      const explicit = await encodeXlsx(f.workbook);
      expect(chartXml(explicit.bytes)).toBe(chartXml(plain.bytes));
      expect(effective(imported((await decodeXlsx(explicit.bytes)).workbook).chart)).toEqual(
        effective(f.drawing.chart),
      );
    });
  });

for (const type of ["column", "bar"] as const)
  describe(`native ${type} labels`, () => {
    test.each(labels)(
      "keeps %s with positive, negative, zero and missing values",
      async (position, token) => {
        const f = nativeColumnFixture();
        f.drawing.chart.type = type;
        f.drawing.chart.labels = true;
        f.drawing.chart.elements = { labelPosition: position };
        setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: -20 });
        setCellContent(f.sheet, { row: 2, column: 1 }, { kind: "literal", value: 0 });
        setCellContent(f.sheet, { row: 2, column: 2 }, null);
        const out = await encodeXlsx(f.workbook);
        expect(chartXml(out.bytes)).toContain(`<c:dLbls><c:dLblPos val="${token}"/>`);
        const first = (await decodeXlsx(out.bytes)).workbook;
        const second = (await decodeXlsx((await encodeXlsx(first)).bytes)).workbook;
        const result = imported(second);
        expect(effective(result.chart)).toEqual(effective(f.drawing.chart));
        expect(
          getSheetChartData(
            result.sheet,
            result.chart,
            createWorkbookEvaluator(second, result.sheet.id),
          ).series.map((series) => series.values),
        ).toEqual([
          [-20, 0, 120],
          [70, null, 90],
        ]);
      },
    );
  });

describe("bounded native elements and malformed inputs", () => {
  test("retains empty-title / hidden-legend semantics without private presence markers", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.title = "";
    f.drawing.chart.legend = false;
    f.drawing.chart.elements = { titlePosition: "none" };
    const out = await encodeXlsx(f.workbook);
    expect(chartXml(out.bytes)).toContain('<c:autoTitleDeleted val="1"/>');
    expect(chartXml(out.bytes)).not.toContain("<c:legend>");
    expect(effective(imported((await decodeXlsx(out.bytes)).workbook).chart)).toEqual(
      effective(f.drawing.chart),
    );
  });

  test.each([
    [
      "invalid legend",
      (xml: string) => xml.replace('<c:legendPos val="b"/>', '<c:legendPos val="diagonal"/>'),
    ],
    [
      "duplicate legend",
      (xml: string) =>
        xml.replace('<c:legendPos val="b"/>', '<c:legendPos val="b"/><c:legendPos val="l"/>'),
    ],
    ["missing legend position", (xml: string) => xml.replace('<c:legendPos val="b"/>', "")],
    [
      "invalid title overlay",
      (xml: string) =>
        xml.replace('<c:overlay val="0"/></c:title>', '<c:overlay val="yes"/></c:title>'),
    ],
    [
      "duplicate title overlay",
      (xml: string) =>
        xml.replace(
          '<c:overlay val="0"/></c:title>',
          '<c:overlay val="0"/><c:overlay val="1"/></c:title>',
        ),
    ],
    [
      "conflicting title visibility",
      (xml: string) => xml.replace("</c:title>", '</c:title><c:autoTitleDeleted val="1"/>'),
    ],
    [
      "nonempty legend layout",
      (xml: string) =>
        xml.replace(
          '<c:legendPos val="b"/><c:layout/>',
          '<c:legendPos val="b"/><c:layout><c:legendPos val="l"/></c:layout>',
        ),
    ],
    [
      "invalid legend overlay",
      (xml: string) =>
        xml.replace('<c:overlay val="0"/></c:legend>', '<c:overlay val="yes"/></c:legend>'),
    ],
    [
      "unknown label position",
      (xml: string) => xml.replace('<c:dLblPos val="ctr"/>', '<c:dLblPos val="bestFit"/>'),
    ],
    [
      "duplicate label position",
      (xml: string) =>
        xml.replace('<c:dLblPos val="ctr"/>', '<c:dLblPos val="ctr"/><c:dLblPos val="outEnd"/>'),
    ],
    [
      "nested label leaf",
      (xml: string) =>
        xml.replace(
          '<c:dLblPos val="ctr"/>',
          '<c:dLblPos val="ctr"><c:showVal val="1"/></c:dLblPos>',
        ),
    ],
    [
      "unknown label attribute",
      (xml: string) => xml.replace('<c:dLblPos val="ctr"/>', '<c:dLblPos val="ctr" extra="1"/>'),
    ],
    [
      "dormant label position",
      (xml: string) => xml.replace('<c:showVal val="1"/>', '<c:showVal val="0"/>'),
    ],
    [
      "deleted shown labels",
      (xml: string) => xml.replace("<c:dLbls>", '<c:dLbls><c:delete val="1"/>'),
    ],
    [
      "different label content",
      (xml: string) => xml.replace('<c:showSerName val="0"/>', '<c:showSerName val="1"/>'),
    ],
  ] as const)("omits %s atomically with a located warning", async (_name, change) => {
    const f = nativeColumnFixture();
    f.drawing.chart.labels = true;
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    const before = strFromU8(entries["xl/charts/chart1.xml"]!);
    const after = change(before);
    expect(after).not.toBe(before);
    entries["xl/charts/chart1.xml"] = strToU8(after);
    const out = await decodeXlsx(zipSync(entries));
    expect([...out.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
    expect(out.report.issues).toContainEqual(
      expect.objectContaining({ code: "feature-omitted", locations: ["xl/charts/chart1.xml"] }),
    );
  });

  test("does not admit line label positions", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.type = "line";
    f.drawing.chart.labels = true;
    const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
    entries["xl/charts/chart1.xml"] = strToU8(
      strFromU8(entries["xl/charts/chart1.xml"]!).replace(
        "<c:dLbls>",
        '<c:dLbls><c:dLblPos val="ctr"/>',
      ),
    );
    const out = await decodeXlsx(zipSync(entries));
    expect([...out.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
  });

  test("keeps pivot legend defaults and rejects newly admitted ordinary label leaves", async () => {
    const f = nativeChartFixture();
    const out = await encodeXlsx(f.workbook);
    expect(chartXml(out.bytes)).toContain('<c:legendPos val="r"/>');
    expect(chartXml(out.bytes)).not.toContain("<c:dLblPos");
    const entries = unzipSync(out.bytes);
    entries["xl/charts/chart1.xml"] = strToU8(
      strFromU8(entries["xl/charts/chart1.xml"]!).replace(
        "<c:dLbls>",
        '<c:dLbls><c:dLblPos val="ctr"/>',
      ),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
