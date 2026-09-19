import { expect, test } from "vitest";
import {
  createApplySubtotalsCommand,
  createRemoveSubtotalsCommand,
} from "../../../commands/subtotal.js";
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

test.each([true, false])(
  "keeps group labels left of overlapping summaries (summaryBelow=%s)",
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
    expect(groupRows.map((row) => getCellValue(sheet, { row, column: 3 }))).toEqual([
      "r1 汇总",
      "r4 汇总",
      "r7 汇总",
      "r9 汇总",
    ]);
    expect(groupRows.map((row) => evaluator.getComputedValue({ row, column: 4 }))).toEqual([
      0, 0, 0, 0,
    ]);
    expect(groupRows.map((row) => evaluator.getComputedValue({ row, column: 5 }))).toEqual([
      30, 30, 20, 10,
    ]);
    expect(getCellValue(sheet, { row: grandRow, column: 3 })).toBe("总计");
    expect(
      [4, 5, 6, 7].map((column) => evaluator.getComputedValue({ row: grandRow, column })),
    ).toEqual([0, 90, 99, 108]);
    expect(metadata.range.start.column).toBe(4);
    const applied = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(applied);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.subtotalMetadata).toHaveLength(1);
    expect(sheet.subtotalMetadata![0]!.generatedRows).toEqual(rows);
    expect(getCellValue(sheet, { row: grandRow, column: 3 })).toBe("总计");
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(applied);
    expect(executeWorkbookCommand(session, createRemoveSubtotalsCommand(sheet.id))).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  },
);

test.each([
  { group: 2, summaries: [1, 2], target: 0 },
  { group: 0, summaries: [0, 1], target: 2 },
])(
  "uses an available label column without overwriting totals: %j",
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
    expect(evaluator.getComputedValue({ row: 2, column: group })).toBe(0);
  },
);
