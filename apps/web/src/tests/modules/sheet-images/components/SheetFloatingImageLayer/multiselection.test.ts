import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import SheetPictureSelectionToolbar from "../../../../../modules/sheet-images/components/SheetPictureSelectionToolbar.vue";
import { createAppI18n } from "../../../../../shared/i18n";
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture() {
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 30,
      columnCount: 20,
      rowHeight: 20,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 20 }),
    viewportSize: { width: 400, height: 240 },
  });
  const base: FloatingImage = {
    id: "first",
    assetId: "asset",
    altText: "Synthetic",
    anchor: { row: 3, column: 1 },
    offsetX: 20,
    offsetY: 10,
    width: 120,
    height: 60,
  };
  const images = [
    base,
    { ...base, id: "second", anchor: { row: 3, column: 3 }, width: 60, height: 30 },
  ];
  const wrapper = mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      owner: {},
      images,
      layout,
      assetUrls: new Map([["asset", "blob:synthetic"]]),
      selectedImageId: "second",
      selectedImageIds: ["first", "second"],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, images, layout };
}
async function toolbar(wrapper: VueWrapper) {
  await vi.waitFor(() =>
    expect(wrapper.findComponent(SheetPictureSelectionToolbar).exists()).toBe(true),
  );
  return wrapper.getComponent(SheetPictureSelectionToolbar);
}
function action(name: string): HTMLButtonElement {
  return document.querySelector(`[data-picture-selection-action="${name}"]`)!;
}
describe("picture multiselection lifecycle", () => {
  test("one-click grouping preserves the selected IDs and cannot run from an old owner", async () => {
    const { wrapper } = fixture();
    const old = await toolbar(wrapper);
    action("group").click();
    expect(wrapper.emitted("group")).toEqual([[["first", "second"]]]);
    const key = old.props("selectionKey");
    await wrapper.setProps({ owner: {} });
    await toolbar(wrapper);
    old.vm.$emit("group", key);
    expect(wrapper.emitted("group")).toHaveLength(1);
  });
  test("the crosshair alignment centers each member on both axes in one update", async () => {
    const { wrapper, layout } = fixture();
    await toolbar(wrapper);
    action("both").click();
    expect(wrapper.emitted("updateMany")).toHaveLength(1);
    const next = wrapper.emitted("updateMany")![0]![0] as FloatingImage[];
    expect(next.map((image) => getFloatingImageSheetRect(image, layout))).toEqual([
      { x: 150, y: 70, width: 120, height: 60 },
      { x: 180, y: 85, width: 60, height: 30 },
    ]);
  });
  test("last-selected alignment uses the actual active member rather than collection order", async () => {
    const { wrapper, layout } = fixture();
    const bar = await toolbar(wrapper);
    await wrapper.setProps({ selectedImageId: "first" });
    const current = await toolbar(wrapper);
    current.vm.$emit("align", "right", "last-selected", current.props("selectionKey"));
    const next = wrapper.emitted("updateMany")![0]![0] as FloatingImage[];
    expect(next.map((image) => getFloatingImageSheetRect(image, layout)!.x)).toEqual([100, 160]);
    bar.vm.$emit("align", "left", "selection", bar.props("selectionKey"));
    expect(wrapper.emitted("updateMany")).toHaveLength(1);
  });
  test("three-member distribution keeps outer edges and assigns equal gaps atomically", async () => {
    const { wrapper, images, layout } = fixture();
    const third = {
      ...images[0]!,
      id: "third",
      anchor: { row: 3, column: 2 },
      offsetX: 70,
      width: 30,
      height: 30,
    };
    await wrapper.setProps({
      images: [...images, third],
      selectedImageIds: ["first", "second", "third"],
    });
    await toolbar(wrapper);
    expect(action("horizontal").disabled).toBe(false);
    action("horizontal").click();
    const rects = (wrapper.emitted("updateMany")![0]![0] as FloatingImage[]).map((image) =>
      getFloatingImageSheetRect(image, layout)!,
    );
    expect(rects.map((rect) => rect.x)).toEqual([100, 225, 260]);
    expect(rects[1]!.x - rects[0]!.x - rects[0]!.width).toBe(5);
    expect(rects[2]!.x - rects[1]!.x - rects[1]!.width).toBe(5);
  });
  test("missing or hidden-anchor targets are not silently skipped by alignment", () => {
    const { wrapper, images } = fixture();
    const vm = wrapper.vm as unknown as { arrangeImages: (ids: string[], action: "left") => void };
    vm.arrangeImages(["first", "missing"], "left");
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    expect(wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(images[0]!.offsetX).toBe(20);
  });
  test("persistent grouping switches to a shared frame and removes the multi toolbar", async () => {
    const { wrapper, images } = fixture();
    await toolbar(wrapper);
    await wrapper.setProps({ images: images.map((image) => ({ ...image, groupId: "group" })) });
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    expect(wrapper.find("[data-floating-image-group]").exists()).toBe(true);
    expect(document.querySelector("[data-picture-selection-toolbar]")).toBeNull();
  });
  test("Escape returns selection ownership to the grid without changing pictures", async () => {
    const { wrapper } = fixture();
    await toolbar(wrapper);
    action("left").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(wrapper.emitted("select")).toEqual([[null]]);
    expect(wrapper.emitted("updateMany")).toBeUndefined();
  });
  test("a refused update callback keeps picture snapshots and reports one failure", async () => {
    const { wrapper, images } = fixture();
    const before = structuredClone(images);
    const apply = vi.fn(() => false);
    await wrapper.setProps({ applyUpdateMany: apply });
    await toolbar(wrapper);
    action("both").click();
    expect(apply).toHaveBeenCalledOnce();
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    expect(wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(images).toEqual(before);
  });
  test("a successful callback is the single authoritative update route", async () => {
    const { wrapper } = fixture();
    const apply = vi.fn(() => true);
    await wrapper.setProps({ applyUpdateMany: apply });
    await toolbar(wrapper);
    action("left").click();
    expect(apply).toHaveBeenCalledOnce();
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    expect(wrapper.emitted("feedback")).toBeUndefined();
  });
  test("clamped pointer and keyboard moves preserve original free anchors without updates", async () => {
    const { wrapper, images } = fixture();
    const originals = [
      { ...images[0]!, anchor: { row: 0, column: 0 }, offsetX: 0, offsetY: 0 },
      { ...images[1]!, anchor: { row: 0, column: 0 }, offsetX: 100, offsetY: 10 },
    ];
    await wrapper.setProps({ images: originals });
    const first = wrapper.get('[data-floating-image-id="first"]');
    const surface = wrapper.get("[data-floating-image-layer]");
    await first.trigger("pointerdown", { button: 0, pointerId: 70, clientX: 10, clientY: 10 });
    await surface.trigger("pointermove", { pointerId: 70, clientX: -10, clientY: 10 });
    await surface.trigger("pointerup", { pointerId: 70 });
    await first.trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    expect(originals[1]!.offsetX).toBe(100);
  });
  test("satisfied alignment does not canonicalize free anchors or invoke the writer", async () => {
    const { wrapper, images } = fixture();
    const apply = vi.fn(() => true);
    await wrapper.setProps({
      images: images.map((image) => ({ ...image, anchor: { row: 0, column: 0 }, offsetX: 100 })),
      applyUpdateMany: apply,
    });
    await toolbar(wrapper);
    action("left").click();
    expect(apply).not.toHaveBeenCalled();
  });

  test("grid snapping uses the acknowledged writer and keeps originals on refusal", () => {
    const { wrapper, images } = fixture();
    const before = structuredClone(images);
    const apply = vi.fn(() => false);
    return wrapper.setProps({ applyUpdateMany: apply }).then(() => {
      (
        wrapper.vm as unknown as { arrangeImages: (ids: string[], action: "grid") => void }
      ).arrangeImages(["first", "second"], "grid");
      expect(apply).toHaveBeenCalledOnce();
      expect(wrapper.emitted("updateMany")).toBeUndefined();
      expect(wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
      expect(images).toEqual(before);
    });
  });
  test("hidden object members remain part of shared rotation and flip", async () => {
    const { wrapper, images } = fixture();
    await wrapper.setProps({ images: [images[0]!, { ...images[1]!, hidden: true }] });
    const vm = wrapper.vm as unknown as {
      rotateImage: (turns: 1) => void;
      flipImage: (axis: "horizontal") => void;
    };
    vm.rotateImage(1);
    vm.flipImage("horizontal");
    expect(wrapper.emitted("updateMany")).toHaveLength(2);
    for (const event of wrapper.emitted("updateMany")!) {
      const next = event[0] as FloatingImage[];
      expect(next.map((image) => image.id)).toEqual(["first", "second"]);
      expect(next[1]!.hidden).toBe(true);
    }
  });
  test("an unplaceable selected member rejects the entire keyboard move", async () => {
    const { wrapper, images } = fixture();
    const layout = createSheetViewportLayout({
      geometry: createSheetGeometry({
        rowCount: 30,
        columnCount: 20,
        rowHeight: 20,
        columnWidth: 80,
      }),
      rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 20, hiddenRows: [4] }),
      viewportSize: { width: 400, height: 240 },
    });
    await wrapper.setProps({
      layout,
      images: [images[0]!, { ...images[1]!, anchor: { row: 4, column: 3 } }],
    });
    await wrapper.get('[data-floating-image-id="first"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    expect(wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
  });
});
