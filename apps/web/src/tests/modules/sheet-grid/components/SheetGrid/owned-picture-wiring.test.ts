import { afterEach, describe, expect, test, vi } from "vitest";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { executeWorkbookCommand } from "@sheetcraft/core/history";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import { framedPicture } from "../../../sheet-images/framed-picture-fixture";
import { legacyPicture } from "../../../sheet-images/owned-picture-clipboard/fixture";
import { pictureGroup } from "../../../sheet-images/picture-group-fixture";
import { mountSheetGrid } from "./fixture";

type GridPictureApi = {
  getPictureFrameContext: (sheet: Sheet) => PictureFrameLayoutContext | undefined;
  selectFloatingImages: (ids: string[]) => void;
};

describe("SheetGrid owned picture routes", () => {
  afterEach(() => vi.restoreAllMocks());

  test("legacy-only sheets already expose a frame context before the first owned root exists", async () => {
    const f = mountSheetGrid({
      beforeMount: (sheet) => (sheet.floatingImages = [legacyPicture()]),
    });
    try {
      const api = f.wrapper.vm as unknown as GridPictureApi;
      const context = api.getPictureFrameContext(f.sheet);
      expect(context).toBeDefined();
      expect(f.wrapper.getComponent(SheetFloatingImageLayer).props("frameContext")).toBe(context);
      expect(f.wrapper.getComponent(SheetOwnedPictureGroupLayer).props("frameContext")).toBe(
        context,
      );
      expect(api.getPictureFrameContext({ ...f.sheet })).toBeUndefined();

      executeWorkbookCommand(
        f.session,
        createSetSheetFloatingImagesCommand(f.sheet.id, [legacyPicture(), pictureGroup()]),
      );
      await f.wrapper.vm.$nextTick();
      expect(api.getPictureFrameContext(f.sheet)).toBeDefined();
      expect(f.wrapper.getComponent(SheetOwnedPictureGroupLayer).props("roots")).toEqual(
        f.sheet.floatingImages,
      );
      expect(f.session.history.undoStack).toHaveLength(1);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("owned selection gets the full ordered forest while the ordinary layer omits group containers", async () => {
    const roots = [legacyPicture(), pictureGroup(), framedPicture()];
    const f = mountSheetGrid({ beforeMount: (sheet) => (sheet.floatingImages = roots) });
    try {
      const apply = vi.fn(() => false);
      await f.wrapper.setProps({ applyPictureCollectionChange: apply });
      const api = f.wrapper.vm as unknown as GridPictureApi;
      api.selectFloatingImages([roots[1]!.id]);
      await f.wrapper.vm.$nextTick();
      const owned = f.wrapper.getComponent(SheetOwnedPictureGroupLayer);
      const ordinary = f.wrapper.getComponent(SheetFloatingImageLayer);
      expect(owned.props("roots")).toEqual(f.sheet.floatingImages);
      expect(owned.props("owner")).toBe(f.sheet);
      expect(owned.props("selectedRootId")).toBe(roots[1]!.id);
      expect(owned.props("selectedRootIds")).toEqual([roots[1]!.id]);
      expect(owned.props("applyUpdateMany")).toBe(apply);
      expect(ordinary.props("images")).toEqual([roots[0], roots[2]]);
      expect(ordinary.props("images")).not.toContain(roots[1]);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("root Delete passes every selected root and rejected commands retain all selection", async () => {
    const group = pictureGroup();
    const legacy = legacyPicture();
    const f = mountSheetGrid({
      beforeMount: (sheet) => (sheet.floatingImages = [group, legacy]),
    });
    try {
      const apply = vi.fn((_paths: readonly PictureGroupPath[], _owner: Sheet) => false);
      await f.wrapper.setProps({ applyOwnedPictureDelete: apply });
      (f.wrapper.vm as unknown as GridPictureApi).selectFloatingImages([group.id, legacy.id]);
      await f.wrapper.vm.$nextTick();
      const owned = f.wrapper.getComponent(SheetOwnedPictureGroupLayer);
      const before = serializeWorkbook(f.session.workbook);
      await owned.get(`[data-owned-picture-selected='${group.id}']`).trigger("keydown", {
        key: "Delete",
      });
      expect(apply).toHaveBeenCalledExactlyOnceWith([[group.id], [legacy.id]], f.sheet);
      expect(owned.props("selectedRootIds")).toEqual([group.id, legacy.id]);
      expect(owned.props("selectedRootId")).toBe(legacy.id);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.emitted("deleteFloatingImages")).toBeUndefined();
      expect(f.wrapper.emitted("deleteFloatingImage")).toBeUndefined();
      expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["picture.operationFailed"]);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("member Delete retains the exact owner chain and rejected selection, without promoting to its root", async () => {
    const group = pictureGroup();
    const path = [group.id, group.members[0]!.id];
    const f = mountSheetGrid({
      beforeMount: (sheet) => (sheet.floatingImages = [group, legacyPicture()]),
    });
    try {
      const apply = vi.fn((_paths: readonly PictureGroupPath[], _owner: Sheet) => false);
      await f.wrapper.setProps({ applyOwnedPictureDelete: apply });
      (f.wrapper.vm as unknown as GridPictureApi).selectFloatingImages([group.id]);
      await f.wrapper.vm.$nextTick();
      const owned = f.wrapper.getComponent(SheetOwnedPictureGroupLayer);
      owned.vm.$emit("selectPath", path);
      await f.wrapper.vm.$nextTick();
      const before = serializeWorkbook(f.session.workbook);
      await owned.get(`[data-owned-picture-selected='${path.join("/")}']`).trigger("keydown", {
        key: "Delete",
      });
      expect(apply).toHaveBeenCalledExactlyOnceWith([path], f.sheet);
      expect(owned.props("selectedPath")).toEqual(path);
      expect(owned.props("selectedRootIds")).toEqual([group.id]);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.emitted("clearCells")).toBeUndefined();

      owned.vm.$emit("delete", path, { ...f.sheet });
      expect(apply).toHaveBeenCalledOnce();
    } finally {
      f.wrapper.unmount();
    }
  });
});
