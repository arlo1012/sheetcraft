import { describe, expect, test } from "vitest";
import { createDefinedNamesFromSelectionCommand } from "../../../commands/names-from-selection.js";
import { applyWorkbookCommand } from "../../../commands/apply.js";
import { createUpsertDefinedNameCommand } from "../../../commands/names.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../../history.js";
import { getActiveSheet, setCellContent } from "../../../workbook.js";
import { createWorkbookCalculationSession } from "../../../formula/calculation-session.js";
import { createTestWorkbookSession } from "../../helpers.js";

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const cells = [
    ["季度", "销售额", "利润"],
    ["第一季", 20, 5],
    ["第二季", 30, 8],
  ];
  cells.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  return { session, sheet, range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } } };
}

describe("names from selection", () => {
  test("creates row and column names together, excludes headers, and undoes the whole batch", () => {
    const { session, sheet, range } = fixture();
    const command = createDefinedNamesFromSelectionCommand(session.workbook, {
      sheetId: sheet.id,
      range,
      positions: ["top", "left"],
    });
    expect(command.changes).toHaveLength(4);
    executeWorkbookCommand(session, command);
    expect(session.history.undoStack).toHaveLength(1);
    const names = [...session.workbook.definedNames.values()];
    expect(names.find((name) => name.name === "销售额")?.reference).toEqual({
      sheetId: sheet.id,
      start: { row: 1, column: 1 },
      end: { row: 2, column: 1 },
    });
    expect(names.find((name) => name.name === "第一季")?.reference).toEqual({
      sheetId: sheet.id,
      start: { row: 1, column: 1 },
      end: { row: 1, column: 2 },
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.definedNames.size).toBe(0);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect([...session.workbook.definedNames.values()]).toEqual(names);
  });

  test("handles bottom/right labels, sanitizes names and skips duplicate scope names", () => {
    const { session, sheet, range } = fixture();
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "1st item" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "A1" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "1st item" });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "净 利润" });
    const command = createDefinedNamesFromSelectionCommand(session.workbook, {
      sheetId: sheet.id,
      range,
      positions: ["bottom", "right"],
      scopeSheetId: sheet.id,
    });
    executeWorkbookCommand(session, command);
    expect([...session.workbook.definedNames.values()].map((name) => name.name)).toEqual([
      "_1st_item",
      "_A1",
      "净_利润",
    ]);
    expect(
      [...session.workbook.definedNames.values()].every((name) => name.scopeSheetId === sheet.id),
    ).toBe(true);
    expect(() =>
      createDefinedNamesFromSelectionCommand(session.workbook, {
        sheetId: sheet.id,
        range,
        positions: ["bottom", "right"],
        scopeSheetId: sheet.id,
      }),
    ).toThrow();
    expect(
      createDefinedNamesFromSelectionCommand(session.workbook, {
        sheetId: sheet.id,
        range,
        positions: ["bottom", "right"],
      }).changes,
    ).toHaveLength(3);
  });

  test("uses the supplied manual calculation view for formula labels", () => {
    const { session, sheet } = fixture();
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=B1" } });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Old label" });
    session.workbook.calculation = {
      mode: "manual",
      iterative: false,
      maxIterations: 100,
      maxChange: 0.001,
    };
    const calculation = createWorkbookCalculationSession(session.workbook);
    const evaluator = calculation.getEvaluator(sheet.id);
    expect(evaluator.getComputedValue({ row: 0, column: 0 })).toBe("Old label");

    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "New label" });
    const command = createDefinedNamesFromSelectionCommand(session.workbook, {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      positions: ["top"],
      evaluator,
    });

    expect(command.changes[0]?.definition?.name).toBe("Old_label");
  });

  test("rejects an invalid batch before installing any names", () => {
    const { session, sheet, range } = fixture();
    const command = createDefinedNamesFromSelectionCommand(session.workbook, {
      sheetId: sheet.id,
      range,
      positions: ["top"],
    });
    const first = command.changes[0]!.definition!;
    command.changes[1]!.definition!.name = first.name;
    expect(() => applyWorkbookCommand(session.workbook, command)).toThrow();
    expect(session.workbook.definedNames.size).toBe(0);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("keeps existing definitions and skips empty labels", () => {
    const { session, sheet, range } = fixture();
    const existing = createUpsertDefinedNameCommand(session.workbook, {
      name: "销售额",
      reference: "=A1",
    });
    applyWorkbookCommand(session.workbook, existing);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: '=""' } });
    const command = createDefinedNamesFromSelectionCommand(session.workbook, {
      sheetId: sheet.id,
      range,
      positions: ["top"],
    });
    expect(command.changes.map((change) => change.definition!.name)).toEqual(["利润"]);
    expect(session.workbook.definedNames.get(existing.definition.id)).toEqual(existing.definition);
  });
});
