<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EQUATION_EDITOR_CONTEXT } from "./equation-editor-context";
import { equationTextDifference, type EquationSelection } from "./equation-draft";

const props = defineProps<{
  slotId: string;
  offset: number;
  value: string;
  label: string;
  normal?: boolean;
  boundary?: boolean;
  textMode?: "math" | "normal";
}>();
const editor = inject(EQUATION_EDITOR_CONTEXT)!;
const ownerKey = editor.ownerKey.value;
const input = ref<HTMLInputElement>();
const draft = ref(props.value);
const composing = ref(false);
let disposed = false;
let compositionSelection: EquationSelection | undefined;
let compositionOriginal = "";
let finalValue: string | undefined;
let displayedValue = props.value;
function active(): boolean {
  return !disposed && ownerKey === editor.ownerKey.value && !editor.disabled.value;
}
const selected = computed(
  () =>
    editor.selection.value.slotId === props.slotId &&
    editor.selection.value.start >= props.offset &&
    editor.selection.value.end <= props.offset + props.value.length,
);
const width = computed(
  () => `${Math.max(props.boundary ? 0.3 : 0.75, Array.from(draft.value).length * 0.62 + 0.3)}em`,
);
function selection(): EquationSelection {
  const start = input.value?.selectionStart ?? 0,
    end = input.value?.selectionEnd ?? start;
  return { slotId: props.slotId, start: props.offset + start, end: props.offset + end };
}
function structuralRange(): EquationSelection | undefined {
  const state = editor.selection.value;
  return state.slotId === props.slotId &&
    state.start !== state.end &&
    (state.start < props.offset || state.end > props.offset + props.value.length)
    ? state
    : undefined;
}
function reportSelection(force = false): void {
  if (force) finalValue = undefined;
  if (
    active() &&
    !composing.value &&
    (force || document.activeElement === input.value) &&
    (force || !structuralRange())
  )
    editor.select(selection());
}
function syncSelection(): void {
  if (!active() || !selected.value || composing.value || !input.value) return;
  const state = editor.selection.value;
  const start = Math.max(0, state.start - props.offset),
    end = Math.max(0, state.end - props.offset);
  if (input.value.selectionStart !== start || input.value.selectionEnd !== end)
    input.value.setSelectionRange(start, end);
  input.value.focus({ preventScroll: true });
}
watch(
  () => props.value,
  (value) => {
    if (composing.value) return;
    displayedValue = value;
    draft.value = value;
    void nextTick(syncSelection);
  },
);
watch(
  () => editor.selection.value,
  () => {
    void nextTick(syncSelection);
  },
  { deep: true },
);
watch(
  () => editor.disabled.value,
  (disabled) => {
    if (disabled && composing.value) cancelComposition();
  },
);
onMounted(syncSelection);
onBeforeUnmount(() => {
  disposed = true;
  cancelComposition();
});
function cancelComposition(): void {
  const value = input.value?.value;
  if (composing.value && value !== props.value) finalValue = value;
  if (composing.value && ownerKey === editor.ownerKey.value) editor.composition(false);
  composing.value = false;
  compositionSelection = undefined;
  displayedValue = props.value;
  draft.value = props.value;
}
function reconcile(): void {
  void nextTick(() => {
    if (!active() || composing.value) return;
    displayedValue = props.value;
    draft.value = props.value;
    if (input.value) input.value.value = props.value;
    syncSelection();
  });
}
function onInput(event: Event): void {
  if (!active()) return;
  const value = (event.target as HTMLInputElement).value;
  draft.value = value;
  if (composing.value || (event as InputEvent).isComposing) return;
  if (finalValue === value) {
    reconcile();
    return;
  }
  finalValue = undefined;
  const diff = equationTextDifference(displayedValue, value);
  displayedValue = value;
  if (diff.start === diff.end && !diff.text) {
    reportSelection();
    return;
  }
  editor.action({
    type: "replace-text",
    selection: structuralRange() ?? {
      slotId: props.slotId,
      start: props.offset + diff.start,
      end: props.offset + diff.end,
    },
    text: diff.text,
    ...(props.textMode ? { mode: props.textMode } : {}),
  });
  reconcile();
}
function startComposition(): void {
  if (!active()) return;
  finalValue = undefined;
  composing.value = true;
  compositionOriginal = displayedValue;
  const captured = structuralRange() ?? selection();
  compositionSelection = editor.composition(true, captured) ?? captured;
}
function beginNativeKey(): void {
  if (!composing.value) finalValue = undefined;
}
function endComposition(event: CompositionEvent): void {
  if (!composing.value || !compositionSelection) {
    reconcile();
    return;
  }
  if (!active()) {
    cancelComposition();
    return;
  }
  const captured = compositionSelection,
    value = input.value?.value ?? compositionOriginal;
  // The browser's composition data is the replacement for the captured original range.
  // Empty data is cancellation, unless the resulting DOM value changed (IME deletion).
  const diff = equationTextDifference(compositionOriginal, value);
  const text = event.data || (diff.start === diff.end && !diff.text ? "" : diff.text);
  composing.value = false;
  compositionSelection = undefined;
  const commit = value !== compositionOriginal || !!event.data;
  editor.composition(false, commit ? captured : undefined);
  finalValue = value;
  displayedValue = value;
  draft.value = value;
  if (commit)
    editor.action({
      type: "replace-text",
      selection: captured,
      text,
      ...(props.textMode ? { mode: props.textMode } : {}),
    });
  reconcile();
}
</script>

<template>
  <input
    ref="input"
    class="equation-text-slot"
    :class="{
      'is-empty': !draft && !boundary,
      'is-boundary': boundary,
      'is-normal': normal,
      'is-selected': selected,
      'hide-placeholder': editor.hidePlaceholders.value,
    }"
    :style="{ width }"
    :data-equation-slot="slotId"
    :data-equation-offset="offset"
    :value="draft"
    :aria-label="label"
    :disabled="editor.disabled.value"
    tabindex="-1"
    autocomplete="off"
    autocapitalize="off"
    :spellcheck="false"
    @focus="reportSelection()"
    @click.stop="reportSelection(true)"
    @select="reportSelection()"
    @keyup="reportSelection()"
    @keydown="beginNativeKey"
    @pointerdown.stop
    @input="onInput"
    @compositionstart="startComposition"
    @compositionend="endComposition"
  />
</template>

<style scoped>
.equation-text-slot {
  appearance: none;
  box-sizing: content-box;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-family: KaTeX_Math, KaTeX_Main, serif;
  font-style: italic;
  line-height: 1.2;
  text-align: inherit;
  outline: none;
}
.equation-text-slot.is-empty {
  min-height: 1em;
  border: 1px dotted currentColor;
}
.equation-text-slot.is-boundary {
  align-self: stretch;
}
.equation-text-slot.is-normal {
  font-family: KaTeX_Main, serif;
  font-style: normal;
}
.equation-text-slot.is-selected:focus {
  background: var(--sheetcraft-selection-background, rgb(86 123 174 / 12%));
}
.equation-text-slot.hide-placeholder:not(:focus) {
  border-color: transparent;
}
.equation-text-slot:disabled {
  opacity: 0.65;
}
</style>
