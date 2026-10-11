import type { CellAddress } from "@sheetcraft/core/workbook";
import { reactive, readonly } from "vue";
import { completeFormulaForCommit } from "../formula-editing/formula-commit";

export type CellEditSurface = "grid" | "formula-bar";

export type CellEditTarget = {
  sheetId?: string;
  address: CellAddress;
};

export type CellEditContext = CellEditTarget & {
  input: string;
};

export type CellEditCommit = CellEditTarget & {
  input: string;
  /** Native editor paste stays target-only even when committed later with Enter. */
  inputOrigin?: "paste";
  /** A second explicit Enter that may confirm an already displayed warning. */
  confirmPendingWarning?: boolean;
};

export type CellEditFinishOptions = {
  complete?: boolean;
  confirmPendingWarning?: boolean;
};

/** Only an unmodified, non-repeating Enter may confirm a pending warning. */
export function isExplicitWarningConfirmationKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing
  );
}

type CellEditSelection = {
  start: number;
  end: number;
  direction: "none" | "forward" | "backward";
};

type CellEditState = {
  active: boolean;
  owner: CellEditTarget | null;
  source: string;
  draft: string;
  surface: CellEditSurface;
  selection: CellEditSelection;
  composing: boolean;
  mode: "edit" | "point";
};

export type CellEditSession = ReturnType<typeof useCellEditSession>;
let sessionSequence = 0;

function copyTarget(target: CellEditTarget): CellEditTarget {
  return target.sheetId === undefined
    ? { address: { ...target.address } }
    : { sheetId: target.sheetId, address: { ...target.address } };
}

function areTargetsEqual(left: CellEditTarget, right: CellEditTarget): boolean {
  return (
    left.sheetId === right.sheetId &&
    left.address.row === right.address.row &&
    left.address.column === right.address.column
  );
}

function clampSelectionOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}

export function useCellEditSession(options: {
  onCommit: (payload: CellEditCommit) => void | boolean;
}) {
  const id = `cell-edit-${++sessionSequence}`;
  const mutableState = reactive<CellEditState>({
    active: false,
    owner: null,
    source: "",
    draft: "",
    surface: "grid",
    selection: { start: 0, end: 0, direction: "none" },
    composing: false,
    mode: "edit",
  });
  const state = readonly(mutableState);
  let compositionStartDraft = "";
  let pastedDraft = false;

  function reset(): void {
    mutableState.active = false;
    mutableState.owner = null;
    mutableState.source = "";
    mutableState.draft = "";
    mutableState.surface = "grid";
    mutableState.selection = { start: 0, end: 0, direction: "none" };
    mutableState.composing = false;
    mutableState.mode = "edit";
    compositionStartDraft = "";
    pastedDraft = false;
  }

  function begin(
    context: CellEditContext,
    beginOptions: { surface: CellEditSurface; mode: "append" | "replace"; initialValue?: string },
  ): boolean {
    if (mutableState.active) {
      if (!mutableState.owner || !areTargetsEqual(mutableState.owner, context)) return false;
      mutableState.surface = beginOptions.surface;
      return true;
    }

    const draft =
      beginOptions.mode === "append" ? context.input : (beginOptions.initialValue ?? "");
    mutableState.active = true;
    pastedDraft = false;
    mutableState.owner = copyTarget(context);
    mutableState.source = context.input;
    mutableState.draft = draft;
    mutableState.surface = beginOptions.surface;
    mutableState.selection = { start: draft.length, end: draft.length, direction: "none" };
    mutableState.composing = false;
    mutableState.mode = beginOptions.mode === "replace" ? "point" : "edit";
    return true;
  }

  function activateSurface(surface: CellEditSurface): void {
    if (mutableState.active) mutableState.surface = surface;
  }

  function setDraft(value: string): void {
    if (!mutableState.active) return;
    mutableState.draft = value;
    setSelection(
      mutableState.selection.start,
      mutableState.selection.end,
      mutableState.selection.direction,
    );
  }

  function markPasted(): void {
    if (mutableState.active) pastedDraft = true;
  }

  function setSelection(
    start: number,
    end: number,
    direction: CellEditSelection["direction"] = "none",
  ): void {
    if (!mutableState.active) return;
    const clampedStart = clampSelectionOffset(start, mutableState.draft.length);
    const clampedEnd = clampSelectionOffset(end, mutableState.draft.length);
    mutableState.selection = {
      start: Math.min(clampedStart, clampedEnd),
      end: Math.max(clampedStart, clampedEnd),
      direction,
    };
  }

  function setMode(mode: "edit" | "point"): void {
    if (mutableState.active) mutableState.mode = mode;
  }

  function flush(flushOptions: CellEditFinishOptions & { end?: boolean } = {}): boolean {
    if (!mutableState.active) return true;
    if (mutableState.composing || !mutableState.owner) return false;

    if (flushOptions.complete) {
      mutableState.draft = completeFormulaForCommit(mutableState.draft);
      setSelection(
        mutableState.selection.start,
        mutableState.selection.end,
        mutableState.selection.direction,
      );
    }
    if (mutableState.draft !== mutableState.source || flushOptions.confirmPendingWarning) {
      const accepted = options.onCommit({
        ...copyTarget(mutableState.owner),
        input: mutableState.draft,
        ...(pastedDraft ? { inputOrigin: "paste" as const } : {}),
        ...(flushOptions.confirmPendingWarning ? { confirmPendingWarning: true } : {}),
      });
      if (accepted === false) return false;
      mutableState.source = mutableState.draft;
      pastedDraft = false;
    }
    if (flushOptions.end) reset();
    return true;
  }

  function finish(finishOptions: CellEditFinishOptions = {}): boolean {
    return flush({ ...finishOptions, end: true });
  }

  function cancel(): void {
    reset();
  }

  function startComposition(): void {
    if (!mutableState.active) return;
    compositionStartDraft = mutableState.draft;
    mutableState.composing = true;
  }

  function endComposition(value: string): void {
    if (!mutableState.active) return;
    mutableState.draft = value === compositionStartDraft ? compositionStartDraft : value;
    mutableState.composing = false;
    compositionStartDraft = "";
    setSelection(
      mutableState.selection.start,
      mutableState.selection.end,
      mutableState.selection.direction,
    );
  }

  function hasPendingEdit(): boolean {
    return (
      mutableState.active && (mutableState.composing || mutableState.draft !== mutableState.source)
    );
  }

  return {
    id,
    state,
    begin,
    activateSurface,
    setDraft,
    markPasted,
    setSelection,
    setMode,
    flush,
    finish,
    cancel,
    startComposition,
    endComposition,
    hasPendingEdit,
  };
}
