import { computed, shallowRef, type ComputedRef } from "vue";
import {
  createPastePlan,
  getCellRangeValues,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
  type CellValueMatrix,
  type PastePlan,
} from "../workbook/clipboard";
import { getCellStyle, type CellRange, type Sheet } from "@idea10/core/workbook";
import { cloneCellStyle, type CellStyle } from "@idea10/core/style";
import { getSelectionMode, getSelectionRange, type CellSelection } from "./selection";

const LOCAL_CLIPBOARD_TYPE = "application/x-idea10-cells";

export type GridPastePayload = {
  plan: PastePlan;
  clearRange?: CellRange;
  styles?: Array<Array<CellStyle | null>>;
};

export type GridClipboardFeedback =
  | "unavailable"
  | "axisCopyUnsupported"
  | "readyToMove"
  | "copied"
  | "axisPasteUnsupported"
  | "missingText"
  | "rangeMismatch"
  | "moved"
  | "pasted";

type PendingClipboard = {
  mode: "copy" | "cut";
  range: CellRange;
  token: string;
  text: string;
  values: CellValueMatrix;
  styles: Array<Array<CellStyle | null>>;
};

function getCellRangeStyles(sheet: Sheet, range: CellRange): Array<Array<CellStyle | null>> {
  const startRow = Math.min(range.start.row, range.end.row);
  const endRow = Math.max(range.start.row, range.end.row);
  const startColumn = Math.min(range.start.column, range.end.column);
  const endColumn = Math.max(range.start.column, range.end.column);
  const styles: Array<Array<CellStyle | null>> = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const rowStyles: Array<CellStyle | null> = [];
    for (let column = startColumn; column <= endColumn; column += 1) {
      rowStyles.push(
        cloneCellStyle(getCellStyle(sheet, { row, column }) as CellStyle | undefined) ?? null,
      );
    }
    styles.push(rowStyles);
  }
  return styles;
}

export function useGridClipboard(options: {
  getSheet: () => Sheet;
  getSelection: () => CellSelection;
  isEditing: () => boolean;
  isComposing: () => boolean;
  onPaste: (payload: GridPastePayload) => void;
  onFeedback: (feedback: GridClipboardFeedback) => void;
}) {
  const pendingClipboard = shallowRef<PendingClipboard | null>(null);
  const clipboardRange: ComputedRef<CellRange | null> = computed(
    () => pendingClipboard.value?.range ?? null,
  );
  const clipboardMode = computed(() => pendingClipboard.value?.mode ?? null);

  function createToken(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function writeSelection(event: ClipboardEvent, mode: "copy" | "cut"): void {
    if (options.isEditing() || options.isComposing()) {
      return;
    }

    event.preventDefault();
    if (!event.clipboardData) {
      options.onFeedback("unavailable");
      return;
    }

    if (getSelectionMode(options.getSelection()) !== "cells") {
      options.onFeedback("axisCopyUnsupported");
      return;
    }

    const range = getSelectionRange(options.getSelection());
    const values = getCellRangeValues(options.getSheet(), range);
    const styles = getCellRangeStyles(options.getSheet(), range);
    const text = serializeCellValuesToTsv(values);
    const token = createToken();
    event.clipboardData.setData("text/plain", text);
    event.clipboardData.setData(LOCAL_CLIPBOARD_TYPE, token);
    pendingClipboard.value = { mode, range, token, text, values, styles };
    options.onFeedback(mode === "cut" ? "readyToMove" : "copied");
  }

  function onCopy(event: ClipboardEvent): void {
    writeSelection(event, "copy");
  }

  function onCut(event: ClipboardEvent): void {
    writeSelection(event, "cut");
  }

  function onPaste(event: ClipboardEvent): void {
    if (options.isEditing() || options.isComposing()) {
      return;
    }

    event.preventDefault();
    const data = event.clipboardData;
    if (!data) {
      options.onFeedback("unavailable");
      return;
    }

    if (getSelectionMode(options.getSelection()) !== "cells") {
      options.onFeedback("axisPasteUnsupported");
      return;
    }

    const text = data.getData("text/plain");
    const localToken = data.getData(LOCAL_CLIPBOARD_TYPE);
    const pending = pendingClipboard.value;
    const isMatchingLocalClipboard = Boolean(pending && localToken && localToken === pending.token);
    if (!isMatchingLocalClipboard && !Array.from(data.types).includes("text/plain")) {
      options.onFeedback("missingText");
      return;
    }
    const values =
      isMatchingLocalClipboard && pending ? pending.values : parseTsvToCellValues(text);
    const selection = options.getSelection();
    const isLocalCut = Boolean(isMatchingLocalClipboard && pending?.mode === "cut");
    const plan = createPastePlan(values, getSelectionRange(selection), selection.active, {
      pasteFromActiveCell: isLocalCut,
    });
    if (!plan) {
      options.onFeedback("rangeMismatch");
      return;
    }

    options.onPaste({
      plan,
      clearRange: isLocalCut ? pending?.range : undefined,
      styles: isMatchingLocalClipboard ? pending?.styles : undefined,
    });
    if (isLocalCut) {
      pendingClipboard.value = null;
    }
    options.onFeedback(isLocalCut ? "moved" : "pasted");
  }

  function clearPendingClipboard(): void {
    pendingClipboard.value = null;
  }

  return {
    clipboardMode,
    clipboardRange,
    clearPendingClipboard,
    onCopy,
    onCut,
    onPaste,
  };
}
