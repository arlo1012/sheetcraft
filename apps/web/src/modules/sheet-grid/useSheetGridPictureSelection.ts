import type { Ref } from "vue";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { getPictureObjectOriginCell } from "@sheetcraft/core/picture-object-sheet";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import type { CellAddress, Sheet } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { CellSelection } from "@sheetcraft/sheet-engine/selection";
import type { MessageKey } from "../../shared/i18n";
import type { PictureContextSourceAction } from "../sheet-images/picture-context-source-action";
import { resolveOwnedPictureNode } from "../sheet-images/picture-group-interaction";
import type { useFloatingImageClipboard } from "../sheet-images/useFloatingImageClipboard";
import type { useOwnedPictureClipboard } from "../sheet-images/useOwnedPictureClipboard";

type FloatingImageClipboard = ReturnType<typeof useFloatingImageClipboard>;
type OwnedPictureClipboard = ReturnType<typeof useOwnedPictureClipboard>;

export type SheetGridPictureSelectionOptions = {
  getSheet: () => Sheet;
  getPictureFrameContext: () => PictureFrameLayoutContext | undefined;
  selectedImageId: Ref<string | null>;
  selectedImageIds: Ref<string[]>;
  selectedOwnedPicturePath: Ref<PictureGroupPath | null>;
  getActiveCell: () => CellAddress;
  setActiveCell: (address: CellAddress) => void;
  isEditing: () => boolean;
  isComposing: () => boolean;
  isReadOnly: () => boolean;
  isPictureSourceBusy: () => boolean;
  isPictureSelectionReadOnly: () => boolean;
  isPictureLayerReadOnly: () => boolean;
  isPictureCropActive: () => boolean;
  finishPictureCrop: () => boolean;
  finishEdit: (destination?: CellSelection, restoreFocus?: boolean) => boolean;
  stopDragSelection: () => void;
  clearContextMenus: () => void;
  focusEditor: () => void;
  floatingClipboard: FloatingImageClipboard;
  ownedClipboard: OwnedPictureClipboard;
  pasteSelection: () => Promise<unknown>;
  applyOwnedPictureDelete?: () =>
    | ((paths: readonly PictureGroupPath[], sheet: Sheet) => boolean)
    | undefined;
  applyPictureUngroup?: () => ((ids: readonly string[], sheet: Sheet) => boolean) | undefined;
  applyPictureToCell?: () => ((id: string, path?: PictureGroupPath) => boolean) | undefined;
  onDeleteFloatingImages: (ids: string[]) => void;
  onDeleteFloatingImage: (id: string) => void;
  onConvertFloatingImageToCell: (id: string) => void;
  onFormatOwnedPicture: (path: PictureGroupPath, sheet: Sheet, paint?: "fill" | "line") => void;
  onPictureSourceAction: (
    action: PictureContextSourceAction,
    path: PictureGroupPath,
    sheet: Sheet,
  ) => void;
  onImageFeedback: (key: MessageKey) => void;
};

/** Owns floating & owned picture selection expansion, deletion, ungroup, format, and context source actions. */
export function useSheetGridPictureSelection(options: SheetGridPictureSelectionOptions) {
  const { selectedImageId, selectedImageIds, selectedOwnedPicturePath } = options;

  function expandFloatingImageSelection(ids: readonly string[]): string[] {
    const sheet = options.getSheet();
    const result = new Set<string>();
    for (const id of ids) {
      const image = sheet.floatingImages.find((entry) => entry.id === id);
      if (!image) continue;
      if (!isPictureGroup(image) && image.groupId)
        for (const member of sheet.floatingImages) {
          if (!isPictureGroup(member) && member.groupId === image.groupId) result.add(member.id);
        }
      else result.add(id);
    }
    return [...result];
  }

  function selectFloatingImage(id: string | null, additive = false): void {
    const sheet = options.getSheet();
    if (options.isComposing()) return;
    if (id && !canEditPictureSelection(sheet, expandFloatingImageSelection([id]))) return;
    selectedOwnedPicturePath.value = null;
    if (options.isEditing()) options.finishEdit(undefined, false);
    options.stopDragSelection();
    options.clearContextMenus();
    const image = sheet.floatingImages.find((entry) => entry.id === id);
    const group =
      image && !isPictureGroup(image) && image.groupId
        ? sheet.floatingImages
            .filter((entry) => !isPictureGroup(entry) && entry.groupId === image.groupId)
            .map((entry) => entry.id)
        : id
          ? [id]
          : [];
    if (additive && id) {
      selectedImageIds.value = selectedImageIds.value.includes(id)
        ? selectedImageIds.value.filter((entry) => !group.includes(entry))
        : [...new Set([...selectedImageIds.value, ...group])];
      selectedImageId.value = selectedImageIds.value.at(-1) ?? null;
    } else {
      if (!id || !selectedImageIds.value.includes(id)) selectedImageIds.value = group;
      selectedImageId.value = id;
    }
    if (!id) options.focusEditor();
  }

  function selectOwnedPicturePath(path: PictureGroupPath | null): void {
    if (!path) {
      selectedOwnedPicturePath.value = null;
      return;
    }
    const sheet = options.getSheet();
    const context = options.getPictureFrameContext();
    if (
      !context ||
      !canEditPictureSelection(sheet, [path[0]!]) ||
      selectedImageIds.value.length !== 1 ||
      selectedImageIds.value[0] !== path[0]
    )
      return;
    try {
      if (resolveOwnedPictureNode(sheet.floatingImages, path, context)?.visible)
        selectedOwnedPicturePath.value = [...path];
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function ownedActionPaths(path: PictureGroupPath): PictureGroupPath[] {
    return path.length === 1 && selectedImageIds.value.includes(path[0]!)
      ? selectedImageIds.value.map((id) => [id])
      : [[...path]];
  }

  function deleteOwnedPicture(path: PictureGroupPath, owner?: object): void {
    const sheet = options.getSheet();
    if (options.isPictureSelectionReadOnly() || owner !== sheet) return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) return;
    try {
      const applyDelete = options.applyOwnedPictureDelete?.();
      if (!applyDelete?.(ownedActionPaths(path), sheet))
        options.onImageFeedback("picture.operationFailed");
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function ungroupOwnedPicture(rootId: string): void {
    const sheet = options.getSheet();
    if (options.isPictureSelectionReadOnly()) return;
    try {
      const ids = selectedImageIds.value.includes(rootId) ? selectedImageIds.value : [rootId];
      const applyUngroup = options.applyPictureUngroup?.();
      if (!applyUngroup?.(ids, sheet)) options.onImageFeedback("picture.operationFailed");
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function formatOwnedPicture(
    path: PictureGroupPath,
    owner?: object,
    paint?: "fill" | "line",
  ): void {
    const sheet = options.getSheet();
    const context = options.getPictureFrameContext();
    if (owner !== sheet || !context) return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) return;
    try {
      const visible =
        path.length === 1
          ? sheet.floatingImages.some((root) => root.id === path[0] && !root.hidden)
          : resolveOwnedPictureNode(sheet.floatingImages, path, context)?.visible;
      if (visible) options.onFormatOwnedPicture([...path], sheet, paint);
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function requestPictureSourceAction(
    action: PictureContextSourceAction,
    path: PictureGroupPath,
    owner?: object,
  ): void {
    const sheet = options.getSheet();
    if (owner !== sheet || options.isPictureSourceBusy()) return;
    if (action === "format") {
      formatOwnedPicture(path, owner);
      return;
    }
    if (
      selectedImageIds.value.length !== 1 ||
      selectedImageIds.value[0] !== path[0] ||
      JSON.stringify(path.length > 1 ? path : null) !==
        JSON.stringify(selectedOwnedPicturePath.value) ||
      (!(["save", "preview"] as string[]).includes(action) && options.isPictureSelectionReadOnly())
    )
      return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) return;
    try {
      const context = options.getPictureFrameContext(),
        resolved =
          path.length > 1 && context
            ? resolveOwnedPictureNode(sheet.floatingImages, path, context)
            : undefined,
        node =
          path.length === 1
            ? sheet.floatingImages.find((root) => root.id === path[0])
            : resolved?.node,
        visible = path.length === 1 ? !!node && !node.hidden : resolved?.visible;
      if (!visible || !node || !("assetId" in node)) return;
      options.onPictureSourceAction(action, [...path], sheet);
    } catch {
      options.onImageFeedback("picture.operationFailed");
    }
  }

  function requestOwnedPictureCopy(
    path: PictureGroupPath,
    mode: "copy" | "cut",
    owner?: object,
  ): void {
    if (owner !== options.getSheet()) return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) return;
    if (mode === "cut" && options.isPictureSelectionReadOnly()) return;
    void options.ownedClipboard.copy(ownedActionPaths(path), mode);
  }

  async function requestOwnedPicturePaste(path: PictureGroupPath, owner?: object): Promise<void> {
    const sheet = options.getSheet();
    if (owner !== sheet || options.isPictureLayerReadOnly()) return;
    if (options.isPictureCropActive() && !options.finishPictureCrop()) return;
    const root = sheet.floatingImages.find((entry) => entry.id === path[0]);
    if (!root) return;
    options.setActiveCell(getPictureObjectOriginCell(root, sheet));
    const activeCell = options.getActiveCell();
    if (
      !options.ownedClipboard.paste(activeCell) &&
      !options.floatingClipboard.pastePending(activeCell)
    )
      await options.pasteSelection();
    options.focusEditor();
  }

  function requiresOwnedClipboard(): boolean {
    return (
      Boolean(selectedOwnedPicturePath.value) ||
      options
        .getSheet()
        .floatingImages.some(
          (root) =>
            selectedImageIds.value.includes(root.id) &&
            (isPictureGroup(root) || isFramedPictureObject(root)),
        )
    );
  }

  function currentOwnedClipboardPaths(): PictureGroupPath[] {
    return selectedOwnedPicturePath.value
      ? [[...selectedOwnedPicturePath.value]]
      : selectedImageIds.value.map((id) => [id]);
  }

  function deleteSelectedFloatingImage(id: string): void {
    const sheet = options.getSheet();
    if (
      options.isPictureCropActive() &&
      (selectedImageId.value !== id || !options.finishPictureCrop())
    )
      return;
    if (options.isPictureSelectionReadOnly()) return;
    if (options.applyOwnedPictureDelete?.()) {
      deleteOwnedPicture([id], sheet);
      return;
    }
    // Preserve the legacy emitted-event contract for consumers without a command callback.
    if (selectedImageIds.value.includes(id) && selectedImageIds.value.length > 1)
      options.onDeleteFloatingImages(selectedImageIds.value);
    else options.onDeleteFloatingImage(id);
    if (!sheet.floatingImages.some((root) => root.id === id)) {
      selectedImageId.value = null;
      options.focusEditor();
    }
  }

  function convertSelectedFloatingImageToCell(id: string, path?: PictureGroupPath): void {
    const sheet = options.getSheet();
    if (
      options.isPictureCropActive() &&
      (selectedImageId.value !== id || !options.finishPictureCrop())
    )
      return;
    const image = sheet.floatingImages.find((entry) => entry.id === id);
    if (!image || options.isPictureLayerReadOnly() || !canEditPictureSelection(sheet, [id])) return;
    const applyToCell = options.applyPictureToCell?.();
    if (applyToCell) applyToCell(id, path ?? selectedOwnedPicturePath.value ?? undefined);
    else if (!options.isReadOnly()) options.onConvertFloatingImageToCell(id);
  }

  return {
    expandFloatingImageSelection,
    selectFloatingImage,
    selectOwnedPicturePath,
    deleteOwnedPicture,
    ungroupOwnedPicture,
    formatOwnedPicture,
    requestPictureSourceAction,
    requestOwnedPictureCopy,
    requestOwnedPicturePaste,
    requiresOwnedClipboard,
    currentOwnedClipboardPaths,
    deleteSelectedFloatingImage,
    convertSelectedFloatingImageToCell,
  };
}
