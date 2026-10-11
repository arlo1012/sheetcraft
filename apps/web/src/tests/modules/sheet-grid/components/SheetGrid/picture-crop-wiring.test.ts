import { afterEach, describe, expect, test, vi } from "vitest";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import SheetPictureCropOverlay from "../../../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import PictureCropToolbar from "../../../../../modules/sheet-images/components/PictureCropToolbar.vue";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { fixture, keyboardSourceMove } from "./picture-crop-fixture";

describe("SheetGrid source-owned interactive crop", () => {
  afterEach(() => vi.restoreAllMocks());

  test("crop mode suppresses normal handles, previews only, Escape applies one reversible transaction", async () => {
    const f = await fixture();
    try {
      const before = serializeWorkbook(f.session.workbook);
      expect(f.api.canCropPicture()).toBe(true);
      expect(f.api.cropImage()).toBe(true);
      await f.wrapper.vm.$nextTick();
      expect(f.api.hasPendingEdit()).toBe(true);
      expect(f.wrapper.getComponent(SheetFloatingImageLayer).props("croppingExternally")).toBe(
        true,
      );
      expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(0);
      expect(f.wrapper.findAll("[data-image-crop-handle]").length).toBeGreaterThan(0);
      await keyboardSourceMove(f);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      await f.wrapper.getComponent(SheetPictureCropOverlay).trigger("keydown", { key: "Escape" });
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.api.hasPendingEdit()).toBe(false);
      expect(f.wrapper.findComponent(SheetPictureCropOverlay).exists()).toBe(false);
      const applied = serializeWorkbook(f.session.workbook);
      expect(isFramedPictureObject(f.sheet.floatingImages[0]!)).toBe(true);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(applied);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("explicit cancel discards the draft, Enter opens ratios without applying", async () => {
    const f = await fixture();
    try {
      const before = serializeWorkbook(f.session.workbook);
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      await keyboardSourceMove(f);
      await f.wrapper.getComponent(SheetPictureCropOverlay).trigger("keydown", { key: "Enter" });
      expect(f.execute).not.toHaveBeenCalled();
      expect(document.querySelector('[data-picture-crop-ratio="16:9"]')).not.toBeNull();
      f.wrapper.getComponent(PictureCropToolbar).props("cancel")();
      await f.wrapper.vm.$nextTick();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.api.hasPendingEdit()).toBe(false);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("right-click retains crop; one Escape from its object menu applies and closes both", async () => {
    const f = await fixture();
    try {
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      await keyboardSourceMove(f);
      await f.wrapper
        .getComponent(SheetPictureCropOverlay)
        .trigger("contextmenu", { button: 2, clientX: 100, clientY: 90 });
      await f.wrapper.vm.$nextTick();
      expect(f.api.hasPendingEdit()).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      const menu = document.querySelector("[data-floating-image-context-menu]");
      expect(menu).not.toBeNull();
      menu!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      await f.wrapper.vm.$nextTick();
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.api.hasPendingEdit()).toBe(false);
      expect(document.querySelector("[data-floating-image-context-menu]")).toBeNull();
    } finally {
      f.wrapper.unmount();
    }
  });

  test("rejected outside apply and save flush retain the draft and consume the click", async () => {
    const f = await fixture();
    try {
      const before = serializeWorkbook(f.session.workbook);
      await f.wrapper.setProps({ applyPictureCollectionChange: vi.fn(() => false) });
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      await keyboardSourceMove(f);
      const outside = new PointerEvent("pointerdown", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(outside);
      expect(outside.defaultPrevented).toBe(true);
      expect(f.api.hasPendingEdit()).toBe(true);
      expect(f.api.flushPendingEdit()).toBe(false);
      expect(f.wrapper.findComponent(SheetPictureCropOverlay).exists()).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["picture.operationFailed"]);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("owned leaf crops without borrowing its container, and stale toolbar cannot apply a new session", async () => {
    const f = await fixture(true);
    try {
      expect(f.api.canCropPicture()).toBe(true);
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      const overlay = f.wrapper.getComponent(SheetPictureCropOverlay);
      expect(isGroupedPicture(overlay.props("picture"))).toBe(true);
      const oldApply = f.wrapper.getComponent(PictureCropToolbar).props("apply");
      await keyboardSourceMove(f);
      f.wrapper.getComponent(PictureCropToolbar).props("cancel")();
      await f.wrapper.vm.$nextTick();
      f.api.cropImage();
      await f.wrapper.vm.$nextTick();
      await keyboardSourceMove(f);
      expect(oldApply()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.api.hasPendingEdit()).toBe(true);
      expect(f.api.flushPendingEdit()).toBe(true);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages[0]!.id).toBe("owned-group");
    } finally {
      f.wrapper.unmount();
    }
  });
});
