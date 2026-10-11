<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type {
  PictureFormatChoiceField,
  PictureFormatOption,
} from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatField from "./PictureFormatField.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: PictureFormatChoiceField;
  options?: readonly PictureFormatOption[];
}>();
const choices = computed(() => [...(props.options ?? props.controller.options(props.field) ?? [])]);
const binding = computed(() => props.controller.choice(props.field, choices.value.length > 0));
</script>
<template>
  <PictureFormatField :label="controller.t(field)" :reason="binding.reason" :error="binding.error">
    <template #default="{ feedbackId }">
      <TSelect
        :model-value="binding.value"
        :options="choices"
        :disabled="binding.disabled"
        size="small"
        :aria-label="controller.t(field)"
        :aria-describedby="feedbackId"
        :aria-invalid="!!binding.error"
        :data-picture-format-field="field"
        @change="binding.select"
      />
    </template>
  </PictureFormatField>
</template>
