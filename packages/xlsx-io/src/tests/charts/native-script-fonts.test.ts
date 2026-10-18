import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ChartScriptFonts } from "@sheetcraft/core/chart-format";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";
import { readNativeChartFontTheme, writeXlsxWorkbookTheme } from "../../workbook-theme.js";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";

const part = "xl/charts/chart1.xml",
  themePart = "xl/theme/theme1.xml";
const art = "http://schemas.openxmlformats.org/drawingml/2006/main";
const bindings: ChartScriptFonts = {
  latin: { kind: "theme", role: "minor", slot: "latin" },
  eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
  complexScript: { kind: "theme", role: "minor", slot: "complexScript" },
};
const xmlFonts = '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>';
const group = '<a:latin typeface="Inter"/><a:ea typeface="宋体"/><a:cs typeface=""/>';
const scheme = `<a:fontScheme name="Office"><a:majorFont>${group}</a:majorFont><a:minorFont>${group}</a:minorFont></a:fontScheme>`;
function getChart(workbook: Awaited<ReturnType<typeof decodeXlsx>>["workbook"]) {
  const drawing = [...workbook.sheets.values()][0]!.drawings?.find((d) => d.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing chart");
  return drawing.chart;
}
async function fixture() {
  const f = nativeColumnFixture();
  const text = { fontFamily: "Arial", fontSize: 16, color: "#123456" };
  f.drawing.chart.format = {
    title: text,
    categoryAxis: { text },
    valueAxis: { text },
    legend: { text },
  };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(
    strFromU8(entries[part]!).replaceAll(
      '<a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/>',
      xmlFonts,
    ),
  );
  entries[themePart] = strToU8(
    strFromU8(entries[themePart]!).replace(/<a:fontScheme\b[^>]*>[\s\S]*?<\/a:fontScheme>/, scheme),
  );
  return entries;
}

test("preserves mixed theme bindings and explicit empty CS across XLSX and JSON", async () => {
  const first = await decodeXlsx(zipSync(await fixture()));
  const format = getChart(first.workbook).format!;
  for (const text of [
    format.title,
    format.categoryAxis?.text,
    format.valueAxis?.text,
    format.legend?.text,
  ]) {
    expect(text?.scriptFonts).toEqual(bindings);
    expect(text?.fontFamily).toBeUndefined();
  }
  expect(
    first.report.issues
      .flatMap((i) => i.locations)
      .filter((p) => p.includes("fontFamily") || p.includes("scriptFonts")),
  ).toEqual([]);
  expect(first.workbook.theme.fonts?.bodyComplexScript).toBe("");
  const reloaded = deserializeWorkbook(
    JSON.parse(JSON.stringify(serializeWorkbook(first.workbook))),
  );
  expect(getChart(reloaded).format).toEqual(format);
  const out = await encodeXlsx(reloaded);
  const entries = unzipSync(out.bytes);
  expect(strFromU8(entries[part]!)).toContain(xmlFonts);
  expect(strFromU8(entries[themePart]!)).toContain('<a:cs typeface=""/>');
  expect(getChart((await decodeXlsx(out.bytes)).workbook).format).toEqual(format);
});

test("merges root, paragraph, and Latin-only run overrides independently", async () => {
  const entries = await fixture();
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace(
      "<a:r><a:t>Sales</a:t></a:r>",
      '<a:r><a:rPr><a:latin typeface="Verdana"/></a:rPr><a:t>Sales</a:t></a:r>',
    ),
  );
  const first = await decodeXlsx(zipSync(entries));
  expect(getChart(first.workbook).format?.title?.scriptFonts).toEqual({
    ...bindings,
    latin: { kind: "family", family: "Verdana" },
  });
});

test.each([
  "unknown-token",
  "wrong-slot",
  "supplemental",
  "descriptor",
  "wrong-namespace",
  "missing-relationship",
  "missing-cs",
])("does not repair unsupported %s", async (variant) => {
  const entries = await fixture();
  let t = strFromU8(entries[themePart]!),
    c = strFromU8(entries[part]!);
  if (variant === "unknown-token") c = c.replaceAll("+mn-cs", "+mn-unknown");
  if (variant === "wrong-slot") c = c.replaceAll("+mn-cs", "+mn-lt");
  if (variant === "supplemental")
    t = t.replace("</a:minorFont>", '<a:font script="Arab" typeface="Arial"/></a:minorFont>');
  if (variant === "descriptor")
    t = t.replaceAll('<a:ea typeface="宋体"/>', '<a:ea typeface="宋体" charset="134"/>');
  if (variant === "wrong-namespace")
    t = t.replaceAll('<a:cs typeface=""/>', '<a:cs xmlns:a="urn:wrong" typeface=""/>');
  if (variant === "missing-cs") t = t.replaceAll('<a:cs typeface=""/>', "");
  if (variant === "missing-relationship")
    entries["xl/_rels/workbook.xml.rels"] = strToU8(
      strFromU8(entries["xl/_rels/workbook.xml.rels"]!).replace(
        /<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/,
        "",
      ),
    );
  entries[themePart] = strToU8(t);
  entries[part] = strToU8(c);
  const first = await decodeXlsx(zipSync(entries));
  expect(
    getChart(first.workbook).format?.categoryAxis?.text?.scriptFonts?.complexScript,
  ).toBeUndefined();
  expect(first.report.issues.flatMap((i) => i.locations)).toContain(
    `${part}.format.categoryAxis.text.scriptFonts.complexScript`,
  );
});

test("writes sparse explicit slots without broadcasting Latin and retains automatic", async () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    categoryAxis: {
      text: {
        scriptFonts: {
          latin: { kind: "family", family: "Inter" },
          complexScript: { kind: "automatic" },
        },
      },
    },
  };
  const out = await encodeXlsx(f.workbook);
  const xml = strFromU8(unzipSync(out.bytes)[part]!);
  expect(xml).toContain('<a:latin typeface="Inter"/><a:cs typeface=""/>');
  expect(
    getChart((await decodeXlsx(out.bytes)).workbook).format?.categoryAxis?.text?.scriptFonts,
  ).toEqual(f.drawing.chart.format.categoryAxis?.text?.scriptFonts);
});

describe("raw theme evidence", () => {
  const read = (s: string) =>
    readNativeChartFontTheme(
      strToU8(`<a:theme xmlns:a="${art}"><a:themeElements>${s}</a:themeElements></a:theme>`),
    );
  test("empty and missing CS differ", () => {
    expect(read(scheme).minor?.complexScript).toBe("");
    expect(read(scheme.replaceAll('<a:cs typeface=""/>', "")).minor?.complexScript).toBeUndefined();
  });
  test("duplicate, supplemental and descriptors never prove a theme role", () => {
    expect(
      read(scheme.replace("<a:minorFont>", '<a:minorFont><a:cs typeface="Arial"/>')).minor,
    ).toBeUndefined();
    expect(
      read(
        scheme.replace("</a:minorFont>", '<a:font script="Arab" typeface="Arial"/></a:minorFont>'),
      ).minor,
    ).toBeUndefined();
    expect(
      read(scheme.replaceAll('typeface="Inter"', 'typeface="Inter" panose="02000000000000000000"'))
        .minor,
    ).toBeUndefined();
  });
});

const realSample =
  "/workspace/shared/excel-compat-restored/textbox-mixed-wps-online-edited-20261018.xlsx";
test.runIf(existsSync(realSample))(
  "verified real WPS sample retains bindings after JSON/XLSX reload",
  async () => {
    const bytes = readFileSync(realSample);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "9402a814b0c8c31c8c91c73bab56310ac2d4c181d1c7c865e3e0aa964a5fbfe2",
    );
    const first = await decodeXlsx(bytes);
    const format = getChart(first.workbook).format!;
    for (const text of [format.categoryAxis?.text, format.valueAxis?.text, format.legend?.text])
      expect(text?.scriptFonts).toEqual(bindings);
    const reloaded = deserializeWorkbook(
      JSON.parse(JSON.stringify(serializeWorkbook(first.workbook))),
    );
    const encoded = await encodeXlsx(reloaded, {
      images: first.images?.map((image) => {
        expect(image.extension).toBe("png");
        const header = new DataView(
          image.bytes.buffer,
          image.bytes.byteOffset,
          image.bytes.byteLength,
        );
        return { ...image, width: header.getUint32(16), height: header.getUint32(20) };
      }),
    });
    const second = await decodeXlsx(encoded.bytes);
    expect(getChart(second.workbook).format).toEqual(format);
    expect(second.workbook.theme.fonts?.bodyComplexScript).toBe("");
    const xml = strFromU8(unzipSync(encoded.bytes)[part]!);
    expect(xml).toContain(xmlFonts);
  },
);

test("root defaults survive sparse paragraph and run overrides", async () => {
  const entries = await fixture();
  let c = strFromU8(entries[part]!);
  const root = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr>${xmlFonts}</a:defRPr></a:pPr></a:p></c:txPr>`;
  c = c
    .replace("</c:chartSpace>", `${root}</c:chartSpace>`)
    .replaceAll(xmlFonts, '<a:latin typeface="Verdana"/>');
  // Restore only the newly appended root's three inherited choices.
  c = c.replace(root.replace(xmlFonts, '<a:latin typeface="Verdana"/>'), root);
  entries[part] = strToU8(c);
  const first = await decodeXlsx(zipSync(entries));
  expect(getChart(first.workbook).format?.categoryAxis?.text?.scriptFonts).toEqual({
    ...bindings,
    latin: { kind: "family", family: "Verdana" },
  });
});

function replacePresence(xml: string, marker: unknown) {
  return xml.replace(
    /(<sheetcraft:themeCatalog\b[^>]*data=")[^"]*(")/,
    (_all, start, end) =>
      `${start}${encodeURIComponent(JSON.stringify({ customColors: [], customFonts: [], chartFontSlots: marker }))}${end}`,
  );
}
test("catalog preserves absent CS with mandatory valid XML placeholders", async () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    categoryAxis: { text: { scriptFonts: { latin: { kind: "family", family: "Inter" } } } },
  };
  const encoded = await encodeXlsx(f.workbook);
  const entries = unzipSync(encoded.bytes),
    t = strFromU8(entries[themePart]!);
  expect(t.match(/<a:cs typeface=""\/>/g)).toHaveLength(2);
  expect(readNativeChartFontTheme(entries[themePart]).minor?.complexScript).toBeUndefined();
  expect((await decodeXlsx(encoded.bytes)).workbook.theme.fonts?.bodyComplexScript).toBeUndefined();
  entries[themePart] = strToU8(t.replace(/<a:extLst>[\s\S]*?<\/a:extLst>/, ""));
  // Without the private extension, standard OOXML accurately means explicit empty.
  expect((await decodeXlsx(zipSync(entries))).workbook.theme.fonts?.bodyComplexScript).toBe("");
});

test.each([
  "unknown-version",
  "nonboolean",
  "extra-key",
  "conflict",
  "duplicate",
  "namespace",
  "missing-slot",
  "wrong-position",
  "duplicate-namespace",
])("invalid catalog %s cannot prove a font binding", async (variant) => {
  const entries = await fixture();
  let marker: Record<string, unknown> = {
    version: 1,
    headingComplexScript: true,
    bodyComplexScript: true,
  };
  if (variant === "unknown-version") marker.version = 2;
  if (variant === "nonboolean") marker.bodyComplexScript = "true";
  if (variant === "extra-key") marker.extra = true;
  if (variant === "conflict") marker.bodyComplexScript = false;
  let t = replacePresence(strFromU8(entries[themePart]!), marker);
  if (variant === "conflict") t = t.replace(/(<a:minorFont>[\s\S]*?<a:cs typeface=")"/, '$1Arial"');
  if (variant === "duplicate") t = t.replace(/(<sheetcraft:themeCatalog\b[^>]*\/>)/, "$1$1");
  if (variant === "wrong-position") {
    const catalog = /<a:extLst>[\s\S]*?<\/a:extLst>/.exec(t)![0];
    t = t.replace(catalog, "").replace("</a:themeElements>", `${catalog}</a:themeElements>`);
  }
  if (variant === "duplicate-namespace")
    t = t.replace(
      /(<sheetcraft:themeCatalog\b[^>]*\/>)/,
      '$1<wrong:themeCatalog xmlns:wrong="urn:wrong" data="%7B%7D"/>',
    );
  if (variant === "namespace") t = t.replace("urn:sheetcraft:theme-catalog", "urn:wrong");
  if (variant === "missing-slot") t = t.replaceAll('<a:cs typeface=""/>', "");
  entries[themePart] = strToU8(t);
  expect(readNativeChartFontTheme(entries[themePart])).toEqual({});
  const result = await decodeXlsx(zipSync(entries));
  expect(result.report.issues.flatMap((i) => i.locations)).toContain(
    "xl/theme/theme1.xml.chartFontSlots",
  );
  if (variant === "conflict") expect(result.workbook.theme.fonts?.bodyComplexScript).toBe("Arial");
  expect(result.report.issues.flatMap((i) => i.locations)).toContain(
    `${part}.format.categoryAxis.text.scriptFonts.complexScript`,
  );
});

test("missing CS referenced by a theme token remains unresolved with exact warnings", async () => {
  const f = nativeColumnFixture();
  f.drawing.chart.format = {
    categoryAxis: {
      text: {
        scriptFonts: { complexScript: { kind: "theme", role: "minor", slot: "complexScript" } },
      },
    },
  };
  const encoded = await encodeXlsx(f.workbook);
  expect(encoded.report.issues.flatMap((i) => i.locations)).toContain(
    'Data.drawings["column-chart"].chart.format.categoryAxis.text.scriptFonts.complexScript.unresolvedTheme',
  );
  const read = await decodeXlsx(encoded.bytes);
  expect(read.workbook.theme.fonts?.bodyComplexScript).toBeUndefined();
  expect(
    getChart(read.workbook).format?.categoryAxis?.text?.scriptFonts?.complexScript,
  ).toBeUndefined();
  expect(read.report.issues.flatMap((i) => i.locations)).toContain(
    `${part}.format.categoryAxis.text.scriptFonts.complexScript`,
  );
});

test("unmarked source CS slots retain explicit empty and nonempty values", async () => {
  const entries = await fixture();
  entries[themePart] = strToU8(
    strFromU8(entries[themePart]!).replace(/(<a:minorFont>[\s\S]*?<a:cs typeface=")"/, '$1Arial"'),
  );
  const result = await decodeXlsx(zipSync(entries));
  expect(result.workbook.theme.fonts?.headingComplexScript).toBe("");
  expect(result.workbook.theme.fonts?.bodyComplexScript).toBe("Arial");
  expect(getChart(result.workbook).format?.legend?.text?.scriptFonts).toEqual(bindings);
});

test.each(["major", "minor"] as const)(
  "uniform %s theme faces remain live bindings",
  async (role) => {
    const entries = await fixture();
    entries[themePart] = strToU8(
      strFromU8(entries[themePart]!)
        .replaceAll('typeface="宋体"', 'typeface="Inter"')
        .replaceAll('typeface=""', 'typeface="Inter"'),
    );
    if (role === "major")
      entries[part] = strToU8(strFromU8(entries[part]!).replaceAll("+mn-", "+mj-"));
    const first = await decodeXlsx(zipSync(entries));
    expect(getChart(first.workbook).format?.categoryAxis?.text?.scriptFonts).toEqual({
      latin: { kind: "theme", role, slot: "latin" },
      eastAsia: { kind: "theme", role, slot: "eastAsia" },
      complexScript: { kind: "theme", role, slot: "complexScript" },
    });
    expect(getChart(first.workbook).format?.categoryAxis?.text?.fontFamily).toBeUndefined();
  },
);

test("extra or duplicate theme roots provide no font evidence", () => {
  const root = `<a:theme xmlns:a="${art}"><a:themeElements>${scheme}</a:themeElements></a:theme>`;
  expect(readNativeChartFontTheme(strToU8(root + root))).toEqual({});
  expect(readNativeChartFontTheme(strToU8(root + `<a:other xmlns:a="${art}"/>`))).toEqual({});
});

test("legacy theme writer remains byte-identical without script state", () => {
  const seed =
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"></a:fmtScheme></a:themeElements></a:theme>\n';
  const entries = { [themePart]: strToU8(seed) };
  writeXlsxWorkbookTheme(entries, DEFAULT_WORKBOOK_THEME);
  // Frozen from the pre-change implementation on the same synthetic seed.
  expect(createHash("sha256").update(entries[themePart]!).digest("hex")).toBe(
    "9349a8d707526ee84235d62bb937415f509eea47e8218f6b221c5a3d8c3c20b8",
  );
});
