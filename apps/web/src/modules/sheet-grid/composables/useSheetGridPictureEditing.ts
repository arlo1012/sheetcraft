import { computed, nextTick, watch, type ComputedRef, type Ref } from "vue";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { resolvePictureFrame, resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type PictureCropToolbarType from "../../sheet-images/components/PictureCropToolbar.vue";
import type SheetPictureCropOverlayType from "../../sheet-images/components/SheetPictureCropOverlay.vue";
import type { DrawingThemeEffects } from "../../sheet-images/drawing-theme-effects";
import {
  getPictureCropViewportFragments,
  preparePictureCropPreview,
} from "../../sheet-images/picture-crop-preview";
import { resolveOwnedPictureNode } from "../../sheet-images/picture-group-interaction";
import {
  usePictureCropSession,
  type PictureCropDirection,
} from "../../sheet-images/usePictureCropSession";
import { usePictureTransparentColor } from "../../sheet-images/usePictureTransparentColor";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import type { MessageKey } from "../../../shared/i18n";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";

type ImageLayerMenuController = {
  closePictureContextMenu: () => void;
  openSelectedContextMenu: (event: MouseEvent) => void;
};

type PictureImageCache = Parameters<typeof createPicturePaintResources>[2] & {
  get: (url: string) => HTMLImageElement | undefined;
};

export type SheetGridPictureEditingOptions = {
  getSheet: () => Sheet;
  getTheme: () => WorkbookTheme | undefined;
  getGeneration: () => number;
  getRevision: () => number;
  isPictureSourceBusy: () => boolean;
  pictureFrameContext: ComputedRef<PictureFrameLayoutContext | undefined>;
  selectedImageIds: Ref<string[]>;
  selectedOwnedPicturePath: Ref<PictureGroupPath | null>;
  pictureSelectionReadOnly: ComputedRef<boolean>;
  drawingThemeEffects: ComputedRef<DrawingThemeEffects | undefined>;
  layout: ComputedRef<SheetViewportLayout>;
  scale: ComputedRef<number>;
  headerSize: ComputedRef<{ width: number; height: number }>;
  rootRef: Ref<HTMLElement | null>;
  cropOverlayRef: Ref<InstanceType<typeof SheetPictureCropOverlayType> | undefined>;
  cropToolbarRef: Ref<InstanceType<typeof PictureCropToolbarType> | undefined>;
  resolvedImageUrls: ComputedRef<ReadonlyMap<string, string>>;
  floatingImageCache: PictureImageCache;
  getImageLayer: () => ImageLayerMenuController | undefined;
  getOwnedImageLayer: () => ImageLayerMenuController | undefined;
  applyPictureCollectionChange: (roots: readonly Sheet["floatingImages"][number][]) => boolean;
  flushPendingEdit: () => boolean;
  focusEditor: () => void;
  onImageFeedback: (key: MessageKey) => void;
};

/** Owns SheetGrid picture crop session, crop toolbar/overlay interactions, crop-shape adjustment handles, and transparent-color picking. */
export function useSheetGridPictureEditing(options: SheetGridPictureEditingOptions) {
  const {
    pictureFrameContext,
    selectedImageIds,
    selectedOwnedPicturePath,
    pictureSelectionReadOnly,
    drawingThemeEffects,
    layout,
    scale,
    headerSize,
    rootRef,
    resolvedImageUrls,
    floatingImageCache,
  } = options;

  const pictureCrop = usePictureCropSession({
    getSheet: options.getSheet,
    getGeneration: options.getGeneration,
    getRevision: options.getRevision,
    getContext: () => pictureFrameContext.value,
    getSelectedIds: () => selectedImageIds.value,
    getSelectedPath: () => selectedOwnedPicturePath.value,
    isReadOnly: () => pictureSelectionReadOnly.value,
    execute: options.applyPictureCollectionChange,
    getThemeEffects: () => drawingThemeEffects.value,
    onFailure: () => options.onImageFeedback("picture.operationFailed"),
  });

  const { cropOverlayRef, cropToolbarRef } = options;
  let pendingCropOverlayFocus = false;
  let cropPointer: PointerSession | undefined;

  function stopCropPointer(): void {
    const pointer = cropPointer;
    cropPointer = undefined;
    pointer?.cancel();
  }

  function finishPictureCrop(cancel = false, restoreFocus = true): boolean {
    // Drop mode before releasing capture so pointer cancellation cannot restore an applied draft.
    const accepted = cancel ? (pictureCrop.cancel(), true) : pictureCrop.apply();
    if (accepted) {
      pendingCropOverlayFocus = false;
      stopCropPointer();
      options.getImageLayer()?.closePictureContextMenu();
      options.getOwnedImageLayer()?.closePictureContextMenu();
      if (restoreFocus) options.focusEditor();
    }
    return accepted;
  }

  function startPictureCrop(): boolean {
    if (pictureCrop.active.value) return finishPictureCrop();
    if (!options.flushPendingEdit() || !pictureCrop.start()) return false;
    pendingCropOverlayFocus = true;
    void nextTick(() => {
      const overlay = cropOverlayRef.value?.$el as HTMLElement | undefined;
      if (overlay && pendingCropOverlayFocus && pictureCrop.active.value) {
        pendingCropOverlayFocus = false;
        overlay.focus({ preventScroll: true });
      }
    });
    return true;
  }

  watch(cropOverlayRef, (overlay) => {
    if (overlay && pendingCropOverlayFocus && pictureCrop.active.value) {
      pendingCropOverlayFocus = false;
      void nextTick(() =>
        (overlay.$el as HTMLElement | undefined)?.focus({
          preventScroll: true,
        }),
      );
    }
  });

  function openCropContextMenu(event: MouseEvent): void {
    if (!pictureCrop.active.value) return;
    if (selectedOwnedPicturePath.value?.length && selectedOwnedPicturePath.value.length > 1)
      options.getOwnedImageLayer()?.openSelectedContextMenu(event);
    else options.getImageLayer()?.openSelectedContextMenu(event);
  }

  function startPictureCropGesture(direction: PictureCropDirection, event: PointerEvent): void {
    if (event.button !== 0 || !pictureCrop.active.value) return;
    stopCropPointer();
    const snapshot = pictureCrop.captureGesture();
    if (!snapshot) return;
    const start = { x: event.clientX, y: event.clientY },
      gestureScale = scale.value;
    const move = (pointer: PointerEvent | MouseEvent) => {
      if (
        !pictureCrop.previewGesture(snapshot, direction, {
          x: (pointer.clientX - start.x) / gestureScale,
          y: (pointer.clientY - start.y) / gestureScale,
        })
      )
        options.onImageFeedback("picture.operationFailed");
    };
    cropPointer = startPointerSession({
      event,
      captureTarget: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
      onMove: move,
      onEnd: (pointer) => {
        cropPointer = undefined;
        move(pointer);
        pictureCrop.finishGesture(snapshot);
      },
      onCancel: () => {
        cropPointer = undefined;
        pictureCrop.cancelGesture(snapshot);
      },
    });
  }

  function startPictureShapeAdjustment(index: number, event: PointerEvent): void {
    if (event.button !== 0) return;
    const immediate = !pictureCrop.active.value;
    if (immediate && (!options.flushPendingEdit() || !pictureCrop.start())) return;
    stopCropPointer();
    const snapshot = pictureCrop.captureGesture();
    if (!snapshot) return;
    const start = { x: event.clientX, y: event.clientY },
      zoom = scale.value;
    const move = (pointer: PointerEvent | MouseEvent) =>
      pictureCrop.previewShapeAdjustment(snapshot, index, {
        x: (pointer.clientX - start.x) / zoom,
        y: (pointer.clientY - start.y) / zoom,
      });
    cropPointer = startPointerSession({
      event,
      captureTarget: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
      onMove: (pointer) => {
        if (!move(pointer)) options.onImageFeedback("picture.operationFailed");
      },
      onEnd: (pointer) => {
        cropPointer = undefined;
        move(pointer);
        pictureCrop.finishGesture(snapshot);
        if (immediate) finishPictureCrop();
      },
      onCancel: () => {
        cropPointer = undefined;
        pictureCrop.cancelGesture(snapshot);
        if (immediate) pictureCrop.cancel();
      },
    });
  }

  function nudgePictureShapeAdjustment(index: number, delta: Point): void {
    const immediate = !pictureCrop.active.value;
    if (immediate && (!options.flushPendingEdit() || !pictureCrop.start())) return;
    stopCropPointer();
    const snapshot = pictureCrop.captureGesture();
    if (!snapshot || !pictureCrop.previewShapeAdjustment(snapshot, index, delta)) {
      if (immediate) pictureCrop.cancel();
      options.onImageFeedback("picture.operationFailed");
      return;
    }
    pictureCrop.finishGesture(snapshot);
    if (immediate) finishPictureCrop();
  }

  const pictureAdjustmentView = computed(() => {
    if (pictureCrop.view.value) return pictureCrop.view.value;
    if (selectedImageIds.value.length !== 1 || pictureSelectionReadOnly.value) return;
    const context = pictureFrameContext.value;
    const sheet = options.getSheet();
    const root = sheet.floatingImages.find((entry) => entry.id === selectedImageIds.value[0]);
    if (!context || !root || root.hidden) return;
    if (isFramedPictureObject(root) && root.frame.cropShape)
      return {
        picture: root,
        geometry: resolvePictureFrame(root.frame, context.metrics),
      };
    const path = selectedOwnedPicturePath.value;
    if (!isPictureGroup(root) || !path || path.length < 2) return;
    const selected = resolveOwnedPictureNode(sheet.floatingImages, path, context);
    if (
      selected?.visible &&
      selected.layout &&
      selected.node.kind === "grouped-picture-v1" &&
      selected.node.frame.cropShape
    )
      return {
        picture: selected.node,
        geometry: resolvePictureSourceLayout(
          selected.layout.rect,
          selected.layout.angleDeg,
          selected.node.frame.source,
        ),
      };
  });

  function onPictureCropKeydown(event: KeyboardEvent): void {
    if (!pictureCrop.active.value || event.isComposing || event.defaultPrevented) return;
    const target = event.target;
    if (
      target instanceof Element &&
      !rootRef.value?.contains(target) &&
      !target.closest(
        "[data-picture-crop-toolbar], [data-owned-picture-context-menu], [data-floating-image-context-menu]",
      )
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishPictureCrop();
      return;
    }
    // Menus and toolbar buttons retain their own Arrow/Enter navigation. Only
    // Escape is shared with the crop owner's exit contract.
    if (
      target instanceof Element &&
      target.closest(
        "[data-picture-crop-toolbar], [data-picture-shape-adjustment], [role=menu], input, textarea, [contenteditable=true]",
      )
    )
      return;
    const history = getWorkbookHistoryShortcut(event);
    if (history) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopCropPointer();
      if (history === "undo") pictureCrop.undoDraft();
      else pictureCrop.redoDraft();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cropToolbarRef.value?.openRatios();
      return;
    }
    const distance = event.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopCropPointer();
    const snapshot = pictureCrop.captureGesture();
    if (snapshot && pictureCrop.previewGesture(snapshot, "source", delta))
      pictureCrop.finishGesture(snapshot);
  }

  const cropControls = computed(() => {
    const view = pictureCrop.view.value;
    if (!view) return null;
    const id = view.id;
    const current = () => pictureCrop.view.value?.id === id;
    return {
      id,
      apply: () => current() && finishPictureCrop(),
      cancel: () => {
        if (current()) finishPictureCrop(true);
      },
      setShape: (shape: PictureCropShape | undefined) => {
        if (!current()) return false;
        stopCropPointer();
        return pictureCrop.setShape(shape);
      },
      resetShapeAndCrop: () => {
        if (!current()) return false;
        stopCropPointer();
        return pictureCrop.resetShapeAndCrop();
      },
      setRatio: (ratio: number) => {
        if (!current()) return false;
        stopCropPointer();
        return pictureCrop.setRatio(ratio);
      },
    };
  });

  const cropToolbarAnchor = computed<FloatingReference | null>(() => {
    const view = pictureCrop.view.value,
      root = rootRef.value;
    if (!view || !root) return null;
    const fragments = getPictureCropViewportFragments(
      preparePictureCropPreview(view.picture, view.geometry),
      layout.value,
    );
    if (!fragments.length) return null;
    const frame = fragments.find((fragment) => fragment.paneId === "body") ?? fragments[0]!;
    const bounds = frame.clippedBounds,
      zoom = scale.value,
      header = headerSize.value;
    return {
      contextElement: root,
      getBoundingClientRect: () => {
        const host = root.getBoundingClientRect();
        return new DOMRect(
          host.left + (header.width + bounds.x) * zoom,
          host.top + (header.height + bounds.y) * zoom,
          bounds.width * zoom,
          bounds.height * zoom,
        );
      },
    };
  });

  watch([layout, scale], () => stopCropPointer(), { flush: "sync" });
  watch(
    pictureCrop.active,
    (active) => {
      if (!active) stopCropPointer();
    },
    { flush: "sync" },
  );

  const pictureTransparentColor = usePictureTransparentColor({
    getSheet: options.getSheet,
    getGeneration: options.getGeneration,
    getRevision: options.getRevision,
    getPath: () =>
      selectedImageIds.value.length === 1
        ? (selectedOwnedPicturePath.value ?? [selectedImageIds.value[0]!])
        : undefined,
    isReadOnly: () =>
      pictureSelectionReadOnly.value ||
      options.isPictureSourceBusy() ||
      pictureCrop.active.value ||
      !pictureFrameContext.value,
    getLayout: () => layout.value,
    getFrameContext: () => pictureFrameContext.value,
    getEffects: () => drawingThemeEffects.value,
    getResources: () =>
      createPicturePaintResources(options.getTheme(), resolvedImageUrls.value, floatingImageCache),
    getImage: (assetId) => {
      const url = resolvedImageUrls.value.get(assetId);
      return url ? floatingImageCache.get(url) : undefined;
    },
    onError: () => options.onImageFeedback("picture.operationFailed"),
  });

  return {
    pictureCrop,
    cropOverlayRef,
    cropToolbarRef,
    stopCropPointer,
    finishPictureCrop,
    startPictureCrop,
    openCropContextMenu,
    startPictureCropGesture,
    startPictureShapeAdjustment,
    nudgePictureShapeAdjustment,
    pictureAdjustmentView,
    onPictureCropKeydown,
    cropControls,
    cropToolbarAnchor,
    pictureTransparentColor,
  };
}
