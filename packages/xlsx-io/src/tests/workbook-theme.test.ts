import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { createWorkbook } from "@idea10/core/workbook";
import { decodeXlsx, encodeXlsx } from "../index.js";

describe("XLSX workbook themes", () => {
  test("projects document theme colors and fonts into theme1.xml and restores them", async () => {
    const workbook = createWorkbook({ id: "theme-book", sheetId: "sheet" });
    workbook.theme = {
      id: "custom",
      name: "Custom",
      accentColors: ["#112233", "#223344", "#334455", "#445566", "#556677", "#667788"],
      headingFont: "Georgia",
      bodyFont: "Arial",
    };
    const encoded = await encodeXlsx(workbook);
    expect(strFromU8(unzipSync(encoded.bytes)["xl/theme/theme1.xml"]!)).toContain('val="112233"');
    expect((await decodeXlsx(encoded.bytes)).workbook.theme).toEqual(workbook.theme);
  });
});
