<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const { t } = useAppI18n();

const props = defineProps<{
  modelValue: string;
  addressLabel: string;
  displayValue: string;
  editing: boolean;
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

const inputRef = ref<HTMLInputElement | null>(null);
const accessibleLabel = computed(() => {
  if (props.editing) {
    return t("cell.edit", { address: props.addressLabel });
  }

  return t("cell.value", {
    address: props.addressLabel,
    value: props.displayValue || t("cell.blank"),
  });
});

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
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

defineExpose({ focus });
</script>

<template>
  <input
    ref="inputRef"
    class="cell-editor"
    :class="{ 'is-editing': editing }"
    :value="modelValue"
    type="text"
    autocomplete="off"
    :spellcheck="false"
    :aria-label="accessibleLabel"
    :data-cell-editor="addressLabel"
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
</template>

<style scoped lang="scss">
.cell-editor {
  position: absolute;
  inset: -1px;
  z-index: 3;
  width: calc(100% + 2px);
  height: calc(100% + 2px);
  min-width: 0;
  margin: 0;
  padding: 0 4px;
  overflow: hidden;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 0;
  outline: none;
  color: transparent;
  caret-color: transparent;
  font-size: 13px;
  line-height: 1;
  pointer-events: none;

  &.is-editing {
    background: var(--ui-surface-primary);
    border-color: var(--ui-brand-primary);
    color: var(--ui-text-primary);
    caret-color: var(--ui-text-primary);
    pointer-events: auto;
    box-shadow: 0 1px 3px rgb(32 36 44 / 16%);
  }
}
</style>
