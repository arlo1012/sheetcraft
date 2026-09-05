import { readonly, ref } from "vue";
import {
  MIN_FLOATING_IMAGE_SIZE,
  type CellAddress,
  type FloatingImage,
  type Sheet,
  type Workbook,
} from "@idea10/core/workbook";
import { getMergedCellAnchor } from "@idea10/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
import type { ImageAssetStore } from "../image-assets/imageAssetStore";
import { ImageAssetError, prepareImageAsset } from "../image-assets/prepareImageAsset";

export type ImageInsertMode = "cell" | "floating";
type ImageTarget = { workbook: Workbook; sheetId: string; address: CellAddress };

export function useSheetImageActions(options: {
  assetStore: ImageAssetStore;
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  flushPendingEdits: () => boolean;
  setCellImage: (payload: {
    sheetId: string;
    address: CellAddress;
    assetId: string;
    altText: string;
  }) => void;
  setFloatingImage: (image: FloatingImage, sheetId: string) => void;
}) {
  const busy = ref(false);
  const feedback = ref<MessageKey>();
  const idFactory = createBrowserIdFactory();
  const fileInput = ref<HTMLInputElement | null>(null);
  let pending: { mode: ImageInsertMode; target: ImageTarget } | undefined;

  function captureTarget(): ImageTarget | undefined {
    if (!options.flushPendingEdits()) return;
    const sheet = options.getSheet();
    return {
      workbook: options.getWorkbook(),
      sheetId: sheet.id,
      address: {
        ...(getMergedCellAnchor(sheet.mergedCells, options.getAddress()) ?? options.getAddress()),
      },
    };
  }

  function isCurrent(target: ImageTarget): boolean {
    return options.getWorkbook() === target.workbook && target.workbook.sheets.has(target.sheetId);
  }

  function requestInsert(mode: ImageInsertMode): void {
    if (busy.value) return;
    const target = captureTarget();
    if (!target) return;
    pending = { mode, target };
    if (fileInput.value) {
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }

  async function insertFile(
    file: File,
    mode: ImageInsertMode = "floating",
    target = captureTarget(),
  ): Promise<void> {
    if (!target || busy.value) return;
    busy.value = true;
    feedback.value = undefined;
    try {
      const asset = await prepareImageAsset(file);
      await options.assetStore.put(asset);
      if (!isCurrent(target)) return;
      const altText = file.name || "";
      if (mode === "cell") {
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

  function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const request = pending;
    pending = undefined;
    input.value = "";
    if (file && request) void insertFile(file, request.mode, request.target);
  }

  async function pasteFloatingImage(image: FloatingImage): Promise<void> {
    const target = captureTarget();
    if (!target || busy.value) return;
    busy.value = true;
    try {
      if (!(await options.assetStore.get(image.assetId))) {
        feedback.value = "image.assetUnavailable";
        return;
      }
      if (!isCurrent(target)) return;
      options.setFloatingImage(
        { ...image, id: idFactory("image"), anchor: target.address, offsetX: 12, offsetY: 12 },
        target.sheetId,
      );
      feedback.value = "image.inserted";
    } catch {
      feedback.value = "image.insertionFailed";
    } finally {
      busy.value = false;
    }
  }

  return {
    busy: readonly(busy),
    feedback: readonly(feedback),
    fileInput,
    requestInsert,
    insertFile,
    onFileChange,
    pasteFloatingImage,
  };
}
