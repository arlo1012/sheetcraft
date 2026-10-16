import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheet,
  insertSheet,
  getActiveSheet,
  cloneFloatingImage,
  setCellValue,
  getCellValue,
} from "@sheetcraft/core/workbook";
import type { WorkbookSession } from "@sheetcraft/core/history";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import HomeFormatToolbar from "../../../modules/home-tools/components/HomeFormatToolbar.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

function workspaceState(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: WorkbookSession;
    selectedPictureIds: string[];
    selectSheet(id: string): void;
    cellEditSession: CellEditSession;
    executeCommand(command: WorkbookCommand): boolean;
  };
}

async function ungroupFixture(nested = false) {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ungroup-focus");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ id: "ungroup-focus", sheetId: "owner" });
  const sheet = getActiveSheet(workbook);
  setCellValue(sheet, { row: 0, column: 0 }, "keep this cell");
  insertSheet(workbook, createSheet("Other", "other"));
  sheet.floatingImages = (nested ? ["first", "second", "third"] : ["first", "second"]).map(
    (id, index) => ({
      id,
      assetId: "asset",
      altText: id,
      anchor: { row: 2, column: 2 + index * 2 },
      offsetX: 0,
      offsetY: 0,
      width: 120,
      height: 80,
    }),
  );
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
    global: { plugins: [createAppI18n("en-US")] },
  });
  await flushPromises();
  const grid = wrapper.getComponent(SheetGrid);
  grid.vm.selectFloatingImages(["first", "second"]);
  await flushPromises();
  const group = document.querySelector<HTMLButtonElement>(
    '[data-picture-selection-action="group"]',
  )!;
  group.focus();
  group.click();
  await flushPromises();
  if (nested) {
    grid.vm.selectFloatingImages(grid.props("sheet").floatingImages.map((root) => root.id));
    await flushPromises();
    const outer = document.querySelector<HTMLButtonElement>(
      '[data-picture-selection-action="group"]',
    )!;
    outer.focus();
    outer.click();
    await flushPromises();
  }
  const button = document.querySelector<HTMLButtonElement>(
    '[data-picture-group-action="ungroup"]',
  )!;
  expect(button).not.toBeNull();
  return { wrapper, grid, button, state: workspaceState(wrapper) };
}

async function historyKey(shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(event);
  await flushPromises();
  expect(event.defaultPrevented).toBe(true);
}

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

test.each([false, true])(
  "Ungroup preserves multi-selection, continuous history and Delete ownership (nested=%s)",
  async (nested) => {
    const { wrapper, grid, button, state } = await ungroupFixture(nested);
    try {
      const grouped = grid.props("sheet").floatingImages.map(cloneFloatingImage);
      const root = grouped[0]!;
      if (!isPictureGroup(root)) throw new Error("Expected the selected outer group");
      const selectedIds = root.members.map((member) => member.id);
      button.focus();
      button.click();
      await flushPromises();
      const ungrouped = grid.props("sheet").floatingImages.map(cloneFloatingImage);
      expect(button.isConnected).toBe(false);
      expect(state.selectedPictureIds).toEqual(selectedIds);
      expect(document.activeElement?.hasAttribute("data-floating-image-selected")).toBe(true);
      await historyKey();
      expect(grid.props("sheet").floatingImages).toEqual(grouped);
      expect(document.activeElement).toBe(wrapper.get("textarea.cell-editor").element);
      await historyKey(true);
      expect(grid.props("sheet").floatingImages).toEqual(ungrouped);
      await historyKey();
      expect(grid.props("sheet").floatingImages).toEqual(grouped);

      // Select the restored group through the public Grid selection API, then
      // repeat the real Ungroup action before checking destructive-key routing.
      grid.vm.selectFloatingImages([grouped[0]!.id]);
      await flushPromises();
      const again = document.querySelector<HTMLButtonElement>(
        '[data-picture-group-action="ungroup"]',
      )!;
      again.focus();
      again.click();
      await flushPromises();
      expect(state.selectedPictureIds).toEqual(selectedIds);
      const remove = new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        cancelable: true,
      });
      document.activeElement!.dispatchEvent(remove);
      await flushPromises();
      expect(remove.defaultPrevented).toBe(true);
      expect(grid.props("sheet").floatingImages).toEqual([]);
      expect(getCellValue(grid.props("sheet"), { row: 0, column: 0 })).toBe("keep this cell");
    } finally {
      wrapper.unmount();
    }
  },
);

test.each(["formula", "pointer", "owner", "composition"] as const)(
  "Ungroup focus return is cancelled by a newer %s interaction",
  async (interruption) => {
    const { wrapper, grid, button, state } = await ungroupFixture();
    try {
      button.focus();
      button.click();
      const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element;
      if (interruption === "formula") formula.focus();
      if (interruption === "pointer")
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      if (interruption === "owner") state.selectSheet("other");
      if (interruption === "composition") {
        state.cellEditSession.begin(
          { sheetId: "owner", address: { row: 0, column: 0 }, input: "keep this cell" },
          { surface: "formula-bar", mode: "append" },
        );
        state.cellEditSession.startComposition();
        expect(state.cellEditSession.state.composing).toBe(true);
      }
      await flushPromises();
      expect(document.activeElement?.hasAttribute("data-floating-image-selected")).toBe(false);
      if (interruption === "formula") expect(document.activeElement).toBe(formula);
      if (interruption === "owner") expect(grid.props("sheet").id).toBe("other");
      else expect(state.selectedPictureIds).toEqual(["first", "second"]);
    } finally {
      state.cellEditSession.cancel();
      wrapper.unmount();
    }
  },
);

test.each(["formula", "pointer"] as const)(
  "Undo after Ungroup does not override a newer %s interaction",
  async (interruption) => {
    const { wrapper, grid, button } = await ungroupFixture();
    try {
      button.focus();
      button.click();
      await flushPromises();
      const previous = document.activeElement!;
      previous.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
      );
      const formula = wrapper.get<HTMLTextAreaElement>("[data-formula-input]").element;
      if (interruption === "formula") formula.focus();
      else document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await flushPromises();
      expect(previous.isConnected).toBe(false);
      expect(isPictureGroup(grid.props("sheet").floatingImages[0]!)).toBe(true);
      expect(document.activeElement).not.toBe(wrapper.get("textarea.cell-editor").element);
      if (interruption === "formula") expect(document.activeElement).toBe(formula);
    } finally {
      wrapper.unmount();
    }
  },
);

test("Undo of a focused leaf keeps surviving picture selection and Delete away from cells", async () => {
  const { wrapper, grid, button, state } = await ungroupFixture();
  try {
    button.focus();
    button.click();
    await flushPromises();
    const image = cloneFloatingImage(grid.props("sheet").floatingImages[0]!);
    expect(
      state.executeCommand({
        type: "setFloatingImage",
        sheetId: "owner",
        image: { ...image, id: "temporary" },
      }),
    ).toBe(true);
    await flushPromises();
    grid.vm.selectFloatingImages(["temporary", "first"]);
    await flushPromises();
    wrapper.get<HTMLElement>('[data-floating-image-id="temporary"]').element.focus();
    await historyKey();
    expect(state.selectedPictureIds).toEqual(["first"]);
    expect(document.activeElement?.getAttribute("data-floating-image-id")).toBe("first");
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushPromises();
    expect(grid.props("sheet").floatingImages.map((root) => root.id)).toEqual(["second"]);
    expect(getCellValue(grid.props("sheet"), { row: 0, column: 0 })).toBe("keep this cell");
  } finally {
    wrapper.unmount();
  }
});
