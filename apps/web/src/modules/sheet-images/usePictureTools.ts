import { ref, type Ref } from "vue";
import { createSetSheetFloatingImagesCommand, type WorkbookCommand } from "@idea10/core/commands";
import { canUseSheetPermission } from "@idea10/core";
import {
  normalizeImageTransform,
  type ImageAppearance,
  type FloatingImage,
  type Sheet,
} from "@idea10/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
export type PictureLayerAction = "front" | "forward" | "backward" | "back";
export type PictureAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "horizontal"
  | "vertical"
  | "grid";

export function usePictureTools(options: {
  getSheet: () => Sheet;
  selectedIds: Ref<string[]>;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
}) {
  const paneVisible = ref(false);
  const idFactory = createBrowserIdFactory();
  function replace(images: readonly FloatingImage[]): void {
    if (options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) return;
    options.execute(createSetSheetFloatingImagesCommand(options.getSheet().id, images));
  }
  function updateMany(images: readonly FloatingImage[]): void {
    const changes = new Map(images.map((image) => [image.id, image]));
    replace(options.getSheet().floatingImages.map((image) => changes.get(image.id) ?? image));
  }
  function remove(ids = options.selectedIds.value): void {
    replace(options.getSheet().floatingImages.filter((image) => !ids.includes(image.id)));
  }
  function group(ungroup = false): void {
    const ids = new Set(options.selectedIds.value);
    if (!ungroup && ids.size < 2) return;
    const groups = new Set(
      options
        .getSheet()
        .floatingImages.filter((image) => ids.has(image.id))
        .map((image) => image.groupId)
        .filter(Boolean),
    );
    const groupId = ungroup ? undefined : idFactory("picture-group");
    replace(
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
    if (options.isBusy() || !canUseSheetPermission(options.getSheet(), "editObjects")) return false;
    const images = options
      .getSheet()
      .floatingImages.filter((image) => value.all || options.selectedIds.value.includes(image.id))
      .map((image) => ({
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
    )
      return false;
    updateMany(images);
    return true;
  }
  function applyAppearance(patch: Partial<ImageAppearance> | undefined): void {
    updateMany(
      options
        .getSheet()
        .floatingImages.filter((image) => options.selectedIds.value.includes(image.id))
        .map((image) => ({
          ...image,
          transform: normalizeImageTransform({
            ...image.transform,
            appearance: patch ? { ...image.transform?.appearance, ...patch } : undefined,
          }),
        })),
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
  };
}
