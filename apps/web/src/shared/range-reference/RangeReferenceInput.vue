<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../i18n";

const props = defineProps<{
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  pickLabel?: string;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const reference = defineModel<string>({ required: true });
const emit = defineEmits<{ enter: [] }>();
const { t } = useAppI18n();

async function pickReference(): Promise<void> {
  if (props.disabled) return;
  const selected = await props.selectReference?.(reference.value);
  if (selected !== undefined) reference.value = selected;
}
</script>

<template>
  <TInput
    v-model="reference"
    :disabled="disabled"
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
</template>

<style scoped lang="scss">
.range-reference-input__picker:hover {
  --td-bg-color-container-hover: transparent;
}
</style>
