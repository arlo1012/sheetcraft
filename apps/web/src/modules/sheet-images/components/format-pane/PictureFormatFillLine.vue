<script setup lang="ts">
import { computed } from "vue";
import type { PictureFormatLengthUnit } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatSection from "./PictureFormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatChoiceField from "./PictureFormatChoiceField.vue";
import PictureFormatColorField from "./PictureFormatColorField.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  unit: PictureFormatLengthUnit;
}>();
const lineModes = computed(() => {
  const supplied = props.controller.options("lineMode");
  return (
    supplied ?? [
      { value: "none", label: props.controller.t("none") },
      { value: "solid", label: props.controller.t("solid") },
      { value: "gradient", label: props.controller.t("gradient") },
    ]
  );
});
</script>
<template>
  <div>
    <PictureFormatSection :title="controller.t('fillSection')">
      <PictureFormatChoiceField :controller="controller" field="fillMode" />
      <PictureFormatColorField :controller="controller" field="fillColor" />
      <PictureFormatNumberField
        :controller="controller"
        field="fillTransparencyPercent"
        :unit="unit"
      />
      <PictureFormatChoiceField :controller="controller" field="fillGradientPreset" />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('lineSection')" initially-open>
      <PictureFormatChoiceField :controller="controller" field="lineMode" :options="lineModes" />
      <PictureFormatColorField :controller="controller" field="lineColor" />
      <PictureFormatNumberField
        :controller="controller"
        field="lineTransparencyPercent"
        :unit="unit"
      />
      <PictureFormatNumberField :controller="controller" field="lineWidthPt" :unit="unit" />
      <PictureFormatChoiceField :controller="controller" field="lineGradientPreset" />
      <PictureFormatChoiceField :controller="controller" field="lineCompound" />
      <PictureFormatChoiceField :controller="controller" field="lineDash" />
      <PictureFormatChoiceField :controller="controller" field="lineCap" />
      <PictureFormatChoiceField :controller="controller" field="lineJoin" />
    </PictureFormatSection>
  </div>
</template>
