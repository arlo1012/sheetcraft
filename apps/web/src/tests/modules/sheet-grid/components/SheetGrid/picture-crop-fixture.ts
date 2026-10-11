import { vi } from "vitest";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { executeWorkbookCommand } from "@sheetcraft/core/history";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { assertPictureCommandSupport } from "../../../../../modules/sheet-images/picture-document-support";
import SheetPictureCropOverlay from "../../../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import { legacyPicture } from "../../../sheet-images/owned-picture-clipboard/fixture";
import { pictureGroup } from "../../../sheet-images/picture-group-fixture";
import { mountSheetGrid } from "./fixture";

type CropApi = {
  selectFloatingImages: (ids: string[]) => void;
  canCropPicture: () => boolean;
  cropImage: () => boolean;
  flushPendingEdit: () => boolean;
  hasPendingEdit: () => boolean;
};
export async function fixture(owned = false) {
  const image = owned ? pictureGroup() : legacyPicture();
  const f = mountSheetGrid({
    beforeMount: (sheet) => {
      sheet.floatingImages = [image];
    },
  });
  const execute = vi.fn((roots: readonly FloatingImage[]) => {
    const command = createSetSheetFloatingImagesCommand(f.sheet.id, roots);
    assertPictureCommandSupport(command, f.session.workbook);
    return executeWorkbookCommand(f.session, command);
  });
  await f.wrapper.setProps({ applyPictureCollectionChange: execute });
  const api = f.wrapper.vm as unknown as CropApi;
  api.selectFloatingImages([image.id]);
  await f.wrapper.vm.$nextTick();
  if (owned && "members" in image) {
    f.wrapper
      .getComponent(SheetOwnedPictureGroupLayer)
      .vm.$emit("selectPath", [image.id, image.members[0]!.id]);
    await f.wrapper.vm.$nextTick();
  }
  return { ...f, api, execute };
}
export async function keyboardSourceMove(f: Awaited<ReturnType<typeof fixture>>) {
  await f.wrapper.getComponent(SheetPictureCropOverlay).trigger("keydown", { key: "ArrowRight" });
}
