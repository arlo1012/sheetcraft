import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  createWorkbook,
  getActiveSheet,
  getCellHyperlink,
  getCellNote,
  getCellSparkline,
  setCellContent,
  setCellHyperlink,
  setCellNote,
  setCellSparkline,
} from "@sheetcraft/core/workbook";
import {
  DEFAULT_SHEET_PAGE_PRINT_OPTIONS,
  DEFAULT_SHEET_PAGE_SETUP,
} from "@sheetcraft/core/page-setup";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import {
  appendNativeWorksheetExtension,
  canonicalizeNativeWorksheetXml,
} from "../../native/worksheet-order.js";

function topLevelNames(xml: string): string[] {
  const document = new XMLParser({ preserveOrder: true, ignoreAttributes: false }).parse(
    xml,
  ) as Array<Record<string, unknown>>;
  const root = document.find((node) =>
    Object.keys(node).some((name) => /(?:^|:)worksheet$/.test(name)),
  )!;
  const rootName = Object.keys(root).find((name) => /(?:^|:)worksheet$/.test(name))!;
  return (root[rootName] as Array<Record<string, unknown>>).flatMap((child) => {
    const name = Object.keys(child).find((key) => !key.startsWith(":") && !key.startsWith("#"));
    return name ? [name.split(":").at(-1)!] : [];
  });
}

describe("generated XLSX worksheet child ordering", () => {
  test.each([
    ["", '<extLst><ext uri="added"/></extLst>'],
    ['<extLst keep="yes"/>', '<extLst keep="yes"><ext uri="added"/></extLst>'],
    [
      '<extLst><ext uri="existing"/></extLst>',
      '<extLst><ext uri="existing"/><ext uri="added"/></extLst>',
    ],
  ])("adds an extension only to the top-level list %j", (existing, expected) => {
    const nested =
      '<conditionalFormatting><cfRule><extLst><ext uri="nested"/></extLst></cfRule></conditionalFormatting>';
    const source = `<worksheet>${nested}${existing}</worksheet>`;
    const actual = appendNativeWorksheetExtension(source, '<ext uri="added"/>');
    expect(actual).toBe(`<worksheet>${nested}${expected}</worksheet>`);
    expect(actual.match(/uri="added"/g)).toHaveLength(1);
  });

  test("preserves raw children, namespaces, attributes, nested extensions and repeated rules", () => {
    const prefix =
      '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:q="urn:example" q:keep="a>b">';
    const children = [
      '<x:extLst><x:ext uri="keep"><q:value><![CDATA[<pageSetup fake="yes"/>]]></q:value></x:ext></x:extLst>',
      "<x:headerFooter><x:oddHeader>unchanged &amp; exact</x:oddHeader></x:headerFooter>",
      '<x:tableParts count="1"><x:tablePart q:id="7"/></x:tableParts>',
      '<x:conditionalFormatting sqref="A1"><x:cfRule priority="2"><x:extLst><x:ext uri="nested"/></x:extLst></x:cfRule></x:conditionalFormatting>',
      '<x:drawing q:id="3"/>',
      '<x:conditionalFormatting sqref="B1"><x:cfRule priority="1"/></x:conditionalFormatting>',
      '<x:pageSetup orientation="landscape"/>',
      '<x:sheetData><x:row r="1"><x:c r="A1"><x:is><x:t>&lt;drawing&gt;</x:t></x:is></x:c></x:row><!-- nested comment --></x:sheetData>',
      '<x:mergeCells count="1"><x:mergeCell ref="C1:D1"/></x:mergeCells>',
      '<x:pageMargins left="0.7"/>',
      '<x:printOptions gridLines="1"/>',
      '<x:dataValidations count="1"><x:dataValidation sqref="A1"/></x:dataValidations>',
    ];
    const suffix = "\n</x:worksheet>";
    const source = prefix + children.join("") + suffix;
    const actual = canonicalizeNativeWorksheetXml(source);
    const expectedIndexes = [7, 8, 3, 5, 11, 10, 9, 6, 1, 4, 2, 0];
    expect(actual).toBe(prefix + expectedIndexes.map((index) => children[index]).join("") + suffix);
    expect(XMLValidator.validate(actual)).toBe(true);
    expect(canonicalizeNativeWorksheetXml(actual)).toBe(actual);
  });

  test("orders default public exports with page margins and setup before header/footer", async () => {
    const workbook = createWorkbook({ id: "default-order", sheetId: "sheet" });
    const xml = strFromU8(
      unzipSync((await encodeXlsx(workbook)).bytes)["xl/worksheets/sheet1.xml"]!,
    );
    expect(topLevelNames(xml)).toEqual([
      "dimension",
      "sheetViews",
      "sheetFormatPr",
      "sheetData",
      "pageMargins",
      "pageSetup",
      "headerFooter",
    ]);
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  test("orders rich feature combinations without losing their content or relationships", async () => {
    const workbook = createWorkbook({ id: "rich-order", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (const [row, values] of [
      ["Name", "Amount", "", "Name", "Amount"],
      ["Ada", 10, "", "Ada", 10],
      ["Lin", 20, "", "Lin", 20],
    ].entries())
      values.forEach((value, column) =>
        setCellContent(sheet, { row, column }, { kind: "literal", value }),
      );
    sheet.mergedCells = [{ start: { row: 0, column: 6 }, end: { row: 1, column: 7 } }];
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "Ada" }] }],
    };
    sheet.dataValidations = [
      {
        id: "pick",
        range: { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
        type: "list",
        list: ["yes", "no"],
        allowBlank: true,
      },
    ];
    setCellHyperlink(
      sheet,
      { row: 1, column: 0 },
      { target: "https://example.com/review", tooltip: "Review & approve" },
    );
    setCellNote(sheet, { row: 1, column: 0 }, { text: "Preserved note", author: "Ada" });
    const sparkline = {
      type: "line" as const,
      empty: "gap" as const,
      source: { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      color: "#123456",
      negativeColor: "#654321",
      markers: true,
      axis: true,
      showHidden: true,
    };
    setCellSparkline(sheet, { row: 4, column: 0 }, sparkline);
    sheet.conditionalFormats = [
      {
        id: "positive",
        ranges: [{ start: { row: 1, column: 1 }, end: { row: 2, column: 1 } }],
        anchor: { row: 1, column: 1 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: { fillColor: "#aabbcc" },
      },
      {
        id: "bars",
        ranges: [{ start: { row: 1, column: 4 }, end: { row: 2, column: 4 } }],
        anchor: { row: 1, column: 4 },
        condition: {
          kind: "dataBar",
          minimum: { kind: "min" },
          maximum: { kind: "max" },
          color: "#123456",
          negativeColor: "#654321",
        },
        style: {},
      },
    ];
    sheet.tables = [
      {
        id: "table",
        name: "Sales",
        range: { start: { row: 0, column: 3 }, end: { row: 2, column: 4 } },
        columns: [
          { id: "name", name: "Name" },
          { id: "amount", name: "Amount" },
        ],
        style: createBuiltinTableStyles()[0]!,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: null,
      },
    ];
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      orientation: "landscape",
      header: { left: "Review", center: "&P", right: "" },
      printOptions: { ...DEFAULT_SHEET_PAGE_PRINT_OPTIONS, gridLines: true },
      rowBreaks: [2],
      columnBreaks: [2],
    };
    sheet.floatingImages = [
      {
        id: "picture",
        assetId: "asset",
        altText: "Picture",
        anchor: { row: 4, column: 0 },
        offsetX: 3,
        offsetY: 4,
        width: 70,
        height: 35,
      },
    ];
    sheet.pageDecoration = { backgroundAssetId: "asset" };
    const image = new Uint8Array([137, 80, 78, 71]);
    const encoded = await encodeXlsx(workbook, {
      images: [{ assetId: "asset", bytes: image, extension: "png", width: 70, height: 35 }],
    });
    const entries = unzipSync(encoded.bytes);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(topLevelNames(xml)).toEqual([
      "dimension",
      "sheetViews",
      "sheetFormatPr",
      "sheetData",
      "autoFilter",
      "mergeCells",
      "conditionalFormatting",
      "conditionalFormatting",
      "dataValidations",
      "hyperlinks",
      "printOptions",
      "pageMargins",
      "pageSetup",
      "headerFooter",
      "rowBreaks",
      "colBreaks",
      "drawing",
      "legacyDrawing",
      "picture",
      "tableParts",
      "extLst",
    ]);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('<mergeCell ref="G1:H2"/>');
    expect(xml).toContain("<formula1>&quot;yes,no&quot;</formula1>");
    expect(xml).toContain('tooltip="Review &amp; approve"');
    expect(xml).toContain("<x14:negativeFillColor");
    const parsed = new XMLParser({ removeNSPrefix: true }).parse(xml) as {
      worksheet: { picture?: unknown; extLst?: unknown; conditionalFormatting?: unknown };
    };
    expect(parsed.worksheet.picture).toBeDefined();
    expect(JSON.stringify(parsed.worksheet.extLst)).toContain("sparklineGroups");
    expect(JSON.stringify(parsed.worksheet.extLst)).toContain("conditionalFormattings");
    expect(JSON.stringify(parsed.worksheet.conditionalFormatting)).not.toContain("sparklineGroups");
    expect(JSON.stringify(parsed.worksheet.conditionalFormatting)).not.toContain("picture");
    expect(xml.match(/<x14:sparklineGroups\b/g)).toHaveLength(1);
    expect(entries["xl/media/image1.png"]).toEqual(image);
    expect(strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!)).toContain(
      "https://example.com/review",
    );
    // Drawing/media import is intentionally blocked. Verify supported metadata
    // on the same feature combination without its floating image.
    const noImageWorkbook = {
      ...workbook,
      sheets: new Map([[sheet.id, { ...sheet, floatingImages: [], pageDecoration: {} }]]),
    };
    const restored = getActiveSheet(
      (await decodeXlsx((await encodeXlsx(noImageWorkbook)).bytes)).workbook,
    );
    expect(restored.mergedCells).toEqual(sheet.mergedCells);
    expect(restored.filter).toEqual(sheet.filter);
    expect(restored.dataValidations?.[0]?.list).toEqual(["yes", "no"]);
    expect(restored.conditionalFormats).toHaveLength(2);
    expect(restored.tables?.[0]?.name).toBe("Sales");
    expect(getCellHyperlink(restored, { row: 1, column: 0 })).toMatchObject({
      target: "https://example.com/review",
    });
    expect(getCellNote(restored, { row: 1, column: 0 })).toMatchObject({
      text: "Preserved note",
      author: "Ada",
    });
    expect(getCellSparkline(restored, { row: 4, column: 0 })).toEqual(sparkline);
    expect(restored.pageSetup).toMatchObject({
      orientation: "landscape",
      rowBreaks: [2],
      columnBreaks: [2],
      header: sheet.pageSetup.header,
    });
  });
});
