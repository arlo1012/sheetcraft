import type { CellAddress } from "@sheetcraft/core/workbook";
import type { CellContent, CellTextFontRun } from "@sheetcraft/core/formula";
import { formatCellContentForInput } from "@sheetcraft/core/input";
import {
  areCellTextFontRunsEqual,
  cloneCellTextFontRuns,
  getCellTextFontOverride,
  isCellTextBoundary,
  normalizeCellTextFontRuns,
  replaceCellTextByDiff,
  replaceCellTextRange,
  type CellTextDocument,
} from "@sheetcraft/core/text-font-runs";
import { reactive, readonly } from "vue";
import { getCellTextGraphemes } from "@sheetcraft/sheet-engine/text-layout";
import { completeFormulaForCommit } from "../formula-editing/formula-commit";
import { getInputFontRuns } from "./input-font-runs";

export type CellEditSurface = "grid" | "formula-bar";

export type CellEditTarget = {
  sheetId?: string;
  address: CellAddress;
};

export type CellEditContext = CellEditTarget & {
  input: string;
  content?: CellContent | null;
  /** Matches the owner's existing Text number-format input contract. */
  asText?: boolean;
};

export type CellEditCommit = CellEditTarget & {
  input: string;
  /** UTF-16 ranges over input, including any literal escape prefix. */
  inputFontRuns?: CellTextFontRun[];
  /** Native editor paste stays target-only even when committed later with Enter. */
  inputOrigin?: "paste";
  /** A second explicit Enter that may confirm an already displayed warning. */
  confirmPendingWarning?: boolean;
};

export type CellEditFinishOptions = {
  complete?: boolean;
  confirmPendingWarning?: boolean;
};

export type CellTextReplacementOptions = {
  /** Symbols and font-bearing literal clipboard text must remain string literals on commit. */
  preserveLiteral?: boolean;
  /** Keep Symbol's chosen font local to its inserted text, retaining the prior typing font. */
  preserveTypingFont?: boolean;
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
  sourceFontRuns?: CellTextFontRun[];
  draftFontRuns?: CellTextFontRun[];
  richTextMode: boolean;
  asText: boolean;
  generation: number;
  revision: number;
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
    richTextMode: false,
    asText: false,
    generation: 0,
    revision: 0,
    surface: "grid",
    selection: { start: 0, end: 0, direction: "none" },
    composing: false,
    mode: "edit",
  });
  const state = readonly(mutableState);
  // Presence matters: an absent fontFamily explicitly means the inherited cell font.
  type TypingFontAffinity = { caret: number; surface: CellEditSurface; fontFamily?: string };
  type DraftSnapshot = CellTextDocument & {
    selection: CellEditSelection;
    typingFontAffinity?: TypingFontAffinity;
  };
  type DraftEdit = CellTextDocument & { typingFontAffinity?: TypingFontAffinity };
  let typingFontAffinity: TypingFontAffinity | undefined;
  let compositionStart: DraftSnapshot | undefined;
  let pendingInput: DraftSnapshot | undefined;
  const undoDrafts: DraftSnapshot[] = [];
  const redoDrafts: DraftSnapshot[] = [];
  let pastedDraft = false;
  let nextInputPlain = false;
  let pendingInputPlain = false;
  let compositionPlain = false;
  let boundaryText = "";
  let boundaries = [0];

  function graphemeBoundaries(): number[] {
    if (boundaryText !== mutableState.draft) {
      boundaryText = mutableState.draft;
      boundaries = [0];
      for (const grapheme of getCellTextGraphemes(boundaryText))
        boundaries.push(boundaries[boundaries.length - 1]! + grapheme.length);
    }
    return boundaries;
  }

  function previousBoundary(offset: number, inclusive = false): number {
    let previous = 0;
    for (const boundary of graphemeBoundaries()) {
      if (inclusive ? boundary > offset : boundary >= offset) break;
      previous = boundary;
    }
    return previous;
  }

  function wordBoundary(offset: number, direction: "backward" | "forward"): number {
    const text = mutableState.draft;
    const words =
      typeof Intl.Segmenter === "function"
        ? [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)]
        : [...text.matchAll(/\s+|[\p{L}\p{N}\p{M}_]+|[^\s\p{L}\p{N}\p{M}_]/gu)].map((match) => ({
            index: match.index,
            segment: match[0],
          }));
    if (direction === "backward") {
      let boundary = offset;
      for (let index = words.length - 1; index >= 0; index--) {
        const word = words[index]!;
        if (word.index >= offset) continue;
        boundary = word.index;
        if (!/^\s+$/u.test(word.segment)) break;
      }
      return boundary;
    }
    let boundary = offset;
    for (const word of words) {
      if (word.index + word.segment.length <= offset) continue;
      boundary = word.index + word.segment.length;
      if (!/^\s+$/u.test(word.segment)) break;
    }
    return boundary;
  }

  function snapshot(): DraftSnapshot {
    return {
      text: mutableState.draft,
      ...(mutableState.draftFontRuns
        ? { fontRuns: cloneCellTextFontRuns(mutableState.draftFontRuns) }
        : {}),
      // Native deletion temporarily expands its caret into a range; history keeps the caret.
      selection:
        typingFontAffinity && mutableState.selection.start !== mutableState.selection.end
          ? { start: typingFontAffinity.caret, end: typingFontAffinity.caret, direction: "none" }
          : { ...mutableState.selection },
      ...(typingFontAffinity ? { typingFontAffinity: { ...typingFontAffinity } } : {}),
    };
  }

  function applyDocument(document: CellTextDocument, record = true): void {
    const normalizedRuns = normalizeCellTextFontRuns(document.text, document.fontRuns);
    // Formula source has no character-font metadata; escaped literals still do.
    const fontRuns =
      document.text.startsWith("=") && !mutableState.asText ? undefined : normalizedRuns;
    if (
      document.text === mutableState.draft &&
      areCellTextFontRunsEqual(fontRuns, mutableState.draftFontRuns)
    )
      return;
    if (record && !mutableState.composing) {
      undoDrafts.push(snapshot());
      if (undoDrafts.length > 200) undoDrafts.shift();
      redoDrafts.length = 0;
    }
    mutableState.draft = document.text;
    mutableState.draftFontRuns = fontRuns;
    if (fontRuns?.length) mutableState.richTextMode = true;
    mutableState.revision++;
    setSelection(
      mutableState.selection.start,
      mutableState.selection.end,
      mutableState.selection.direction,
    );
  }

  function editedDocument(
    before: DraftSnapshot,
    value: string,
    plainInsertion: boolean,
  ): DraftEdit {
    const { start, end } = before.selection;
    const insertionLength = value.length - before.text.length + end - start;
    if (
      insertionLength >= 0 &&
      value.slice(0, start) === before.text.slice(0, start) &&
      value.slice(start + insertionLength) === before.text.slice(end)
    ) {
      const preservedAffinity =
        !plainInsertion &&
        before.typingFontAffinity?.surface === mutableState.surface &&
        (start === end
          ? before.typingFontAffinity.caret === start
          : insertionLength === 0 &&
            (before.typingFontAffinity.caret === start || before.typingFontAffinity.caret === end))
          ? before.typingFontAffinity
          : undefined;
      const document = replaceCellTextRange(
        before,
        start,
        end,
        value.slice(start, start + insertionLength),
        plainInsertion
          ? undefined
          : preservedAffinity
            ? preservedAffinity.fontFamily
            : getCellTextFontOverride(before, start, start === end ? "backward" : "forward"),
      );
      return {
        ...document,
        ...(preservedAffinity
          ? { typingFontAffinity: { ...preservedAffinity, caret: document.caret } }
          : {}),
      };
    }
    // Non-native callers (formula assistance, replacement dialogs) provide no input range.
    return replaceCellTextByDiff(before, value);
  }

  function applyDraftEdit(document: DraftEdit): void {
    applyDocument(document);
    typingFontAffinity = undefined;
    if (document.typingFontAffinity) {
      setCaret(document.typingFontAffinity.caret);
      typingFontAffinity = {
        ...document.typingFontAffinity,
        caret: mutableState.selection.start,
      };
    }
  }

  function reset(): void {
    mutableState.active = false;
    mutableState.owner = null;
    mutableState.source = "";
    mutableState.draft = "";
    mutableState.sourceFontRuns = undefined;
    mutableState.draftFontRuns = undefined;
    mutableState.richTextMode = false;
    mutableState.asText = false;
    mutableState.generation++;
    mutableState.revision = 0;
    mutableState.surface = "grid";
    mutableState.selection = { start: 0, end: 0, direction: "none" };
    mutableState.composing = false;
    mutableState.mode = "edit";
    compositionStart = undefined;
    pendingInput = undefined;
    typingFontAffinity = undefined;
    undoDrafts.length = 0;
    redoDrafts.length = 0;
    pastedDraft = false;
    nextInputPlain = false;
    pendingInputPlain = false;
    compositionPlain = false;
  }

  function begin(
    context: CellEditContext,
    beginOptions: { surface: CellEditSurface; mode: "append" | "replace"; initialValue?: string },
  ): boolean {
    if (mutableState.active) {
      if (!mutableState.owner || !areTargetsEqual(mutableState.owner, context)) return false;
      if (context.asText !== undefined) mutableState.asText = context.asText;
      activateSurface(beginOptions.surface);
      return true;
    }

    const draft =
      beginOptions.mode === "append" ? context.input : (beginOptions.initialValue ?? "");
    const sourceFontRuns = getInputFontRuns(context.input, context.content);
    mutableState.active = true;
    mutableState.asText = context.asText === true;
    pastedDraft = false;
    mutableState.owner = copyTarget(context);
    mutableState.source = context.input;
    mutableState.draft = draft;
    mutableState.sourceFontRuns = sourceFontRuns;
    mutableState.draftFontRuns =
      beginOptions.mode === "append"
        ? cloneCellTextFontRuns(mutableState.sourceFontRuns)
        : undefined;
    mutableState.richTextMode = Boolean(mutableState.draftFontRuns?.length);
    mutableState.generation++;
    mutableState.revision = 0;
    mutableState.surface = beginOptions.surface;
    mutableState.selection = { start: draft.length, end: draft.length, direction: "none" };
    mutableState.composing = false;
    mutableState.mode = beginOptions.mode === "replace" ? "point" : "edit";
    return true;
  }

  function activateSurface(surface: CellEditSurface): void {
    if (!mutableState.active) return;
    if (surface !== mutableState.surface) typingFontAffinity = undefined;
    mutableState.surface = surface;
  }

  function setDraft(value: string): void {
    if (!mutableState.active) return;
    const before = compositionStart ?? pendingInput ?? snapshot();
    applyDraftEdit(
      editedDocument(
        before,
        value,
        mutableState.composing ? compositionPlain : pendingInputPlain || nextInputPlain,
      ),
    );
    pendingInput = undefined;
    pendingInputPlain = false;
    nextInputPlain = false;
  }

  /** Captured before a native edit; protects repeated text and character-font identities. */
  function prepareInput(start: number, end: number, inputType?: string): void {
    if (!mutableState.active || mutableState.composing) return;
    const backwardDelete =
      inputType === "deleteContentBackward" || inputType === "deleteWordBackward";
    const forwardDelete = inputType === "deleteContentForward" || inputType === "deleteWordForward";
    const nativeRange =
      start !== end &&
      mutableState.selection.start === mutableState.selection.end &&
      typingFontAffinity?.caret === mutableState.selection.start &&
      ((backwardDelete && end === typingFontAffinity.caret) ||
        (forwardDelete && start === typingFontAffinity.caret));
    const affinity =
      typingFontAffinity && ((start === end && typingFontAffinity.caret === start) || nativeRange)
        ? typingFontAffinity
        : undefined;
    let nativeDeletion = Boolean(nativeRange);
    if (start === end) {
      if (inputType === "deleteContentBackward") {
        start = previousBoundary(start);
        nativeDeletion = true;
      } else if (inputType === "deleteContentForward") {
        end = graphemeBoundaries().find((offset) => offset > end) ?? mutableState.draft.length;
        nativeDeletion = true;
      } else if (inputType === "deleteWordBackward") {
        start = wordBoundary(start, "backward");
        nativeDeletion = true;
      } else if (inputType === "deleteWordForward") {
        end = wordBoundary(end, "forward");
        nativeDeletion = true;
      }
    }
    setSelection(start, end);
    if (nativeDeletion && affinity) typingFontAffinity = { ...affinity };
    pendingInput = { ...snapshot(), selection: { ...mutableState.selection } };
    pendingInputPlain = nextInputPlain || inputType === "insertFromPaste";
    nextInputPlain = false;
  }

  function replaceSelection(
    text: string,
    fontFamily?: string,
    replacementOptions: CellTextReplacementOptions = {},
  ): boolean {
    if (!mutableState.active || mutableState.composing) return false;
    return replaceSelectionDocument(
      replaceCellTextRange({ text: "" }, 0, 0, text, fontFamily),
      replacementOptions,
    );
  }

  /** Paste is one draft-history transaction, including inherited gaps and all font intervals. */
  function replaceSelectionDocument(
    document: CellTextDocument,
    replacementOptions: CellTextReplacementOptions = {},
  ): boolean {
    if (!mutableState.active || mutableState.composing) return false;
    const insertedRuns = normalizeCellTextFontRuns(document.text, document.fontRuns);
    // The editor's first apostrophe is a projection token, never part of an existing literal.
    // Inserted payload text, including its own apostrophes, remains real literal content.
    const prefix = replacementOptions.preserveLiteral && mutableState.draft.startsWith("'") ? 1 : 0;
    const before = snapshot();
    const source = prefix ? replaceCellTextRange(before, 0, prefix, "") : before;
    const start = Math.max(0, mutableState.selection.start - prefix);
    const end = Math.max(0, mutableState.selection.end - prefix);
    const result = replaceCellTextRange(source, start, end, document.text);
    let fontRuns = [
      ...(result.fontRuns ?? []),
      ...(insertedRuns ?? []).map((run) => ({
        ...run,
        start: run.start + start,
        end: run.end + start,
      })),
    ].sort((left, right) => left.start - right.start);
    let { text, caret } = result;
    if (replacementOptions.preserveLiteral) {
      const input = formatCellContentForInput({ kind: "literal", value: text });
      const inputPrefix = input.length - text.length;
      fontRuns = fontRuns.map((run) => ({
        ...run,
        start: run.start + inputPrefix,
        end: run.end + inputPrefix,
      }));
      caret += inputPrefix;
      text = input;
    }
    applyDocument({ text, fontRuns });
    setCaret(caret);
    typingFontAffinity = replacementOptions.preserveTypingFont
      ? {
          caret: mutableState.selection.start,
          surface: mutableState.surface,
          fontFamily: before.typingFontAffinity
            ? before.typingFontAffinity.fontFamily
            : getCellTextFontOverride(
                before,
                before.selection.start,
                before.selection.start === before.selection.end ? "backward" : "forward",
              ),
        }
      : undefined;
    pendingInput = undefined;
    pendingInputPlain = false;
    nextInputPlain = false;
    return true;
  }

  function restoreDraft(document: CellTextDocument): void {
    if (!mutableState.active || mutableState.composing) return;
    applyDocument(document);
    typingFontAffinity = undefined;
  }

  function moveDraftHistory(from: DraftSnapshot[], to: DraftSnapshot[]): boolean {
    if (!mutableState.active || mutableState.composing) return false;
    const previous = from.pop();
    if (!previous) return false;
    to.push(snapshot());
    applyDocument(previous, false);
    typingFontAffinity =
      previous.typingFontAffinity?.surface === mutableState.surface
        ? { ...previous.typingFontAffinity }
        : undefined;
    setSelection(previous.selection.start, previous.selection.end, previous.selection.direction);
    pendingInput = undefined;
    return true;
  }
  function undoDraft(): boolean {
    return moveDraftHistory(undoDrafts, redoDrafts);
  }
  function redoDraft(): boolean {
    return moveDraftHistory(redoDrafts, undoDrafts);
  }

  function markPasted(): void {
    if (mutableState.active) {
      pastedDraft = true;
      nextInputPlain = true;
    }
  }

  function setSelection(
    start: number,
    end: number,
    direction: CellEditSelection["direction"] = "none",
  ): void {
    if (!mutableState.active) return;
    let clampedStart = clampSelectionOffset(start, mutableState.draft.length);
    let clampedEnd = clampSelectionOffset(end, mutableState.draft.length);
    if (!isCellTextBoundary(mutableState.draft, clampedStart)) clampedStart--;
    if (!isCellTextBoundary(mutableState.draft, clampedEnd)) clampedEnd++;
    const graphemes = graphemeBoundaries();
    clampedStart = previousBoundary(clampedStart, true);
    clampedEnd = graphemes.find((offset) => offset >= clampedEnd) ?? mutableState.draft.length;
    mutableState.selection = {
      start: Math.min(clampedStart, clampedEnd),
      end: Math.max(clampedStart, clampedEnd),
      direction,
    };
    if (
      typingFontAffinity &&
      (mutableState.selection.start !== typingFontAffinity.caret ||
        mutableState.selection.end !== typingFontAffinity.caret)
    )
      typingFontAffinity = undefined;
  }

  /** A newly joined grapheme must not turn a post-insertion caret into a selection. */
  function setCaret(offset: number, affinity: "forward" | "backward" = "forward"): void {
    if (!mutableState.active) return;
    const clamped = clampSelectionOffset(offset, mutableState.draft.length);
    const caret =
      affinity === "backward"
        ? previousBoundary(clamped, true)
        : (graphemeBoundaries().find((boundary) => boundary >= clamped) ??
          mutableState.draft.length);
    mutableState.selection = { start: caret, end: caret, direction: "none" };
    if (typingFontAffinity?.caret !== caret) typingFontAffinity = undefined;
  }

  function setMode(mode: "edit" | "point"): void {
    if (mutableState.active) mutableState.mode = mode;
  }

  function flush(flushOptions: CellEditFinishOptions & { end?: boolean } = {}): boolean {
    if (!mutableState.active) return true;
    if (mutableState.composing || !mutableState.owner) return false;

    if (flushOptions.complete) {
      if (!mutableState.asText) setDraft(completeFormulaForCommit(mutableState.draft));
      setSelection(
        mutableState.selection.start,
        mutableState.selection.end,
        mutableState.selection.direction,
      );
    }
    if (
      mutableState.draft !== mutableState.source ||
      !areCellTextFontRunsEqual(mutableState.draftFontRuns, mutableState.sourceFontRuns) ||
      flushOptions.confirmPendingWarning
    ) {
      const accepted = options.onCommit({
        ...copyTarget(mutableState.owner),
        input: mutableState.draft,
        ...(mutableState.draftFontRuns?.length
          ? { inputFontRuns: cloneCellTextFontRuns(mutableState.draftFontRuns) }
          : {}),
        ...(pastedDraft ? { inputOrigin: "paste" as const } : {}),
        ...(flushOptions.confirmPendingWarning ? { confirmPendingWarning: true } : {}),
      });
      if (accepted === false) return false;
      mutableState.source = mutableState.draft;
      mutableState.sourceFontRuns = cloneCellTextFontRuns(mutableState.draftFontRuns);
      undoDrafts.length = 0;
      redoDrafts.length = 0;
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
    compositionStart = snapshot();
    compositionPlain = nextInputPlain;
    nextInputPlain = false;
    pendingInput = undefined;
    mutableState.composing = true;
  }

  function endComposition(value: string): void {
    if (!mutableState.active) return;
    const before = compositionStart ?? snapshot();
    const selectionAfter = { ...mutableState.selection };
    const document = editedDocument(before, value, compositionPlain);
    mutableState.composing = false;
    // Intermediate IME input is one undoable edit, including its metadata.
    mutableState.draft = before.text;
    mutableState.draftFontRuns = cloneCellTextFontRuns(before.fontRuns);
    mutableState.selection = { ...before.selection };
    typingFontAffinity = before.typingFontAffinity ? { ...before.typingFontAffinity } : undefined;
    applyDraftEdit(document);
    compositionStart = undefined;
    compositionPlain = false;
    if (!document.typingFontAffinity) {
      if (selectionAfter.start === selectionAfter.end) setCaret(selectionAfter.start);
      else setSelection(selectionAfter.start, selectionAfter.end, selectionAfter.direction);
    }
  }

  function hasPendingEdit(): boolean {
    return (
      mutableState.active &&
      (mutableState.composing ||
        mutableState.draft !== mutableState.source ||
        !areCellTextFontRunsEqual(mutableState.draftFontRuns, mutableState.sourceFontRuns))
    );
  }

  return {
    id,
    state,
    begin,
    activateSurface,
    setDraft,
    prepareInput,
    replaceSelection,
    replaceSelectionDocument,
    restoreDraft,
    undoDraft,
    redoDraft,
    markPasted,
    setSelection,
    setCaret,
    setMode,
    flush,
    finish,
    cancel,
    startComposition,
    endComposition,
    hasPendingEdit,
  };
}
