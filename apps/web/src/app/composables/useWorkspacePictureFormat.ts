import { computed, nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import type { FloatingImage, ImageAppearance, Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { ImageAssetStore } from "../../modules/image-assets/imageAssetStore";
import type PictureFormatPaneType from "../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import type { PictureContextSourceAction } from "../../modules/sheet-images/picture-context-source-action";
import type { PictureEffectEdit } from "../../modules/sheet-images/picture-effect-edit";
import type { PictureFormatLabelKey } from "../../modules/sheet-images/picture-format-pane-model";
import { createPicturePaintAssetSource } from "../../modules/sheet-images/picture-paint-asset-source";
import { useOwnedPictureFormatPane } from "../../modules/sheet-images/useOwnedPictureFormatPane";
import type { usePictureAssetTools } from "../../modules/sheet-images/usePictureAssetTools";
import type { usePictureCellConversion } from "../../modules/sheet-images/usePictureCellConversion";
import { usePictureDialogSessions } from "../../modules/sheet-images/usePictureDialogSessions";
import { usePictureIntrinsicSize } from "../../modules/sheet-images/usePictureIntrinsicSize";
import { usePictureToolbarOwner } from "../../modules/sheet-images/usePictureToolbarOwner";
import type { usePictureTools } from "../../modules/sheet-images/usePictureTools";
import type { useSheetImageActions } from "../../modules/sheet-images/useSheetImageActions";
import type { MessageKey } from "../../shared/i18n";

type OwnedPictureLeaf = {
  node: Exclude<FloatingImage, { kind: "group" }>;
  path: PictureGroupPath;
};

type WorkspacePictureFormatOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookRevision: () => number;
  getPictureOwnerGeneration: () => number;
  selectedPictureId: Ref<string | null>;
  selectedPictureIds: Ref<string[]>;
  selectedOwnedPicturePath: Ref<PictureGroupPath | null>;
  selectedPicture: ComputedRef<FloatingImage | undefined>;
  selectedOwnedPictureLeaf: ComputedRef<OwnedPictureLeaf | undefined>;
  imageAssetUrls: ComputedRef<ReadonlyMap<string, string>>;
  assetStore: ImageAssetStore;
  isBusy: () => boolean;
  getPictureFrameContext: (sheet: Sheet) => PictureFrameLayoutContext | undefined;
  applyPendingPictureCrop: () => boolean | undefined;
  canCropPicture: () => boolean;
  cropImage: () => boolean;
  canPreviewPicture: () => boolean;
  previewSelectedPicture: () => boolean;
  finishCellEdit: () => boolean;
  setFloatingImage: (image: FloatingImage, sheetId?: string) => boolean;
  pictureTools: ReturnType<typeof usePictureTools>;
  pictureAssetTools: ReturnType<typeof usePictureAssetTools>;
  pictureCellConversion: ReturnType<typeof usePictureCellConversion>;
  imageActions: ReturnType<typeof useSheetImageActions>;
  t: (key: MessageKey) => string;
};

/** Owns the picture format side-pane, intrinsic size/reset, paint assets, source ribbon lease, and picture dialog sessions. */
export function useWorkspacePictureFormat(options: WorkspacePictureFormatOptions) {
  const {
    selectedPictureId,
    selectedPictureIds,
    selectedOwnedPicturePath,
    selectedPicture,
    selectedOwnedPictureLeaf,
    imageAssetUrls,
    pictureTools,
    pictureAssetTools,
    pictureCellConversion,
    imageActions,
  } = options;

  const pictureFormatVisible = ref(false);
  const pictureFormatComponentRef = ref<InstanceType<typeof PictureFormatPaneType> | null>(null);
  const pictureFormatInitialTab = ref<"effects" | "size-properties">("size-properties");
  const pictureFormatInitialPaint = ref<"fill" | "line" | undefined>();

  const pictureIntrinsicOwner = computed<readonly unknown[]>((previous) => {
    const next = [
      options.getWorkbook(),
      options.getActiveSheet(),
      options.getPictureOwnerGeneration(),
      JSON.stringify(selectedPictureIds.value),
      JSON.stringify(selectedOwnedPicturePath.value ?? null),
    ];
    // Grid revision notifications may replace selection arrays without changing their owner.
    return previous && next.every((value, index) => value === previous[index]) ? previous : next;
  });

  function selectedPictureIntrinsicSource() {
    if (selectedPictureIds.value.length !== 1) return;
    const leaf = selectedOwnedPictureLeaf.value;
    if (selectedOwnedPicturePath.value && selectedOwnedPicturePath.value.length > 1 && !leaf)
      return;
    const node = leaf?.node ?? selectedPicture.value;
    if (!node || isPictureGroup(node)) return;
    const url = imageAssetUrls.value.get(node.assetId);
    return url ? { assetId: node.assetId, url } : undefined;
  }

  const pictureIntrinsic = usePictureIntrinsicSize({
    getOwner: () => pictureIntrinsicOwner.value,
    getSource: selectedPictureIntrinsicSource,
  });

  const pictureIntrinsicRetry = computed(() => {
    const owner = pictureIntrinsicOwner.value,
      source = selectedPictureIntrinsicSource();
    return () => {
      const now = selectedPictureIntrinsicSource();
      if (
        owner === pictureIntrinsicOwner.value &&
        source?.assetId === now?.assetId &&
        source?.url === now?.url
      )
        pictureIntrinsic.retry();
    };
  });

  function pictureFormatBusy(): boolean {
    return options.isBusy();
  }

  function beforePictureFormatInteraction(): boolean {
    const workbook = options.getWorkbook(),
      sheet = options.getActiveSheet(),
      generation = options.getPictureOwnerGeneration();
    const ids = JSON.stringify(selectedPictureIds.value),
      path = JSON.stringify(selectedOwnedPicturePath.value);
    if (options.applyPendingPictureCrop() === false) return false;
    return (
      options.getWorkbook() === workbook &&
      options.getActiveSheet() === sheet &&
      options.getPictureOwnerGeneration() === generation &&
      JSON.stringify(selectedPictureIds.value) === ids &&
      JSON.stringify(selectedOwnedPicturePath.value) === path
    );
  }

  function beforePictureFormatPaneInteraction(): boolean {
    if (pictureFormatBusy()) return false;
    // Viewing a protected object's settings must never flush a pending crop edit.
    if (!canEditPictureSelection(options.getActiveSheet(), selectedPictureIds.value)) return true;
    return beforePictureFormatInteraction();
  }

  const pictureOriginalResetOwner = computed(() => {
    const owner = pictureIntrinsicOwner.value,
      node = selectedOwnedPictureLeaf.value?.node ?? selectedPicture.value,
      size = pictureIntrinsic.size.value,
      source = selectedPictureIntrinsicSource(),
      path =
        selectedOwnedPictureLeaf.value?.path ??
        (selectedPictureIds.value.length === 1 ? [selectedPictureIds.value[0]!] : []),
      signature = node ? JSON.stringify(node) : undefined;
    const available =
      !!node &&
      !isPictureGroup(node) &&
      !!size &&
      size.assetId === source?.assetId &&
      size.url === source?.url;
    return {
      available,
      reason: options.t(
        pictureIntrinsic.status.value === "loading"
          ? "pictureFormat.originalSizeLoading"
          : "pictureFormat.originalSizeUnavailable",
      ),
      apply: (): boolean => {
        const current = selectedOwnedPictureLeaf.value?.node ?? selectedPicture.value,
          now = selectedPictureIntrinsicSource();
        if (
          !available ||
          !size ||
          owner !== pictureIntrinsicOwner.value ||
          size !== pictureIntrinsic.size.value ||
          source?.assetId !== now?.assetId ||
          source?.url !== now?.url ||
          JSON.stringify(current) !== signature ||
          pictureFormatBusy() ||
          !beforePictureFormatInteraction()
        )
          return false;
        return pictureTools.restoreOriginal(path, {
          assetId: size.assetId,
          width: size.width,
          height: size.height,
        });
      },
    };
  });

  const pictureFormatPane = useOwnedPictureFormatPane({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getPictureOwnerGeneration,
    getRevision: options.getWorkbookRevision,
    getContext: () => options.getPictureFrameContext(options.getActiveSheet()),
    getSelectedPath: () => selectedOwnedPicturePath.value,
    getSelectedIds: () => selectedPictureIds.value,
    isOpen: () => pictureFormatVisible.value,
    isBusy: pictureFormatBusy,
    execute: pictureTools.replaceAll,
    onCropShapeApplied: (path) => {
      const owner = options.getActiveSheet(),
        generation = options.getPictureOwnerGeneration();
      void nextTick(() => {
        if (
          options.getActiveSheet() !== owner ||
          options.getPictureOwnerGeneration() !== generation ||
          selectedPictureIds.value.length !== 1 ||
          selectedPictureIds.value[0] !== path[0]
        )
          return;
        const selected = selectedOwnedPicturePath.value;
        if (path.length > 1 && JSON.stringify(selected) !== JSON.stringify(path)) return;
        if (path.length === 1 && selected && selected.length > 1) return;
        if (options.canCropPicture()) options.cropImage();
      });
    },
    getDisabledReason: () => options.t("pictureFormat.capabilityReasons.unsupportedFeature"),
    getUnsupportedCropReason: () => options.t("picture.groupReflectionUnsupported"),
    isImageAssetAvailable: (assetId) =>
      imageAssetUrls.value.has(assetId) || picturePaintAssets.has(assetId),
    getIntrinsicSize: (assetId) => {
      const size = pictureIntrinsic.size.value;
      return size?.assetId === assetId && imageAssetUrls.value.get(assetId) === size.url
        ? size
        : undefined;
    },
    getMissingIntrinsicReason: () =>
      options.t(
        pictureIntrinsic.status.value === "loading"
          ? "pictureFormat.originalSizeLoading"
          : "pictureFormat.originalSizeUnavailable",
      ),
    getOriginalSizeLimitReason: () => options.t("pictureFormat.originalSizeTooLarge"),
    getInheritedLineReason: () => options.t("pictureFormat.capabilityReasons.inheritedLine"),
    getCompositeLineReason: () => options.t("pictureFormat.capabilityReasons.compositeLine"),
    getInheritedPropertiesReason: () =>
      options.t("pictureFormat.capabilityReasons.inheritedProperties"),
    getProtectedReason: () => options.t("pictureFormat.capabilityReasons.protectedObject"),
    getLockPermissionReason: () => options.t("pictureFormat.capabilityReasons.lockPermission"),
  });

  const picturePaintAssets = createPicturePaintAssetSource({
    getSnapshot: () => pictureFormatPane.snapshot.value,
    store: options.assetStore,
  });
  onBeforeUnmount(picturePaintAssets.dispose);

  function pictureFormatLabel(key: PictureFormatLabelKey): string {
    return options.t(`pictureFormat.${key}` as MessageKey);
  }

  function openOwnedPictureFormat(
    path?: PictureGroupPath,
    owner = options.getActiveSheet(),
    paint?: "fill" | "line",
    target?: "effects",
  ): void {
    if (owner !== options.getActiveSheet() || pictureFormatBusy()) return;
    if (path) selectedOwnedPicturePath.value = path.length > 1 ? [...path] : null;
    if (!pictureFormatVisible.value) {
      pictureFormatInitialPaint.value = paint;
      pictureFormatInitialTab.value = target ?? "size-properties";
    }
    pictureFormatVisible.value = true;
    if (paint) pictureFormatComponentRef.value?.showPaint(paint);
    else if (target === "effects") pictureFormatComponentRef.value?.showEffects();
  }

  function closeOwnedPictureFormat(): void {
    pictureFormatVisible.value = false;
    pictureFormatPane.close();
  }

  const pictureDialogs = usePictureDialogSessions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getPictureOwnerGeneration,
    getSelectedImage: () => selectedPicture.value ?? undefined,
    getSelectedIds: () => selectedPictureIds.value,
    getSelectedPath: () => selectedOwnedPicturePath.value,
    getFrameContext: () => options.getPictureFrameContext(options.getActiveSheet()),
    isBusy: pictureFormatBusy,
    hasAsset: (id) => Boolean(imageAssetUrls.value.get(id)),
    setImage: options.setFloatingImage,
    setImages: (images, sheetId) =>
      sheetId === options.getActiveSheet().id && pictureTools.replaceAll(images),
    flushPendingEdits: () =>
      options.finishCellEdit() && (options.applyPendingPictureCrop() ?? false),
    compress: pictureAssetTools.compress,
    resize: pictureTools.resizeMany,
    resizeFeedback: () => pictureTools.sizeFeedback.value,
  });
  const {
    annotation: pictureAnnotation,
    compression: pictureCompression,
    batch: pictureBatchSize,
  } = pictureDialogs;

  watch(selectedPictureId, (id) => {
    if (!id) pictureDialogs.closeBatchSize();
  });

  let sourceRibbonSequence = 0;
  let sourceRibbonDisplaySequence = 0;
  let sourceRibbonDisplayOwner: readonly unknown[] | undefined;
  const pictureSourceRibbonOwner = computed(() => {
    void options.getWorkbookRevision();
    const leaf = selectedOwnedPictureLeaf.value,
      image = leaf?.node ?? selectedPicture.value;
    if (!image || isPictureGroup(image)) {
      sourceRibbonDisplayOwner = undefined;
      return;
    }
    const workbook = options.getWorkbook(),
      sheet = options.getActiveSheet(),
      generation = options.getPictureOwnerGeneration(),
      revision = options.getWorkbookRevision();
    const path = leaf?.path,
      selected = [...selectedPictureIds.value],
      context = options.getPictureFrameContext(sheet);
    // Command leases refresh with frame context. Rendering identity must not:
    // late layout notifications otherwise remove a trigger already safely focused.
    const displayOwner = [
      workbook,
      sheet,
      generation,
      revision,
      JSON.stringify(selected),
      JSON.stringify(path ?? null),
      image.id,
      image.assetId,
    ];
    if (
      !sourceRibbonDisplayOwner ||
      !displayOwner.every((value, index) => value === sourceRibbonDisplayOwner![index])
    ) {
      sourceRibbonDisplayOwner = displayOwner;
      sourceRibbonDisplaySequence++;
    }
    const displayKey = `picture-source-display-${sourceRibbonDisplaySequence}`;
    const key = `picture-source-owner-${++sourceRibbonSequence}`;
    const current = (): boolean =>
      key === pictureSourceRibbonOwner.value?.key &&
      workbook === options.getWorkbook() &&
      sheet === options.getActiveSheet() &&
      generation === options.getPictureOwnerGeneration() &&
      revision === options.getWorkbookRevision() &&
      selected.length === selectedPictureIds.value.length &&
      selected.every((id, index) => id === selectedPictureIds.value[index]) &&
      JSON.stringify(path ?? null) === JSON.stringify(selectedOwnedPicturePath.value ?? null) &&
      context?.metrics === options.getPictureFrameContext(sheet)?.metrics;
    return {
      key,
      displayKey,
      appearance: (patch: Partial<ImageAppearance> | undefined) => {
        if (!current() || !beforePictureFormatInteraction()) return false;
        return pictureTools.applyAppearance(patch);
      },
      effect: (edit: PictureEffectEdit) => {
        if (!current() || !beforePictureFormatInteraction()) return false;
        return pictureTools.applyEffect(edit);
      },
      save: () => {
        if (current()) void pictureAssetTools.exportPictures("png");
      },
      canReplace: imageActions.canReplace(image.id, path),
      canAnnotate: pictureDialogs.canAnnotate(),
      annotate: () => current() && pictureDialogs.openAnnotation(),
      canConvert: pictureCellConversion.canConvert(path?.[0] ?? image.id, path),
      convert: () => current() && pictureCellConversion.request(path?.[0] ?? image.id, path),
      canCrop: options.canCropPicture(),
      canPreview: options.canPreviewPicture(),
      preview: () => current() && options.previewSelectedPicture(),
      crop: () => current() && options.cropImage(),
      replace: () => {
        if (current()) void imageActions.requestReplace(image.id, path);
      },
      format: (target?: "effects") => {
        if (current()) openOwnedPictureFormat(path, sheet, undefined, target);
      },
    };
  });

  function performPictureContextSourceAction(
    action: PictureContextSourceAction,
    path: PictureGroupPath,
    owner: Sheet,
  ): void {
    if (
      owner !== options.getActiveSheet() ||
      pictureFormatBusy() ||
      selectedPictureIds.value.length !== 1 ||
      selectedPictureIds.value[0] !== path[0] ||
      JSON.stringify(path.length > 1 ? path : null) !==
        JSON.stringify(selectedOwnedPicturePath.value)
    )
      return;
    const source = pictureSourceRibbonOwner.value;
    if (!source) return;
    if (action === "replace" && source.canReplace) source.replace();
    else if (action === "save") source.save();
    else if (action === "crop" && source.canCrop) source.crop();
    else if (action === "annotate" && source.canAnnotate) source.annotate();
    else if (action === "preview" && source.canPreview) source.preview();
    else if (action === "format") source.format();
  }

  const pictureToolbarOwner = usePictureToolbarOwner({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getPictureOwnerGeneration,
    getImage: () => selectedPicture.value,
    getSelectedIds: () => selectedPictureIds.value,
    getFrameContext: () => options.getPictureFrameContext(options.getActiveSheet()),
    isBusy: pictureFormatBusy,
    resize: pictureTools.resizeOne,
    aspectRatio: pictureTools.setAspectRatio,
    appearance: pictureTools.applyAppearance,
    effect: pictureTools.applyEffect,
  });

  watch([options.getPictureOwnerGeneration, selectedPictureId], pictureTools.clearFeedback, {
    flush: "sync",
  });

  return {
    pictureFormatVisible,
    pictureFormatComponentRef,
    pictureFormatInitialTab,
    pictureFormatInitialPaint,
    pictureIntrinsic,
    pictureIntrinsicRetry,
    pictureOriginalResetOwner,
    beforePictureFormatPaneInteraction,
    beforePictureFormatInteraction,
    pictureFormatPane,
    picturePaintAssets,
    pictureFormatLabel,
    openOwnedPictureFormat,
    closeOwnedPictureFormat,
    pictureSourceRibbonOwner,
    performPictureContextSourceAction,
    pictureToolbarOwner,
    pictureDialogs,
    pictureAnnotation,
    pictureCompression,
    pictureBatchSize,
  };
}
