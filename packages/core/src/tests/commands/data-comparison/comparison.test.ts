import { describe, expect, test } from "vitest";
import { compareData } from "../../../commands/index.js";
import { getActiveSheet, setCellContent } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

function setValues(
  sheet: ReturnType<typeof getActiveSheet>,
  rows: Array<Array<string | number | null>>,
): void {
  rows.forEach((values, row) =>
    values.forEach((value, column) => {
      setCellContent(sheet, { row, column }, value === null ? null : { kind: "literal", value });
    }),
  );
}

describe("data comparison matching", () => {
  test("compares partial blank row keys and preserves all matching rows in source order", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = { ...first, id: "second", name: "Second", cells: new Map() };
    session.workbook.sheets.set(second.id, second);
    setValues(first, [
      ["Name", "Code"],
      ["Ada", null],
      ["skip", null],
      [null, null],
    ]);
    setValues(second, [
      ["Name", "Code"],
      ["ada", ""],
      ["Cara", 3],
    ]);
    const result = compareData(session.workbook, {
      source: {
        sheetId: first.id,
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      },
      comparison: {
        sheetId: second.id,
        range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      },
      mode: "rows",
      columns: [0, 1],
      hasHeader: true,
      match: "duplicate",
      side: "both",
    });
    expect(result.matches.map((match) => [match.side, match.addresses[0]?.row])).toEqual([
      ["first", 1],
      ["second", 1],
    ]);
  });

  test("uses structured row keys so embedded separators cannot collide", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setValues(sheet, [
      ["a\u001fb", "c"],
      ["a", "b\u001fc"],
    ]);
    const result = compareData(session.workbook, {
      source: {
        sheetId: sheet.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      },
      mode: "rows",
      columns: [0, 1],
      hasHeader: false,
      match: "duplicate",
      side: "first",
    });
    expect(result.matches).toEqual([]);
  });

  test("ignores columns for cell comparison and validates row range width and key offsets", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setValues(sheet, [["a"], ["A"]]);
    expect(
      compareData(session.workbook, {
        source: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        mode: "cells",
        columns: [-10],
        hasHeader: false,
        match: "duplicate",
        side: "first",
      }).matches,
    ).toHaveLength(2);
    expect(() =>
      compareData(session.workbook, {
        source: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        },
        comparison: {
          sheetId: sheet.id,
          range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        },
        mode: "rows",
        hasHeader: false,
        match: "duplicate",
        side: "first",
      }),
    ).toThrow(/Row comparison ranges/);
  });
});
