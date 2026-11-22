import type { ComputedRef, Ref } from "vue";
import {
  isFramedPictureObject,
  type StandalonePictureObject as FloatingImage,
} from "@sheetcraft/core/picture-object";
import type {
  FloatingImage as PictureObject,
  ImageCrop,
  LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import { adjustImageCropSelection } from "@sheetcraft/sheet-engine/image-crop-selection";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { requireStandalonePictures } from "../picture-document-support";
import { planEqualPictureDimensions } from "../picture-equal-dimensions";
import { movePictureRootSelectionBy } from "../picture-root-selection-planning";
import type { PictureAlignment, PictureAlignmentReference } from "../usePictureTools";

type CropState = {
  image: LegacyFloatingImage;
  selection: ImageCrop;
};

type FloatingImageArrangementAndKeysOptions<TCrop extends CropState> = {
  currentImages: ComputedRef<readonly FloatingImage[]>;
  selectedIds: ComputedRef<ReadonlySet<string>>;
  selectionKey: ComputedRef<string>;
  interactionReadOnly: ComputedRef<boolean>;
  crop: Ref<TCrop | undefined>;
  getSelectedImageId: () => string | null | undefined;
  getLayout: () => SheetViewportLayout;
  getFrameContext: () => PictureFrameLayoutContext | undefined;
  canGroup: () => boolean;
  hasActiveGesture: () => boolean;
  selectionImages: () => readonly PictureObject[];
  commitImages: (nextImages: PictureObject[]) => boolean;
  openImageKeyboardContextMenu: (image: FloatingImage, event: KeyboardEvent) => boolean;
  finishGesture: (commit: boolean) => void;
  cancelCrop: () => void;
  applyCrop: () => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onReference: (reference: PictureAlignmentReference) => void;
  onGroup: (ids: string[]) => void;
  onFeedback: (key: "picture.operationFailed") => void;
};

/** Owns floating-image alignment/distribution/equal-size actions and keyboard nudging/crop shortcuts. */
export function useFloatingImageArrangementAndKeys<TCrop extends CropState>(
  options: FloatingImageArrangementAndKeysOptions<TCrop>,
) {
  const { currentImages, selectedIds, selectionKey, interactionReadOnly, crop } = options;

  function arrangeImages(
    ids: readonly string[],
    action: PictureAlignment,
    reference: PictureAlignmentReference = "selection",
  ): void {
    if (interactionReadOnly.value) return;
    const layout = options.getLayout();
    const frameContext = options.getFrameContext();
    if (action === "equal-height" || action === "equal-width" || action === "equal-size") {
      try {
        const next = planEqualPictureDimensions(
          currentImages.value,
          ids,
          options.getSelectedImageId() ?? ids.at(-1),
          action,
          layout,
          frameContext,
        );
        options.commitImages([
          ...requireStandalonePictures(next.filter((root) => ids.includes(root.id))),
        ]);
      } catch {
        options.onFeedback("picture.operationFailed");
      }
      return;
    }
    if (
      currentImages.value.some((image) => ids.includes(image.id) && isFramedPictureObject(image))
    ) {
      options.onFeedback("picture.operationFailed");
      return;
    }
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !currentImages.value.some((image) => image.id === id))
    ) {
      options.onFeedback("picture.operationFailed");
      return;
    }
    const members = currentImages.value
      .filter((image) => ids.includes(image.id))
      .flatMap((image) => {
        if (isFramedPictureObject(image)) return [];
        const rect = getFloatingImageSheetRect(image, layout);
        return rect ? [{ image, rect }] : [];
      });
    if (!members.length) return;
    if (members.length !== ids.length) {
      options.onFeedback("picture.operationFailed");
      return;
    }
    if ((action === "horizontal" || action === "vertical") && members.length < 3) return;
    if (action === "grid") {
      options.commitImages(members.map(({ image }) => ({ ...image, offsetX: 0, offsetY: 0 })));
      return;
    }
    const left = Math.min(...members.map((entry) => entry.rect.x));
    const right = Math.max(...members.map((entry) => entry.rect.x + entry.rect.width));
    const top = Math.min(...members.map((entry) => entry.rect.y));
    const bottom = Math.max(...members.map((entry) => entry.rect.y + entry.rect.height));
    const last =
      members.find((entry) => entry.image.id === options.getSelectedImageId()) ??
      members.find((entry) => entry.image.id === ids.at(-1));
    const base =
      reference === "last-selected" && last
        ? last.rect
        : { x: left, y: top, width: right - left, height: bottom - top };
    const ordered = [...members].sort((a, b) =>
      action === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
    );
    let cursor = action === "horizontal" ? left : top;
    const gap =
      members.length < 2
        ? 0
        : (action === "horizontal"
            ? right - left - members.reduce((sum, entry) => sum + entry.rect.width, 0)
            : bottom - top - members.reduce((sum, entry) => sum + entry.rect.height, 0)) /
          (members.length - 1);
    const next = ordered.map(({ image, rect }) => {
      const target = { ...rect };
      if (action === "left") target.x = base.x;
      if (action === "center" || action === "both")
        target.x = base.x + (base.width - rect.width) / 2;
      if (action === "right") target.x = base.x + base.width - rect.width;
      if (action === "top") target.y = base.y;
      if (action === "middle" || action === "both")
        target.y = base.y + (base.height - rect.height) / 2;
      if (action === "bottom") target.y = base.y + base.height - rect.height;
      if (action === "horizontal") {
        target.x = cursor;
        cursor += rect.width + gap;
      }
      if (action === "vertical") {
        target.y = cursor;
        cursor += rect.height + gap;
      }
      return target.x < 0 || target.y < 0
        ? null
        : target.x === rect.x && target.y === rect.y
          ? image
          : reanchorFloatingImageAtSheetRect(image, target, layout);
    });
    if (next.every((image) => image !== null)) options.commitImages(next);
    else options.onFeedback("picture.operationFailed");
  }

  function alignSelection(
    action: PictureAlignment,
    reference: PictureAlignmentReference,
    key: string,
  ): void {
    if (key === selectionKey.value && !options.hasActiveGesture() && !crop.value)
      arrangeImages([...selectedIds.value], action, reference);
  }

  function changeAlignmentReference(reference: PictureAlignmentReference, key: string): void {
    if (
      key === selectionKey.value &&
      !interactionReadOnly.value &&
      !options.hasActiveGesture() &&
      !crop.value
    )
      options.onReference(reference);
  }

  function groupSelection(key: string): void {
    if (
      key === selectionKey.value &&
      options.canGroup() &&
      !interactionReadOnly.value &&
      !options.hasActiveGesture() &&
      !crop.value
    )
      options.onGroup([...selectedIds.value]);
  }

  function dismissSelection(key: string): void {
    if (key === selectionKey.value) options.onSelect(null);
  }

  function planImageKeydown(image: FloatingImage, event: KeyboardEvent): void {
    if (crop.value) {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        options.cancelCrop();
      } else if (event.key === "Enter") {
        event.preventDefault();
        options.applyCrop();
      } else {
        const distance = event.shiftKey ? 10 : 1;
        const delta = {
          ArrowLeft: { x: -distance, y: 0 },
          ArrowRight: { x: distance, y: 0 },
          ArrowUp: { x: 0, y: -distance },
          ArrowDown: { x: 0, y: distance },
        }[event.key];
        if (delta) {
          event.preventDefault();
          const current = crop.value;
          crop.value = {
            ...current,
            selection: adjustImageCropSelection(
              current.selection,
              "move",
              { x: delta.x / current.image.width, y: delta.y / current.image.height },
              { width: 0, height: 0 },
            ),
          };
        }
      }
      return;
    }
    if (options.openImageKeyboardContextMenu(image, event)) return;
    if (event.key === "Escape") {
      if (options.hasActiveGesture()) options.finishGesture(false);
      else options.onSelect(null);
      event.preventDefault();
      return;
    }
    if (!interactionReadOnly.value && (event.key === "Delete" || event.key === "Backspace")) {
      options.onDelete(image.id);
      event.preventDefault();
      return;
    }
    if (interactionReadOnly.value) return;
    const distance = event.shiftKey ? 10 : 1;
    const offset = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    }[event.key];
    if (!offset) return;
    const members = options.selectionImages().filter((entry) => selectedIds.value.has(entry.id));
    if (members.length !== selectedIds.value.size) {
      options.onFeedback("picture.operationFailed");
      event.preventDefault();
      return;
    }
    const next = movePictureRootSelectionBy(
      members,
      offset,
      options.getLayout(),
      options.getFrameContext(),
    );
    if (!next) options.onFeedback("picture.operationFailed");
    else options.commitImages(next);
    event.preventDefault();
  }

  function onImageKeydown(image: FloatingImage, event: KeyboardEvent): void {
    try {
      planImageKeydown(image, event);
    } catch {
      event.preventDefault();
      options.onFeedback("picture.operationFailed");
    }
  }

  return {
    arrangeImages,
    alignSelection,
    changeAlignmentReference,
    groupSelection,
    dismissSelection,
    onImageKeydown,
  };
}
