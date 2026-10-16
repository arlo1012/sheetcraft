import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("export diagnoses per-cell font runs and hidden legacy pictures precisely without editing the document", async () => {
  const workbook = createWorkbook({ id: "loss", sheetId: "s", sheetName: "Data" }),
    sheet = getActiveSheet(workbook);
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    { kind: "literal", value: "AΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Symbol" }] },
  );
  sheet.floatingImages = [
    {
      id: "hidden",
      assetId: "not-read",
      altText: "Hidden",
      anchor: { row: 1, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 20,
      height: 20,
      hidden: true,
    },
  ];
  const before = serializeWorkbook(workbook),
    encoded = await encodeXlsx(workbook);
  expect(serializeWorkbook(workbook)).toEqual(before);
  expect(encoded.report.issues).toEqual(
    expect.arrayContaining([
      { code: "style-omitted", severity: "warning", count: 1, locations: ["Data!A1.fontRuns"] },
      {
        code: "image-omitted",
        severity: "warning",
        count: 1,
        locations: ['Data.floatingImages["hidden"].hidden'],
      },
    ]),
  );
});

test("import reports styled shared and inline text runs once per cell while keeping the text", async () => {
  const workbook = createWorkbook({ id: "loss", sheetId: "s", sheetName: "Data" }),
    sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "AΩ" });
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Text" });
  const entries = unzipSync((await encodeXlsx(workbook)).bytes);
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  entries["xl/sharedStrings.xml"] = strToU8(
    `<sst ${ns}><si><r><rPr><rFont val="Symbol"/></rPr><t>AΩ</t></r></si></sst>`,
  );
  const rel = "xl/_rels/workbook.xml.rels";
  entries[rel] = strToU8(
    strFromU8(entries[rel]!).replace(
      "</Relationships>",
      '<Relationship Id="textRuns" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    ),
  );
  entries["xl/worksheets/sheet1.xml"] = strToU8(
    strFromU8(entries["xl/worksheets/sheet1.xml"]!)
      .replace(/<c r="A1"[^>]*>.*?<\/c>/s, '<c r="A1" t="s"><v>0</v></c>')
      .replace(
        /<c r="B1"[^>]*>.*?<\/c>/s,
        '<c r="B1" t="inlineStr"><is><r><rPr><b/></rPr><t>Text</t></r><r><rPr><i/></rPr><t>!</t></r></is></c>',
      ),
  );
  const decoded = await decodeXlsx(zipSync(entries));
  expect(getCellContent(getActiveSheet(decoded.workbook), { row: 0, column: 0 })).toEqual({
    kind: "literal",
    value: "AΩ",
  });
  expect(getCellContent(getActiveSheet(decoded.workbook), { row: 0, column: 1 })).toEqual({
    kind: "literal",
    value: "Text!",
  });
  expect(decoded.report.issues).toContainEqual({
    code: "style-omitted",
    severity: "warning",
    count: 2,
    locations: ["Data!A1.fontRuns", "Data!B1.fontRuns"],
  });
});
