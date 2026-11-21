import { nextTick } from "vue";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import { getPictureObjectOriginCell } from "@sheetcraft/core/picture-object-sheet";
import {
  getCellContent,
  type CellAddress,
  type FloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { areCellAddressesEqual } from "@sheetcraft/sheet-engine/selection";
import { insertTextAtSelection } from "../../shared/forms/text-selection";
import type { MessageKey } from "../../shared/i18n";
import type { ImageInsertMode } from "../sheet-images/useSheetImageActions";
import { readFloatingImageTransfer } from "../sheet-images/imageClipboard";
import type { useFloatingImageClipboard } from "../sheet-images/useFloatingImageClipboard";
import type { useOwnedPictureClipboard } from "../sheet-images/useOwnedPictureClipboard";
import {
  areGridClipboardTextsEqual,
  createBrowserGridClipboardPort,
  readGridClipboardLocalToken,
} from "./gridClipboardPort";

type BrowserClipboardPort = ReturnType<typeof createBrowserGridClipboardPort>;
type FloatingImageClipboard = ReturnType<typeof useFloatingImageClipboard>;
type OwnedPictureClipboard = ReturnType<typeof useOwnedPictureClipboard>;

export type SheetGridPictureClipboardOptions = {
  getSheet: () => Sheet;
  getWorkbookRevision: () => number | undefined;
  getPictureOwnerGeneration: () => number | undefined;
  getPictureFrameContext: () => PictureFrameLayoutContext | undefined;
  getActiveCell: () => CellAddress;
  getSelectedImageId: () => string | null;
  isEditing: () => boolean;
  isComposing: () => boolean;
  getEditingValue: () => string;
  isPictureCropActive: () => boolean;
  finishPictureCrop: () => boolean;
  isPictureSelectionReadOnly: () => boolean;
  isPictureLayerReadOnly: () => boolean;
  requiresOwnedClipboard: () => boolean;
  currentOwnedClipboardPaths: () => PictureGroupPath[];
  browserClipboard: BrowserClipboardPort;
  floatingClipboard: FloatingImageClipboard;
  ownedClipboard: OwnedPictureClipboard;
  clearPendingClipboard: () => void;
  setActiveCell: (address: CellAddress) => void;
  pasteSelection: () => Promise<unknown>;
  pasteCapturedText: (text: string) => void;
  finishEdit: (value?: string, focus?: boolean) => boolean;
  onEditorInput: (value: string) => void;
  focusEditor: () => void;
  onPasteImageFile: (file: File, mode: ImageInsertMode, address?: CellAddress) => void;
  onImageFeedback: (key: MessageKey) => void;
  onClipboardFeedback: (message: "documentChanged") => void;
};

/** Owns copy/cut/paste and Chromium async-clipboard deferred paste for floating & owned pictures. */
export function useSheetGridPictureClipboard(options: SheetGridPictureClipboardOptions) {
  function onImageCopy(event: ClipboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-shape-canvas-text-editor], [data-equation-session]")
    )
      return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-page-header-footer]"))
      return;
    const sheet = options.getSheet();
    const image = sheet.floatingImages.find((entry) => entry.id === options.getSelectedImageId());
    if (options.isEditing() || !image) {
      options.floatingClipboard.clear();
      options.ownedClipboard.clear();
      return;
    }
    event.stopPropagation();
    if (options.requiresOwnedClipboard())
      void options.ownedClipboard.copy(options.currentOwnedClipboardPaths(), "copy", event);
    else void options.floatingClipboard.copy(image, "copy", event);
  }

  function onImageCut(event: ClipboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-shape-canvas-text-editor], [data-equation-session]")
    )
      return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-page-header-footer]"))
      return;
    const sheet = options.getSheet();
    const image = sheet.floatingImages.find((entry) => entry.id === options.getSelectedImageId());
    if (options.isEditing() || !image) {
      options.floatingClipboard.clear();
      options.ownedClipboard.clear();
      return;
    }
    if (options.isPictureSelectionReadOnly()) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    if (options.requiresOwnedClipboard())
      void options.ownedClipboard.copy(options.currentOwnedClipboardPaths(), "cut", event);
    else void options.floatingClipboard.copy(image, "cut", event);
  }

  function requestFloatingImageCopy(id: string, mode: "copy" | "cut"): void {
    if (
      options.isPictureCropActive() &&
      (options.getSelectedImageId() !== id || !options.finishPictureCrop())
    )
      return;
    const image = options.getSheet().floatingImages.find((entry) => entry.id === id);
    if (image) {
      if (options.requiresOwnedClipboard())
        void options.ownedClipboard.copy(options.currentOwnedClipboardPaths(), mode);
      else void options.floatingClipboard.copy(image, mode);
    }
  }

  async function requestFloatingImagePaste(id: string): Promise<void> {
    if (
      options.isPictureCropActive() &&
      (options.getSelectedImageId() !== id || !options.finishPictureCrop())
    )
      return;
    if (options.isPictureLayerReadOnly()) return;
    const sheet = options.getSheet();
    const image = sheet.floatingImages.find((entry) => entry.id === id);
    if (!image) return;
    options.setActiveCell(getPictureObjectOriginCell(image, sheet));
    const activeCell = options.getActiveCell();
    if (
      !options.ownedClipboard.paste(activeCell) &&
      !options.floatingClipboard.pastePending(activeCell)
    )
      await options.pasteSelection();
    options.focusEditor();
  }

  async function pasteDeferredOwnedPicture(event: ClipboardEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (options.isPictureLayerReadOnly() || options.isEditing()) return;
    const identity = options.ownedClipboard.getIdentity();
    if (!identity) return;
    const operation = options.ownedClipboard.getOperation();
    const sheet = options.getSheet();
    const revision = options.getWorkbookRevision();
    const generation = options.getPictureOwnerGeneration();
    const context = options.getPictureFrameContext();
    const address = { ...options.getActiveCell() };
    const textPresent = event.clipboardData?.types.includes("text/plain") === true;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    let transfer: Awaited<ReturnType<BrowserClipboardPort["read"]>> | undefined;
    let unavailable = false;
    try {
      transfer = await options.browserClipboard.read({ preferAsync: true });
    } catch {
      unavailable = true;
    }
    const current = options.ownedClipboard.getIdentity();
    if (
      options.ownedClipboard.getOperation() !== operation ||
      current?.token !== identity.token ||
      current.generation !== identity.generation
    )
      return;
    if (
      options.getSheet() !== sheet ||
      options.getWorkbookRevision() !== revision ||
      options.getPictureOwnerGeneration() !== generation ||
      options.getPictureFrameContext() !== context ||
      !areCellAddressesEqual(options.getActiveCell(), address) ||
      options.isEditing() ||
      options.isComposing() ||
      options.isPictureLayerReadOnly()
    ) {
      options.onClipboardFeedback("documentChanged");
      return;
    }
    // Native paste without a readable lease cannot resurrect an earlier picture copy.
    // Transfer-free local fallback belongs only to an explicit document-local/menu Paste.
    if (unavailable) {
      if (textPresent && text) options.pasteCapturedText(text);
      else options.onImageFeedback("clipboard.pasteRejected");
      return;
    }
    if (!transfer) return;
    if (textPresent && !areGridClipboardTextsEqual(text, transfer.text)) {
      options.ownedClipboard.clear(identity);
      options.pasteCapturedText(text);
      return;
    }
    if (options.ownedClipboard.paste(address, transfer)) return;
    if (transfer.invalidFloatingImage) {
      options.onImageFeedback("clipboard.pasteRejected");
      return;
    }
    const mode: ImageInsertMode =
      getCellContent(sheet, address)?.kind === "image" ? "cell" : "floating";
    if (transfer.floatingImage) {
      options.clearPendingClipboard();
      options.floatingClipboard.paste(
        transfer.floatingImage,
        mode,
        address,
        transfer.floatingImages,
        transfer.localToken,
      );
      return;
    }
    if (transfer.imageFile) {
      options.clearPendingClipboard();
      options.onPasteImageFile(transfer.imageFile, mode, address);
      return;
    }
    // A foreign/missing lease is ordinary captured text, never proof of picture ownership.
    if (text) options.pasteCapturedText(text);
  }

  async function pasteDeferredFloatingImage(event: ClipboardEvent): Promise<void> {
    if (options.isPictureLayerReadOnly()) return;
    event.preventDefault();
    event.stopPropagation();
    const sheet = options.getSheet();
    const revision = options.getWorkbookRevision();
    const clipboardOperation = options.floatingClipboard.getOperation();
    const address = { ...options.getActiveCell() };
    const editing = options.isEditing();
    const draft = options.getEditingValue();
    const input = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    let image: FloatingImage | undefined;
    let images: readonly FloatingImage[] | undefined;
    let localToken: string | undefined;
    let invalidFloatingImage = false;
    let unsupportedFloatingImage = false;
    try {
      const transfer = await options.browserClipboard.read({ preferAsync: true });
      if (areGridClipboardTextsEqual(text, transfer.text)) {
        image = transfer.floatingImage;
        images = transfer.floatingImages;
        localToken = transfer.localToken;
        invalidFloatingImage = transfer.invalidFloatingImage === true;
        unsupportedFloatingImage = transfer.unsupportedFloatingImage === true;
      }
    } catch {
      // Keep the captured native text when the browser denies the optional rich read.
    }
    if (options.floatingClipboard.getOperation() !== clipboardOperation) return;
    if (
      options.getSheet() !== sheet ||
      options.getWorkbookRevision() !== revision ||
      !areCellAddressesEqual(options.getActiveCell(), address) ||
      options.isEditing() !== editing ||
      (editing && options.getEditingValue() !== draft)
    ) {
      options.onClipboardFeedback("documentChanged");
      return;
    }
    options.floatingClipboard.observeTransfer({
      floatingImage: image,
      localToken,
      invalidFloatingImage,
      unsupportedFloatingImage,
    });
    if (options.isPictureLayerReadOnly()) {
      options.onClipboardFeedback("documentChanged");
      return;
    }
    if (invalidFloatingImage) {
      options.onImageFeedback("clipboard.pasteRejected");
      return;
    }
    if (image) {
      if (editing) options.finishEdit(undefined, false);
      options.clearPendingClipboard();
      options.floatingClipboard.paste(
        image,
        editing || getCellContent(sheet, address)?.kind === "image" ? "cell" : "floating",
        address,
        images,
        localToken,
      );
    } else {
      options.floatingClipboard.clear();
      if (editing && input) {
        const insertion = insertTextAtSelection(draft, start, end, text);
        options.onEditorInput(insertion.value);
        void nextTick(() => input.setSelectionRange(insertion.caret, insertion.caret));
      } else options.pasteCapturedText(text);
    }
  }

  function onImagePaste(event: ClipboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-shape-canvas-text-editor], [data-equation-session]")
    )
      return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-page-header-footer]"))
      return;
    if (options.isComposing() || !event.clipboardData) return;
    if (options.isPictureLayerReadOnly()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const file =
      Array.from(event.clipboardData.files ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      ) ??
      Array.from(event.clipboardData.items ?? [])
        .find((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
        ?.getAsFile();
    const activeCell = options.getActiveCell();
    if (!options.isEditing()) {
      const data = event.clipboardData;
      const localTransfer = {
        ...readFloatingImageTransfer(data),
        ...(file ? { imageFile: file } : {}),
        text: data.types.includes("text/plain") ? data.getData("text/plain") : undefined,
        localToken: readGridClipboardLocalToken(data),
      };
      if (
        options.ownedClipboard.hasPending() &&
        !localTransfer.localToken &&
        !localTransfer.invalidFloatingImage &&
        !localTransfer.floatingImage &&
        !localTransfer.imageFile
      ) {
        void pasteDeferredOwnedPicture(event);
        return;
      }
      if (options.ownedClipboard.paste(activeCell, localTransfer)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const transfer = readFloatingImageTransfer(event.clipboardData);
    const image = transfer.floatingImage;
    if (transfer.invalidFloatingImage) {
      options.floatingClipboard.observeTransfer(transfer);
      event.preventDefault();
      event.stopPropagation();
      options.onImageFeedback("clipboard.pasteRejected");
      return;
    }
    if (!image && !file) {
      // Chromium exposes Async Clipboard custom formats only through read(), not paste events.
      if (options.floatingClipboard.hasPending() && navigator.clipboard)
        void pasteDeferredFloatingImage(event);
      else options.floatingClipboard.clear();
      return;
    }
    const localToken = readGridClipboardLocalToken(event.clipboardData);
    options.floatingClipboard.observeTransfer({ ...transfer, localToken });
    if (options.isPictureLayerReadOnly()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const mode: ImageInsertMode =
      options.isEditing() ||
      (!options.getSelectedImageId() &&
        getCellContent(options.getSheet(), activeCell)?.kind === "image")
        ? "cell"
        : "floating";
    // Commit any typed draft before the exclusive image content replaces this cell.
    if (options.isEditing()) options.finishEdit(undefined, false);
    options.clearPendingClipboard();
    if (image)
      options.floatingClipboard.paste(image, mode, activeCell, transfer.floatingImages, localToken);
    else if (file) options.onPasteImageFile(file, mode);
  }

  return {
    onImageCopy,
    onImageCut,
    requestFloatingImageCopy,
    requestFloatingImagePaste,
    onImagePaste,
  };
}
