// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createRenameSheetCommand,
  type WorkbookCommand,
} from "../../commands/index.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createSparklineSeriesResolver, type CellSparkline } from "../../sparklines.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
  setCellContent,
  setCellSparkline,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const position = { row: 10, column: 10 };
function fixture() {
  const session = createTestWorkbookSession();
  const owner = getActiveSheet(session.workbook);
  owner.name = "Metrics & Data";
  const dates = createSheet("O'Brien Dates", "calendar-stable-id");
  insertSheet(session.workbook, dates);
  [30, 10, 20].forEach((value, index) => {
    setCellContent(owner, { row: 5, column: index + 1 }, { kind: "literal", value });
  });
  [45003, 45001, 45002].forEach((value, index) => {
    setCellContent(dates, { row: 1, column: index + 1 }, { kind: "literal", value });
    setCellContent(owner, { row: 1, column: index + 1 }, { kind: "literal", value: 99999 });
  });
  const sparkline: CellSparkline = {
    type: "line",
    source: { start: { row: 5, column: 1 }, end: { row: 5, column: 3 } },
    dateSheetId: dates.id,
    dateRange: {
      start: { row: 1, column: 1, rowAbsolute: true, columnAbsolute: true },
      end: { row: 1, column: 3, rowAbsolute: true, columnAbsolute: true },
    },
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
  setCellSparkline(owner, position, sparkline);
  const current = () => getCellSparkline(session.workbook.sheets.get(owner.id)!, position)!;
  const read = () =>
    createSparklineSeriesResolver(
      session.workbook.sheets.get(owner.id)!,
      createWorkbookEvaluator(session.workbook, owner.id),
    )(current());
  return { session, owner, dates, sparkline, current, read };
}

function roundtrip(session: WorkbookSession, command: WorkbookCommand, check: () => void) {
  const before = serializeWorkbook(session.workbook);
  expect(executeWorkbookCommand(session, command)).toBe(true);
  check();
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
}

describe("cross-sheet sparkline date references", () => {
  test("uses the target sheet's stable ID after date edits, data edits, and a target-sheet rename", () => {
    const f = fixture();
    expect(f.read()).toEqual({ dates: [45001, 45002, 45003], values: [10, 20, 30] });
    setCellContent(f.dates, { row: 1, column: 1 }, { kind: "literal", value: 44999 });
    setCellContent(f.owner, { row: 5, column: 2 }, { kind: "literal", value: 99 });
    expect(f.read()).toEqual({ dates: [44999, 45001, 45002], values: [30, 99, 20] });
    const original = structuredClone(f.current());
    roundtrip(f.session, createRenameSheetCommand(f.dates.id, "Renamed calendar"), () => {
      expect(f.current()).toEqual(original);
      expect(f.current().dateSheetId).toBe("calendar-stable-id");
      expect(f.read()).toEqual({ dates: [44999, 45001, 45002], values: [30, 99, 20] });
    });
  });

  test.each([
    { operation: "insert", index: 0, count: 2, start: 3, end: 5 },
    { operation: "delete", index: 0, count: 1, start: 0, end: 2 },
    { operation: "delete", index: 2, count: 1, start: 1, end: 2 },
  ] as const)(
    "$operation target-sheet columns remaps only the external date range and preserves its anchors",
    ({ operation, index, count, start, end }) => {
      const f = fixture();
      const original = structuredClone(f.current());
      const command =
        operation === "insert"
          ? createInsertSheetAxisCommand(f.dates.id, "column", index, count)
          : createDeleteSheetAxisCommand(f.dates.id, "column", index, count);
      roundtrip(f.session, command, () => {
        expect(f.current()).toEqual({
          ...original,
          dateRange: {
            start: { row: 1, column: start, rowAbsolute: true, columnAbsolute: true },
            end: { row: 1, column: end, rowAbsolute: true, columnAbsolute: true },
          },
        });
        if (index === 0)
          expect(f.read()).toEqual({ dates: [45001, 45002, 45003], values: [10, 20, 30] });
      });
    },
  );

  test.each(["date columns", "date sheet"] as const)(
    "deleting the whole %s invalidates dates without losing data and restores the reference on undo",
    (target) => {
      const f = fixture();
      const original = structuredClone(f.current());
      const command =
        target === "date sheet"
          ? createDeleteSheetCommand(f.session.workbook, f.dates.id)
          : createDeleteSheetAxisCommand(f.dates.id, "column", 1, 3);
      roundtrip(f.session, command, () => {
        expect(f.current()).toEqual({ ...original, dateRange: null });
        expect(f.current().dateSheetId).toBe(f.dates.id);
        expect(f.current().source).toEqual(original.source);
        expect(f.read()).toEqual({ values: [] });
        const loaded = deserializeWorkbook(serializeWorkbook(f.session.workbook));
        expect(getCellSparkline(loaded.sheets.get(f.owner.id)!, position)).toEqual(f.current());
      });
    },
  );

  test("snapshot version 101 restores cross-sheet dates and rejects an earlier version or missing live target", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(101);
    const loaded = deserializeWorkbook(snapshot);
    const owner = loaded.sheets.get(f.owner.id)!;
    const restored = getCellSparkline(owner, position)!;
    expect(restored).toEqual(f.sparkline);
    expect(
      createSparklineSeriesResolver(owner, createWorkbookEvaluator(loaded, owner.id))(restored),
    ).toEqual({
      dates: [45001, 45002, 45003],
      values: [10, 20, 30],
    });
    expect(serializeWorkbook(loaded)).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 100 })).toThrow();
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        sheets: snapshot.sheets.filter((sheet) => sheet.id !== f.dates.id),
      }),
    ).toThrow();
  });
});
