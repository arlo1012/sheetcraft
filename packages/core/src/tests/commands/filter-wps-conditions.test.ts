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
  test("matches legacy single color criteria case-insensitively", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "red" });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "green" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#00ff00" });
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "color", target: "fill", color: "#FF0000" },
        },
      ],
    };
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 2, end: 2 }]);
  });

  test("matches any selected fill color, including no fill, through history and persistence", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["red", "green", "none", "red again"].entries())
      setCellContent(sheet, { row: row + 1, column: 0 }, { kind: "literal", value });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#00ff00" });
    setCellStyle(sheet, { row: 4, column: 0 }, { fillColor: "#ff0000" });
    const colors = ["#FF0000", null, "#ff0000"];
    const command = createSetSheetFilterCommand(sheet.id, {
      range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "color-set", target: "fill", colors },
        },
      ],
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    colors[0] = "#00ff00";
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 2, end: 2 }]);
    expect(sheet.filter?.columns[0]?.condition).toEqual({
      kind: "color-set",
      target: "fill",
      colors: ["#ff0000", null],
    });
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.filter,
    ).toMatchObject({
      columns: [{ condition: { kind: "color-set", colors: ["#ff0000", null] } }],
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.filter).toBeNull();
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 2, end: 2 }]);
  });

  test("matches any selected text color", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["red", "green", "black"].entries())
      setCellContent(sheet, { row: row + 1, column: 0 }, { kind: "literal", value });
    setCellStyle(sheet, { row: 1, column: 0 }, { textColor: "#ff0000" });
    setCellStyle(sheet, { row: 2, column: 0 }, { textColor: "#00ff00" });
    setCellStyle(sheet, { row: 3, column: 0 }, { textColor: "#000000" });
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetFilterCommand(sheet.id, {
          range: { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } },
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: {
                kind: "color-set",
                target: "text",
                colors: ["#FF0000", "#000000"],
              },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 2, end: 2 }]);
  });

  test("applies display color and tied rank through history, persistence, and SUBTOTAL", () => {
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
    const command = createSetSheetFilterCommand(sheet.id, {
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
    });
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([
      { start: 2, end: 2 },
      { start: 4, end: 5 },
    ]);
    expect(
      createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 0, column: 2 }),
    ).toBe(19); // The visible rows contain 10 and 9; filtered rows never enter SUBTOTAL.
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.filter,
    ).toMatchObject({
      columns: [
        { condition: { kind: "rank" } },
        { condition: { kind: "color", color: "#ff0000" } },
      ],
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test("uses case-insensitive custom text conditions with wildcard escaping and average", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of ["Alpha", "ALPINE", "Beta", "A*literal"].entries())
      setCellContent(sheet, { row: row + 1, column: 0 }, { kind: "literal", value });
    executeWorkbookCommand(
      session,
      createSetSheetFilterCommand(sheet.id, {
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
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
    );
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 1, end: 2 }]);
  });

  test("uses a merged cell's anchor color and validates item or percent rank counts", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.mergedCells = [{ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }];
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "red" });
    setCellContent(sheet, { row: 3, column: 0 }, { kind: "literal", value: "green" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 3, column: 0 }, { fillColor: "#00ff00" });
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 0 } };
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetFilterCommand(sheet.id, {
          range,
          allowMergedCells: true,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "color", target: "fill", color: "#ff0000" },
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(createSheetFilterHiddenRowIntervals(sheet)).toEqual([{ start: 3, end: 3 }]);
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSetSheetFilterCommand(sheet.id, {
          range,
          allowMergedCells: true,
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
          allowMergedCells: true,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "rank", bottom: false, percent: false, count: 501 },
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
  });

  test("rejects empty color selections and no-fill text color selections", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } };
    for (const condition of [
      { kind: "color-set" as const, target: "fill" as const, colors: [] },
      { kind: "color-set" as const, target: "text" as const, colors: [null] },
    ])
      expect(
        tryApplyWorkbookCommand(
          session.workbook,
          createSetSheetFilterCommand(sheet.id, {
            range,
            columns: [{ column: 0, allowedValues: [], condition }],
          }),
        ),
      ).toMatchObject({ ok: false, error: { code: "invalid_command_payload" } });
  });
});
