import { describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import SheetPictureCropOverlay from "../../../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import { fixture } from "./picture-crop-fixture";

function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      button: 0,
      pointerId: 41,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("SheetGrid actual crop pointer-session wiring", () => {
  test("right black handle uses unscaled deltas, keeps source size, and creates no command until Apply", async () => {
    const f = await fixture();
    try {
      await f.wrapper.setProps({ zoom: 200 });
      const before = serializeWorkbook(f.session.workbook);
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      pointer(f.wrapper.get('[data-picture-crop-handle="e"]').element, "pointerdown", 100, 100);
      pointer(window, "pointermove", 140, 100);
      pointer(window, "pointerup", 140, 100);
      await f.wrapper.vm.$nextTick();
      const overlay = f.wrapper.getComponent(SheetPictureCropOverlay);
      expect(overlay.props("geometry").rect.width).toBe(90);
      expect(overlay.props("geometry").rect.height).toBe(50);
      expect(overlay.props("geometry").sourceRect!.width).toBe(70);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.api.flushPendingEdit()).toBe(true);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("pointer cancellation restores its start; a finished source drag has local Undo/Redo", async () => {
    const f = await fixture();
    try {
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      const body = f.wrapper.get("[data-picture-crop-source]").element;
      pointer(body, "pointerdown", 100, 100);
      pointer(window, "pointermove", 130, 90);
      pointer(window, "pointercancel", 130, 90);
      await f.wrapper.vm.$nextTick();
      expect(f.wrapper.getComponent(SheetPictureCropOverlay).props("geometry").sourceRect!.x).toBe(
        f.wrapper.getComponent(SheetPictureCropOverlay).props("geometry").rect.x,
      );
      pointer(body, "pointerdown", 100, 100);
      pointer(window, "pointermove", 130, 90);
      pointer(window, "pointerup", 130, 90);
      await f.wrapper.vm.$nextTick();
      const moved = f.wrapper.getComponent(SheetPictureCropOverlay).props("geometry").sourceRect!.x;
      await f.wrapper
        .getComponent(SheetPictureCropOverlay)
        .trigger("keydown", { key: "z", ctrlKey: true });
      const undone = f.wrapper.getComponent(SheetPictureCropOverlay).props("geometry")
        .sourceRect!.x;
      expect(moved - undone).toBeCloseTo(30);
      await f.wrapper
        .getComponent(SheetPictureCropOverlay)
        .trigger("keydown", { key: "y", ctrlKey: true });
      expect(f.wrapper.getComponent(SheetPictureCropOverlay).props("geometry").sourceRect!.x).toBe(
        moved,
      );
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("Escape during a captured drag keeps its last preview and does not restore it on capture release", async () => {
    const f = await fixture();
    try {
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      pointer(f.wrapper.get("[data-picture-crop-source]").element, "pointerdown", 100, 100);
      pointer(window, "pointermove", 120, 100);
      await f.wrapper.vm.$nextTick();
      await f.wrapper.getComponent(SheetPictureCropOverlay).trigger("keydown", { key: "Escape" });
      const applied = f.sheet.floatingImages[0]!;
      expect(isFramedPictureObject(applied)).toBe(true);
      if (!isFramedPictureObject(applied)) throw new Error("Expected applied crop.");
      expect(applied.frame.source.offsetXRatio).toBeCloseTo(20 / 70);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.api.hasPendingEdit()).toBe(false);
      pointer(window, "pointerup", 120, 100);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages[0]).toEqual(applied);
    } finally {
      f.wrapper.unmount();
    }
  });
});
