import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { applyWorkbookCommand, createSetCellContentCommand } from "@sheetcraft/core/commands";
import { getFormulaFunctionMetadata } from "@sheetcraft/core/formula";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
} from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { xlsxFormula } from "../../native/writer-formulas.js";
import { OOXML_FUNCTION_CLASSIFICATION } from "./function-classification.js";

describe("native OOXML future-function names", () => {
  test("classifies every Core function before choosing its OOXML spelling", () => {
    const classified = Object.entries(OOXML_FUNCTION_CLASSIFICATION).flatMap(([prefix, names]) =>
      names.map((name) => ({ prefix, name })),
    );
    const names = classified.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(
      getFormulaFunctionMetadata()
        .map(({ name }) => name)
        .sort(),
    );
    for (const { name, prefix } of classified)
      expect(xlsxFormula(`=${name}(A1)`), name).toBe(`${prefix}${name}(A1)`);
  });

  test.each(OOXML_FUNCTION_CLASSIFICATION["_xlfn."])(
    "serializes the documented _xlfn. marker for %s",
    (name) => {
      expect(xlsxFormula(`=${name}(A1)`)).toBe(`_xlfn.${name}(A1)`);
    },
  );

  test.each(OOXML_FUNCTION_CLASSIFICATION["_xlfn._xlws."])(
    "uses both namespaces for %s",
    (name) => {
      expect(xlsxFormula(`${name}(A1:A3)`)).toBe(`_xlfn._xlws.${name}(A1:A3)`);
    },
  );

  test("marks nested calls while retaining case, spaces and existing prefixes", () => {
    const source =
      '=IFERROR(concat ("CONCAT(""literal"")",TEXTJOIN("",TRUE,A1)),_XLFN._XLWS.FILTER(A1:A3,B1:B3))';
    const expected =
      'IFERROR(_xlfn.concat ("CONCAT(""literal"")",_xlfn.TEXTJOIN("",TRUE,A1)),_XLFN._XLWS.FILTER(A1:A3,B1:B3))';
    expect(xlsxFormula(source)).toBe(expected);
    expect(xlsxFormula(expected)).toBe(expected);
    expect(xlsxFormula('_xlfn.CONCAT("合成"," data")')).toBe('_xlfn.CONCAT("合成"," data")');
  });

  test.each([
    'SUM(A1)+COUNTIF(B:B,"CONCAT(")+CONCATENATE("a","b")',
    "ISO.CEILING(1.2)+NETWORKDAYS.INTL(A1,B1)+WORKDAY.INTL(A1,2)",
    "Unknown(A1)+_xlfn.UNKNOWN(A1)+Namespace.CONCAT(A1)",
    "CONCAT+MyCONCAT(A1)+CONCAT_2(A1)+_CONCAT(A1)+$CONCAT(A1)+\\CONCAT(A1)",
    "表CONCAT(A1)+𐐀CONCAT(A1)+áCONCAT(A1)+CONCAT?(A1)",
    "'CONCAT(''name)'!A1+CONCAT!A1+Sheet!CONCAT(A1)+'Sheet'! CONCAT(A1)",
    "[Book.xlsx]CONCAT(A1)+[Book.xlsx]Sheet!CONCAT(A1)",
    "Table[[#Headers],[CONCAT(A1)]]+Table[CONCAT('] header)]+[@CONCAT(A1)]",
    '"unclosed CONCAT(A1)',
    "[unclosed CONCAT(A1)",
    "'unclosed CONCAT(A1)",
  ])("retains protected literals, references and names: %s", (source) => {
    expect(xlsxFormula(source)).toBe(source);
  });

  test("exports CONCAT with its native marker and correct Core string cache", async () => {
    const workbook = createWorkbook({ id: "concat-interoperability", sheetId: "lab" });
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        "lab",
        { row: 13, column: 1 },
        {
          kind: "formula",
          formula: { source: '=CONCAT("合成"," data")' },
        },
      ),
    );
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const path = "xl/worksheets/sheet1.xml";
    const xml = strFromU8(entries[path]!);
    expect(encoded.report.issues).toEqual([]);
    const cell = /<c\b[^>]*\br="B14"[^>]*>[\s\S]*?<\/c>/.exec(xml)?.[0];
    expect(cell).toContain('t="str"');
    expect(cell).toContain(
      "<f>_xlfn.CONCAT(&quot;合成&quot;,&quot; data&quot;)</f><v>合成 data</v>",
    );
    // Import retains the OOXML source and Core already accepts its namespace.
    // Deliberately replace the cache to prove this is real evaluation after decode.
    entries[path] = strToU8(xml.replace("<v>合成 data</v>", "<v>stale cached text</v>"));
    const decoded = await decodeXlsx(zipSync(entries));
    const sheet = getActiveSheet(decoded.workbook);
    expect(getCellContent(sheet, { row: 13, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: '=_xlfn.CONCAT("合成"," data")' },
    });
    expect(
      createWorkbookEvaluator(decoded.workbook, sheet.id).getComputedValue({ row: 13, column: 1 }),
    ).toBe("合成 data");
    const reencoded = await encodeXlsx(decoded.workbook);
    expect(strFromU8(unzipSync(reencoded.bytes)[path]!)).toBe(xml);
  });

  test("exports XMATCH with its native marker and recomputes its position cache after import", async () => {
    const workbook = createWorkbook({ id: "xmatch-interoperability", sheetId: "lab" });
    for (const [row, value] of [5, 4, 4, 2, 1].entries())
      applyWorkbookCommand(
        workbook,
        createSetCellContentCommand("lab", { row, column: 0 }, { kind: "literal", value }),
      );
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        "lab",
        { row: 13, column: 1 },
        {
          kind: "formula",
          formula: { source: "=XMATCH(4,A1:A5)" },
        },
      ),
    );
    const encoded = await encodeXlsx(workbook);
    const entries = unzipSync(encoded.bytes);
    const path = "xl/worksheets/sheet1.xml";
    const xml = strFromU8(entries[path]!);
    const cell = /<c\b[^>]*\br="B14"[^>]*>[\s\S]*?<\/c>/.exec(xml)![0];
    expect(encoded.report.issues).toEqual([]);
    expect(cell).toContain("<f>_xlfn.XMATCH(4,A1:A5)</f><v>2</v>");
    entries[path] = strToU8(xml.replace(cell, cell.replace("<v>2</v>", "<v>999</v>")));
    const decoded = await decodeXlsx(zipSync(entries));
    const sheet = getActiveSheet(decoded.workbook);
    expect(getCellContent(sheet, { row: 13, column: 1 })).toEqual({
      kind: "formula",
      formula: { source: "=_xlfn.XMATCH(4,A1:A5)" },
    });
    expect(
      createWorkbookEvaluator(decoded.workbook, sheet.id).getComputedValue({ row: 13, column: 1 }),
    ).toBe(2);
    applyWorkbookCommand(
      decoded.workbook,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 6 }),
    );
    const reencoded = await encodeXlsx(decoded.workbook);
    expect(strFromU8(unzipSync(reencoded.bytes)[path]!)).toContain(
      "<f>_xlfn.XMATCH(4,A1:A5)</f><v>3</v>",
    );
    expect(strFromU8(unzipSync(reencoded.bytes)[path]!)).not.toContain("_xlfn._xlfn.");
  });
});
