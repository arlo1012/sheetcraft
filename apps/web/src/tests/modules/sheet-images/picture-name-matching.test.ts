// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  MAX_SHEET_ROWS,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { analyzePictureNameMatches } from "../../../modules/sheet-images/picture-name-matching";

function fixture() {
  const workbook = createWorkbook({ id: "picture-name-matching", sheetId: "sheet" });
  return { workbook, sheet: getActiveSheet(workbook) };
}
const horizontal: CellRange = { start: { row: 2, column: 2 }, end: { row: 2, column: 3 } };

describe("picture filename matching", () => {
  test("prefers an exact filename over a different file's stem", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "report.png" });
    const before = serializeWorkbook(f.workbook);
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["report.png", "report.png.jpg"],
      horizontal,
      "horizontal",
      "before",
    );

    expect(plan.entries).toMatchObject([
      { fileIndex: 0, status: "matched" },
      { fileIndex: 1, status: "unmatched" },
    ]);
    expect(plan.matches).toEqual([
      { fileIndex: 0, nameAddress: { row: 2, column: 2 }, pictureAddress: { row: 3, column: 2 } },
    ]);
    expect(plan.hasConflicts).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("matches trimmed, NFC-normalized and case-folded names with or without the extension", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "  CAFE\u0301  " });
    setCellContent(
      f.sheet,
      { row: 2, column: 3 },
      { kind: "literal", value: " report.final.jpg " },
    );
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["Café.PNG", "Report.Final.JPG"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual(["matched", "matched"]);
    expect(plan.matches.map(({ pictureAddress }) => pictureAddress)).toEqual([
      { row: 3, column: 2 },
      { row: 3, column: 3 },
    ]);
    expect(plan.hasConflicts).toBe(false);
  });

  test.each([
    {
      arrangement: "horizontal",
      placement: "before",
      secondName: { row: 2, column: 3 },
      pictures: [
        { row: 3, column: 3 },
        { row: 3, column: 2 },
      ],
    },
    {
      arrangement: "horizontal",
      placement: "after",
      secondName: { row: 2, column: 3 },
      pictures: [
        { row: 1, column: 3 },
        { row: 1, column: 2 },
      ],
    },
    {
      arrangement: "vertical",
      placement: "before",
      secondName: { row: 3, column: 2 },
      pictures: [
        { row: 3, column: 3 },
        { row: 2, column: 3 },
      ],
    },
    {
      arrangement: "vertical",
      placement: "after",
      secondName: { row: 3, column: 2 },
      pictures: [
        { row: 3, column: 1 },
        { row: 2, column: 1 },
      ],
    },
  ] as const)(
    "keeps file order while locating $placement names for $arrangement placement",
    ({ arrangement, placement, secondName, pictures }) => {
      const f = fixture();
      setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
      setCellContent(f.sheet, secondName, { kind: "literal", value: "beta" });
      const range = { start: { row: 2, column: 2 }, end: secondName };
      const before = serializeWorkbook(f.workbook);
      const plan = analyzePictureNameMatches(
        f.workbook,
        f.sheet.id,
        ["beta.png", "alpha.jpg"],
        range,
        arrangement,
        placement,
      );
      expect(plan.matches).toEqual([
        { fileIndex: 0, nameAddress: secondName, pictureAddress: pictures[0] },
        { fileIndex: 1, nameAddress: { row: 2, column: 2 }, pictureAddress: pictures[1] },
      ]);
      expect(plan.hasConflicts).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("reads computed formula names and numeric values without replacing the source cells", () => {
    const f = fixture();
    setCellContent(
      f.sheet,
      { row: 2, column: 2 },
      { kind: "formula", formula: { source: '="alpha.png"' } },
    );
    setCellContent(f.sheet, { row: 2, column: 3 }, { kind: "literal", value: 123 });
    const before = serializeWorkbook(f.workbook);
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png", "123.jpg"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual(["matched", "matched"]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("allows unmatched files to be skipped without reporting a conflict", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png", "missing.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual(["matched", "unmatched"]);
    expect(plan.matches.map(({ fileIndex }) => fileIndex)).toEqual([0]);
    expect(plan.hasConflicts).toBe(false);
  });

  test("does not resolve duplicate worksheet names by choosing the first cell", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "Café" });
    setCellContent(f.sheet, { row: 2, column: 3 }, { kind: "literal", value: " CAFE\u0301 " });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["café.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries).toMatchObject([{ status: "duplicateName" }]);
    expect(plan.matches).toEqual([]);
    expect(plan.hasConflicts).toBe(true);
  });

  test.each([
    ["alpha.png", "alpha.jpg"],
    ["alpha.png", "ALPHA.PNG"],
  ])("does not choose an arbitrary duplicate file from %s and %s", (first, second) => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      [first, second],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual(["duplicateFile", "duplicateFile"]);
    expect(plan.matches).toEqual([]);
    expect(plan.hasConflicts).toBe(true);
  });

  test("reports conflicts even when another file has a unique usable match", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    setCellContent(f.sheet, { row: 2, column: 3 }, { kind: "literal", value: "beta" });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png", "alpha.jpg", "beta.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual([
      "duplicateFile",
      "duplicateFile",
      "matched",
    ]);
    expect(plan.matches.map(({ fileIndex }) => fileIndex)).toEqual([2]);
    expect(plan.hasConflicts).toBe(true);
  });

  test("places the picture after the full merged name region", () => {
    const f = fixture();
    f.sheet.mergedCells = [{ start: { row: 2, column: 2 }, end: { row: 3, column: 3 } }];
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.matches).toEqual([
      { fileIndex: 0, nameAddress: { row: 2, column: 2 }, pictureAddress: { row: 4, column: 2 } },
    ]);
    expect(plan.hasConflicts).toBe(false);
  });

  test("blocks both files when their adjacent targets resolve to the same merged picture area", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    setCellContent(f.sheet, { row: 2, column: 3 }, { kind: "literal", value: "beta" });
    f.sheet.mergedCells = [{ start: { row: 3, column: 2 }, end: { row: 4, column: 3 } }];
    const before = serializeWorkbook(f.workbook);
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png", "beta.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries.map(({ status }) => status)).toEqual(["invalidTarget", "invalidTarget"]);
    expect(plan.matches).toEqual([]);
    expect(plan.hasConflicts).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["horizontal", "vertical"] as const)(
    "blocks a %s target that would precede the sheet origin",
    (arrangement) => {
      const f = fixture();
      const address = { row: 0, column: 0 };
      setCellContent(f.sheet, address, { kind: "literal", value: "alpha" });
      const plan = analyzePictureNameMatches(
        f.workbook,
        f.sheet.id,
        ["alpha.png"],
        { start: address, end: address },
        arrangement,
        "after",
      );
      expect(plan.entries).toMatchObject([{ status: "invalidTarget" }]);
      expect(plan.matches).toEqual([]);
      expect(plan.hasConflicts).toBe(true);
    },
  );

  test("uses names only from the requested worksheet", () => {
    const f = fixture();
    const other = createSheet("Other names", "other");
    insertSheet(f.workbook, other);
    setCellContent(other, { row: 2, column: 2 }, { kind: "literal", value: "alpha" });
    const plan = analyzePictureNameMatches(
      f.workbook,
      f.sheet.id,
      ["alpha.png"],
      horizontal,
      "horizontal",
      "before",
    );
    expect(plan.entries).toMatchObject([{ status: "unmatched" }]);
    expect(plan.matches).toEqual([]);
    expect(plan.hasConflicts).toBe(false);
  });

  test("keeps fingerprints stable for unrelated edits and changes them when a formula name's computed value changes", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "alpha" });
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "formula", formula: { source: "=A1" } });
    const analyze = () =>
      analyzePictureNameMatches(
        f.workbook,
        f.sheet.id,
        ["alpha.png", "beta.png"],
        horizontal,
        "horizontal",
        "before",
      );
    const initial = analyze();
    expect(analyze().fingerprint).toBe(initial.fingerprint);
    setCellContent(f.sheet, { row: 10, column: 10 }, { kind: "literal", value: "unrelated" });
    expect(analyze().fingerprint).toBe(initial.fingerprint);
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "beta" });
    const before = serializeWorkbook(f.workbook);
    const changed = analyze();
    expect(changed.fingerprint).not.toBe(initial.fingerprint);
    expect(changed.matches.map(({ fileIndex }) => fileIndex)).toEqual([1]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each([
    {
      arrangement: "horizontal",
      range: { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
    },
    {
      arrangement: "vertical",
      range: { start: { row: 1, column: 1 }, end: { row: 1, column: 2 } },
    },
    {
      arrangement: "horizontal",
      range: { start: { row: 2, column: 2 }, end: { row: 2, column: 1 } },
    },
    {
      arrangement: "vertical",
      range: { start: { row: MAX_SHEET_ROWS, column: 0 }, end: { row: MAX_SHEET_ROWS, column: 0 } },
    },
  ] as const)("rejects an invalid $arrangement source range", ({ arrangement, range }) => {
    const f = fixture();
    expect(() =>
      analyzePictureNameMatches(
        f.workbook,
        f.sheet.id,
        ["alpha.png"],
        range,
        arrangement,
        "before",
      ),
    ).toThrow(RangeError);
  });
});
