import { afterEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { executeWorkbookCommand } from "@sheetcraft/core/history";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import { pictureGroup } from "../../../sheet-images/picture-group-fixture";
import { mountSheetGrid } from "./fixture";

afterEach(() => vi.unstubAllGlobals());
test.each(["cut", "copy"] as const)(
  "protected unlocked root context %s reaches exact Core permission guard",
  async (mode) => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw Error("Unavailable");
        }),
      },
    });
    const group = pictureGroup();
    group.locked = false;
    const f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = [group];
        sheet.properties.protected = true;
      },
    });
    try {
      const apply = vi.fn((roots: readonly FloatingImage[]) =>
        executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, roots)),
      );
      await f.wrapper.setProps({ readOnly: true, applyPictureCollectionChange: apply });
      (
        f.wrapper.vm as unknown as { selectFloatingImages: (ids: string[]) => void }
      ).selectFloatingImages([group.id]);
      await f.wrapper.vm.$nextTick();
      const layer = f.wrapper.getComponent(SheetOwnedPictureGroupLayer),
        before = serializeWorkbook(f.session.workbook);
      layer.vm.$emit(mode, [group.id], f.sheet);
      await flushPromises();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual([
        mode === "cut" ? "clipboard.readyToMove" : "image.copied",
      ]);
      layer.vm.$emit("paste", [group.id], f.sheet);
      await flushPromises();
      expect(apply).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages.map((root) => root.id)).toEqual([group.id]);
      expect(f.session.history.undoStack).toHaveLength(mode === "cut" ? 1 : 0);
      if (mode === "copy") expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    } finally {
      f.wrapper.unmount();
    }
  },
);
test("readOnly unprotected surface cannot use context Cut or Paste to mutate", async () => {
  const group = pictureGroup(),
    f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = [group];
      },
    });
  try {
    const apply = vi.fn(() => true);
    await f.wrapper.setProps({ readOnly: true, applyPictureCollectionChange: apply });
    const layer = f.wrapper.getComponent(SheetOwnedPictureGroupLayer);
    layer.vm.$emit("cut", [group.id], f.sheet);
    layer.vm.$emit("paste", [group.id], f.sheet);
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
  } finally {
    f.wrapper.unmount();
  }
});
