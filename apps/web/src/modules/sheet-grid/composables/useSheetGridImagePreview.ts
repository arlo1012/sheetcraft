import { computed, nextTick, shallowRef, watch, type Ref } from "vue";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { resolvePictureFrame, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import {
  isFramedPictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import type { ImageTransform, Sheet } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolveOwnedPictureNode } from "../../sheet-images/picture-group-interaction";
import {
  capturePictureSourcePresentation,
  type PictureSourcePresentation,
} from "../../sheet-images/picture-source-presentation";

export type SheetGridImagePreviewInput = {
  assetId: string;
  altText: string;
  transform?: ImageTransform;
  frameSource?: PictureSourcePresentation;
};

type SheetGridImagePreviewState = SheetGridImagePreviewInput & {
  ownerId: number;
  sheet: Sheet;
  trigger?: HTMLElement;
};

type SheetGridImagePreviewOptions = {
  getSheet: () => Sheet;
  getPictureOwnerGeneration: () => number | undefined;
  getWorkbookRevision: () => number | undefined;
  getImageAssetUrls: () => ReadonlyMap<string, string> | undefined;
  selectedImageId: Ref<string | null>;
  selectedImageIds: Ref<string[]>;
  selectedOwnedPicturePath: Ref<PictureGroupPath | null>;
  isPictureCropActive: () => boolean;
  getPictureFrameContext: () => PictureFrameLayoutContext | undefined;
  focusEditor: () => void;
  onImageFeedback: (key: "picture.operationFailed") => void;
};

/** Owns lightbox image preview state, source capture, and focus restoration for SheetGrid. */
export function useSheetGridImagePreview(options: SheetGridImagePreviewOptions) {
  let imagePreviewSequence = 0;
  const imagePreview = shallowRef<SheetGridImagePreviewState>();
  const previewUrl = computed(
    () => imagePreview.value && options.getImageAssetUrls()?.get(imagePreview.value.assetId),
  );

  function openImagePreview(image: SheetGridImagePreviewInput, trigger?: HTMLElement): void {
    if (options.isPictureCropActive() || !options.getImageAssetUrls()?.has(image.assetId)) return;
    imagePreview.value = {
      ...image,
      trigger,
      ownerId: ++imagePreviewSequence,
      sheet: options.getSheet(),
    };
  }

  function openFloatingImagePreview(image: StandalonePictureObject, trigger?: HTMLElement): void {
    try {
      if (!isFramedPictureObject(image)) {
        openImagePreview(image, trigger);
        return;
      }
      const context = options.getPictureFrameContext();
      if (!context) throw new Error("Picture projection unavailable.");
      openImagePreview(
        {
          assetId: image.assetId,
          altText: image.altText,
          transform: image.transform,
          frameSource: capturePictureSourcePresentation(
            image,
            resolvePictureFrame(image.frame, context.metrics),
          ),
        },
        trigger,
      );
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function selectedPicturePreview(): SheetGridImagePreviewInput | undefined {
    if (options.isPictureCropActive() || options.selectedImageIds.value.length !== 1) return;
    const sheet = options.getSheet();
    const root = sheet.floatingImages.find((entry) => entry.id === options.selectedImageId.value);
    if (!root || root.hidden) return;
    if (isFramedPictureObject(root)) {
      const context = options.getPictureFrameContext();
      if (!context) return;
      return {
        assetId: root.assetId,
        altText: root.altText,
        transform: root.transform,
        frameSource: capturePictureSourcePresentation(
          root,
          resolvePictureFrame(root.frame, context.metrics),
        ),
      };
    }
    if (!isPictureGroup(root)) return root;
    const context = options.getPictureFrameContext();
    const path = options.selectedOwnedPicturePath.value;
    if (!context || !path || path.length <= 1) return;
    const selected = resolveOwnedPictureNode(sheet.floatingImages, path, context);
    if (
      !selected ||
      !selected.visible ||
      !selected.layout ||
      selected.node.kind !== "grouped-picture-v1"
    )
      return;
    return {
      assetId: selected.node.assetId,
      altText: selected.node.altText,
      transform: selected.node.transform,
      frameSource: capturePictureSourcePresentation(
        selected.node,
        resolvePictureSourceLayout(
          { ...selected.layout.rect },
          selected.layout.angleDeg,
          selected.node.frame.source,
        ),
      ),
    };
  }

  function canPreviewPicture(): boolean {
    try {
      const source = selectedPicturePreview();
      return !!source && !!options.getImageAssetUrls()?.has(source.assetId);
    } catch {
      return false;
    }
  }

  function previewSelectedPicture(): boolean {
    try {
      const source = selectedPicturePreview();
      if (!source || !options.getImageAssetUrls()?.has(source.assetId)) return false;
      openImagePreview(source);
      return !!imagePreview.value;
    } catch {
      options.onImageFeedback("picture.operationFailed");
      return false;
    }
  }

  const imagePreviewClose = computed(() => {
    const owner = imagePreview.value;
    return (): void => {
      if (imagePreview.value === owner) closeImagePreview();
    };
  });

  function closeImagePreview(): void {
    if (!imagePreview.value) return;
    const owner = imagePreview.value;
    const trigger = owner.trigger;
    imagePreview.value = undefined;
    void nextTick(() => {
      if (imagePreview.value || owner.sheet !== options.getSheet()) return;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
        if (document.activeElement === trigger) return;
      }
      options.focusEditor();
    });
  }

  watch(
    () => [options.getSheet(), options.getPictureOwnerGeneration(), options.getWorkbookRevision()],
    closeImagePreview,
  );
  watch(previewUrl, (url) => {
    if (!url && imagePreview.value) closeImagePreview();
  });

  return {
    imagePreview,
    previewUrl,
    openImagePreview,
    openFloatingImagePreview,
    canPreviewPicture,
    previewSelectedPicture,
    imagePreviewClose,
    closeImagePreview,
  };
}
