import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import {
  arePicturePropertiesEqual,
  normalizePictureProperties,
  type PictureProperties,
} from "@sheetcraft/core/picture-properties";
import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { getCurrentScope, nextTick, onScopeDispose, readonly, ref } from "vue";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  MAX_SHEET_ROWS,
  getCellContent,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  type CellAddress,
  type FloatingImage,
  type ImageTransform,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  createSetSheetFloatingImagesCommand,
  createBatchSetCellContentsCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  getMergedCellAnchor,
  canUseSheetPermission,
  canEditCell,
  areImageTransformsEqual,
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

export type ImageInsertMode = "cell" | "floating";
type ImageTarget = {
  workbook: Workbook;
  sheet: Sheet;
  sheetId: string;
  address: CellAddress;
  generation: number;
  operation: number;
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

function cellImageMatches(
  sheet: Sheet,
  address: CellAddress,
  image: PictureProperties & { assetId: string; altText: string; transform?: ImageTransform },
): boolean {
  const content = getCellContent(sheet, address);
  return (
    content?.kind === "image" &&
    content.image.assetId === image.assetId &&
    content.image.altText === image.altText &&
    arePicturePropertiesEqual(content.image, image) &&
    areImageTransformsEqual(content.image.transform, image.transform)
  );
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
    payload: PictureProperties & {
      sheetId: string;
      address: CellAddress;
      assetId: string;
      altText: string;
      transform?: ImageTransform;
    },
  ) => unknown;
  setFloatingImage: (image: FloatingImage, sheetId: string) => unknown;
  convertCellImageToFloating: (payload: {
    sheetId: string;
    address: CellAddress;
    imageId: string;
    size: { width: number; height: number };
  }) => unknown;
}) {
  const busy = ref(false);
  const feedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  let operation = 0;
  let disposed = false;
  function cancelPending(): void {
    operation += 1;
    pending = undefined;
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
    if (
      mode === "floating"
        ? !(replacementRootId
            ? canEditPictureSelection(options.getSheet(), [replacementRootId])
            : canUseSheetPermission(options.getSheet(), "editObjects"))
        : !canEditCell(options.getSheet(), address)
    )
      return;
    if (!options.flushPendingEdits()) return;
    const sheet = options.getSheet();
    return {
      workbook: options.getWorkbook(),
      sheet,
      sheetId: sheet.id,
      generation: options.getGeneration?.() ?? 0,
      operation,
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
        : canEditCell(sheet, target.address))
    );
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
  ): Promise<void> {
    if (replaceId) {
      if (busy.value || disposed) return;
      const sourceSheet = options.getSheet();
      const sourceWorkbook = options.getWorkbook();
      const sourceGeneration = options.getGeneration?.() ?? 0;
      let replacement: PictureSourceReplacementSnapshot;
      try {
        replacement = replacementSource(replaceId, replacePath);
      } catch {
        feedback.value = "picture.operationFailed";
        return;
      }
      if (replaceAssetId !== undefined && replaceAssetId !== replacement.source.assetId) return;
      target ??= captureTarget(options.getAddress(), "floating", replacement.source.rootId);
      if (
        !target ||
        target.sheet !== sourceSheet ||
        target.workbook !== sourceWorkbook ||
        target.generation !== sourceGeneration
      )
        return;
      return replaceFile(file, target, replacement);
    }
    target ??= captureTarget(options.getAddress(), mode);
    if (!target || target.replacementRootId || !isCurrent(target, mode) || busy.value) return;
    const owner = target;
    const valid = () => isCurrent(owner, mode);
    if (!valid()) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!valid()) return;
      const size = mode === "floating" ? initialFloatingSize(asset.width, asset.height) : undefined;
      await options.assetStore.put(asset);
      if (!valid()) return;
      const altText = file.name || "";
      if (mode === "cell") {
        if (cellImageMatches(target.sheet, target.address, { assetId: asset.id, altText })) {
          feedback.value = "image.unchanged";
          return;
        }
        const accepted = await options.setCellImage({
          sheetId: target.sheetId,
          address: target.address,
          assetId: asset.id,
          altText,
        });
        if (accepted === false) throw new Error("Cell image insertion was refused.");
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
        if (accepted === false) throw new Error("Picture insertion was refused.");
      }
      feedback.value = "image.inserted";
    } catch (error) {
      if (isOwnerCurrent(target)) feedback.value = assetFailureFeedback(error);
    } finally {
      busy.value = false;
    }
  }

  async function replaceFile(
    file: File,
    target: ImageTarget,
    replacement: PictureSourceReplacementSnapshot,
  ): Promise<void> {
    const valid = () => replacementCurrent(target, replacement);
    if (busy.value || !valid()) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!valid()) return;
      // Preflight the replacement geometry before creating a stored resource.
      planPictureSourceReplacement(
        replacement,
        target.sheet.floatingImages,
        options.getFrameContext?.(),
        asset,
      );
      await options.assetStore.put(asset);
      if (!valid()) return;
      const next = planPictureSourceReplacement(
        replacement,
        target.sheet.floatingImages,
        options.getFrameContext?.(),
        asset,
      );
      if (areFloatingImageCollectionsEqual(target.sheet.floatingImages, next)) {
        feedback.value = "image.unchanged";
        return;
      }
      const accepted =
        replacement.source.kind === "legacy"
          ? await options.setFloatingImage(
              next.find((entry) => entry.id === replacement.source.rootId)!,
              target.sheetId,
            )
          : await options.execute!(createSetSheetFloatingImagesCommand(target.sheetId, next));
      if (accepted === false) throw new Error("Picture replacement was refused.");
      if (isOwnerCurrent(target)) feedback.value = "image.inserted";
    } catch (error) {
      if (isOwnerCurrent(target)) feedback.value = assetFailureFeedback(error);
    } finally {
      busy.value = false;
    }
  }

  async function insertFiles(
    files: readonly File[],
    mode: ImageInsertMode,
    target = captureTarget(options.getAddress(), mode),
  ): Promise<void> {
    if (files.length === 1) return insertFile(files[0]!, mode, target);
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
      const addresses: CellAddress[] = [];
      let row = target.address.row;
      for (const _file of files) {
        if (row >= MAX_SHEET_ROWS) throw new Error("Image placement exceeds sheet bounds.");
        const address = { row, column: target.address.column };
        addresses.push(address);
        const merged = sheet.mergedCells.find(
          (range) =>
            row >= range.start.row &&
            row <= range.end.row &&
            address.column >= range.start.column &&
            address.column <= range.end.column,
        );
        row = (merged?.end.row ?? row) + 1;
      }
      const valid = () =>
        isCurrent(target, mode) &&
        (mode !== "cell" || addresses.every((address) => canEditCell(sheet, address)));
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
      for (const asset of assets) {
        await options.assetStore.put(asset);
        if (!valid()) return;
      }
      let accepted: unknown;
      if (mode === "cell") {
        if (
          assets.every((asset, index) =>
            cellImageMatches(sheet, addresses[index]!, {
              assetId: asset.id,
              altText: files[index]!.name,
            }),
          )
        ) {
          feedback.value = "image.unchanged";
          return;
        }
        accepted = await options.execute(
          createBatchSetCellContentsCommand(
            assets.map((asset, index) => ({
              sheetId: target.sheetId,
              address: addresses[index]!,
              content: { kind: "image", image: { assetId: asset.id, altText: files[index]!.name } },
            })),
          ),
        );
      } else
        accepted = await options.execute(
          createSetSheetFloatingImagesCommand(target.sheetId, [
            ...sheet.floatingImages,
            ...assets.map((asset, index) => {
              return {
                id: idFactory("image"),
                assetId: asset.id,
                altText: files[index]!.name,
                anchor: { ...target.address },
                offsetX: index * 24,
                offsetY: index * 24,
                ...sizes[index]!,
              };
            }),
          ]),
        );
      if (accepted === false) throw new Error("Picture batch insertion was refused.");
      feedback.value = "image.inserted";
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
      cancelPending();
      return;
    }
    pending = undefined;
    input.value = "";
    if (file && request) {
      if (request.replacement) void replaceFile(file, request.target, request.replacement);
      else void insertFiles(files, request.mode, request.target);
    }
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
        if (cellImageMatches(target.sheet, target.address, image)) {
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
        if (accepted === false) throw new Error("Cell image paste was refused.");
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
        if (accepted === false) throw new Error("Picture paste was refused.");
      }
      feedback.value = "image.inserted";
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
      if (accepted === false) throw new Error("Picture group paste was refused.");
      feedback.value = "image.inserted";
    } catch {
      if (isOwnerCurrent(target)) feedback.value = "image.insertionFailed";
    } finally {
      busy.value = false;
    }
  }

  async function convertCellImageToFloating(address: CellAddress): Promise<void> {
    if (options.getSheet().properties.protected) return;
    const target = captureTarget(address);
    if (!target || busy.value) return;
    const sheet = options.getSheet();
    const content = getCellContent(sheet, target.address);
    if (content?.kind !== "image") return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await options.assetStore.get(content.image.assetId);
      if (!isCurrent(target)) return;
      if (!asset) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      const current = getCellContent(sheet, target.address);
      if (current?.kind !== "image" || current.image.assetId !== content.image.assetId) return;
      const crop = content.image.transform?.crop;
      let width = asset.width * (crop?.width ?? 1);
      let height = asset.height * (crop?.height ?? 1);
      if (content.image.transform?.rotation === 90 || content.image.transform?.rotation === 270) {
        [width, height] = [height, width];
      }
      const size = initialFloatingSize(width, height);
      const accepted = await options.convertCellImageToFloating({
        sheetId: target.sheetId,
        address: target.address,
        imageId: idFactory("image"),
        size,
      });
      if (accepted === false) throw new Error("Picture conversion was refused.");
      feedback.value = "image.convertedToFloating";
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
