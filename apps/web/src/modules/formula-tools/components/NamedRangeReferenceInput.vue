<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  disabled?: boolean;
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
    :aria-label="t('formulaTools.reference')"
    autocomplete="off"
    @enter="emit('enter')"
  >
    <template #suffix>
      <TButton
        class="named-range-reference-input__picker"
        variant="text"
        shape="square"
        :disabled="disabled || !selectReference"
        :aria-label="t('formulaTools.selectRange')"
        :title="t('formulaTools.selectRange')"
        data-select-formula-reference
        @click="pickReference"
      >
        <SquareMousePointer :size="16" aria-hidden="true" />
      </TButton>
    </template>
  </TInput>
</template>

<style scoped lang="scss">
.named-range-reference-input__picker:hover {
  --td-bg-color-container-hover: transparent;
}
</style>
