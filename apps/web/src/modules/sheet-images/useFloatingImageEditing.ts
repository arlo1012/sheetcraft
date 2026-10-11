import { computed, nextTick, shallowRef, type Ref } from "vue";
import type { LegacyFloatingImage as FloatingImage, ImageCrop } from "@sheetcraft/core/workbook";
import {
  cropFloatingImage,
  flipFloatingImage,
  type ImageFlipAxis,
  rotateFloatingImage,
  restoreFloatingImage,
} from "@sheetcraft/sheet-engine/floating-image-transform";
import {
  adjustImageCropSelection,
  type ImageCropGesture,
} from "@sheetcraft/sheet-engine/image-crop-selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
const MINIMUM_IMAGE_SIZE = 24;

export function useFloatingImageEditing(options: {
  layer: Ref<HTMLElement | null>;
  getImage: () => FloatingImage | undefined;
  getLayout: () => SheetViewportLayout;
  getScale: () => number;
  isDragging: () => boolean;
  closeContextMenu: () => void;
  update: (image: FloatingImage) => unknown;
}) {
  const crop = shallowRef<{ image: FloatingImage; selection: ImageCrop }>();
  const cropGesture = shallowRef<{
    pointerId: number;
    direction: ImageCropGesture;
    selection: ImageCrop;
    x: number;
    y: number;
  }>();
  const naturalSizes = shallowRef(new Map<string, { width: number; height: number }>());
  const canRestore = computed(() => {
    const image = options.getImage();
    if (!image) return false;
    const size = naturalSizes.value.get(image.assetId);
    return Boolean(
      image.transform || (size && (image.width !== size.width || image.height !== size.height)),
    );
  });
  function cacheImageSize(assetId: string, size: { width: number; height: number }): void {
    const current = naturalSizes.value.get(assetId);
    if (current?.width === size.width && current.height === size.height) return;
    naturalSizes.value = new Map(naturalSizes.value).set(assetId, size);
  }
  function focusSelectedImage(): void {
    void nextTick(() =>
      options.layer.value
        ?.querySelector<HTMLElement>(".is-selected")
        ?.focus({ preventScroll: true }),
    );
  }
  function startCrop(): void {
    const image = options.getImage();
    if (!image || options.isDragging()) return;
    options.closeContextMenu();
    crop.value = { image, selection: { x: 0, y: 0, width: 1, height: 1 } };
    focusSelectedImage();
  }
  function endCropGesture(): void {
    cropGesture.value = undefined;
  }
  function cancelCrop(restoreFocus = true): void {
    endCropGesture();
    crop.value = undefined;
    if (restoreFocus) focusSelectedImage();
  }
  function applyCrop(): boolean {
    const active = crop.value;
    if (!active) return false;
    const { selection } = active;
    if (selection.x !== 0 || selection.y !== 0 || selection.width !== 1 || selection.height !== 1) {
      const next = cropFloatingImage(active.image, selection, options.getLayout());
      if (!next || options.update(next) === false) return false;
    }
    cancelCrop();
    return true;
  }
  function rotateImage(turns: -1 | 1 | 2): void {
    const image = options.getImage();
    if (!image) return;
    const next = rotateFloatingImage(image, turns, options.getLayout());
    if (next) options.update(next);
    focusSelectedImage();
  }
  function flipImage(axis: ImageFlipAxis): void {
    const image = options.getImage();
    if (!image) return;
    options.update(flipFloatingImage(image, axis));
    focusSelectedImage();
  }
  function restoreImage(): void {
    const image = options.getImage();
    if (!image) return;
    const next = restoreFloatingImage(
      image,
      options.getLayout(),
      naturalSizes.value.get(image.assetId),
    );
    if (next) options.update(next);
    focusSelectedImage();
  }
  function startCropGesture(direction: ImageCropGesture, event: PointerEvent): void {
    if (event.button !== 0 || !crop.value || !options.layer.value) return;
    focusSelectedImage();
    cropGesture.value = {
      pointerId: event.pointerId,
      direction,
      selection: { ...crop.value.selection },
      x: event.clientX,
      y: event.clientY,
    };
  }
  function moveCropGesture(event: PointerEvent): void {
    const active = cropGesture.value;
    const current = crop.value;
    if (!active || !current || active.pointerId !== event.pointerId) return;
    crop.value = {
      ...current,
      selection: adjustImageCropSelection(
        active.selection,
        active.direction,
        {
          x: (event.clientX - active.x) / options.getScale() / current.image.width,
          y: (event.clientY - active.y) / options.getScale() / current.image.height,
        },
        {
          width: Math.min(1, MINIMUM_IMAGE_SIZE / current.image.width),
          height: Math.min(1, MINIMUM_IMAGE_SIZE / current.image.height),
        },
      ),
    };
  }
  return {
    crop,
    cropGesture,
    canRestore,
    cacheImageSize,
    startCrop,
    endCropGesture,
    cancelCrop,
    applyCrop,
    rotateImage,
    flipImage,
    restoreImage,
    startCropGesture,
    moveCropGesture,
  };
}
