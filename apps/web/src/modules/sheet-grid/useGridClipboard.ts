import { computed, shallowRef, watch, type ComputedRef } from "vue";
import {
  createPastePlan,
  getCellMatrixSize,
  getCellRangeContents,
  getCellRangeValues,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
  tileCellMatrix,
  type CellContentMatrix,
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
  readGridClipboardLocalToken,
  type GridClipboardPort,
  type GridClipboardTransfer,
} from "./gridClipboardPort";

export type CellStyleMatrix = Array<Array<CellStyle | null>>;

export type GridPastePayload =
  | {
      kind: "all";
      plan: PastePlan;
      /** Local cut source. Its presence requires an atomic workbook move rather than a paste. */
      moveSource?: CellRange;
      /** Raw local source, retained to preserve formulas across an internal paste. */
      contents?: CellContentMatrix;
      sourceRange?: CellRange;
      styles?: CellStyleMatrix;
    }
  | { kind: "values"; plan: PastePlan }
  | { kind: "formats"; plan: PastePlan; styles: CellStyleMatrix };

type GridPasteKind = GridPastePayload["kind"];

export type GridClipboardFeedback =
  | "unavailable"
  | "axisCopyUnsupported"
  | "readyToMove"
  | "copied"
  | "axisPasteUnsupported"
  | "missingText"
  | "rangeMismatch"
  | "moved"
  | "pasted"
  | "valuesPasted"
  | "formatsPasted"
  | "formatsUnavailable";

type PendingClipboard = {
  sheetId: string;
  mode: "copy" | "cut";
  range: CellRange;
  token: string;
  text: string;
  contents: CellContentMatrix;
  values: CellValueMatrix;
  styles: CellStyleMatrix;
  localTokenWritten: boolean;
};

export function getCellRangeStyles(sheet: Sheet, range: CellRange): CellStyleMatrix {
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
  const clipboardRange: ComputedRef<CellRange | null> = computed(() => {
    const pending = pendingClipboard.value;
    return pending?.sheetId === options.getSheet().id ? pending.range : null;
  });
  const clipboardMode = computed(() => {
    const pending = pendingClipboard.value;
    return pending?.sheetId === options.getSheet().id ? pending.mode : null;
  });

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
    const contents = getCellRangeContents(options.getSheet(), range);
    const values = getCellRangeValues(options.getSheet(), range);
    const styles = getCellRangeStyles(options.getSheet(), range);
    const text = serializeCellValuesToTsv(values);
    const token = createToken();
    return {
      sheetId: options.getSheet().id,
      mode,
      range,
      token,
      text,
      contents,
      values,
      styles,
      localTokenWritten: false,
    };
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
    commitPreparedSelection({ ...prepared, localTokenWritten: true });
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
    commitPreparedSelection({
      ...prepared,
      mode: mode === "cut" && !localTokenWritten ? "copy" : mode,
      localTokenWritten,
    });
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

  function pasteTransfer(
    transfer: GridClipboardTransfer,
    selection: CellSelection,
    kind: GridPasteKind,
  ): void {
    const text = transfer.text;
    const localToken = transfer.localToken;
    const pending = pendingClipboard.value;
    const isMatchingLocalClipboard = Boolean(
      pending &&
      pending.sheetId === options.getSheet().id &&
      localToken &&
      localToken === pending.token,
    );
    const matchingFormatSource =
      isMatchingLocalClipboard && pending?.mode === "copy" && pending.localTokenWritten
        ? pending
        : undefined;
    if (kind === "formats" && !matchingFormatSource) {
      options.onFeedback("formatsUnavailable");
      return;
    }
    if (!isMatchingLocalClipboard && text === undefined) {
      options.onFeedback("missingText");
      return;
    }
    const values =
      isMatchingLocalClipboard && pending ? pending.values : parseTsvToCellValues(text ?? "");
    const isLocalCut = Boolean(
      kind === "all" && isMatchingLocalClipboard && pending?.mode === "cut",
    );
    const plan = createPastePlan(values, getSelectionRange(selection), selection.active, {
      pasteFromActiveCell: isLocalCut,
    });
    if (!plan) {
      options.onFeedback("rangeMismatch");
      return;
    }

    if (kind === "formats" && matchingFormatSource) {
      options.onPaste({
        kind,
        plan,
        styles: tileCellMatrix(matchingFormatSource.styles, getCellMatrixSize(plan.values)),
      });
    } else if (kind === "values") {
      options.onPaste({ kind, plan });
    } else if (kind === "all") {
      if (isLocalCut && pending) {
        options.onPaste({ kind, plan, moveSource: pending.range });
      } else {
        options.onPaste({
          kind,
          plan,
          contents: isMatchingLocalClipboard && pending ? pending.contents : undefined,
          sourceRange: isMatchingLocalClipboard && pending ? pending.range : undefined,
          styles:
            isMatchingLocalClipboard && pending
              ? tileCellMatrix(pending.styles, getCellMatrixSize(plan.values))
              : undefined,
        });
      }
    }
    if (isLocalCut) {
      pendingClipboard.value = null;
    }
    options.onFeedback(
      isLocalCut
        ? "moved"
        : kind === "values"
          ? "valuesPasted"
          : kind === "formats"
            ? "formatsPasted"
            : "pasted",
    );
  }

  async function pasteClipboardEventTransfer(
    eventTransfer: GridClipboardTransfer,
    selection: CellSelection,
    operation: number,
    sheetId: string,
  ): Promise<void> {
    let transfer = eventTransfer;
    try {
      const asyncTransfer = await clipboardPort.read({ preferAsync: true });
      transfer = {
        text: eventTransfer.text,
        localToken: asyncTransfer.localToken,
      };
    } catch {
      // The synchronous event payload remains the safe text-only fallback.
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    pasteTransfer(transfer, selection, "all");
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
    const operation = ++clipboardOperation;
    const sheetId = options.getSheet().id;
    const selection = cloneSelection(options.getSelection());
    const transfer = {
      text: types.includes("text/plain") ? data.getData("text/plain") : undefined,
      localToken: readGridClipboardLocalToken(data),
    };
    if (!transfer.localToken && pendingClipboard.value?.localTokenWritten) {
      void pasteClipboardEventTransfer(transfer, selection, operation, sheetId);
      return;
    }
    pasteTransfer(transfer, selection, "all");
  }

  async function pasteSelection(kind: GridPasteKind = "all"): Promise<void> {
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
    pasteTransfer(transfer, selection, kind);
  }

  function clearPendingClipboard(): void {
    clipboardOperation += 1;
    pendingClipboard.value = null;
  }

  watch(
    () => options.getSheet().id,
    () => clearPendingClipboard(),
  );

  return {
    canPasteFormats: computed(() => {
      const pending = pendingClipboard.value;
      return Boolean(
        pending?.sheetId === options.getSheet().id &&
        pending.mode === "copy" &&
        pending.localTokenWritten,
      );
    }),
    clipboardMode,
    clipboardRange,
    clearPendingClipboard,
    copySelection: () => writeSelectionToClipboard("copy"),
    cutSelection: () => writeSelectionToClipboard("cut"),
    onCopy,
    onCut,
    onPaste,
    pasteSelection,
    pasteFormatsSelection: () => pasteSelection("formats"),
    pasteValuesSelection: () => pasteSelection("values"),
  };
}
