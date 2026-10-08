import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSetPivotTableCommand } from "@idea10/core/commands";
import { getCellValue, setCellValue } from "@idea10/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
function setup() {
  let controller!: Controller;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const sheet = controller.activeSheet.value;
  [
    ["Region", "Amount"],
    ["East", 10],
    ["West", 20],
  ].forEach((row, r) =>
    row.forEach((value, column) => setCellValue(sheet, { row: r, column }, value)),
  );
  expect(
    controller.executeCommand(
      createSetPivotTableCommand(sheet.id, {
        id: "protected-pivot",
        name: "Sales",
        sourceSheetId: sheet.id,
        source: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        anchor: { row: 0, column: 3 },
        outputRange: null,
        rowFields: [0],
        columnFields: [],
        filters: [],
        values: [{ field: 1, aggregate: "sum", caption: "Sum of Amount" }],
        rowTotals: true,
        columnTotals: true,
        includeHidden: true,
        sort: "ascending",
        totalLabel: "Grand Total",
        emptyLabel: "(blank)",
      }),
    ),
  ).toBe(true);
  return { controller, sheet, result: { row: 1, column: 4 } };
}

describe("workspace pivot result protection feedback", () => {
  test("editing a pivot result returns false, preserves content and shows the specific pivot feedback", () => {
    const { controller, sheet, result } = setup();
    const historyLength = controller.session.history.undoStack.length;
    expect(getCellValue(sheet, result)).toBe(10);
    expect(controller.commitCell({ address: result, input: "99" })).toBe(false);
    expect(getCellValue(sheet, result)).toBe(10);
    expect(controller.session.history.undoStack).toHaveLength(historyLength);
    expect(controller.workspaceStatusText.value).toBe(controller.t("pivot.resultProtected"));
  });
  test("direct value edits also reject pivot results without recording history", () => {
    const { controller, sheet, result } = setup();
    const historyLength = controller.session.history.undoStack.length;
    expect(controller.commitCellValue({ address: result, value: 99 })).toBe(false);
    expect(getCellValue(sheet, result)).toBe(10);
    expect(controller.session.history.undoStack).toHaveLength(historyLength);
    expect(controller.workspaceStatusText.value).toBe(controller.t("pivot.resultProtected"));
  });
  test("paste rejects protected results and clipboard feedback preserves the specific reason", () => {
    const { controller, sheet, result } = setup();
    const historyLength = controller.session.history.undoStack.length;
    expect(
      controller.pasteCells({
        kind: "all",
        plan: { anchor: result, range: { start: result, end: result }, values: [[99]] },
      }),
    ).toEqual({ ok: false, reason: "pasteRejected" });
    expect(controller.workspaceStatusText.value).toBe(controller.t("pivot.resultProtected"));
    controller.showClipboardFeedback("pasteRejected");
    expect(controller.workspaceStatusText.value).toBe(controller.t("pivot.resultProtected"));
    expect(getCellValue(sheet, result)).toBe(10);
    expect(controller.session.history.undoStack).toHaveLength(historyLength);
  });
  test("cells outside the pivot report remain editable and clear old protection feedback", () => {
    const { controller, sheet, result } = setup();
    controller.commitCell({ address: result, input: "99" });
    const outside = { row: 0, column: 6 };
    expect(controller.commitCell({ address: outside, input: "42" })).toBe(true);
    expect(getCellValue(sheet, outside)).toBe(42);
    expect(controller.workspaceStatusText.value).toBe("");
    expect(
      controller.pasteCells({
        kind: "all",
        plan: { anchor: outside, range: { start: outside, end: outside }, values: [[75]] },
      }),
    ).toEqual({ ok: true });
    expect(getCellValue(sheet, outside)).toBe(75);
  });
  test("a no-op paste outside the report succeeds after an earlier protected-result rejection", () => {
    const { controller, sheet, result } = setup();
    const outside = { row: 0, column: 6 };
    setCellValue(sheet, outside, 42);
    const paste = (address: typeof outside, value: number) =>
      controller.pasteCells({
        kind: "all",
        plan: { anchor: address, range: { start: address, end: address }, values: [[value]] },
      });
    expect(paste(result, 99)).toEqual({ ok: false, reason: "pasteRejected" });
    expect(controller.workspaceStatusText.value).toBe(controller.t("pivot.resultProtected"));
    expect(paste(outside, 42)).toEqual({ ok: true });
    expect(controller.workspaceStatusText.value).toBe("");
    expect(getCellValue(sheet, outside)).toBe(42);
  });
});
