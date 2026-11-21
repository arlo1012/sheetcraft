import {
  getCellContent,
  getCellHyperlink,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@sheetcraft/core/workbook";
import type { FillDirection } from "@sheetcraft/sheet-engine/fill-selection";
import {
  getSelectionMode,
  getSelectionRange,
  type CellSelection,
} from "@sheetcraft/sheet-engine/selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  isExplicitWarningConfirmationKey,
  type CellEditFinishOptions,
  type CellEditSession,
} from "../../shared/cell-editing/useCellEditSession";
import { completeFormulaForCommit } from "../../shared/formula-editing/formula-commit";
import type { SheetRenderFrame } from "./rendering/sheet-render-frame";

export type SheetGridEditorKeydownOptions = {
  rowHeaderWidth: number;
  getSheet: () => Sheet;
  getSelection: () => CellSelection;
  getSelectedRange: () => CellRange;
  getActiveCell: () => CellAddress;
  getLayout: () => SheetViewportLayout;
  getRenderFrame: () => SheetRenderFrame;
  getRootElement: () => HTMLElement | null | undefined;
  getScale: () => number;
  isEditing: () => boolean;
  isComposing: () => boolean;
  isReadOnly: () => boolean;
  isCellReadOnly: () => boolean;
  isSelectionReadOnly: () => boolean;
  isFormatPainterActive: () => boolean;
  isFlashFillBlocked: () => boolean;
  editSession: CellEditSession;
  getEditingValue: () => string;
  setEditingValue: (value: string) => void;
  insertEditorLineBreak: () => void;
  handleHistoryShortcut: (event: KeyboardEvent) => boolean;
  handleReferenceKeydown: (event: KeyboardEvent) => boolean;
  openActiveCellContextMenu: () => void;
  openAxisContextMenu: (
    axis: SheetDimensionAxis,
    index: number,
    clientX: number,
    clientY: number,
    trigger: HTMLElement,
  ) => void;
  beginEdit: (mode: "replace" | "append", initialText?: string) => void;
  cancelEdit: () => void;
  traverseSelection: (
    key: "Enter" | "Tab",
    reverse: boolean,
    commitEdit: boolean,
    finishOptions?: CellEditFinishOptions,
  ) => void;
  moveSelection: (
    delta: { rows?: number; columns?: number },
    commitEdit: boolean,
    extend?: boolean,
    finishOptions?: CellEditFinishOptions,
  ) => void;
  selectAxis: (
    mode: "rows" | "columns" | "all",
    address: CellAddress,
    shiftKey: boolean,
    restoreFocus?: boolean,
  ) => void;
  fillSelection: (direction: FillDirection) => void;
  clearPendingClipboard: () => void;
  onOpenHyperlink: (address: CellAddress) => void;
  onChooseFromColumn: (range: CellRange) => void;
  onFormatPainterTarget: (range: CellRange) => void;
  onUnlockRange: (range: CellRange) => void;
  onFlashFill: () => void;
  onClearCells: (range: CellRange) => void;
  onEditNote: (address: CellAddress) => void;
};

const NAVIGATION_DELTAS: Record<string, { rows?: number; columns?: number }> = {
  ArrowUp: { rows: -1 },
  ArrowDown: { rows: 1 },
  ArrowLeft: { columns: -1 },
  ArrowRight: { columns: 1 },
};

/** Handles keyboard navigation, editing commits, shortcuts, and context menus on the cell editor. */
export function createSheetGridEditorKeydownHandler(options: SheetGridEditorKeydownOptions) {
  return function onEditorKeydown(event: KeyboardEvent): void {
    if (options.isComposing() || event.isComposing) {
      if (event.key === "Escape") {
        event.preventDefault();
        options.cancelEdit();
      }
      return;
    }

    const selection = options.getSelection();
    const activeCell = options.getActiveCell();
    const editing = options.isEditing();
    const readOnly = options.isReadOnly();

    if (
      !editing &&
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key === "Enter" &&
      getSelectionMode(selection) === "cells" &&
      getCellHyperlink(options.getSheet(), activeCell)
    ) {
      event.preventDefault();
      options.onOpenHyperlink(activeCell);
      return;
    }

    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key === "ArrowDown" &&
      !editing &&
      !readOnly &&
      getSelectionMode(selection) === "cells"
    ) {
      event.preventDefault();
      options.onChooseFromColumn(getSelectionRange(selection));
      return;
    }

    if (options.isFormatPainterActive() && !readOnly && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      options.onFormatPainterTarget(getSelectionRange(selection));
      return;
    }

    if (!editing && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
      const mode = getSelectionMode(selection);
      if (mode === "cells") options.openActiveCellContextMenu();
      else if (mode === "rows" || mode === "columns") {
        const axis = mode === "rows" ? "row" : "column";
        const index = axis === "row" ? activeCell.row : activeCell.column;
        const frame = options.getRenderFrame();
        const item = (axis === "row" ? frame.rowHeaders : frame.columnHeaders)
          .flatMap((pane) => pane.items)
          .find((candidate) => candidate.index === index);
        const bounds = options.getRootElement()!.getBoundingClientRect();
        const x =
          axis === "row"
            ? frame.headerSize.width - options.rowHeaderWidth / 2
            : (item?.offset ?? frame.body.x) + (item?.size ?? 0) / 2;
        const y =
          axis === "column"
            ? frame.headerSize.height / 2
            : (item?.offset ?? frame.body.y) + (item?.size ?? 0) / 2;
        const scale = options.getScale();
        options.openAxisContextMenu(
          axis,
          index,
          bounds.left + x * scale,
          bounds.top + y * scale,
          event.currentTarget as HTMLElement,
        );
      } else return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (options.handleHistoryShortcut(event)) {
      return;
    }

    if (options.isCellReadOnly()) {
      if (
        event.key === "F2" ||
        event.key === "Delete" ||
        event.key === "Backspace" ||
        (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
      )
        options.onUnlockRange(options.getSelectedRange());
      if (
        event.key === "Delete" ||
        event.key === "Backspace" ||
        event.key === "F2" ||
        event.key.length === 1
      ) {
        event.preventDefault();
        return;
      }
    }

    if (editing) {
      if (options.handleReferenceKeydown(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        options.cancelEdit();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.altKey) {
          options.insertEditorLineBreak();
          return;
        }
        if (!options.editSession.state.asText)
          options.setEditingValue(completeFormulaForCommit(options.getEditingValue()));
        options.traverseSelection("Enter", event.shiftKey, true, {
          confirmPendingWarning: isExplicitWarningConfirmationKey(event),
        });
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (!options.editSession.state.asText)
          options.setEditingValue(completeFormulaForCommit(options.getEditingValue()));
        options.traverseSelection("Tab", event.shiftKey, true);
      }
      return;
    }

    const selectionReadOnly = options.isSelectionReadOnly();

    if (
      !selectionReadOnly &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "e" &&
      !options.isFlashFillBlocked() &&
      getSelectionMode(selection) === "cells"
    ) {
      event.preventDefault();
      event.stopPropagation();
      options.onFlashFill();
      return;
    }

    if (
      !selectionReadOnly &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key.toLowerCase() === "d" || event.key.toLowerCase() === "r")
    ) {
      event.preventDefault();
      options.fillSelection(event.key.toLowerCase() === "d" ? "down" : "right");
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      options.selectAxis("all", { row: 0, column: 0 }, false);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        options.selectAxis("rows", activeCell, false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
        event.preventDefault();
        options.selectAxis("columns", activeCell, false);
        return;
      }
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      options.clearPendingClipboard();
      if (!selectionReadOnly) options.onClearCells(getSelectionRange(selection));
      return;
    }

    const delta = NAVIGATION_DELTAS[event.key];
    if (delta) {
      event.preventDefault();
      options.moveSelection(delta, false, event.shiftKey);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      options.traverseSelection(event.key, event.shiftKey, false);
      return;
    }

    if (
      event.key === "F2" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      getSelectionMode(selection) === "cells"
    ) {
      event.preventDefault();
      options.onEditNote(options.getLayout().getAnchorForAddress(activeCell));
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      if (getCellContent(options.getSheet(), activeCell)?.kind !== "image")
        options.beginEdit("append");
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      options.beginEdit("replace", event.key);
    }
  };
}
