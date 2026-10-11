<script setup lang="ts">
import { computed } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import {
  PICTURE_FORMAT_GEOMETRY_FIELDS,
  type PictureFormatLengthUnit,
  type PictureFormatNumberField,
} from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatField from "./PictureFormatField.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: PictureFormatNumberField;
  unit: PictureFormatLengthUnit;
}>();
const binding = computed(() => props.controller.number(props.field, props.unit));
const suffix = computed(() =>
  PICTURE_FORMAT_GEOMETRY_FIELDS.includes(props.field)
    ? props.controller.t(props.unit === "in" ? "unitIn" : props.unit === "cm" ? "unitCm" : "unitPt")
    : props.field.endsWith("Pt")
      ? props.controller.t("unitPt")
      : props.field.endsWith("Deg")
        ? props.controller.t("degreeUnit")
        : props.controller.t("percentUnit"),
);
</script>
<template>
  <PictureFormatField :label="controller.t(field)" :reason="binding.reason" :error="binding.error">
    <template #default="{ feedbackId }">
      <TInput
        :model-value="binding.text"
        :disabled="binding.disabled"
        size="small"
        inputmode="decimal"
        :aria-label="controller.t(field)"
        :aria-describedby="feedbackId"
        :aria-invalid="!!binding.error"
        :status="binding.error ? 'error' : undefined"
        :title="binding.disabled ? (binding.reason ?? controller.t('notAvailable')) : undefined"
        :data-picture-format-field="field"
        @change="binding.edit"
        @focus="binding.focus"
        @blur="binding.blur"
        @enter="binding.enter"
        @keydown="binding.keydown"
      >
        <template #suffix
          ><span class="picture-format-number-unit" aria-hidden="true">{{ suffix }}</span></template
        >
      </TInput>
    </template>
  </PictureFormatField>
</template>
<style scoped lang="scss">
.picture-format-number-unit {
  color: var(--sheetcraft-text-secondary);
  white-space: nowrap;
}
</style>
