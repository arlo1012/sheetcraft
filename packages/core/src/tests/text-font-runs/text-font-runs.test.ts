import { describe, expect, test } from "vitest";
import {
  normalizeCellTextFontRuns,
  replaceCellTextRange,
  getCellTextFontOverride,
  getCellTextFontSegments,
} from "../../text-font-runs.js";
import {
  getActiveSheet,
  getCellContent,
  getCellValue,
  setCellContent,
  createSheetSparseState,
  cloneCellContent,
} from "../../workbook.js";
import type { CellContent, CellTextLiteralContent } from "../../formula/types.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { createTestWorkbookSession, createTestSheet } from "../helpers.js";

const address = { row: 0, column: 0 };
const run = (start: number, end: number, fontFamily = "Symbol") => ({ start, end, fontFamily });

describe("cell text font runs", () => {
  test("normalizes adjacency without discarding explicit choices or sharing inputs", () => {
    const input = [run(0, 1, " Arial "), run(1, 2, "Arial"), run(3, 4)];
    const result = normalizeCellTextFontRuns("ABCD", input);
    expect(result).toEqual([run(0, 2, "Arial"), run(3, 4)]);
    input[2]!.fontFamily = "Changed";
    expect(result![1]!.fontFamily).toBe("Symbol");
    expect(normalizeCellTextFontRuns("", [])).toBeUndefined();
  });

  test.each([
    null,
    {},
    [null],
    [run(-1, 1)],
    [run(0, 0)],
    [run(0, 5)],
    [run(0, 1.5)],
    [run(0, Infinity)],
    [run(NaN, 1)],
    [run(2, 3), run(0, 1)],
    [run(0, 3), run(2, 4)],
    [run(0, 1, " ")],
    [run(0, 1, "a".repeat(257))],
    [{ start: 0, end: 1, fontFamily: 1 }],
    [{ start: 0, end: 1 }],
    [{ ...run(0, 1), bold: true }],
  ])("rejects malformed metadata %#", (value) => {
    expect(() => normalizeCellTextFontRuns("ABCD", value)).toThrow();
  });

  test.each([
    { kind: "literal", value: 1 },
    { kind: "literal", value: true },
    { kind: "literal", value: null },
    { kind: "formula", formula: { source: "=1" } },
    { kind: "error", error: { kind: "formula-error", code: "NA" } },
    { kind: "image", image: { assetId: "asset", altText: "" } },
  ])("rejects fontRuns on non-text content %#", (content) => {
    for (const fontRuns of [[], undefined]) {
      expect(() =>
        setCellContent(createTestSheet(), address, { ...content, fontRuns } as CellContent),
      ).toThrow();
      expect(() =>
        createSetCellContentCommand("sheet", address, { ...content, fontRuns } as CellContent),
      ).toThrow();
    }
  });

  test("preserves scalar calculation and isolates input, reads, clones and sparse state", () => {
    const sheet = createTestSheet();
    const content = { kind: "literal" as const, value: "AΩD", fontRuns: [run(1, 2)] };
    setCellContent(sheet, address, content);
    content.fontRuns[0]!.fontFamily = "Changed";
    expect(getCellValue(sheet, address)).toBe("AΩD");
    const read = getCellContent(sheet, address) as CellTextLiteralContent;
    const cloned = cloneCellContent(read) as CellTextLiteralContent;
    const sparse = createSheetSparseState(sheet).cells[0]!.content as CellTextLiteralContent;
    for (const copy of [read, cloned, sparse])
      (copy.fontRuns![0] as { fontFamily: string }).fontFamily = "Changed";
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: "AΩD",
      fontRuns: [run(1, 2)],
    });
  });

  test("same-text font changes replace identity, record one history entry, and undo/redo independently", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const before = { kind: "literal" as const, value: "Ω", fontRuns: [run(0, 1, "Arial")] };
    setCellContent(sheet, address, before);
    const previous = [...sheet.cells.values()][0];
    const input = { kind: "literal" as const, value: "Ω", fontRuns: [run(0, 1)] };
    const command = createSetCellContentCommand(sheet.id, address, input);
    input.fontRuns[0]!.fontFamily = "Changed";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect([...sheet.cells.values()][0]).not.toBe(previous);
    expect(session.history.undoStack).toHaveLength(1);
    expect(executeWorkbookCommand(session, command)).toBe(false);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, address)).toEqual(before);
    before.fontRuns[0]!.fontFamily = "Mutated original";
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: "Ω",
      fontRuns: [run(0, 1)],
    });
  });

  test("replaces a range, clips and shifts existing overrides, and merges after deletion", () => {
    const document = { text: "ABCDEFGH", fontRuns: [run(0, 3, "Arial"), run(4, 8, "Other")] };
    expect(replaceCellTextRange(document, 2, 6, "Ω", "Symbol")).toEqual({
      text: "ABΩGH",
      caret: 3,
      fontRuns: [run(0, 2, "Arial"), run(2, 3), run(3, 5, "Other")],
    });
    expect(replaceCellTextRange({ text: "ABCD", fontRuns: [run(0, 4)] }, 1, 3, "")).toEqual({
      text: "AD",
      caret: 1,
      fontRuns: [run(0, 2)],
    });
    expect(replaceCellTextRange({ text: "AB", fontRuns: [run(0, 2)] }, 1, 1, "x")).toEqual({
      text: "AxB",
      caret: 2,
      fontRuns: [run(0, 1), run(2, 3)],
    });
    expect(replaceCellTextRange(document, 0, 8, "")).toEqual({ text: "", caret: 0 });
    expect(document.fontRuns).toEqual([run(0, 3, "Arial"), run(4, 8, "Other")]);
  });

  test("uses UTF-16 scalar boundaries and explicit affinity", () => {
    const document = { text: "A🙂B", fontRuns: [run(1, 3)] };
    expect(normalizeCellTextFontRuns(document.text, document.fontRuns)).toEqual(document.fontRuns);
    expect(() => normalizeCellTextFontRuns(document.text, [run(1, 2)])).toThrow();
    expect(() => replaceCellTextRange(document, 2, 3, "")).toThrow();
    expect(replaceCellTextRange(document, 1, 3, "Ω", "Other").fontRuns).toEqual([
      run(1, 2, "Other"),
    ]);
    expect(getCellTextFontOverride(document, 1, "backward")).toBeUndefined();
    expect(getCellTextFontOverride(document, 1, "forward")).toBe("Symbol");
    expect(getCellTextFontSegments(document)).toEqual([
      { start: 0, end: 1, text: "A" },
      { ...run(1, 3), text: "🙂" },
      { start: 3, end: 4, text: "B" },
    ]);
  });
});
