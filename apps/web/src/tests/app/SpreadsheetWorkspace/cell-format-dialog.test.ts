import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { getCellStyle } from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
async function mountWorkspace() {
  wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => undefined,
        save: async () => ({ revision: 1, savedAt: 1 }),
        replace: async () => ({ revision: 1, savedAt: 1 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await flushPromises();
  return wrapper;
}

describe("workspace cell format dialog", () => {
  test("opens each ribbon group launcher on its matching format tab", async () => {
    const workspace = await mountWorkspace();
    for (const tab of ["font", "alignment", "number"] as const) {
      await workspace.get(`[data-ribbon-dialog-launcher="${tab}"]`).trigger("click");
      const dialog = workspace.getComponent(CellFormatDialog);
      expect(dialog.props("initialTab")).toBe(tab);
      dialog.vm.$emit("cancel");
      await nextTick();
    }
  });

  test("opens from More Border Settings and applies all tabs as one undoable edit", async () => {
    const workspace = await mountWorkspace();
    const sheet = workspace.getComponent(SheetGrid).props("sheet");
    await workspace.get("[data-cell-border-control] [data-ribbon-split-menu]").trigger("click");
    const more = document.querySelector<HTMLButtonElement>('[data-border-menu-row="settings"]')!;
    expect(more).not.toBeNull();
    more.click();
    await nextTick();
    const dialog = workspace.getComponent(CellFormatDialog);
    expect(dialog.props("initialTab")).toBe("border");
    expect(document.querySelector("[data-cell-border-panel]")).toBeNull();
    dialog.vm.$emit("confirm", {
      style: {
        bold: true,
        fillColor: "#ff0000",
        verticalAlign: "middle",
        numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 },
      },
      borders: [{ preset: "outer", border: { style: "mediumDashDot", color: "#4472c4" } }],
    });
    await nextTick();
    expect(workspace.findComponent(CellFormatDialog).exists()).toBe(false);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toMatchObject({
      bold: true,
      fillColor: "#ff0000",
      verticalAlign: "middle",
      borderTop: { style: "mediumDashDot", color: "#4472c4" },
    });
    await workspace.get('[data-ribbon-action="undo"]').trigger("click");
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toBeUndefined();
  });

  test("finishes editing before Ctrl+1, discards cancel and accepts unchanged confirmation", async () => {
    const workspace = await mountWorkspace();
    const editor = workspace.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "1" });
    await editor.setValue("123.45");
    await editor.trigger("keydown", { key: "1", ctrlKey: true });
    await nextTick();
    let dialog = workspace.getComponent(CellFormatDialog);
    expect(dialog.props("sampleValue")).toBe(123.45);
    dialog.vm.$emit("cancel");
    await nextTick();
    expect(workspace.findComponent(CellFormatDialog).exists()).toBe(false);
    await workspace.get('[role="grid"]').trigger("keydown", { key: "1", ctrlKey: true });
    dialog = workspace.getComponent(CellFormatDialog);
    dialog.vm.$emit("confirm", {});
    await nextTick();
    expect(workspace.findComponent(CellFormatDialog).exists()).toBe(false);
    expect(
      getCellStyle(workspace.getComponent(SheetGrid).props("sheet"), { row: 0, column: 0 }),
    ).toBeUndefined();
  });
});
