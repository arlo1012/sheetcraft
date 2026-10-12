import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  capturePictureSourceSelection,
  isPictureSourceSelectionCurrent,
  type PictureSourceSelection,
  type PictureAssetSource,
} from "./picture-source-selection";
import { getPictureToolGeometry, pictureToolGeometryIdentity } from "./picture-tool-geometry";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
import {
  isLegacyPictureObject,
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import {
  isGroupedPicture,
  isPictureGroup,
  findPictureGroupNode,
} from "@sheetcraft/core/picture-group";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  capturePictureSourcePresentation,
  type PictureSourcePresentation,
} from "./picture-source-presentation";
import { getCurrentScope, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import {
  normalizeImageTransform,
  type FloatingImage,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { MessageKey } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { PictureCompression } from "./picture-asset-conversion";

type ResizeSettings = { width: number; height: number; locked: boolean; all: boolean };
type Dialog = { dialogId: string; error: Ref<MessageKey | undefined>; close: () => void };
type AnnotationDialog = Dialog & {
  image: PictureAssetSource;
  frameSource?: PictureSourcePresentation;
  confirm: (
    image: FloatingImage | import("@sheetcraft/core/picture-group").GroupedPicture,
  ) => boolean;
};
type CompressionDialog = Dialog & { confirm: (settings: PictureCompression) => Promise<boolean> };
type BatchDialog = Dialog & {
  image: { width: number; height: number };
  confirm: (settings: ResizeSettings) => boolean;
};

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
  flushPendingEdits?: () => boolean;
  setImage: (image: FloatingImage, sheetId: string) => boolean;
  setImages?: (images: readonly FloatingImage[], sheetId: string) => boolean;
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
  function annotationSource(owner: SourceOwner): PictureAssetSource | undefined {
    if (owner.selectedIds.length !== 1 || owner.selected.sources.length !== 1) return;
    const entry = owner.selected.sources[0]!;
    const root = owner.sheet.floatingImages.find((value) => value.id === entry.rootId);
    if (!root) return;
    if (entry.path.length === 1) return isPictureGroup(root) ? undefined : root;
    if (
      !isPictureGroup(root) ||
      !owner.selected.path ||
      JSON.stringify(owner.selected.path) !== JSON.stringify(entry.path)
    )
      return;
    const target = findPictureGroupNode(root, entry.path)?.node;
    return isGroupedPicture(target) ? target : undefined;
  }
  function annotationPresentation(
    owner: SourceOwner,
    image: PictureAssetSource,
  ): PictureSourcePresentation | undefined {
    if (!isGroupedPicture(image) && isLegacyPictureObject(image)) return;
    if (!owner.context) throw new TypeError("Picture annotation requires source geometry.");
    if (isGroupedPicture(image)) {
      const node = resolveOwnedPictureNode(
        owner.selected.roots,
        owner.selected.sources[0]!.path,
        owner.context,
      );
      if (!node?.visible || !node.layout || !("sourceRect" in node.layout))
        throw new TypeError("Picture annotation requires its visible source leaf.");
      return capturePictureSourcePresentation(image, node.layout);
    }
    return capturePictureSourcePresentation(
      image,
      resolvePictureFrame(image.frame, owner.context.metrics),
    );
  }
  function sameAnnotationKind(left: PictureAssetSource, right: PictureAssetSource): boolean {
    if (isGroupedPicture(left) || isGroupedPicture(right))
      return isGroupedPicture(left) && isGroupedPicture(right);
    return isFramedPictureObject(left) === isFramedPictureObject(right);
  }
  function canAnnotate(): boolean {
    const owner = captureSources();
    if (!owner) return false;
    try {
      const image = annotationSource(owner);
      if (
        !image ||
        !options.hasAsset(image.assetId) ||
        (isGroupedPicture(image) && !options.setImages)
      )
        return false;
      annotationPresentation(owner, image);
      return true;
    } catch {
      return false;
    }
  }
  function openAnnotation(): boolean {
    if (disposed || options.flushPendingEdits?.() === false) return false;
    const owner = captureSources();
    if (!owner) return false;
    let image: PictureAssetSource | undefined, frameSource: PictureSourcePresentation | undefined;
    try {
      const current = annotationSource(owner);
      if (
        !current ||
        !options.hasAsset(current.assetId) ||
        (isGroupedPicture(current) && !options.setImages)
      )
        return false;
      image = owner.selected.sources[0]!.node;
      frameSource = annotationPresentation(owner, image);
    } catch {
      return false;
    }
    const originalAnnotations = normalizeImageTransform(image.transform)?.annotations ?? [];
    const dialog: AnnotationDialog = {
      dialogId: idFactory("picture-annotation"),
      image,
      ...(frameSource ? { frameSource } : {}),
      error: ref(),
      close: () => {
        if (annotation.value === dialog) annotation.value = undefined;
      },
      confirm: (payload) => {
        if (annotation.value !== dialog) return false;
        dialog.error.value = undefined;
        try {
          const target = annotationSource(owner);
          if (
            !currentSources(owner) ||
            options.isBusy() ||
            !target ||
            isPictureGroup(payload) ||
            !sameAnnotationKind(target, image) ||
            target.id !== image.id ||
            target.assetId !== image.assetId ||
            payload.id !== image.id ||
            payload.assetId !== image.assetId ||
            isGroupedPicture(payload) !== isGroupedPicture(image) ||
            (!isGroupedPicture(payload) &&
              !isGroupedPicture(image) &&
              isFramedPictureObject(payload) !== isFramedPictureObject(image)) ||
            JSON.stringify(normalizeImageTransform(target.transform)?.annotations ?? []) !==
              JSON.stringify(originalAnnotations)
          )
            throw new TypeError("Picture annotation owner or source changed.");
          const annotations = normalizeImageTransform(payload.transform)?.annotations;
          let accepted = JSON.stringify(annotations ?? []) === JSON.stringify(originalAnnotations);
          if (!accepted) {
            if (isGroupedPicture(target)) {
              const roots = normalizePictureObjectCollection(owner.sheet.floatingImages),
                entry = owner.selected.sources[0]!;
              const root = roots.find((value) => value.id === entry.rootId);
              if (!isPictureGroup(root))
                throw new TypeError("Picture annotation owner disappeared.");
              const leaf = findPictureGroupNode(root, entry.path)?.node;
              if (!isGroupedPicture(leaf))
                throw new TypeError("Picture annotation leaf disappeared.");
              const transform = normalizeImageTransform({ ...leaf.transform, annotations });
              leaf.transform = transform
                ? {
                    ...(transform.appearance ? { appearance: transform.appearance } : {}),
                    ...(transform.annotations ? { annotations: transform.annotations } : {}),
                  }
                : undefined;
              accepted = options.setImages?.(roots, owner.sheet.id) === true;
            } else {
              const transform = normalizeImageTransform({ ...target.transform, annotations });
              if (isFramedPictureObject(target)) {
                accepted =
                  options.setImage(
                    {
                      ...target,
                      transform: transform
                        ? {
                            ...(transform.appearance ? { appearance: transform.appearance } : {}),
                            ...(transform.annotations
                              ? { annotations: transform.annotations }
                              : {}),
                          }
                        : undefined,
                    },
                    owner.sheet.id,
                  ) === true;
              } else {
                accepted = options.setImage({ ...target, transform }, owner.sheet.id) === true;
              }
            }
          }
          if (!accepted) throw new TypeError("Picture annotations could not be applied.");
          if (annotation.value === dialog) annotation.value = undefined;
          return true;
        } catch {
          if (annotation.value === dialog) dialog.error.value = "picture.operationFailed";
          return false;
        }
      },
    };
    annotation.value = dialog;
    return true;
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
    canAnnotate,
    openCompression,
    openBatchSize,
    clear,
    closeBatchSize: () => {
      batch.value = undefined;
    },
  };
}
