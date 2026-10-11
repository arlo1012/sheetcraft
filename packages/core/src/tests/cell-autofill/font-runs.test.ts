import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet, getCellContent, setCellContent, setCellStyle } from "../../workbook.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";

const source = { row: 0, column: 0 },
  target = { row: 1, column: 0 };
describe("protected autofill font runs", () => {
  test.each(["copy", "series", "fillWithoutFormatting"] as const)(
    "%s maps surviving destination fonts without copying source fonts",
    (mode) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      setCellContent(sheet, source, {
        kind: "literal",
        value: "Ω9",
        fontRuns: [{ start: 0, end: 1, fontFamily: "Symbol" }],
      });
      const original = {
        kind: "literal" as const,
        value: "Ω8",
        fontRuns: [{ start: 0, end: 1, fontFamily: "Arial" }],
      };
      setCellContent(sheet, target, original);
      setCellStyle(sheet, target, { unlocked: true });
      sheet.properties.protected = true;
      const plan = captureCellFill(
        session.workbook,
        sheet.id,
        { start: source, end: source },
        { start: source, end: target },
      );
      executeWorkbookCommand(session, createCellFillCommand(session.workbook, plan, mode));
      const expected = { ...original, value: mode === "copy" ? "Ω9" : "Ω10" };
      expect(getCellContent(sheet, target)).toEqual(expected);
      undoWorkbookCommand(session);
      expect(getCellContent(sheet, target)).toEqual(original);
      redoWorkbookCommand(session);
      expect(getCellContent(sheet, target)).toEqual(expected);
    },
  );
  test("copy shifts destination fonts and leaves newly filled characters plain", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, source, {
      kind: "literal",
      value: "xΩD",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Symbol" }],
    });
    setCellContent(sheet, target, {
      kind: "literal",
      value: "ΩD",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Arial" }],
    });
    setCellStyle(sheet, target, { unlocked: true });
    sheet.properties.protected = true;
    const plan = captureCellFill(
      session.workbook,
      sheet.id,
      { start: source, end: source },
      { start: source, end: target },
    );
    executeWorkbookCommand(session, createCellFillCommand(session.workbook, plan, "copy"));
    expect(getCellContent(sheet, target)).toEqual({
      kind: "literal",
      value: "xΩD",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Arial" }],
    });
  });
  test("plain destinations never acquire copied source fonts", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, source, {
      kind: "literal",
      value: "Ω9",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Symbol" }],
    });
    setCellStyle(sheet, target, { unlocked: true });
    sheet.properties.protected = true;
    const plan = captureCellFill(
      session.workbook,
      sheet.id,
      { start: source, end: source },
      { start: source, end: target },
    );
    executeWorkbookCommand(session, createCellFillCommand(session.workbook, plan, "copy"));
    expect(getCellContent(sheet, target)).toEqual({ kind: "literal", value: "Ω9" });
  });
});
