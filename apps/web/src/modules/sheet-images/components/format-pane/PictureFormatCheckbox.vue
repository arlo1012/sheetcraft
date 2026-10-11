<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { PictureFormatBooleanField } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: PictureFormatBooleanField;
}>();
const binding = computed(() => props.controller.boolean(props.field));
</script>
<template>
  <div class="picture-format-checkbox">
    <TCheckbox
      :model-value="binding.value === true"
      :indeterminate="binding.value === undefined"
      :disabled="binding.disabled"
      :aria-label="controller.t(field)"
      :data-picture-format-field="field"
      @change="binding.select"
      >{{ controller.t(field) }}</TCheckbox
    >
    <p v-if="binding.error" role="alert">{{ binding.error }}</p>
    <p v-else-if="binding.reason">{{ binding.reason }}</p>
  </div>
</template>
<style scoped lang="scss">
.picture-format-checkbox {
  min-width: 0;
  p {
    margin: 4px 0 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
