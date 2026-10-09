import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { normalizeWorkbookTheme, resolveThemeFontFamily } from "@sheetcraft/core/workbook-theme";
import { decodeXlsx, encodeXlsx } from "../index.js";
import { readXlsxCellStyles } from "../cell-styles.js";
import { readXlsxWorkbookTheme } from "../workbook-theme.js";

describe("XLSX workbook themes", () => {
  test("projects document theme colors and fonts into theme1.xml and restores them", async () => {
    const workbook = createWorkbook({ id: "theme-book", sheetId: "sheet" });
    workbook.theme = {
      id: "custom",
      name: "Custom",
      accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"],
      headingFont: "Georgia",
      bodyFont: "Arial",
      customFonts: [
        {
          id: "custom",
          name: "Custom",
          headingFont: "Cambria",
          bodyFont: "Calibri",
          headingEastAsia: "宋体",
          bodyEastAsia: "等线",
        },
      ],
    };
    const encoded = await encodeXlsx(workbook);
    expect(strFromU8(unzipSync(encoded.bytes)["xl/theme/theme1.xml"]!)).toContain('val="112233"');
    expect(strFromU8(unzipSync(encoded.bytes)["xl/theme/theme1.xml"]!)).toContain(
      "sheetcraft:themeCatalog",
    );
    expect((await decodeXlsx(encoded.bytes)).workbook.theme).toEqual(
      normalizeWorkbookTheme(workbook.theme),
    );
  });

  test("retains all DrawingML scheme colors, East Asian fonts, and effect choices", async () => {
    const workbook = createWorkbook({ id: "full-theme", sheetId: "sheet" });
    workbook.theme = normalizeWorkbookTheme({
      id: "quoted-theme",
      name: 'A & "B"',
      accentColors: ["#102030", "#203040", "#304050", "#405060", "#506070", "#607080"],
      headingFont: "Aptos Display",
      bodyFont: "Aptos",
      colors: {
        name: "方案 $' A",
        dark1: "#010203",
        light1: "#fefdfc",
        dark2: "#112233",
        light2: "#ddeeff",
        hyperlink: "#123abc",
        followedHyperlink: "#654321",
      },
      fonts: { name: "中文方案", headingEastAsia: "微软雅黑", bodyEastAsia: "等线" },
      customFonts: [
        {
          id: "dollar",
          name: "Custom $' Font",
          headingFont: "Aptos Display",
          bodyFont: "Aptos",
          headingEastAsia: "微软雅黑",
          bodyEastAsia: "等线",
        },
      ],
      effects: {
        id: "custom-effect",
        name: "Custom Effect",
        shadow: "hard",
        reflection: true,
        bevel: true,
        outlineWidth: 2.5,
        gradient: true,
      },
    });
    const encoded = await encodeXlsx(workbook);
    const themeXml = strFromU8(unzipSync(encoded.bytes)["xl/theme/theme1.xml"]!);
    expect(themeXml).toContain('lastClr="010203"');
    expect(themeXml).toContain('val="123ABC"');
    expect(themeXml).toContain('typeface="微软雅黑"');
    expect(themeXml).toContain("<a:reflection");
    expect(themeXml).toContain("<a:bevelT");
    expect((await decodeXlsx(encoded.bytes)).workbook.theme).toEqual({
      ...workbook.theme,
      id: "a-b",
    });
  });

  test("round-trips cell theme references and tint instead of flattening them to RGB", async () => {
    const workbook = createWorkbook({ id: "theme-reference", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    workbook.theme = normalizeWorkbookTheme({ ...workbook.theme, headingFont: "Cambria" });
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Theme" });
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        fontFamily: resolveThemeFontFamily(workbook.theme, "major"),
        fontTheme: "major",
        textColor: "#1f4e79",
        textColorTheme: { slot: "accent1", tint: -0.25 },
        fillColor: "#dbe5f1",
        fillColorTheme: { slot: "light2", tint: 0.1 },
      },
    );
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Explicit" });
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        fontFamily: "Inter",
        fontTheme: "minor",
        textColor: "#123456",
      },
    );
    const encoded = await encodeXlsx(workbook);
    const styles = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(styles).toContain('theme="4" tint="-0.25"');
    expect(styles).toContain('theme="2" tint="0.1"');
    expect(styles).toContain('<scheme val="major"/>');
    expect(styles).toContain('<name val="Cambria"/><scheme val="major"/>');
    expect(
      getCellStyle(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook), {
        row: 0,
        column: 0,
      }),
    ).toMatchObject({
      textColorTheme: { slot: "accent1", tint: -0.25 },
      fillColorTheme: { slot: "light2", tint: 0.1 },
      fontTheme: "major",
    });
    expect(
      getCellStyle(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook), {
        row: 0,
        column: 1,
      }),
    ).toMatchObject({ fontTheme: "minor", textColor: "#123456" });
  });

  test("projects named-style theme font caches to their OOXML western font", async () => {
    const workbook = createWorkbook({ id: "named-theme-font", sheetId: "sheet" });
    workbook.theme = normalizeWorkbookTheme({ ...workbook.theme, headingFont: "Cambria" });
    workbook.cellStyles = [
      {
        id: "theme-heading",
        name: "Theme heading",
        category: "custom",
        includes: ["font"],
        style: {
          fontTheme: "major",
          fontFamily: resolveThemeFontFamily(workbook.theme, "major"),
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const styles = unzipSync(encoded.bytes)["xl/styles.xml"]!;
    expect(strFromU8(styles)).toContain('<name val="Cambria"/>');
    expect(readXlsxCellStyles(styles)[0]?.style.fontFamily).toBe("Cambria");
  });

  test("imports real theme XML system colors and a Hans fallback when ea is empty", () => {
    const theme = readXlsxWorkbookTheme(
      new TextEncoder().encode(
        `<?xml version="1.0"?><a:theme name="外部主题" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="外部配色"><a:dk1><a:sysClr val="windowText" lastClr="010203"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FEFDFC"/></a:lt1><a:dk2><a:srgbClr val="112233"/></a:dk2><a:lt2><a:srgbClr val="DDEEFF"/></a:lt2><a:accent1><a:srgbClr val="102030"/></a:accent1><a:accent2><a:srgbClr val="203040"/></a:accent2><a:accent3><a:srgbClr val="304050"/></a:accent3><a:accent4><a:srgbClr val="405060"/></a:accent4><a:accent5><a:srgbClr val="506070"/></a:accent5><a:accent6><a:srgbClr val="607080"/></a:accent6><a:hlink><a:srgbClr val="123ABC"/></a:hlink><a:folHlink><a:srgbClr val="654321"/></a:folHlink></a:clrScheme><a:fontScheme name="外部字体"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:font script="Hans" typeface="微软雅黑"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="等线"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
      ),
    );
    expect(theme).toMatchObject({
      name: "外部主题",
      colors: { dark1: "#010203", hyperlink: "#123abc" },
      fonts: { headingEastAsia: "微软雅黑", bodyEastAsia: "等线" },
    });
  });
});
