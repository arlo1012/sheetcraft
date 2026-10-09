import { describe, expect, test } from "vitest";
import { strToU8 } from "fflate/browser";
import { readXlsxWorksheetPartTargets } from "../raw-cell-values.js";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const pkg = "http://schemas.openxmlformats.org/package/2006/relationships";
function entries(target: string, mode = "") {
  return {
    "xl/workbook.xml": strToU8(
      `<s:workbook xmlns:s="${main}" xmlns:link="${rel}"><s:sheets><s:sheet name="A" sheetId="1" link:id="one"/></s:sheets></s:workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<p:Relationships xmlns:p="${pkg}"><p:Relationship Id="one" Type="${rel}/worksheet" Target="${target}"${mode}/></p:Relationships>`,
    ),
  };
}

describe("namespace-aware worksheet-part discovery", () => {
  test("preserves workbook sheet order with independent element and attribute prefixes", () => {
    const parts = entries("worksheets/a.xml");
    parts["xl/workbook.xml"] = strToU8(
      `<s:workbook xmlns:s="${main}" xmlns:link="${rel}"><s:sheets><s:sheet name="B" sheetId="2" link:id="two"/><s:sheet name="A" sheetId="1" link:id="one"/></s:sheets></s:workbook>`,
    );
    parts["xl/_rels/workbook.xml.rels"] = strToU8(
      `<p:Relationships xmlns:p="${pkg}"><p:Relationship Id="one" Type="${rel}/worksheet" Target="worksheets/a.xml"/><p:Relationship Id="two" Type="${rel}/worksheet" Target="/xl/worksheets/b.xml"/></p:Relationships>`,
    );
    expect(readXlsxWorksheetPartTargets(parts)).toEqual([
      "xl/worksheets/b.xml",
      "xl/worksheets/a.xml",
    ]);
  });

  test("ignores external worksheet relationships", () => {
    expect(
      readXlsxWorksheetPartTargets(
        entries("https://example.com/sheet.xml", ' TargetMode="External"'),
      ),
    ).toEqual([]);
  });

  test("resolves legal package-local parent segments", () => {
    expect(readXlsxWorksheetPartTargets(entries("../xl/worksheets/a.xml"))).toEqual([
      "xl/worksheets/a.xml",
    ]);
  });

  test.each([
    "https://example.com/sheet.xml",
    "../../../xl/worksheets/a.xml",
    "worksheets\\a.xml",
    "worksheets/a.xml?query=1",
    "worksheets/a.xml#fragment",
  ])("rejects unsafe internal worksheet target %s", (target) => {
    expect(() => readXlsxWorksheetPartTargets(entries(target))).toThrow();
  });

  test("rejects DTD declarations instead of parsing entities", () => {
    const parts = entries("worksheets/a.xml");
    parts["xl/workbook.xml"] = strToU8('<!DOCTYPE workbook [<!ENTITY name "unsafe">]><workbook/>');
    expect(() => readXlsxWorksheetPartTargets(parts)).toThrow();
  });
});
