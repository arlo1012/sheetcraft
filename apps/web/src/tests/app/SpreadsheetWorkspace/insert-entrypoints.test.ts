import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  getCellValue,
  type Sheet,
} from "@idea10/core/workbook";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
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
      selector: '.chart-insert-tools button[aria-label="Column"]',
      dialog: ".chart-editor",
    },
    { tool: "camera", selector: '[data-insert-tool="camera"]', dialog: ".camera-editor" },
    { tool: "control", selector: '[data-insert-tool="control"]', dialog: ".form-control-editor" },
    { tool: "pivot table", selector: '[data-insert-tool="pivot-table"]', dialog: ".pivot-editor" },
    { tool: "pivot chart", selector: '[data-insert-tool="pivot-chart"]', dialog: ".pivot-editor" },
  ])("opens the $tool editor from the actual Insert ribbon", async ({ selector, dialog }) => {
    const wrapper = await fixture();
    expect(document.querySelector(dialog)).toBeNull();
    await wrapper.get(selector).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(document.querySelector(dialog)).not.toBeNull(), {
      timeout: 10000,
    });
  });
  test("confirms a real pivot dialog and creates a new sheet with calculated output", async () => {
    const wrapper = await fixture(true);
    const sourceId = (wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id;
    await wrapper.get('[data-insert-tool="pivot-table"]').trigger("click");
    await vi.waitFor(() => expect(document.querySelector(".pivot-editor__preview")).not.toBeNull());
    const dialog = document.querySelector(".pivot-editor")!.closest(".t-dialog")!;
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
    expect(getCellValue(output, { row: 1, column: 1 })).toBe(30);
    expect(getCellValue(output, { row: 2, column: 1 })).toBe(40);
    expect(getCellValue(output, { row: 3, column: 1 })).toBe(70);
  });
});
