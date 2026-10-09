import { strToU8, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { readNativeWorkbook } from "../../native/reader.js";
import { translateSharedFormula } from "../../native/reader-formulas.js";

const namespace = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const relNamespace = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const relType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function archive(parts: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, strToU8(value)])),
  );
}
function fixture(sheet: string, extras: Record<string, string> = {}): Uint8Array {
  return archive({
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "_rels/.rels": `<Relationships ${relNamespace}><Relationship Id="main" Type="${relType}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook ${namespace} xmlns:r="${relType}"><workbookPr date1904="1"/><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Data &amp; notes" sheetId="1" r:id="sheet"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships ${relNamespace}><Relationship Id="sheet" Type="${relType}/worksheet" Target="worksheets/custom.xml"/><Relationship Id="styles" Type="${relType}/styles" Target="styles.xml"/><Relationship Id="strings" Type="${relType}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="theme" Type="${relType}/theme" Target="theme/theme1.xml"/></Relationships>`,
    "xl/worksheets/custom.xml": `<worksheet ${namespace}>${sheet}</worksheet>`,
    "xl/styles.xml": `<styleSheet ${namespace}><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>`,
    "xl/theme/theme1.xml":
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme/></a:themeElements></a:theme>',
    "xl/sharedStrings.xml": `<sst ${namespace}><si><r><t xml:space="preserve"> hello </t></r><r><t>&amp; world</t></r><rPh sb="0" eb="1"><t>phonetic</t></rPh></si><si><t>_x005F_x0041_ / _x000A_</t></si></sst>`,
    ...extras,
  });
}
const cell = (bytes: Uint8Array, reference: string) => {
  const sheet = readNativeWorkbook(bytes).sheets[0]!;
  return [...sheet.rows.values()]
    .flatMap((row) => [...row.cells.values()])
    .find((cell) => cell.address === reference)!;
};

describe("first-party sparse OOXML reader", () => {
  test.each([
    "",
    " ",
    "History",
    "x".repeat(32),
    "Bad:Name",
    "Bad/Name",
    "Bad\\Name",
    "Bad?Name",
    "Bad*Name",
    "Bad[Name]",
    "'Bad",
    "Bad'",
  ])("rejects malformed worksheet title %s", (name) => {
    expect(() =>
      readNativeWorkbook(
        fixture("<sheetData/>", {
          "xl/workbook.xml": `<workbook ${namespace} xmlns:r="${relType}"><sheets><sheet name="${name}" r:id="sheet"/></sheets></workbook>`,
        }),
      ),
    ).toThrow(/worksheet name/);
  });

  test("rejects case-insensitive duplicate worksheet titles", () => {
    expect(() =>
      readNativeWorkbook(
        fixture("<sheetData/>", {
          "xl/workbook.xml": `<workbook ${namespace} xmlns:r="${relType}"><sheets><sheet name="Data" r:id="sheet"/><sheet name="data" r:id="sheet"/></sheets></workbook>`,
        }),
      ),
    ).toThrow(/worksheet name/);
  });

  test.each(["history", "HISTORY", "Data_x0041_", "Data_x000A_", "x".repeat(31)])(
    "preserves valid import-only and literal escaped worksheet title %s",
    (name) => {
      const workbook = readNativeWorkbook(
        fixture("<sheetData/>", {
          "xl/workbook.xml": `<workbook ${namespace} xmlns:r="${relType}"><sheets><sheet name="${name}" r:id="sheet"/></sheets></workbook>`,
        }),
      );
      expect(workbook.sheets[0]?.name).toBe(name);
    },
  );

  test("follows workbook and worksheet relationships in workbook order", () => {
    const bytes = archive({
      "_rels/.rels": `<Relationships ${relNamespace}><Relationship Id="main" Type="${relType}/officeDocument" Target="document/main.xml"/></Relationships>`,
      "document/main.xml": `<workbook ${namespace} xmlns:r="${relType}"><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="Second" r:id="two"/><sheet name="First" r:id="one"/></sheets></workbook>`,
      "document/_rels/main.xml.rels": `<Relationships ${relNamespace}><Relationship Id="one" Type="${relType}/worksheet" Target="../sheets/one.xml"/><Relationship Id="two" Type="${relType}/worksheet" Target="/sheets/two.xml"/></Relationships>`,
      "sheets/one.xml": `<worksheet ${namespace}><sheetData/></worksheet>`,
      "sheets/two.xml": `<worksheet ${namespace}><sheetData/></worksheet>`,
    });
    const workbook = readNativeWorkbook(bytes);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Second", "First"]);
    expect(workbook.views).toEqual([{ activeTab: 1 }]);
  });

  test("keeps million-row sparsity, dimensions, merges, and frozen panes", () => {
    const bytes = fixture(
      '<sheetViews><sheetView workbookViewId="0"><pane state="frozenSplit" xSplit="2" ySplit="3"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" defaultColWidth="12"/><cols><col min="2" max="3" width="20" hidden="1"/></cols><sheetData><row r="9" ht="30" hidden="1"/><row r="1048576"><c r="XFD1048576"><v>7</v></c></row></sheetData><mergeCells><mergeCell ref="A4:B5"/></mergeCells>',
    );
    const workbook = readNativeWorkbook(bytes),
      sheet = workbook.sheets[0]!;
    expect(workbook.properties.date1904).toBe(true);
    expect(sheet.name).toBe("Data & notes");
    expect(sheet.rows.size).toBe(2);
    expect(sheet.rows.get(9)).toMatchObject({ height: 30, hidden: true });
    expect(sheet.rows.get(1048576)?.cells.get(16384)?.value).toBe(7);
    expect(sheet.columns.size).toBe(2);
    expect(sheet.columns.get(3)).toEqual({ number: 3, width: 20, hidden: true });
    expect(sheet.views).toEqual([{ workbookViewId: 0, state: "frozen", xSplit: 2, ySplit: 3 }]);
    expect(sheet.merges).toEqual(["A4:B5"]);
  });

  test("reads primitive, error, inline, shared rich text and escaped strings losslessly", () => {
    const bytes = fixture(
      '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><r><t xml:space="preserve"> first </t></r><r><t>second</t></r></is></c><c r="D1" t="b"><v>0</v></c><c r="E1" t="e"><v>#DIV/0!</v></c><c r="F1" t="str"><v></v></c><c r="G1"><v>-1.25e2</v></c></row></sheetData>',
    );
    expect(cell(bytes, "A1").value).toBe(" hello & world");
    expect(cell(bytes, "B1").value).toBe("_x0041_ / \n");
    expect(cell(bytes, "C1").value).toBe(" first second");
    expect(cell(bytes, "D1").value).toBe(false);
    expect(cell(bytes, "E1").value).toEqual({ error: "#DIV/0!" });
    expect(cell(bytes, "F1").value).toBe("");
    expect(cell(bytes, "G1").value).toBe(-125);
  });

  test("restores forward shared formulas and typed cached results without converting date serials", () => {
    const bytes = fixture(
      '<sheetData><row r="1"><c r="A1" s="1"><v>60</v></c><c r="B1" t="str"><f t="shared" si="0"/><v>cached</v></c><c r="C1" t="e"><f>1/0</f><v>#DIV/0!</v></c></row><row r="2"><c r="B2"><f t="shared" si="0" ref="B1:B2">A2+$A$1+\'Other sheet\'!C2</f><v>12</v></c></row></sheetData>',
      {
        "xl/styles.xml": `<styleSheet ${namespace}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      },
    );
    expect(cell(bytes, "A1")).toMatchObject({ value: 60, numFmt: "mm-dd-yy" });
    expect(cell(bytes, "B1")).toMatchObject({
      formula: "A1+$A$1+'Other sheet'!C1",
      result: "cached",
    });
    expect(cell(bytes, "C1")).toMatchObject({ formula: "1/0", result: { error: "#DIV/0!" } });
  });

  test("translates shared A1 references without changing strings, names or structured references", () => {
    expect(
      translateSharedFormula(
        "SUM(A1,$A1,A$1,$A$1,A:A,$2:3,Data!B2,'Sheet 1'!B2,Table1[A1],\"A1\",LOG10(A1))",
        2,
        1,
      ),
    ).toBe("SUM(B3,$A3,B$1,$A$1,B:B,$2:5,Data!C4,'Sheet 1'!C4,Table1[A1],\"A1\",LOG10(B3))");
    expect(translateSharedFormula("A1", -1, 0)).toBe("#REF!");
  });

  test("scans malformed protected tokens without searching each bracket suffix", () => {
    for (const prefix of ['"', "'", "[".repeat(32_768)]) {
      const formula = `${prefix}A1`;
      expect(translateSharedFormula(formula, 1, 1)).toBe(formula);
    }
    expect(
      translateSharedFormula(
        "SUM(Table1[[#Headers],[A1]],Table1[Column'[A1']],A1,\"say \"\"A1\"\"\",'It''s A1'!A1)",
        1,
        1,
      ),
    ).toBe("SUM(Table1[[#Headers],[A1]],Table1[Column'[A1']],B2,\"say \"\"A1\"\"\",'It''s A1'!B2)");
  });

  test.each([
    ["SUM(S1:S3!A1)", "SUM(S1:S3!B2)"],
    ["SUM(S1:'S3'!A1)", "SUM(S1:'S3'!B2)"],
    ["SUM('S1':S3!A1)", "SUM('S1':S3!B2)"],
    ["SUM('S1':'S3'!A1)", "SUM('S1':'S3'!B2)"],
    ["SUM('S1:S3'!A1)", "SUM('S1:S3'!B2)"],
    ["SUM(S1:S3!A:A,S1:S3!$1:3)", "SUM(S1:S3!B:B,S1:S3!$1:4)"],
    ["SUM('S1':S3!$A:B,'S1':'S3'!1:$3)", "SUM('S1':S3!$A:C,'S1':'S3'!2:$3)"],
    ["SUM('It''s S1':S3!A1,[Book.xlsx]S1:S3!A1)", "SUM('It''s S1':S3!B2,[Book.xlsx]S1:S3!B2)"],
  ])("preserves 3D sheet qualifiers while shifting %s", (formula, expected) => {
    expect(translateSharedFormula(formula, 1, 1)).toBe(expected);
  });

  test("restores shared formulas with cell-like 3D worksheet names", () => {
    const bytes = fixture(
      '<sheetData><row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">SUM(S1:S3!B1)</f></c></row><row r="2"><c r="A2"><f t="shared" si="0"/></c></row></sheetData>',
    );
    expect(cell(bytes, "A2").formula).toBe("SUM(S1:S3!B2)");
  });

  test.each([
    "1",
    "01/02/2024",
    "2024-2-29",
    "2024-02-30",
    "2023-02-29",
    "1900-02-29",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "2024-01-32",
    "0000-01-01",
    "2024-01-01T25:00:00Z",
    "2024-01-01T00:60:00Z",
    "2024-01-01T00:00:60Z",
    "2024-01-01T00:00:00+24:00",
    "2024-01-01T00:00:00+01:60",
  ])("rejects malformed ISO date value %s", (value) => {
    expect(() =>
      readNativeWorkbook(
        fixture(`<sheetData><row r="1"><c r="A1" t="d"><v>${value}</v></c></row></sheetData>`),
      ),
    ).toThrow(/date/);
  });

  test.each([
    ["2024-02-29", "2024-02-29T00:00:00.000Z"],
    ["2024-02-29T12:34:56.123Z", "2024-02-29T12:34:56.123Z"],
    ["2024-02-29T12:34:56.1", "2024-02-29T12:34:56.100Z"],
    ["2024-02-29T12:34:56.123456789Z", "2024-02-29T12:34:56.123Z"],
    ["2024-03-01T00:30:00+01:00", "2024-02-29T23:30:00.000Z"],
    ["2024-02-29T23:30:00-01:00", "2024-03-01T00:30:00.000Z"],
  ])("reads ISO date %s without host timezone shorthand parsing", (value, expected) => {
    const parsed = cell(
      fixture(`<sheetData><row r="1"><c r="A1" t="d"><v>${value}</v></c></row></sheetData>`),
      "A1",
    ).value;
    expect(parsed).toBeInstanceOf(Date);
    expect((parsed as Date).toISOString()).toBe(expected);
  });

  test.each(["0x10", "0XFF", "0b10", "0o10", "1_000", "1e", "--1"])(
    "rejects non-decimal numeric lexeme %s",
    (value) => {
      expect(() =>
        readNativeWorkbook(
          fixture(`<sheetData><row r="1"><c r="A1"><v>${value}</v></c></row></sheetData>`),
        ),
      ).toThrow(/number/);
    },
  );

  test.each(["+1", "-1", ".5", "-.5", "1.", "01", "1e2", "-1.25E+2", " \t2\n "])(
    "retains signed decimal, exponent and whitespace numeric lexeme %s",
    (value) => {
      expect(
        cell(fixture(`<sheetData><row r="1"><c r="A1"><v>${value}</v></c></row></sheetData>`), "A1")
          .value,
      ).toBe(Number(value));
    },
  );

  test("limits stored and translated formula sources to 8192 UTF-16 units", () => {
    const accepted = `"${"x".repeat(8_190)}"`;
    expect(
      cell(
        fixture(`<sheetData><row r="1"><c r="A1"><f>${accepted}</f></c></row></sheetData>`),
        "A1",
      ).formula,
    ).toBe(accepted);
    expect(() =>
      readNativeWorkbook(
        fixture(`<sheetData><row r="1"><c r="A1"><f>${accepted}x</f></c></row></sheetData>`),
      ),
    ).toThrow(/source length/);
    const expanding = `A9+"${"x".repeat(8_187)}"`;
    expect(expanding.length).toBe(8_192);
    expect(() =>
      readNativeWorkbook(
        fixture(
          `<sheetData><row r="9"><c r="A9"><f t="shared" si="0" ref="A9:A10">${expanding}</f></c></row><row r="10"><c r="A10"><f t="shared" si="0"/></c></row></sheetData>`,
        ),
      ),
    ).toThrow(/source length/);
  });

  test("bounds total expanded shared-formula units across worksheets", () => {
    const source = `A$1+"${"x".repeat(8_186)}"`;
    expect(source.length).toBe(8_192);
    const sharedSheet = (count: number) =>
      `<sheetData>${Array.from(
        { length: count },
        (_, index) =>
          `<row r="${index + 1}"><c r="A${index + 1}"><f t="shared" si="0"${index === 0 ? ` ref="A1:A${count}">${source}</f>` : "/>"}</c></row>`,
      ).join("")}</sheetData>`;
    const first = sharedSheet(2_048);
    const twoSheets = (count: number) =>
      fixture(first, {
        "xl/workbook.xml": `<workbook ${namespace} xmlns:r="${relType}"><sheets><sheet name="First" r:id="one"/><sheet name="Second" r:id="two"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": `<Relationships ${relNamespace}><Relationship Id="one" Type="${relType}/worksheet" Target="worksheets/custom.xml"/><Relationship Id="two" Type="${relType}/worksheet" Target="worksheets/second.xml"/></Relationships>`,
        "xl/worksheets/second.xml": `<worksheet ${namespace}>${sharedSheet(count)}</worksheet>`,
      });
    expect(readNativeWorkbook(twoSheets(2_048)).sheets).toHaveLength(2);
    expect(() => readNativeWorkbook(twoSheets(2_049))).toThrow(/expanded formula limit/);
  });

  test("reads style components, custom/builtin formats, row/column inheritance and theme colors", () => {
    const bytes = fixture(
      '<cols><col min="2" max="2" style="1"/></cols><sheetData><row r="1" s="2"><c r="A1" s="1"><v>2</v></c><c r="B1"><v>3</v></c></row></sheetData>',
      {
        "xl/theme/theme1.xml":
          '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="123456"/></a:dk1><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:dk2><a:srgbClr val="111111"/></a:dk2><a:accent1><a:srgbClr val="2468AC"/></a:accent1><a:accent2><a:srgbClr val="222222"/></a:accent2><a:accent3><a:srgbClr val="333333"/></a:accent3><a:accent4><a:srgbClr val="444444"/></a:accent4><a:accent5><a:srgbClr val="555555"/></a:accent5><a:accent6><a:srgbClr val="666666"/></a:accent6></a:clrScheme></a:themeElements></a:theme>',
        "xl/styles.xml": `<styleSheet ${namespace}><numFmts><numFmt numFmtId="164" formatCode="0.000&quot; units&quot;"/></numFmts><fonts><font/><font><name val="Example"/><sz val="18"/><b/><u val="double"/><color theme="4"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="darkGrid"><fgColor indexed="10"/><bgColor rgb="FFABCDEF"/></patternFill></fill></fills><borders><border/><border diagonalUp="1"><top style="thin"><color theme="1"/></top><diagonal style="double"><color rgb="FF234567"/></diagonal></border></borders><cellXfs><xf/><xf fontId="1" fillId="1" borderId="1" numFmtId="164"><alignment horizontal="center" vertical="center" textRotation="120" readingOrder="2" wrapText="1"/><protection locked="0"/></xf><xf numFmtId="12"/></cellXfs></styleSheet>`,
      },
    );
    expect(cell(bytes, "A1").style).toMatchObject({
      font: {
        name: "Example",
        size: 18,
        bold: true,
        underline: "double",
        color: { argb: "FF2468AC" },
      },
      fill: {
        type: "pattern",
        pattern: "darkGrid",
        fgColor: { argb: "FFFF0000" },
        bgColor: { argb: "FFABCDEF" },
      },
      border: {
        top: { style: "thin", color: { argb: "FF123456" } },
        diagonal: { style: "double", up: true },
      },
      numFmt: '0.000" units"',
      alignment: {
        horizontal: "center",
        vertical: "middle",
        textRotation: -30,
        readingOrder: "rtl",
        wrapText: true,
      },
      protection: { locked: false },
    });
    expect(cell(bytes, "B1").numFmt).toBe("# ?/?");
  });

  test.each([
    '<sheetData><row r="1"><c r="A1" t="s"><v>999</v></c></row></sheetData>',
    '<sheetData><row r="1"><c r="XFE1"><v>1</v></c></row></sheetData>',
    '<sheetData><row r="1"><c r="A2"><v>1</v></c></row></sheetData>',
    '<sheetData><row r="1"><c r="A1"><f t="shared" si="3"/></c></row></sheetData>',
    '<sheetData><row r="1"><c r="A1" s="999"><v>1</v></c></row></sheetData>',
    '<sheetData><row r="1"><c r="A1"><v>NaN</v></c></row></sheetData>',
    '<sheetData/><mergeCells><mergeCell ref="A1:B2:C3"/></mergeCells>',
    '<sheetData/><mergeCells><mergeCell ref="A1:B2:"/></mergeCells>',
  ])("rejects malformed sparse state: %s", (sheet) => {
    expect(() => readNativeWorkbook(fixture(sheet))).toThrow();
  });

  test.each(["fontId", "fillId", "borderId", "xfId"])(
    "rejects nonzero %s references when the indexed table is absent",
    (attribute) => {
      const bytes = fixture('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>', {
        "xl/styles.xml": `<styleSheet ${namespace}><cellXfs><xf ${attribute}="1"/></cellXfs></styleSheet>`,
      });
      expect(() => readNativeWorkbook(bytes)).toThrow(/style reference/);
    },
  );

  test.each(["fontId", "fillId", "borderId", "xfId"])(
    "rejects malformed and out-of-table %s indexes",
    (attribute) => {
      for (const index of ["", "-1", "0.5", "NaN", "0x0", "1", "9007199254740992"]) {
        const bytes = fixture('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>', {
          "xl/styles.xml": `<styleSheet ${namespace}><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellStyleXfs><xf/></cellStyleXfs><cellXfs><xf ${attribute}="${index}"/></cellXfs></styleSheet>`,
        });
        expect(() => readNativeWorkbook(bytes), `${attribute}=${index}`).toThrow(/style reference/);
      }
    },
  );

  test("keeps implicit zero defaults and valid base-style inheritance", () => {
    const bytes = fixture('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>', {
      "xl/styles.xml": `<styleSheet ${namespace}><fonts><font/><font><b/></font></fonts><cellStyleXfs><xf fontId="1"/></cellStyleXfs><cellXfs><xf/></cellXfs></styleSheet>`,
    });
    expect(cell(bytes, "A1").style).toEqual({ font: { bold: true } });
    expect(
      cell(
        fixture('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>', {
          "xl/styles.xml": `<styleSheet ${namespace}><cellXfs><xf fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
        }),
        "A1",
      ).style,
    ).toEqual({});
  });

  test("preserves empty table entries and resolves all theme slots without guessing missing colors", () => {
    const bytes = fixture(
      '<sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="2"><v>2</v></c><c r="C1" s="3"><v>3</v></c></row></sheetData>',
      {
        "xl/theme/theme1.xml":
          '<theme xmlns="http://schemas.openxmlformats.org/drawingml/2006/main"><themeElements><clrScheme><hlink><srgbClr val="123456"/></hlink></clrScheme></themeElements></theme>',
        "xl/styles.xml": `<styleSheet ${namespace}><fonts><font/><font><color theme="10"/></font><font><color theme="11"/></font><font><color indexed="63" tint="1"/></font></fonts><cellXfs><xf/><xf fontId="1"/><xf fontId="2"/><xf fontId="3"/></cellXfs></styleSheet>`,
      },
    );
    expect(cell(bytes, "A1").style.font).toEqual({ color: { argb: "FF123456" } });
    expect(cell(bytes, "B1").style.font).toEqual({ color: { theme: 11 } });
    expect(cell(bytes, "C1").style.font).toEqual({ color: { argb: "FFFFFFFF" } });
  });

  test("rejects unsafe XML even in auxiliary parts", () => {
    expect(() =>
      readNativeWorkbook(
        fixture("<sheetData/>", {
          "customXml/item.xml": '<!DOCTYPE x [<!ENTITY boom "expanded">]><x>&boom;</x>',
        }),
      ),
    ).toThrow();
    expect(() =>
      readNativeWorkbook(
        fixture("<sheetData/>", {
          "xl/styles.xml": "<styleSheet><cellXfs></styleSheet>",
        }),
      ),
    ).toThrow();
  });
  test("rejects forbidden numeric character references, excessive nesting and external content", () => {
    for (const xml of ["<x>&#0;</x>", "<x>&#xD800;</x>", "<x>".repeat(129) + "</x>".repeat(129)])
      expect(() =>
        readNativeWorkbook(fixture("<sheetData/>", { "customXml/item.xml": xml })),
      ).toThrow();
    expect(() =>
      readNativeWorkbook(
        fixture("<sheetData/>", {
          "xl/_rels/unsafe.xml.rels": `<Relationships ${relNamespace}><Relationship Id="unsafe" Type="${relType}/externalLink" Target="https://example.org/data" TargetMode="External"/></Relationships>`,
        }),
      ),
    ).toThrow(/External XLSX/);
  });
});
