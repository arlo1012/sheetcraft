<script setup lang="ts">
import { ArrowDownRight } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  activate: [];
}>();

function activate(): void {
  if (!props.disabled) emit("activate");
}
</script>

<template>
  <button
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
.ribbon-dialog-launcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--idea-text-muted);
  cursor: pointer;
  outline: none;

  &:hover:not(:disabled) {
    background: var(--idea-icon-button-hover-bg);
  }

  &:focus-visible {
    border-color: var(--idea-action-primary);
    box-shadow: 0 0 0 2px var(--idea-action-focus);
  }

  &:disabled {
    cursor: default;
    color: var(--idea-text-secondary);
  }
}
</style>
