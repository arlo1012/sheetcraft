import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { normalizeChartFormat } from "@sheetcraft/core/chart-format";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { unsupportedNativeChartStyles } from "../../chart-capabilities.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

function chart(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const drawing = [...result.workbook.sheets.values()][0]!.drawings?.find(
    (d) => d.kind === "chart",
  );
  if (!drawing || drawing.kind !== "chart") throw Error("Missing chart");
  return drawing.chart;
}
async function expectChartOmitted(bytes: Uint8Array) {
  const read = await decodeXlsx(bytes);
  expect(
    [...read.workbook.sheets.values()][0]!.drawings?.some((d) => d.kind === "chart") ?? false,
  ).toBe(false);
  expect(read.report.issues).toContainEqual(
    expect.objectContaining({
      code: "feature-omitted",
      severity: "warning",
      locations: ["xl/charts/chart1.xml"],
    }),
  );
}
function source(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["xl/charts/chart1.xml"]!);
}
function fixture() {
  const f = nativeColumnFixture();
  f.drawing.chart.legend = true;
  f.drawing.chart.format = {
    legend: {
      text: {
        fontFamily: "Liberation Sans",
        fontSize: 16,
        color: "#ff0000",
        bold: true,
        italic: true,
      },
      surface: { fill: "#ffff00", stroke: "#00ff00", strokeWidth: 2 },
    },
  };
  return f;
}
for (const type of ["column", "bar", "line"] as const)
  describe(`${type} legend native styles`, () => {
    test.each([true, false])(
      "roundtrips explicit italic=%s, text and solid surface",
      async (italic) => {
        const f = fixture();
        f.drawing.chart.type = type;
        f.drawing.chart.format!.legend!.text!.italic = italic;
        const before = serializeWorkbook(f.workbook);
        const out = await encodeXlsx(f.workbook);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        const legend = source(out.bytes).match(/<c:legend>[\s\S]*?<\/c:legend>/)![0];
        expect(legend).toContain(`sz="1200" b="1" i="${Number(italic)}"`);
        expect(legend).toContain('<a:ln w="19050"><a:solidFill><a:srgbClr val="00FF00"/>');
        const read = await decodeXlsx(out.bytes);
        expect(chart(read).format?.legend).toEqual(f.drawing.chart.format!.legend);
        const again = await encodeXlsx(deserializeWorkbook(serializeWorkbook(read.workbook)));
        expect(chart(await decodeXlsx(again.bytes)).format?.legend).toEqual(
          f.drawing.chart.format!.legend,
        );
      },
    );
    test("preserves explicit transparent fill/stroke without inventing a zero width", async () => {
      const f = fixture();
      f.drawing.chart.type = type;
      f.drawing.chart.format!.legend = { surface: { fill: "transparent", stroke: "transparent" } };
      const out = await encodeXlsx(f.workbook);
      expect(source(out.bytes)).toContain(
        '<c:spPr><a:noFill/><a:ln w="9525"><a:noFill/></a:ln></c:spPr>',
      );
      expect(chart(await decodeXlsx(out.bytes)).format?.legend).toEqual({
        surface: { fill: "transparent", stroke: "transparent", strokeWidth: 1 },
      });
    });
  });
test.each([
  [{ text: { color: "#1234" } }, "text.color"],
  [{ text: { fontFamily: "+mn-lt" } }, "text.fontFamily"],
  [{ text: { fontFamily: "Arial, serif" } }, "text.fontFamily"],
  [{ text: { fontSize: 12.001 } }, "text.fontSize"],
  [{ surface: { fill: "#11223344" } }, "surface.fill"],
  [{ surface: { stroke: "#1234" } }, "surface.stroke"],
  [{ surface: { strokeWidth: 0 } }, "surface.strokeWidth"],
  [{ surface: { strokeWidth: 1.00001 } }, "surface.strokeWidth"],
] as const)("blocks unsupported legend %j before resources", async (legend, leaf) => {
  const f = fixture();
  f.drawing.chart.format = normalizeChartFormat({ legend });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([`format.legend.${leaf}`]);
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
test("hidden legend and style getters fail closed", () => {
  const f = fixture();
  f.drawing.chart.legend = false;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format.legend"]);
  f.drawing.chart.legend = true;
  const getter = vi.fn();
  Object.defineProperty(f.drawing.chart.format!.legend!, "surface", { get: getter });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format.legend"]);
  expect(getter).not.toHaveBeenCalled();
});
test.each([
  ['<a:srgbClr val="FF0000"/>', '<a:schemeClr val="phClr"/>', "text.color"],
  ['<a:ea typeface="Liberation Sans"/>', '<a:ea typeface="Arial"/>', "text.fontFamily"],
  [' i="1"', ' i="bogus"', "text.italic"],
  ['<a:ln w="19050">', '<a:ln w="0">', "surface.strokeWidth"],
  ['<a:ln w="19050">', '<a:ln w="19050" cap="rnd">', "surface.stroke.cap"],
  ["<a:bodyPr/>", '<a:bodyPr rot="60000"/>', "text.bodyPr"],
  ["<a:endParaRPr/>", '<a:endParaRPr b="0"/>', "text.b"],
] as const)(
  "warns precisely for unrepresentable imported legend %s",
  async (old, replacement, path) => {
    const out = await encodeXlsx(fixture().workbook),
      entries = unzipSync(out.bytes);
    entries["xl/charts/chart1.xml"] = strToU8(
      source(out.bytes).replace(/<c:legend>[\s\S]*?<\/c:legend>/, (legend) =>
        legend.replace(old, replacement),
      ),
    );
    const read = await decodeXlsx(zipSync(entries));
    expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
      `xl/charts/chart1.xml.format.legend.${path}`,
    );
  },
);
test.each([
  '<c:legendEntry><c:idx val="0"/></c:legendEntry>',
  '<c:layout><c:manualLayout><c:x val="0.1"/></c:manualLayout></c:layout>',
  "<c:spPr><a:gradFill/></c:spPr>",
  '<c:spPr><a:ln><a:prstDash val="dash"/></a:ln></c:spPr>',
])("rejects unsupported legend structure %s", async (extra) => {
  const f = nativeColumnFixture(),
    out = await encodeXlsx(f.workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    source(out.bytes).replace(
      '<c:layout/><c:overlay val="0"/></c:legend>',
      `${extra}<c:overlay val="0"/></c:legend>`,
    ),
  );
  if (extra.includes("legendEntry")) await expectChartOmitted(zipSync(entries));
  else await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
});

test("legend styles do not widen stacked or source chart admission", () => {
  const f = fixture();
  f.drawing.chart.stacked = true;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format"]);
  f.drawing.chart.stacked = false;
  Object.defineProperty(f.drawing.chart, "source", { value: {} });
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual(["format"]);
});
test("legend text retains exact hundredth-point sizing and EMU widths", async () => {
  const f = fixture();
  f.drawing.chart.format!.legend!.text!.fontSize = 1001 / 75;
  f.drawing.chart.format!.legend!.surface!.strokeWidth = 10001 / 9525;
  expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
  const out = await encodeXlsx(f.workbook);
  expect(source(out.bytes)).toContain('sz="1001"');
  expect(source(out.bytes)).toContain('w="10001"');
  expect(chart(await decodeXlsx(out.bytes)).format?.legend).toEqual(f.drawing.chart.format!.legend);
});
test("legend partial rich text and effects produce explicit import warnings", async () => {
  const out = await encodeXlsx(fixture().workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    source(out.bytes).replace(/<c:legend>[\s\S]*?<\/c:legend>/, (legend) =>
      legend
        .replace("</a:pPr>", '</a:pPr><a:r><a:rPr b="0"/><a:t>局部</a:t></a:r>')
        .replace("</c:spPr>", "<a:effectLst/></c:spPr>"),
    ),
  );
  const read = await decodeXlsx(zipSync(entries));
  expect(chart(read).format?.legend?.text).toBeUndefined();
  expect(read.report.issues.flatMap((issue) => issue.locations)).toEqual(
    expect.arrayContaining([
      "xl/charts/chart1.xml.format.legend.text.r",
      "xl/charts/chart1.xml.format.legend.surface.effectLst",
    ]),
  );
});

test.each([
  [{ strokeWidth: 2 }, { stroke: "#d1d5db", strokeWidth: 2 }],
  [{ stroke: "#123456" }, { stroke: "#123456", strokeWidth: 1 }],
  [{ stroke: "transparent" }, { stroke: "transparent", strokeWidth: 1 }],
] as const)(
  "materializes Web-effective border defaults without mutating %j",
  async (surface, expected) => {
    const f = fixture();
    f.drawing.chart.format!.legend = { surface };
    const before = serializeWorkbook(f.workbook);
    const out = await encodeXlsx(f.workbook);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(chart(await decodeXlsx(out.bytes)).format?.legend?.surface).toEqual(expected);
  },
);

test("reads original WPS legend XML with explicit on/off and redundant identical entries", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { parseXml } = await import("../../pivot-xml.js");
  const { single } = await import("../../chart-package-parts.js");
  const { readNativeChartElements } = await import("../../native-chart-elements.js");
  const { readNativeChartStyles } = await import("../../native-chart-styles.js");
  const { CompatibilityReportBuilder } = await import("../../report.js");
  const bytes = await readFile(
    new URL("./fixtures/wps-legend-styles-reference.xlsx", import.meta.url),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "440c88d4ba005ffce390bba62ae1cc24070dab913fc5e939b2b5e758918b4557",
  );
  const entries = unzipSync(bytes);
  for (const index of [1, 2]) {
    const part = `xl/charts/chart${index}.xml`;
    const root = single(parseXml(entries[part]), "chartSpace"),
      native = single(root, "chart"),
      plot = single(native, "plotArea"),
      family = single(plot, "barChart");
    const target = nativeColumnFixture().drawing.chart;
    const report = new CompatibilityReportBuilder();
    const add = vi.spyOn(report, "add");
    expect(() => readNativeChartElements(native, family, "column", "")).not.toThrow();
    readNativeChartStyles(root, native, plot, family, target, part, report);
    expect(target.format?.legend).toEqual({
      text: {
        fontFamily: "Liberation Sans",
        fontSize: 16,
        bold: index === 1,
        italic: index === 1,
        color: "#ff0000",
      },
      surface: {
        fill: index === 1 ? "#ffff00" : "transparent",
        stroke: index === 1 ? "#00b050" : "transparent",
        strokeWidth: 2,
      },
    });
    // Font hint metadata and unsupported layout/effect defaults are diagnosed;
    // the fixture is never described as wholly lossless.
    expect(add).toHaveBeenCalledWith(
      "style-omitted",
      "warning",
      `${part}.format.legend.text.fontFamily.panose`,
    );
    expect(add).toHaveBeenCalledWith(
      "style-omitted",
      "warning",
      `${part}.format.legend.text.fontFamily.charset`,
    );
  }
});

test.each([
  "same",
  "override",
  "duplicate",
  "out-of-range",
  "delete",
  "extra",
  "empty",
  "namespace",
])("bounds WPS redundant legend entry %s", async (choice) => {
  const out = await encodeXlsx(fixture().workbook),
    entries = unzipSync(out.bytes);
  entries["xl/charts/chart1.xml"] = strToU8(
    source(out.bytes).replace(/<c:legend>[\s\S]*?<\/c:legend>/, (legend) => {
      const text = legend.match(/<c:txPr>[\s\S]*?<\/c:txPr>/)![0];
      const entry = `<c:legendEntry><c:idx val="${choice === "out-of-range" ? "2" : "0"}"/>${choice === "override" ? text.replace(' i="1"', ' i="0"') : text}${choice === "delete" ? '<c:delete val="0"/>' : choice === "extra" ? "<c:layout/>" : ""}</c:legendEntry>`;
      const added =
        choice === "namespace" ? entry.replaceAll("c:legendEntry", "a:legendEntry") : entry;
      return legend.replace(
        "<c:legendPos",
        `${added}${choice === "duplicate" ? entry : choice === "empty" ? "<c:legendEntry/>" : ""}<c:legendPos`,
      );
    }),
  );
  if (choice === "same")
    expect(chart(await decodeXlsx(zipSync(entries))).format?.legend).toEqual(
      fixture().drawing.chart.format!.legend,
    );
  else if (choice === "namespace")
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  else await expectChartOmitted(zipSync(entries));
});
test.each(["same", "different", "outside", "namespace"])(
  "bounds legend symbol font %s",
  async (choice) => {
    const out = await encodeXlsx(fixture().workbook),
      entries = unzipSync(out.bytes);
    const symbol = `<${choice === "namespace" ? "c" : "a"}:sym typeface="${choice === "different" ? "Arial" : "Liberation Sans"}"/>`;
    const mutate = (text: string) => text.replace("</a:defRPr>", `${symbol}</a:defRPr>`);
    entries["xl/charts/chart1.xml"] = strToU8(
      choice === "outside"
        ? mutate(source(out.bytes))
        : source(out.bytes).replace(/<c:legend>[\s\S]*?<\/c:legend>/, mutate),
    );
    if (choice === "outside" || choice === "namespace")
      await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
    else {
      const read = await decodeXlsx(zipSync(entries));
      expect(chart(read).format?.legend?.text?.fontFamily).toBe(
        choice === "same" ? "Liberation Sans" : undefined,
      );
      if (choice === "different")
        expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
          "xl/charts/chart1.xml.format.legend.text.fontFamily",
        );
    }
  },
);

test("imports the unmodified WPS-saved product workbook and retains legend styles after snapshot re-export", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const bytes = await readFile(
    new URL("./fixtures/wps-legend-product-roundtrip.xlsx", import.meta.url),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "488e11f79c0a4ee14112d5161b3e8b3fc19a516d728c9e9770382fa996928915",
  );
  const read = await decodeXlsx(bytes);
  const legends = (result: Awaited<ReturnType<typeof decodeXlsx>>) =>
    [...result.workbook.sheets.values()].flatMap((sheet) =>
      (sheet.drawings ?? [])
        .filter((d) => d.kind === "chart")
        .map((d) => (d.kind === "chart" ? d.chart.format?.legend : undefined)),
    );
  expect(legends(read)).toEqual([
    {
      text: {
        fontFamily: "Liberation Sans",
        fontSize: 16,
        color: "#ff0000",
        bold: true,
        italic: true,
      },
      surface: { fill: "#ffff00", stroke: "#00b050", strokeWidth: 2 },
    },
    {
      text: {
        fontFamily: "Liberation Sans",
        fontSize: 16,
        color: "#ff0000",
        bold: false,
        italic: false,
      },
      surface: { fill: "transparent", stroke: "transparent", strokeWidth: 2 },
    },
  ]);
  const output = await encodeXlsx(deserializeWorkbook(serializeWorkbook(read.workbook)));
  expect(legends(await decodeXlsx(output.bytes))).toEqual(legends(read));
  expect(read.report.issues.some((issue) => issue.code === "style-omitted")).toBe(true);
});
