import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { unsupportedNativeChartStyles } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

const part = "xl/charts/chart1.xml";
const anglePath = `${part}.format.categoryAxis.labelAngle`;
const text = {
  scriptFonts: {
    latin: { kind: "theme", role: "minor", slot: "latin" },
    eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
    complexScript: { kind: "automatic" },
  },
  fontSize: 16,
  color: "#123456",
} as const;
function chart(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const drawing = [...result.workbook.sheets.values()][0]!.drawings?.find(
    (d) => d.kind === "chart",
  );
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing chart");
  return drawing.chart;
}
function xml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)[part]!);
}
function warned(result: Awaited<ReturnType<typeof decodeXlsx>>, path = anglePath) {
  return result.report.issues.some((i) => i.code === "style-omitted" && i.locations.includes(path));
}
async function native(body: string, target = "catAx", position?: string) {
  const f = nativeColumnFixture();
  f.drawing.chart.format = { categoryAxis: { text }, valueAxis: { text }, legend: { text } };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace(
      new RegExp(`<c:${target}>[\\s\\S]*?</c:${target}>`),
      (axis) => {
        const changed = axis.replace("<a:bodyPr/>", body);
        return position
          ? changed.replace(/<c:axPos val="[^"]*"\/>/, `<c:axPos val="${position}"/>`)
          : changed;
      },
    ),
  );
  return decodeXlsx(zipSync(entries));
}

for (const type of ["column", "bar", "line"] as const) {
  test.each([0, -0, 45, -45, 90, -90, 12.5, 1 / 60000, -1 / 60000, 5399999 / 60000])(
    `${type} exact category angle %s roundtrips without font overrides`,
    async (angle) => {
      const f = nativeColumnFixture();
      f.drawing.chart.type = type;
      f.drawing.chart.format = { categoryAxis: { labelAngle: angle } };
      const before = serializeWorkbook(f.workbook);
      const encoded = await encodeXlsx(f.workbook);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const axis = xml(encoded.bytes).match(/<c:catAx>[\s\S]*?<\/c:catAx>/)![0];
      expect(axis).toContain(`<a:bodyPr rot="${-Math.round(angle * 60000)}"/>`);
      expect(axis).not.toContain("defRPr");
      const first = await decodeXlsx(encoded.bytes);
      expect(chart(first).format?.categoryAxis?.labelAngle).toBe(angle === 0 ? 0 : angle);
      expect(warned(first)).toBe(false);
      const snapshot = deserializeWorkbook(
        JSON.parse(JSON.stringify(serializeWorkbook(first.workbook))),
      );
      const second = await decodeXlsx((await encodeXlsx(snapshot)).bytes);
      expect(chart(second).format?.categoryAxis?.labelAngle).toBe(angle === 0 ? 0 : angle);
    },
  );
}

test("reset to Auto omits rot and keeps the old text-only XML", async () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = { categoryAxis: { text, labelAngle: 0 } };
  const zero = await encodeXlsx(f.workbook);
  delete f.drawing.chart.format.categoryAxis!.labelAngle;
  const auto = await encodeXlsx(f.workbook);
  expect(xml(zero.bytes).replace(' rot="0"', "")).toBe(xml(auto.bytes));
  expect(chart(await decodeXlsx(auto.bytes)).format?.categoryAxis).toEqual({ text });
  delete f.drawing.chart.format.categoryAxis!.text;
  expect(
    xml((await encodeXlsx(f.workbook)).bytes).match(/<c:catAx>[\s\S]*?<\/c:catAx>/)![0],
  ).not.toContain("txPr");
});

test.each([0, 2700000, -2700000, 5400000, -5400000, 1, -1, 5399999])(
  "native units %s preserve exact sign and V90 text",
  async (units) => {
    const first = await native(`<a:bodyPr rot="${units}"/>`);
    expect(chart(first).format?.categoryAxis).toEqual({
      text,
      labelAngle: units === 0 ? 0 : -units / 60000,
    });
    expect(warned(first)).toBe(false);
    expect(xml((await encodeXlsx(first.workbook)).bytes)).toContain(`<a:bodyPr rot="${units}"/>`);
  },
);

test.each([
  "-60000000",
  "abc",
  "",
  "2700000.5",
  "27e5",
  "5400001",
  "-5400001",
  "NaN",
  "Infinity",
  " 0 ",
])("native invalid/sentinel rot %s is omitted with a leaf warning, never clamped", async (raw) => {
  const result = await native(`<a:bodyPr rot="${raw}"/>`);
  expect(chart(result).format?.categoryAxis).toEqual({ text });
  expect(warned(result)).toBe(true);
});

test.each([
  '<a:bodyPr rot="2700000"/><a:bodyPr rot="0"/>',
  '<a:bodyPr rot="2700000" vert="vert"/>',
  '<a:bodyPr rot="2700000" upright="1"/>',
  '<a:bodyPr rot="2700000" upright="0"/>',
  '<a:bodyPr rot="2700000" unknown="1"/>',
  '<a:bodyPr rot="2700000"><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:bodyPr>',
])("complex category body %s is not misread as ordinary rotation", async (body) => {
  const result = await native(body);
  expect(chart(result).format?.categoryAxis).toEqual({ text });
  expect(warned(result)).toBe(true);
});

test("layout-only WPS attrs remain warned while ordinary rotation and fonts survive", async () => {
  const result = await native(
    '<a:bodyPr rot="2700000" spcFirstLastPara="0" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>',
  );
  expect(chart(result).format?.categoryAxis).toEqual({ text, labelAngle: -45 });
  expect(warned(result, `${part}.format.categoryAxis.text.bodyPr`)).toBe(true);
});
test.each(["t", "r"])(
  "unproven category position %s does not invent a Web angle",
  async (position) => {
    const result = await native('<a:bodyPr rot="2700000"/>', "catAx", position);
    expect(chart(result).format?.categoryAxis).toEqual({ text });
    expect(warned(result)).toBe(true);
  },
);
test.each(["valAx", "legend", "title"])("%s rot never becomes category angle", async (target) => {
  const result = await native('<a:bodyPr rot="2700000"/>', target);
  expect(chart(result).format?.categoryAxis).toEqual({ text });
  expect(warned(result)).toBe(false);
  if (target === "legend") expect(warned(result, `${part}.format.legend.text.bodyPr`)).toBe(true);
});

test.each([91, -91, NaN, Infinity, -Infinity, 0.000001, 45.123456789, "45", null, true, {}])(
  "invalid/unrepresentable Core angle %s blocks before resource reads",
  async (value) => {
    const f = nativeColumnFixture();
    f.drawing.chart.format = { categoryAxis: { labelAngle: value as number } };
    const images = vi.fn(() => []);
    expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([
      "format.categoryAxis.labelAngle",
    ]);
    await expect(
      encodeXlsx(f.workbook, {
        get images() {
          return images();
        },
      }),
    ).rejects.toMatchObject({ name: "XlsxCompatibilityError" });
    expect(images).not.toHaveBeenCalled();
  },
);
test("valueAxis labelAngle and category getters remain fail-closed", () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = { valueAxis: { labelAngle: 45 } } as never;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format.valueAxis.labelAngle"]);
  const getter = vi.fn();
  f.drawing.chart.format = { categoryAxis: {} };
  Object.defineProperty(f.drawing.chart.format.categoryAxis, "labelAngle", {
    get: getter,
    enumerable: true,
  });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format.categoryAxis"]);
  expect(getter).not.toHaveBeenCalled();
});

const sample =
  "/workspace/shared/excel-compat-restored/textbox-mixed-wps-online-edited-20261018.xlsx";
test.runIf(existsSync(sample))(
  "real WPS sentinel keeps fonts/theme/anchor and gains a precise angle warning",
  async () => {
    const bytes = readFileSync(sample);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "9402a814b0c8c31c8c91c73bab56310ac2d4c181d1c7c865e3e0aa964a5fbfe2",
    );
    const first = await decodeXlsx(bytes);
    expect(chart(first).format?.categoryAxis?.labelAngle).toBeUndefined();
    expect(warned(first)).toBe(true);
    const saved = serializeWorkbook(first.workbook);
    const snapshot = deserializeWorkbook(JSON.parse(JSON.stringify(saved)));
    const encoded = await encodeXlsx(snapshot, {
      images: first.images?.map((image) => {
        const header = new DataView(
          image.bytes.buffer,
          image.bytes.byteOffset,
          image.bytes.byteLength,
        );
        return { ...image, width: header.getUint32(16), height: header.getUint32(20) };
      }),
    });
    const second = await decodeXlsx(encoded.bytes);
    expect(chart(second).format).toEqual(chart(first).format);
    expect(second.workbook.theme).toEqual(first.workbook.theme);
    const geometry = (result: typeof first) => {
      const d = [...result.workbook.sheets.values()][0]!.drawings!.find((d) => d.kind === "chart")!;
      return [d.anchor, d.offsetX, d.offsetY, d.width, d.height];
    };
    expect(geometry(second)).toEqual(geometry(first));
  },
);
