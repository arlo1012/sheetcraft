<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  getShapeTextCharacterSegments,
  normalizeShapeTextCharacterFormat,
  type ShapeTextCharacterFormat,
  type ShapeTextCharacterSource,
} from "@sheetcraft/core/shape-text-character-runs";
import {
  readTextDomSelection,
  readTextInputTargetRange,
  writeTextDomSelection,
  type TextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";
import {
  cloneShapeRichTextSnapshot,
  normalizeShapeRichTextSelection,
  reconcileShapeRichTextComposition,
  replaceShapeRichTextSelection,
  shapeRichTextDeletionRange,
  shapeRichTextSnapshotsEqual,
  shapeRichTextSourcesEqual,
  ShapeRichTextInputHistory,
  type ShapeRichTextSnapshot,
} from "../shape-rich-text-input-model";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { shapeRichTextSourceStyle } from "../shape-rich-text-source-style";

const props = defineProps<{
  sessionId: number;
  source: ShapeTextCharacterSource;
  baseFormat: ShapeTextCharacterFormat;
  theme?: WorkbookTheme;
  scale?: number;
  pendingFormat?: ShapeTextCharacterFormat;
  selection?: Pick<TextDomSelection, "start" | "end"> &
    Partial<Pick<TextDomSelection, "direction">>;
  readOnly?: boolean;
  ariaLabel: string;
  update: (snapshot: ShapeRichTextSnapshot) => boolean;
  composition: (active: boolean) => boolean;
}>();
const emit = defineEmits<{
  selection: [snapshot: { selection: TextDomSelection; pendingFormat?: ShapeTextCharacterFormat }];
  error: [message: string | undefined];
  preview: [differs: boolean];
  clipboardCopy: [];
}>();
const root = ref<HTMLElement>();
const failure = ref<string>();
const composing = ref(false);
const sourceRevision = ref(0);
let disposed = false;
let history = new ShapeRichTextInputHistory(initialSnapshot());
let state = history.current;
let published = cloneShapeRichTextSnapshot(state);
let lastSelection = cloneShapeRichTextSnapshot(state);
let propSourceKey = JSON.stringify(props.source);
let propSelectionKey = JSON.stringify(props.selection);
let propPendingKey = JSON.stringify(props.pendingFormat);
let finalInput: { text: string; data: string } | undefined;
let clipboardMutation: "paste" | "cut" | undefined;
let transaction:
  | {
      snapshot: ShapeRichTextSnapshot;
      sessionId: number;
      source: ShapeTextCharacterSource;
      revision: number;
      update: typeof props.update;
      composition: typeof props.composition;
      targetCaptured: boolean;
    }
  | undefined;

function initialSnapshot(): ShapeRichTextSnapshot {
  return cloneShapeRichTextSnapshot({
    source: props.source,
    selection: props.selection
      ? { ...props.selection, direction: props.selection.direction ?? "none" }
      : { start: props.source.text.length, end: props.source.text.length, direction: "none" },
    ...(props.pendingFormat !== undefined ? { pendingFormat: props.pendingFormat } : {}),
  });
}
function setFailure(message?: string): void {
  if (failure.value === message) return;
  failure.value = message;
  emit("error", message);
}
function report(error: unknown): void {
  setFailure(
    error instanceof Error
      ? error.message
      : "The change could not be applied. Your text has been kept.",
  );
}
function notifySelection(): void {
  if (shapeRichTextSnapshotsEqual(lastSelection, state)) return;
  lastSelection = cloneShapeRichTextSnapshot(state);
  propSourceKey = JSON.stringify(props.source);
  propSelectionKey = JSON.stringify(props.selection);
  propPendingKey = JSON.stringify(props.pendingFormat);
  emit("selection", {
    selection: { ...state.selection },
    ...(state.pendingFormat !== undefined
      ? { pendingFormat: normalizeShapeTextCharacterFormat(state.pendingFormat) }
      : {}),
  });
}
function captureSelection(): TextDomSelection {
  const selection = root.value ? readTextDomSelection(root.value) : undefined;
  if (selection && !composing.value) {
    const next = normalizeShapeRichTextSelection(state.source.text, selection);
    const moved =
      next.start !== state.selection.start ||
      next.end !== state.selection.end ||
      next.direction !== state.selection.direction;
    state.selection = next;
    if (moved) delete state.pendingFormat;
    history.captureSelection(state.selection, moved);
    notifySelection();
  }
  return { ...state.selection };
}
function render(restoreSelection = true): void {
  const element = root.value;
  if (!element || composing.value || disposed) return;
  const ownerDocument = element.ownerDocument;
  const content = ownerDocument.createDocumentFragment();
  let previewDiffers = false;
  for (const run of getShapeTextCharacterSegments(state.source, props.baseFormat)) {
    const span = ownerDocument.createElement("span");
    if (run.fontFamily) span.style.fontFamily = run.fontFamily;
    if (run.fontSize && props.baseFormat.fontSize)
      span.style.fontSize = `${run.fontSize / props.baseFormat.fontSize}em`;
    span.style.fontWeight = run.bold ? "700" : "400";
    span.style.fontStyle = run.italic ? "italic" : "normal";
    span.style.textDecoration =
      [run.underline ? "underline" : "", run.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ") || "none";
    const appearance = shapeRichTextSourceStyle(run, props.theme, props.scale);
    for (const [property, value] of Object.entries(appearance.style))
      if (value !== undefined)
        span.style.setProperty(
          property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
          String(value),
        );
    previewDiffers ||= appearance.previewDiffers;
    span.dataset.shapeTextSourcePreview = appearance.previewDiffers ? "approximate" : "solid";
    span.appendChild(ownerDocument.createTextNode(state.source.text.slice(run.start, run.end)));
    content.appendChild(span);
  }
  // A real empty text node supports a zero-length caret without persistent runs.
  if (!content.childNodes.length) content.appendChild(ownerDocument.createTextNode(""));
  element.replaceChildren(content);
  emit("preview", previewDiffers);
  if (restoreSelection && ownerDocument.activeElement === element)
    writeTextDomSelection(element, state.selection);
}
function focus(selection?: typeof props.selection): void {
  const element = root.value;
  if (!element || disposed) return;
  if (selection) {
    state.selection = normalizeShapeRichTextSelection(state.source.text, selection);
    history.captureSelection(state.selection);
  }
  element.focus({ preventScroll: true });
  if (!composing.value) writeTextDomSelection(element, state.selection);
}
function publish(update: typeof props.update): boolean {
  const snapshot = cloneShapeRichTextSnapshot(state);
  try {
    if (!update(snapshot)) {
      setFailure("The change could not be applied. Your text and formatting have been kept.");
      return false;
    }
    published = cloneShapeRichTextSnapshot(state);
    setFailure();
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}
function accept(next: ShapeRichTextSnapshot, update: typeof props.update): boolean {
  state = cloneShapeRichTextSnapshot(next);
  history.record(state);
  const success = publish(update);
  render();
  notifySelection();
  return success;
}
function flush(): boolean {
  if (disposed || composing.value || props.readOnly) return false;
  captureSelection();
  if (shapeRichTextSnapshotsEqual(state, published) && !failure.value) return true;
  return publish(props.update);
}

function reset(): void {
  // No callback is sent to the new owner for the old composition.
  transaction = undefined;
  composing.value = false;
  finalInput = undefined;
  clipboardMutation = undefined;
  state = initialSnapshot();
  history = new ShapeRichTextInputHistory(state);
  published = cloneShapeRichTextSnapshot(state);
  lastSelection = cloneShapeRichTextSnapshot(state);
  sourceRevision.value++;
  setFailure();
  const sessionId = props.sessionId;
  void nextTick(() => {
    if (disposed || sessionId !== props.sessionId) return;
    render(false);
    focus();
  });
}
watch(() => props.sessionId, reset, { flush: "sync" });
watch(
  () =>
    [
      props.source,
      props.selection,
      props.pendingFormat,
      props.baseFormat,
      props.theme,
      props.scale,
    ] as const,
  () => {
    const sourceKey = JSON.stringify(props.source);
    const selectionKey = JSON.stringify(props.selection);
    const pendingKey = JSON.stringify(props.pendingFormat);
    const sourceChanged = sourceKey !== propSourceKey;
    const selectionChanged = selectionKey !== propSelectionKey;
    const pendingChanged = pendingKey !== propPendingKey;
    if (sourceChanged) sourceRevision.value++;
    propSourceKey = sourceKey;
    propSelectionKey = selectionKey;
    propPendingKey = pendingKey;
    if (composing.value) return;
    try {
      const incoming = initialSnapshot();
      // A rejected complete draft remains copyable even when the owner echoes
      // its last accepted source or unrelated attributes rerender the parent.
      if (failure.value) {
        render();
        return;
      }
      if (sourceChanged || pendingChanged) {
        const source = sourceChanged ? incoming.source : state.source;
        const pendingFormat = pendingChanged ? incoming.pendingFormat : state.pendingFormat;
        state = cloneShapeRichTextSnapshot({
          source,
          selection: selectionChanged && props.selection ? incoming.selection : state.selection,
          ...(pendingFormat !== undefined ? { pendingFormat } : {}),
        });
        history.record(state);
        published = cloneShapeRichTextSnapshot(state);
      } else if (selectionChanged && props.selection) {
        state.selection = normalizeShapeRichTextSelection(state.source.text, incoming.selection);
        history.captureSelection(state.selection);
      }
      render();
    } catch (error) {
      report(error);
    }
  },
  { deep: true },
);
onMounted(reset);
onBeforeUnmount(() => {
  disposed = true;
  transaction = undefined;
});

// Each direct v-on function captures its exact session, source revision and
// callbacks. A saved listener from an old source or detached root is inert.
const events = computed(() => {
  const sessionId = props.sessionId,
    source = props.source,
    revision = sourceRevision.value;
  const update = props.update,
    composition = props.composition;
  const current = () =>
    !disposed &&
    sessionId === props.sessionId &&
    source === props.source &&
    revision === sourceRevision.value &&
    update === props.update &&
    composition === props.composition;
  const owns = (event: Event) =>
    current() && !!root.value && event.target instanceof Node && root.value.contains(event.target);
  const stop = (event: Event) => event.stopPropagation();
  const range = (event?: InputEvent): TextDomSelection => {
    const selection = event && root.value ? readTextInputTargetRange(root.value, event) : undefined;
    if (selection) return normalizeShapeRichTextSelection(state.source.text, selection);
    return captureSelection();
  };
  const replace = (selection: TextDomSelection, text: string): boolean => {
    if (!current() || props.readOnly) return false;
    const moved =
      selection.start !== state.selection.start || selection.end !== state.selection.end;
    if (moved) delete state.pendingFormat;
    history.captureSelection(selection, moved);
    state.selection = selection;
    try {
      return accept(replaceShapeRichTextSelection(state, selection, text), update);
    } catch (error) {
      report(error);
      render();
      return false;
    }
  };
  const historyStep = (direction: "undo" | "redo") => {
    if (!current() || props.readOnly || composing.value) return;
    captureSelection();
    const next = history.step(direction);
    if (!next) return;
    state = next;
    publish(update);
    render();
    notifySelection();
  };
  const beforeinput = (event: InputEvent) => {
    stop(event);
    if (!owns(event)) {
      event.preventDefault();
      return;
    }
    if (props.readOnly) {
      event.preventDefault();
      return;
    }
    const targets = event.getTargetRanges?.();
    if (targets?.length && (!root.value || !readTextInputTargetRange(root.value, event))) {
      event.preventDefault();
      return;
    }
    if (
      composing.value &&
      transaction &&
      (event.isComposing || event.inputType.includes("Composition"))
    ) {
      if (
        !transaction.targetCaptured &&
        root.value &&
        root.value.textContent === transaction.snapshot.source.text
      ) {
        const target = readTextInputTargetRange(root.value, event);
        if (target) {
          const next = normalizeShapeRichTextSelection(transaction.snapshot.source.text, target);
          const previous = transaction.snapshot.selection;
          const moved = next.start !== previous.start || next.end !== previous.end;
          transaction.snapshot.selection = next;
          if (moved) delete transaction.snapshot.pendingFormat;
          history.captureSelection(next, moved);
        }
        transaction.targetCaptured = true;
      }
      return;
    }
    event.preventDefault();
    if (composing.value) return;
    if (
      (event.inputType === "insertFromPaste" && clipboardMutation === "paste") ||
      (event.inputType === "deleteByCut" && clipboardMutation === "cut")
    ) {
      clipboardMutation = undefined;
      render();
      return;
    }
    clipboardMutation = undefined;
    if (
      finalInput &&
      (event.inputType === "insertFromComposition" ||
        (event.inputType === "insertText" && event.data === finalInput.data))
    ) {
      finalInput = undefined;
      render();
      return;
    }
    finalInput = undefined;
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      historyStep(event.inputType === "historyUndo" ? "undo" : "redo");
      return;
    }
    const selection = range(event);
    if (event.inputType.startsWith("delete") && event.inputType !== "deleteByDrag") {
      replace(shapeRichTextDeletionRange(state.source.text, selection, event.inputType), "");
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      replace(selection, "\n");
    } else if (event.inputType === "insertText" || event.inputType === "insertReplacementText") {
      if (event.data !== null) replace(selection, event.data);
    } else if (event.inputType === "insertFromPaste") {
      const text = event.dataTransfer?.getData("text/plain");
      if (text !== undefined && text !== "") replace(selection, text.replace(/\r\n?/g, "\n"));
    }
    // All other native mutations, HTML, formatting, and drop are blocked.
  };
  return {
    beforeinput,
    input: (event: InputEvent) => {
      stop(event);
      if (!owns(event) || composing.value) return;
      clipboardMutation = undefined;
      if (finalInput && root.value?.textContent === finalInput.text) {
        finalInput = undefined;
        render();
        return;
      }
      finalInput = undefined;
      // Unexpected/native non-IME mutations are rejected, never reparsed as
      // markup or imported into the authoritative character source.
      render();
    },
    compositionstart: (event: CompositionEvent) => {
      stop(event);
      if (!owns(event) || props.readOnly || composing.value) return;
      captureSelection();
      finalInput = undefined;
      try {
        if (!composition(true)) {
          setFailure("Composition could not be started.");
          return;
        }
      } catch (error) {
        report(error);
        return;
      }
      transaction = {
        snapshot: cloneShapeRichTextSnapshot(state),
        sessionId,
        source,
        revision,
        update,
        composition,
        targetCaptured: false,
      };
      composing.value = true;
    },
    compositionend: (event: CompositionEvent) => {
      stop(event);
      const captured = transaction;
      if (!owns(event) || !captured || captured.sessionId !== props.sessionId) return;
      const text =
        event.data === "" ? captured.snapshot.source.text : (root.value?.textContent ?? "");
      transaction = undefined;
      composing.value = false;
      try {
        const next = reconcileShapeRichTextComposition(captured.snapshot, text);
        if (
          props.readOnly ||
          !shapeRichTextSourcesEqual(captured.snapshot.source, props.source) ||
          captured.revision !== sourceRevision.value ||
          captured.update !== props.update ||
          captured.composition !== props.composition
        ) {
          state = next;
          history.record(state);
          setFailure(
            "The editing source changed during composition. Your text and formatting have been kept.",
          );
        } else if (!shapeRichTextSourcesEqual(next.source, captured.snapshot.source)) {
          accept(next, captured.update);
        } else state = cloneShapeRichTextSnapshot(captured.snapshot);
        finalInput = { text: state.source.text, data: event.data };
      } catch (error) {
        report(error);
      }
      try {
        if (!captured.composition(false))
          setFailure("Composition could not be applied. Your text and formatting have been kept.");
      } catch (error) {
        report(error);
      }
      render();
      notifySelection();
    },
    paste: (event: ClipboardEvent) => {
      stop(event);
      event.preventDefault();
      if (!owns(event) || props.readOnly || composing.value) return;
      finalInput = undefined;
      const text = event.clipboardData?.getData("text/plain");
      if (text !== undefined && text !== "") {
        replace(range(), text.replace(/\r\n?/g, "\n"));
        clipboardMutation = "paste";
      }
    },
    copy: (event: ClipboardEvent) => {
      stop(event);
      if (!owns(event) || !event.clipboardData) return;
      const selection = captureSelection();
      event.clipboardData.setData(
        "text/plain",
        state.source.text.slice(selection.start, selection.end),
      );
      event.preventDefault();
      if (selection.start !== selection.end) emit("clipboardCopy");
    },
    cut: (event: ClipboardEvent) => {
      stop(event);
      event.preventDefault();
      if (!owns(event) || !event.clipboardData || composing.value) return;
      const selection = captureSelection();
      event.clipboardData.setData(
        "text/plain",
        state.source.text.slice(selection.start, selection.end),
      );
      if (selection.start !== selection.end) emit("clipboardCopy");
      if (!props.readOnly && selection.start !== selection.end) {
        replace(selection, "");
        clipboardMutation = "cut";
      }
    },
    dragstart: (event: DragEvent) => {
      stop(event);
      event.preventDefault();
    },
    dragover: (event: DragEvent) => {
      stop(event);
      event.preventDefault();
    },
    drop: (event: DragEvent) => {
      stop(event);
      event.preventDefault();
      if (owns(event)) render();
    },
    keydown: (event: KeyboardEvent) => {
      if (!owns(event)) return;
      finalInput = undefined;
      clipboardMutation = undefined;
      if (composing.value || event.isComposing || event.keyCode === 229) {
        stop(event);
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
        stop(event);
        event.preventDefault();
        historyStep(key === "y" || event.shiftKey ? "redo" : "undo");
      }
      // The owning canvas frame handles Escape, apply, and workbook shielding.
    },
    keyup: (event: KeyboardEvent) => {
      if (owns(event)) captureSelection();
    },
    pointerdown: (event: PointerEvent) => {
      if (owns(event)) {
        finalInput = undefined;
        clipboardMutation = undefined;
      }
    },
    pointerup: (event: PointerEvent) => {
      if (owns(event)) captureSelection();
    },
    select: (event: Event) => {
      if (owns(event)) captureSelection();
    },
    focusout: (event: FocusEvent) => {
      if (owns(event)) captureSelection();
    },
  };
});

defineExpose({ rootElement: root, focus, captureSelection, flush, failure });
</script>

<template>
  <div
    :key="sessionId"
    ref="root"
    v-on="events"
    class="shape-rich-text-input"
    :contenteditable="readOnly ? 'false' : 'true'"
    :aria-label="ariaLabel"
    :aria-readonly="readOnly || undefined"
    :aria-invalid="failure ? true : undefined"
    :data-shape-rich-text-error="failure"
    :data-shape-text-edit-session="sessionId"
    data-shape-rich-text-input
    role="textbox"
    aria-multiline="true"
    :spellcheck="false"
    tabindex="0"
  />
</template>

<style scoped>
.shape-rich-text-input {
  min-width: 0;
  white-space: pre-wrap;
  outline: none;
}
</style>
