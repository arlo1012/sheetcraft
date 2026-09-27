import { expect, test } from "vitest";
import {
  createApplySubtotalsCommand,
  createRemoveSubtotalsCommand,
} from "../../../commands/subtotal.js";
import { createSetSheetOutlineLevelCommand } from "../../../commands/outline.js";
import { getOutlineHiddenIntervals } from "../../../data-outline.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../../history.js";
import { serializeWorkbook } from "../../../serialization.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  getCellValue,
  setCellValue,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

const labels = { subtotal: "汇总", grandTotal: "总计" };

function visibleRows(sheet: ReturnType<typeof getActiveSheet>, end: number): number[] {
  const hidden = getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row");
  return Array.from({ length: end + 1 }, (_, row) => row).filter(
    (row) => !hidden.some((interval) => interval.start <= row && row <= interval.end),
  );
}

test.each([true, false])(
  "inserts a label column before overlapping summaries (summaryBelow=%s)",
  (summaryBelow) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    ["title1", "title2", "title3", "title4"].forEach((value, index) =>
      setCellValue(sheet, { row: 6, column: index + 4 }, value),
    );
    ["r1", "r1", "r1", "r4", "r4", "r4", "r7", "r7", "r9"].forEach((group, index) => {
      [group, 10, 11, 12].forEach((value, column) =>
        setCellValue(sheet, { row: index + 7, column: column + 4 }, value),
      );
    });
    setCellValue(sheet, { row: 9, column: 3 }, "neighbor");
    const range = { start: { row: 6, column: 4 }, end: { row: 15, column: 7 } };
    const command = createApplySubtotalsCommand(sheet.id, range, [4], [4, 5, 6, 7], "sum", {
      hasHeader: true,
      summaryBelow,
      labels,
      replaceExisting: true,
    });
    const before = serializeWorkbook(session.workbook);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const metadata = sheet.subtotalMetadata![0]!;
    const rows = metadata.generatedRows;
    const groupRows = summaryBelow ? rows.slice(0, -1) : rows.slice(1);
    const grandRow = summaryBelow ? rows.at(-1)! : rows[0]!;
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    expect(groupRows.map((row) => getCellValue(sheet, { row, column: 4 }))).toEqual([
      "r1 汇总",
      "r4 汇总",
      "r7 汇总",
      "r9 汇总",
    ]);
    expect(groupRows.map((row) => evaluator.getComputedValue({ row, column: 5 }))).toEqual([
      0, 0, 0, 0,
    ]);
    expect(groupRows.map((row) => evaluator.getComputedValue({ row, column: 6 }))).toEqual([
      30, 30, 20, 10,
    ]);
    expect(getCellValue(sheet, { row: grandRow, column: 4 })).toBe("总计");
    expect(
      [5, 6, 7, 8].map((column) => evaluator.getComputedValue({ row: grandRow, column })),
    ).toEqual([0, 90, 99, 108]);
    expect(metadata.range.start.column).toBe(4);
    expect(metadata.range.end.column).toBe(8);
    expect(metadata.generatedColumns).toEqual([4]);
    expect(getCellValue(sheet, { row: 6, column: 4 })).toBeNull();
    expect(getCellValue(sheet, { row: 6, column: 5 })).toBe("title1");
    expect(getCellValue(sheet, { row: 6, column: 8 })).toBe("title4");
    const applied = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(applied);
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(sheet.id, metadata.range, [5], [5, 6, 7, 8], "sum", {
          hasHeader: true,
          summaryBelow,
          labels,
          replaceExisting: true,
        }),
      ),
    ).toBe(true);
    expect(sheet.subtotalMetadata).toHaveLength(1);
    expect(sheet.subtotalMetadata![0]!.generatedRows).toEqual(rows);
    expect(getCellValue(sheet, { row: grandRow, column: 4 })).toBe("总计");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(applied);
    expect(executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id))).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  },
);

test.each([
  { group: 2, summaries: [1, 2], target: 2 },
  { group: 0, summaries: [0, 1], target: 0 },
])(
  "inserts the label column at the grouping field without overwriting totals: %j",
  ({ group, summaries, target }) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const row of [0, 1])
      for (const column of [0, 1, 2])
        setCellValue(sheet, { row, column }, column === group ? "r1" : 10);
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 1, column: 2 } },
          [group],
          summaries,
          "sum",
          { labels },
        ),
      ),
    ).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: target })).toBe("r1 汇总");
    expect(getCellValue(sheet, { row: 3, column: target })).toBe("总计");
    const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
    expect(evaluator.getComputedValue({ row: 2, column: group + 1 })).toBe(0);
  },
);

test.each([true, false])(
  "uses three outline levels for subtotal details and the grand total (summaryBelow=%s)",
  (summaryBelow) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellValue(sheet, { row: 0, column: 0 }, "group");
    setCellValue(sheet, { row: 0, column: 1 }, "amount");
    ["a", "a", "b", "b"].forEach((group, index) => {
      setCellValue(sheet, { row: index + 1, column: 0 }, group);
      setCellValue(sheet, { row: index + 1, column: 1 }, 10);
    });
    expect(
      executeWorkbookCommand(
        session,
        createApplySubtotalsCommand(
          sheet.id,
          { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
          [0],
          [1],
          "sum",
          { hasHeader: true, labels, summaryBelow },
        ),
      ),
    ).toBe(true);

    const metadata = sheet.subtotalMetadata![0]!;
    const grandTotalRow = summaryBelow
      ? metadata.generatedRows.at(-1)!
      : metadata.generatedRows[0]!;
    const subtotalRows = summaryBelow
      ? metadata.generatedRows.slice(0, -1)
      : metadata.generatedRows.slice(1);
    const dataEnd = metadata.range.end.row;
    const totalGroup = sheet.outlineGroups?.find(
      (group) => group.id === `${metadata.id}-group-total`,
    );
    expect(totalGroup).toMatchObject({
      axis: "row",
      start: summaryBelow ? 1 : grandTotalRow + 1,
      end: summaryBelow ? grandTotalRow - 1 : dataEnd,
      collapsed: false,
    });

    expect(
      executeWorkbookCommand(session, createSetSheetOutlineLevelCommand(sheet.id, "row", 0)),
    ).toBe(true);
    expect(visibleRows(sheet, dataEnd)).toEqual([0, grandTotalRow]);

    expect(
      executeWorkbookCommand(session, createSetSheetOutlineLevelCommand(sheet.id, "row", 1)),
    ).toBe(true);
    expect(visibleRows(sheet, dataEnd)).toEqual(
      [0, grandTotalRow, ...subtotalRows].sort((a, b) => a - b),
    );

    expect(
      executeWorkbookCommand(session, createSetSheetOutlineLevelCommand(sheet.id, "row", 2)),
    ).toBe(true);
    expect(visibleRows(sheet, dataEnd)).toEqual(
      Array.from({ length: dataEnd + 1 }, (_, row) => row),
    );
  },
);
