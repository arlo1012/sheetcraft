import {
  createWorkbook,
  getActiveSheet,
  getCellNote,
  setCellNote,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test("preserves replacement tokens in classic note authors", async () => {
  const workbook = createWorkbook({ id: "literal-note", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const note = {
    text: "Cost $$ | $& | $` | $' | $1 | $2",
    author: "Reviewer $$ | $& | $` | $' | $1 | $2",
  };
  setCellNote(sheet, { row: 0, column: 0 }, note);
  const encoded = await encodeXlsx(workbook);
  const xml = strFromU8(unzipSync(encoded.bytes)["xl/comments1.xml"]!);
  expect(XMLValidator.validate(xml)).toBe(true);
  expect(xml).toContain("<author>Reviewer $$ | $&amp; | $` | $&apos; | $1 | $2</author>");
  const decoded = await decodeXlsx(encoded.bytes);
  expect(getCellNote(getActiveSheet(decoded.workbook), { row: 0, column: 0 })).toEqual(note);
});
