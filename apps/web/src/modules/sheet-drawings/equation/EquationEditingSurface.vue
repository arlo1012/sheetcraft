<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from "vue";
import "katex/dist/katex.min.css";
import { type EquationDocument } from "@sheetcraft/core/equation-document";
import {
  equationAdjacentSelection,
  equationDocumentKey,
  exitEquationSlot,
  normalizeEquationSelection,
  type EquationDraftAction,
  type EquationSelection,
} from "./equation-draft";
import {
  DEFAULT_EQUATION_EDITOR_LABELS,
  EQUATION_EDITOR_CONTEXT,
  type EquationEditorLabels,
} from "./equation-editor-context";
import EquationEditingSequence from "./EquationEditingSequence.vue";
const props = defineProps<{
  document: EquationDocument;
  selection: EquationSelection;
  ownerId: string;
  sessionId: number;
  disabled?: boolean;
  hidePlaceholders?: boolean;
  labels?: Partial<EquationEditorLabels>;
}>();
const emit = defineEmits<{
  action: [action: EquationDraftAction];
  "selection-change": [selection: EquationSelection];
  "composition-change": [active: boolean];
  history: [direction: "undo" | "redo"];
  "next-slot": [direction: "forward" | "backward"];
  finish: [];
}>();
const root = ref<HTMLElement>();
const ownerKey = computed(() => `${props.sessionId}:${props.ownerId}`);
const selection = computed(() => normalizeEquationSelection(props.document, props.selection));
const labels = computed(() => ({ ...DEFAULT_EQUATION_EDITOR_LABELS, ...props.labels }));
let composing = false;
let navigating = false;
let transaction:
  | { ownerKey: string; documentKey: string; selection: EquationSelection }
  | undefined;
let finishedTransaction: typeof transaction;
let shiftRange:
  | { ownerKey: string; documentKey: string; slotId: string; anchor: number; focus: number }
  | undefined;
function resetShiftRange(): void {
  shiftRange = undefined;
}
function shiftSpanMatches(next: EquationSelection): boolean {
  return (
    !!shiftRange &&
    shiftRange.slotId === next.slotId &&
    Math.min(shiftRange.anchor, shiftRange.focus) === next.start &&
    Math.max(shiftRange.anchor, shiftRange.focus) === next.end
  );
}
function shiftedSelection(
  state: EquationSelection,
  direction: "forward" | "backward",
  nativeDirection: string | null,
): EquationSelection {
  const key = equationDocumentKey(props.document);
  if (
    !shiftRange ||
    shiftRange.ownerKey !== ownerKey.value ||
    shiftRange.documentKey !== key ||
    !shiftSpanMatches(state)
  ) {
    const backward = nativeDirection === "backward";
    shiftRange = {
      ownerKey: ownerKey.value,
      documentKey: key,
      slotId: state.slotId,
      anchor: backward ? state.end : state.start,
      focus: backward ? state.start : state.end,
    };
  }
  const neighbor = equationAdjacentSelection(
    props.document,
    { slotId: state.slotId, start: shiftRange.focus, end: shiftRange.focus },
    direction,
  );
  if (neighbor) shiftRange.focus = direction === "forward" ? neighbor.end : neighbor.start;
  return {
    slotId: state.slotId,
    start: Math.min(shiftRange.anchor, shiftRange.focus),
    end: Math.max(shiftRange.anchor, shiftRange.focus),
  };
}
function select(next: EquationSelection): void {
  if (!props.disabled && !composing && !navigating) {
    const normalized = normalizeEquationSelection(props.document, next);
    if (!shiftSpanMatches(normalized)) resetShiftRange();
    emit("selection-change", normalized);
  }
}
function navigate(next: EquationSelection): void {
  navigating = true;
  emit("selection-change", normalizeEquationSelection(props.document, next));
  void nextTick(() => {
    navigating = false;
  });
}
function composition(active: boolean, captured?: EquationSelection): EquationSelection | undefined {
  if (active) {
    if (props.disabled || !captured) return;
    transaction = {
      ownerKey: ownerKey.value,
      documentKey: equationDocumentKey(props.document),
      selection: normalizeEquationSelection(props.document, captured),
    };
    finishedTransaction = undefined;
  } else {
    finishedTransaction = captured ? transaction : undefined;
    transaction = undefined;
  }
  if (composing !== active) {
    composing = active;
    emit("composition-change", active);
  }
  return transaction?.selection;
}
function action(next: EquationDraftAction): void {
  if (props.disabled || composing) return;
  resetShiftRange();
  const captured = finishedTransaction;
  finishedTransaction = undefined;
  if (
    captured &&
    (captured.ownerKey !== ownerKey.value ||
      captured.documentKey !== equationDocumentKey(props.document) ||
      (next.type === "replace-text" &&
        (next.selection.slotId !== captured.selection.slotId ||
          next.selection.start !== captured.selection.start ||
          next.selection.end !== captured.selection.end)))
  )
    return;
  emit("action", next);
}
provide(EQUATION_EDITOR_CONTEXT, {
  ownerKey,
  selection,
  labels,
  disabled: computed(() => !!props.disabled),
  hidePlaceholders: computed(() => !!props.hidePlaceholders),
  action,
  select,
  composition,
});
watch(ownerKey, () => {
  resetShiftRange();
  navigating = false;
  transaction = undefined;
  finishedTransaction = undefined;
  if (composing) {
    composing = false;
    emit("composition-change", false);
  }
});
function keydown(event: KeyboardEvent): void {
  if (props.disabled || composing || event.isComposing || event.keyCode === 229) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (!event.shiftKey || (event.key !== "ArrowRight" && event.key !== "ArrowLeft"))
    resetShiftRange();
  if (
    modifier &&
    !event.altKey &&
    (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit("history", event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo");
  } else if (
    event.ctrlKey &&
    event.altKey &&
    (event.key === "ArrowRight" || event.key === "ArrowLeft")
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit("next-slot", event.key === "ArrowRight" ? "forward" : "backward");
  } else if (
    !modifier &&
    !event.altKey &&
    (event.key === "ArrowRight" ||
      event.key === "ArrowLeft" ||
      event.key === "Backspace" ||
      event.key === "Delete")
  ) {
    const target = event.target as HTMLInputElement;
    const offset = Number(target.dataset.equationOffset);
    const slotId = target.dataset.equationSlot;
    if (!slotId || !Number.isFinite(offset)) return;
    const native = {
      slotId,
      start: offset + (target.selectionStart ?? 0),
      end: offset + (target.selectionEnd ?? 0),
    };
    const state =
      selection.value.slotId === slotId && selection.value.start !== selection.value.end
        ? selection.value
        : native;
    const direction = event.key === "ArrowRight" || event.key === "Delete" ? "forward" : "backward";
    const arrow = event.key === "ArrowRight" || event.key === "ArrowLeft";
    let next: EquationSelection | undefined;
    if (arrow && event.shiftKey) {
      next = shiftedSelection(state, direction, target.selectionDirection);
    } else if (arrow && state.start !== state.end) {
      const edge = direction === "forward" ? state.end : state.start;
      next = { slotId, start: edge, end: edge };
    } else {
      const edge =
        direction === "forward"
          ? target.selectionEnd === target.value.length
          : target.selectionStart === 0;
      if (!edge && state.start === state.end) return;
      if (arrow) next = exitEquationSlot(props.document, state, direction);
      if (!next) {
        next = equationAdjacentSelection(props.document, state, direction);
        if (next && arrow) {
          const edge = direction === "forward" ? next.end : next.start;
          next = { slotId, start: edge, end: edge };
        }
      }
    }
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      if (arrow) navigate(next);
      else action({ type: "replace-text", selection: next, text: "" });
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    emit("finish");
  }
}
function focus(): void {
  if (props.disabled || composing || !root.value) return;
  const state = selection.value;
  const inputs = Array.from(root.value.querySelectorAll<HTMLInputElement>("input"));
  const matches = inputs.filter((input) => {
    const offset = Number(input.dataset.equationOffset);
    return (
      input.dataset.equationSlot === state.slotId &&
      Number.isFinite(offset) &&
      state.start >= offset &&
      state.end <= offset + input.value.length
    );
  });
  const active = inputs.find((input) => input === document.activeElement);
  const target =
    matches.find((input) => input === active) ??
    matches.at(-1) ??
    (active?.dataset.equationSlot === state.slotId ? active : undefined);
  if (!target) return;
  if (matches.includes(target)) {
    const offset = Number(target.dataset.equationOffset);
    if (
      target.selectionStart !== state.start - offset ||
      target.selectionEnd !== state.end - offset
    )
      target.setSelectionRange(state.start - offset, state.end - offset);
  }
  target.focus({ preventScroll: true });
}
defineExpose({ focus });
</script>
<template>
  <div
    ref="root"
    class="equation-editing-surface"
    role="group"
    :aria-label="labels.equation"
    :data-equation-owner="ownerId"
    :data-equation-session="sessionId"
    @keydown="keydown"
    @pointerdown.capture="resetShiftRange"
    @pointerdown.stop
    @click.stop
    @dblclick.stop
  >
    <EquationEditingSequence :key="ownerKey" :sequence="document.body" :label="labels.equation" />
  </div>
</template>
<style scoped>
.equation-editing-surface {
  display: inline-flex;
  align-items: center;
  min-width: 1em;
  min-height: 1.3em;
  padding: 0.14em 0.22em;
  color: inherit;
  font-family: KaTeX_Main, serif;
  font-size: inherit;
  line-height: 1.3;
  white-space: nowrap;
  cursor: text;
  user-select: text;
}
</style>
