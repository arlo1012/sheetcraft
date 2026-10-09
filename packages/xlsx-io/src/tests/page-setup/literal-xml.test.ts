import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync, zipSync } from "fflate/browser";
import { expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { writeXlsxPageSetups } from "../../page-setup.js";

test.each(["insert", "replace"])(
  "preserves replacement tokens when %s writes header and footer text",
  async (mode) => {
    const workbook = createWorkbook({ id: "literal-page", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    const text = "Cost $$ | $& | $` | $' | $1 | $2";
    sheet.pageSetup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      header: { left: text, center: "", right: "" },
      footer: { left: "", center: text, right: "" },
    };
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    if (mode === "replace") writeXlsxPageSetups(entries, [sheet.pageSetup]);
    const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain("Cost $$ | $&amp; | $` | $&apos; | $1 | $2");
    expect(xml.match(/<headerFooter\b/g)).toHaveLength(1);
    const decoded = await decodeXlsx(zipSync(entries));
    expect(getActiveSheet(decoded.workbook).pageSetup).toMatchObject({
      header: sheet.pageSetup.header,
      footer: sheet.pageSetup.footer,
    });
  },
);
