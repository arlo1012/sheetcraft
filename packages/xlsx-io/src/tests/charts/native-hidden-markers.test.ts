import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

const part = "xl/charts/chart1.xml";
function imported(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const sheet = [...result.workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing line chart.");
  const data = getSheetChartData(
    sheet,
    drawing.chart,
    createWorkbookEvaluator(result.workbook, sheet.id),
  );
  return {
    chart: drawing.chart,
    data,
    styles: data.series.map((series) =>
      drawing.chart.format?.series?.find((entry) => entry.id === series.id),
    ),
  };
}
async function editXml(edit: (xml: string) => string) {
  const f = nativeColumnFixture();
  f.drawing.chart.type = "line";
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(edit(strFromU8(entries[part]!)));
  return decodeXlsx(zipSync(entries));
}
function hidden(xml: string) {
  return xml.replace(
    /<c:marker>[\s\S]*?<\/c:marker>/g,
    '<c:marker><c:symbol val="none"/></c:marker>',
  );
}
function assertOmitted(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  expect([...result.workbook.sheets.values()][0]!.drawings ?? []).toHaveLength(0);
  expect(result.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(true);
}

describe("explicit family marker flags with proven series overrides", () => {
  test.each(["0", "false", "1", "true"])(
    "all-none series stay hidden with family %s",
    async (value) => {
      const result = await editXml((xml) =>
        hidden(xml).replace('<c:marker val="1"/>', `<c:marker val="${value}"/>`),
      );
      const { chart, data, styles } = imported(result);
      expect(styles).toHaveLength(2);
      expect(styles.every((entry) => entry?.markers === false)).toBe(true);
      expect(
        styles.every(
          (entry) => entry?.markerSymbol === undefined && entry?.markerSizePt === undefined,
        ),
      ).toBe(true);
      expect(chart.presentation?.lineMarkers).toBeUndefined();
      expect(data.series.map((series) => series.values)).toEqual([
        [60, 100, 120],
        [70, 80, 90],
      ]);
      const snapshot = serializeWorkbook(result.workbook);
      expect(snapshot.version).toBeLessThan(92);
      const again = await decodeXlsx((await encodeXlsx(deserializeWorkbook(snapshot))).bytes);
      expect(imported(again).chart).toEqual(chart);
    },
  );

  test.each(["circle", "square"])(
    "family false does not hide explicit %s overrides",
    async (symbol) => {
      const result = await editXml((xml) =>
        xml
          .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
          .replace('<c:symbol val="circle"/>', `<c:symbol val="${symbol}"/>`)
          .replace(
            /<c:marker>([\s\S]*?)<\/c:marker>([\s\S]*?)<c:marker>[\s\S]*?<\/c:marker>/,
            '<c:marker>$1</c:marker>$2<c:marker><c:symbol val="none"/></c:marker>',
          ),
      );
      const { chart, styles } = imported(result);
      expect(chart.presentation?.lineMarkers).toBeUndefined();
      expect(styles[0]).toMatchObject({ markers: true, markerSizePt: 5 });
      expect(styles[0]?.markerSymbol).toBe(symbol === "square" ? "square" : undefined);
      expect(styles[1]).toMatchObject({ markers: false });
      expect(serializeWorkbook(result.workbook).version).toBe(symbol === "square" ? 93 : 92);
      expect(imported(await decodeXlsx((await encodeXlsx(result.workbook)).bytes)).chart).toEqual(
        chart,
      );
    },
  );

  test.each([
    "wps-all-hidden-resaved.xlsx",
    "mixed-family0-source.xlsx",
    "mixed-family0-wps-saved.xlsx",
  ])(
    "real WPS experiment %s preserves visibility, identity, geometry and widths",
    async (filename) => {
      const bytes = new Uint8Array(
        await readFile(
          new URL(
            `../../../../../docs/acceptance/evidence/native-hidden-markers-20261020/${filename}`,
            import.meta.url,
          ),
        ),
      );
      const result = await decodeXlsx(bytes);
      const { chart, data, styles } = imported(result);
      expect(data.series.map((series) => series.name)).toEqual(["apple", "pear"]);
      expect(new Set(data.series.map((series) => series.id)).size).toBe(2);
      expect(styles[0]?.strokeWidth).toBe(2);
      expect(styles[1]).toMatchObject({ strokeWidth: 4, markers: false });
      if (filename.startsWith("mixed"))
        expect(styles[0]).toMatchObject({ markers: true, markerSymbol: "square", markerSizePt: 9 });
      else expect(styles[0]).toMatchObject({ markers: false });
      expect(chart.presentation?.lineMarkers).toBeUndefined();
      expect(
        result.report.issues
          .filter((issue) => issue.code === "feature-omitted")
          .flatMap((issue) => issue.locations),
      ).not.toContain(part);
      expect(imported(await decodeXlsx((await encodeXlsx(result.workbook)).bytes)).chart).toEqual(
        chart,
      );
    },
  );
});

describe("family marker false does not bypass fail-closed guards", () => {
  test.each([
    "",
    "<c:marker/>",
    '<c:marker val=""/>',
    '<c:marker val="2"/>',
    '<c:marker val="False"/>',
    '<c:marker val=" 0 "/>',
    '<c:marker val="0.0"/>',
    '<c:marker val="0" extra="1"/>',
    '<c:marker val="0">text</c:marker>',
    '<c:marker val="0"><c:symbol val="none"/></c:marker>',
    '<c:marker val="0"/><c:marker val="0"/>',
    '<c:marker val="1" extra="1"/>',
  ])("rejects missing or malformed family leaf %s", async (leaf) => {
    assertOmitted(await editXml((xml) => hidden(xml).replace('<c:marker val="1"/>', leaf)));
  });
  test.each(["auto", "triangle", "diamond", "picture", "", "Circle"])(
    "false does not admit unsupported symbol %s",
    async (symbol) => {
      const result = await editXml((xml) =>
        xml
          .replace('<c:marker val="1"/>', '<c:marker val="false"/>')
          .replace('<c:symbol val="circle"/>', `<c:symbol val="${symbol}"/>`),
      );
      assertOmitted(result);
      expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
        `${part}.format.series[0].markers`,
      );
    },
  );
  test.each([
    '<c:marker><c:symbol val="none"/><c:symbol val="none"/></c:marker>',
    '<c:marker><c:symbol val="none" extra="1"/></c:marker>',
  ])("false never invents missing or malformed series visibility %s", async (leaf) => {
    assertOmitted(
      await editXml((xml) =>
        xml
          .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
          .replace(/<c:marker>[\s\S]*?<\/c:marker>/, leaf),
      ),
    );
  });
  test.each(["", "<c:marker/>"])(
    "missing series marker still blocks structurally unsafe packages %s",
    async (leaf) => {
      await expect(
        editXml((xml) =>
          xml
            .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
            .replace(/<c:marker>[\s\S]*?<\/c:marker>/, leaf),
        ),
      ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    },
  );
  test("false retains strict visible size and smoothing checks", async () => {
    assertOmitted(
      await editXml((xml) =>
        xml
          .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
          .replace('<c:size val="5"/>', '<c:size val="73"/>'),
      ),
    );
    assertOmitted(
      await editXml((xml) =>
        hidden(xml)
          .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
          .replaceAll('<c:smooth val="0"/>', '<c:smooth val="1"/>'),
      ),
    );
  });
  test("none-plus-size still reports unsupported latent geometry rather than silently retaining it", async () => {
    const result = await editXml((xml) =>
      xml
        .replace('<c:marker val="1"/>', '<c:marker val="0"/>')
        .replaceAll('<c:symbol val="circle"/>', '<c:symbol val="none"/>'),
    );
    expect(
      imported(result).styles.every(
        (entry) => entry?.markers === false && entry.markerSizePt === undefined,
      ),
    ).toBe(true);
    expect(result.report.issues.flatMap((issue) => issue.locations)).toContain(
      `${part}.format.series[0].markerGeometry`,
    );
  });
});
