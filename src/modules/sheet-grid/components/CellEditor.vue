<script setup lang="ts">
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import type { Rect, Size } from "../geometry";

const { t } = useAppI18n();

const props = defineProps<{
  modelValue: string;
  addressLabel: string;
  displayValue: string;
  editing: boolean;
  wrapText: boolean;
  cellRect: Rect;
  viewportSize: Size;
  style?: CSSProperties;
  frameStyle?: CSSProperties;
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
const measuredWidth = ref(0);
const measuredHeight = ref(0);
let measurementSequence = 0;

const minimumFrameSize = computed(() => ({
  width: props.cellRect.width + 2,
  height: props.cellRect.height + 2,
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

  const frameBorderSize = 4;
  const contentWidth = props.wrapText
    ? minimumFrameSize.value.width
    : input.scrollWidth + frameBorderSize;
  const contentHeight = input.scrollHeight + frameBorderSize;
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
    clientX - input.getBoundingClientRect().left - input.clientLeft - parseFloat(style.paddingLeft);
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

function focus(options?: { selectAll?: boolean; clientX?: number }): void {
  const input = inputRef.value;
  if (!input) {
    return;
  }

  input.focus({ preventScroll: true });
  if (options?.selectAll) {
    input.select();
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

defineExpose({ focus, insertLineBreak });
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
      :class="{ 'is-editing': editing, 'is-wrapped': wrapText }"
      :value="modelValue"
      rows="1"
      :wrap="wrapText ? 'soft' : 'off'"
      autocomplete="off"
      :spellcheck="false"
      :aria-label="accessibleLabel"
      aria-keyshortcuts="Alt+Enter"
      :data-cell-editor="addressLabel"
      :style="editing ? style : undefined"
      @input="emit('update:modelValue', readInputValue($event))"
      @mousedown.stop
      @dblclick.stop
      @keydown="emit('keydown', $event)"
      @blur="emit('blur', $event)"
      @compositionstart="emit('compositionStart', $event)"
      @compositionend="emit('compositionEnd', readInputValue($event), $event)"
      @copy="emit('copy', $event)"
      @cut="emit('cut', $event)"
      @paste="emit('paste', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.cell-editor-frame {
  position: absolute;
  z-index: 3;
  display: flex;
  background: transparent;
  border: 2px solid transparent;
  pointer-events: none;

  &.is-editing {
    z-index: 5;
    background: var(--td-bg-color-container);
    border-color: var(--td-brand-color);
    pointer-events: auto;
    box-shadow: 0 1px 3px rgb(32 36 44 / 16%);
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
    color: var(--td-text-color-primary);
    caret-color: var(--td-text-color-primary);
    line-height: 1.25;
    pointer-events: auto;
  }

  &.is-wrapped {
    overflow-x: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
}
</style>
