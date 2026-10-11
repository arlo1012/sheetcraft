import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import {
  applyWorkbookCommand,
  createApplyCellStyleCommand,
  createBuiltinTableStyles,
  createCreateTableCommand,
  createSetCellContentCommand,
  createSetWorkbookThemeCommand,
  createUpdateTableCommand,
  createWorkbook,
  DEFAULT_CELL_TEXT_COLOR,
  DEFAULT_WORKBOOK_THEME,
  getActiveSheet,
  getCellStyle,
  mergeCellStyle,
  resolveTableCellStyle,
  serializeWorkbook,
  type CellStylePatch,
} from "@sheetcraft/core";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { readProjectedDefaultFontColors } from "../../cell-font-defaults.js";
import { createNativeNormalFont } from "../../native/default-font.js";
import { NativeStyleWriter } from "../../native/writer-styles.js";
import { readXml } from "../../native/reader-xml.js";

const NORMAL = '<sz val="11"/><color rgb="FF20242C"/><name val="Calibri"/><family val="2"/>';
const LEGACY_NORMAL = NORMAL.replace("FF20242C", "FF000000");

function fixture() {
  const workbook = createWorkbook({ id: "font-defaults", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const accentColors = [...workbook.theme.accentColors] as typeof workbook.theme.accentColors;
  accentColors[0] = DEFAULT_CELL_TEXT_COLOR;
  applyWorkbookCommand(
    workbook,
    createSetWorkbookThemeCommand({
      ...workbook.theme,
      accentColors,
    }),
  );
  const patches: Array<CellStylePatch | undefined> = [
    undefined,
    { fontSize: 18 },
    { fontFamily: "Arial" },
    { textColor: "#000000" },
    { textColorTheme: { slot: "dark1" } },
    { textColor: "#ff0000" },
    { bold: false },
    { textColor: DEFAULT_CELL_TEXT_COLOR },
    { textColor: DEFAULT_CELL_TEXT_COLOR, textColorTheme: { slot: "accent1" } },
  ];
  for (const row of [0, 5])
    for (const [column, patch] of patches.entries()) {
      applyWorkbookCommand(
        workbook,
        createSetCellContentCommand(
          sheet.id,
          { row, column },
          { kind: "literal", value: `H${column}` },
        ),
      );
      if (patch)
        applyWorkbookCommand(
          workbook,
          createApplyCellStyleCommand(
            sheet.id,
            {
              start: { row, column },
              end: { row, column },
            },
            patch,
          ),
        );
    }
  applyWorkbookCommand(
    workbook,
    createCreateTableCommand(sheet.id, {
      id: "font-table",
      name: "Fonts",
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: patches.length - 1 } },
      columns: patches.map((_, column) => ({ id: `column-${column}`, name: `H${column}` })),
      style: createBuiltinTableStyles().find((style) => style.id === "table-medium-1")!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  return { workbook, sheet };
}

function inspect(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const styles = strFromU8(entries["xl/styles.xml"]!);
  const sheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
  const fonts = [
    ...styles.match(/<fonts\b[^>]*>(.*?)<\/fonts>/s)![1]!.matchAll(/<font>(.*?)<\/font>/gs),
  ].map((match) => match[1]!);
  const formats = [
    ...styles
      .match(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s)![1]!
      .matchAll(/<xf\b[^>]*?(?:\/>|>.*?<\/xf>)/gs),
  ].map((match) => match[0]);
  const font = (address: string) => {
    const cell = sheet.match(new RegExp(`<c r="${address}"[^>]*>`))![0];
    const styleId = Number(cell.match(/ s="(\d+)"/)?.[1] ?? 0);
    const fontId = Number(formats[styleId]!.match(/ fontId="(\d+)"/)![1]);
    return { font: fonts[fontId]!, styleId, fontId };
  };
  return { entries, styles, fonts, font };
}

describe("Normal-relative Core font projection", () => {
  test("uses fixed Core default RGB with the unchanged Calibri 11 MDW 7 Normal metadata", async () => {
    const { workbook } = fixture();
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const actual = inspect(encoded.bytes);
    expect(createNativeNormalFont()).toEqual({
      size: 11,
      color: { argb: "FF20242C" },
      name: "Calibri",
      family: 2,
    });
    expect(actual.fonts[0]).toBe(NORMAL);
    expect(actual.font("A1").font).toBe(NORMAL.replace('val="11"', 'val="13"'));
    expect(actual.font("B1").font).toBe(NORMAL.replace('val="11"', 'val="18"'));
    expect(actual.font("C1").font).toBe(
      NORMAL.replace('val="11"', 'val="13"').replace("Calibri", "Arial"),
    );
    for (const address of ["A1", "B1", "C1", "G1", "H1", "A6", "B6", "C6", "H6"]) {
      expect(actual.font(address).font).not.toContain("<b");
      expect(actual.font(address).font).not.toContain("FFFFFFFF");
    }
    expect(actual.styles).toContain('<font><b val="1"/><color rgb="FFFFFFFF"/></font>');
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("retains pure black, red and theme intent while literal default RGB resets through the public roundtrip", async () => {
    const { workbook } = fixture();
    const first = await encodeXlsx(workbook);
    const original = inspect(first.bytes);
    expect(original.font("D1").font).toContain('<color rgb="FF000000"/>');
    expect(original.font("D1").font).not.toContain("<family");
    expect(original.font("D1").fontId).not.toBe(original.font("A1").fontId);
    expect(original.font("E1").font).toContain('<color theme="1"/>');
    expect(original.font("F1").font).toContain('<color rgb="FFFF0000"/>');
    expect(original.font("H1").fontId).toBe(original.font("A1").fontId);
    expect(original.font("I1").font).toContain('<color theme="4"/>');
    expect(original.font("I1").font).not.toContain("<family");
    const decoded = await decodeXlsx(first.bytes);
    expect(decoded.report.issues).toEqual([]);
    const restored = getActiveSheet(decoded.workbook);
    const table = restored.tables![0]!;
    for (const column of [0, 1, 2, 6, 7]) {
      const style = getCellStyle(restored, { row: 0, column });
      expect(style?.textColor).toBeUndefined();
      expect(style?.textColorTheme).toBeUndefined();
      expect(
        mergeCellStyle(resolveTableCellStyle(table, { row: 0, column }), style ?? {}),
      ).toMatchObject({ textColor: "#ffffff", bold: true });
      const ordinary = getCellStyle(restored, { row: 5, column });
      expect(ordinary?.textColor).toBeUndefined();
      expect(ordinary?.textColorTheme).toBeUndefined();
      expect(ordinary?.textColor ?? DEFAULT_CELL_TEXT_COLOR).toBe(DEFAULT_CELL_TEXT_COLOR);
    }
    expect(getCellStyle(restored, { row: 0, column: 1 })?.fontSize).toBe(18);
    expect(getCellStyle(restored, { row: 0, column: 2 })?.fontFamily).toBe("Arial");
    expect(getCellStyle(restored, { row: 0, column: 3 })?.textColor).toBe("#000000");
    expect(getCellStyle(restored, { row: 0, column: 4 })?.textColorTheme).toEqual({
      slot: "dark1",
    });
    expect(getCellStyle(restored, { row: 0, column: 5 })?.textColor).toBe("#ff0000");
    expect(getCellStyle(restored, { row: 0, column: 8 })).toMatchObject({
      textColor: DEFAULT_CELL_TEXT_COLOR,
      textColorTheme: { slot: "accent1" },
    });
    const second = inspect((await encodeXlsx(decoded.workbook)).bytes);
    for (const row of [1, 6])
      for (const column of "ABCDEFGHI") {
        const address = `${column}${row}`;
        expect(readXml(strToU8(`<font>${second.font(address).font}</font>`))).toEqual(
          readXml(strToU8(`<font>${original.font(address).font}</font>`)),
        );
      }
  });

  test("keeps default inheritance live after changing to named Light and changing theme colors", async () => {
    const initial = fixture();
    const workbook = (await decodeXlsx((await encodeXlsx(initial.workbook)).bytes)).workbook;
    const sheet = getActiveSheet(workbook);
    const table = sheet.tables![0]!;
    const light = createBuiltinTableStyles().find((style) => style.id === "table-light-2")!;
    applyWorkbookCommand(workbook, createUpdateTableCommand(sheet.id, table.id, { style: light }));
    const accentColors = [...workbook.theme.accentColors] as typeof workbook.theme.accentColors;
    accentColors[0] = "#654321";
    applyWorkbookCommand(
      workbook,
      createSetWorkbookThemeCommand({
        ...workbook.theme,
        accentColors,
        colors: { ...DEFAULT_WORKBOOK_THEME.colors, ...workbook.theme.colors, dark1: "#123456" },
      }),
    );
    const encoded = await encodeXlsx(workbook);
    const output = inspect(encoded.bytes);
    expect(strFromU8(output.entries["xl/tables/table1.xml"]!)).toContain(
      'name="Sheetcraft Light 2"',
    );
    expect(output.fonts[0]).toBe(NORMAL);
    for (const address of ["A1", "B1", "C1", "G1", "H1"]) {
      expect(output.font(address).font).toContain('<color rgb="FF20242C"/>');
      expect(output.font(address).font).not.toContain("<b");
      expect(output.font(address).font).not.toContain("FF4F81BD");
    }
    expect(output.font("B1").font).toContain('<sz val="18"/>');
    expect(output.font("D1").font).toContain('<color rgb="FF000000"/>');
    expect(output.font("E1").font).toContain('<color theme="1"/>');
    expect(output.font("F1").font).toContain('<color rgb="FFFF0000"/>');
    expect(output.font("I1").font).toContain('<color theme="4"/>');
    const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
    for (const column of [0, 1, 2, 6, 7]) {
      const direct = getCellStyle(restored, { row: 0, column });
      expect(direct?.textColor).toBeUndefined();
      expect(
        mergeCellStyle(
          resolveTableCellStyle(restored.tables![0]!, { row: 0, column }),
          direct ?? {},
        ),
      ).toMatchObject({ textColor: "#4f81bd", bold: true });
      expect(getCellStyle(restored, { row: 5, column })?.textColor).toBeUndefined();
    }
    for (const row of [0, 5]) {
      expect(getCellStyle(restored, { row, column: 3 })?.textColor).toBe("#000000");
      expect(getCellStyle(restored, { row, column: 4 })).toMatchObject({
        textColor: "#123456",
        textColorTheme: { slot: "dark1" },
      });
      expect(getCellStyle(restored, { row, column: 5 })?.textColor).toBe("#ff0000");
      expect(getCellStyle(restored, { row, column: 8 })).toMatchObject({
        textColor: "#654321",
        textColorTheme: { slot: "accent1" },
      });
    }
  });

  test("exports old raw direct default RGB as reset without mutating the workbook", async () => {
    const { workbook, sheet } = fixture();
    const cell = sheet.cells.get("0:7")!;
    cell.style = { fontSize: 18, textColor: "#20242C" };
    const before = JSON.stringify(cell);
    const output = inspect((await encodeXlsx(workbook)).bytes);
    expect(output.font("H1").font).toBe(NORMAL.replace('val="11"', 'val="18"'));
    expect(JSON.stringify(cell)).toBe(before);
    const restored = getActiveSheet((await decodeXlsx(zipSync(output.entries))).workbook);
    expect(getCellStyle(restored, { row: 0, column: 7 })).toMatchObject({ fontSize: 18 });
    expect(getCellStyle(restored, { row: 0, column: 7 })?.textColor).toBeUndefined();
  });

  test("keeps a named definition's literal default RGB outside the direct reset projection", async () => {
    const { workbook, sheet } = fixture();
    workbook.cellStyles = [
      {
        id: "named-default-color",
        name: "Named fixed default color",
        category: "custom",
        includes: ["font"],
        style: { textColor: DEFAULT_CELL_TEXT_COLOR },
      },
    ];
    const cell = sheet.cells.get("5:7")!;
    cell.style = { textColor: DEFAULT_CELL_TEXT_COLOR };
    cell.namedStyle = { styleId: "named-default-color", includes: ["font"] };
    const output = inspect((await encodeXlsx(workbook)).bytes);
    expect(output.font("H6").font).toContain('<color rgb="FF20242C"/>');
    expect(output.font("H6").font).not.toContain("<family");
    expect(readProjectedDefaultFontColors(output.entries).has(output.font("H6").styleId)).toBe(
      false,
    );
    const decoded = await decodeXlsx(zipSync(output.entries));
    const namedColor = decoded.workbook.cellStyles![0]?.style.textColor;
    expect(typeof namedColor === "string" ? namedColor.toLowerCase() : namedColor).toBe(
      DEFAULT_CELL_TEXT_COLOR,
    );
    expect(getCellStyle(getActiveSheet(decoded.workbook), { row: 5, column: 7 })?.textColor).toBe(
      DEFAULT_CELL_TEXT_COLOR,
    );
  });

  test("Core bold false clears the direct effect; native explicit false is retained", async () => {
    const { workbook, sheet } = fixture();
    const range = { start: { row: 0, column: 6 }, end: { row: 0, column: 6 } };
    applyWorkbookCommand(workbook, createApplyCellStyleCommand(sheet.id, range, { bold: true }));
    applyWorkbookCommand(workbook, createApplyCellStyleCommand(sheet.id, range, { bold: false }));
    expect(getCellStyle(sheet, range.start)?.bold).toBeUndefined();
    expect(inspect((await encodeXlsx(workbook)).bytes).font("G1").font).not.toContain("<b");
    const writer = new NativeStyleWriter();
    writer.cellStyle({
      address: "A1",
      value: "false",
      style: { font: { ...createNativeNormalFont(), size: 13, bold: false } },
    });
    expect(writer.xml()).toContain('<font><b val="0"/><sz val="13"/>');
  });

  test("imports canonical released black-base fonts as implicit while keeping sparse explicit black", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(/<font>(.*?)<\/font>/gs, (font) =>
        font.includes('<family val="2"/>') ? font.replace("FF20242C", "FF000000") : font,
      ),
    );
    expect(strFromU8(actual.entries["xl/styles.xml"]!)).toContain(`<font>${LEGACY_NORMAL}</font>`);
    const projected = readProjectedDefaultFontColors(actual.entries);
    expect(projected.has(actual.font("A1").styleId)).toBe(true);
    expect(projected.has(actual.font("D1").styleId)).toBe(false);
    const restored = await decodeXlsx(zipSync(actual.entries));
    const sheet = getActiveSheet(restored.workbook);
    for (const row of [0, 5]) {
      for (const column of [0, 1, 2, 6, 7])
        expect(getCellStyle(sheet, { row, column })?.textColor).toBeUndefined();
      expect(getCellStyle(sheet, { row, column: 3 })?.textColor).toBe("#000000");
    }
    const exported = inspect((await encodeXlsx(restored.workbook)).bytes);
    expect(exported.fonts[0]).toBe(NORMAL);
    expect(exported.font("A1").font).toContain('<color rgb="FF20242C"/>');
    expect(exported.font("D1").font).toContain('<color rgb="FF000000"/>');
    expect(exported.font("D1").font).not.toContain("<family");
  });

  test("foreign completed literal black is not mistaken for the legacy own-producer projection", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(/<font>(.*?)<\/font>/gs, (font) =>
        font.includes('<family val="2"/>') ? font.replace("FF20242C", "FF000000") : font,
      ),
    );
    actual.entries["xl/workbook.xml"] = strToU8(
      strFromU8(actual.entries["xl/workbook.xml"]!).replace('appName="Sheetcraft"', 'appName="xl"'),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
    const restored = getActiveSheet((await decodeXlsx(zipSync(actual.entries))).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.textColor).toBe("#000000");
    expect(getCellStyle(restored, { row: 0, column: 3 })?.textColor).toBe("#000000");
  });

  test("foreign literal default RGB follows the direct reset rule without producer deprojection", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/workbook.xml"] = strToU8(
      strFromU8(actual.entries["xl/workbook.xml"]!).replace('appName="Sheetcraft"', 'appName="xl"'),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
    const restored = getActiveSheet((await decodeXlsx(zipSync(actual.entries))).workbook);
    expect(getCellStyle(restored, { row: 0, column: 0 })?.textColor).toBeUndefined();
    expect(getCellStyle(restored, { row: 0, column: 3 })?.textColor).toBe("#000000");
    expect(getCellStyle(restored, { row: 0, column: 8 })).toMatchObject({
      textColor: DEFAULT_CELL_TEXT_COLOR,
      textColorTheme: { slot: "accent1" },
    });
  });

  test("foreign theme-colored Normal and completed fonts retain a same-default resolved theme binding", async () => {
    const { workbook } = fixture();
    applyWorkbookCommand(
      workbook,
      createSetWorkbookThemeCommand({
        ...workbook.theme,
        colors: {
          ...DEFAULT_WORKBOOK_THEME.colors,
          ...workbook.theme.colors,
          dark1: DEFAULT_CELL_TEXT_COLOR,
        },
      }),
    );
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/workbook.xml"] = strToU8(
      strFromU8(actual.entries["xl/workbook.xml"]!).replace('appName="Sheetcraft"', 'appName="xl"'),
    );
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(/<font>(.*?)<\/font>/gs, (font) =>
        font.includes('<family val="2"/>')
          ? font.replace('<color rgb="FF20242C"/>', '<color theme="1"/>')
          : font,
      ),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
    const decoded = await decodeXlsx(zipSync(actual.entries));
    const sheet = getActiveSheet(decoded.workbook);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toMatchObject({
      textColor: DEFAULT_CELL_TEXT_COLOR,
      textColorTheme: { slot: "dark1" },
    });
    expect(getCellStyle(sheet, { row: 0, column: 3 })?.textColor).toBe("#000000");
    expect(inspect((await encodeXlsx(decoded.workbook)).bytes).font("A1").font).toContain(
      '<color theme="1"/>',
    );
  });

  test.each([
    '<color theme="1"/>',
    '<color indexed="8"/>',
    '<color auto="1"/>',
    '<color rgb="FF20242C" tint="0"/>',
  ])("does not reinterpret a noncanonical completed color %s", async (color) => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    const projected = `<font>${actual.font("A1").font}</font>`;
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(projected, projected.replace('<color rgb="FF20242C"/>', color)),
    );
    expect(readProjectedDefaultFontColors(actual.entries).has(actual.font("A1").styleId)).toBe(
      false,
    );
  });

  test.each([
    NORMAL.replace('val="11"', 'val="12"'),
    NORMAL.replace("Calibri", "Arial"),
    NORMAL.replace('<family val="2"/>', '<family val="1"/>'),
    `${NORMAL}<scheme val="minor"/>`,
    NORMAL.replace("FF20242C", "FF123456"),
    NORMAL.replace('<color rgb="FF20242C"/>', '<color theme="1"/>'),
  ])("changed Normal metadata disables projection recovery: %s", async (normal) => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(`<font>${NORMAL}</font>`, `<font>${normal}</font>`),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
  });

  test.each([
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0"/>',
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0"/>',
    '<xf numFmtId="0" fontId="0" fillId="1" borderId="0"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyFont="1"/>',
  ])("changed default parent disables projection recovery: %s", async (parent) => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(/(<cellStyleXfs\b[^>]*>).*?(<\/cellStyleXfs>)/s, `$1${parent}$2`),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
  });

  test("missing canonical Normal named entry disables producer recovery", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace('name="Normal" xfId="0" builtinId="0"', 'name="Foreign" xfId="0"'),
    );
    expect(readProjectedDefaultFontColors(actual.entries).size).toBe(0);
  });

  test("completed fonts need the exact family2 marker and their canonical base color", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    const projected = `<font>${actual.font("A1").font}</font>`;
    for (const font of [
      projected.replace('<family val="2"/>', ""),
      projected.replace('<family val="2"/>', '<family val="2" extra="1"/>'),
      projected.replace("FF20242C", "FF000000"),
    ]) {
      actual.entries["xl/styles.xml"] = strToU8(actual.styles.replace(projected, font));
      expect(readProjectedDefaultFontColors(actual.entries).has(actual.font("A1").styleId)).toBe(
        false,
      );
    }
  });

  test("empty indexed font entries do not shift a literal color onto the implicit font", () => {
    const writer = new NativeStyleWriter();
    writer.cellStyle({ address: "A1", value: "empty", style: { font: {} } });
    const literalStyle = writer.cellStyle({
      address: "B1",
      value: "red",
      style: { font: { color: { argb: "FFFF0000" } } },
    });
    const defaultStyle = writer.cellStyle({
      address: "C1",
      value: "default",
      style: { font: { ...createNativeNormalFont(), size: 13 } },
    });
    const recovered = readProjectedDefaultFontColors({
      "xl/workbook.xml": strToU8('<workbook><fileVersion appName="Sheetcraft"/></workbook>'),
      "xl/styles.xml": strToU8(writer.xml()),
    });
    expect(recovered.has(literalStyle)).toBe(false);
    expect(recovered.has(defaultStyle)).toBe(true);
  });

  test("named-style parent bindings do not lose their physical color", async () => {
    const { workbook } = fixture();
    const actual = inspect((await encodeXlsx(workbook)).bytes);
    const fontId = actual.font("A1").fontId;
    const xf = new RegExp(`<xf[^>]*fontId="${fontId}"[^>]*xfId="0"[^>]*>`);
    actual.entries["xl/styles.xml"] = strToU8(
      actual.styles.replace(xf, (value) => value.replace('xfId="0"', 'xfId="1"')),
    );
    expect(readProjectedDefaultFontColors(actual.entries).has(actual.font("A1").styleId)).toBe(
      false,
    );
  });
});
