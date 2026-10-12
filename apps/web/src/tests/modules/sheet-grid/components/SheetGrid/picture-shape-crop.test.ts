import { flushPromises } from "@vue/test-utils";
import { expect, test, vi } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import PictureCropToolbar from "../../../../../modules/sheet-images/components/PictureCropToolbar.vue";
import SheetPictureAdjustmentHandles from "../../../../../modules/sheet-images/components/SheetPictureAdjustmentHandles.vue";
import { fixture } from "./picture-crop-fixture";

type CropBoundary = { applyPendingPictureCrop: () => boolean };

test("shape toolbar and normal-selection adjustment use real commands with exact Undo/Redo", async () => {
  const f = await fixture();
  try {
    const before = serializeWorkbook(f.session.workbook);
    expect(f.api.cropImage()).toBe(true);
    await flushPromises();
    expect(
      f.wrapper.getComponent(PictureCropToolbar).props("setShape")({ preset: "rightArrow" }),
    ).toBe(true);
    await flushPromises();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.wrapper.getComponent(SheetPictureAdjustmentHandles).props("shape")).toEqual({
      preset: "rightArrow",
    });
    const boundary = f.wrapper.vm as unknown as CropBoundary;
    expect(boundary.applyPendingPictureCrop()).toBe(true);
    await flushPromises();
    const shaped = serializeWorkbook(f.session.workbook);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.api.hasPendingEdit()).toBe(false);
    f.wrapper.getComponent(SheetPictureAdjustmentHandles).vm.$emit("nudge", 0, { x: 6, y: 4 });
    await flushPromises();
    expect(f.api.hasPendingEdit()).toBe(false);
    const adjusted = serializeWorkbook(f.session.workbook);
    expect(adjusted).not.toEqual(shaped);
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(shaped);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(adjusted);
  } finally {
    f.wrapper.unmount();
  }
});

test("rejected normal-selection adjustment retains its visible draft and blocks the pane apply boundary", async () => {
  const f = await fixture();
  try {
    f.api.cropImage();
    await flushPromises();
    f.wrapper.getComponent(PictureCropToolbar).props("setShape")({ preset: "roundRect" });
    (f.wrapper.vm as unknown as CropBoundary).applyPendingPictureCrop();
    await flushPromises();
    const before = serializeWorkbook(f.session.workbook),
      history = f.session.history.undoStack.length;
    await f.wrapper.setProps({ applyPictureCollectionChange: vi.fn(() => false) });
    f.wrapper.getComponent(SheetPictureAdjustmentHandles).vm.$emit("nudge", 0, { x: 8, y: 0 });
    await flushPromises();
    expect(f.api.hasPendingEdit()).toBe(true);
    expect(f.wrapper.findComponent(PictureCropToolbar).exists()).toBe(true);
    expect((f.wrapper.vm as unknown as CropBoundary).applyPendingPictureCrop()).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(history);
    expect(isFramedPictureObject(f.sheet.floatingImages[0]!)).toBe(true);
  } finally {
    f.wrapper.unmount();
  }
});
