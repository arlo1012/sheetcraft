<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import type { Rect, Size } from "@idea10/sheet-engine/geometry";

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
  () => props.editing && !props.composing && props.modelValue.startsWith("="),
);
const coloredReferences = computed(() =>
  showFormulaColors.value ? getFormulaReferenceTokens(props.modelValue) : [],
);
const formulaAssistActive = computed(
  () => props.editing && (!props.editSession || props.editSession.state.surface === "grid"),
);

async function measureEditor(): Promise<void> {
  const sequence = ++measurementSequence;
  measuredWidth.value = minimumFrameSize.value.width;
  measuredHeight.value = minimumFrameSize.value.height;
  if (!props.editing) {
    return;
  }

  await nextTick();
  const input = inputRef.value;
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
  emit("update:modelValue", readInputValue(event));
  void nextTick(captureSelection);
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
    <textarea
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
      @paste="emit('paste', $event)"
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
    background: var(--idea-surface-panel);
    border-color: var(--idea-action-primary);
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
    color: var(--idea-text-primary);
    caret-color: var(--idea-text-primary);
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
