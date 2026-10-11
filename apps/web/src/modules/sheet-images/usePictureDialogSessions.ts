import { getCurrentScope, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  cloneFloatingImage,
  normalizeImageTransform,
  type FloatingImage,
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
  image: FloatingImage;
  selectedIds: string[];
  sources: Array<{ id: string; assetId: string }>;
};
type Dialog = { dialogId: string; error: Ref<MessageKey | undefined>; close: () => void };
type AnnotationDialog = Dialog & {
  image: FloatingImage;
  confirm: (image: FloatingImage) => boolean;
};
type CompressionDialog = Dialog & { confirm: (settings: PictureCompression) => Promise<boolean> };
type BatchDialog = Dialog & {
  image: FloatingImage;
  confirm: (settings: ResizeSettings) => boolean;
};

export function usePictureDialogSessions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getSelectedImage: () => FloatingImage | undefined;
  getSelectedIds: () => readonly string[];
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
    if (disposed || !image || options.isBusy() || !canUseSheetPermission(sheet, "editObjects"))
      return;
    return {
      workbook: options.getWorkbook(),
      sheet,
      generation: options.getGeneration(),
      image: cloneFloatingImage(image),
      selectedIds: [...options.getSelectedIds()],
      sources: sheet.floatingImages.map(({ id, assetId }) => ({ id, assetId })),
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
      canUseSheetPermission(owner.sheet, "editObjects") &&
      selected?.id === owner.image.id &&
      selected.assetId === owner.image.assetId &&
      JSON.stringify(options.getSelectedIds()) === JSON.stringify(owner.selectedIds) &&
      (all
        ? JSON.stringify(owner.sheet.floatingImages.map(({ id, assetId }) => ({ id, assetId }))) ===
          JSON.stringify(owner.sources)
        : owner.selectedIds.every((id) => {
            const source = owner.sources.find((entry) => entry.id === id);
            return (
              source &&
              owner.sheet.floatingImages.some(
                (image) => image.id === id && image.assetId === source.assetId,
              )
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
  function openCompression(): void {
    const owner = capture();
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
        if (!current(owner, settings.all) || options.isBusy()) {
          dialog.error.value = "picture.operationFailed";
          return false;
        }
        working = true;
        const valid = () => compression.value === dialog && current(owner, settings.all);
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
    const owner = capture();
    if (!owner) return;
    const dialog: BatchDialog = {
      dialogId: idFactory("picture-batch-size"),
      image: owner.image,
      error: ref(),
      close: () => {
        if (batch.value === dialog) batch.value = undefined;
      },
      confirm: (settings) => {
        if (batch.value !== dialog) return false;
        dialog.error.value = undefined;
        if (!current(owner, settings.all) || options.isBusy()) {
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
