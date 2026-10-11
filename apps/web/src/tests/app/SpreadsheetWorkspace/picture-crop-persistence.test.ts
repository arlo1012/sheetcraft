import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as history from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, type WorkbookSnapshot } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetPictureCropOverlay from "../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import type { WorkbookStore } from "../../../modules/workbook-persistence/workbookStore";
import { createAppI18n } from "../../../shared/i18n";
import { legacyPicture } from "../../modules/sheet-images/owned-picture-clipboard/fixture";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  getActiveSheet(workbook).floatingImages = [legacyPicture()];
  const before = serializeWorkbook(workbook);
  const store = {
    load: vi.fn(async () => ({ revision: 1, savedAt: 1, snapshot: before })),
    save: vi.fn(async (_snapshot: WorkbookSnapshot) => ({ revision: 2, savedAt: 2 })),
    replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
  } satisfies WorkbookStore;
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: store },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  const grid = wrapper.getComponent(SheetGrid);
  const api = grid.vm as unknown as {
    selectFloatingImages(ids: string[]): void;
    cropImage(): boolean;
    hasPendingEdit(): boolean;
  };
  api.selectFloatingImages([legacyPicture().id]);
  await wrapper.vm.$nextTick();
  expect(api.cropImage()).toBe(true);
  await wrapper.vm.$nextTick();
  await wrapper.getComponent(SheetPictureCropOverlay).trigger("keydown", { key: "ArrowRight" });
  return { wrapper, grid, api, store, before };
}

describe("workspace crop draft persistence boundary", () => {
  test("Ctrl+S flushes the crop into the actual snapshot instead of reporting an old save", async () => {
    const f = await fixture();
    await f.wrapper
      .getComponent(SheetPictureCropOverlay)
      .trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(f.store.save).toHaveBeenCalledOnce();
    const saved = f.store.save.mock.calls[0]![0];
    expect(saved.version).toBe(47);
    expect(saved.sheets[0]!.floatingImages?.[0]).toMatchObject({
      assetId: legacyPicture().assetId,
      frame: { source: { offsetXRatio: 1 / legacyPicture().width } },
    });
    expect(f.api.hasPendingEdit()).toBe(false);
    expect(f.wrapper.get("[data-save-status]").attributes("data-save-status")).toBe("saved");
  });
  test("beforeunload detects a clean document's crop draft before flushing it", async () => {
    const f = await fixture();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect(f.store.save).toHaveBeenCalledOnce();
    expect(f.store.save.mock.calls[0]![0].version).toBe(47);
  });
  test("a rejected crop flush blocks save and retains the draft and unload warning", async () => {
    const f = await fixture();
    const reject = vi.spyOn(history, "executeWorkbookCommand").mockImplementation(() => false);
    await f.wrapper
      .getComponent(SheetPictureCropOverlay)
      .trigger("keydown", { key: "s", ctrlKey: true });
    await flushPromises();
    expect(reject).toHaveBeenCalled();
    expect(f.store.save).not.toHaveBeenCalled();
    expect(f.api.hasPendingEdit()).toBe(true);
    expect(f.wrapper.findComponent(SheetPictureCropOverlay).exists()).toBe(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect(f.store.save).not.toHaveBeenCalled();
  });
});
