import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import type { FloatingImage } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function createLayout(options?: { freeze?: { rows: number; columns: number } }) {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    freeze: options?.freeze,
    viewportSize: { width: 240, height: 120 },
  });
}

const image: FloatingImage = {
  id: "image-1",
  assetId: "asset-1",
  altText: "Diagram",
  anchor: { row: 1, column: 1 },
  offsetX: 4,
  offsetY: 6,
  width: 120,
  height: 60,
};

function pointerEvent(
  type: string,
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, ...options }) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function mountLayer(options?: {
  image?: FloatingImage;
  layout?: ReturnType<typeof createLayout>;
  selectedImageId?: string | null;
  readOnly?: boolean;
  scale?: number;
}) {
  const currentImage = options?.image ?? image;
  return mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      images: [currentImage],
      layout: options?.layout ?? createLayout(),
      assetUrls: new Map([["asset-1", "blob:asset-1"]]),
      selectedImageId: options?.selectedImageId === undefined ? "image-1" : options.selectedImageId,
      readOnly: options?.readOnly ?? false,
      scale: options?.scale,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
}

function floatingImageMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".sheet-floating-image-context-menu");
}

describe("SheetFloatingImageLayer", () => {
  test("keeps image pixels out of the DOM and routes an unselected image through the surface hit test", () => {
    const wrapper = mountLayer({ selectedImageId: null });
    expect(wrapper.findAll("img, svg, .sheet-floating-image-layer__placeholder")).toHaveLength(0);
    expect(wrapper.findAll("[data-floating-image-id]")).toHaveLength(0);

    const event = pointerEvent("pointerdown", {
      button: 0,
      pointerId: 19,
      clientX: 88,
      clientY: 30,
    });
    Object.defineProperty(event, "currentTarget", { value: wrapper.element });
    const layer = wrapper.vm as unknown as {
      handleSurfacePointerDown: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    };
    expect(layer.handleSurfacePointerDown(event, { x: 88, y: 30 })).toBe(true);
    expect(wrapper.emitted("select")).toEqual([["image-1"]]);
    wrapper.unmount();
  });

  test("keeps selection and preview available while preventing image edits", async () => {
    const wrapper = mountLayer({ readOnly: true });
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("pointerdown", { button: 0, pointerId: 4, clientX: 10, clientY: 10 });
    expect(wrapper.emitted("select")).toEqual([["image-1"]]);
    expect(wrapper.findAll("[data-image-resize]")).toHaveLength(0);
    await fragment.trigger("dblclick", { button: 0 });
    expect(wrapper.emitted("preview")?.[0]?.[0]).toEqual(image);
    await fragment.trigger("contextmenu", { clientX: 10, clientY: 10 });
    const menu = floatingImageMenu()!;
    expect(
      menu
        .querySelector<HTMLElement>('[data-floating-image-action="copy"]')
        ?.getAttribute("aria-disabled"),
    ).not.toBe("true");
    expect(
      menu
        .querySelector<HTMLElement>('[data-floating-image-action="delete"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    wrapper.unmount();
  });
  test("previews double-clicks retargeted by pointer capture without recording a move", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    const layer = wrapper.get("[data-floating-image-layer]");
    await fragment.trigger("pointerdown", { button: 0, pointerId: 4, clientX: 100, clientY: 50 });
    layer.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 4, clientX: 100, clientY: 50 }),
    );
    await layer.trigger("dblclick", { button: 0 });
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("preview")?.[0]?.[0]).toEqual(image);
    wrapper.unmount();
  });
  test("selects an unselected canvas image through the surface hit test", async () => {
    const wrapper = mountLayer({ selectedImageId: null });
    const event = pointerEvent("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 90,
      clientY: 30,
    });
    Object.defineProperty(event, "currentTarget", { value: wrapper.element });
    const layer = wrapper.vm as unknown as {
      handleSurfacePointerDown: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    };
    expect(layer.handleSurfacePointerDown(event, { x: 90, y: 30 })).toBe(true);
    expect(wrapper.emitted("select")).toEqual([["image-1"]]);
  });

  test("emits one complete update after a drag and none while previewing", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("pointerdown", { button: 0, pointerId: 3, clientX: 10, clientY: 20 });
    fragment.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 3, clientX: 30, clientY: 35 }),
    );
    expect(wrapper.emitted("update")).toBeUndefined();

    fragment.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 3, clientX: 30, clientY: 35 }),
    );
    expect(wrapper.emitted("update")).toEqual([
      [{ ...image, anchor: { row: 2, column: 1 }, offsetX: 24, offsetY: 1 }],
    ]);
  });

  test("converts scaled pointer movement to the logical image displacement", async () => {
    const wrapper = mountLayer({ scale: 2 });
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("pointerdown", { button: 0, pointerId: 13, clientX: 20, clientY: 40 });
    fragment.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 13, clientX: 60, clientY: 80 }),
    );
    fragment.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 13, clientX: 60, clientY: 80 }),
    );

    expect(wrapper.emitted("update")).toEqual([
      [{ ...image, anchor: { row: 2, column: 1 }, offsetX: 24, offsetY: 6 }],
    ]);
  });

  test("uses the same layer-relative scaled coordinates for resize start and movement", async () => {
    const wrapper = mountLayer({ scale: 2 });
    Object.defineProperty(wrapper.element, "getBoundingClientRect", {
      value: () => new DOMRect(100, 50, 480, 240),
    });
    const handle = wrapper.get('[data-image-resize="se"]');
    await handle.trigger("pointerdown", { button: 0, pointerId: 22, clientX: 180, clientY: 100 });
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    fragment.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 22, clientX: 220, clientY: 100 }),
    );
    fragment.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 22, clientX: 220, clientY: 100 }),
    );
    expect(wrapper.emitted("update")).toEqual([
      [{ ...image, anchor: { ...image.anchor }, width: 140, height: 70 }],
    ]);
    wrapper.unmount();
  });

  test("keeps the image aspect ratio while resizing", async () => {
    const wrapper = mountLayer();
    const handle = wrapper.get('[data-image-resize="se"]');
    await handle.trigger("pointerdown", { button: 0, pointerId: 4, clientX: 100, clientY: 50 });
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    fragment.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 4, clientX: 160, clientY: 70 }),
    );
    fragment.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 4, clientX: 160, clientY: 70 }),
    );
    expect(wrapper.emitted("update")).toEqual([
      [{ ...image, anchor: { ...image.anchor }, width: 180, height: 90 }],
    ]);
  });

  test("cancels a pointer preview on Escape", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("pointerdown", { button: 0, pointerId: 4, clientX: 10, clientY: 10 });
    fragment.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 4, clientX: 80, clientY: 60 }),
    );
    await fragment.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  test("continues a drag after the image leaves its original frozen pane", async () => {
    const frozenImage: FloatingImage = {
      ...image,
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 40,
      height: 30,
    };
    const wrapper = mountLayer({
      image: frozenImage,
      layout: createLayout({ freeze: { rows: 1, columns: 1 } }),
    });
    const fragment = wrapper.get(
      '[data-floating-image-id="image-1"][data-floating-image-pane="topLeft"]',
    );
    await fragment.trigger("pointerdown", { button: 0, pointerId: 8, clientX: 0, clientY: 0 });
    const layer = wrapper.get("[data-floating-image-layer]");
    layer.element.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 8, clientX: 100, clientY: 60 }),
    );
    layer.element.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 8, clientX: 100, clientY: 60 }),
    );

    expect(wrapper.emitted("update")).toEqual([
      [{ ...frozenImage, anchor: { row: 3, column: 1 }, offsetX: 20, offsetY: 0 }],
    ]);
  });

  test("opens the image action menu on right-click and emits conversion", async () => {
    const wrapper = mountLayer({ selectedImageId: null });
    const event = new MouseEvent("contextmenu", { bubbles: true, clientX: 120, clientY: 80 });
    Object.defineProperty(event, "currentTarget", { value: wrapper.element });
    const layer = wrapper.vm as unknown as {
      handleSurfaceContextMenu: (event: MouseEvent, point: { x: number; y: number }) => boolean;
    };
    expect(layer.handleSurfaceContextMenu(event, { x: 120, y: 80 })).toBe(true);
    await nextTick();

    expect(wrapper.emitted("select")).toEqual([["image-1"]]);
    expect(floatingImageMenu()?.textContent).toContain("Convert to cell image");
    expect(floatingImageMenu()?.style.position).toBe("fixed");
    await document
      .querySelector<HTMLElement>('[data-floating-image-action="convert-to-cell"]')!
      .click();
    await nextTick();
    expect(wrapper.emitted("convertToCell")).toEqual([["image-1"]]);
    expect(floatingImageMenu()).toBeNull();
  });

  test("opens from Shift+F10 and restores image focus when the menu closes", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("keydown", { key: "F10", shiftKey: true });
    expect(floatingImageMenu()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await nextTick();
    expect(floatingImageMenu()).toBeNull();
    expect(document.activeElement).toBe(fragment.element);
  });

  test("emits deletion from the image action menu", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("keydown", { key: "ContextMenu" });
    document.querySelector<HTMLElement>('[data-floating-image-action="delete"]')!.click();
    await nextTick();
    expect(wrapper.emitted("delete")).toEqual([["image-1"]]);
  });

  test("emits keyboard movement and deletion for the focused image", async () => {
    const wrapper = mountLayer();
    const fragment = wrapper.get('[data-floating-image-id="image-1"]');
    await fragment.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await fragment.trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("update")).toEqual([
      [{ ...image, anchor: { ...image.anchor }, offsetX: 14, offsetY: 6 }],
    ]);
    expect(wrapper.emitted("delete")).toEqual([["image-1"]]);
  });
});
