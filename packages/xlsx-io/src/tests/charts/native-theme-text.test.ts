import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

// Minimal producer evidence extracted from textbox-mixed-wps-online-edited-20261018.xlsx
// SHA256 9402a814b0c8c31c8c91c73bab56310ac2d4c181d1c7c865e3e0aa964a5fbfe2.
// All four title/axis/legend paints are identical; no full workbook/user metadata retained.
const wpsPaint = '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>';
const wpsDark = '<a:sysClr val="windowText" lastClr="000000"/>';
const part = "xl/charts/chart1.xml";
const theme = "xl/theme/theme1.xml";
const textPaths = ["title", "categoryAxis.text", "valueAxis.text", "legend.text"];
const colorPaths = textPaths.map((p) => `${part}.format.${p}.color`);
function chart(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const drawing = [...result.workbook.sheets.values()][0]!.drawings?.find(
    (d) => d.kind === "chart",
  );
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing chart");
  return drawing.chart;
}
function colors(result: Awaited<ReturnType<typeof decodeXlsx>>) {
  const format = chart(result).format;
  return [
    format?.title?.color,
    format?.categoryAxis?.text?.color,
    format?.valueAxis?.text?.color,
    format?.legend?.text?.color,
  ];
}
async function fixture(type: "column" | "bar" | "line" = "column", dark = wpsDark) {
  const f = nativeColumnFixture();
  f.drawing.chart.type = type;
  const text = { fontFamily: "Arial", fontSize: 15, color: "#123456" };
  f.drawing.chart.format = {
    title: text,
    categoryAxis: { text },
    valueAxis: { text },
    legend: { text },
  };
  const entries = unzipSync((await encodeXlsx(f.workbook)).bytes);
  entries[part] = strToU8(
    strFromU8(entries[part]!).replaceAll(
      '<a:solidFill><a:srgbClr val="123456"/></a:solidFill>',
      wpsPaint,
    ),
  );
  entries[theme] = strToU8(
    strFromU8(entries[theme]!).replace(/<a:dk1>.*?<\/a:dk1>/, `<a:dk1>${dark}</a:dk1>`),
  );
  return entries;
}
for (const type of ["column", "bar", "line"] as const)
  describe(type, () => {
    test.each([
      [wpsDark, "#000000"],
      ['<a:srgbClr val="2468AC"/>', "#2468ac"],
    ])("materializes exact tx1 text with %s and discloses binding loss", async (dark, expected) => {
      const first = await decodeXlsx(zipSync(await fixture(type, dark)));
      expect(colors(first)).toEqual(Array(4).fill(expected));
      const locations = first.report.issues.flatMap((i) => i.locations);
      for (const path of colorPaths) {
        expect(locations).not.toContain(path);
        expect(locations).toContain(`${path}.themeMaterialization`);
      }
      const out = await encodeXlsx(first.workbook);
      expect(strFromU8(unzipSync(out.bytes)[part]!)).not.toContain('val="tx1"');
      const second = await decodeXlsx(out.bytes);
      expect(chart(second).format).toEqual(chart(first).format);
      expect(
        second.report.issues
          .flatMap((i) => i.locations)
          .some((p) => p.includes("themeMaterialization")),
      ).toBe(false);
    });
  });

test.each([
  "missing-part",
  "missing-relationship",
  "invalid-rgb",
  "missing-slot",
  "wrong-namespace",
  "theme-transform",
  "transform",
  "unknown-slot",
  "extra-attribute",
  "extra-root",
  "duplicate-root",
  "polluted-color-namespace",
  "duplicate-color",
])("keeps precise warnings for %s", async (variant) => {
  const entries = await fixture();
  let t = strFromU8(entries[theme]!);
  let c = strFromU8(entries[part]!);
  if (variant === "missing-part") delete entries[theme];
  if (variant === "missing-relationship")
    entries["xl/_rels/workbook.xml.rels"] = strToU8(
      strFromU8(entries["xl/_rels/workbook.xml.rels"]!).replace(
        /<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/,
        "",
      ),
    );
  if (variant === "extra-root")
    t += '<a:extra xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>';
  if (variant === "duplicate-root") t += t.replace(/<\?xml[^>]*\?>/, "");
  if (variant === "polluted-color-namespace")
    t = t.replace(wpsDark, wpsDark.replace("<a:sysClr", '<a:sysClr xmlns:a="urn:wrong"'));
  if (variant === "duplicate-color") t = t.replace(wpsDark, wpsDark + wpsDark);
  if (variant === "invalid-rgb") t = t.replace('lastClr="000000"', 'lastClr="bad"');
  if (variant === "missing-slot") t = t.replace(/<a:dk1>.*?<\/a:dk1>/, "");
  if (variant === "wrong-namespace")
    t = t.replace("http://schemas.openxmlformats.org/drawingml/2006/main", "urn:wrong");
  if (variant === "theme-transform")
    t = t.replace(wpsDark, '<a:srgbClr val="000000"><a:lumMod val="50000"/></a:srgbClr>');
  if (variant === "transform")
    c = c.replaceAll(
      '<a:schemeClr val="tx1"/>',
      '<a:schemeClr val="tx1"><a:lumMod val="50000"/></a:schemeClr>',
    );
  if (variant === "unknown-slot") c = c.replaceAll('val="tx1"', 'val="phClr"');
  if (variant === "extra-attribute") c = c.replaceAll('val="tx1"', 'val="tx1" extra="1"');
  if (variant !== "missing-part") entries[theme] = strToU8(t);
  entries[part] = strToU8(c);
  if (variant === "missing-part" || variant === "duplicate-root") {
    await expect(decodeXlsx(zipSync(entries))).rejects.toThrow(
      variant === "missing-part" ? "Missing linked XLSX part" : "Invalid pivot XML",
    );
    return;
  }
  const result = await decodeXlsx(zipSync(entries));
  expect(colors(result)).toEqual(Array(4).fill(undefined));
  expect(result.report.issues.flatMap((i) => i.locations)).toEqual(
    expect.arrayContaining(colorPaths),
  );
});

test("chart color mapping overrides remain rejected before default tx1 mapping", async () => {
  const entries = await fixture();
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace("<c:chart>", '<c:clrMapOvr tx1="accent1"/><c:chart>'),
  );
  await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
});
test("chart theme overrides remain rejected before workbook theme resolution", async () => {
  const entries = await fixture();
  entries["xl/charts/_rels/chart1.xml.rels"] = strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="override" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride" Target="../theme/theme1.xml"/></Relationships>',
  );
  await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
});
test("an explicit rich-run RGB overrides inherited tx1 without a false materialization warning", async () => {
  const entries = await fixture();
  entries[part] = strToU8(
    strFromU8(entries[part]!).replace(
      "<a:r><a:t>Sales</a:t></a:r>",
      '<a:r><a:rPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></a:rPr><a:t>Sales</a:t></a:r>',
    ),
  );
  const result = await decodeXlsx(zipSync(entries));
  expect(chart(result).format?.title?.color).toBe("#abcdef");
  expect(result.report.issues.flatMap((i) => i.locations)).not.toContain(
    `${colorPaths[0]}.themeMaterialization`,
  );
});
