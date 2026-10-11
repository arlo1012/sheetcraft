import { getCurrentScope, nextTick, onScopeDispose, readonly, ref } from "vue";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  MAX_SHEET_ROWS,
  getCellContent,
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

export type ImageInsertMode = "cell" | "floating";
type ImageTarget = {
  workbook: Workbook;
  sheet: Sheet;
  sheetId: string;
  address: CellAddress;
  generation: number;
  operation: number;
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
  image: { assetId: string; altText: string; transform?: ImageTransform },
): boolean {
  const content = getCellContent(sheet, address);
  return (
    content?.kind === "image" &&
    content.image.assetId === image.assetId &&
    content.image.altText === image.altText &&
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
  getAddress: () => CellAddress;
  flushPendingEdits: () => boolean;
  setCellImage: (payload: {
    sheetId: string;
    address: CellAddress;
    assetId: string;
    altText: string;
    transform?: ImageTransform;
  }) => unknown;
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
    | { mode: ImageInsertMode; target: ImageTarget; replaceId?: string; replaceAssetId?: string }
    | undefined;

  function captureTarget(
    address = options.getAddress(),
    mode: ImageInsertMode = "floating",
  ): ImageTarget | undefined {
    if (disposed) return;
    if (
      mode === "floating"
        ? !canUseSheetPermission(options.getSheet(), "editObjects")
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
        ? canUseSheetPermission(sheet, "editObjects")
        : canEditCell(sheet, target.address))
    );
  }

  async function requestInsert(mode: ImageInsertMode): Promise<void> {
    if (busy.value || disposed) return;
    cancelPending();
    const target = captureTarget(options.getAddress(), mode);
    if (!target) return;
    pending = { mode, target };
    pickerKey.value += 1;
    await nextTick();
    if (!isCurrent(target, mode) || pending?.target !== target) return;
    openPicker(target, true);
  }

  async function requestReplace(imageId: string): Promise<void> {
    if (busy.value || disposed) return;
    const image = options.getSheet().floatingImages.find((entry) => entry.id === imageId);
    if (!image) return;
    cancelPending();
    const target = captureTarget(image.anchor);
    if (!target) return;
    pending = { mode: "floating", target, replaceId: imageId, replaceAssetId: image.assetId };
    pickerKey.value += 1;
    await nextTick();
    if (!isCurrent(target) || pending?.target !== target) return;
    openPicker(target, false);
  }

  function openPicker(target: ImageTarget, multiple: boolean): void {
    try {
      if (!fileInput.value) throw new Error("Picture file picker unavailable.");
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
    target = captureTarget(options.getAddress(), mode),
    replaceId?: string,
    replaceAssetId = replaceId
      ? target?.sheet.floatingImages.find((image) => image.id === replaceId)?.assetId
      : undefined,
  ): Promise<void> {
    if (!target || !isCurrent(target, mode) || busy.value) return;
    const replacement = () =>
      target.sheet.floatingImages.find(
        (image) => image.id === replaceId && image.assetId === replaceAssetId,
      );
    const valid = () => isCurrent(target, mode) && (!replaceId || !!replacement());
    if (!valid()) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!valid()) return;
      const size =
        mode === "floating" && !replaceId
          ? initialFloatingSize(asset.width, asset.height)
          : undefined;
      await options.assetStore.put(asset);
      if (!valid()) return;
      const altText = file.name || "";
      if (replaceId) {
        const current = replacement();
        if (!current) return;
        if (current.assetId === asset.id && current.altText === altText) {
          feedback.value = "image.unchanged";
          return;
        }
        if (
          (await options.setFloatingImage(
            { ...current, assetId: asset.id, altText },
            target.sheetId,
          )) === false
        )
          throw new Error("Picture replacement was refused.");
      } else if (mode === "cell") {
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

  async function insertFiles(
    files: readonly File[],
    mode: ImageInsertMode,
    target = captureTarget(options.getAddress(), mode),
  ): Promise<void> {
    if (files.length === 1) return insertFile(files[0]!, mode, target);
    if (!files.length || !target || busy.value || !options.execute || !isCurrent(target, mode))
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
    if (input !== fileInput.value || disposed) return;
    const files = Array.from(input.files ?? []);
    const file = files[0];
    const request = pending;
    pending = undefined;
    input.value = "";
    if (file && request) {
      if (request.replaceId)
        void insertFile(
          file,
          request.mode,
          request.target,
          request.replaceId,
          request.replaceAssetId,
        );
      else void insertFiles(files, request.mode, request.target);
    }
  }

  async function pasteFloatingImage(
    image: FloatingImage,
    mode: ImageInsertMode = "floating",
    address = options.getAddress(),
  ): Promise<void> {
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
      if (event.target === fileInput.value) cancelPending();
    },
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
