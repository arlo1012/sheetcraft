import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPictureViewMetrics,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { framedPicture } from "../../framed-picture-fixture";
function fixture(locked = true, freeze?: { rows: number; columns: number }) {
  const sheet = createSheet("Synthetic", "s"),
    geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 }),
    rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 600, height: 400 },
      freeze,
    }),
    frameContext: PictureFrameLayoutContext = {
      layout,
      metrics: createPictureViewMetrics(sheet, geometry, rows),
    };
  const image = { ...framedPicture(), lockAspectRatio: locked };
  image.frame.anchor = { mode: "fixed", x: 160, y: 90, size: { width: 120, height: 80 } };
  const apply = vi.fn((_images: readonly FloatingImage[]) => true),
    wrapper = mount(SheetFloatingImageLayer, {
      attachTo: document.body,
      props: {
        images: [image],
        layout,
        frameContext,
        assetUrls: new Map(),
        selectedImageId: image.id,
        applyUpdateMany: apply,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
  const api = wrapper.vm as unknown as {
    handleSurfacePointerDown: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerMove: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerUp: (event: PointerEvent) => boolean;
    rotateImage: (turns: -1 | 1 | 2) => void;
    flipImage: (axis: "horizontal" | "vertical") => void;
    getSurfaceCursor: (point: { x: number; y: number }) => string | undefined;
    getPaintState: () => { images: FloatingImage[] };
  };
  function event(type: string) {
    const e = new MouseEvent(type, { button: 0, bubbles: true }) as PointerEvent;
    Object.defineProperties(e, {
      pointerId: { value: 1 },
      currentTarget: { value: wrapper.element },
    });
    return e;
  }
  return { sheet, image, geometry, layout, frameContext, apply, wrapper, api, event };
}
describe("framed picture selection and single-object ownership", () => {
  test("selected and unselected body hits reject empty rotated corners and retain true frame hits", async () => {
    const f = fixture(),
      g = resolvePictureFrame(f.image.frame, f.frameContext.metrics),
      corner = { x: g.bounds.x + 1, y: g.bounds.y + 1 };
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), corner)).toBe(false);
    expect(f.wrapper.get("[data-floating-image-selected]").classes()).toContain("is-framed");
    await f.wrapper
      .get("[data-floating-image-selected]")
      .trigger("pointerdown", { button: 0, pointerId: 1 });
    expect(f.wrapper.emitted("select")).toBeUndefined();
    expect(f.wrapper.get("polygon").attributes("points")).toContain(",");
    expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    await f.wrapper.setProps({ selectedImageId: null });
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), corner)).toBe(false);
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 220, y: 130 })).toBe(true);
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("pointer movement uses one frame delta and one accepted owner transaction", () => {
    const f = fixture();
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 220, y: 130 })).toBe(true);
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 250, y: 150 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    const next = f.apply.mock.calls[0]![0] as unknown as FloatingImage[];
    expect(next[0]).toMatchObject({
      frame: {
        anchor: { mode: "fixed", x: 190, y: 110, size: { width: 120, height: 80 } },
        angleDeg: 37,
      },
    });
    expect(next[0]).not.toHaveProperty("width");
    f.wrapper.unmount();
  });
  test("missing selected members reject a pointer gesture without a partial transaction", async () => {
    const f = fixture();
    await f.wrapper.setProps({ selectedImageIds: [f.image.id, "missing"] });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 220, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 250, y: 150 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    f.wrapper.unmount();
  });
  test("missing selected members also reject rotate and flip without a partial edit", async () => {
    const f = fixture();
    await f.wrapper.setProps({ selectedImageIds: [f.image.id, "missing"] });
    f.api.rotateImage(1);
    f.api.flipImage("horizontal");
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("feedback")).toHaveLength(2);
    f.wrapper.unmount();
  });
  test("resize can leave, revisit and leave the origin without a stale preview taking precedence", async () => {
    const f = fixture();
    await f.wrapper
      .get('[data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 40, y: 0 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 0, y: 0 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 20, y: 0 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0]).not.toEqual([f.image]);
    f.wrapper.unmount();
  });
  test("legal negative local origins do not jump on a perpendicular move or nudge", async () => {
    const f = fixture(),
      image = {
        ...f.image,
        frame: {
          ...f.image.frame,
          angleDeg: 90,
          anchor: { mode: "fixed" as const, x: -10, y: 100, size: { width: 120, height: 100 } },
        },
      };
    await f.wrapper.setProps({ images: [image] });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 50, y: 150 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 50, y: 160 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply.mock.calls[0]![0]).toMatchObject([{ frame: { anchor: { x: -10, y: 110 } } }]);
    f.apply.mockClear();
    await f.wrapper.get("[data-floating-image-selected]").trigger("keydown", { key: "ArrowDown" });
    expect(f.apply.mock.calls[0]![0]).toMatchObject([{ frame: { anchor: { x: -10, y: 101 } } }]);
    f.wrapper.unmount();
  });
  test("a later overflowing resize clears an earlier valid preview instead of committing it", async () => {
    const f = fixture(),
      image = {
        ...f.image,
        frame: { ...f.image.frame, source: { ...f.image.frame.source, widthRatio: 1e306 } },
      };
    await f.wrapper.setProps({ images: [image] });
    await f.wrapper
      .get('[data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 1, y: 0 });
    expect(f.api.getPaintState().images[0]).not.toEqual(image);
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 100, y: 0 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.api.getPaintState().images).toEqual([image]);
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    f.wrapper.unmount();
  });
  test("a new metrics context cancels an old preview without submitting it", async () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 220, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 250, y: 150 });
    await f.wrapper.setProps({ frameContext: { ...f.frameContext } });
    expect(f.api.getPaintState().images).toEqual([f.image]);
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("quarter rotate keeps local dimensions; rejected owner emits feedback without an update event", () => {
    const f = fixture();
    f.apply.mockReturnValue(false);
    f.api.rotateImage(1);
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0]).toMatchObject([
      { frame: { anchor: { size: { width: 120, height: 80 } }, angleDeg: 127 } },
    ]);
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(f.wrapper.emitted("update")).toBeUndefined();
    f.wrapper.unmount();
  });
  test("a picture ending at a frozen seam keeps its edge handles exactly once", async () => {
    const f = fixture(true, { rows: 2, columns: 2 }),
      image = {
        ...f.image,
        frame: {
          ...f.image.frame,
          angleDeg: 0,
          anchor: { mode: "fixed" as const, x: 100, y: 60, size: { width: 92, height: 80 } },
        },
      };
    await f.wrapper.setProps({ images: [image] });
    for (const direction of ["e", "ne", "se"])
      expect(f.wrapper.findAll(`[data-image-resize="${direction}"]`)).toHaveLength(1);
    f.wrapper.unmount();
  });
  test("an intersection of frozen seams has only one fallback owner", async () => {
    const f = fixture(true, { rows: 2, columns: 2 }),
      image = {
        ...f.image,
        frame: {
          ...f.image.frame,
          angleDeg: 0,
          anchor: { mode: "fixed" as const, x: 20, y: 4, size: { width: 344, height: 44 } },
        },
      };
    await f.wrapper.setProps({ images: [image] });
    expect(f.wrapper.findAll('[data-image-resize="s"]')).toHaveLength(1);
    f.wrapper.unmount();
  });
  test("framed double-click emits the actual source frame and respects the selection-only preference", async () => {
    const f = fixture();
    await f.wrapper.get("[data-floating-image-selected]").trigger("dblclick");
    expect(f.wrapper.emitted("preview")).toHaveLength(1);
    expect(f.wrapper.emitted("preview")?.[0]?.[0]).toMatchObject({
      id: f.image.id,
      frame: f.image.frame,
    });
    await f.wrapper.setProps({ previewOnDoubleClick: false });
    await f.wrapper.get("[data-floating-image-selected]").trigger("dblclick");
    expect(f.wrapper.emitted("preview")).toHaveLength(1);
    f.wrapper.unmount();
  });
  test("read-only frames remain selectable but have no movement cursor or edit handles", async () => {
    const f = fixture();
    await f.wrapper.setProps({ readOnly: true });
    expect(f.api.getSurfaceCursor({ x: 220, y: 130 })).toBeUndefined();
    expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(0);
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 220, y: 130 })).toBe(true);
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
});
