<script setup lang="ts">
import { ref } from "vue";
import { ArrowDownRight } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ activate: [] }>();
const rootElement = ref<HTMLButtonElement | null>(null);
defineExpose({ rootElement });

function activate(): void {
  if (!props.disabled) emit("activate");
}
</script>

<template>
  <button
    ref="rootElement"
    class="ribbon-dialog-launcher"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    @click="activate"
  >
    <ArrowDownRight :size="12" :stroke-width="1.8" aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-dialog-launcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 8px;
  padding: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--idea-text-muted);
  cursor: pointer;
  outline: none;

  @include ribbon.focus-ring;

  > svg {
    pointer-events: none;
  }

  &:hover:not(:disabled) {
    background: var(--idea-icon-button-hover-bg);
  }

  &:disabled {
    cursor: default;
    color: var(--idea-text-secondary);
  }
}
</style>
