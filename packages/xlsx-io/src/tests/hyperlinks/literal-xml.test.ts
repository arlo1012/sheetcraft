import {
  createWorkbook,
  getActiveSheet,
  getCellHyperlink,
  setCellHyperlink,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in external hyperlink targets and tooltips", async () => {
  const workbook = createWorkbook({ id: "literal-hyperlink", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const hyperlink = {
    target: "https://example.com/$$/$&/$`/$'/$1/$2",
    tooltip: "Cost $$ | $& | $` | $' | $1 | $2",
  };
  setCellHyperlink(sheet, { row: 0, column: 0 }, hyperlink);
  const encoded = await encodeXlsx(workbook);
  const entries = unzipSync(encoded.bytes);
  const relationships = strFromU8(entries["xl/worksheets/_rels/sheet1.xml.rels"]!);
  expect(XMLValidator.validate(relationships)).toBe(true);
  expect(relationships).toContain("https://example.com/$$/$&amp;/$`/$&apos;/$1/$2");
  expect(strFromU8(entries["xl/worksheets/sheet1.xml"]!)).toContain(
    'tooltip="Cost $$ | $&amp; | $` | $&apos; | $1 | $2"',
  );
  const decoded = await decodeXlsx(encoded.bytes);
  expect(getCellHyperlink(getActiveSheet(decoded.workbook), { row: 0, column: 0 })).toEqual(
    hyperlink,
  );
});
