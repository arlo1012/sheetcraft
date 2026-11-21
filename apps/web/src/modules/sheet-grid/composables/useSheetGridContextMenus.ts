import { computed, markRaw, nextTick, type ComputedRef, type Ref } from "vue";
import {
  canEditRange,
  canUseSheetPermission,
  expandSelectionToMergedCellRanges,
} from "@sheetcraft/core";
import { isFramedCellImage, type CellImage } from "@sheetcraft/core/cell-picture-frame";
import { isPivotValueCell } from "@sheetcraft/core/pivot-tables";
import {
  getCellContent,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@sheetcraft/core/workbook";
import {
  getSelectionMode,
  getSelectionRange,
  isCellSelected,
  type CellSelection,
} from "@sheetcraft/sheet-engine/selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPivotActiveField } from "../../pivot-tables/pivot-active-field";
import { captureCellPictureSourcePresentation } from "../../sheet-images/cell-picture-presentation";
import type { PictureSourcePresentation } from "../../sheet-images/picture-source-presentation";
import type { SheetContextAction, SheetContextRequest } from "../context-menu-contracts";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";

export type AxisContextMenuState = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  anchor: FloatingReference;
  trigger: HTMLElement;
};

export type CellContextMenuState = {
  anchor: FloatingReference;
  imageAddress?: CellAddress;
  address: CellAddress;
};

export type SheetGridContextMenusOptions = {
  axisContextMenu: Ref<AxisContextMenuState | undefined>;
  cellContextMenu: Ref<CellContextMenuState | undefined>;
  getSheet: () => Sheet;
  isReadOnly: () => boolean;
  selection: Ref<CellSelection>;
  selectedRange: ComputedRef<CellRange>;
  activeCell: ComputedRef<CellAddress>;
  activeCellRect: ComputedRef<{ x: number; y: number; width: number; height: number } | undefined>;
  layout: ComputedRef<SheetViewportLayout>;
  scale: ComputedRef<number>;
  rootRef: Ref<HTMLElement | null>;
  scrollerRef: Ref<HTMLElement | null>;
  isEditing: ComputedRef<boolean>;
  isComposing: ComputedRef<boolean>;
  selectionReadOnly: ComputedRef<boolean>;
  objectsReadOnly: ComputedRef<boolean>;
  pictureLayerReadOnly: ComputedRef<boolean>;
  dimensionReadOnly: (axis: SheetDimensionAxis) => boolean;
  axisOperationReadOnly: (axis: SheetDimensionAxis, operation: "insert" | "delete") => boolean;
  selectAxis: (
    mode: "rows" | "columns" | "all",
    address: CellAddress,
    extend: boolean,
    restoreFocus?: boolean,
  ) => void;
  setActiveCell: (address: CellAddress, restoreFocus?: boolean) => void;
  focusEditor: () => void;
  clearPendingClipboard: () => void;
  clearFloatingClipboard: () => void;
  cutSelection: () => Promise<unknown>;
  copySelection: () => Promise<unknown>;
  pasteSelection: () => Promise<unknown>;
  pasteValuesSelection: () => Promise<unknown>;
  pasteFormatsSelection: () => Promise<unknown>;
  openImagePreview: (image: CellImage & { frameSource?: PictureSourcePresentation }) => void;
  onInsertAxis: (payload: { axis: SheetDimensionAxis; index: number; count: number }) => void;
  onDeleteAxis: (payload: { axis: SheetDimensionAxis; index: number; count: number }) => void;
  onResizeDimension: (payload: { axis: SheetDimensionAxis; index: number; size: number }) => void;
  onClearCells: (range: CellRange) => void;
  onContextAction: (request: SheetContextRequest) => void;
  onConvertCellImageToFloating: (address: CellAddress) => void;
  onOpenHyperlink: (address: CellAddress) => void;
  onEditHyperlink: () => void;
  onRemoveHyperlink: (address: CellAddress) => void;
  onEditNote: (address: CellAddress) => void;
  onDeleteNote: (address: CellAddress) => void;
  onGroupPivotField: (tableId: string) => void;
  onUngroupPivotField: (tableId: string) => void;
  onShowPivotDetails: (tableId: string, address: CellAddress) => void;
};

/** Owns SheetGrid axis and cell context menu state, opening/closing, focus restoration, and action routing. */
export function useSheetGridContextMenus(options: SheetGridContextMenusOptions) {
  const {
    axisContextMenu,
    cellContextMenu,
    selection,
    selectedRange,
    activeCell,
    activeCellRect,
    layout,
    scale,
    rootRef,
    scrollerRef,
    isEditing,
    isComposing,
    selectionReadOnly,
    objectsReadOnly,
    pictureLayerReadOnly,
    dimensionReadOnly,
    axisOperationReadOnly,
  } = options;

  function clearContextMenus(): void {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  }

  function isAxisIndexSelected(axis: SheetDimensionAxis, index: number): boolean {
    const expectedMode = axis === "row" ? "rows" : "columns";
    if (getSelectionMode(selection.value) !== expectedMode) {
      return false;
    }
    const range = selectedRange.value;
    return axis === "row"
      ? index >= range.start.row && index <= range.end.row
      : index >= range.start.column && index <= range.end.column;
  }

  function openAxisContextMenu(
    axis: SheetDimensionAxis,
    index: number,
    clientX: number,
    clientY: number,
    trigger: HTMLElement,
  ): void {
    if (isComposing.value) {
      return;
    }
    cellContextMenu.value = undefined;
    if (!isAxisIndexSelected(axis, index)) {
      const address = axis === "row" ? { row: index, column: 0 } : { row: 0, column: index };
      options.selectAxis(axis === "row" ? "rows" : "columns", address, false, false);
    }

    const range = selectedRange.value;
    const start = axis === "row" ? range.start.row : range.start.column;
    const end = axis === "row" ? range.end.row : range.end.column;
    axisContextMenu.value = {
      axis,
      index: start,
      count: end - start + 1,
      anchor: markRaw(createContextMenuPoint({ clientX, clientY }, rootRef.value ?? trigger)),
      trigger,
    };
  }

  function getAxisMaximum(axis: SheetDimensionAxis): number {
    return axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  }

  function requestAxisInsertion(
    axis: SheetDimensionAxis,
    index: number,
    selectionCount: number,
    direction: "before" | "after",
    count = selectionCount,
  ): boolean {
    if (axisOperationReadOnly(axis, "insert")) return false;
    const insertIndex = direction === "before" ? index : index + selectionCount;
    if (count > getAxisMaximum(axis) - insertIndex) return false;
    options.clearPendingClipboard();
    options.onInsertAxis({ axis, index: insertIndex, count });
    return true;
  }

  function requestAxisInsert(payload: { direction: "before" | "after"; count: number }): void {
    if (!axisContextMenu.value || axisOperationReadOnly(axisContextMenu.value.axis, "insert"))
      return;
    const menu = axisContextMenu.value;
    if (!menu) {
      return;
    }
    if (!requestAxisInsertion(menu.axis, menu.index, menu.count, payload.direction, payload.count))
      return;
    axisContextMenu.value = undefined;
    options.focusEditor();
  }

  function requestAxisDelete(): void {
    if (!axisContextMenu.value || axisOperationReadOnly(axisContextMenu.value.axis, "delete"))
      return;
    const menu = axisContextMenu.value;
    if (!menu) {
      return;
    }
    options.clearPendingClipboard();
    options.onDeleteAxis({ axis: menu.axis, index: menu.index, count: menu.count });
    axisContextMenu.value = undefined;
    options.focusEditor();
  }

  function requestAxisResize(size: number): void {
    if (!axisContextMenu.value || dimensionReadOnly(axisContextMenu.value.axis)) return;
    const menu = axisContextMenu.value;
    if (!menu || menu.count !== 1) {
      return;
    }
    options.onResizeDimension({ axis: menu.axis, index: menu.index, size });
  }

  function requestAxisClear(): void {
    if (options.isReadOnly()) return;
    if (!axisContextMenu.value) {
      return;
    }
    options.clearPendingClipboard();
    options.onClearCells(getSelectionRange(selection.value));
    axisContextMenu.value = undefined;
    options.focusEditor();
  }

  function closeAxisContextMenu(restoreFocus: boolean): void {
    const trigger = axisContextMenu.value?.trigger;
    axisContextMenu.value = undefined;
    if (restoreFocus) {
      void nextTick(() => {
        if (trigger?.isConnected) {
          trigger.focus();
        } else {
          options.focusEditor();
        }
      });
    }
  }

  function openCellContextMenu(address: CellAddress, event: MouseEvent): void {
    if (isEditing.value || isComposing.value) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const retainsSelection =
      getSelectionMode(selection.value) === "cells" && isCellSelected(address, selection.value);
    if (!retainsSelection) {
      options.setActiveCell(address, false);
    }

    axisContextMenu.value = undefined;
    const noteAddress = layout.value.getAnchorForAddress(address);
    const contextElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    cellContextMenu.value = {
      imageAddress:
        getCellContent(options.getSheet(), layout.value.getAnchorForAddress(address))?.kind ===
        "image"
          ? layout.value.getAnchorForAddress(address)
          : undefined,
      address: noteAddress,
      anchor: markRaw(createContextMenuPoint(event, rootRef.value ?? contextElement ?? undefined)),
    };
  }

  function openActiveCellContextMenu(): void {
    if (getSelectionMode(selection.value) !== "cells") {
      return;
    }
    const scroller = scrollerRef.value;
    if (!scroller) {
      return;
    }
    const bounds = scroller.getBoundingClientRect();
    const rect = activeCellRect.value;
    if (!rect) return;
    const x = bounds.left + (rect.x + Math.min(16, rect.width / 2)) * scale.value;
    const y = bounds.top + (rect.y + rect.height) * scale.value;
    axisContextMenu.value = undefined;
    const noteAddress = layout.value.getAnchorForAddress(activeCell.value);
    cellContextMenu.value = {
      imageAddress:
        getCellContent(options.getSheet(), activeCell.value)?.kind === "image"
          ? { ...activeCell.value }
          : undefined,
      address: noteAddress,
      anchor: markRaw(createContextMenuPoint({ clientX: x, clientY: y }, scroller)),
    };
  }

  async function requestCellClipboard(
    action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
  ): Promise<void> {
    if (
      options.isReadOnly() &&
      action !== "copy" &&
      (selectionReadOnly.value || action === "cut" || action === "paste-formats")
    )
      return;
    if (!cellContextMenu.value) {
      return;
    }
    cellContextMenu.value = undefined;
    if (action === "cut") {
      options.clearFloatingClipboard();
      await options.cutSelection();
    } else if (action === "copy") {
      options.clearFloatingClipboard();
      await options.copySelection();
    } else if (action === "paste-values") {
      await options.pasteValuesSelection();
    } else if (action === "paste-formats") {
      await options.pasteFormatsSelection();
    } else {
      await options.pasteSelection();
    }
    options.focusEditor();
  }

  async function requestAxisClipboard(
    action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
  ): Promise<void> {
    if (!axisContextMenu.value || (options.isReadOnly() && action !== "copy")) return;
    axisContextMenu.value = undefined;
    options.clearFloatingClipboard();
    if (action === "cut") await options.cutSelection();
    else if (action === "copy") await options.copySelection();
    else if (action === "paste-values") await options.pasteValuesSelection();
    else if (action === "paste-formats") await options.pasteFormatsSelection();
    else await options.pasteSelection();
    options.focusEditor();
  }

  function requestContextAction(action: SheetContextAction): void {
    if (!axisContextMenu.value && !cellContextMenu.value) return;
    const allowedAxisFormatting =
      (action.type === "resize" || action.type === "autoFit" || action.type === "visibility") &&
      !dimensionReadOnly(action.axis);
    const allowedAxisOperation =
      (action.type === "insert" || action.type === "delete") &&
      !axisOperationReadOnly(action.axis, action.type);
    if (
      options.isReadOnly() &&
      action.type !== "columnStatistics" &&
      !allowedAxisFormatting &&
      !allowedAxisOperation
    )
      return;
    const range = getSelectionRange(selection.value);
    const keepOpen =
      action.type === "applyStyle" ||
      action.type === "applyBorders" ||
      action.type === "updateBorderFormat" ||
      action.type === "merge" ||
      action.type === "unmerge";
    if (!keepOpen) {
      clearContextMenus();
    }
    if (
      action.type !== "columnStatistics" &&
      action.type !== "chooseFromColumn" &&
      action.type !== "filter" &&
      action.type !== "formatCells" &&
      action.type !== "formatPainter"
    )
      options.clearPendingClipboard();
    options.onContextAction({
      action,
      range: { start: { ...range.start }, end: { ...range.end } },
    });
  }

  function requestCellImageAction(action: "preview" | "float"): void {
    const address = cellContextMenu.value?.imageAddress;
    cellContextMenu.value = undefined;
    const sheet = options.getSheet();
    if (
      !address ||
      (action === "float" &&
        (pictureLayerReadOnly.value ||
          !canEditRange(
            sheet,
            expandSelectionToMergedCellRanges({ start: address, end: address }, sheet.mergedCells),
          )))
    )
      return;
    options.setActiveCell(address);
    if (action === "float") options.onConvertCellImageToFloating(address);
    else {
      const content = getCellContent(sheet, address);
      if (content?.kind === "image")
        options.openImagePreview({
          ...content.image,
          ...(isFramedCellImage(content.image)
            ? { frameSource: captureCellPictureSourcePresentation(content.image) }
            : {}),
        });
    }
  }

  const hyperlinkEditDisabled = computed(() => {
    const sheet = options.getSheet();
    return (
      (options.isReadOnly() && !sheet.properties.protected) ||
      !canUseSheetPermission(sheet, "insertHyperlinks")
    );
  });

  function requestCellHyperlink(action: "edit" | "open" | "remove"): void {
    const address = cellContextMenu.value?.address;
    cellContextMenu.value = undefined;
    if (!address) return;
    if (action === "open") {
      options.onOpenHyperlink(address);
      return;
    }
    if (hyperlinkEditDisabled.value) return;
    options.setActiveCell(address);
    if (action === "edit") options.onEditHyperlink();
    else {
      options.onRemoveHyperlink(address);
      options.focusEditor();
    }
  }

  function requestCellNote(action: "edit" | "delete"): void {
    if (objectsReadOnly.value) return;
    const address = cellContextMenu.value?.address;
    cellContextMenu.value = undefined;
    if (!address) return;
    if (action === "edit") options.onEditNote(address);
    else options.onDeleteNote(address);
    options.focusEditor();
  }

  function requestCellClear(): void {
    if (selectionReadOnly.value) return;
    if (!cellContextMenu.value) {
      return;
    }
    options.clearPendingClipboard();
    options.onClearCells(getSelectionRange(selection.value));
    cellContextMenu.value = undefined;
    options.focusEditor();
  }

  const contextPivotDetails = computed(() =>
    options
      .getSheet()
      .pivotTables?.find((table) =>
        isPivotValueCell(table, cellContextMenu.value?.address ?? activeCell.value),
      ),
  );

  const contextPivotGroup = computed(() => {
    const address = cellContextMenu.value?.address ?? activeCell.value;
    for (const table of options.getSheet().pivotTables ?? []) {
      const active = getPivotActiveField(table, [], address);
      if (active?.area === "rows" || active?.area === "columns") {
        const field = (active.area === "rows" ? table.rowFields : table.columnFields)[
          active.index
        ]!;
        return { table, field };
      }
    }
    return undefined;
  });

  function requestPivotGroup(ungroup = false): void {
    const table = contextPivotGroup.value?.table;
    if (table) {
      if (ungroup) options.onUngroupPivotField(table.id);
      else options.onGroupPivotField(table.id);
    }
    closeCellContextMenu(false);
  }

  function requestPivotDetails(): void {
    const table = contextPivotDetails.value;
    const address = cellContextMenu.value?.address;
    if (table && address) options.onShowPivotDetails(table.id, address);
    closeCellContextMenu(false);
  }

  function closeCellContextMenu(restoreFocus: boolean): void {
    cellContextMenu.value = undefined;
    if (restoreFocus) {
      options.focusEditor();
    }
  }

  return {
    axisContextMenu,
    cellContextMenu,
    clearContextMenus,
    isAxisIndexSelected,
    openAxisContextMenu,
    getAxisMaximum,
    requestAxisInsert,
    requestAxisInsertion,
    requestAxisDelete,
    requestAxisResize,
    requestAxisClear,
    closeAxisContextMenu,
    openCellContextMenu,
    openActiveCellContextMenu,
    requestCellClipboard,
    requestAxisClipboard,
    requestContextAction,
    requestCellImageAction,
    hyperlinkEditDisabled,
    requestCellHyperlink,
    requestCellNote,
    requestCellClear,
    contextPivotDetails,
    contextPivotGroup,
    requestPivotGroup,
    requestPivotDetails,
    closeCellContextMenu,
  };
}
