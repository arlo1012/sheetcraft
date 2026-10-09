import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in defined-name comments and sheet references", async () => {
  const workbook = createWorkbook({
    id: "literal-name",
    sheetId: "sheet",
    sheetName: "Data $$ $& $` $' $1",
  });
  const sheet = getActiveSheet(workbook);
  const comment = "Cost $$ | $& | $` | $' | $1 | $2";
  workbook.definedNames.set("input", {
    id: "input",
    name: "Input",
    comment,
    reference: {
      sheetId: sheet.id,
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    },
  });
  const encoded = await encodeXlsx(workbook);
  const xml = strFromU8(unzipSync(encoded.bytes)["xl/workbook.xml"]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(xml).toContain('comment="Cost $$ | $&amp; | $` | $&apos; | $1 | $2"');
  expect(xml).toContain("&apos;Data $$ $&amp; $` $&apos;&apos; $1&apos;!$A$1:$B$2");
  const decoded = await decodeXlsx(encoded.bytes);
  expect(getActiveSheet(decoded.workbook).name).toBe(sheet.name);
  expect([...decoded.workbook.definedNames.values()]).toEqual([
    expect.objectContaining({
      comment,
      reference: expect.objectContaining({
        start: { row: 0, column: 0 },
        end: { row: 1, column: 1 },
      }),
    }),
  ]);
});
