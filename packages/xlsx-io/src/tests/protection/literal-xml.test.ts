import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in protected-range names", async () => {
  const workbook = createWorkbook({ id: "literal-protection", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.properties.protected = true;
  sheet.protection = {
    editableRanges: [
      {
        name: "Cost $$ | $& | $` | $' | $1 | $2",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
    ],
  };
  const encoded = await encodeXlsx(workbook);
  const xml = strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(xml).toContain('name="Cost $$ | $&amp; | $` | $&apos; | $1 | $2"');
  expect(xml.match(/<protectedRange\b/g)).toHaveLength(1);
  const decoded = await decodeXlsx(encoded.bytes);
  expect(getActiveSheet(decoded.workbook).protection).toEqual(sheet.protection);
});
