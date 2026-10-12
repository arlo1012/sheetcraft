import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, cloneFloatingImage, getActiveSheet } from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import PictureFormatPane from "../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import PictureToolbar from "../../../modules/sheet-images/components/PictureToolbar.vue";
import { framedPicture } from "../../modules/sheet-images/framed-picture-fixture";
import { getPictureViewRect } from "../../../modules/sheet-images/picture-view-operations";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";
import { legacyPicture } from "../../modules/sheet-images/owned-picture-clipboard/fixture";

class Decoder {
  static instances: Decoder[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  src = "";
  complete = false;
  constructor() {
    Decoder.instances.push(this);
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}
const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(framed = false, openPane = true) {
  Decoder.instances = [];
  vi.stubGlobal("Image", Decoder);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:current-picture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const picture = framed ? framedPicture() : legacyPicture();
  getActiveSheet(workbook).floatingImages = [picture];
  const snapshot = serializeWorkbook(workbook);
  const store = {
    load: vi.fn(async () => ({ revision: 1, savedAt: 1, snapshot })),
    save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
    replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
  };
  const imageAssetStore = createMemoryImageAssetStore();
  await imageAssetStore.put({
    id: picture.assetId,
    mimeType: "image/png",
    width: 1,
    height: 1,
    blob: new Blob([new Uint8Array(actualPng)], { type: "image/png" }),
  });
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: store, imageAssetStore },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  const grid = wrapper.getComponent(SheetGrid);
  (grid.vm as unknown as { selectFloatingImages(ids: string[]): void }).selectFloatingImages([
    picture.id,
  ]);
  await flushPromises();
  if (openPane) {
    grid.vm.$emit("format-owned-picture", undefined, grid.props("sheet"));
    await flushPromises();
  }
  expect(wrapper.findComponent(PictureFormatPane).exists()).toBe(openPane);
  const decoder = Decoder.instances.find(
    (entry) => entry.src === "blob:current-picture" && entry.onerror !== null,
  )!;
  expect(decoder.src).toBe("blob:current-picture");
  return { wrapper, grid, decoder, picture, store, snapshot };
}

describe("workspace selected original-size source", () => {
  test("framed Restore Original uses a ready source even without opening the pane and undoes exactly", async () => {
    const f = await fixture(true, false);
    expect(f.wrapper.getComponent(PictureToolbar).props("canRestore")).toBe(false);
    expect(f.store.save).not.toHaveBeenCalled();
    f.decoder.naturalWidth = 360;
    f.decoder.naturalHeight = 240;
    f.decoder.onload?.();
    await flushPromises();
    const sheet = f.grid.props("sheet"),
      before = sheet.floatingImages.map(cloneFloatingImage),
      context = f.grid.vm.getPictureFrameContext(sheet)!;
    const rect = getPictureViewRect(sheet.floatingImages[0]!, context.layout, context)!;
    const toolbar = f.wrapper.getComponent(PictureToolbar);
    expect(toolbar.props("canRestore")).toBe(true);
    expect(toolbar.props("restoreHandler")!()).toBe(true);
    await flushPromises();
    const after = sheet.floatingImages.map(cloneFloatingImage);
    expect(getPictureViewRect(after[0]!, context.layout, context)).toEqual({
      x: rect.x + (rect.width - 360) / 2,
      y: rect.y + (rect.height - 240) / 2,
      width: 360,
      height: 240,
    });
    expect(after[0]).toMatchObject({
      assetId: f.picture.assetId,
      frame: {
        angleDeg: 0,
        source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      },
    });
    await f.wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(sheet.floatingImages).toEqual(before);
    await f.wrapper.get("textarea.cell-editor").trigger("keydown", { key: "y", ctrlKey: true });
    expect(sheet.floatingImages).toEqual(after);
  });
  test("a captured original reset cannot target a newer selection", async () => {
    const f = await fixture(true, false);
    f.decoder.naturalWidth = 360;
    f.decoder.naturalHeight = 240;
    f.decoder.onload?.();
    await flushPromises();
    const reset = f.wrapper.getComponent(PictureToolbar).props("restoreHandler")!;
    f.grid.vm.selectFloatingImages([]);
    await flushPromises();
    const before = f.grid.props("sheet").floatingImages.map(cloneFloatingImage);
    expect(reset()).toBe(false);
    expect(f.grid.props("sheet").floatingImages).toEqual(before);
    expect(f.store.save).not.toHaveBeenCalled();
  });
  test("identical selection notifications keep the in-flight decoder and loading has no document side effect", async () => {
    const f = await fixture(),
      count = Decoder.instances.length;
    f.grid.vm.$emit("selected-floating-image-change", f.picture.id, [f.picture.id]);
    await flushPromises();
    expect(Decoder.instances).toHaveLength(count);
    expect(f.decoder.src).toBe("blob:current-picture");
    f.decoder.naturalWidth = 360;
    f.decoder.naturalHeight = 240;
    f.decoder.onload?.();
    await flushPromises();
    const pane = f.wrapper.getComponent(PictureFormatPane);
    expect(pane.props("snapshot")!.originalSizePt).toEqual({ width: 270, height: 180 });
    expect(pane.props("intrinsicStatus")).toBe("ready");
    expect(f.grid.props("sheet").floatingImages).toEqual(f.snapshot.sheets[0]!.floatingImages);
    expect(f.store.save).not.toHaveBeenCalled();
  });
  test("identical notifications do not retry an unavailable source; explicit retry does", async () => {
    const f = await fixture(),
      count = Decoder.instances.length;
    f.decoder.onerror?.();
    await flushPromises();
    expect(f.wrapper.getComponent(PictureFormatPane).props("intrinsicStatus")).toBe("unavailable");
    f.grid.vm.$emit("selected-floating-image-change", f.picture.id, [f.picture.id]);
    await flushPromises();
    expect(Decoder.instances).toHaveLength(count);
    await f.wrapper.get("[data-picture-original-retry]").trigger("click");
    expect(Decoder.instances).toHaveLength(count + 1);
    expect(f.store.save).not.toHaveBeenCalled();
  });
});
