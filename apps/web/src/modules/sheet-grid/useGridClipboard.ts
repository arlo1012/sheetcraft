import { computed, shallowRef, type ComputedRef } from "vue";
import {
  createPastePlan,
  getCellRangeValues,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
  type CellValueMatrix,
  type PastePlan,
} from "@idea10/core/clipboard";
import { getCellStyle, type CellRange, type Sheet } from "@idea10/core/workbook";
import { cloneCellStyle, type CellStyle } from "@idea10/core/style";
import {
  getSelectionMode,
  getSelectionRange,
  type CellSelection,
} from "@idea10/sheet-engine/selection";
import {
  createBrowserGridClipboardPort,
  IDEA10_CLIPBOARD_TYPE,
  type GridClipboardPort,
  type GridClipboardTransfer,
} from "./gridClipboardPort";

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
  clipboardPort?: GridClipboardPort;
}) {
  const clipboardPort = options.clipboardPort ?? createBrowserGridClipboardPort();
  const pendingClipboard = shallowRef<PendingClipboard | null>(null);
  let clipboardOperation = 0;
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

  function prepareSelection(mode: "copy" | "cut"): PendingClipboard | undefined {
    if (options.isEditing() || options.isComposing()) {
      return undefined;
    }

    if (getSelectionMode(options.getSelection()) !== "cells") {
      options.onFeedback("axisCopyUnsupported");
      return undefined;
    }

    const range = getSelectionRange(options.getSelection());
    const values = getCellRangeValues(options.getSheet(), range);
    const styles = getCellRangeStyles(options.getSheet(), range);
    const text = serializeCellValuesToTsv(values);
    const token = createToken();
    return { mode, range, token, text, values, styles };
  }

  function commitPreparedSelection(prepared: PendingClipboard): void {
    pendingClipboard.value = prepared;
    options.onFeedback(prepared.mode === "cut" ? "readyToMove" : "copied");
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

    const prepared = prepareSelection(mode);
    if (!prepared) {
      return;
    }

    event.clipboardData.setData("text/plain", prepared.text);
    event.clipboardData.setData(IDEA10_CLIPBOARD_TYPE, prepared.token);
    clipboardOperation += 1;
    commitPreparedSelection(prepared);
  }

  async function writeSelectionToClipboard(mode: "copy" | "cut"): Promise<void> {
    const prepared = prepareSelection(mode);
    if (!prepared) {
      return;
    }
    const operation = ++clipboardOperation;
    const sheetId = options.getSheet().id;
    let localTokenWritten: boolean;
    try {
      ({ localTokenWritten } = await clipboardPort.write({
        text: prepared.text,
        localToken: prepared.token,
      }));
    } catch {
      if (operation === clipboardOperation && options.getSheet().id === sheetId) {
        options.onFeedback("unavailable");
      }
      return;
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    commitPreparedSelection(
      mode === "cut" && !localTokenWritten ? { ...prepared, mode: "copy" } : prepared,
    );
  }

  function onCopy(event: ClipboardEvent): void {
    writeSelection(event, "copy");
  }

  function onCut(event: ClipboardEvent): void {
    writeSelection(event, "cut");
  }

  function canPaste(): boolean {
    if (options.isEditing() || options.isComposing()) {
      return false;
    }
    if (getSelectionMode(options.getSelection()) !== "cells") {
      options.onFeedback("axisPasteUnsupported");
      return false;
    }
    return true;
  }

  function cloneSelection(selection: CellSelection): CellSelection {
    return {
      active: { ...selection.active },
      anchor: { ...selection.anchor },
      focus: { ...selection.focus },
      mode: selection.mode,
    };
  }

  function pasteTransfer(transfer: GridClipboardTransfer, selection: CellSelection): void {
    const text = transfer.text;
    const localToken = transfer.localToken;
    const pending = pendingClipboard.value;
    const isMatchingLocalClipboard = Boolean(pending && localToken && localToken === pending.token);
    if (!isMatchingLocalClipboard && text === undefined) {
      options.onFeedback("missingText");
      return;
    }
    const values =
      isMatchingLocalClipboard && pending ? pending.values : parseTsvToCellValues(text ?? "");
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

  function onPaste(event: ClipboardEvent): void {
    if (options.isEditing() || options.isComposing()) {
      return;
    }
    event.preventDefault();
    if (!canPaste()) {
      return;
    }

    const data = event.clipboardData;
    if (!data) {
      options.onFeedback("unavailable");
      return;
    }
    const types = Array.from(data.types);
    clipboardOperation += 1;
    pasteTransfer(
      {
        text: types.includes("text/plain") ? data.getData("text/plain") : undefined,
        localToken: data.getData(IDEA10_CLIPBOARD_TYPE) || undefined,
      },
      cloneSelection(options.getSelection()),
    );
  }

  async function pasteSelection(): Promise<void> {
    if (!canPaste()) {
      return;
    }
    const operation = ++clipboardOperation;
    const sheetId = options.getSheet().id;
    const selection = cloneSelection(options.getSelection());
    let transfer: GridClipboardTransfer;
    try {
      transfer = await clipboardPort.read();
    } catch {
      if (operation === clipboardOperation && options.getSheet().id === sheetId) {
        options.onFeedback("unavailable");
      }
      return;
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    pasteTransfer(transfer, selection);
  }

  function clearPendingClipboard(): void {
    clipboardOperation += 1;
    pendingClipboard.value = null;
  }

  return {
    clipboardMode,
    clipboardRange,
    clearPendingClipboard,
    copySelection: () => writeSelectionToClipboard("copy"),
    cutSelection: () => writeSelectionToClipboard("cut"),
    onCopy,
    onCut,
    onPaste,
    pasteSelection,
  };
}
