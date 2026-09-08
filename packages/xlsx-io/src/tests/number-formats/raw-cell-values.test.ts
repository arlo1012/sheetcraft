import { strToU8, zipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { readRawWorksheetNumericValues } from "../../raw-cell-values.js";

describe("raw XLSX cell values", () => {
  test("follows workbook relationship order instead of worksheet filenames or sheet ids", () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        '<workbook xmlns:r="urn:r"><sheets><sheet name="Second" sheetId="9" r:id="rSecond"/><sheet name="First" sheetId="2" r:id="rFirst"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/alpha.xml"/><Relationship Id="rSecond" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/beta.xml"/></Relationships>',
      ),
      "xl/worksheets/alpha.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><v>60</v></c></row></sheetData></worksheet>',
      ),
      "xl/worksheets/beta.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><v>0</v></c></row></sheetData></worksheet>',
      ),
    });

    const values = readRawWorksheetNumericValues(bytes);
    expect(values).toHaveLength(2);
    expect(values[0]?.get("A1")).toBe(0);
    expect(values[1]?.get("A1")).toBe(60);
  });
});
