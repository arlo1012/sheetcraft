// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createSparklineSeriesResolver,
  translateCellSparkline,
  type CellSparkline,
} from "../../sparklines.js";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSheetEvaluator,
  getActiveSheet,
  getCellSparkline,
  setCellContent,
  setCellSparkline,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function definition(): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 5, column: 7 }, end: { row: 9, column: 7 } },
    dateRange: { start: { row: 0, column: 0 }, end: { row: 0, column: 4 } },
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
}
function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  [45003, null, 45001, 45001, 45002].forEach((value, column) => {
    if (value !== null) setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
  });
  [30, 40, 10, null, 20].forEach((value, index) => {
    if (value !== null)
      setCellContent(sheet, { row: 5 + index, column: 7 }, { kind: "literal", value });
  });
  return { session, sheet };
}

describe("sparkline date axis", () => {
  test.each(["gap", "zero"] as const)(
    "sorts paired values by date, omits blank dates, and keeps duplicate date order in %s mode",
    (empty) => {
      const f = fixture();
      const sparkline = { ...definition(), empty };
      const before = structuredClone(sparkline);
      const workbookBefore = serializeWorkbook(f.session.workbook);
      const resolve = createSparklineSeriesResolver(f.sheet, createSheetEvaluator(f.sheet));
      expect(resolve(sparkline)).toEqual({
        dates: [45001, 45001, 45002, 45003],
        values: [10, empty === "zero" ? 0 : null, 20, 30],
      });
      expect(sparkline).toEqual(before);
      expect(serializeWorkbook(f.session.workbook)).toEqual(workbookBefore);
    },
  );

  test("pairs dates by original source ordinal before omitting hidden source rows", () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([5]);
    const resolve = createSparklineSeriesResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(resolve(definition())).toEqual({ dates: [45001, 45001, 45002], values: [10, null, 20] });
    expect(resolve({ ...definition(), showHidden: true })).toEqual({
      dates: [45001, 45001, 45002, 45003],
      values: [10, null, 20, 30],
    });
  });

  test("a broken date reference produces no series while a general axis retains source order", () => {
    const f = fixture();
    const resolve = createSparklineSeriesResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(resolve({ ...definition(), dateRange: null })).toEqual({ values: [] });
    expect(resolve({ ...definition(), dateRange: undefined })).toEqual({
      values: [30, 40, 10, null, 20],
    });
    expect(translateCellSparkline(definition(), { row: -1, column: 0 })?.dateRange).toBeNull();
  });

  test.each([
    { name: "relative", flags: {}, row: 1, startColumn: 1, endColumn: 5 },
    {
      name: "absolute",
      flags: { rowAbsolute: true, columnAbsolute: true },
      row: 0,
      startColumn: 0,
      endColumn: 4,
    },
    { name: "absolute row", flags: { rowAbsolute: true }, row: 0, startColumn: 1, endColumn: 5 },
    {
      name: "absolute column",
      flags: { columnAbsolute: true },
      row: 1,
      startColumn: 0,
      endColumn: 4,
    },
  ])(
    "autofill copy honors $name date anchors and restores the original on undo",
    ({ flags, row, startColumn, endColumn }) => {
      const f = fixture();
      const position = { row: 10, column: 10 };
      const sparkline: CellSparkline = {
        ...definition(),
        dateRange: { start: { row: 0, column: 0, ...flags }, end: { row: 0, column: 4, ...flags } },
      };
      setCellSparkline(f.sheet, position, sparkline);
      const before = structuredClone(sparkline);
      const target = { row: 11, column: 11 };
      const plan = captureCellFill(
        f.session.workbook,
        f.sheet.id,
        { start: position, end: position },
        { start: position, end: target },
      );
      expect(
        executeWorkbookCommand(f.session, createCellFillCommand(f.session.workbook, plan, "copy")),
      ).toBe(true);
      const copied = getCellSparkline(f.sheet, target)!;
      expect(copied.dateRange).toEqual({
        start: { row, column: startColumn, ...flags },
        end: { row, column: endColumn, ...flags },
      });
      expect(copied.source).toEqual({ start: { row: 6, column: 8 }, end: { row: 10, column: 8 } });
      expect(getCellSparkline(f.sheet, position)).toEqual(before);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(getCellSparkline(f.sheet, target)).toBeUndefined();
      expect(getCellSparkline(f.sheet, position)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(getCellSparkline(f.sheet, target)?.dateRange).toEqual(copied.dateRange);
    },
  );
});
