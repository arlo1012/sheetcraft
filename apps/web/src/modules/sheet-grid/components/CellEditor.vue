<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import CellTextInput from "../../../shared/cell-editing/CellTextInput.vue";
import type { Rect, Size } from "@sheetcraft/sheet-engine/geometry";

const { t } = useAppI18n();

const props = defineProps<{
  modelValue: string;
  addressLabel: string;
  displayValue: string;
  editing: boolean;
  composing: boolean;
  wrapText: boolean;
  cellRect: Rect;
  viewportSize: Size;
  style?: CSSProperties;
  frameStyle?: CSSProperties;
  editSession?: CellEditSession;
  scale?: number;
}>();

const emit = defineEmits<{
  clipboardCopy: [];
  "update:modelValue": [value: string];
  keydown: [event: KeyboardEvent];
  blur: [event: FocusEvent];
  compositionStart: [event: CompositionEvent];
  compositionEnd: [value: string, event: CompositionEvent];
  copy: [event: ClipboardEvent];
  cut: [event: ClipboardEvent];
  paste: [event: ClipboardEvent];
}>();

const inputRef = ref<HTMLTextAreaElement | null>(null);
const richInputRef = ref<InstanceType<typeof CellTextInput>>();
const useRichText = computed(
  () =>
    props.editing &&
    props.editSession?.state.richTextMode &&
    (!props.modelValue.startsWith("=") || props.editSession.state.asText),
);
const formulaAssistRef = ref<
  | (FormulaReferenceEditor & {
      handleKeydown: (event: KeyboardEvent) => boolean;
      inputAria: Readonly<Record<string, string | boolean | undefined>>;
    })
  | null
>(null);
const measuredWidth = ref(0);
const measuredHeight = ref(0);
const EDITOR_FRAME_BORDER_SIZE = 2;
const EDITOR_TRAILING_SAFETY_SPACE = 6;
let measurementSequence = 0;

const minimumFrameSize = computed(() => ({
  width: props.cellRect.width + 1,
  height: props.cellRect.height + 1,
}));
const maximumFrameSize = computed(() => ({
  width: Math.max(minimumFrameSize.value.width, props.viewportSize.width - props.cellRect.x + 1),
  height: Math.max(minimumFrameSize.value.height, props.viewportSize.height - props.cellRect.y + 1),
}));
const editorFrameStyle = computed<CSSProperties>(() => ({
  ...(props.editing ? props.frameStyle : {}),
  left: "-1px",
  top: "-1px",
  width: `${props.editing ? measuredWidth.value : minimumFrameSize.value.width}px`,
  height: `${props.editing ? measuredHeight.value : minimumFrameSize.value.height}px`,
}));
const accessibleLabel = computed(() => {
  if (props.editing) {
    return t("cell.edit", { address: props.addressLabel });
  }

  return t("cell.value", {
    address: props.addressLabel,
    value: props.displayValue || t("cell.blank"),
  });
});
const formulaInputAria = computed(() => formulaAssistRef.value?.inputAria ?? {});
const showFormulaColors = computed(
  () =>
    props.editing &&
    !props.composing &&
    !props.editSession?.state.asText &&
    props.modelValue.startsWith("="),
);
const coloredReferences = computed(() =>
  showFormulaColors.value ? getFormulaReferenceTokens(props.modelValue) : [],
);
const formulaAssistActive = computed(
  () =>
    props.editing &&
    !props.editSession?.state.asText &&
    (!props.editSession || props.editSession.state.surface === "grid"),
);

async function measureEditor(): Promise<void> {
  const sequence = ++measurementSequence;
  measuredWidth.value = minimumFrameSize.value.width;
  measuredHeight.value = minimumFrameSize.value.height;
  if (!props.editing) {
    return;
  }

  await nextTick();
  const input = useRichText.value ? richInputRef.value?.element : inputRef.value;
  if (!input || sequence !== measurementSequence || !props.editing) {
    return;
  }

  const contentWidth =
    !props.wrapText && input.scrollWidth > input.clientWidth
      ? input.scrollWidth + EDITOR_FRAME_BORDER_SIZE + EDITOR_TRAILING_SAFETY_SPACE
      : minimumFrameSize.value.width;
  const contentHeight = input.scrollHeight + EDITOR_FRAME_BORDER_SIZE;
  measuredWidth.value = Math.min(
    maximumFrameSize.value.width,
    Math.max(minimumFrameSize.value.width, contentWidth),
  );
  measuredHeight.value = Math.min(
    maximumFrameSize.value.height,
    Math.max(minimumFrameSize.value.height, contentHeight),
  );
}

watch(
  () => [
    props.modelValue,
    props.editing,
    props.wrapText,
    props.cellRect.x,
    props.cellRect.y,
    props.cellRect.width,
    props.cellRect.height,
    props.viewportSize.width,
    props.viewportSize.height,
    props.style,
    props.editSession?.state.draftFontRuns,
  ],
  () => void measureEditor(),
  { immediate: true, flush: "post" },
);

function readInputValue(event: Event): string {
  return (event.target as HTMLTextAreaElement).value;
}

function getCaretIndex(clientX: number): number {
  const input = inputRef.value;
  if (!input || typeof document === "undefined") {
    return 0;
  }

  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return input.value.length;
  }

  const style = getComputedStyle(input);
  context.font = style.font || `${style.fontSize} ${style.fontFamily}`;
  const contentX =
    (clientX - input.getBoundingClientRect().left) / (props.scale ?? 1) -
    input.clientLeft -
    parseFloat(style.paddingLeft);
  let previousWidth = 0;

  for (let index = 1; index <= input.value.length; index += 1) {
    const width = context.measureText(input.value.slice(0, index)).width;
    if (contentX < (previousWidth + width) / 2) {
      return index - 1;
    }
    previousWidth = width;
  }

  return input.value.length;
}

function focus(options?: {
  selectAll?: boolean;
  clientX?: number;
  selection?: {
    start: number;
    end: number;
    direction: "none" | "forward" | "backward";
  };
}): void {
  if (useRichText.value) {
    richInputRef.value?.focus(options);
    return;
  }
  const input = inputRef.value;
  if (!input) {
    return;
  }

  input.focus({ preventScroll: true });
  if (options?.selectAll) {
    input.select();
    return;
  }
  if (options?.selection) {
    input.setSelectionRange(
      options.selection.start,
      options.selection.end,
      options.selection.direction,
    );
    return;
  }

  const caretIndex =
    options?.clientX === undefined ? input.value.length : getCaretIndex(options.clientX);
  input.setSelectionRange(caretIndex, caretIndex);
}

function insertLineBreak(): void {
  if (useRichText.value) {
    richInputRef.value?.insertLineBreak();
    return;
  }
  const input = inputRef.value;
  if (!input) {
    return;
  }
  const insertion = insertTextAtSelection(
    props.modelValue,
    input.selectionStart,
    input.selectionEnd,
    "\n",
  );
  emit("update:modelValue", insertion.value);
  void nextTick(() => {
    input.setSelectionRange(insertion.caret, insertion.caret);
  });
}

function onFrameMousedown(event: MouseEvent): void {
  if (!props.editing || event.target !== event.currentTarget) {
    return;
  }
  event.preventDefault();
  focus({ clientX: event.clientX });
}

function onFormulaTextEdit(payload: { value: string; caret: number }): void {
  emit("update:modelValue", payload.value);
  props.editSession?.setSelection(payload.caret, payload.caret);
  void nextTick(() => {
    const input = inputRef.value;
    if (input) {
      input.setSelectionRange(payload.caret, payload.caret);
      captureSelection();
    }
  });
}

function captureSelection(): void {
  const input = inputRef.value;
  if (!input || !props.editSession?.state.active || props.editSession.state.surface !== "grid")
    return;
  props.editSession.setSelection(
    input.selectionStart,
    input.selectionEnd,
    input.selectionDirection ?? "none",
  );
}

function onFocus(): void {
  if (props.editSession?.state.active) props.editSession.activateSurface("grid");
}

function onInput(event: Event): void {
  if (props.editing && event instanceof InputEvent && event.inputType === "insertFromPaste")
    props.editSession?.markPasted();
  emit("update:modelValue", readInputValue(event));
  void nextTick(captureSelection);
}

function onBeforeInput(event: Event): void {
  if (!(event instanceof InputEvent) || !props.editing) return;
  if (
    props.editSession?.state.richTextMode &&
    (event.inputType === "historyUndo" || event.inputType === "historyRedo")
  ) {
    event.preventDefault();
    if (event.inputType === "historyUndo") props.editSession.undoDraft();
    else props.editSession.redoDraft();
    void nextTick(() => focus({ selection: props.editSession!.state.selection }));
    return;
  }
  const input = inputRef.value;
  if (input)
    props.editSession?.prepareInput(input.selectionStart, input.selectionEnd, event.inputType);
}

function onPaste(event: ClipboardEvent): void {
  if (props.editing) props.editSession?.markPasted();
  emit("paste", event);
}

function onBlur(event: FocusEvent): void {
  captureSelection();
  emit("blur", event);
}

function onKeydown(event: KeyboardEvent): void {
  if (formulaAssistRef.value?.handleKeydown(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("keydown", event);
}

defineExpose({
  focus,
  insertLineBreak,
  get formulaReferenceEditor() {
    return formulaAssistRef.value;
  },
});
</script>

<template>
  <div
    class="cell-editor-frame"
    :class="{ 'is-editing': editing }"
    :style="editorFrameStyle"
    data-cell-editor-frame
    @mousedown.stop="onFrameMousedown"
    @dblclick.stop
  >
    <CellTextInput
      @clipboard-copy="emit('clipboardCopy')"
      v-if="useRichText && editSession"
      ref="richInputRef"
      class="cell-editor is-editing"
      :class="{ 'is-wrapped': wrapText }"
      :model-value="modelValue"
      :font-runs="editSession.state.draftFontRuns"
      :edit-session="editSession"
      surface="grid"
      :label="accessibleLabel"
      :wrap="wrapText"
      :style="style"
      :data-cell-editor="addressLabel"
      @update:model-value="emit('update:modelValue', $event)"
      @focus="onFocus"
      @keydown="onKeydown"
      @blur="emit('blur', $event)"
      @composition-start="emit('compositionStart', $event)"
      @composition-end="(value, event) => emit('compositionEnd', value, event)"
    />
    <textarea
      v-else
      ref="inputRef"
      class="cell-editor"
      :class="{
        'is-editing': editing,
        'is-wrapped': wrapText,
        'has-formula-colors': showFormulaColors,
      }"
      :value="modelValue"
      rows="1"
      :wrap="wrapText ? 'soft' : 'off'"
      autocomplete="off"
      :spellcheck="false"
      :aria-label="accessibleLabel"
      v-bind="formulaInputAria"
      aria-keyshortcuts="Alt+Enter Control+F2 F2 F4"
      :data-cell-editor="addressLabel"
      :data-cell-edit-session="editSession?.id"
      data-cell-edit-surface="grid"
      :style="editing ? style : undefined"
      @input="onInput"
      @beforeinput="onBeforeInput"
      @focus="onFocus"
      @mousedown.stop
      @dblclick.stop
      @select="captureSelection"
      @keyup="captureSelection"
      @click="captureSelection"
      @keydown="onKeydown"
      @blur="onBlur"
      @compositionstart="emit('compositionStart', $event)"
      @compositionend="emit('compositionEnd', readInputValue($event), $event)"
      @copy="emit('copy', $event)"
      @cut="emit('cut', $event)"
      @paste="onPaste"
    />
    <FormulaTextOverlay
      :input="inputRef"
      :value="modelValue"
      :references="coloredReferences"
      :active="showFormulaColors"
    />
    <FormulaInputAssist
      ref="formulaAssistRef"
      :value="modelValue"
      :input="inputRef"
      :active="formulaAssistActive"
      :composing="composing"
      @text-edit="onFormulaTextEdit"
    />
  </div>
</template>

<style scoped lang="scss">
.cell-editor-frame {
  position: absolute;
  z-index: 3;
  display: flex;
  background: transparent;
  border: 1px solid transparent;
  pointer-events: none;

  &.is-editing {
    z-index: 5;
    background: var(--sheetcraft-surface-panel);
    border-color: var(--sheetcraft-action-primary);
    pointer-events: auto;
  }
}

.cell-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  margin: 0;
  padding: 0 4px;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 0;
  outline: none;
  color: transparent;
  caret-color: transparent;
  font-size: 13px;
  line-height: 1;
  pointer-events: none;
  resize: none;
  white-space: pre;

  &.is-editing {
    height: 100%;
    min-height: calc(1em + 2px);
    padding: 2px 4px;
    overflow: auto;
    scrollbar-width: none;
    color: var(--sheetcraft-text-primary);
    caret-color: var(--sheetcraft-text-primary);
    line-height: 1.25;
    pointer-events: auto;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  }

  &.is-wrapped {
    overflow-x: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  &.has-formula-colors {
    -webkit-text-fill-color: transparent;
  }
}
</style>
