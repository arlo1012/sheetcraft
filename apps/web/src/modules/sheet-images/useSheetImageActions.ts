import { readonly, ref } from "vue";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_SHEET_ROWS,
  getCellContent,
  type CellAddress,
  type FloatingImage,
  type ImageTransform,
  type Sheet,
  type Workbook,
} from "@idea10/core/workbook";
import {
  createSetSheetFloatingImagesCommand,
  createBatchSetCellContentsCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { getMergedCellAnchor, canUseSheetPermission, canEditCell } from "@idea10/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import { ImageAssetError, prepareImageAsset } from "../image-assets/prepareImageAsset";

export type ImageInsertMode = "cell" | "floating";
type ImageTarget = { workbook: Workbook; sheetId: string; address: CellAddress };

export function useSheetImageActions(options: {
  assetStore: ImageAssetStore;
  execute?: (command: WorkbookCommand) => unknown;
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  flushPendingEdits: () => boolean;
  setCellImage: (payload: {
    sheetId: string;
    address: CellAddress;
    assetId: string;
    altText: string;
    transform?: ImageTransform;
  }) => void;
  setFloatingImage: (image: FloatingImage, sheetId: string) => void;
  convertCellImageToFloating: (payload: {
    sheetId: string;
    address: CellAddress;
    imageId: string;
    size: { width: number; height: number };
  }) => void;
}) {
  const busy = ref(false);
  const feedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  const fileInput = ref<HTMLInputElement | null>(null);
  let pending: { mode: ImageInsertMode; target: ImageTarget; replaceId?: string } | undefined;

  function captureTarget(
    address = options.getAddress(),
    mode: ImageInsertMode = "floating",
  ): ImageTarget | undefined {
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
      sheetId: sheet.id,
      address: {
        ...(getMergedCellAnchor(sheet.mergedCells, address) ?? address),
      },
    };
  }

  function isCurrent(target: ImageTarget, mode: ImageInsertMode = "floating"): boolean {
    const sheet = target.workbook.sheets.get(target.sheetId);
    return (
      options.getWorkbook() === target.workbook &&
      !!sheet &&
      (mode === "floating"
        ? canUseSheetPermission(sheet, "editObjects")
        : canEditCell(sheet, target.address))
    );
  }

  function requestInsert(mode: ImageInsertMode): void {
    if (busy.value) return;
    const target = captureTarget(options.getAddress(), mode);
    if (!target) return;
    pending = { mode, target };
    if (fileInput.value) {
      fileInput.value.multiple = true;
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }

  function requestReplace(imageId: string): void {
    if (busy.value) return;
    const image = options.getSheet().floatingImages.find((entry) => entry.id === imageId);
    if (!image) return;
    const target = captureTarget(image.anchor);
    if (!target) return;
    pending = { mode: "floating", target, replaceId: imageId };
    if (fileInput.value) {
      fileInput.value.multiple = false;
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }

  async function insertFile(
    file: File,
    mode: ImageInsertMode = "floating",
    target = captureTarget(options.getAddress(), mode),
    replaceId?: string,
  ): Promise<void> {
    if (!target || !isCurrent(target, mode) || busy.value) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      if (!isCurrent(target, mode)) return;
      await options.assetStore.put(asset);
      if (!isCurrent(target, mode)) return;
      const altText = file.name || "";
      if (replaceId) {
        const current = target.workbook.sheets
          .get(target.sheetId)
          ?.floatingImages.find((entry) => entry.id === replaceId);
        if (!current) return;
        options.setFloatingImage({ ...current, assetId: asset.id, altText }, target.sheetId);
      } else if (mode === "cell") {
        options.setCellImage({
          sheetId: target.sheetId,
          address: target.address,
          assetId: asset.id,
          altText,
        });
      } else {
        const scale = Math.max(
          MIN_FLOATING_IMAGE_SIZE / Math.min(asset.width, asset.height),
          Math.min(1, 400 / asset.width, 300 / asset.height),
        );
        options.setFloatingImage(
          {
            id: idFactory("image"),
            assetId: asset.id,
            altText,
            anchor: target.address,
            offsetX: 0,
            offsetY: 0,
            width: asset.width * scale,
            height: asset.height * scale,
          },
          target.sheetId,
        );
      }
      feedback.value = "image.inserted";
    } catch (error) {
      feedback.value =
        error instanceof ImageAssetError
          ? (
              {
                "unsupported-type": "image.invalidType",
                "too-large": "image.tooLarge",
                "invalid-image": "image.invalidFile",
                "decode-failed": "image.decodeFailed",
              } as const
            )[error.code]
          : "image.insertionFailed";
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
      for (const asset of assets) {
        await options.assetStore.put(asset);
        if (!valid()) return;
      }
      if (mode === "cell")
        options.execute(
          createBatchSetCellContentsCommand(
            assets.map((asset, index) => ({
              sheetId: target.sheetId,
              address: addresses[index]!,
              content: { kind: "image", image: { assetId: asset.id, altText: files[index]!.name } },
            })),
          ),
        );
      else
        options.execute(
          createSetSheetFloatingImagesCommand(target.sheetId, [
            ...sheet.floatingImages,
            ...assets.map((asset, index) => {
              const scale = Math.max(
                MIN_FLOATING_IMAGE_SIZE / Math.min(asset.width, asset.height),
                Math.min(1, 400 / asset.width, 300 / asset.height),
              );
              return {
                id: idFactory("image"),
                assetId: asset.id,
                altText: files[index]!.name,
                anchor: { ...target.address },
                offsetX: index * 24,
                offsetY: index * 24,
                width: asset.width * scale,
                height: asset.height * scale,
              };
            }),
          ]),
        );
      feedback.value = "image.inserted";
    } catch {
      feedback.value = "image.insertionFailed";
    } finally {
      busy.value = false;
    }
  }

  function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const file = files[0];
    const request = pending;
    pending = undefined;
    input.value = "";
    if (file && request) {
      if (request.replaceId) void insertFile(file, request.mode, request.target, request.replaceId);
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
    try {
      if (!(await options.assetStore.get(image.assetId))) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      if (!isCurrent(target, mode)) return;
      if (mode === "cell") {
        options.setCellImage({
          sheetId: target.sheetId,
          address: target.address,
          assetId: image.assetId,
          altText: image.altText,
          ...(image.transform ? { transform: image.transform } : {}),
        });
      } else {
        options.setFloatingImage(
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
      }
      feedback.value = "image.inserted";
    } catch {
      feedback.value = "image.insertionFailed";
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
    try {
      for (const image of images)
        if (!(await options.assetStore.get(image.assetId)))
          throw new Error("Missing picture asset.");
      if (!isCurrent(target)) return;
      const groups = new Map<string, string>();
      const next = images.map((image) => {
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
      options.execute(
        createSetSheetFloatingImagesCommand(target.sheetId, [
          ...target.workbook.sheets.get(target.sheetId)!.floatingImages,
          ...next,
        ]),
      );
      feedback.value = "image.inserted";
    } catch {
      feedback.value = "image.insertionFailed";
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
      if (!asset) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      if (!isCurrent(target)) return;
      const current = getCellContent(sheet, target.address);
      if (current?.kind !== "image" || current.image.assetId !== content.image.assetId) return;
      const crop = content.image.transform?.crop;
      let width = asset.width * (crop?.width ?? 1);
      let height = asset.height * (crop?.height ?? 1);
      if (content.image.transform?.rotation === 90 || content.image.transform?.rotation === 270) {
        [width, height] = [height, width];
      }
      const scale = Math.max(
        MIN_FLOATING_IMAGE_SIZE / Math.min(width, height),
        Math.min(1, 400 / width, 300 / height),
      );
      options.convertCellImageToFloating({
        sheetId: target.sheetId,
        address: target.address,
        imageId: idFactory("image"),
        size: { width: width * scale, height: height * scale },
      });
      feedback.value = "image.convertedToFloating";
    } catch {
      feedback.value = "image.convertFailed";
    } finally {
      busy.value = false;
    }
  }

  return {
    busy: readonly(busy),
    feedback: readonly(feedback),
    reportFeedback: (message: MessageKey) => {
      feedback.value = message;
    },
    fileInput,
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
