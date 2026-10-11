import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LegacyFloatingImage as FloatingImage } from "@sheetcraft/core/workbook";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
async function fixture(
  imageFields?: Partial<FloatingImage>,
  freeze?: { rows: number; columns: number },
  scale?: number,
) {
  const image: FloatingImage = {
    id: "image",
    assetId: "asset",
    altText: "Diagram",
    anchor: { row: 3, column: 1 },
    offsetX: 20,
    offsetY: 10,
    width: 120,
    height: 60,
    ...imageFields,
  };
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 20,
      columnCount: 10,
      rowHeight: 20,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20 }),
    viewportSize: { width: 400, height: 240 },
    freeze,
  });
  const wrapper = mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      images: [image],
      layout,
      assetUrls: new Map([["asset", "blob:asset"]]),
      selectedImageId: image.id,
      scale,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await vi.waitFor(() =>
    expect(document.querySelector('[data-floating-image-toolbar-action="crop"]')).not.toBeNull(),
  );
  return { wrapper, image, layout };
}
async function toolbarAction(action: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-floating-image-toolbar-action="${action}"]`,
  );
  expect(button).not.toBeNull();
  button!.click();
  await flushPromises();
  if (action === "crop")
    await vi.waitFor(() =>
      expect(document.querySelector("[data-image-crop-overlay]")).not.toBeNull(),
    );
}
async function cropFromRight(wrapper: VueWrapper, delta: number) {
  await toolbarAction("crop");
  const layer = wrapper.get("[data-floating-image-layer]");
  await wrapper
    .get('[data-image-crop-handle="e"]')
    .trigger("pointerdown", { button: 0, pointerId: 5, clientX: 220, clientY: 100 });
  await layer.trigger("pointermove", { pointerId: 5, clientX: 220 + delta, clientY: 100 });
  await layer.trigger("pointerup", { pointerId: 5 });
}

describe("floating image editing", () => {
  test("defers a crop until confirmation and commits the displayed frame once", async () => {
    const { wrapper, layout } = await fixture();
    await cropFromRight(wrapper, -60);
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(0);
    expect(wrapper.findAll("[data-image-crop-handle]")).toHaveLength(8);
    expect(wrapper.emitted("update")).toBeUndefined();
    await toolbarAction("apply-crop");
    const updates = wrapper.emitted("update")!;
    expect(updates).toHaveLength(1);
    const image = updates[0]![0] as FloatingImage;
    expect(image.transform).toEqual({ crop: { x: 0, y: 0, width: 0.5, height: 1 } });
    expect(getFloatingImageSheetRect(image, layout)).toEqual({
      x: 100,
      y: 70,
      width: 60,
      height: 60,
    });
    expect(wrapper.find("[data-image-crop-overlay]").exists()).toBe(false);
  });
  test("maps a crop after a clockwise turn back to the original source", async () => {
    const { wrapper } = await fixture({ transform: { rotation: 90 } });
    await cropFromRight(wrapper, -60);
    await wrapper.get('[data-floating-image-id="image"]').trigger("keydown", { key: "Enter" });
    expect((wrapper.emitted("update")![0]![0] as FloatingImage).transform).toEqual({
      crop: { x: 0, y: 0.5, width: 1, height: 0.5 },
      rotation: 90,
    });
  });
  test("converts scaled crop pointer movement to the image crop selection", async () => {
    const { wrapper } = await fixture(undefined, undefined, 2);
    await toolbarAction("crop");
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-image-crop-handle="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 15, clientX: 220, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 15, clientX: 100, clientY: 100 });
    await layer.trigger("pointerup", { pointerId: 15 });
    await toolbarAction("apply-crop");

    expect((wrapper.emitted("update")![0]![0] as FloatingImage).transform).toEqual({
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
    });
  });
  test("Escape and selection changes cancel an uncommitted crop", async () => {
    const { wrapper } = await fixture();
    await cropFromRight(wrapper, -60);
    await wrapper.get('[data-floating-image-id="image"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.find("[data-image-crop-overlay]").exists()).toBe(false);
    await cropFromRight(wrapper, -40);
    await wrapper.setProps({ selectedImageId: null });
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.find("[data-image-crop-overlay]").exists()).toBe(false);
  });
  test("uses one rotation update and restores intrinsic dimensions", async () => {
    const { wrapper, image } = await fixture();
    (
      wrapper.vm as unknown as {
        cacheImageSize: (assetId: string, size: { width: number; height: number }) => void;
      }
    ).cacheImageSize(image.assetId, { width: 240, height: 160 });
    await toolbarAction("rotate");
    document.querySelector<HTMLElement>('[data-floating-image-rotate="right"]')!.click();
    await flushPromises();
    const rotated = wrapper.emitted("update")![0]![0] as FloatingImage;
    expect(rotated).toMatchObject({ width: 60, height: 120, transform: { rotation: 90 } });
    await wrapper.setProps({ images: [{ ...image, ...rotated }] });
    await toolbarAction("restore");
    const restored = wrapper.emitted("update")![1]![0] as FloatingImage;
    expect(restored.width).toBe(240);
    expect(restored.height).toBe(160);
    expect(restored.transform).toBeUndefined();
  });
  test("keeps crop controls unique across frozen panes", async () => {
    const { wrapper } = await fixture(
      { anchor: { row: 0, column: 0 }, offsetX: 40, offsetY: 10, width: 80, height: 20 },
      { rows: 1, columns: 1 },
    );
    await toolbarAction("crop");
    expect(wrapper.findAll("[data-image-crop-overlay]")).toHaveLength(4);
    expect(wrapper.findAll("[data-image-crop-handle]")).toHaveLength(8);
  });
});
