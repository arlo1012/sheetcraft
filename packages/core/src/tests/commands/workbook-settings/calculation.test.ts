import { describe, expect, test } from "vitest";
import { createSetWorkbookCalculationCommand } from "../../../commands/workbook-settings.js";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "../../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../../serialization.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("workbook calculation settings", () => {
  test("persists all settings and supports undo/redo", () => {
    const session = createTestWorkbookSession();
    const settings = {
      mode: "manual" as const,
      iterative: true,
      maxIterations: 400,
      maxChange: 0.00001,
    };
    executeWorkbookCommand(
      session,
      createSetWorkbookCalculationCommand(session.workbook, settings),
    );
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(43);
    expect(deserializeWorkbook(snapshot).calculation).toEqual(settings);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.calculation).toEqual({
      mode: "automatic",
      iterative: false,
      maxIterations: 100,
      maxChange: 0.001,
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(session.workbook.calculation).toEqual(settings);
  });
  test("loads V8 with default policy and rejects invalid iteration settings atomically", () => {
    const session = createTestWorkbookSession();
    const snapshot = serializeWorkbook(session.workbook);
    const { calculation: _calculation, ...previous } = snapshot;
    expect(deserializeWorkbook({ ...previous, version: 8 }).calculation).toEqual(
      session.workbook.calculation,
    );
    for (const patch of [
      { maxIterations: 0 },
      { maxIterations: 2.5 },
      { maxIterations: 10001 },
      { maxChange: 0 },
      { maxChange: NaN },
    ]) {
      expect(() => createSetWorkbookCalculationCommand(session.workbook, patch)).toThrow();
    }
    expect(session.history.undoStack).toHaveLength(0);
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        calculation: { ...snapshot.calculation, mode: "sometimes" },
      }),
    ).toThrow();
  });
});
