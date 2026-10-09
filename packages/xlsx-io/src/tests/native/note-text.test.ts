import {
  createWorkbook,
  getActiveSheet,
  getCellNote,
  setCellNote,
} from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";

describe("native XLSX note text", () => {
  test("preserves literal OOXML escapes and XML-forbidden controls in note text and authors", async () => {
    const workbook = createWorkbook({ id: "escaped-note", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const note = {
      text: "Literal _x0041_ and _x005F_x0042_ & <tag>\nControl\u0001",
      author: "Reviewer _x0042_ & \u0001",
    };
    setCellNote(sheet, { row: 0, column: 0 }, note);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toEqual([]);
    const entries = unzipSync(encoded.bytes);
    const comments = strFromU8(entries["xl/comments1.xml"]!);
    expect(XMLValidator.validate(comments)).toBe(true);
    expect(comments).toContain("_x005F_x0041_");
    expect(comments).toContain("_x0001_");
    const decoded = await decodeXlsx(encoded.bytes);
    expect(decoded.report.issues).toEqual([]);
    expect(getCellNote(getActiveSheet(decoded.workbook), { row: 0, column: 0 })).toEqual(note);
  });
});
