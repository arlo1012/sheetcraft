import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import type { ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { unsupportedNativeChartStyles } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
const part = "xl/charts/chart1.xml";
function axis(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const drawing = [...result.workbook.sheets.values()][0]!.drawings?.find(
    (d) => d.kind === "chart",
  );
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing chart");
  return drawing.chart.format?.valueAxis;
}
const cases: [ChartValueAxisFormat, string, string][] = [
  [{ linkedToSource: false }, "General", "0"],
  [{ numberFormat: { kind: "custom", code: "General" }, linkedToSource: false }, "General", "0"],
  [
    {
      numberFormat: { kind: "percent", fractionDigits: 1, useGrouping: false },
      linkedToSource: false,
    },
    "0.0%",
    "0",
  ],
  [{ numberFormat: { kind: "number", fractionDigits: 2 } }, "#,##0.00", "0"],
  [{ numberFormat: { kind: "number", fractionDigits: 0, useGrouping: false } }, "0", "0"],
  [{ linkedToSource: true }, "General", "1"],
];
for (const type of ["column", "bar", "line"] as const)
  test.each(cases)(`${type} axis format %j`, async (valueAxis, code, link) => {
    const f = nativeColumnFixture();
    f.drawing.chart.type = type;
    f.drawing.chart.format = { valueAxis, categoryAxis: { labelAngle: 45 } };
    const bytes = (await encodeXlsx(f.workbook)).bytes;
    expect(strFromU8(unzipSync(bytes)[part]!)).toContain(
      `<c:numFmt formatCode="${code}" sourceLinked="${link}"/>`,
    );
    const imported = await decodeXlsx(bytes);
    expect(axis(imported)?.linkedToSource).toBe(link === "0" ? false : undefined);
    expect(strFromU8(unzipSync((await encodeXlsx(imported.workbook)).bytes)[part]!)).toContain(
      `<c:numFmt formatCode="${code}" sourceLinked="${link}"/>`,
    );
  });

test.each([
  { kind: "number", fractionDigits: 1.5 },
  { kind: "number", fractionDigits: -1 },
  { kind: "number", fractionDigits: 21 },
  { kind: "number", fractionDigits: "2" },
  { kind: "number", fractionDigits: 2, useGrouping: 1 },
  { kind: "number", fractionDigits: 2, locale: "en-US" },
  { kind: "number", fractionDigits: 2, extra: true },
  { kind: "currency", currency: "USD", fractionDigits: 2 },
  { kind: "custom", code: '0"<&' },
  { kind: "custom", code: "General\u0000" },
  { kind: "custom", code: "general" },
  { kind: "unknown" },
])("raw unsupported format stays blocked: %j", (numberFormat) => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    valueAxis: { numberFormat },
  } as unknown as typeof f.drawing.chart.format;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.valueAxis.numberFormat");
});

test("latent format and nonboolean source link remain blocked; getter is not invoked", () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    valueAxis: { numberFormat: { kind: "percent", fractionDigits: 1 }, linkedToSource: true },
  };
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.valueAxis.numberFormat");
  let reads = 0;
  Object.defineProperty(f.drawing.chart.format.valueAxis!.numberFormat!, "fractionDigits", {
    get: () => {
      reads++;
      return 1;
    },
  });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.valueAxis.numberFormat");
  expect(reads).toBe(0);
  f.drawing.chart.format = {
    valueAxis: { linkedToSource: 1 },
  } as unknown as typeof f.drawing.chart.format;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain(
    "format.valueAxis.linkedToSource",
  );
});

async function external(numFmt: string) {
  const f = nativeColumnFixture();
  f.drawing.chart.format = { valueAxis: { text: { fontSize: 16 } } };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace('<c:numFmt formatCode="General" sourceLinked="1"/>', numFmt),
  );
  return decodeXlsx(zipSync(entries));
}
const warned = (r: Awaited<ReturnType<typeof decodeXlsx>>, leaf: string) =>
  r.report.issues.some(
    (i) => i.code === "style-omitted" && i.locations.includes(`${part}.format.valueAxis.${leaf}`),
  );
test.each([
  '<c:numFmt formatCode="0.0%" sourceLinked="2"/>',
  '<c:numFmt formatCode="0.0%"/>',
  '<c:numFmt formatCode="0" sourceLinked="0"/><c:numFmt formatCode="0.00" sourceLinked="1"/>',
  '<c:numFmt formatCode="0" sourceLinked="0"><c:extLst/></c:numFmt>',
])("malformed external pair warns both leaves without losing text: %s", async (xml) => {
  const r = await external(xml);
  expect(axis(r)).toEqual({ text: { fontSize: 16 } });
  expect(warned(r, "numberFormat")).toBe(true);
  expect(warned(r, "linkedToSource")).toBe(true);
});
test.each(["0", "false"])("General/%s is explicit General rather than inherit", async (link) => {
  const r = await external(`<c:numFmt formatCode="General" sourceLinked="${link}"/>`);
  expect(axis(r)?.linkedToSource).toBe(false);
  expect(warned(r, "numberFormat")).toBe(false);
});
test("unknown external code warns only format; latent valid code is retained but blocked", async () => {
  const unknown = await external('<c:numFmt formatCode="0.00E+00" sourceLinked="false"/>');
  expect(axis(unknown)?.linkedToSource).toBe(false);
  expect(warned(unknown, "numberFormat")).toBe(true);
  expect(warned(unknown, "linkedToSource")).toBe(false);
  const latent = await external('<c:numFmt formatCode="0.0%" sourceLinked="true"/>');
  expect(axis(latent)?.numberFormat).toEqual({
    kind: "percent",
    fractionDigits: 1,
    useGrouping: false,
  });
  expect(axis(latent)?.linkedToSource).toBe(true);
  expect(warned(latent, "numberFormat")).toBe(true);
});

test("inclusive digit boundaries stay exact and unsupported axes stay blocked", () => {
  const f = nativeColumnFixture();
  for (const fractionDigits of [0, 20]) {
    f.drawing.chart.format = {
      valueAxis: {
        numberFormat: { kind: "percent", fractionDigits, useGrouping: true },
        linkedToSource: false,
      },
    };
    expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
  }
  f.drawing.chart.format = {
    categoryAxis: { numberFormat: { kind: "number", fractionDigits: 2 } },
  } as unknown as typeof f.drawing.chart.format;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain(
    "format.categoryAxis.numberFormat",
  );
  f.drawing.chart.format = {
    secondaryValueAxis: { numberFormat: { kind: "number", fractionDigits: 2 } },
  };
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toContain("format.secondaryValueAxis");
});

test.each([undefined, "", "&quot;unterminated", "0.000000000000000000000"])(
  "malformed or unsupported external code %s warns without losing link",
  async (code) => {
    const r = await external(
      `<c:numFmt${code === undefined ? "" : ` formatCode="${code}"`} sourceLinked="0"/>`,
    );
    expect(axis(r)?.numberFormat).toBeUndefined();
    expect(axis(r)?.linkedToSource).toBe(false);
    expect(warned(r, "numberFormat")).toBe(true);
  },
);
test("unknown external attribute warns both leaves", async () => {
  const r = await external('<c:numFmt formatCode="0" sourceLinked="0" extra="1"/>');
  expect(warned(r, "numberFormat")).toBe(true);
  expect(warned(r, "linkedToSource")).toBe(true);
});
test.each(["1", "true"])("legacy General/%s stays sparse", async (link) => {
  const r = await external(`<c:numFmt formatCode="General" sourceLinked="${link}"/>`);
  expect(axis(r)).toEqual({ text: { fontSize: 16 } });
  expect(warned(r, "numberFormat")).toBe(false);
});
test.each(["0", "false"])(
  "numeric source link lexical %s restores explicit format",
  async (link) => {
    const r = await external(`<c:numFmt formatCode="0.00" sourceLinked="${link}"/>`);
    expect(axis(r)?.numberFormat).toEqual({
      kind: "number",
      fractionDigits: 2,
      useGrouping: false,
    });
    expect(axis(r)?.linkedToSource).toBe(false);
    expect(warned(r, "numberFormat")).toBe(false);
  },
);

// Golden produced by the pre-change writer, then byte-compared against this writer.
test("absent axis number settings retain legacy chart XML bytes", async () => {
  const f = nativeColumnFixture();
  const bytes = unzipSync((await encodeXlsx(f.workbook)).bytes)[part]!;
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "b7ada234f15459259df572b13f7beea41d2944cd538bb13da8d63858c223c94a",
  );
});
