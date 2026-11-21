<script setup lang="ts">
import { computed, inject } from "vue";
import { pictureFormatCommonReasons } from "./picture-format-feedback";
const props = defineProps<{ id: string; reason?: string; error?: string }>();
const commonReasons = inject(pictureFormatCommonReasons, undefined);
const descriptionOnly = computed(
  () => !props.error && !!props.reason && commonReasons?.value.has(props.reason),
);
</script>
<template>
  <p
    v-if="error || reason"
    :id="id"
    class="picture-format-feedback"
    :class="{ 'is-description-only': descriptionOnly }"
    :role="error ? 'alert' : undefined"
  >
    {{ error || reason }}
  </p>
</template>
<style scoped lang="scss">
.picture-format-feedback {
  margin: 4px 0 0;
  color: var(--sheetcraft-text-secondary);
  font-size: var(--sheetcraft-font-size-body-small);
  line-height: var(--sheetcraft-line-height-body-small);
  &[role="alert"] {
    color: var(--sheetcraft-status-error);
  }
  &.is-description-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
