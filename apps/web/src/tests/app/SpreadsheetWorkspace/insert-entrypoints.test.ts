import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { watch } from "vue";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  getCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { triggerCanvasCell } from "../canvas-interaction";
import { createAppI18n } from "../../../shared/i18n";

// Observe the real controller and command history without replacing their behavior.
const captured = vi.hoisted(() => ({
  controller: undefined as
    | ReturnType<
        typeof import("../../../app/composables/useSpreadsheetWorkspaceController").useSpreadsheetWorkspaceController
      >
    | undefined,
}));
vi.mock("../../../app/composables/useSpreadsheetWorkspaceController", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../app/composables/useSpreadsheetWorkspaceController")
    >();
  return {
    ...actual,
    useSpreadsheetWorkspaceController(
      ...args: Parameters<typeof actual.useSpreadsheetWorkspaceController>
    ) {
      const controller = actual.useSpreadsheetWorkspaceController(...args);
      captured.controller = controller;
      return controller;
    },
  };
});
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function fixture(withData = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  if (withData) {
    const sheet = getActiveSheet(workbook);
    [
      ["Region", "Amount"],
      ["East", 10],
      ["East", 20],
      ["West", 40],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  return wrapper;
}

describe("workspace insert entry points", () => {
  test.each([
    { tool: "shape", selector: '[data-insert-tool="shape"]', dialog: ".drawing-editor" },
    { tool: "text box", selector: '[data-insert-tool="text-box"]', dialog: ".drawing-editor" },
    { tool: "WordArt", selector: '[data-insert-tool="wordArt"]', dialog: ".drawing-editor" },
    {
      tool: "chart",
      selector: '.chart-insert-tools [role="button"][aria-label="Column"]',
      dialog: ".chart-editor",
    },
    { tool: "camera", selector: '[data-insert-tool="camera"]', dialog: ".camera-editor" },
    { tool: "control", selector: '[data-insert-tool="control"]', dialog: ".form-control-editor" },
    { tool: "pivot table", selector: '[data-insert-tool="pivot-table"]', dialog: ".pivot-create" },
    { tool: "pivot chart", selector: '[data-insert-tool="pivot-chart"]', dialog: ".pivot-create" },
  ])("opens the $tool editor from the actual Insert ribbon", async ({ selector, dialog }) => {
    const wrapper = await fixture();
    expect(document.querySelector(dialog)).toBeNull();
    await wrapper.get(selector).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.querySelector(dialog)).not.toBeNull(), {
      timeout: 10000,
    });
  });
  test.each([false, true])(
    "creates an empty report, configures it through the field pane, and leaves its contextual tools, chart=%s",
    async (chart) => {
      const wrapper = await fixture(true);
      const controller = captured.controller!;
      expect(controller.session.history.undoStack).toHaveLength(0);
      const sourceId = (wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id;
      const before = serializeWorkbook(controller.session.workbook);
      await wrapper
        .get(`[data-insert-tool="${chart ? "pivot-chart" : "pivot-table"}"]`)
        .trigger("click");
      await vi.waitFor(() => expect(document.querySelector(".pivot-create")).not.toBeNull());
      const dialog = document.querySelector(".pivot-create")!.closest(".t-dialog")!;
      const confirm = dialog.querySelector<HTMLButtonElement>(
        ".t-dialog__footer .t-button--theme-primary",
      )!;
      expect(confirm.disabled).toBe(false);
      confirm.click();
      await flushPromises();
      await vi.waitFor(() =>
        expect((wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id).not.toBe(sourceId),
      );
      let output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(output.pivotTables).toHaveLength(1);
      expect(output.pivotTables![0]!.anchor).toEqual({ row: 2, column: 0 });
      expect(controller.activeAddress.value).toEqual(output.pivotTables![0]!.anchor);
      expect(controller.session.history.undoStack).toHaveLength(1);
      expect(output.pivotTables![0]!.outputRange).toBeNull();
      expect(output.cells.size).toBe(0);
      expect(output.drawings).toHaveLength(Number(chart));
      if (chart)
        expect(output.drawings![0]).toMatchObject({
          kind: "chart",
          chart: { pivotTableId: output.pivotTables![0]!.id, range: null },
        });
      expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(true);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
      expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(true);
      expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(true);
      const empty = serializeWorkbook(controller.session.workbook);
      await wrapper.get('[data-ribbon-category="home"]').trigger("click");
      await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
      await flushPromises();
      expect(controller.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
      expect(controller.activeSheet.value.id).toBe(sourceId);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
      await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
      await flushPromises();
      expect(controller.session.history.undoStack).toHaveLength(1);
      expect(serializeWorkbook(controller.session.workbook)).toEqual(empty);
      output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(controller.activeAddress.value).toEqual(output.pivotTables![0]!.anchor);
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
      await wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]').setValue(true);
      await wrapper.get('[data-pivot-source-field="1"] input[type="checkbox"]').setValue(true);
      await flushPromises();
      expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(false);

      const report = output.pivotTables![0]!;
      const anchor = report.anchor;
      expect(report.outputRange).toEqual({
        start: anchor,
        end: { row: anchor.row + 3, column: anchor.column + 1 },
      });
      expect(getCellValue(output, { row: 0, column: 0 })).toBeNull();
      expect(getCellValue(output, { row: 1, column: 0 })).toBeNull();
      expect(getCellValue(output, { row: anchor.row + 1, column: anchor.column + 1 })).toBe(30);
      expect(getCellValue(output, { row: anchor.row + 2, column: anchor.column + 1 })).toBe(40);
      expect(getCellValue(output, { row: anchor.row + 3, column: anchor.column + 1 })).toBe(70);
      expect(controller.activeAddress.value).toEqual(anchor);
      expect(controller.session.history.undoStack).toHaveLength(3);
      if (chart)
        expect(output.drawings![0]).toMatchObject({ chart: { range: report.outputRange } });
      await triggerCanvasCell(wrapper, { row: 5, column: 4 }, "mousedown", { button: 0 });
      await flushPromises();
      expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
      expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(false);
      expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(false);
      expect(controller.activeAddress.value).toEqual({ row: 5, column: 4 });
      expect(controller.session.history.undoStack).toHaveLength(3);
    },
  );
  test.each(["close", "navigation"] as const)(
    "keeps reentrant %s authoritative during new-sheet confirmation",
    async (action) => {
      const wrapper = await fixture(true);
      const controller = captured.controller!;
      const sourceId = controller.activeSheet.value.id;
      await wrapper.get('[data-insert-tool="pivot-table"]').trigger("click");
      await flushPromises();
      const editor = wrapper.getComponent(PivotTableDialog);
      const initial = editor.props("initial");
      const callbacks = editor.vm.$.vnode.props!;
      const close = callbacks.onClose as () => void;
      const confirm = callbacks.onConfirm as (draft: typeof initial) => void;
      let interrupted = false;
      // Observe the actual command-driven sheet transition synchronously, just
      // as a newer navigation or explicit cancellation can invalidate a session.
      const stop = watch(
        () => controller.activeSheet.value.id,
        (sheetId) => {
          if (interrupted || sheetId === sourceId) return;
          interrupted = true;
          if (action === "close") close();
          else controller.selectSheet(sourceId);
        },
        { flush: "sync" },
      );
      try {
        document
          .querySelector(".pivot-create")!
          .closest(".t-dialog")!
          .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!
          .click();
        await flushPromises();
        expect(interrupted).toBe(true);
        expect(controller.session.workbook.sheets.size).toBe(2);
        expect(controller.session.history.undoStack).toHaveLength(1);
        expect(controller.activeAddress.value).toEqual({ row: 0, column: 0 });
        expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
        expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(false);
        if (action === "navigation") expect(controller.activeSheet.value.id).toBe(sourceId);
        else expect(controller.activeSheet.value.id).not.toBe(sourceId);
        const after = serializeWorkbook(controller.session.workbook);
        confirm(initial);
        close();
        await flushPromises();
        expect(serializeWorkbook(controller.session.workbook)).toEqual(after);
        expect(controller.session.history.undoStack).toHaveLength(1);
      } finally {
        stop();
      }
    },
  );
});
