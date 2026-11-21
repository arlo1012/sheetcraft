<script setup lang="ts">
import FormatField from "../../../../shared/format-pane/FormatField.vue";

defineProps<{
  label: string;
  reason?: string;
  error?: string;
  stacked?: boolean;
  inline?: boolean;
}>();
</script>

<template>
  <FormatField
    :label="label"
    :reason="reason"
    :error="error"
    :stacked="stacked"
    :inline="inline"
    feedback-class="picture-format-field__feedback"
  >
    <template #default="{ feedbackId }">
      <slot :feedback-id="feedbackId" />
    </template>
  </FormatField>
</template>
