import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellHyperlink,
  getCellContent,
  getCellNamedStyle,
  getCellStyle,
  setCellStyle,
} from "@idea10/core/workbook";
import { createClearCellStylePatch } from "@idea10/core/style";
import {
  applySetWorkbookCellStylesCommand,
  createApplyCellStyleCommand,
  createSetWorkbookCellStylesCommand,
} from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";
import { readXlsxCellStyles } from "../cell-styles.js";
import { readXlsxHyperlinks, writeXlsxHyperlinks } from "../hyperlinks.js";
import { materializeXlsxStyleColors } from "../xlsx-colors.js";

describe("named cell styles", () => {
  test("writes and restores a custom style through cellStyleXfs and cellStyles", async () => {
    const workbook = createWorkbook({ id: "cell-styles", sheetId: "sheet" });
    workbook.cellStyles = [
      {
        id: "accent",
        name: "Accent heading",
        category: "custom",
        style: {
          bold: true,
          textColor: "#ffffff",
          fillColor: "#4472c4",
          horizontalAlign: "center",
          wrapText: true,
          numberFormat: { kind: "custom", code: "0.00" },
          borderBottom: { style: "thin", color: "#203864" },
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(xml).toContain('<cellStyle name="Accent heading" xfId="1"/>');
    expect(xml).toContain('<cellStyleXfs count="2">');
    expect(readXlsxCellStyles(unzipSync(encoded.bytes)["xl/styles.xml"])).toHaveLength(1);

    const restored = await decodeXlsx(encoded.bytes);
    expect(restored.workbook.cellStyles).toEqual([
      expect.objectContaining({
        id: "xlsx-cell-style-Accent heading",
        name: "Accent heading",
        category: "custom",
        style: expect.objectContaining({
          bold: true,
          textColor: "#FFFFFF",
          fillColor: "#4472C4",
          horizontalAlign: "center",
          wrapText: true,
          numberFormat: {
            kind: "number",
            fractionDigits: 2,
            useGrouping: false,
          },
          borderBottom: { style: "thin", color: "#203864" },
        }),
      }),
    ]);
  });

  test("roundtrips a blank custom style as an explicit clearing patch", async () => {
    const workbook = createWorkbook({
      id: "blank-cell-style",
      sheetId: "sheet",
    });
    workbook.cellStyles = [
      {
        id: "blank",
        name: "Blank custom style",
        category: "custom",
        style: createClearCellStylePatch(),
      },
    ];

    const restored = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    const blank = restored.workbook.cellStyles?.[0];
    expect(blank?.id).toBe("xlsx-cell-style-Blank custom style");
    const sheet = getActiveSheet(restored.workbook);
    const target = { row: 0, column: 0 };
    setCellStyle(sheet, target, { bold: true, fillColor: "#4472c4" });
    const session = createWorkbookSession({
      workbook: restored.workbook,
      idFactory: () => "id",
    });
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(sheet.id, { start: target, end: target }, blank!),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, target)).toBeUndefined();
  });

  test("preserves named-style provenance and real worksheet hyperlinks", async () => {
    const workbook = createWorkbook({ id: "linked-style", sheetId: "sheet" });
    workbook.cellStyles = [
      {
        id: "accent",
        name: "Accent heading",
        category: "custom",
        includes: ["font", "fill"],
        style: { bold: true, fillColor: "#4472c4" },
      },
    ];
    const sheet = getActiveSheet(workbook);
    sheet.cells.set("0:0", {
      content: { kind: "literal", value: "Open report" },
      style: { bold: true, fillColor: "#4472c4" },
      namedStyle: { styleId: "accent", includes: ["font", "fill"] },
      hyperlink: {
        target: "https://example.test/report",
        tooltip: "Open report",
      },
    });
    sheet.cells.set("1:0", {
      content: { kind: "literal", value: "Go home" },
      hyperlink: { target: "#Sheet1!A1" },
    });
    sheet.cells.set("2:0", {
      content: { kind: "formula", formula: { source: "=1+1" } },
      hyperlink: { target: "mailto:report@example.test" },
    });
    expect(getCellNamedStyle(sheet, { row: 0, column: 0 })).toBeDefined();

    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const styles = strFromU8(entries["xl/styles.xml"]!);
    const worksheet = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(styles).toContain('applyFont="1"');
    expect(styles).toContain('applyFill="1"');
    expect(worksheet).toContain("<hyperlinks>");
    expect(worksheet).toContain('location="Sheet1!A1"');
    expect(strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!)).toContain(
      'Target="https://example.test/report"',
    );

    const restored = await decodeXlsx(encoded.bytes);
    const restoredSheet = getActiveSheet(restored.workbook);
    expect(getCellNamedStyle(restoredSheet, { row: 0, column: 0 })).toEqual(
      expect.objectContaining({ styleId: "xlsx-cell-style-Accent heading" }),
    );
    const updatedStyles = restored.workbook.cellStyles!.map((definition) => ({
      ...definition,
      style: { ...definition.style, fillColor: "#112233" },
    }));
    applySetWorkbookCellStylesCommand(
      restored.workbook,
      createSetWorkbookCellStylesCommand(updatedStyles),
    );
    expect(getCellStyle(restoredSheet, { row: 0, column: 0 })).toMatchObject({
      fillColor: "#112233",
    });
    expect(getCellHyperlink(restoredSheet, { row: 0, column: 0 })).toEqual({
      target: "https://example.test/report",
      tooltip: "Open report",
    });
    expect(getCellHyperlink(restoredSheet, { row: 1, column: 0 })).toEqual({
      target: "#Sheet1!A1",
    });
    expect(getCellContent(restoredSheet, { row: 2, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=1+1" },
    });
    expect(getCellHyperlink(restoredSheet, { row: 2, column: 0 })).toEqual({
      target: "mailto:report@example.test",
    });
  });

  test("materializes theme and indexed named-style colors to RGB", () => {
    const styles = strToU8(
      `<?xml version="1.0"?><styleSheet><fonts count="2"><font/><font><color theme="4" tint="-0.25"/></font></fonts><fills count="3"><fill/><fill/><fill><patternFill patternType="solid"><fgColor indexed="10"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellStyleXfs><cellStyles count="2"><cellStyle name="Normal" xfId="0" builtinId="0"/><cellStyle name="Theme" xfId="1"/></cellStyles></styleSheet>`,
    );
    const theme = strToU8(
      `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="test"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="336699"/></a:accent1><a:accent2><a:srgbClr val="000000"/></a:accent2><a:accent3><a:srgbClr val="000000"/></a:accent3><a:accent4><a:srgbClr val="000000"/></a:accent4><a:accent5><a:srgbClr val="000000"/></a:accent5><a:accent6><a:srgbClr val="000000"/></a:accent6></a:clrScheme></a:themeElements></a:theme>`,
    );
    expect(readXlsxCellStyles(styles, theme)[0]?.style).toMatchObject({
      textColor: "#264C73",
      fillColor: "#FF0000",
    });
  });

  test("uses HSL lightness for theme tints", () => {
    const styles = `<styleSheet><fonts><font><color theme="4" tint="0.5"/></font><font><color theme="4" tint="-0.5"/></font></fonts></styleSheet>`;
    const theme = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:clrScheme><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:accent1><a:srgbClr val="FF0000"/></a:accent1><a:accent2><a:srgbClr val="000000"/></a:accent2><a:accent3><a:srgbClr val="000000"/></a:accent3><a:accent4><a:srgbClr val="000000"/></a:accent4><a:accent5><a:srgbClr val="000000"/></a:accent5><a:accent6><a:srgbClr val="000000"/></a:accent6></a:clrScheme></a:theme>`;
    expect(materializeXlsxStyleColors(styles, theme)).toContain('rgb="FFFF8080"');
    expect(materializeXlsxStyleColors(styles, theme)).toContain('rgb="FF800000"');
  });

  test("adds hyperlinks after validations without colliding with existing relationships", () => {
    const workbook = createWorkbook({
      id: "hyperlink-relations",
      sheetId: "sheet",
    });
    const sheet = getActiveSheet(workbook);
    sheet.cells.set("0:0", {
      content: { kind: "literal", value: "Open" },
      hyperlink: { target: "https://example.test" },
    });
    const entries = {
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData/><dataValidations count="0"></dataValidations><pageMargins/></worksheet>',
      ),
      "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x/drawing" Target="../drawings/drawing1.xml"/><Relationship Id="rId2" Type="x/table" Target="../tables/table1.xml"/></Relationships>',
      ),
    };
    writeXlsxHyperlinks(entries, [sheet]);
    const worksheet = strFromU8(entries["xl/worksheets/sheet1.xml"]);
    const relationships = strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]);
    expect(relationships).toContain('Id="rId3"');
    expect(worksheet.indexOf("</dataValidations>")).toBeLessThan(worksheet.indexOf("<hyperlinks>"));
    expect(worksheet.indexOf("<hyperlinks>")).toBeLessThan(worksheet.indexOf("<pageMargins"));
  });

  test("expands safe hyperlink ranges and reports oversized ranges", () => {
    const entries = {
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><hyperlinks><hyperlink ref="A1:B1" location="Sheet1!A1"/><hyperlink ref="A1:XFD1048576" location="Sheet1!A1"/></hyperlinks></worksheet>',
      ),
    };
    const unsupported: string[] = [];
    const links = readXlsxHyperlinks(entries, (_sheet, reference) => unsupported.push(reference));
    expect([...links[0]!.keys()]).toEqual(["A1", "B1"]);
    expect(unsupported).toEqual(["A1:XFD1048576"]);
  });
});
