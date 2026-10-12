import { onScopeDispose, shallowRef, type ShallowRef } from "vue";
import { canEditRange, expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import { canEditPictureRoot } from "@sheetcraft/core/picture-protection";
import {
  planFloatingPictureToCell,
  type ConvertFloatingImageToCellCommand,
} from "@sheetcraft/core/commands";
import {
  areFloatingImageCollectionsEqual,
  cloneFloatingImage,
  getCellContent,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import type { CellContent } from "@sheetcraft/core/formula";

export type PictureCellConversionConfirmation = {
  key: number;
  address: CellAddress;
  sheetName: string;
  error: boolean;
  confirm: () => boolean;
  cancel: () => void;
};
type ConversionOptions = Omit<ConvertFloatingImageToCellCommand, "type" | "id">;

/** One exact source/target lease owns each overwrite dialog and its callbacks. */
export function usePictureCellConversion(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getSelectedIds?: () => readonly string[];
  getSelectedPath?: () => PictureGroupPath | null;
  flushPendingEdits: () => boolean;
  apply: (id: string, options: ConversionOptions) => boolean;
  onApplied?: (address: CellAddress) => void;
}) {
  const confirmation: ShallowRef<PictureCellConversionConfirmation | null> = shallowRef(null);
  let key = 0;
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
    confirmation.value = null;
  });
  function canConvert(id: string, path?: PictureGroupPath): boolean {
    if (disposed) return false;
    const sheet = options.getSheet();
    try {
      const plan = planFloatingPictureToCell(sheet, id, path);
      return (
        !!plan &&
        canEditPictureRoot(sheet, plan.sourceRoot) &&
        canEditRange(
          sheet,
          expandSelectionToMergedCellRanges(
            { start: plan.address, end: plan.address },
            sheet.mergedCells,
          ),
        )
      );
    } catch {
      return false;
    }
  }
  function request(id: string, path?: PictureGroupPath): boolean {
    if (disposed || !options.flushPendingEdits()) return false;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      generation = options.getGeneration();
    const selectedIds = options.getSelectedIds?.().slice(),
      selectedPath = options.getSelectedPath?.()?.slice() ?? null;
    let plan: ReturnType<typeof planFloatingPictureToCell>;
    try {
      plan = planFloatingPictureToCell(sheet, id, path);
    } catch {
      return false;
    }
    if (!plan) return false;
    const capturedPath = [...plan.path],
      imageSnapshot = JSON.stringify(plan.image);
    const address = { ...plan.address },
      content: CellContent | null = getCellContent(sheet, address);
    const captureAxes = () =>
      JSON.stringify({
        rows: [...sheet.rowHeights],
        columns: [...sheet.columnWidths],
        hiddenRows: [...(sheet.hiddenRows ?? [])],
        hiddenColumns: [...(sheet.hiddenColumns ?? [])],
        defaultColumnWidth: sheet.defaultColumnWidth,
      });
    const axes = captureAxes();
    const roots = sheet.floatingImages.map(cloneFloatingImage),
      merges = JSON.stringify(sheet.mergedCells);
    const ownerValid = () => {
      if (
        disposed ||
        options.getWorkbook() !== workbook ||
        options.getSheet() !== sheet ||
        workbook.sheets.get(sheet.id) !== sheet ||
        options.getGeneration() !== generation
      )
        return false;
      if (selectedIds && JSON.stringify(options.getSelectedIds?.()) !== JSON.stringify(selectedIds))
        return false;
      if (
        options.getSelectedPath &&
        JSON.stringify(options.getSelectedPath() ?? null) !== JSON.stringify(selectedPath)
      )
        return false;
      try {
        return (
          JSON.stringify(sheet.mergedCells) === merges &&
          captureAxes() === axes &&
          areFloatingImageCollectionsEqual(sheet.floatingImages, roots) &&
          JSON.stringify(getCellContent(sheet, address)) === JSON.stringify(content) &&
          JSON.stringify(planFloatingPictureToCell(sheet, id, capturedPath)?.image) ===
            imageSnapshot
        );
      } catch {
        return false;
      }
    };
    const permissionValid = () =>
      canEditPictureRoot(sheet, plan!.sourceRoot) &&
      canEditRange(
        sheet,
        expandSelectionToMergedCellRanges({ start: address, end: address }, sheet.mergedCells),
      );
    if (!permissionValid()) return false;
    const apply = () => {
      if (!ownerValid() || !permissionValid()) return false;
      let accepted = false;
      try {
        accepted =
          options.apply(id, {
            sheetId: sheet.id,
            path: [...capturedPath],
            expectedAddress: address,
            expectedCellContent: content,
          }) === true;
      } catch {
        return false;
      }
      if (
        accepted &&
        options.getWorkbook() === workbook &&
        options.getSheet() === sheet &&
        options.getGeneration() === generation
      )
        options.onApplied?.(address);
      return accepted;
    };
    if (content === null) {
      confirmation.value = null;
      return apply();
    }
    const current: PictureCellConversionConfirmation = {
      key: ++key,
      address,
      sheetName: sheet.name,
      error: false,
      confirm: () => {
        if (confirmation.value?.key !== current.key) return false;
        if (!apply()) {
          if (confirmation.value?.key === current.key)
            confirmation.value = { ...current, error: true };
          return false;
        }
        if (confirmation.value?.key === current.key) confirmation.value = null;
        return true;
      },
      cancel: () => {
        if (confirmation.value?.key === current.key) confirmation.value = null;
      },
    };
    confirmation.value = current;
    return false;
  }
  return { confirmation, request, canConvert };
}
