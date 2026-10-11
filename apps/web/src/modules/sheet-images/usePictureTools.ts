import { arePictureObjectsEqual, isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resizePictureTo, type PictureSizeEdit } from "./picture-tool-geometry";
import { requireLegacyPictures, requireStandalonePictures } from "./picture-document-support";
import { ref, type Ref } from "vue";
import {
  createSetSheetFloatingImagesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { canUseSheetPermission, isPictureGroup } from "@sheetcraft/core";
import {
  normalizeImageTransform,
  areFloatingImageCollectionsEqual,
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
  getFrameContext?: () => PictureFrameLayoutContext | undefined;
}) {
  const paneVisible = ref(false);
  const sizeFeedback = ref<MessageKey>();
  const operationFeedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  function replace(images: readonly FloatingImage[]): boolean {
    const sheet = options.getSheet();
    if (options.isBusy() || !canUseSheetPermission(sheet, "editObjects")) return false;
    try {
      const framed = images.filter(isFramedPictureObject);
      if (framed.length) {
        const context = options.getFrameContext?.();
        if (!context) return false;
        for (const image of framed) resolvePictureFrame(image.frame, context.metrics);
      }
      const command = createSetSheetFloatingImagesCommand(sheet.id, images);
      if (areFloatingImageCollectionsEqual(sheet.floatingImages, command.images)) return true;
      return options.execute(command) !== false;
    } catch {
      return false;
    }
  }
  function updateMany(images: readonly FloatingImage[]): boolean {
    const changes = new Map(images.map((image) => [image.id, image]));
    return replace(
      options.getSheet().floatingImages.map((image) => changes.get(image.id) ?? image),
    );
  }
  function currentSingle(source: FloatingImage): FloatingImage | undefined {
    const ids = options.selectedIds.value;
    if (ids.length !== 1 || ids[0] !== source.id) return undefined;
    const target = options.getSheet().floatingImages.find((image) => image.id === source.id);
    return target && arePictureObjectsEqual(source, target) ? target : undefined;
  }
  function resizeOne(source: FloatingImage, edit: PictureSizeEdit): boolean {
    sizeFeedback.value = undefined;
    operationFeedback.value = undefined;
    const target = currentSingle(source);
    if (!target || options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    const context = options.getFrameContext?.();
    let next: FloatingImage | null;
    try {
      next = resizePictureTo(target, edit, context);
    } catch (error) {
      sizeFeedback.value =
        error instanceof RangeError ? "picture.invalidSize" : "picture.operationFailed";
      return false;
    }
    if (
      !next ||
      (isFramedPictureObject(target) && options.getFrameContext?.() !== context) ||
      !updateMany([next])
    ) {
      sizeFeedback.value = "picture.operationFailed";
      return false;
    }
    return true;
  }
  function setAspectRatio(source: FloatingImage, locked: boolean): boolean {
    operationFeedback.value = undefined;
    sizeFeedback.value = undefined;
    const target = currentSingle(source);
    if (
      !target ||
      isPictureGroup(target) ||
      typeof locked !== "boolean" ||
      !updateMany([{ ...target, lockAspectRatio: locked }])
    ) {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
    return true;
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
    const targets = options.getSheet().floatingImages.filter((image) => ids.has(image.id));
    if (targets.some(isPictureGroup)) {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
    const groups = new Set(
      requireStandalonePictures(targets)
        .map((image) => image.groupId)
        .filter(Boolean),
    );
    if (
      options
        .getSheet()
        .floatingImages.some(
          (image) =>
            !isPictureGroup(image) &&
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
          !isPictureGroup(image) &&
          (ids.has(image.id) || (image.groupId && groups.has(image.groupId)))
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
    const ids = options.selectedIds.value;
    if (
      (!value.all && (new Set(ids).size !== ids.length || targets.length !== ids.length)) ||
      targets.some((image) => isFramedPictureObject(image) || isPictureGroup(image))
    ) {
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
  function applyAppearance(patch: Partial<ImageAppearance> | undefined): boolean {
    operationFeedback.value = undefined;
    sizeFeedback.value = undefined;
    const ids = options.selectedIds.value;
    const targets = options.getSheet().floatingImages.filter((image) => ids.includes(image.id));
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      targets.length !== ids.length ||
      targets.some(isPictureGroup) ||
      (patch?.reflection === true && targets.some(isFramedPictureObject))
    ) {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
    try {
      const accepted = updateMany(
        requireStandalonePictures(targets).map((image): FloatingImage => {
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
      if (!accepted) operationFeedback.value = "picture.operationFailed";
      return accepted;
    } catch {
      operationFeedback.value = "picture.operationFailed";
      return false;
    }
  }
  function toggleVisibility(image: FloatingImage): void {
    updateMany([{ ...image, hidden: !image.hidden }]);
  }
  function rename(image: FloatingImage, name: string): void {
    updateMany([{ ...image, altText: name }]);
  }
  function clearFeedback(): void {
    sizeFeedback.value = undefined;
    operationFeedback.value = undefined;
  }
  return {
    clearFeedback,
    applyAppearance,
    paneVisible,
    updateMany,
    remove,
    group,
    layer,
    toggleVisibility,
    rename,
    resizeMany,
    resizeOne,
    setAspectRatio,
    sizeFeedback,
    operationFeedback,
  };
}
