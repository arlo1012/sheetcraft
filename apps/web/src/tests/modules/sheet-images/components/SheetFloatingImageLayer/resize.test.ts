import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
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

function fixture(options?: {
  image?: Partial<FloatingImage>;
  freeze?: { rows: number; columns: number };
}) {
  const image: FloatingImage = {
    id: "image",
    assetId: "asset",
    altText: "Diagram",
    anchor: { row: 3, column: 1 },
    offsetX: 20,
    offsetY: 10,
    width: 120,
    height: 60,
    lockAspectRatio: false,
    ...options?.image,
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
    freeze: options?.freeze,
  });
  const wrapper = mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      images: [image],
      layout,
      assetUrls: new Map([["asset", "blob:asset"]]),
      selectedImageId: image.id,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, image, layout };
}

describe("floating image resize controls", () => {
  test("resizes a selected group with one atomic update and preserved member spacing", async () => {
    const { wrapper, image, layout } = fixture({ image: { groupId: "group" } });
    const second = { ...image, id: "second", anchor: { row: 3, column: 3 }, width: 60, height: 30 };
    await wrapper.setProps({ images: [image, second], selectedImageIds: [image.id, second.id] });
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    const handle = wrapper.get('[data-floating-image-group] [data-image-resize="e"]');
    const layer = wrapper.get("[data-floating-image-layer]");
    await handle.trigger("pointerdown", { button: 0, pointerId: 14, clientX: 320, clientY: 80 });
    await layer.trigger("pointermove", { pointerId: 14, clientX: 430, clientY: 80 });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    await layer.trigger("pointerup", { pointerId: 14 });
    expect(wrapper.emitted("update")).toBeUndefined();
    const updates = wrapper.emitted("updateMany")!;
    expect(updates).toHaveLength(1);
    const [first, last] = updates[0]![0] as FloatingImage[];
    expect(first!.width).toBe(180);
    expect(last!.width).toBe(90);
    expect(
      getFloatingImageSheetRect(last!, layout)!.x - getFloatingImageSheetRect(first!, layout)!.x,
    ).toBe(240);
  });
  test("Ctrl-multiselection shows each member's handles and resizes at independent origins", async () => {
    const { wrapper, image, layout } = fixture({ image: { lockAspectRatio: true } });
    const second = { ...image, id: "second", anchor: { row: 3, column: 3 }, width: 60, height: 30 };
    await wrapper.setProps({ images: [image, second], selectedImageIds: [image.id, second.id] });
    expect(wrapper.findAll("[data-floating-image-group]")).toHaveLength(0);
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(16);
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-floating-image-id="image"] [data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 17, clientX: 220, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 17, clientX: 260, clientY: 100 });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    await layer.trigger("pointerup", { pointerId: 17 });
    expect(wrapper.emitted("updateMany")).toHaveLength(1);
    const images = wrapper.emitted("updateMany")![0]![0] as FloatingImage[];
    expect(images.map((entry) => getFloatingImageSheetRect(entry, layout))).toEqual([
      { x: 100, y: 70, width: 160, height: 60 },
      { x: 260, y: 70, width: 80, height: 30 },
    ]);
  });
  test("a replaced owner or changed secondary member cancels the entire pending gesture", async () => {
    const { wrapper, image } = fixture();
    const second = { ...image, id: "second", anchor: { row: 3, column: 3 } };
    const owner = {};
    await wrapper.setProps({
      owner,
      images: [image, second],
      selectedImageIds: [image.id, second.id],
    });
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-floating-image-id="image"] [data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 18, clientX: 220, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 18, clientX: 260, clientY: 100 });
    await wrapper.setProps({ images: [image, { ...second, width: 200 }] });
    await layer.trigger("pointerup", { pointerId: 18 });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
    await wrapper
      .get('[data-floating-image-id="image"] [data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 19, clientX: 220, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 19, clientX: 260, clientY: 100 });
    await wrapper.setProps({ owner: {} });
    await layer.trigger("pointerup", { pointerId: 19 });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
  });

  test.each(["membership", "selection"] as const)(
    "a pending group resize cancels when %s changes",
    async (reason) => {
      const { wrapper, image } = fixture({ image: { groupId: "group" } });
      const second = { ...image, id: "second", anchor: { row: 3, column: 3 } };
      await wrapper.setProps({ images: [image, second], selectedImageIds: [image.id, second.id] });
      const layer = wrapper.get("[data-floating-image-layer]");
      await wrapper
        .get('[data-floating-image-group] [data-image-resize="e"]')
        .trigger("pointerdown", { button: 0, pointerId: 80, clientX: 220, clientY: 100 });
      await layer.trigger("pointermove", { pointerId: 80, clientX: 260, clientY: 100 });
      if (reason === "membership")
        await wrapper.setProps({ images: [image, second, { ...image, id: "third" }] });
      else await wrapper.setProps({ selectedImageId: null, selectedImageIds: [] });
      await layer.trigger("pointerup", { pointerId: 80 });
      expect(wrapper.emitted("updateMany")).toBeUndefined();
    },
  );
  test("an orthogonal-only multiselection side drag is a no-op", async () => {
    const { wrapper, image } = fixture({ image: { width: 10, height: 5, offsetX: 100 } });
    await wrapper.setProps({
      images: [image, { ...image, id: "second" }],
      selectedImageIds: [image.id, "second"],
    });
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-floating-image-id="image"] [data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 81, clientX: 220, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 81, clientX: 220, clientY: 120 });
    await layer.trigger("pointerup", { pointerId: 81 });
    expect(wrapper.emitted("updateMany")).toBeUndefined();
  });

  test.each([
    ["n", 15, -20, { x: 100, y: 50, width: 120, height: 80 }],
    ["s", 15, 20, { x: 100, y: 70, width: 120, height: 80 }],
    ["w", -40, 15, { x: 60, y: 70, width: 160, height: 60 }],
    ["e", 40, 15, { x: 100, y: 70, width: 160, height: 60 }],
  ] as const)("keeps locked side %s resize on one axis", async (direction, x, y, expected) => {
    const { wrapper, layout } = fixture({ image: { lockAspectRatio: true } });
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper.get(`[data-image-resize="${direction}"]`).trigger("pointerdown", {
      button: 0,
      pointerId: 12,
      clientX: 200,
      clientY: 100,
    });
    await layer.trigger("pointermove", { pointerId: 12, clientX: 200 + x, clientY: 100 + y });
    await layer.trigger("pointerup", { pointerId: 12 });
    const updates = wrapper.emitted("update")!;
    expect(updates).toHaveLength(1);
    expect(getFloatingImageSheetRect(updates[0]![0] as FloatingImage, layout)).toEqual(expected);
  });

  test.each([true, false])("uses aspect lock %s only for corner resize", async (locked) => {
    const { wrapper, layout } = fixture({ image: { lockAspectRatio: locked } });
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper.get('[data-image-resize="se"]').trigger("pointerdown", {
      button: 0,
      pointerId: 13,
      clientX: 220,
      clientY: 130,
    });
    await layer.trigger("pointermove", { pointerId: 13, clientX: 260, clientY: 140 });
    await layer.trigger("pointerup", { pointerId: 13 });
    expect(wrapper.emitted("update")).toHaveLength(1);
    const rect = getFloatingImageSheetRect(
      wrapper.emitted("update")![0]![0] as FloatingImage,
      layout,
    )!;
    expect(rect).toEqual({ x: 100, y: 70, width: 160, height: locked ? 80 : 70 });
  });

  test("exposes all eight controls with their resize directions", () => {
    const { wrapper } = fixture();
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    expect(wrapper.get('[data-image-resize="w"]').attributes("aria-label")).toBe(
      "Resize image from left",
    );
    expect(wrapper.get('[data-image-resize="ne"]').attributes("aria-label")).toBe(
      "Resize image from top right",
    );
  });

  test.each([
    ["n", 15, -20, { x: 100, y: 50, width: 120, height: 80 }],
    ["s", 15, 20, { x: 100, y: 70, width: 120, height: 80 }],
    ["w", -40, 15, { x: 60, y: 70, width: 160, height: 60 }],
    ["e", 40, 15, { x: 100, y: 70, width: 160, height: 60 }],
    ["nw", -40, -10, { x: 60, y: 60, width: 160, height: 70 }],
    ["ne", 40, -10, { x: 100, y: 60, width: 160, height: 70 }],
    ["sw", -40, 10, { x: 60, y: 70, width: 160, height: 70 }],
    ["se", 40, 10, { x: 100, y: 70, width: 160, height: 70 }],
  ] as const)("resizes from %s with one committed update", async (direction, x, y, expected) => {
    const { wrapper, layout } = fixture();
    const handle = wrapper.get(`[data-image-resize="${direction}"]`);
    const layer = wrapper.get("[data-floating-image-layer]");
    await handle.trigger("pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 1, clientX: 200 + x, clientY: 100 + y });
    expect(wrapper.emitted("update")).toBeUndefined();
    await layer.trigger("pointerup", { pointerId: 1 });
    const updates = wrapper.emitted("update")!;
    expect(updates).toHaveLength(1);
    expect(getFloatingImageSheetRect(updates[0]![0] as FloatingImage, layout)).toEqual(expected);
  });

  test("cancels a resize without committing and does not preview a double-click on a handle", async () => {
    const { wrapper } = fixture();
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-image-resize="w"]')
      .trigger("pointerdown", { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    await layer.trigger("pointermove", { pointerId: 2, clientX: 20, clientY: 100 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await layer.trigger("pointerup", { pointerId: 2 });
    await layer.trigger("dblclick");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("preview")).toBeUndefined();
    expect(wrapper.get('[data-floating-image-id="image"]').attributes("style")).toContain(
      "left: 100px",
    );
    await wrapper
      .get('[data-floating-image-id="image"]')
      .trigger("pointerdown", { button: 0, pointerId: 4, clientX: 120, clientY: 90 });
    await layer.trigger("pointerup", { pointerId: 4 });
    await layer.trigger("dblclick");
    expect(wrapper.emitted("preview")).toHaveLength(1);
  });

  test("keeps midpoint handles unique when they lie exactly on frozen boundaries", () => {
    const { wrapper } = fixture({
      image: { anchor: { row: 0, column: 0 }, offsetX: 40, offsetY: 10, width: 80, height: 20 },
      freeze: { rows: 1, columns: 1 },
    });
    expect(wrapper.findAll("[data-floating-image-id]")).toHaveLength(4);
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    expect(
      wrapper.get('[data-floating-image-pane="topLeft"]').findAll("[data-image-resize]"),
    ).toHaveLength(1);
    expect(
      wrapper
        .get('[data-image-resize="n"]')
        .element.closest("[data-floating-image-pane]")
        ?.getAttribute("data-floating-image-pane"),
    ).toBe("top");
    expect(
      wrapper
        .get('[data-image-resize="w"]')
        .element.closest("[data-floating-image-pane]")
        ?.getAttribute("data-floating-image-pane"),
    ).toBe("left");
  });

  test("continues resizing after the original frozen fragment disappears", async () => {
    const { wrapper, layout } = fixture({
      image: { anchor: { row: 0, column: 0 }, offsetX: 40, offsetY: 10, width: 160, height: 80 },
      freeze: { rows: 1, columns: 1 },
    });
    const layer = wrapper.get("[data-floating-image-layer]");
    await wrapper
      .get('[data-image-resize="nw"]')
      .trigger("pointerdown", { button: 0, pointerId: 3, clientX: 40, clientY: 10 });
    await layer.trigger("pointermove", { pointerId: 3, clientX: 120, clientY: 50 });
    expect(wrapper.find('[data-floating-image-pane="topLeft"]').exists()).toBe(false);
    await layer.trigger("pointermove", { pointerId: 3, clientX: 130, clientY: 55 });
    await layer.trigger("pointerup", { pointerId: 3 });
    const resized = wrapper.emitted("update")![0]![0] as FloatingImage;
    expect(getFloatingImageSheetRect(resized, layout)).toEqual({
      x: 130,
      y: 55,
      width: 70,
      height: 35,
    });
  });
});
