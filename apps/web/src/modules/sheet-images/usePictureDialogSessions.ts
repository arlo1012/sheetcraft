import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  capturePictureSourceSelection,
  isPictureSourceSelectionCurrent,
  type PictureSourceSelection,
} from "./picture-source-selection";
import { getPictureToolGeometry, pictureToolGeometryIdentity } from "./picture-tool-geometry";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import { getCurrentScope, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import {
  cloneFloatingImage,
  normalizeImageTransform,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { MessageKey } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { PictureCompression } from "./picture-asset-conversion";

type ResizeSettings = { width: number; height: number; locked: boolean; all: boolean };
type Owner = {
  workbook: Workbook;
  sheet: Sheet;
  generation: number;
  image: LegacyFloatingImage;
  selectedIds: string[];
  sources: FloatingImage[];
};
type Dialog = { dialogId: string; error: Ref<MessageKey | undefined>; close: () => void };
type AnnotationDialog = Dialog & {
  image: LegacyFloatingImage;
  confirm: (image: FloatingImage) => boolean;
};
type CompressionDialog = Dialog & { confirm: (settings: PictureCompression) => Promise<boolean> };
type BatchDialog = Dialog & {
  image: { width: number; height: number };
  confirm: (settings: ResizeSettings) => boolean;
};

function sameLegacySource(left: FloatingImage, right: FloatingImage): boolean {
  return (
    isLegacyPictureObject(left) &&
    isLegacyPictureObject(right) &&
    left.id === right.id &&
    left.assetId === right.assetId
  );
}

export function usePictureDialogSessions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getSelectedImage: () => FloatingImage | undefined;
  getSelectedIds: () => readonly string[];
  getSelectedPath?: () => PictureGroupPath | null;
  getFrameContext?: () => PictureFrameLayoutContext | undefined;
  isBusy: () => boolean;
  hasAsset: (id: string) => boolean;
  setImage: (image: FloatingImage, sheetId: string) => boolean;
  compress: (settings: PictureCompression, shouldContinue: () => boolean) => Promise<boolean>;
  resize: (settings: ResizeSettings) => boolean;
  resizeFeedback: () => MessageKey | undefined;
}) {
  const annotation = shallowRef<AnnotationDialog>();
  const compression = shallowRef<CompressionDialog>();
  const batch = shallowRef<BatchDialog>();
  const idFactory = createBrowserIdFactory();
  let disposed = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      clear();
    });
  function capture(): Owner | undefined {
    const image = options.getSelectedImage();
    const sheet = options.getSheet();
    const selectedIds = [...options.getSelectedIds()];
    const selected = sheet.floatingImages.filter((entry) => selectedIds.includes(entry.id));
    if (
      disposed ||
      !image ||
      !isLegacyPictureObject(image) ||
      new Set(selectedIds).size !== selectedIds.length ||
      selected.length !== selectedIds.length ||
      selected.some((entry) => !isLegacyPictureObject(entry)) ||
      options.isBusy() ||
      !canEditPictureSelection(sheet, selectedIds)
    )
      return;
    return {
      workbook: options.getWorkbook(),
      sheet,
      generation: options.getGeneration(),
      image: cloneFloatingImage(image),
      selectedIds,
      sources: sheet.floatingImages.map((entry) => cloneFloatingImage(entry)),
    };
  }
  function current(owner: Owner, all = false): boolean {
    const selected = options.getSelectedImage();
    return (
      !disposed &&
      options.getWorkbook() === owner.workbook &&
      options.getSheet() === owner.sheet &&
      owner.workbook.sheets.get(owner.sheet.id) === owner.sheet &&
      options.getGeneration() === owner.generation &&
      canEditPictureSelection(
        owner.sheet,
        all ? owner.sheet.floatingImages.map((root) => root.id) : owner.selectedIds,
      ) &&
      selected !== undefined &&
      sameLegacySource(selected, owner.image) &&
      JSON.stringify(options.getSelectedIds()) === JSON.stringify(owner.selectedIds) &&
      (all
        ? owner.sheet.floatingImages.length === owner.sources.length &&
          owner.sources.every((source, index) => {
            const target = owner.sheet.floatingImages[index];
            return target !== undefined && sameLegacySource(source, target);
          })
        : owner.selectedIds.every((id) => {
            const source = owner.sources.find((entry) => entry.id === id);
            return (
              source && owner.sheet.floatingImages.some((image) => sameLegacySource(image, source))
            );
          }))
    );
  }
  function openAnnotation(): void {
    const owner = capture();
    if (!owner || !options.hasAsset(owner.image.assetId)) return;
    const originalAnnotations = normalizeImageTransform(owner.image.transform)?.annotations ?? [];
    const dialog: AnnotationDialog = {
      dialogId: idFactory("picture-annotation"),
      image: owner.image,
      error: ref(),
      close: () => {
        if (annotation.value === dialog) annotation.value = undefined;
      },
      confirm: (image) => {
        if (annotation.value !== dialog) return false;
        dialog.error.value = undefined;
        const target = owner.sheet.floatingImages.find((entry) => entry.id === owner.image.id);
        if (
          !current(owner) ||
          options.isBusy() ||
          !target ||
          !isLegacyPictureObject(target) ||
          !isLegacyPictureObject(image) ||
          target.assetId !== owner.image.assetId ||
          image.id !== owner.image.id ||
          image.assetId !== owner.image.assetId ||
          JSON.stringify(normalizeImageTransform(target.transform)?.annotations ?? []) !==
            JSON.stringify(originalAnnotations)
        ) {
          dialog.error.value = "picture.operationFailed";
          return false;
        }
        try {
          const annotations = normalizeImageTransform(image.transform)?.annotations;
          const unchanged =
            JSON.stringify(annotations ?? []) === JSON.stringify(originalAnnotations);
          const accepted =
            unchanged ||
            options.setImage(
              {
                ...target,
                transform: normalizeImageTransform({ ...target.transform, annotations }),
              },
              owner.sheet.id,
            );
          if (!accepted) {
            dialog.error.value = "picture.operationFailed";
            return false;
          }
          if (annotation.value === dialog) annotation.value = undefined;
          return true;
        } catch {
          if (annotation.value === dialog) dialog.error.value = "picture.operationFailed";
          return false;
        }
      },
    };
    annotation.value = dialog;
  }
  type SourceOwner = {
    workbook: Workbook;
    sheet: Sheet;
    generation: number;
    selectedIds: string[];
    selectedPath: string;
    selected: PictureSourceSelection;
    all: PictureSourceSelection;
    context: PictureFrameLayoutContext | undefined;
    primaryId: string;
    geometryIdentity: readonly unknown[];
  };
  function captureSources(): SourceOwner | undefined {
    if (disposed || options.isBusy()) return;
    try {
      const sheet = options.getSheet(),
        ids = [...options.getSelectedIds()],
        image = options.getSelectedImage();
      if (!image || !ids.includes(image.id) || !canEditPictureSelection(sheet, ids)) return;
      const context = options.getFrameContext?.();
      return {
        workbook: options.getWorkbook(),
        sheet,
        generation: options.getGeneration(),
        selectedIds: ids,
        selectedPath: JSON.stringify(options.getSelectedPath?.() ?? null),
        selected: capturePictureSourceSelection(
          sheet.floatingImages,
          ids,
          options.getSelectedPath?.(),
        ),
        all: capturePictureSourceSelection(sheet.floatingImages, [], null, true),
        context,
        geometryIdentity: pictureToolGeometryIdentity(context),
        primaryId: image.id,
      };
    } catch {
      return;
    }
  }
  function currentSources(owner: SourceOwner, all = false): boolean {
    const context = options.getFrameContext?.(),
      scope = all ? owner.all : owner.selected;
    return (
      !disposed &&
      options.getWorkbook() === owner.workbook &&
      options.getSheet() === owner.sheet &&
      owner.workbook.sheets.get(owner.sheet.id) === owner.sheet &&
      options.getGeneration() === owner.generation &&
      options.getSelectedImage()?.id === owner.primaryId &&
      JSON.stringify(options.getSelectedIds()) === JSON.stringify(owner.selectedIds) &&
      JSON.stringify(options.getSelectedPath?.() ?? null) === owner.selectedPath &&
      context === owner.context &&
      pictureToolGeometryIdentity(context).every(
        (value, index) => value === owner.geometryIdentity[index],
      ) &&
      canEditPictureSelection(owner.sheet, scope.rootIds) &&
      isPictureSourceSelectionCurrent(scope, owner.sheet.floatingImages)
    );
  }
  function sourceGeometry(owner: SourceOwner): { width: number; height: number } | undefined {
    const path = owner.selected.path;
    if (path && path.length > 1) {
      if (!owner.context) return;
      const node = resolveOwnedPictureNode(owner.selected.roots, path, owner.context);
      return node?.visible && node.layout && !node.layout.collapsed
        ? { width: node.layout.rect.width, height: node.layout.rect.height }
        : undefined;
    }
    const root = owner.selected.roots.find((root) => root.id === owner.primaryId);
    return root ? getPictureToolGeometry(root, owner.context) : undefined;
  }
  function openCompression(): void {
    const owner = captureSources();
    if (!owner) return;
    let working = false;
    const dialog: CompressionDialog = {
      dialogId: idFactory("picture-compression"),
      error: ref(),
      close: () => {
        if (compression.value === dialog) compression.value = undefined;
      },
      confirm: async (settings) => {
        if (compression.value !== dialog || working) return false;
        dialog.error.value = undefined;
        if (!currentSources(owner, settings.all) || options.isBusy()) {
          dialog.error.value = "picture.operationFailed";
          return false;
        }
        working = true;
        const valid = () => compression.value === dialog && currentSources(owner, settings.all);
        try {
          const accepted = await options.compress(settings, valid);
          if (compression.value !== dialog) return false;
          if (accepted) {
            compression.value = undefined;
            return true;
          }
          dialog.error.value = "picture.operationFailed";
          return false;
        } catch {
          if (compression.value === dialog) dialog.error.value = "picture.operationFailed";
          return false;
        } finally {
          working = false;
        }
      },
    };
    compression.value = dialog;
  }
  function openBatchSize(): void {
    const owner = captureSources();
    if (!owner) return;
    const geometry = sourceGeometry(owner);
    if (!geometry) return;
    const dialog: BatchDialog = {
      dialogId: idFactory("picture-batch-size"),
      image: { width: geometry.width, height: geometry.height },
      error: ref(),
      close: () => {
        if (batch.value === dialog) batch.value = undefined;
      },
      confirm: (settings) => {
        if (batch.value !== dialog) return false;
        dialog.error.value = undefined;
        if (!currentSources(owner, settings.all) || options.isBusy()) {
          dialog.error.value = "picture.operationFailed";
          return false;
        }
        try {
          if (!options.resize(settings)) {
            dialog.error.value = options.resizeFeedback() ?? "picture.operationFailed";
            return false;
          }
          if (batch.value === dialog) batch.value = undefined;
          return true;
        } catch {
          if (batch.value === dialog) dialog.error.value = "picture.operationFailed";
          return false;
        }
      },
    };
    batch.value = dialog;
  }
  function clear(): void {
    annotation.value = undefined;
    compression.value = undefined;
    batch.value = undefined;
  }
  watch(() => [options.getWorkbook(), options.getSheet(), options.getGeneration()], clear, {
    flush: "sync",
  });
  return {
    annotation,
    compression,
    batch,
    openAnnotation,
    openCompression,
    openBatchSize,
    clear,
    closeBatchSize: () => {
      batch.value = undefined;
    },
  };
}
