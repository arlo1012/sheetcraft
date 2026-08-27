import { computed, shallowRef, type ComputedRef } from "vue";
import {
  createPastePlan,
  getCellRangeValues,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
  type CellValueMatrix,
  type PastePlan,
} from "../workbook/clipboard";
import type { CellRange, Sheet } from "../workbook/workbook";
import { getSelectionRange, type CellSelection } from "./selection";

const LOCAL_CLIPBOARD_TYPE = "application/x-idea10-cells";

export type GridPastePayload = {
  plan: PastePlan;
  clearRange?: CellRange;
};

type PendingClipboard = {
  mode: "copy" | "cut";
  range: CellRange;
  token: string;
  text: string;
  values: CellValueMatrix;
};

export function useGridClipboard(options: {
  getSheet: () => Sheet;
  getSelection: () => CellSelection;
  isEditing: () => boolean;
  isComposing: () => boolean;
  onPaste: (payload: GridPastePayload) => void;
  onFeedback: (message: string) => void;
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
      options.onFeedback("Clipboard is unavailable.");
      return;
    }

    const range = getSelectionRange(options.getSelection());
    const values = getCellRangeValues(options.getSheet(), range);
    const text = serializeCellValuesToTsv(values);
    const token = createToken();
    event.clipboardData.setData("text/plain", text);
    event.clipboardData.setData(LOCAL_CLIPBOARD_TYPE, token);
    pendingClipboard.value = { mode, range, token, text, values };
    options.onFeedback(mode === "cut" ? "Cells ready to move." : "Cells copied.");
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
      options.onFeedback("Clipboard is unavailable.");
      return;
    }

    const text = data.getData("text/plain");
    const localToken = data.getData(LOCAL_CLIPBOARD_TYPE);
    const pending = pendingClipboard.value;
    const isMatchingLocalClipboard = Boolean(pending && localToken && localToken === pending.token);
    if (!isMatchingLocalClipboard && !Array.from(data.types).includes("text/plain")) {
      options.onFeedback("Clipboard does not contain text.");
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
      options.onFeedback("Clipboard data does not fit the selected range.");
      return;
    }

    options.onPaste({ plan, clearRange: isLocalCut ? pending?.range : undefined });
    if (isLocalCut) {
      pendingClipboard.value = null;
    }
    options.onFeedback(isLocalCut ? "Cells moved." : "Cells pasted.");
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
