import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import { normalizePictureProperties } from "@sheetcraft/core/picture-properties";
import {
  areCellImagesEqual,
  cloneCellImage,
  isFramedCellImage,
  type CellImage,
} from "@sheetcraft/core/cell-picture-frame";
import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { getCurrentScope, nextTick, onScopeDispose, readonly, ref, shallowRef } from "vue";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  getCellContent,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  type CellAddress,
  type CellRange,
  type FloatingImage,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  createSetSheetFloatingImagesCommand,
  createInsertPictureBatchCommand,
  createBatchSetCellContentsCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  getMergedCellAnchor,
  canUseSheetPermission,
  canEditRange,
  expandSelectionToMergedCellRanges,
} from "@sheetcraft/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import { imageAssetFeedback } from "../image-assets/imageAssetFeedback";
import { prepareImageAsset } from "../image-assets/prepareImageAsset";
import { normalizeClipboardImageGroup } from "./imageClipboard";
import {
  capturePictureSourceReplacement,
  isPictureSourceReplacementCurrent,
  planPictureSourceReplacement,
  type PictureSourceReplacementSnapshot,
} from "./picture-source-replacement";

import {
  capturePictureCellInsertionTargets,
  isPictureCellInsertionTargetsCurrent,
  type PictureCellInsertionTargetLease,
} from "./picture-cell-insertion-targets";
import type { PictureCellOverwriteConfirmation } from "./picture-cell-overwrite-confirmation";
import {
  getPictureBatchCellLayout,
  getPictureBatchCellFrames,
  getPictureBatchFloatingOffsets,
  type PictureBatchArrangement,
  type PictureBatchInsertion,
} from "./picture-batch-layout";

export type ImageInsertMode = "cell" | "floating";
type ImageTarget = {
  workbook: Workbook;
  sheet: Sheet;
  sheetId: string;
  address: CellAddress;
  generation: number;
  operation: number;
  cellRange?: CellRange;
  initialCellLease?: PictureCellInsertionTargetLease;
  replacementRootId?: string;
};
class ImagePlacementError extends Error {}
function initialFloatingSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.max(
    MIN_FLOATING_IMAGE_SIZE / Math.min(width, height),
    Math.min(1, 400 / width, 300 / height),
  );
  const size = { width: width * scale, height: height * scale };
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < MIN_FLOATING_IMAGE_SIZE ||
    size.height < MIN_FLOATING_IMAGE_SIZE ||
    size.width > MAX_FLOATING_IMAGE_SIZE ||
    size.height > MAX_FLOATING_IMAGE_SIZE
  )
    throw new ImagePlacementError("Picture aspect ratio cannot fit the floating frame limits.");
  return size;
}

function cellImageMatches(sheet: Sheet, address: CellAddress, image: CellImage): boolean {
  const content = getCellContent(sheet, address);
  return content?.kind === "image" && areCellImagesEqual(content.image, image);
}

function assetFailureFeedback(error: unknown): MessageKey {
  if (error instanceof ImagePlacementError) return "image.placementFailed";
  return imageAssetFeedback(error) ?? "image.insertionFailed";
}

export function useSheetImageActions(options: {
  assetStore: ImageAssetStore;
  execute?: (command: WorkbookCommand) => unknown;
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getSelectedPath?: () => PictureGroupPath | null;
  getSelectedIds?: () => readonly string[];
  getFrameContext?: () => PictureFrameLayoutContext | undefined;
  getAddress: () => CellAddress;
  flushPendingEdits: () => boolean;
  setCellImage: (
    payload: CellImage & {
      sheetId: string;
      address: CellAddress;
    },
  ) => unknown;
  setFloatingImage: (image: FloatingImage, sheetId: string) => unknown;
  convertCellImageToFloating: (payload: {
    sheetId: string;
    address: CellAddress;
    imageId: string;
    size: { width: number; height: number };
  }) => boolean;
}) {
  const busy = ref(false);
  const insertionConfirmation = shallowRef<PictureCellOverwriteConfirmation | null>(null);
  const batchInsertion = shallowRef<{
    files: readonly File[];
    mode: ImageInsertMode;
    target: ImageTarget;
  } | null>(null);
  let confirmationKey = 0;
  const feedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  let operation = 0;
  let disposed = false;
  function cancelPending(): void {
    operation += 1;
    pending = undefined;
    insertionConfirmation.value = null;
    batchInsertion.value = null;
  }
  function dispose(): void {
    disposed = true;
    cancelPending();
  }
  if (getCurrentScope()) onScopeDispose(dispose);
  const fileInput = ref<HTMLInputElement | null>(null);
  const pickerKey = ref(0);
  let pending:
    | {
        mode: ImageInsertMode;
        target: ImageTarget;
        replacement?: PictureSourceReplacementSnapshot;
        input?: HTMLInputElement;
        pickerKey: number;
      }
    | undefined;

  function captureTarget(
    address = options.getAddress(),
    mode: ImageInsertMode = "floating",
    replacementRootId?: string,
  ): ImageTarget | undefined {
    if (disposed) return;
    const canPlace = (sheet: Sheet) =>
      mode === "floating"
        ? replacementRootId
          ? canEditPictureSelection(sheet, [replacementRootId])
          : canUseSheetPermission(sheet, "editObjects")
        : canEditRange(
            sheet,
            expandSelectionToMergedCellRanges({ start: address, end: address }, sheet.mergedCells),
          );
    if (!canPlace(options.getSheet())) return;
    if (!options.flushPendingEdits()) return;
    const sheet = options.getSheet();
    if (!canPlace(sheet)) return;
    let initialCellLease: PictureCellInsertionTargetLease | undefined;
    if (mode === "cell") {
      try {
        initialCellLease = capturePictureCellInsertionTargets(sheet, [address]);
      } catch {
        return;
      }
    }
    return {
      workbook: options.getWorkbook(),
      sheet,
      sheetId: sheet.id,
      generation: options.getGeneration?.() ?? 0,
      operation,
      ...(mode === "cell"
        ? {
            initialCellLease,
            cellRange: expandSelectionToMergedCellRanges(
              { start: address, end: address },
              sheet.mergedCells,
            ),
          }
        : {}),
      ...(replacementRootId ? { replacementRootId } : {}),
      address: {
        ...(getMergedCellAnchor(sheet.mergedCells, address) ?? address),
      },
    };
  }

  function isOwnerCurrent(target: ImageTarget): boolean {
    const sheet = target.workbook.sheets.get(target.sheetId);
    return (
      options.getWorkbook() === target.workbook &&
      !disposed &&
      operation === target.operation &&
      (options.getGeneration?.() ?? 0) === target.generation &&
      options.getSheet() === target.sheet &&
      sheet === target.sheet
    );
  }
  function isCurrent(target: ImageTarget, mode: ImageInsertMode = "floating"): boolean {
    const sheet = target.sheet;
    return (
      isOwnerCurrent(target) &&
      (mode === "floating"
        ? target.replacementRootId
          ? canEditPictureSelection(sheet, [target.replacementRootId])
          : canUseSheetPermission(sheet, "editObjects")
        : isCellTargetCurrent(target))
    );
  }

  function isCellTargetCurrent(target: ImageTarget): boolean {
    const range = expandSelectionToMergedCellRanges(
      { start: target.address, end: target.address },
      target.sheet.mergedCells,
    );
    const captured = target.cellRange;
    const anchor = getMergedCellAnchor(target.sheet.mergedCells, target.address) ?? target.address;
    return (
      !!captured &&
      anchor.row === target.address.row &&
      anchor.column === target.address.column &&
      range.start.row === captured.start.row &&
      range.start.column === captured.start.column &&
      range.end.row === captured.end.row &&
      range.end.column === captured.end.column &&
      canEditRange(target.sheet, range) &&
      !!target.initialCellLease &&
      isPictureCellInsertionTargetsCurrent(target.sheet, target.initialCellLease)
    );
  }

  function insertionOwnerValid(target: ImageTarget, mode: ImageInsertMode): boolean {
    const valid = isCurrent(target, mode);
    if (!valid && mode === "cell" && isOwnerCurrent(target))
      feedback.value = "image.insertTargetsChanged";
    return valid;
  }

  async function commitCellImages(
    target: ImageTarget,
    lease: PictureCellInsertionTargetLease,
    images: readonly CellImage[],
  ): Promise<boolean> {
    const valid = () =>
      insertionOwnerValid(target, "cell") &&
      isPictureCellInsertionTargetsCurrent(target.sheet, lease);
    if (!valid()) {
      if (isOwnerCurrent(target)) feedback.value = "image.insertTargetsChanged";
      return false;
    }
    if (
      images.every((image, index) => cellImageMatches(target.sheet, lease.addresses[index]!, image))
    ) {
      feedback.value = "image.unchanged";
      return true;
    }
    const captured = images.map(cloneCellImage);
    const apply = async (): Promise<boolean> => {
      if (!valid()) {
        if (isOwnerCurrent(target)) feedback.value = "image.insertTargetsChanged";
        return false;
      }
      let accepted: unknown;
      try {
        accepted =
          captured.length === 1
            ? await options.setCellImage({
                ...cloneCellImage(captured[0]!),
                sheetId: target.sheetId,
                address: { ...lease.addresses[0]! },
              })
            : await options.execute!(
                createBatchSetCellContentsCommand(
                  captured.map((image, index) => ({
                    sheetId: target.sheetId,
                    address: { ...lease.addresses[index]! },
                    content: { kind: "image", image: cloneCellImage(image) },
                  })),
                ),
              );
      } catch {
        accepted = false;
      }
      if (isOwnerCurrent(target))
        feedback.value = accepted === true ? "image.inserted" : "image.insertionFailed";
      return accepted === true;
    };
    return confirmImageInsertion(target, [lease], valid, apply);
  }

  async function confirmImageInsertion(
    target: ImageTarget,
    leases: readonly PictureCellInsertionTargetLease[],
    valid: () => boolean,
    apply: () => Promise<boolean>,
  ): Promise<boolean> {
    const occupiedAddresses = leases.flatMap((lease) => [...lease.occupiedAddresses]);
    const ranges = leases.flatMap((lease) => [...lease.ranges]);
    if (!occupiedAddresses.length) {
      insertionConfirmation.value = null;
      return apply();
    }
    let committing = false;
    const current: PictureCellOverwriteConfirmation = {
      key: ++confirmationKey,
      address: { ...target.address },
      sheetName: target.sheet.name,
      insertionTargets: ranges.map((range) => ({
        start: { ...range.start },
        end: { ...range.end },
      })),
      occupiedTargetCount: occupiedAddresses.length,
      error: false,
      confirm: async () => {
        if (insertionConfirmation.value?.key !== current.key || committing || busy.value)
          return false;
        committing = true;
        busy.value = true;
        insertionConfirmation.value = { ...current, busy: true };
        try {
          const accepted = await apply();
          if (insertionConfirmation.value?.key === current.key)
            insertionConfirmation.value = accepted
              ? null
              : { ...current, error: true, errorReason: valid() ? "command" : "targets" };
          return accepted;
        } finally {
          committing = false;
          busy.value = false;
        }
      },
      cancel: () => {
        if (!committing && insertionConfirmation.value?.key === current.key)
          insertionConfirmation.value = null;
      },
    };
    insertionConfirmation.value = current;
    return false;
  }

  async function requestInsert(mode: ImageInsertMode): Promise<void> {
    if (busy.value || disposed) return;
    cancelPending();
    const target = captureTarget(options.getAddress(), mode);
    if (!target) return;
    pickerKey.value += 1;
    pending = { mode, target, pickerKey: pickerKey.value };
    await nextTick();
    if (!isCurrent(target, mode) || pending?.target !== target) return;
    openPicker(target, true);
  }

  function selectionMatches(path: PictureGroupPath): boolean {
    const ids = options.getSelectedIds?.();
    if (ids && (ids.length !== 1 || ids[0] !== path[0])) return false;
    if (options.getSelectedPath) {
      const selected = options.getSelectedPath();
      if (path.length === 1)
        return selected == null || (selected.length === 1 && selected[0] === path[0]);
      return (
        !!selected &&
        selected.length === path.length &&
        selected.every((id, index) => id === path[index])
      );
    }
    return true;
  }

  function replacementSource(imageId: string, path?: PictureGroupPath | null) {
    const snapshot = capturePictureSourceReplacement(
      options.getSheet().floatingImages,
      imageId,
      path === undefined ? options.getSelectedPath?.() : path,
      options.getFrameContext?.(),
    );
    if (
      !selectionMatches(snapshot.source.path) ||
      (snapshot.source.kind !== "legacy" && !options.execute)
    )
      throw new Error("Picture replacement requires its exact supported selection.");
    return snapshot;
  }

  function canReplace(imageId: string, path?: PictureGroupPath | null): boolean {
    if (disposed || busy.value) return false;
    try {
      const replacement = replacementSource(imageId, path);
      return canEditPictureSelection(options.getSheet(), [replacement.source.rootId]);
    } catch {
      return false;
    }
  }

  function replacementCurrent(
    target: ImageTarget,
    snapshot: PictureSourceReplacementSnapshot,
  ): boolean {
    return (
      target.replacementRootId === snapshot.source.rootId &&
      isCurrent(target) &&
      selectionMatches(snapshot.source.path) &&
      isPictureSourceReplacementCurrent(
        snapshot,
        target.sheet.floatingImages,
        options.getFrameContext?.(),
      )
    );
  }

  async function requestReplace(imageId: string, path?: PictureGroupPath | null): Promise<void> {
    if (busy.value || disposed) return;
    const sourceSheet = options.getSheet();
    const sourceWorkbook = options.getWorkbook();
    const sourceGeneration = options.getGeneration?.() ?? 0;
    let replacement: PictureSourceReplacementSnapshot;
    try {
      replacement = replacementSource(imageId, path);
    } catch {
      feedback.value = "picture.operationFailed";
      return;
    }
    cancelPending();
    const target = captureTarget(options.getAddress(), "floating", replacement.source.rootId);
    if (!target) return;
    // Flushing an editor may itself change the requested source. Never recapture a
    // different source under the already-approved picker request.
    if (
      target.sheet !== sourceSheet ||
      target.workbook !== sourceWorkbook ||
      target.generation !== sourceGeneration ||
      !replacementCurrent(target, replacement)
    )
      return;
    pickerKey.value += 1;
    pending = { mode: "floating", target, replacement, pickerKey: pickerKey.value };
    await nextTick();
    if (
      !replacementCurrent(target, replacement) ||
      pending?.target !== target ||
      pending.pickerKey !== pickerKey.value
    )
      return;
    openPicker(target, false);
  }

  function openPicker(target: ImageTarget, multiple: boolean): void {
    try {
      if (!fileInput.value) throw new Error("Picture file picker unavailable.");
      if (pending?.target !== target || pending.pickerKey !== pickerKey.value) return;
      pending.input = fileInput.value;
      fileInput.value.multiple = multiple;
      fileInput.value.value = "";
      fileInput.value.click();
    } catch {
      if (isOwnerCurrent(target)) {
        cancelPending();
        feedback.value = "image.insertionFailed";
      }
    }
  }

  async function insertFile(
    file: File,
    mode: ImageInsertMode = "floating",
    target?: ImageTarget,
    replaceId?: string,
    replaceAssetId?: string,
    replacePath?: PictureGroupPath | null,
  ): Promise<boolean> {
    if (replaceId) {
      if (busy.value || disposed) return false;
      const sourceSheet = options.getSheet();
      const sourceWorkbook = options.getWorkbook();
      const sourceGeneration = options.getGeneration?.() ?? 0;
      let replacement: PictureSourceReplacementSnapshot;
      try {
        replacement = replacementSource(replaceId, replacePath);
      } catch {
        feedback.value = "picture.operationFailed";
        return false;
      }
      if (replaceAssetId !== undefined && replaceAssetId !== replacement.source.assetId)
        return false;
      target ??= captureTarget(options.getAddress(), "floating", replacement.source.rootId);
      if (
        !target ||
        target.sheet !== sourceSheet ||
        target.workbook !== sourceWorkbook ||
        target.generation !== sourceGeneration
      )
        return false;
      return replaceFile(file, target, replacement);
    }
    target ??= captureTarget(options.getAddress(), mode);
    if (!target || target.replacementRootId || !isCurrent(target, mode) || busy.value) return false;
    const owner = target;
    const valid = () => insertionOwnerValid(owner, mode);
    if (!valid()) return false;
    insertionConfirmation.value = null;
    const cellLease = mode === "cell" ? owner.initialCellLease! : undefined;
    const fileName = file.name || "";
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!valid()) return false;
      const size = mode === "floating" ? initialFloatingSize(asset.width, asset.height) : undefined;
      await options.assetStore.put(asset);
      if (!valid()) return false;
      const altText = fileName;
      if (mode === "cell") {
        return await commitCellImages(target, cellLease!, [{ assetId: asset.id, altText }]);
      } else {
        const accepted = await options.setFloatingImage(
          {
            id: idFactory("image"),
            assetId: asset.id,
            altText,
            anchor: target.address,
            offsetX: 0,
            offsetY: 0,
            ...size!,
          },
          target.sheetId,
        );
        if (accepted !== true) throw new Error("Picture insertion was refused.");
      }
      if (isOwnerCurrent(target)) feedback.value = "image.inserted";
      return true;
    } catch (error) {
      if (isOwnerCurrent(target)) feedback.value = assetFailureFeedback(error);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function replaceFile(
    file: File,
    target: ImageTarget,
    replacement: PictureSourceReplacementSnapshot,
  ): Promise<boolean> {
    const valid = () => replacementCurrent(target, replacement);
    if (busy.value || !valid()) return false;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!valid()) return false;
      // Preflight the replacement geometry before creating a stored resource.
      planPictureSourceReplacement(
        replacement,
        target.sheet.floatingImages,
        options.getFrameContext?.(),
        asset,
      );
      await options.assetStore.put(asset);
      if (!valid()) return false;
      const next = planPictureSourceReplacement(
        replacement,
        target.sheet.floatingImages,
        options.getFrameContext?.(),
        asset,
      );
      if (areFloatingImageCollectionsEqual(target.sheet.floatingImages, next)) {
        feedback.value = "image.unchanged";
        return true;
      }
      const accepted =
        replacement.source.kind === "legacy"
          ? await options.setFloatingImage(
              next.find((entry) => entry.id === replacement.source.rootId)!,
              target.sheetId,
            )
          : await options.execute!(createSetSheetFloatingImagesCommand(target.sheetId, next));
      if (accepted !== true) throw new Error("Picture replacement was refused.");
      if (isOwnerCurrent(target)) feedback.value = "image.inserted";
      return true;
    } catch (error) {
      if (isOwnerCurrent(target)) feedback.value = assetFailureFeedback(error);
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function insertFiles(
    files: readonly File[],
    mode: ImageInsertMode,
    target = captureTarget(options.getAddress(), mode),
    arrangement: PictureBatchArrangement = mode === "cell" ? "vertical" : "cascade",
    wrapAfter?: number,
    layoutOptions: Pick<PictureBatchInsertion, "namePlacement" | "rowHeight"> = {},
  ): Promise<void> {
    files = files.slice();
    if (
      files.length === 1 &&
      !layoutOptions.namePlacement &&
      layoutOptions.rowHeight === undefined
    ) {
      await insertFile(files[0]!, mode, target);
      return;
    }
    if (
      !files.length ||
      !target ||
      target.replacementRootId ||
      busy.value ||
      !options.execute ||
      !isCurrent(target, mode)
    )
      return;
    feedback.value = undefined;
    if (files.length > 100) {
      feedback.value = "picture.tooMany";
      return;
    }
    busy.value = true;
    feedback.value = undefined;
    try {
      const sheet = target.workbook.sheets.get(target.sheetId)!;
      const gridLayout =
        mode === "cell" ||
        (arrangement !== "cascade" &&
          (layoutOptions.namePlacement !== undefined || layoutOptions.rowHeight !== undefined));
      const layout = gridLayout
        ? getPictureBatchCellLayout(
            sheet,
            target.address,
            files.length,
            arrangement,
            wrapAfter,
            layoutOptions.namePlacement,
          )
        : { pictures: [], names: [] };
      insertionConfirmation.value = null;
      const cellLease =
        mode === "cell" ? capturePictureCellInsertionTargets(sheet, layout.pictures) : undefined;
      const nameLease = layout.names.length
        ? capturePictureCellInsertionTargets(sheet, layout.names)
        : undefined;
      const leases = [cellLease, nameLease].filter(
        (lease): lease is PictureCellInsertionTargetLease => !!lease,
      );
      const rowHeight = arrangement === "cascade" ? undefined : layoutOptions.rowHeight;
      const geometry = () =>
        JSON.stringify([
          [...sheet.rowHeights],
          [...sheet.columnWidths],
          [...(sheet.hiddenRows ?? [])],
          [...(sheet.hiddenColumns ?? [])],
          sheet.defaultRowHeight,
          sheet.defaultColumnWidth,
          sheet.mergedCells,
        ]);
      const originalGeometry = gridLayout ? geometry() : "";
      const valid = () => {
        if (!insertionOwnerValid(target, mode)) return false;
        if (
          leases.some((lease) => !isPictureCellInsertionTargetsCurrent(sheet, lease)) ||
          (gridLayout && geometry() !== originalGeometry)
        ) {
          feedback.value = "image.insertTargetsChanged";
          return false;
        }
        return true;
      };
      if (!valid()) return;
      const assets = [];
      for (const file of files) {
        assets.push(await prepareImageAsset(file));
        if (!valid()) return;
      }
      const sizes =
        mode === "floating"
          ? assets.map((asset) => initialFloatingSize(asset.width, asset.height))
          : [];
      const offsets = getPictureBatchFloatingOffsets(sizes, arrangement, wrapAfter);
      const frames =
        mode === "floating" && gridLayout
          ? getPictureBatchCellFrames(sheet, layout.pictures, assets, rowHeight)
          : [];
      for (const asset of assets) {
        await options.assetStore.put(asset);
        if (!valid()) return;
      }
      if (mode === "cell" && !nameLease && rowHeight === undefined) {
        await commitCellImages(
          target,
          cellLease!,
          assets.map((asset, index) => ({
            assetId: asset.id,
            altText: files[index]!.name,
          })),
        );
        return;
      }
      const cells = [
        ...(mode === "cell"
          ? assets.map((asset, index) => ({
              sheetId: sheet.id,
              address: layout.pictures[index]!,
              content: {
                kind: "image" as const,
                image: { assetId: asset.id, altText: files[index]!.name },
              },
            }))
          : []),
        ...layout.names.map((address, index) => ({
          sheetId: sheet.id,
          address,
          content: { kind: "literal" as const, value: files[index]!.name.replace(/\.[^.]+$/, "") },
        })),
      ];
      const images =
        mode === "floating"
          ? assets.map((asset, index) => ({
              id: idFactory("image"),
              assetId: asset.id,
              altText: files[index]!.name,
              ...(gridLayout
                ? frames[index]!
                : { anchor: { ...target.address }, ...offsets[index]!, ...sizes[index]! }),
            }))
          : [];
      const rowHeights =
        rowHeight === undefined
          ? []
          : [...new Set(layout.pictures.map((address) => address.row))].map((index) => ({
              index,
              size: rowHeight,
            }));
      const apply = async (): Promise<boolean> => {
        if (!valid()) return false;
        let accepted: unknown;
        try {
          accepted = await options.execute!(
            createInsertPictureBatchCommand(sheet.id, { cells, rowHeights, images }),
          );
        } catch {
          accepted = false;
        }
        if (isOwnerCurrent(target))
          feedback.value = accepted === true ? "image.inserted" : "image.insertionFailed";
        return accepted === true;
      };
      await confirmImageInsertion(target, leases, valid, apply);
    } catch (error) {
      if (isOwnerCurrent(target)) feedback.value = assetFailureFeedback(error);
    } finally {
      busy.value = false;
    }
  }

  function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input || input !== fileInput.value || disposed) return;
    const files = Array.from(input.files ?? []);
    const file = files[0];
    const request = pending;
    if (!request || request.input !== input || request.pickerKey !== pickerKey.value) return;
    if (
      !isCurrent(request.target, request.mode) ||
      (request.replacement && !replacementCurrent(request.target, request.replacement))
    ) {
      // This input owns only this request. A stale input was already rejected
      // above, and cannot cancel or consume a later picker operation.
      input.value = "";
      if (request.mode === "cell" && isOwnerCurrent(request.target))
        feedback.value = "image.insertTargetsChanged";
      cancelPending();
      return;
    }
    pending = undefined;
    input.value = "";
    if (file && request) {
      if (request.replacement) void replaceFile(file, request.target, request.replacement);
      else if (files.length > 100) feedback.value = "picture.tooMany";
      else if (files.length > 1)
        batchInsertion.value = { files, mode: request.mode, target: request.target };
      else void insertFiles(files, request.mode, request.target);
    }
  }

  async function confirmBatchInsertion(payload: PictureBatchInsertion): Promise<void> {
    const batch = batchInsertion.value;
    if (!batch || busy.value) return;
    if (
      !payload.order.length ||
      new Set(payload.order).size !== payload.order.length ||
      payload.order.some(
        (index) => !Number.isInteger(index) || index < 0 || index >= batch.files.length,
      )
    )
      return;
    if (!isCurrent(batch.target, batch.mode)) {
      cancelPending();
      feedback.value = "image.insertTargetsChanged";
      return;
    }
    batchInsertion.value = null;
    await insertFiles(
      payload.order.map((index) => batch.files[index]!),
      batch.mode,
      batch.target,
      payload.arrangement,
      payload.wrapAfter,
      { namePlacement: payload.namePlacement, rowHeight: payload.rowHeight },
    );
  }

  async function pasteFloatingImage(
    image: FloatingImage,
    mode: ImageInsertMode = "floating",
    address = options.getAddress(),
  ): Promise<void> {
    if (!isLegacyPictureObject(image)) {
      feedback.value = "clipboard.pasteRejected";
      return;
    }
    image = cloneFloatingImage(image);
    const target = captureTarget(address, mode);
    if (!target || busy.value) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await options.assetStore.get(image.assetId);
      if (!isCurrent(target, mode)) return;
      if (!asset) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      if (mode === "cell") {
        const cellImage: CellImage = {
          assetId: image.assetId,
          altText: image.altText,
          ...normalizePictureProperties(image),
          ...(image.transform ? { transform: image.transform } : {}),
        };
        if (cellImageMatches(target.sheet, target.address, cellImage)) {
          feedback.value = "image.unchanged";
          return;
        }
        const accepted = await options.setCellImage({
          sheetId: target.sheetId,
          address: target.address,
          assetId: image.assetId,
          altText: image.altText,
          ...normalizePictureProperties(image),
          ...(image.transform ? { transform: image.transform } : {}),
        });
        if (accepted !== true) throw new Error("Cell image paste was refused.");
      } else {
        const accepted = await options.setFloatingImage(
          {
            ...image,
            groupId: undefined,
            id: idFactory("image"),
            anchor: target.address,
            offsetX: 12,
            offsetY: 12,
          },
          target.sheetId,
        );
        if (accepted !== true) throw new Error("Picture paste was refused.");
      }
      if (isOwnerCurrent(target)) feedback.value = "image.inserted";
    } catch {
      if (isOwnerCurrent(target)) feedback.value = "image.insertionFailed";
    } finally {
      busy.value = false;
    }
  }

  async function pasteFloatingImages(
    images: readonly FloatingImage[],
    address: CellAddress,
  ): Promise<void> {
    if (images.some((image) => !isLegacyPictureObject(image))) {
      feedback.value = "clipboard.pasteRejected";
      return;
    }
    const target = captureTarget(address);
    if (!target || busy.value || !options.execute || images.length < 2 || images.length > 100)
      return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const captured = normalizeClipboardImageGroup(images);
      for (const image of captured)
        if (!(await options.assetStore.get(image.assetId)))
          throw new Error("Missing picture asset.");
      if (!isCurrent(target)) return;
      const groups = new Map<string, string>();
      const next = captured.map((image) => {
        if (image.groupId && !groups.has(image.groupId))
          groups.set(image.groupId, idFactory("picture-group"));
        return {
          ...image,
          id: idFactory("image"),
          groupId: image.groupId ? groups.get(image.groupId) : undefined,
          anchor: { ...target.address },
          offsetX: image.offsetX + 12,
          offsetY: image.offsetY + 12,
        };
      });
      const accepted = await options.execute(
        createSetSheetFloatingImagesCommand(target.sheetId, [
          ...target.workbook.sheets.get(target.sheetId)!.floatingImages,
          ...next,
        ]),
      );
      if (accepted !== true) throw new Error("Picture group paste was refused.");
      if (isOwnerCurrent(target)) feedback.value = "image.inserted";
    } catch {
      if (isOwnerCurrent(target)) feedback.value = "image.insertionFailed";
    } finally {
      busy.value = false;
    }
  }

  async function convertCellImageToFloating(address: CellAddress): Promise<void> {
    const target = captureTarget(address, "cell");
    if (!target || busy.value) return;
    const content = getCellContent(target.sheet, target.address);
    if (content?.kind !== "image") return;
    const image = cloneCellImage(content.image);
    const valid = () =>
      isCurrent(target, "cell") && cellImageMatches(target.sheet, target.address, image);
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await options.assetStore.get(image.assetId);
      if (!valid()) return;
      if (!asset) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      let size: { width: number; height: number };
      if (isFramedCellImage(image)) {
        const reference = image.frame.size;
        // Core restores framed geometry from the complete cell source. The
        // command's legacy size field still has a manual-size budget, so use
        // a valid placeholder for derived references outside that budget.
        size = [reference.width, reference.height].every(
          (value) => value >= MIN_FLOATING_IMAGE_SIZE && value <= MAX_FLOATING_IMAGE_SIZE,
        )
          ? { ...reference }
          : { width: MIN_FLOATING_IMAGE_SIZE, height: MIN_FLOATING_IMAGE_SIZE };
      } else {
        const crop = image.transform?.crop;
        let width = asset.width * (crop?.width ?? 1);
        let height = asset.height * (crop?.height ?? 1);
        if (image.transform?.rotation === 90 || image.transform?.rotation === 270)
          [width, height] = [height, width];
        size = initialFloatingSize(width, height);
      }
      // This callback is a synchronous Core commit. All asynchronous resource
      // work and source/owner checks must finish before it can change the cell.
      const accepted = options.convertCellImageToFloating({
        sheetId: target.sheetId,
        address: target.address,
        imageId: idFactory("image"),
        size,
      });
      if (accepted !== true) throw new Error("Picture conversion was refused.");
      if (isOwnerCurrent(target)) feedback.value = "image.convertedToFloating";
    } catch (error) {
      if (isOwnerCurrent(target))
        feedback.value =
          error instanceof ImagePlacementError ? "image.placementFailed" : "image.convertFailed";
    } finally {
      busy.value = false;
    }
  }

  return {
    cancelPending,
    dispose,
    busy: readonly(busy),
    insertionConfirmation,
    batchInsertion,
    confirmBatchInsertion,
    feedback: readonly(feedback),
    reportFeedback: (message: MessageKey) => {
      feedback.value = message;
    },
    fileInput,
    pickerKey: readonly(pickerKey),
    onFileCancel: (event: Event) => {
      if (
        event.target === fileInput.value &&
        pending?.input === event.target &&
        pending.pickerKey === pickerKey.value
      )
        cancelPending();
    },
    canReplace,
    requestInsert,
    requestReplace,
    insertFile,
    insertFiles,
    pasteImageFile: (file: File, mode: ImageInsertMode, address?: CellAddress) =>
      insertFile(file, mode, captureTarget(address, mode)),
    onFileChange,
    pasteFloatingImage,
    pasteFloatingImages,
    convertCellImageToFloating,
  };
}
