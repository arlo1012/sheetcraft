import { createMoveCellRangeCommand } from "../../commands/values.js";
import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { buildSheetTextReplacements } from "../../search.js";
import {
  getCellRangeContents,
  getCellRangeValues,
  translateCellContentForCopy,
} from "../../clipboard.js";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet, getCellContent, setCellContent } from "../../workbook.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
const a = { row: 0, column: 0 },
  b = { row: 1, column: 0 };
const fontRuns = [{ start: 0, end: 1, fontFamily: "Symbol" }];
const rich = { kind: "literal" as const, value: "Ω9", fontRuns };
function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  setCellContent(sheet, a, rich);
  return { session, sheet };
}
describe("font-run copy, fill and replacement", () => {
  test("copy clones metadata, scalar values do not carry it", () => {
    const f = fixture(),
      range = { start: a, end: a },
      contents = getCellRangeContents(f.sheet, range);
    expect(translateCellContentForCopy(contents[0]![0]!, a, b)).toEqual(rich);
    expect(getCellRangeValues(f.sheet, range)).toEqual([["Ω9"]]);
    expect(contents[0]![0]).not.toBe(getCellContent(f.sheet, a));
  });
  test.each(["series", "copy", "fillWithoutFormatting"] as const)(
    "%s has explicit font semantics",
    (mode) => {
      const f = fixture(),
        plan = captureCellFill(
          f.session.workbook,
          f.sheet.id,
          { start: a, end: a },
          { start: a, end: b },
        );
      executeWorkbookCommand(f.session, createCellFillCommand(f.session.workbook, plan, mode));
      expect(getCellContent(f.sheet, b)).toEqual({
        kind: "literal",
        value: mode === "copy" ? "Ω9" : "Ω10",
        ...(mode === "fillWithoutFormatting" ? {} : { fontRuns }),
      });
      undoWorkbookCommand(f.session);
      expect(getCellContent(f.sheet, b)).toBeNull();
    },
  );
  test("find replacement returns rich content with unmodified prefix", () => {
    const f = fixture();
    const result = buildSheetTextReplacements(f.sheet, "9", "10");
    expect(result[0]).toMatchObject({
      input: "Ω10",
      content: { kind: "literal", value: "Ω10", fontRuns },
    });
  });
});

test("non-numbered without-format fill strips copied source runs", () => {
  const f = fixture();
  setCellContent(f.sheet, a, { ...rich, value: "Ωx" });
  const plan = captureCellFill(
    f.session.workbook,
    f.sheet.id,
    { start: a, end: a },
    { start: a, end: b },
  );
  executeWorkbookCommand(
    f.session,
    createCellFillCommand(f.session.workbook, plan, "fillWithoutFormatting"),
  );
  expect(getCellContent(f.sheet, b)).toEqual({ kind: "literal", value: "Ωx" });
});

test("multiple find matches preserve intervening runs and raw width/case offsets", () => {
  const f = fixture();
  setCellContent(f.sheet, a, {
    kind: "literal",
    value: "ＡΩa",
    fontRuns: [{ start: 1, end: 2, fontFamily: "Symbol" }],
  });
  expect(buildSheetTextReplacements(f.sheet, "a", "xx")[0]).toMatchObject({
    input: "xxΩxx",
    content: {
      kind: "literal",
      value: "xxΩxx",
      fontRuns: [{ start: 2, end: 3, fontFamily: "Symbol" }],
    },
  });
});

test("cut/move preserves runs and restores both cells", () => {
  const f = fixture();
  setCellContent(f.sheet, b, { kind: "literal", value: "target" });
  executeWorkbookCommand(
    f.session,
    createMoveCellRangeCommand(f.sheet.id, { start: a, end: a }, b),
  );
  expect(getCellContent(f.sheet, b)).toEqual(rich);
  expect(getCellContent(f.sheet, a)).toBeNull();
  undoWorkbookCommand(f.session);
  expect(getCellContent(f.sheet, a)).toEqual(rich);
  expect(getCellContent(f.sheet, b)).toEqual({ kind: "literal", value: "target" });
});

test("format-only fill keeps target text without copying source run coordinates", () => {
  const f = fixture();
  setCellContent(f.sheet, b, {
    kind: "literal",
    value: "Long target",
    fontRuns: [{ start: 5, end: 11, fontFamily: "Arial" }],
  });
  const plan = captureCellFill(
    f.session.workbook,
    f.sheet.id,
    { start: a, end: a },
    { start: a, end: b },
  );
  executeWorkbookCommand(
    f.session,
    createCellFillCommand(f.session.workbook, plan, "fillFormatsOnly"),
  );
  expect(getCellContent(f.sheet, b)).toEqual({ kind: "literal", value: "Long target" });
  undoWorkbookCommand(f.session);
  expect(getCellContent(f.sheet, b)).toMatchObject({
    fontRuns: [{ start: 5, end: 11, fontFamily: "Arial" }],
  });
});
