import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
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
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { triggerCanvasCell } from "../canvas-interaction";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
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
  test("creates an empty report, configures it through the field pane, and leaves its contextual tools", async () => {
    const wrapper = await fixture(true);
    const sourceId = (wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id;
    await wrapper.get('[data-insert-tool="pivot-table"]').trigger("click");
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
    const output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
    expect(output.pivotTables).toHaveLength(1);
    expect(output.pivotTables![0]!.outputRange).toBeNull();
    expect(output.cells.size).toBe(0);
    expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(true);
    expect(wrapper.find(".pivot-fields-pane").exists()).toBe(true);
    expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(true);
    expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(true);
    await wrapper.get('[data-pivot-source-field="0"] input[type="checkbox"]').setValue(true);
    await wrapper.get('[data-pivot-source-field="1"] input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(wrapper.find("[data-pivot-placeholder]").exists()).toBe(false);

    expect(getCellValue(output, { row: 1, column: 1 })).toBe(30);
    expect(getCellValue(output, { row: 2, column: 1 })).toBe(40);
    expect(getCellValue(output, { row: 3, column: 1 })).toBe(70);
    await triggerCanvasCell(wrapper, { row: 5, column: 4 }, "mousedown", { button: 0 });
    await flushPromises();
    expect(wrapper.find(".pivot-fields-pane").exists()).toBe(false);
    expect(wrapper.find('[data-ribbon-category="pivot-analysis"]').exists()).toBe(false);
    expect(wrapper.find('[data-ribbon-category="pivot-design"]').exists()).toBe(false);
  });
});
