<script setup lang="ts">
import { computed } from "vue";
import type { PictureFormatLengthUnit } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatSection from "./PictureFormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatChoiceField from "./PictureFormatChoiceField.vue";
import PictureFormatColorField from "./PictureFormatColorField.vue";
import PicturePaintEditor from "./PicturePaintEditor.vue";
import PictureLineEditor from "./PictureLineEditor.vue";
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
const fill = computed(() => props.controller.detailed("fill"));
const line = computed(() => props.controller.detailed("line"));
</script>
<template>
  <div>
    <PictureFormatSection :title="controller.t('fillSection')">
      <template v-if="controller.hasDetailedCapabilities.value">
        <PicturePaintEditor
          :owner-key="fill.ownerKey"
          :value="fill.value"
          :disabled="fill.disabled"
          :t="controller.t"
          :source-asset-id="controller.snapshot.value?.owner.assetId"
          :load-asset="controller.loadPaintAsset"
          :on-commit="fill.apply"
        />
        <p v-if="fill.error" role="alert">{{ fill.error }}</p>
        <p v-else-if="fill.reason">{{ fill.reason }}</p>
      </template>
      <template v-else>
        <PictureFormatChoiceField :controller="controller" field="fillMode" />
        <PictureFormatColorField :controller="controller" field="fillColor" />
        <PictureFormatNumberField
          :controller="controller"
          field="fillTransparencyPercent"
          :unit="unit"
        />
        <PictureFormatChoiceField :controller="controller" field="fillGradientPreset" />
      </template>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('lineSection')" initially-open>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureLineEditor
          :owner-key="line.ownerKey"
          :value="line.value"
          :disabled="line.disabled"
          :t="controller.t"
          :source-asset-id="controller.snapshot.value?.owner.assetId"
          :load-asset="controller.loadPaintAsset"
          :on-commit="line.apply"
        />
        <p v-if="line.error" role="alert">{{ line.error }}</p>
        <p v-else-if="line.reason">{{ line.reason }}</p>
      </template>
      <template v-else>
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
      </template>
    </PictureFormatSection>
  </div>
</template>
