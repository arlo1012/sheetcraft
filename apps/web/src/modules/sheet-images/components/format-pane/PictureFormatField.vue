<script setup lang="ts">
import { useId } from "vue";
withDefaults(defineProps<{ label: string; reason?: string; error?: string; stacked?: boolean }>(), {
  stacked: false,
});
const feedbackId = `picture-format-feedback-${useId()}`;
</script>
<template>
  <div
    class="picture-format-field"
    :class="{ 'is-stacked': stacked }"
    role="group"
    :aria-label="label"
    :aria-describedby="reason || error ? feedbackId : undefined"
  >
    <span class="picture-format-field__label" :title="label">{{ label }}</span>
    <div class="picture-format-field__control">
      <slot :feedback-id="reason || error ? feedbackId : undefined" />
    </div>
    <p v-if="error" :id="feedbackId" class="picture-format-field__feedback is-error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="reason" :id="feedbackId" class="picture-format-field__feedback">{{ reason }}</p>
  </div>
</template>
<style scoped lang="scss">
.picture-format-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(118px, 46%);
  align-items: center;
  gap: 4px 10px;
  min-width: 0;
  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sheetcraft-text-primary);
  }
  &__control {
    min-width: 0;
  }
  &__feedback {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
    overflow-wrap: anywhere;
  }
  &.is-stacked {
    grid-template-columns: minmax(0, 1fr);
  }
  &.is-stacked .picture-format-field__control {
    grid-column: 1;
  }
  .is-error {
    color: var(--sheetcraft-text-primary);
  }
}
</style>
