import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, cloneFloatingImage } from "@sheetcraft/core/workbook";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import HomeFormatToolbar from "../../../modules/home-tools/components/HomeFormatToolbar.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("real Workspace floating Group hands focus to its selected owner for one immediate Undo", async () => {
  const homeSetup = vi.spyOn(HomeFormatToolbar, "setup");
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:group-focus");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ id: "group-focus", sheetId: "group-focus-sheet" });
  getActiveSheet(workbook).floatingImages = ["first", "second"].map((id, index) => ({
    id,
    assetId: "asset",
    altText: id,
    anchor: { row: 2, column: 2 + index * 2 },
    offsetX: 0,
    offsetY: 0,
    width: 120,
    height: 80,
  }));
  const assets = createMemoryImageAssetStore();
  await assets.put({
    id: "asset",
    mimeType: "image/png",
    width: 120,
    height: 80,
    blob: new Blob([new Uint8Array(actualPng)], { type: "image/png" }),
  });
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: async () => ({ revision: 2, savedAt: 2 }),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: assets,
    },
    global: {
      plugins: [createAppI18n("en-US")],
    },
  });
  try {
    await flushPromises();
    const grid = wrapper.getComponent(SheetGrid);
    grid.vm.selectFloatingImages(["first", "second"]);
    await flushPromises();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-picture-selection-action="group"]')).not.toBeNull(),
    );
    const before = grid.props("sheet").floatingImages.map(cloneFloatingImage);
    const button = document.querySelector<HTMLButtonElement>(
      '[data-picture-selection-action="group"]',
    )!;
    expect(button).not.toBeNull();
    const homeMountsBeforeGroup = homeSetup.mock.calls.length;
    button.focus();
    button.click();
    await flushPromises();
    const group = grid.props("sheet").floatingImages[0]!;
    expect(isPictureGroup(group)).toBe(true);
    expect(button.isConnected).toBe(false);
    expect(homeSetup).toHaveBeenCalledTimes(homeMountsBeforeGroup);
    expect(document.activeElement?.getAttribute("data-owned-picture-selected")).toBe(group.id);
    const undo = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement!.dispatchEvent(undo);
    await flushPromises();
    expect(undo.defaultPrevented).toBe(true);
    expect(grid.props("sheet").floatingImages).toEqual(before);
    expect(document.activeElement).toBe(wrapper.get("textarea.cell-editor").element);
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "d" });
    await editor.setValue("draft text");
    const nativeUndo = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.element.dispatchEvent(nativeUndo);
    await flushPromises();
    expect(nativeUndo.defaultPrevented).toBe(false);
    expect(grid.props("sheet").floatingImages).toEqual(before);
    expect(editor.element.value).toBe("draft text");
    await editor.trigger("keydown", { key: "Escape" });
    grid.vm.selectFloatingImages(["first", "second"]);
    await flushPromises();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-picture-selection-action="group"]')).not.toBeNull(),
    );
    const secondButton = document.querySelector<HTMLButtonElement>(
      '[data-picture-selection-action="group"]',
    )!;
    secondButton.focus();
    const homeMountsBeforeSecondGroup = homeSetup.mock.calls.length;
    secondButton.click();
    const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element;
    formula.focus();
    await flushPromises();
    expect(document.activeElement).toBe(formula);
    expect(homeSetup).toHaveBeenCalledTimes(homeMountsBeforeSecondGroup);
    expect(isPictureGroup(grid.props("sheet").floatingImages[0]!)).toBe(true);
  } finally {
    wrapper.unmount();
  }
});
