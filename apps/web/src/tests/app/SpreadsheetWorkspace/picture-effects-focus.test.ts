import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, watch } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetOwnedPictureGroupLayer from "../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import PictureOwnedLeafRibbon from "../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import PicturePresetChoices from "../../../modules/sheet-images/components/format-pane/PicturePresetChoices.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { pictureGroup } from "../../modules/sheet-images/picture-group-fixture";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

vi.mock("../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("real Workspace owned menu restores new trigger through full Ribbon rebuild and immediate UndoRedo", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-focus");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ id: "focus-workbook", sheetId: "focus-sheet" }),
    group = pictureGroup();
  getActiveSheet(workbook).floatingImages = [group];
  const assets = createMemoryImageAssetStore();
  await assets.put({
    id: "synthetic-asset",
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
  const trace: unknown[] = [];
  const describeFocus = () => ({
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute("aria-label"),
  });
  const onFocus = () => trace.push({ focus: describeFocus() });
  document.addEventListener("focusin", onFocus);
  let stop = () => {};
  try {
    await flushPromises();
    const grid = wrapper.getComponent(SheetGrid);
    grid.vm.selectFloatingImages([group.id]);
    await flushPromises();
    wrapper
      .getComponent(SheetOwnedPictureGroupLayer)
      .vm.$emit("selectPath", [group.id, group.members[0]!.id]);
    await flushPromises();
    const state = (
      wrapper.vm.$ as unknown as {
        setupState: {
          pictureEffectsFocusReturn: () => HTMLElement | null;
          pictureOwnerGeneration: number;
          selectedPictureIds: string[];
          selectedOwnedPicturePath: string[] | null;
          selectedOwnedPictureLeaf: { node: { id: string; assetId: string } } | undefined;
          pictureSourceRibbonOwner: { key: string; displayKey: string } | undefined;
        };
      }
    ).setupState;
    const savedReturn = state.pictureEffectsFocusReturn;
    stop = watch(
      () => [
        state.pictureOwnerGeneration,
        JSON.stringify(state.selectedPictureIds),
        JSON.stringify(state.selectedOwnedPicturePath),
        state.selectedOwnedPictureLeaf?.node.id,
        state.pictureSourceRibbonOwner?.key,
        state.pictureSourceRibbonOwner?.displayKey,
      ],
      (values) =>
        trace.push({
          owner: values,
          savedTargetConnected: savedReturn()?.isConnected ?? null,
          currentTargetConnected: state.pictureEffectsFocusReturn()?.isConnected ?? null,
        }),
      { flush: "sync" },
    );
    const before = JSON.stringify(grid.props("sheet").floatingImages);
    const oldRibbon = wrapper.getComponent(PictureOwnedLeafRibbon),
      oldInstance = oldRibbon.vm.$;
    const viewport = oldRibbon.get<HTMLElement>("[data-ribbon-scroll-viewport]").element;
    viewport.scrollLeft = 500;
    const oldEffect = oldRibbon.props("effectHandler")!;
    const oldTrigger = oldRibbon.get('[aria-label="Effects"]').element;
    await oldRibbon.get('[aria-label="Effects"]').trigger("click");
    await flushPromises();
    (document.querySelector('[data-effect-category="reflection"]') as HTMLElement).click();
    await flushPromises();
    const button = wrapper.getComponent(PicturePresetChoices).findAll("button")[5]!
      .element as HTMLElement;
    button.focus();
    trace.push({ before: describeFocus(), savedTarget: savedReturn()?.isConnected });
    button.click();
    trace.push({ syncAfter: describeFocus(), savedTarget: savedReturn()?.isConnected });
    await nextTick();
    const firstTickTrigger = state.pictureEffectsFocusReturn();
    trace.push({ firstTick: describeFocus(), savedTarget: savedReturn()?.isConnected });
    await flushPromises();
    const current = wrapper.getComponent(PictureOwnedLeafRibbon),
      trigger = current.get('[aria-label="Effects"]').element;
    trace.push({
      settled: describeFocus(),
      savedTarget: savedReturn()?.isConnected,
      newTriggerConnected: trigger.isConnected,
      scrollLeft: current.get<HTMLElement>("[data-ribbon-scroll-viewport]").element.scrollLeft,
    });
    expect(oldTrigger.isConnected).toBe(false);
    expect(current.vm.$).not.toBe(oldInstance);
    expect(document.activeElement, JSON.stringify(trace)).toBe(trigger);
    expect(firstTickTrigger).toBe(trigger);
    expect(oldEffect({ category: "reflection", value: { kind: "none" } })).toBe(false);
    const after = JSON.stringify(grid.props("sheet").floatingImages);
    expect(after).not.toBe(before);
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(JSON.stringify(grid.props("sheet").floatingImages)).toBe(before);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Effects");
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Effects");
    expect(JSON.stringify(grid.props("sheet").floatingImages)).toBe(after);
    const oldDisplay = wrapper.getComponent(PictureOwnedLeafRibbon).props("displayOwnerKey");
    const oldOwnerEffect = wrapper.getComponent(PictureOwnedLeafRibbon).props("effectHandler")!;
    grid.vm.selectFloatingImages([]);
    await flushPromises();
    expect(wrapper.findComponent(PictureOwnedLeafRibbon).exists()).toBe(false);
    grid.vm.selectFloatingImages([group.id]);
    await flushPromises();
    wrapper
      .getComponent(SheetOwnedPictureGroupLayer)
      .vm.$emit("selectPath", [group.id, group.members[0]!.id]);
    await flushPromises();
    expect(wrapper.getComponent(PictureOwnedLeafRibbon).props("displayOwnerKey")).not.toBe(
      oldDisplay,
    );
    expect(oldOwnerEffect({ category: "reflection", value: { kind: "none" } })).toBe(false);
  } finally {
    stop();
    document.removeEventListener("focusin", onFocus);
    wrapper.unmount();
  }
});
