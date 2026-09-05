import { computed, shallowRef, watch, type ComputedRef } from "vue";
import {
  getCellMatrixSize,
  getCellRangeContents,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
  tileCellMatrix,
  type CellContentMatrix,
  type CellValueMatrix,
  type PastePlan,
} from "@idea10/core/clipboard";
import {
  createSheetEvaluator,
  getCellStyle,
  getCellContent,
  type CellRange,
  type Sheet,
} from "@idea10/core/workbook";
import { isFormulaError } from "@idea10/core/formula";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import { cloneCellStyle, type CellStyle } from "@idea10/core/style";
import {
  getSelectionMode,
  getSelectionRange,
  type CellSelection,
} from "@idea10/sheet-engine/selection";
import {
  createBrowserGridClipboardPort,
  areGridClipboardTextsEqual,
  IDEA10_CLIPBOARD_TYPE,
  readGridClipboardLocalToken,
  type GridClipboardPort,
  type GridClipboardTransfer,
} from "./gridClipboardPort";
import {
  createGridClipboardRowVisibility,
  createVisibleGridPastePlan,
  getVisibleClipboardRows,
  MAX_GRID_CLIPBOARD_CELLS,
  rangeIntersectsMergedCells,
  rangeTouchesHiddenClipboardRows,
} from "./gridClipboardRows";

export type CellStyleMatrix = Array<Array<CellStyle | null>>;

export type GridPastePlan = PastePlan & {
  /** Physical destination row for each row in values; omitted for ordinary rectangular pastes. */
  rows?: number[];
  /** Filtered pastes must not reconcile borders by changing hidden neighbors. */
  preserveHiddenRows?: boolean;
};

export type GridPasteResult = { ok: true } | { ok: false; reason: GridClipboardFeedback };

export type GridPastePayload =
  | {
      kind: "all";
      plan: GridPastePlan;
      /** Local cut source. Its presence requires an atomic workbook move rather than a paste. */
      moveSource?: CellRange;
      /** Raw local source, retained to preserve formulas across an internal paste. */
      contents?: CellContentMatrix;
      sourceRange?: CellRange;
      /** Physical source rows before filtered copies compact their value matrix. */
      sourceRows?: number[];
      styles?: CellStyleMatrix;
    }
  | { kind: "values"; plan: GridPastePlan }
  | { kind: "formats"; plan: GridPastePlan; styles: CellStyleMatrix };

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
  | "formatsUnavailable"
  | "filteredCutUnsupported"
  | "mergedRangeUnsupported"
  | "noVisibleCells"
  | "rangeTooLarge"
  | "pasteRejected"
  | "documentChanged";

type PendingClipboard = {
  sheetId: string;
  mode: "copy" | "cut";
  range: CellRange;
  token: string;
  text: string;
  contents: CellContentMatrix;
  values: CellValueMatrix;
  styles: CellStyleMatrix;
  sourceRows?: number[];
  revision: number;
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
  getRevision?: () => number;
  isEditing: () => boolean;
  isComposing: () => boolean;
  onPaste: (payload: GridPastePayload) => GridPasteResult;
  onFeedback: (feedback: GridClipboardFeedback) => void;
  clipboardPort?: GridClipboardPort;
  onPasteImage?: (transfer: GridClipboardTransfer, selection: CellSelection) => void;
  onReadUnavailable?: (selection: CellSelection) => boolean;
  onReadTransfer?: (transfer: GridClipboardTransfer) => void;
}) {
  const clipboardPort = options.clipboardPort ?? createBrowserGridClipboardPort();
  const pendingClipboard = shallowRef<PendingClipboard | null>(null);
  const rowVisibility = computed(() => createGridClipboardRowVisibility(options.getSheet()));
  const getRevision = () => options.getRevision?.() ?? 0;
  let clipboardOperation = 0;
  let nativeWrite: Promise<void> | undefined;
  const clipboardRange: ComputedRef<CellRange | null> = computed(() => {
    const pending = pendingClipboard.value;
    return pending?.sheetId === options.getSheet().id ? pending.range : null;
  });
  const clipboardMode = computed(() => {
    const pending = pendingClipboard.value;
    return pending?.sheetId === options.getSheet().id ? pending.mode : null;
  });
  const cutDisabledReason = computed<GridClipboardFeedback | undefined>(() => {
    if (getSelectionMode(options.getSelection()) !== "cells") return "axisCopyUnsupported";
    const range = getSelectionRange(options.getSelection());
    const rows = getVisibleClipboardRows(rowVisibility.value, range);
    if (!rows) return "rangeTooLarge";
    if (!rows.length) return "noVisibleCells";
    if (rangeIntersectsMergedCells(options.getSheet(), range)) return "mergedRangeUnsupported";
    if (rangeTouchesHiddenClipboardRows(rowVisibility.value, range))
      return "filteredCutUnsupported";
    return undefined;
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
    const sheet = options.getSheet();
    const rows = getVisibleClipboardRows(rowVisibility.value, range);
    if (!rows || rows.length === 0) {
      options.onFeedback(rows ? "noVisibleCells" : "rangeTooLarge");
      return undefined;
    }
    if (rangeIntersectsMergedCells(sheet, range)) {
      options.onFeedback("mergedRangeUnsupported");
      return undefined;
    }
    const compressed = rows.length !== range.end.row - range.start.row + 1;
    if (mode === "cut" && rangeTouchesHiddenClipboardRows(rowVisibility.value, range)) {
      options.onFeedback("filteredCutUnsupported");
      return undefined;
    }
    const contents: CellContentMatrix = [];
    const values: CellValueMatrix = [];
    const styles: CellStyleMatrix = [];
    const evaluator = createSheetEvaluator(sheet);
    for (const row of rows) {
      const rowRange = {
        start: { row, column: range.start.column },
        end: { row, column: range.end.column },
      };
      contents.push(getCellRangeContents(sheet, rowRange)[0]!);
      values.push(
        Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) => {
          const address = { row, column: range.start.column + offset };
          if (getCellContent(sheet, address)?.kind === "image") return null;
          const value = evaluator.getComputedValue(address);
          return isFormulaError(value) ? formatComputedValueForDisplay(value) : value;
        }),
      );
      styles.push(getCellRangeStyles(sheet, rowRange)[0]!);
    }
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
      sourceRows: compressed ? rows : undefined,
      revision: getRevision(),
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
    // Native MIME data is not exposed by every browser's Async Clipboard API.
    // Keep the successful event payload if the optional rich write is unsupported.
    nativeWrite = clipboardPort
      .writeNativeRich?.({ text: prepared.text, localToken: prepared.token })
      .catch(() => {});
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
      if (nativeWrite) await nativeWrite;
      if (operation !== clipboardOperation || options.getSheet().id !== sheetId) return;
      ({ localTokenWritten } = await clipboardPort.write({
        text: prepared.text,
        localToken: prepared.token,
      }));
    } catch {
      if (operation === clipboardOperation && options.getSheet().id === sheetId) {
        // Browser clipboard denial must not discard the in-memory menu copy/cut.
        commitPreparedSelection(prepared);
      }
      return;
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    if (mode === "cut" && prepared.revision !== getRevision()) {
      options.onFeedback("documentChanged");
      return;
    }
    commitPreparedSelection({
      ...prepared,
      mode,
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
    if (kind === "all" && (transfer.imageFile || transfer.floatingImage) && options.onPasteImage) {
      options.onPasteImage(transfer, selection);
      return;
    }
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
    if (isLocalCut && pending?.revision !== getRevision()) {
      options.onFeedback("documentChanged");
      return;
    }
    const size = getCellMatrixSize(values);
    if (size.rowCount * size.columnCount > MAX_GRID_CLIPBOARD_CELLS) {
      options.onFeedback("rangeTooLarge");
      return;
    }
    const targetRange = getSelectionRange(selection);
    if (!isLocalCut) {
      const targetRows = getVisibleClipboardRows(rowVisibility.value, targetRange);
      if (!targetRows || targetRows.length === 0) {
        options.onFeedback(targetRows ? "noVisibleCells" : "rangeTooLarge");
        return;
      }
    }
    const plan = createVisibleGridPastePlan(
      values,
      targetRange,
      selection.active,
      rowVisibility.value,
      { pasteFromActiveCell: isLocalCut },
    );
    if (!plan) {
      options.onFeedback("rangeMismatch");
      return;
    }
    if (rangeIntersectsMergedCells(options.getSheet(), plan.range)) {
      options.onFeedback("mergedRangeUnsupported");
      return;
    }
    if (isLocalCut && pending) {
      if (
        rangeTouchesHiddenClipboardRows(rowVisibility.value, pending.range) ||
        rangeTouchesHiddenClipboardRows(rowVisibility.value, plan.range)
      ) {
        options.onFeedback("filteredCutUnsupported");
        return;
      }
    }

    let payload: GridPastePayload;
    if (kind === "formats" && matchingFormatSource) {
      payload = {
        kind,
        plan,
        styles: tileCellMatrix(matchingFormatSource.styles, getCellMatrixSize(plan.values)),
      };
    } else if (kind === "values") {
      payload = { kind, plan };
    } else {
      if (isLocalCut && pending) {
        payload = { kind: "all", plan, moveSource: pending.range };
      } else {
        payload = {
          kind: "all",
          plan,
          contents: isMatchingLocalClipboard && pending ? pending.contents : undefined,
          sourceRange: isMatchingLocalClipboard && pending ? pending.range : undefined,
          ...(isMatchingLocalClipboard && pending?.sourceRows
            ? { sourceRows: pending.sourceRows }
            : {}),
          styles:
            isMatchingLocalClipboard && pending
              ? tileCellMatrix(pending.styles, getCellMatrixSize(plan.values))
              : undefined,
        };
      }
    }
    let result: GridPasteResult;
    try {
      result = options.onPaste(payload);
    } catch {
      result = { ok: false, reason: "pasteRejected" };
    }
    if (!result.ok) {
      options.onFeedback(result.reason);
      return;
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
    revision: number,
  ): Promise<void> {
    let transfer = eventTransfer;
    try {
      if (nativeWrite) await nativeWrite;
      const asyncTransfer = await clipboardPort.read({ preferAsync: true });
      transfer = {
        text: eventTransfer.text,
        // A later clipboard item must not turn captured external text into a local cut.
        localToken: areGridClipboardTextsEqual(eventTransfer.text, asyncTransfer.text)
          ? asyncTransfer.localToken
          : undefined,
      };
    } catch {
      // The synchronous event payload remains the safe text-only fallback.
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    if (revision !== getRevision()) {
      options.onFeedback("documentChanged");
      return;
    }
    if (pendingClipboard.value && transfer.localToken !== pendingClipboard.value.token) {
      pendingClipboard.value = null;
    }
    options.onReadTransfer?.(transfer);
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
    const revision = getRevision();
    const selection = cloneSelection(options.getSelection());
    const transfer = {
      text: types.includes("text/plain") ? data.getData("text/plain") : undefined,
      localToken: readGridClipboardLocalToken(data),
      imageFile: data.files
        ? Array.from(data.files).find((file) => file.type.startsWith("image/"))
        : undefined,
    };
    if (!transfer.localToken && pendingClipboard.value?.localTokenWritten) {
      void pasteClipboardEventTransfer(transfer, selection, operation, sheetId, revision);
      return;
    }
    if (pendingClipboard.value && transfer.localToken !== pendingClipboard.value.token) {
      pendingClipboard.value = null;
    }
    options.onReadTransfer?.(transfer);
    pasteTransfer(transfer, selection, "all");
  }

  async function pasteSelection(kind: GridPasteKind = "all"): Promise<void> {
    if (!canPaste()) {
      return;
    }
    const operation = ++clipboardOperation;
    const sheetId = options.getSheet().id;
    const revision = getRevision();
    const selection = cloneSelection(options.getSelection());
    let transfer: GridClipboardTransfer;
    try {
      if (nativeWrite) await nativeWrite;
      transfer = await clipboardPort.read();
    } catch {
      if (operation !== clipboardOperation || options.getSheet().id !== sheetId) return;
      if (revision !== getRevision()) {
        options.onFeedback("documentChanged");
        return;
      }
      const pending = pendingClipboard.value;
      if (
        pending &&
        pending.sheetId === sheetId &&
        (pending.mode === "copy" || pending.revision === revision)
      ) {
        pasteTransfer({ text: pending.text, localToken: pending.token }, selection, kind);
      } else if (!options.onReadUnavailable?.(selection)) {
        options.onFeedback("unavailable");
      }
      return;
    }
    if (operation !== clipboardOperation || options.getSheet().id !== sheetId) {
      return;
    }
    if (revision !== getRevision()) {
      options.onFeedback("documentChanged");
      return;
    }
    if (pendingClipboard.value && transfer.localToken !== pendingClipboard.value.token) {
      pendingClipboard.value = null;
    }
    options.onReadTransfer?.(transfer);
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
    hasPendingClipboard: computed(() => pendingClipboard.value?.sheetId === options.getSheet().id),
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
    cutDisabledReason,
    clearPendingClipboard,
    copySelection: () => writeSelectionToClipboard("copy"),
    cutSelection: () => writeSelectionToClipboard("cut"),
    onCopy,
    onCut,
    onPaste,
    pasteCapturedText: (text: string) => {
      if (!canPaste()) return;
      clearPendingClipboard();
      options.onReadTransfer?.({ text });
      pasteTransfer({ text }, cloneSelection(options.getSelection()), "all");
    },
    pasteSelection,
    pasteFormatsSelection: () => pasteSelection("formats"),
    pasteValuesSelection: () => pasteSelection("values"),
  };
}
