import {
  cloneFloatingImage,
  type CellAddress,
  type FloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
import type { GridClipboardPort, GridClipboardTransfer } from "../sheet-grid/gridClipboardPort";
import { writeFloatingImageClipboard } from "./imageClipboard";
import type { ImageInsertMode } from "./useSheetImageActions";

type PendingFloatingImageClipboard = {
  image: FloatingImage;
  images?: FloatingImage[];
  mode: "copy" | "cut";
  sheet: Sheet;
  sheetId: string;
  revision: number;
  token: string;
};

function matchesImage(left: FloatingImage, right: FloatingImage): boolean {
  return left.id === right.id && left.assetId === right.assetId;
}

function isSameSheet(pending: PendingFloatingImageClipboard, sheet: Sheet): boolean {
  return pending.sheet === sheet && pending.sheetId === sheet.id;
}

export function useFloatingImageClipboard(options: {
  getSheet: () => Sheet;
  getRevision: () => number;
  getSelectedImages?: () => FloatingImage[];
  onPasteMany?: (images: readonly FloatingImage[], address: CellAddress) => void;
  onMoveMany?: (images: FloatingImage[]) => void;
  clipboardPort: GridClipboardPort;
  onCopy: () => void;
  onFeedback: (key: MessageKey) => void;
  onPaste: (image: FloatingImage, mode: ImageInsertMode, address: CellAddress) => void;
  onMove: (image: FloatingImage) => void;
}) {
  const idFactory = createBrowserIdFactory();
  let pending: PendingFloatingImageClipboard | undefined;
  let operation = 0;
  let nativeWriteQueue = Promise.resolve();

  function clear(): void {
    operation += 1;
    pending = undefined;
  }

  function getPendingForCurrentSheet(): PendingFloatingImageClipboard | undefined {
    const currentSheet = options.getSheet();
    if (pending && !isSameSheet(pending, currentSheet)) clear();
    return pending;
  }

  function observeTransfer(transfer: GridClipboardTransfer): void {
    const current = getPendingForCurrentSheet();
    if (
      current &&
      (!transfer.floatingImage || !matchesImage(current.image, transfer.floatingImage))
    ) {
      clear();
    }
  }

  function queueNativeRichWrite(
    transfer: {
      text: string;
      localToken: string;
      floatingImage: FloatingImage;
      floatingImages?: readonly FloatingImage[];
    },
    capturedOperation: number,
  ): Promise<void> {
    nativeWriteQueue = nativeWriteQueue.then(async () => {
      if (capturedOperation !== operation) return;
      try {
        await options.clipboardPort.writeNativeRich?.(transfer);
      } catch {
        // The synchronous ClipboardEvent payload is already authoritative.
      }
    });
    return nativeWriteQueue;
  }

  async function copy(
    image: FloatingImage,
    mode: "copy" | "cut",
    event?: ClipboardEvent,
  ): Promise<void> {
    const sheet = options.getSheet();
    const capturedOperation = ++operation;
    const capturedImage = cloneFloatingImage(image);
    const selected = options.getSelectedImages?.();
    const images =
      selected && selected.length > 1 && selected.some((entry) => entry.id === image.id)
        ? selected.map(cloneFloatingImage)
        : undefined;
    const transfer = {
      text: capturedImage.altText,
      localToken: idFactory("floating-image"),
      floatingImage: capturedImage,
      ...(images ? { floatingImages: images } : {}),
    };
    pending = {
      image: capturedImage,
      ...(images ? { images } : {}),
      mode,
      sheet,
      sheetId: sheet.id,
      revision: options.getRevision(),
      token: transfer.localToken,
    };
    options.onCopy();
    options.onFeedback(mode === "cut" ? "clipboard.readyToMove" : "image.copied");

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.clipboardData) {
        writeFloatingImageClipboard(event.clipboardData, capturedImage, images);
        await queueNativeRichWrite(transfer, capturedOperation);
        return;
      }
    }

    await nativeWriteQueue;
    if (capturedOperation !== operation) return;
    try {
      await options.clipboardPort.write(transfer);
    } catch {
      // Keep the local clipboard when browser permission or HTTP policy denies the write.
    }
  }

  function paste(
    image: FloatingImage,
    mode: ImageInsertMode,
    address: CellAddress,
    transferredImages?: readonly FloatingImage[],
  ): void {
    const current = getPendingForCurrentSheet();
    if (current && !matchesImage(current.image, image)) clear();
    const pendingCut = getPendingForCurrentSheet();
    if (pendingCut?.mode === "cut" && matchesImage(pendingCut.image, image)) {
      const currentImage = options
        .getSheet()
        .floatingImages.find((candidate) => candidate.id === pendingCut.image.id);
      if (
        pendingCut.revision !== options.getRevision() ||
        !currentImage ||
        currentImage.assetId !== pendingCut.image.assetId
      ) {
        clear();
        options.onFeedback("clipboard.documentChanged");
        return;
      }
      if (pendingCut.images?.length && options.onMoveMany) {
        if (
          pendingCut.images.some(
            (member) =>
              !options.getSheet().floatingImages.some((entry) => matchesImage(member, entry)),
          )
        ) {
          clear();
          options.onFeedback("clipboard.documentChanged");
          return;
        }
        options.onMoveMany(
          pendingCut.images.map((member) => ({
            ...cloneFloatingImage(member),
            anchor: { ...address },
            offsetX: member.offsetX + 12,
            offsetY: member.offsetY + 12,
          })),
        );
        clear();
        return;
      }
      options.onMove({
        ...cloneFloatingImage(currentImage),
        anchor: { ...address },
        offsetX: 12,
        offsetY: 12,
      });
      clear();
      return;
    }
    const images =
      transferredImages ??
      (current && matchesImage(current.image, image) ? current.images : undefined);
    if (images && images.length > 1 && options.onPasteMany)
      options.onPasteMany(images, { ...address });
    else options.onPaste(cloneFloatingImage(image), mode, { ...address });
  }

  function pastePending(address: CellAddress): boolean {
    const current = getPendingForCurrentSheet();
    if (!current) return false;
    paste(current.image, "floating", address);
    return true;
  }

  return {
    copy,
    paste,
    pastePending,
    clear,
    observeTransfer,
    hasPending: () => Boolean(getPendingForCurrentSheet()),
  };
}
