<script setup lang="ts">
import { computed } from "vue";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import type { PictureFormatChoiceField } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatField from "./PictureFormatField.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: Extract<PictureFormatChoiceField, `${string}Color`>;
}>();
const binding = computed(() => props.controller.choice(props.field));
</script>
<template>
  <PictureFormatField :label="controller.t(field)" :reason="binding.reason" :error="binding.error">
    <template #default="{ feedbackId }">
      <ColorPaletteSelect
        :model-value="binding.value"
        :label="controller.t(field)"
        :default-label="controller.t('automatic')"
        :disabled="binding.disabled"
        :mixed="!binding.disabled && binding.value === undefined"
        :show-default="false"
        show-value
        :aria-describedby="feedbackId"
        :data-picture-format-field="field"
        @select="binding.select"
      />
    </template>
  </PictureFormatField>
</template>
