import { describe, expect, test } from "vitest";
import {
  createSetSheetFilterCommand,
  createSheetFilterHiddenRowIntervals,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("WPS filter conditions", () => {
  test("filters displayed colors and tied ranks through history, persistence, and SUBTOTAL", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of [10, 9, 9, 5, 1].entries())
      setCellContent(sheet, { row: row + 1, column: 0 }, { kind: "literal", value });
    setCellStyle(sheet, { row: 1, column: 1 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 1 }, { fillColor: "#00ff00" });
    sheet.conditionalFormats = [
      {
        id: "shown-red",
        ranges: [{ start: { row: 3, column: 1 }, end: { row: 3, column: 1 } }],
        anchor: { row: 3, column: 1 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 0 },
        style: { fillColor: "#ff0000" },
      },
    ];
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "literal", value: 1 });
    setCellContent(
      sheet,
      { row: 0, column: 2 },
      { kind: "formula", formula: { source: "=SUBTOTAL(9,A2:A6)" } },
    );
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetFilterCommand(sheet.id, {
          range: { start: { row: 0, column: 0 }, end: { row: 5, column: 1 } },
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "rank", bottom: false, percent: false, count: 2 },
            },
            {
              column: 1,
              allowedValues: [],
              condition: { kind: "color", target: "fill", color: "#ff0000" },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([
      { start: 2, end: 2 },
      { start: 4, end: 5 },
    ]);
    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 0, column: 2 }),
    ).toBe(19);
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.filter,
    ).toMatchObject({
      columns: [{ condition: { kind: "rank" } }, { condition: { kind: "color" } }],
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("supports custom wildcard conditions and fractional percent rank", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["Alpha", "ALPINE", "Beta", "A*literal"].entries())
      setCellContent(sheet, { row: row + 1, column: 0 }, { kind: "literal", value });
    const range = { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } };
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetFilterCommand(sheet.id, {
          range,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: {
                kind: "compound",
                operator: "or",
                conditions: [
                  { kind: "text", operator: "equals", value: "beta" },
                  { kind: "text", operator: "equals", value: "a~*literal" },
                ],
              },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 2 }]);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSetSheetFilterCommand(sheet.id, {
          range,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "rank", bottom: false, percent: true, count: 12.5 },
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSetSheetFilterCommand(sheet.id, {
          range,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "rank", bottom: false, percent: false, count: 501 },
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: false });
  });
});
