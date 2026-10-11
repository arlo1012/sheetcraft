import { requireLegacyPicture, requireLegacyPictures } from "./picture-document-support";
import {
  cloneFloatingImage,
  type CellAddress,
  type FloatingImage,
  type LegacyFloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { MessageKey } from "../../shared/i18n";
import {
  SHEETCRAFT_CLIPBOARD_TYPE,
  type GridClipboardPort,
  type GridClipboardTransfer,
} from "../sheet-grid/gridClipboardPort";
import { normalizeClipboardImageGroup, writeFloatingImageClipboard } from "./imageClipboard";
import type { ImageInsertMode } from "./useSheetImageActions";

type PendingFloatingImageClipboard = {
  image: LegacyFloatingImage;
  images?: LegacyFloatingImage[];
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
  getSelectedImages?: () => FloatingImage[] | null | undefined;
  onPasteMany?: (images: readonly FloatingImage[], address: CellAddress) => void;
  onMoveMany?: (images: FloatingImage[]) => boolean;
  clipboardPort: GridClipboardPort;
  onCopy: () => void;
  onFeedback: (key: MessageKey) => void;
  onPaste: (image: FloatingImage, mode: ImageInsertMode, address: CellAddress) => void;
  onMove: (image: FloatingImage) => boolean;
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
    if (pending?.mode === "cut" && !isSameSheet(pending, currentSheet)) clear();
    return pending;
  }

  function observeTransfer(transfer: GridClipboardTransfer): void {
    if (transfer.invalidFloatingImage && transfer.unsupportedFloatingImage) return;
    const current = getPendingForCurrentSheet();
    if (
      current &&
      (!transfer.floatingImage ||
        !matchesImage(current.image, transfer.floatingImage) ||
        (current.mode === "cut" && transfer.localToken !== current.token))
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
    let capturedImage: LegacyFloatingImage;
    try {
      capturedImage = cloneFloatingImage(requireLegacyPicture(image));
    } catch {
      options.onFeedback("image.copyFailed");
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    const selected = options.getSelectedImages?.();
    if (selected === null || (selected && !selected.some((entry) => entry.id === image.id))) {
      options.onFeedback("image.copyFailed");
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    let images: LegacyFloatingImage[] | undefined;
    try {
      if (selected && selected.length > 1) images = normalizeClipboardImageGroup(selected);
    } catch {
      options.onFeedback("image.copyFailed");
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    const capturedOperation = ++operation;
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
        try {
          writeFloatingImageClipboard(event.clipboardData, capturedImage, images);
          event.clipboardData.setData(SHEETCRAFT_CLIPBOARD_TYPE, transfer.localToken);
        } catch {
          // Preserve the complete local snapshot if custom ClipboardEvent formats are rejected.
        }
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
    localToken?: string,
  ): void {
    try {
      requireLegacyPicture(image);
      if (transferredImages) requireLegacyPictures(transferredImages);
    } catch {
      options.onFeedback("clipboard.pasteRejected");
      return;
    }
    const current = getPendingForCurrentSheet();
    if (
      current &&
      (!matchesImage(current.image, image) ||
        (current.mode === "cut" && localToken !== current.token))
    )
      clear();
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
      if (pendingCut.images?.length) {
        if (!options.onMoveMany) {
          options.onFeedback("clipboard.pasteRejected");
          return;
        }
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
        let accepted = false;
        try {
          accepted = options.onMoveMany(
            pendingCut.images.map((member) => ({
              ...cloneFloatingImage(member),
              anchor: { ...address },
              offsetX: member.offsetX + 12,
              offsetY: member.offsetY + 12,
            })),
          );
        } catch {
          /* The command boundary owns rejection. Keep the cut for retry. */
        }
        if (pending === pendingCut) {
          if (accepted) clear();
          else options.onFeedback("clipboard.pasteRejected");
        }
        return;
      }
      let accepted = false;
      try {
        accepted = options.onMove({
          ...cloneFloatingImage(requireLegacyPicture(currentImage)),
          anchor: { ...address },
          offsetX: 12,
          offsetY: 12,
        });
      } catch {
        /* Keep the cut when an authoritative command throws. */
      }
      if (pending === pendingCut) {
        if (accepted) clear();
        else options.onFeedback("clipboard.pasteRejected");
      }
      return;
    }
    const images =
      transferredImages ??
      (current?.mode === "copy" && matchesImage(current.image, image) ? current.images : undefined);
    if (images && images.length > 1) {
      if (options.onPasteMany) options.onPasteMany(images, { ...address });
      else options.onFeedback("clipboard.pasteRejected");
    } else options.onPaste(cloneFloatingImage(image), mode, { ...address });
  }

  function pastePending(address: CellAddress): boolean {
    const current = getPendingForCurrentSheet();
    if (!current) return false;
    paste(current.image, "floating", address, current.images, current.token);
    return true;
  }

  return {
    copy,
    paste,
    pastePending,
    clear,
    clearCut: () => {
      if (pending?.mode === "cut") clear();
    },
    observeTransfer,
    hasPending: () => Boolean(getPendingForCurrentSheet()),
    getOperation: () => operation,
  };
}
