<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { nextTick, ref } from "vue";
import { useAppI18n } from "../i18n";

const props = defineProps<{
  disabled?: boolean;
  clearable?: boolean;
  label?: string;
  placeholder?: string;
  pickLabel?: string;
  insertReference?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const reference = defineModel<string>({ required: true });
const emit = defineEmits<{ enter: [] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
let selection: { start: number; end: number } | undefined;

function input(): HTMLInputElement | undefined {
  return root.value?.querySelector("input") ?? undefined;
}

function saveSelection(): void {
  const element = input();
  if (!element) return;
  selection = {
    start: element.selectionStart ?? element.value.length,
    end: element.selectionEnd ?? element.selectionStart ?? element.value.length,
  };
}

async function restoreSelection(start: number, end = start): Promise<void> {
  await nextTick();
  const element = input();
  if (!element) return;
  element.focus();
  element.setSelectionRange(start, end);
}

function insertSelectedReference(selected: string): number {
  const insertion = selected.replace(/^=/, "");
  if (!reference.value.trim()) {
    reference.value = `=${insertion}`;
    return reference.value.length;
  }
  const start = Math.max(
    0,
    Math.min(selection?.start ?? reference.value.length, reference.value.length),
  );
  const end = Math.max(start, Math.min(selection?.end ?? start, reference.value.length));
  const prefix = start === 0 && end > 0 && reference.value.startsWith("=") ? "=" : "";
  reference.value = `${reference.value.slice(0, start)}${prefix}${insertion}${reference.value.slice(end)}`;
  return start + prefix.length + insertion.length;
}

async function pickReference(): Promise<void> {
  if (props.disabled) return;
  saveSelection();
  const savedSelection = selection;
  const current = reference.value;
  const selected = await props.selectReference?.(current);
  if (selected === undefined || (props.insertReference && selected === current)) {
    if (savedSelection) await restoreSelection(savedSelection.start, savedSelection.end);
    return;
  }
  if (!props.insertReference) {
    reference.value = selected;
    return;
  }
  const caret = insertSelectedReference(selected);
  await restoreSelection(caret);
}
</script>

<template>
  <div ref="root">
    <TInput
      v-model="reference"
      :disabled="disabled"
      :clearable="clearable"
      :aria-label="label ?? t('formulaTools.reference')"
      :placeholder="placeholder"
      autocomplete="off"
      @enter="emit('enter')"
    >
      <template #suffix>
        <TButton
          class="range-reference-input__picker"
          variant="text"
          shape="square"
          :disabled="disabled || !selectReference"
          :aria-label="pickLabel ?? t('formulaTools.selectRange')"
          :title="pickLabel ?? t('formulaTools.selectRange')"
          data-select-formula-reference
          @click="pickReference"
        >
          <SquareMousePointer :size="16" aria-hidden="true" />
        </TButton>
      </template>
    </TInput>
  </div>
</template>

<style scoped lang="scss">
.range-reference-input__picker:hover {
  --td-bg-color-container-hover: transparent;
}
</style>
