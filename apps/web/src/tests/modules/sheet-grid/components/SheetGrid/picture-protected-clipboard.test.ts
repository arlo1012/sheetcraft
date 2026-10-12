import { afterEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
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

test.each(["owned-menu", "native-cut", "source-menu"] as const)(
  "owned leaf %s Cut is delayed until one accepted atomic paste",
  async (entry) => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw Error("Unavailable");
        }),
      },
    });
    const group = pictureGroup();
    group.locked = false;
    const first = group.members[0]!;
    if (first.kind !== "grouped-picture-v1") throw new Error("Expected source leaf.");
    const second = {
      ...first,
      id: "sibling",
      frame: {
        ...first.frame,
        rect: { xRatio: 1.2, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
      },
    };
    group.members.push(second);
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
      f.wrapper.vm.selectFloatingImages([group.id]);
      await flushPromises();
      const layer = f.wrapper.getComponent(SheetOwnedPictureGroupLayer),
        path = [group.id, "owned-leaf"];
      layer.vm.$emit("selectPath", path);
      await flushPromises();
      const before = serializeWorkbook(f.session.workbook);
      if (entry === "owned-menu") layer.vm.$emit("cut", path, f.sheet);
      else if (entry === "source-menu")
        f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("cut", group.id);
      else await f.wrapper.get("textarea.cell-editor").trigger("cut");
      await flushPromises();
      expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["clipboard.readyToMove"]);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(apply).not.toHaveBeenCalled();
      apply.mockReturnValueOnce(false);
      layer.vm.$emit("paste", path, f.sheet);
      await flushPromises();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      layer.vm.$emit("paste", path, f.sheet);
      await flushPromises();
      expect(f.sheet.floatingImages.map((root) => root.id)).toEqual(["sibling", "owned-leaf"]);
      expect(f.session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    } finally {
      f.wrapper.unmount();
    }
  },
);
