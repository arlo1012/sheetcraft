<script setup lang="ts">
import { computed, inject, useId } from "vue";
import { formatPaneCommonReasons } from "./format-pane-feedback";

const props = withDefaults(
  defineProps<{
    label: string;
    reason?: string;
    error?: string;
    stacked?: boolean;
    inline?: boolean;
    feedbackClass?: string;
  }>(),
  {
    stacked: false,
    feedbackClass: undefined,
  },
);

const commonReasons = inject(formatPaneCommonReasons, undefined);
const sharedReason = computed(() => !!props.reason && commonReasons?.value.has(props.reason));
const feedbackId = `format-field-feedback-${useId()}`;
</script>

<template>
  <div
    class="format-field"
    :class="{ 'is-stacked': stacked, 'is-inline': inline }"
    role="group"
    :aria-label="label"
    :aria-describedby="reason || error ? feedbackId : undefined"
  >
    <span class="format-field__label" :title="label">{{ label }}</span>
    <div class="format-field__control">
      <slot :feedback-id="reason || error ? feedbackId : undefined" />
    </div>
    <p
      v-if="error"
      :id="feedbackId"
      class="format-field__feedback is-error"
      :class="feedbackClass"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="reason"
      :id="feedbackId"
      class="format-field__feedback"
      :class="[feedbackClass, { 'is-shared': sharedReason }]"
    >
      {{ reason }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.format-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(118px, 46%);
  align-items: center;
  gap: 4px 10px;
  min-width: 0;

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sheetcraft-text-secondary);
  }

  &__control {
    min-width: 0;
  }

  &__feedback {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    overflow-wrap: anywhere;
  }

  &.is-stacked {
    grid-template-columns: minmax(0, 1fr);
  }

  &.is-stacked &__control {
    grid-column: 1;
  }

  &.is-inline {
    grid-template-columns: minmax(0, 1fr);
  }

  &.is-inline &__label,
  &__feedback.is-shared {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .is-error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
