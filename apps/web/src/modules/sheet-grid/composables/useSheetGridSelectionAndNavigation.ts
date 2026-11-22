import { watch, type ComputedRef, type Ref } from "vue";
import { canSelectCell, expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@sheetcraft/core/workbook";
import type { SheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import {
  areCellAddressesEqual,
  createAxisSelection,
  createCellSelection,
  extendAxisSelection,
  extendCellSelection,
  getSelectionRange,
  moveCellSelection,
  type CellSelection,
} from "@sheetcraft/sheet-engine/selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { RowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import type {
  CellEditFinishOptions,
  CellEditSession,
} from "../../../shared/cell-editing/useCellEditSession";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import { useFormulaReferenceNavigation } from "./useFormulaReferenceNavigation";

type SheetGridSelectionAndNavigationOptions = {
  getSheet: () => Sheet;
  isFormatPainterActive: () => boolean;
  selection: Ref<CellSelection>;
  activeCell: ComputedRef<CellAddress>;
  layout: ComputedRef<SheetViewportLayout>;
  geometry: ComputedRef<SheetGeometry>;
  navigationRows: ComputedRef<RowVisibilityIndex>;
  outlineHiddenColumnSet: ComputedRef<ReadonlySet<number>>;
  selectedImageId: Ref<string | null>;
  clearContextMenus: () => void;
  getReferenceEditor: () => FormulaReferenceEditor | null;
  editSession: CellEditSession;
  formulaReferenceRange: Ref<CellRange | undefined>;
  setFormulaReferenceDragEditor: (editor: FormulaReferenceEditor | undefined) => void;
  isEditing: ComputedRef<boolean>;
  isComposing: ComputedRef<boolean>;
  hasActiveDimensionResize: () => boolean;
  hasPendingClipboardRange: () => boolean;
  hasActiveTransparentColor: () => boolean;
  cancelTransparentColor: () => void;
  hasActivePictureCrop: () => boolean;
  onPictureCropKeydown: (event: KeyboardEvent) => void;
  dimensionReadOnly: (axis: SheetDimensionAxis) => boolean;
  ensureGridExtentContains: (address: CellAddress) => void;
  ensureSelectionVisible: (address: CellAddress, mode?: CellSelection["mode"]) => void;
  emitViewState: () => void;
  focusEditor: () => void;
  finishCellEdit: (
    destination?: CellSelection,
    restoreFocus?: boolean,
    finishOptions?: CellEditFinishOptions,
  ) => boolean;
  cancelCellEdit: (restoreFocus?: boolean) => void;
  onCellEditorBlur: (event: FocusEvent) => void;
  deferSelectionWhileComposing: (nextSelection: CellSelection) => boolean;
  stopDragSelection: () => void;
  startDragSelection: (nextSelection: CellSelection, event: MouseEvent) => void;
  stopFormulaReferenceDragInternal: () => void;
  startFormulaReferenceDrag: (selection: CellSelection, event: MouseEvent) => void;
  requestDimensionResize: (
    axis: SheetDimensionAxis,
    payload: { index: number; size: number },
  ) => void;
  startDimensionResize: (
    axis: SheetDimensionAxis,
    payload: { index: number; event: PointerEvent; startSize: number },
  ) => void;
  stopDimensionResize: () => void;
  clearPendingClipboard: () => void;
  handleHistoryShortcut: (event: KeyboardEvent) => boolean;
  onCancelFormatPainter: () => void;
};

/** Owns selection normalization, cell/axis navigation, reference picking, and grid-level Escape/resize handlers. */
export function useSheetGridSelectionAndNavigation(
  options: SheetGridSelectionAndNavigationOptions,
) {
  const {
    selection,
    activeCell,
    layout,
    geometry,
    navigationRows,
    outlineHiddenColumnSet,
    selectedImageId,
    getReferenceEditor,
    editSession,
    formulaReferenceRange,
    isEditing,
    isComposing,
  } = options;

  function normalizeSelectionForSheet(nextSelection: CellSelection): CellSelection {
    if (nextSelection.mode !== "cells") {
      return {
        active: { ...nextSelection.active },
        anchor: { ...nextSelection.anchor },
        focus: { ...nextSelection.focus },
        mode: nextSelection.mode,
      };
    }
    const range = expandSelectionToMergedCellRanges(
      { start: nextSelection.anchor, end: nextSelection.focus },
      options.getSheet().mergedCells,
    );
    return {
      active: layout.value.getAnchorForAddress(nextSelection.active),
      anchor: { ...range.start },
      focus: { ...range.end },
      mode: "cells",
    };
  }

  function areSelectionsEqual(left: CellSelection, right: CellSelection): boolean {
    return (
      left.mode === right.mode &&
      areCellAddressesEqual(left.active, right.active) &&
      areCellAddressesEqual(left.anchor, right.anchor) &&
      areCellAddressesEqual(left.focus, right.focus)
    );
  }

  function setSelection(
    nextSelection: CellSelection,
    visibleAddress: CellAddress = nextSelection.active,
    restoreFocus = true,
  ): void {
    const sheet = options.getSheet();
    if (!canSelectCell(sheet, nextSelection.active) || !canSelectCell(sheet, nextSelection.focus))
      return;
    selectedImageId.value = null;
    options.clearContextMenus();
    options.ensureGridExtentContains(visibleAddress);
    options.ensureGridExtentContains(nextSelection.active);
    options.ensureGridExtentContains(nextSelection.anchor);
    options.ensureGridExtentContains(nextSelection.focus);
    const normalized = normalizeSelectionForSheet(nextSelection);
    if (!areSelectionsEqual(selection.value, normalized)) {
      // Extending a range does not change its active cell or the cell content layer.
      if (areCellAddressesEqual(selection.value.active, normalized.active)) {
        normalized.active = selection.value.active;
      }
      selection.value = normalized;
    }
    options.ensureSelectionVisible(visibleAddress, nextSelection.mode);
    options.emitViewState();
    if (restoreFocus) {
      options.focusEditor();
    }
  }

  function setActiveCell(address: CellAddress, restoreFocus = true): void {
    setSelection(createCellSelection(address), address, restoreFocus);
  }

  function stopFormulaReferenceDrag(): void {
    options.stopFormulaReferenceDragInternal();
    options.setFormulaReferenceDragEditor(undefined);
  }

  function finishEdit(
    destination?: CellSelection,
    restoreFocus = true,
    finishOptions: CellEditFinishOptions = {},
  ): boolean {
    stopFormulaReferenceDrag();
    return options.finishCellEdit(destination, restoreFocus, finishOptions);
  }

  function cancelEdit(restoreFocus = true): void {
    stopFormulaReferenceDrag();
    options.cancelCellEdit(restoreFocus);
  }

  function onEditorBlur(event: FocusEvent): void {
    stopFormulaReferenceDrag();
    options.onCellEditorBlur(event);
  }

  function getNextVisibleColumn(column: number, direction: -1 | 1): number | null {
    let next = column + direction;
    while (next >= 0 && next < MAX_SHEET_COLUMNS) {
      if (!outlineHiddenColumnSet.value.has(next)) return next;
      next += direction;
    }
    return null;
  }

  const { handleReferenceKeydown } = useFormulaReferenceNavigation({
    session: editSession,
    getEditor: getReferenceEditor,
    getActiveAddress: () => activeCell.value,
    getVisibleRow: (row, direction) =>
      direction > 0
        ? navigationRows.value.getNextVisibleRow(row)
        : navigationRows.value.getPreviousVisibleRow(row),
    getVisibleColumn: getNextVisibleColumn,
    ensureVisible: (address) => {
      options.ensureGridExtentContains(address);
      options.ensureSelectionVisible(address, "cells");
    },
  });

  function startReferencePick(address: CellAddress, event: MouseEvent): boolean {
    const editor = getReferenceEditor();
    if (!editor || isComposing.value) return false;
    const range = { start: { ...address }, end: { ...address } };
    if (!editor.pickReference(range, "start")) return false;
    options.clearContextMenus();
    formulaReferenceRange.value = range;
    options.stopDragSelection();
    stopFormulaReferenceDrag();
    options.setFormulaReferenceDragEditor(editor);
    options.startFormulaReferenceDrag(createCellSelection(address), event);
    return true;
  }

  watch(
    [navigationRows, outlineHiddenColumnSet],
    () => {
      const current = selection.value.active;
      const rows = navigationRows.value;
      const row = rows.isRowVisible(current.row)
        ? current.row
        : (rows.getNextVisibleRow(current.row) ?? rows.getPreviousVisibleRow(current.row));
      const column = !outlineHiddenColumnSet.value.has(current.column)
        ? current.column
        : (getNextVisibleColumn(current.column, 1) ?? getNextVisibleColumn(current.column, -1));
      if (row === null || column === null || (row === current.row && column === current.column))
        return;
      options.ensureGridExtentContains({ row, column });
      setSelection(createCellSelection({ row, column }));
    },
    { deep: true },
  );

  watch(
    () => options.getSheet().mergedCells,
    () => {
      const normalized = normalizeSelectionForSheet(selection.value);
      if (areSelectionsEqual(normalized, selection.value)) return;
      selection.value = normalized;
      options.emitViewState();
    },
    { deep: true },
  );

  function navigateToCell(address: CellAddress): void {
    const nextSelection = createCellSelection(address);
    if (options.deferSelectionWhileComposing(nextSelection)) {
      return;
    }

    if (isEditing.value) {
      if (!finishEdit(nextSelection)) return;
    } else {
      setSelection(nextSelection, address);
    }
  }

  function navigateToRange(range: CellRange): void {
    const nextSelection: CellSelection = {
      active: { ...range.start },
      anchor: { ...range.start },
      focus: { ...range.end },
      mode: "cells",
    };
    if (options.deferSelectionWhileComposing(nextSelection)) return;
    if (isEditing.value && !finishEdit(nextSelection)) return;
    options.ensureGridExtentContains(range.end);
    setSelection(nextSelection, range.start);
  }

  function moveSelection(
    delta: { rows?: number; columns?: number },
    commitEdit: boolean,
    extend = false,
    finishOptions: CellEditFinishOptions = {},
  ): void {
    const destination = moveCellSelection(
      selection.value,
      delta,
      {
        rowCount: MAX_SHEET_ROWS,
        columnCount: MAX_SHEET_COLUMNS,
      },
      extend,
    );
    if (delta.rows) {
      const source = extend ? selection.value.focus : selection.value.active;
      const row =
        delta.rows > 0
          ? navigationRows.value.getNextVisibleRow(source.row)
          : navigationRows.value.getPreviousVisibleRow(source.row);
      if (row === null) return;
      if (!extend) {
        destination.active.row = row;
        destination.anchor.row = row;
      }
      destination.focus.row = row;
    }
    if (delta.columns) {
      const source = extend ? selection.value.focus : selection.value.active;
      const column = getNextVisibleColumn(source.column, delta.columns > 0 ? 1 : -1);
      if (column === null) return;
      if (!extend) {
        destination.active.column = column;
        destination.anchor.column = column;
      }
      destination.focus.column = column;
    }
    const visibleAddress = extend ? destination.focus : destination.active;
    options.ensureGridExtentContains(visibleAddress);

    if (commitEdit) {
      if (!finishEdit(destination, true, finishOptions)) return;
    } else {
      setSelection(destination, visibleAddress);
    }
  }

  function onDimensionResizeRequest(
    axis: SheetDimensionAxis,
    payload: { index: number; size: number },
  ): void {
    if (options.dimensionReadOnly(axis)) return;
    options.requestDimensionResize(axis, payload);
  }

  function onDimensionResizeStart(
    axis: SheetDimensionAxis,
    payload: { index: number; event: PointerEvent },
  ): void {
    if (options.dimensionReadOnly(axis)) return;
    const startSize =
      axis === "row"
        ? geometry.value.getRowHeight(payload.index)
        : geometry.value.getColumnWidth(payload.index);
    options.startDimensionResize(axis, { ...payload, startSize });
  }

  function onGridKeydown(event: KeyboardEvent): void {
    if (options.hasActiveTransparentColor()) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        options.cancelTransparentColor();
        options.focusEditor();
      } else if (event.key === "Tab") options.cancelTransparentColor();
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("[data-shape-canvas-text-editor], [data-equation-session]")
    )
      return;
    if (options.hasActivePictureCrop()) {
      options.onPictureCropKeydown(event);
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-page-header-footer]"))
      return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        "[data-floating-image-id], [data-owned-picture-selected], [data-sheet-drawing-id], [data-shape-creation-layer]",
      )
    ) {
      options.handleHistoryShortcut(event);
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (options.hasActiveDimensionResize()) {
      event.preventDefault();
      event.stopPropagation();
      options.stopDimensionResize();
      return;
    }
    if (options.isFormatPainterActive()) {
      event.preventDefault();
      event.stopPropagation();
      options.onCancelFormatPainter();
      return;
    }
    if (!isEditing.value && options.hasPendingClipboardRange()) {
      event.preventDefault();
      event.stopPropagation();
      options.clearPendingClipboard();
    }
  }

  function onCellMouseDown(address: CellAddress, event: MouseEvent): void {
    if (startReferencePick(address, event)) {
      return;
    }
    const previousSelection = selection.value;
    const nextSelection = event.shiftKey
      ? extendCellSelection(previousSelection, address)
      : createCellSelection(address);

    if (options.deferSelectionWhileComposing(nextSelection)) {
      return;
    }

    if (isEditing.value) {
      if (!finishEdit(nextSelection)) return;
    } else {
      setSelection(nextSelection, address);
    }

    options.startDragSelection(nextSelection, event);
  }

  function selectAxis(
    mode: "rows" | "columns" | "all",
    address: CellAddress,
    shiftKey: boolean,
    restoreFocus = true,
  ): void {
    const nextSelection =
      shiftKey && mode !== "all"
        ? extendAxisSelection(selection.value, mode, address)
        : createAxisSelection(mode, address);
    if (options.deferSelectionWhileComposing(nextSelection)) {
      return;
    }
    if (isEditing.value) {
      if (!finishEdit(nextSelection, restoreFocus)) return;
    } else {
      setSelection(nextSelection, address, restoreFocus);
    }
  }

  function pickAxisReference(
    mode: "rows" | "columns",
    address: CellAddress,
    shiftKey: boolean,
  ): boolean {
    const editor = getReferenceEditor();
    if (!editor || isComposing.value) return false;
    const previous = editor.referenceActive ? editor.referenceRange : null;
    const next =
      shiftKey && previous
        ? extendAxisSelection(
            createAxisSelection(mode, {
              row: previous.start.row,
              column: previous.start.column,
            }),
            mode,
            address,
          )
        : createAxisSelection(mode, address);
    const range = getSelectionRange(next);
    const rangeKind = mode === "rows" ? "row-axis" : "column-axis";
    if (!editor.pickReference(range, "start", rangeKind)) return false;
    formulaReferenceRange.value = range;
    options.clearContextMenus();
    options.stopDragSelection();
    stopFormulaReferenceDrag();
    return true;
  }

  function onColumnHeaderSelect(payload: { column: number; shiftKey: boolean }): void {
    if (pickAxisReference("columns", { row: 0, column: payload.column }, payload.shiftKey)) return;
    selectAxis("columns", { row: 0, column: payload.column }, payload.shiftKey);
  }

  function onRowHeaderSelect(payload: { row: number; shiftKey: boolean }): void {
    if (pickAxisReference("rows", { row: payload.row, column: 0 }, payload.shiftKey)) return;
    selectAxis("rows", { row: payload.row, column: 0 }, payload.shiftKey);
  }

  return {
    normalizeSelectionForSheet,
    areSelectionsEqual,
    setSelection,
    setActiveCell,
    stopFormulaReferenceDrag,
    finishEdit,
    cancelEdit,
    onEditorBlur,
    handleReferenceKeydown,
    getNextVisibleColumn,
    navigateToCell,
    navigateToRange,
    moveSelection,
    onDimensionResizeRequest,
    onDimensionResizeStart,
    onGridKeydown,
    onCellMouseDown,
    selectAxis,
    onColumnHeaderSelect,
    onRowHeaderSelect,
  };
}
