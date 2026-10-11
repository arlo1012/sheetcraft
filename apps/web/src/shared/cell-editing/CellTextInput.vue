<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import type { CellTextFontRun } from "@sheetcraft/core/formula";
import { getCellTextFontSegments } from "@sheetcraft/core/text-font-runs";
import { ensureCellFontResource } from "../cell-text/font-resources";
import type { CellEditSession, CellEditSurface } from "./useCellEditSession";
import {
  readCellTextClipboard,
  sliceCellTextClipboardDocument,
  writeCellTextClipboard,
} from "./cell-text-clipboard";
import {
  readTextDomSelection,
  readTextInputTargetRange,
  textDomOffset,
  writeTextDomSelection,
  type TextDomSelection,
} from "./text-dom-selection";

const props = defineProps<{
  modelValue: string;
  fontRuns?: readonly CellTextFontRun[];
  editSession: CellEditSession;
  surface: CellEditSurface;
  label: string;
  readOnly?: boolean;
  wrap?: boolean;
  placeholder?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  keydown: [event: KeyboardEvent];
  compositionStart: [event: CompositionEvent];
  compositionEnd: [value: string, event: CompositionEvent];
  fontError: [family: string];
}>();
const root = ref<HTMLDivElement>();
let composing = false;
let renderedText: string | undefined;
let renderedFonts = "";
let pendingHistory: "undo" | "redo" | undefined;
let pendingCutRestore = false;

function editable(): boolean {
  return (
    !props.readOnly &&
    props.editSession.state.active &&
    props.editSession.state.surface === props.surface
  );
}

function captureSelection(): void {
  if (!root.value || !editable()) return;
  const selected = readTextDomSelection(root.value);
  if (selected) {
    if (selected.start === selected.end) props.editSession.setCaret(selected.start);
    else props.editSession.setSelection(selected.start, selected.end, selected.direction);
  }
}

function render(): void {
  const element = root.value;
  if (!element || composing) return;
  const fonts = JSON.stringify(props.fontRuns ?? []);
  if (renderedText === props.modelValue && renderedFonts === fonts) return;
  const focused = element.ownerDocument.activeElement === element;
  const nodes = getCellTextFontSegments({ text: props.modelValue, fontRuns: props.fontRuns }).map(
    (segment) => {
      if (!segment.fontFamily) return element.ownerDocument.createTextNode(segment.text);
      const span = element.ownerDocument.createElement("span");
      span.style.fontFamily = JSON.stringify(segment.fontFamily);
      span.textContent = segment.text;
      void ensureCellFontResource(segment.fontFamily).catch(() =>
        emit("fontError", segment.fontFamily!),
      );
      return span;
    },
  );
  // No HTML from a cell, clipboard, or custom symbol is ever interpreted.
  element.replaceChildren(...nodes);
  renderedText = props.modelValue;
  renderedFonts = fonts;
  if (focused && editable()) writeTextDomSelection(element, props.editSession.state.selection);
}

watch(
  () => [props.modelValue, props.fontRuns, props.readOnly],
  () => void nextTick(render),
  { deep: true },
);
onMounted(render);

function focus(
  options: { selectAll?: boolean; selection?: TextDomSelection; clientX?: number } = {},
): void {
  const element = root.value;
  if (!element) return;
  element.focus({ preventScroll: true });
  render();
  if (options.selectAll) {
    props.editSession.setSelection(0, props.modelValue.length);
    writeTextDomSelection(element, props.editSession.state.selection);
  } else if (options.clientX === undefined) {
    writeTextDomSelection(element, options.selection ?? props.editSession.state.selection);
  } else {
    const rect = element.getBoundingClientRect();
    const y =
      rect.top +
      Math.min(rect.height / 2, parseFloat(getComputedStyle(element).lineHeight) / 2 || 8);
    const doc = element.ownerDocument as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    const position = doc.caretPositionFromPoint?.(options.clientX, y);
    const range = !position && doc.caretRangeFromPoint?.(options.clientX, y);
    const node = position?.offsetNode ?? (range ? range.startContainer : undefined);
    const point = position?.offset ?? (range ? range.startOffset : 0);
    const offset = node ? textDomOffset(element, node, point) : undefined;
    if (offset !== undefined) {
      props.editSession.setCaret(offset);
      writeTextDomSelection(element, props.editSession.state.selection);
    }
  }
}

function applyText(text: string, start: number, end: number, inputType?: string): void {
  if (!editable()) return;
  props.editSession.prepareInput(start, end, inputType);
  const range = props.editSession.state.selection;
  const draft = props.editSession.state.draft;
  const value = draft.slice(0, range.start) + text + draft.slice(range.end);
  emit("update:modelValue", value);
  props.editSession.setCaret(range.start + text.length);
  void nextTick(() => {
    render();
    focus();
  });
}

function insertLineBreak(): void {
  captureSelection();
  const { start, end } = props.editSession.state.selection;
  applyText("\n", start, end, "insertLineBreak");
}

function history(redo: boolean): void {
  if (!editable() || composing) return;
  if (redo) props.editSession.redoDraft();
  else props.editSession.undoDraft();
  void nextTick(() => {
    render();
    focus();
  });
}

function onBeforeInput(event: InputEvent): void {
  if (!editable()) {
    event.preventDefault();
    return;
  }
  captureSelection();
  if (event.isComposing || composing) return;
  // Deletion is owned by the cut handler, after successful clipboard writes.
  pendingCutRestore = event.inputType === "deleteByCut" && !event.cancelable;
  if (event.inputType === "deleteByCut") {
    event.preventDefault();
    return;
  }
  const targetRange = root.value && readTextInputTargetRange(root.value, event);
  // Keep the live caret until prepareInput sees an automatic native deletion range.
  // Setting it as a user selection first would discard Symbol's restored typing font.
  const { start, end } = targetRange ?? props.editSession.state.selection;
  if (!event.cancelable) {
    props.editSession.prepareInput(start, end, event.inputType);
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo")
      pendingHistory = event.inputType === "historyUndo" ? "undo" : "redo";
    return;
  }
  if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
    event.preventDefault();
    history(event.inputType === "historyRedo");
    return;
  }
  if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
    event.preventDefault();
    applyText("\n", start, end, "insertLineBreak");
  } else if (event.inputType.startsWith("insert") && event.data !== null) {
    event.preventDefault();
    applyText(event.data, start, end, event.inputType);
  } else if (
    [
      "deleteContentBackward",
      "deleteContentForward",
      "deleteWordBackward",
      "deleteWordForward",
    ].includes(event.inputType)
  ) {
    event.preventDefault();
    applyText("", start, end, event.inputType);
  } else if (event.inputType.startsWith("format") || event.inputType === "insertFromDrop") {
    event.preventDefault();
  } else props.editSession.prepareInput(start, end, event.inputType);
}

function onInput(): void {
  if (!editable() || !root.value) return;
  renderedText = undefined;
  if (pendingCutRestore) {
    pendingCutRestore = false;
    void nextTick(render);
    return;
  }
  if (pendingHistory) {
    const redo = pendingHistory === "redo";
    pendingHistory = undefined;
    history(redo);
    return;
  }
  emit("update:modelValue", root.value.textContent ?? "");
  captureSelection();
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault();
  if (!editable() || composing || props.editSession.state.composing) return;
  const document = readCellTextClipboard(event.clipboardData);
  if (!document) return;
  captureSelection();
  props.editSession.markPasted();
  if (
    !props.editSession.replaceSelectionDocument(document, {
      preserveLiteral:
        Boolean(document.fontRuns?.length) && !props.editSession.state.draft.startsWith("="),
    })
  )
    return;
  emit("update:modelValue", props.editSession.state.draft);
  void nextTick(() => {
    render();
    focus();
  });
}

function onCopy(event: ClipboardEvent, cut = false): void {
  const element = root.value;
  const selection = element && readTextDomSelection(element);
  if (!selection || selection.start === selection.end) return;
  event.preventDefault();
  if (composing || props.editSession.state.composing) return;
  const document = sliceCellTextClipboardDocument(
    { text: props.modelValue, fontRuns: props.fontRuns },
    selection.start,
    selection.end,
  );
  if (!writeCellTextClipboard(event.clipboardData, document)) return;
  if (cut && editable()) applyText("", document.start, document.end, "deleteByCut");
}

function onKeydown(event: KeyboardEvent): void {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.isComposing &&
    (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
  ) {
    event.preventDefault();
    event.stopPropagation();
    history(event.key.toLowerCase() === "y" || event.shiftKey);
    return;
  }
  emit("keydown", event);
}

function onCompositionStart(event: CompositionEvent): void {
  captureSelection();
  pendingCutRestore = false;
  composing = true;
  emit("compositionStart", event);
}
function onCompositionEnd(event: CompositionEvent): void {
  const value = root.value?.textContent ?? props.modelValue;
  const selection = root.value && readTextDomSelection(root.value);
  composing = false;
  renderedText = undefined;
  emit("compositionEnd", value, event);
  if (selection) {
    if (selection.start === selection.end) props.editSession.setCaret(selection.start);
    else props.editSession.setSelection(selection.start, selection.end, selection.direction);
  }
  void nextTick(() => {
    render();
    captureSelection();
  });
}

defineExpose({
  focus,
  insertLineBreak,
  get element() {
    return root.value;
  },
});
</script>

<template>
  <div
    ref="root"
    class="cell-text-input"
    :class="{ 'is-wrapped': wrap, 'is-readonly': readOnly }"
    :contenteditable="readOnly ? 'false' : 'plaintext-only'"
    role="textbox"
    :aria-label="label"
    :aria-readonly="readOnly || undefined"
    aria-multiline="true"
    :data-cell-edit-session="editSession.id"
    :data-cell-edit-surface="surface"
    :data-placeholder="placeholder"
    spellcheck="false"
    @beforeinput="onBeforeInput"
    @input="onInput"
    @focus="emit('focus', $event)"
    @blur="
      captureSelection();
      emit('blur', $event);
    "
    @keydown="onKeydown"
    @keyup="captureSelection"
    @mouseup="captureSelection"
    @mousedown.stop
    @dblclick.stop
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
    @paste="onPaste"
    @copy="onCopy($event)"
    @cut="onCopy($event, true)"
    @drop.prevent
  />
</template>

<style scoped lang="scss">
.cell-text-input {
  min-width: 0;
  min-height: 1.25em;
  overflow: auto;
  outline: none;
  white-space: pre;
  overflow-wrap: normal;
  cursor: text;
  caret-color: currentcolor;
  &.is-wrapped {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &:empty::before {
    color: var(--sheetcraft-text-muted);
    content: attr(data-placeholder);
    pointer-events: none;
  }
}
</style>
