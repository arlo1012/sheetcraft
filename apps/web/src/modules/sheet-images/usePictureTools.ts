import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { requireLegacyPictures } from "./picture-document-support";
import { ref, type Ref } from "vue";
import {
  createSetSheetFloatingImagesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  normalizeImageTransform,
  type ImageAppearance,
  type FloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
export type PictureLayerAction = "front" | "forward" | "backward" | "back";
export type PictureAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "both"
  | "bottom"
  | "horizontal"
  | "vertical"
  | "grid";
export type PictureAlignmentReference = "selection" | "last-selected";

export function usePictureTools(options: {
  getSheet: () => Sheet;
  selectedIds: Ref<string[]>;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
}) {
  const paneVisible = ref(false);
  const sizeFeedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  function replace(images: readonly FloatingImage[]): boolean {
    const sheet = options.getSheet();
    if (options.isBusy() || !canUseSheetPermission(sheet, "editObjects")) return false;
    if (images.some(isFramedPictureObject)) return false;
    const command = createSetSheetFloatingImagesCommand(sheet.id, images);
    if (JSON.stringify(sheet.floatingImages) === JSON.stringify(command.images)) return true;
    return options.execute(command) !== false;
  }
  function updateMany(images: readonly FloatingImage[]): boolean {
    const changes = new Map(images.map((image) => [image.id, image]));
    return replace(
      options.getSheet().floatingImages.map((image) => changes.get(image.id) ?? image),
    );
  }
  function remove(ids = options.selectedIds.value): void {
    replace(options.getSheet().floatingImages.filter((image) => !ids.includes(image.id)));
  }
  function group(ungroup = false, targetIds = options.selectedIds.value): boolean {
    const ids = new Set(targetIds);
    if (
      targetIds.length !== ids.size ||
      targetIds.some((id) => !options.getSheet().floatingImages.some((image) => image.id === id))
    )
      return false;
    if (!ungroup && ids.size < 2) return false;
    const groups = new Set(
      options
        .getSheet()
        .floatingImages.filter((image) => ids.has(image.id))
        .map((image) => image.groupId)
        .filter(Boolean),
    );
    if (
      options
        .getSheet()
        .floatingImages.some(
          (image) =>
            isFramedPictureObject(image) &&
            (ids.has(image.id) || Boolean(image.groupId && groups.has(image.groupId))),
        )
    )
      return false;
    const groupId = ungroup ? undefined : idFactory("picture-group");
    return replace(
      options
        .getSheet()
        .floatingImages.map((image) =>
          ids.has(image.id) || (image.groupId && groups.has(image.groupId))
            ? { ...image, groupId }
            : image,
        ),
    );
  }
  function layer(action: PictureLayerAction): void {
    const images = [...options.getSheet().floatingImages];
    if (images.length < 2) return;
    const selected = new Set(options.selectedIds.value);
    if (action === "front")
      replace([
        ...images.filter((image) => !selected.has(image.id)),
        ...images.filter((image) => selected.has(image.id)),
      ]);
    else if (action === "back")
      replace([
        ...images.filter((image) => selected.has(image.id)),
        ...images.filter((image) => !selected.has(image.id)),
      ]);
    else {
      const start = action === "forward" ? images.length - 2 : 1;
      const end = action === "forward" ? -1 : images.length;
      const step = action === "forward" ? -1 : 1;
      for (let index = start; index !== end; index += step) {
        const neighbor = index - step;
        if (selected.has(images[index]!.id) && !selected.has(images[neighbor]!.id))
          [images[index], images[neighbor]] = [images[neighbor]!, images[index]!];
      }
      replace(images);
    }
  }
  function resizeMany(value: {
    width: number;
    height: number;
    locked: boolean;
    all: boolean;
  }): boolean {
    sizeFeedback.value = undefined;
    if (options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    const targets = options
      .getSheet()
      .floatingImages.filter((image) => value.all || options.selectedIds.value.includes(image.id));
    if (targets.some(isFramedPictureObject)) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    const images = requireLegacyPictures(targets).map((image) => ({
      ...image,
      width: value.width,
      height: value.locked ? (image.height * value.width) / image.width : value.height,
    }));
    if (
      !images.length ||
      images.some(
        (image) =>
          !Number.isFinite(image.width) ||
          !Number.isFinite(image.height) ||
          image.width < 1 ||
          image.width > 10000 ||
          image.height < 1 ||
          image.height > 10000,
      )
    ) {
      sizeFeedback.value = "picture.invalidSize";
      return false;
    }
    if (!updateMany(images)) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    return true;
  }
  function applyAppearance(patch: Partial<ImageAppearance> | undefined): void {
    updateMany(
      options
        .getSheet()
        .floatingImages.filter((image) => options.selectedIds.value.includes(image.id))
        .map((image): FloatingImage => {
          const appearance = normalizeImageTransform({
            appearance: patch ? { ...image.transform?.appearance, ...patch } : undefined,
          })?.appearance;
          if (isFramedPictureObject(image))
            return {
              ...image,
              transform: { annotations: image.transform?.annotations, appearance },
            };
          return {
            ...image,
            transform: normalizeImageTransform({ ...image.transform, appearance }),
          };
        }),
    );
  }
  function toggleVisibility(image: FloatingImage): void {
    updateMany([{ ...image, hidden: !image.hidden }]);
  }
  function rename(image: FloatingImage, name: string): void {
    updateMany([{ ...image, altText: name }]);
  }
  return {
    applyAppearance,
    paneVisible,
    updateMany,
    remove,
    group,
    layer,
    toggleVisibility,
    rename,
    resizeMany,
    sizeFeedback,
  };
}
