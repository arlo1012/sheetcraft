// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  normalizeChartInsertIntent,
  type DynamicChartTemplate,
} from "../../../modules/charts/chart-design-intents";
import { useChartActions } from "../../../modules/charts/useChartActions";

describe("dynamic chart template intents", () => {
  test.each(["rose", "funnel", "gauge", "liquid", "waterfall", "venn"] as const)(
    "accepts a detached { type, style, labels } template for %s",
    (type) => {
      const input: DynamicChartTemplate = { type, style: "forest", labels: true };
      const normalized = normalizeChartInsertIntent(input);
      expect(normalized).toEqual({ type, style: "forest", labels: true });
      expect(normalized).not.toBe(input);
      input.labels = false;
      expect(normalized).toEqual({ type, style: "forest", labels: true });
    },
  );

  test.each([
    { type: "rose", style: "dark" },
    { type: "rose", labels: true },
    { type: "unknown", style: "dark", labels: true },
    { type: "rose", style: "unknown", labels: true },
    { type: "rose", style: "dark", labels: "true" },
    { type: "rose", style: "dark", labels: true, variant: "standard" },
    { type: "rose", style: "dark", labels: true, extra: 1 },
  ])("rejects incomplete, mixed, or malformed template data %j", (input) => {
    expect(() => normalizeChartInsertIntent(input)).toThrow();
  });

  test("does not execute an accessor while normalizing template data", () => {
    const labels = vi.fn(() => true);
    const input = Object.defineProperty({ type: "rose", style: "dark" }, "labels", { get: labels });
    expect(() => normalizeChartInsertIntent(input)).toThrow();
    expect(labels).not.toHaveBeenCalled();
  });

  test.each([
    { type: "rose", labels: true },
    { type: "funnel", labels: false },
    { type: "gauge", labels: true },
    { type: "liquid", labels: false },
    { type: "waterfall", labels: true },
    { type: "venn", labels: false },
  ] as const)(
    "stages $type with the chosen style and labels before one explicit insertion",
    ({ type, labels }) => {
      const workbook = createWorkbook({ id: "dynamic-insert", sheetId: "data" });
      const sheet = getActiveSheet(workbook);
      [
        ["Stage", "Value"],
        ["Set A", 40],
        ["Set B", 30],
        ["Intersection", 10],
      ].forEach((row, r) =>
        row.forEach((value, c) =>
          setCellContent(sheet, { row: r, column: c }, { kind: "literal", value }),
        ),
      );
      const execute = vi.fn(
        (command: WorkbookCommand) => applyWorkbookCommand(workbook, command) !== null,
      );
      const actions = useChartActions({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 3, column: 1 } }),
        getEvaluator: () => createSheetEvaluator(sheet),
        isBusy: () => false,
        flush: () => true,
        execute,
        name: () => "Dynamic template",
      });
      actions.insert({ type, style: "dark", labels });
      const draft = actions.editing.value!;
      expect(draft.chart).toMatchObject({
        type,
        labels,
        presentation: { background: "#202936", animated: true },
      });
      expect(execute).not.toHaveBeenCalled();
      expect(sheet.drawings ?? []).toEqual([]);
      actions.confirm(draft, "A1:B4");
      expect(execute).toHaveBeenCalledTimes(1);
      expect(sheet.drawings).toHaveLength(1);
      expect((sheet.drawings![0] as SheetChartDrawing).chart).toMatchObject({
        type,
        labels,
        presentation: { background: "#202936", animated: true },
      });
      expect(actions.editing.value).toBeUndefined();
      expect(actions.error.value).toBe(false);
    },
  );
});
