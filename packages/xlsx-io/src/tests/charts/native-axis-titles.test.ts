import { expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { unsupportedNativeChartStyles } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

const part = "xl/charts/chart1.xml";
const ticks = { fontFamily: "Arial", fontSize: 12, bold: false, color: "#123456" };
const titleText = {
  fontFamily: "Calibri",
  fontSize: 40 / 3,
  bold: true,
  italic: true,
  color: "#654321",
};
function imported(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const drawing = [...result.workbook.sheets.values()][0]!.drawings?.find(
    (d) => d.kind === "chart",
  );
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing native chart");
  return drawing.chart;
}
function locations(result: Awaited<ReturnType<typeof decodeXlsx>>, code = "style-omitted") {
  return result.report.issues.filter((i) => i.code === code).flatMap((i) => i.locations);
}
async function native(title: string) {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    categoryAxis: { text: ticks },
    valueAxis: {
      text: ticks,
      numberFormat: { kind: "percent", fractionDigits: 2 },
      linkedToSource: false,
    },
  };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(strFromU8(entries[part]!).replace("</c:catAx>", `${title}</c:catAx>`));
  return decodeXlsx(zipSync(entries));
}
const rich = (content: string, body = '<a:bodyPr rot="0"/>') =>
  `<c:title><c:tx><c:rich>${body}<a:lstStyle/><a:p>${content}</a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>`;

for (const type of ["column", "bar", "line"] as const) {
  test.each([0, -90, 90, 12.5, 1 / 60000])(
    `${type} independent title angle %s roundtrips`,
    async (angle) => {
      const f = nativeColumnFixture();
      f.drawing.chart.type = type;
      f.drawing.chart.format = {
        categoryAxis: {
          title: "  季度 & <channel>  ",
          titleText,
          titleRotation: angle,
          text: ticks,
          labelAngle: 45,
        },
        valueAxis: {
          title: "Revenue",
          titleText,
          titleRotation: -90,
          text: ticks,
          numberFormat: { kind: "percent", fractionDigits: 2 },
          linkedToSource: false,
        },
      };
      const before = serializeWorkbook(f.workbook);
      expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
      expect(xml).toContain(`rot="${Math.round(angle * 60000)}"`);
      expect(xml).toContain('sz="1000" b="1" i="1"');
      expect(xml).toContain("  季度 &amp; &lt;channel&gt;  ");
      expect(xml).toMatch(/<c:axPos val="[bl]"\/><c:title>/);
      expect(xml).toContain("<c:majorGridlines/><c:title>");
      // Explicit native line defaults are now recovered as stable per-series
      // styles; axis-title properties must still roundtrip exactly alongside them.
      const expectedFormat =
        type === "line"
          ? {
              ...f.drawing.chart.format,
              series: [
                { id: "range-series-1", strokeWidth: 3, markers: true },
                { id: "range-series-2", strokeWidth: 3, markers: true },
              ],
            }
          : f.drawing.chart.format;
      const first = await decodeXlsx(encoded.bytes);
      expect(imported(first).format).toEqual(expectedFormat);
      const second = await decodeXlsx(
        (await encodeXlsx(deserializeWorkbook(serializeWorkbook(first.workbook)))).bytes,
      );
      expect(imported(second).format).toEqual(expectedFormat);
      expect(
        locations(first).some((p) => p.includes(".titleText") || p.includes(".titleRotation")),
      ).toBe(false);
    },
  );
}

test("independent empty format never copies tick font; absent format retains legacy sharing", async () => {
  const axisTicks = { ...ticks, fontFamily: "Courier New" };
  for (const independent of [false, true]) {
    const f = nativeColumnFixture();
    f.drawing.chart.format = {
      categoryAxis: { title: "Title", text: axisTicks, ...(independent ? { titleText: {} } : {}) },
    };
    const encoded = await encodeXlsx(f.workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
    const nativeTitle = xml.match(/<c:catAx>[\s\S]*?<c:title>([\s\S]*?)<\/c:title>/)![1]!;
    expect(nativeTitle).toContain('sz="900" b="0" i="0"');
    if (independent) {
      expect(nativeTitle).toContain('<a:latin typeface="Arial"/>');
      expect(nativeTitle).toContain('<a:ea typeface="Arial"/>');
      expect(nativeTitle).toContain('<a:cs typeface="Arial"/>');
      expect(nativeTitle).not.toContain('typeface="Courier New"');
    }
    const result = await decodeXlsx(encoded.bytes);
    const expected = independent
      ? { fontFamily: "Arial", fontSize: 12, bold: false, italic: false }
      : { ...axisTicks, italic: false };
    expect(imported(result).format?.categoryAxis?.titleText).toEqual(expected);
    const second = await decodeXlsx((await encodeXlsx(result.workbook)).bytes);
    expect(imported(second).format?.categoryAxis?.titleText).toEqual(expected);
  }
});

test("independent script bindings and explicit false italic survive", async () => {
  const f = nativeColumnFixture();
  const text = {
    scriptFonts: {
      latin: { kind: "theme", role: "minor", slot: "latin" },
      eastAsia: { kind: "family", family: "SimSun" },
      complexScript: { kind: "automatic" },
    },
    italic: false,
  } as const;
  f.drawing.chart.format = { categoryAxis: { title: "Title", titleText: text } };
  expect(
    imported(await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).format?.categoryAxis
      ?.titleText,
  ).toEqual({ fontSize: 12, bold: false, ...text });
});

test.each([
  '<c:title><c:layout/><c:overlay val="0"/><c:txPr><a:bodyPr rot="-5400000"/></c:txPr></c:title>',
  "<c:title><c:tx><c:strRef><c:f>Data!A1</c:f></c:strRef></c:tx></c:title>",
  rich("<a:r><a:t>one</a:t></a:r><a:br/><a:r><a:t>two</a:t></a:r>"),
  rich("<a:r><a:t>one</a:t></a:r>").replace("</a:p>", "</a:p><a:p><a:r><a:t>two</a:t></a:r></a:p>"),
  rich(`<a:r><a:t>${"x".repeat(1001)}</a:t></a:r>`),
  rich("<a:r><a:t>title</a:t></a:r>") + rich("<a:r><a:t>duplicate</a:t></a:r>"),
])("unsupported title is locally omitted without fabricated text: %s", async (xml) => {
  const result = await native(xml);
  const chart = imported(result);
  expect(chart.format?.categoryAxis?.title).toBeUndefined();
  expect(chart.format?.categoryAxis?.text).toEqual(ticks);
  expect(chart.format?.valueAxis?.numberFormat).toEqual({ kind: "percent", fractionDigits: 2 });
  expect(locations(result, "feature-omitted")).toContain(`${part}.format.categoryAxis.title`);
});

test("nonuniform title formatting omits only conflicting leaves", async () => {
  const result = await native(
    rich('<a:r><a:rPr b="1" i="1"/><a:t>A</a:t></a:r><a:r><a:rPr b="0" i="1"/><a:t>B</a:t></a:r>'),
  );
  expect(imported(result).format?.categoryAxis).toMatchObject({
    title: "AB",
    titleText: { italic: true },
    text: ticks,
  });
  expect(imported(result).format?.categoryAxis?.titleText?.bold).toBeUndefined();
  expect(locations(result)).toContain(`${part}.format.categoryAxis.titleText.bold`);
});

test.each(["-60000000", "5400001", "1.5", "NaN"])(
  "invalid rotation %s is locally warned",
  async (rot) => {
    const result = await native(rich("<a:r><a:t>Title</a:t></a:r>", `<a:bodyPr rot="${rot}"/>`));
    expect(imported(result).format?.categoryAxis?.title).toBe("Title");
    expect(imported(result).format?.categoryAxis?.titleRotation).toBeUndefined();
    expect(locations(result)).toContain(`${part}.format.categoryAxis.titleRotation`);
  },
);

test.each([
  { title: "Hidden", titleVisible: false },
  { titleText: {} },
  { titleRotation: 0 },
  { titleVisible: true },
  { title: " " },
  { title: "A\nB" },
  { title: "A\tB" },
  { title: "x".repeat(1001) },
  { title: "Title", titleRotation: 90.1 },
  { title: "Title", titleRotation: 0.000001 },
])("latent or unrepresentable titles remain export blocked: %j", (axis) => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = { categoryAxis: axis };
  expect(unsupportedNativeChartStyles(f.drawing.chart).length).toBeGreaterThan(0);
});

test("new fields retain getter safety and nonordinary/secondary-axis gates", () => {
  const f = nativeColumnFixture();
  const getter = vi.fn();
  f.drawing.chart.format = { categoryAxis: { title: "Title" } };
  Object.defineProperty(f.drawing.chart.format.categoryAxis!, "titleText", { get: getter });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.categoryAxis");
  expect(getter).not.toHaveBeenCalled();
  f.drawing.chart.format = { secondaryValueAxis: { title: "Title", titleText: {} } };
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.secondaryValueAxis");
  f.drawing.chart.format = { categoryAxis: { title: "Title", titleText: {} } };
  f.drawing.chart.stacked = true;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format");
});

test("1000-character content is admitted without trimming", async () => {
  const f = nativeColumnFixture();
  const title = ` ${"x".repeat(998)} `;
  f.drawing.chart.format = { categoryAxis: { title, titleText: {} } };
  expect(
    imported(await decodeXlsx((await encodeXlsx(f.workbook)).bytes)).format?.categoryAxis?.title,
  ).toBe(title);
});

test("custom layout loss stays local and explicit", async () => {
  const result = await native(
    rich("<a:r><a:t>Title</a:t></a:r>").replace(
      "<c:layout/>",
      '<c:layout><c:manualLayout><c:x val="0.2"/></c:manualLayout></c:layout>',
    ),
  );
  expect(imported(result).format?.categoryAxis?.title).toBe("Title");
  expect(locations(result)).toContain(`${part}.format.categoryAxis.title.layout`);
});

test("malformed title formatting retains content and other axis fields", async () => {
  const result = await native(rich('<a:r><a:rPr b="1"/><a:rPr b="0"/><a:t>Title</a:t></a:r>'));
  expect(imported(result).format?.categoryAxis?.title).toBe("Title");
  expect(imported(result).format?.categoryAxis?.text).toEqual(ticks);
  expect(locations(result)).toContain(`${part}.format.categoryAxis.titleText`);
});

test("WPS-shaped title inherits title txPr, never sibling tick formatting", async () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    categoryAxis: {
      title: "Title",
      titleText: { bold: true, italic: false, fontSize: 40 / 3 },
      text: ticks,
    },
  };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  const xml = strFromU8(entries[part]!);
  entries[part] = strToU8(
    xml.replace(/<c:catAx>[\s\S]*?<\/c:catAx>/, (axis) =>
      axis.replace(
        /<c:title>[\s\S]*?<\/c:title>/,
        '<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" spcFirstLastPara="0" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/><a:lstStyle/><a:p><a:r><a:rPr lang="x-none" altLang="en-US"/><a:t>Title</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1" i="0"/></a:pPr></a:p></c:txPr></c:title>',
      ),
    ),
  );
  const result = await decodeXlsx(zipSync(entries));
  expect(imported(result).format?.categoryAxis).toEqual({
    title: "Title",
    titleText: { fontSize: 40 / 3, bold: true, italic: false },
    titleRotation: -90,
    text: ticks,
  });
  expect(locations(result)).not.toContain(`${part}.format.categoryAxis.titleText.bodyPr`);
});
