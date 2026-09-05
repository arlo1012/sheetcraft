import { describe, expect, test } from "vitest";
import {
  formatFormulaReference,
  parseA1FormulaReference,
  parseFormulaReference,
} from "../../../formula/reference-model.js";

const sheetIds = new Map([
  ["Current", "sheet-current"],
  ["Annual Plan", "sheet-plan"],
  ["O'Brien", "sheet-obriens"],
]);

function parse(text: string, startOffset?: number) {
  return parseFormulaReference(text, {
    currentSheetId: "sheet-current",
    resolveSheetId: (sheetName) => sheetIds.get(sheetName),
    startOffset,
  });
}

describe("formula reference model", () => {
  test("parses local A1 references with exact source offsets and markers", () => {
    expect(parseA1FormulaReference("$XFD$1048576", 12)).toEqual({
      row: 1_048_575,
      column: 16_383,
      rowAbsolute: true,
      columnAbsolute: true,
      start: 12,
      end: 24,
    });
    expect(parseA1FormulaReference("A1x")).toBeNull();
    expect(parseA1FormulaReference("XFE1")).toBeNull();
    expect(parseA1FormulaReference("A1048577")).toBeNull();
    expect(parseA1FormulaReference("A0")).toBeNull();
  });

  test("keeps stable sheet ID and address target separate from source spelling", () => {
    expect(parse("$A1:$B$2", 7)).toEqual({
      target: {
        sheetId: "sheet-current",
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
      source: {
        text: "$A1:$B$2",
        start: 7,
        end: 15,
        sheetName: null,
        startReference: {
          row: 0,
          column: 0,
          rowAbsolute: false,
          columnAbsolute: true,
          start: 7,
          end: 10,
        },
        endReference: {
          row: 1,
          column: 1,
          rowAbsolute: true,
          columnAbsolute: true,
          start: 11,
          end: 15,
        },
      },
    });
  });

  test("resolves quoted sheet names, spaces, apostrophes, and ranges", () => {
    expect(parse("'Annual Plan'!A1:B2")?.target).toEqual({
      sheetId: "sheet-plan",
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
    });
    expect(parse("'O''Brien'!$C$3")?.target).toEqual({
      sheetId: "sheet-obriens",
      range: { start: { row: 2, column: 2 }, end: { row: 2, column: 2 } },
    });
  });

  test("formats resolved references using current names and original absolute markers", () => {
    const reference = parse("'O''Brien'!$C3:D$4");
    expect(reference).not.toBeNull();
    expect(
      formatFormulaReference(reference!, (sheetId) => {
        return [...sheetIds].find(([, id]) => id === sheetId)?.[0];
      }),
    ).toBe("'O''Brien'!$C3:D$4");
  });

  test("rejects malformed, unknown, external, structured, and 3D references", () => {
    for (const text of [
      "Missing!A1",
      "Annual Plan!A1",
      "'Annual Plan!A1",
      "Sheet1:Sheet3!A1",
      "[Other.xlsx]Sheet1!A1",
      "Table1[Column]",
      "Sheet1!A1:Sheet1!B2",
      "Sheet1!!A1",
      "A+B!A1",
      "A-B!A1",
      "A(B)!A1",
      "A,B!A1",
    ]) {
      expect(parse(text)).toBeNull();
    }
    for (const text of ["'[Other.xlsx]Sheet1'!A1", "'Sheet1:Sheet2'!A1", "'Bad/Name'!A1"]) {
      expect(
        parseFormulaReference(text, {
          currentSheetId: "sheet-current",
          resolveSheetId: () => "would-resolve-without-validation",
        }),
      ).toBeNull();
    }
  });

  test("round-trips formatted sheet-qualified references through caller-owned resolution", () => {
    const parsed = parse("'Annual Plan'!$A1:B$2");
    expect(parsed).not.toBeNull();
    const formatted = formatFormulaReference(parsed!, (sheetId) => {
      return [...sheetIds].find(([, id]) => id === sheetId)?.[0];
    });
    expect(formatted).toBe("'Annual Plan'!$A1:B$2");
    expect(parse(formatted!)).toEqual(parsed);
  });

  test("formats only valid targets and supported sheet names", () => {
    const reference = parse("'Annual Plan'!A1");
    expect(reference).not.toBeNull();
    expect(formatFormulaReference(reference!, () => "Bad:Name")).toBeNull();
    expect(
      formatFormulaReference(
        {
          ...reference!,
          target: {
            ...reference!.target,
            range: { start: { row: -1, column: 0 }, end: { row: 0, column: 0 } },
          },
        },
        () => "Annual Plan",
      ),
    ).toBeNull();
    expect(
      formatFormulaReference(
        {
          ...reference!,
          target: {
            ...reference!.target,
            range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
          },
        },
        () => "Annual Plan",
      ),
    ).toBeNull();
  });

  test("rejects malformed source provenance while allowing moved targets and renamed sheets", () => {
    const reference = parse("'Annual Plan'!$A1:B$2");
    expect(reference).not.toBeNull();
    expect(
      formatFormulaReference(
        { ...reference!, source: { ...reference!.source, text: "not the source", end: 14 } },
        () => "Annual Plan",
      ),
    ).toBeNull();
    expect(
      formatFormulaReference(
        { ...reference!, source: { ...reference!.source, sheetName: "Other" } },
        () => "Annual Plan",
      ),
    ).toBeNull();
    expect(
      formatFormulaReference(
        {
          ...reference!,
          target: {
            ...reference!.target,
            range: { start: { row: 10, column: 0 }, end: { row: 11, column: 1 } },
          },
        },
        () => "Renamed Plan",
      ),
    ).toBe("'Renamed Plan'!$A11:B$12");
  });
});
