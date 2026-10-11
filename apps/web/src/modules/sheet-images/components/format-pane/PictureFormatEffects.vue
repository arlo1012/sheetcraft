<script setup lang="ts">
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { PictureFormatLengthUnit } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatSection from "./PictureFormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatChoiceField from "./PictureFormatChoiceField.vue";
import PictureFormatColorField from "./PictureFormatColorField.vue";
import PictureFormatResetButton from "./PictureFormatResetButton.vue";
defineProps<{ controller: PictureFormatPaneController; unit: PictureFormatLengthUnit }>();
</script>
<template>
  <div class="picture-format-effects">
    <PictureFormatSection :title="controller.t('shadowSection')">
      <PictureFormatChoiceField :controller="controller" field="shadowPreset" />
      <PictureFormatColorField :controller="controller" field="shadowColor" />
      <PictureFormatNumberField
        :controller="controller"
        field="shadowTransparencyPercent"
        :unit="unit"
      />
      <PictureFormatNumberField :controller="controller" field="shadowSizePercent" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="shadowBlurPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="shadowDistancePt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="shadowAngleDeg" :unit="unit" />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('reflectionSection')">
      <PictureFormatChoiceField :controller="controller" field="reflectionPreset" />
      <PictureFormatNumberField
        :controller="controller"
        field="reflectionSizePercent"
        :unit="unit"
      />
      <PictureFormatNumberField
        :controller="controller"
        field="reflectionTransparencyPercent"
        :unit="unit"
      />
      <PictureFormatNumberField :controller="controller" field="reflectionBlurPt" :unit="unit" />
      <PictureFormatNumberField
        :controller="controller"
        field="reflectionDistancePt"
        :unit="unit"
      />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('glowSection')">
      <PictureFormatChoiceField :controller="controller" field="glowPreset" />
      <PictureFormatColorField :controller="controller" field="glowColor" />
      <PictureFormatNumberField :controller="controller" field="glowSizePt" :unit="unit" />
      <PictureFormatNumberField
        :controller="controller"
        field="glowTransparencyPercent"
        :unit="unit"
      />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('softEdgesSection')">
      <PictureFormatChoiceField :controller="controller" field="softEdgePreset" />
      <PictureFormatNumberField :controller="controller" field="softEdgeSizePt" :unit="unit" />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('format3dSection')">
      <h3>{{ controller.t("depthSection") }}</h3>
      <PictureFormatColorField :controller="controller" field="depthColor" />
      <PictureFormatNumberField :controller="controller" field="depthSizePt" :unit="unit" />
      <h3>{{ controller.t("contourSection") }}</h3>
      <PictureFormatColorField :controller="controller" field="contourColor" />
      <PictureFormatNumberField :controller="controller" field="contourSizePt" :unit="unit" />
      <PictureFormatChoiceField :controller="controller" field="material" />
      <PictureFormatChoiceField :controller="controller" field="lighting" />
      <PictureFormatNumberField :controller="controller" field="lightingAngleDeg" :unit="unit" />
      <PictureFormatResetButton :controller="controller" type="reset-3d-format" />
    </PictureFormatSection>
    <PictureFormatSection :title="controller.t('rotation3dSection')">
      <PictureFormatChoiceField :controller="controller" field="rotation3dPreset" />
      <PictureFormatNumberField :controller="controller" field="rotation3dXDeg" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="rotation3dYDeg" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="rotation3dZDeg" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="perspectiveDeg" :unit="unit" />
      <TCheckbox
        :model-value="false"
        disabled
        :aria-label="controller.t('keepTextFlatUnavailable')"
        >{{ controller.t("keepTextFlatUnavailable") }}</TCheckbox
      >
      <PictureFormatNumberField
        :controller="controller"
        field="distanceFromGroundPt"
        :unit="unit"
      />
      <PictureFormatResetButton :controller="controller" type="reset-3d-rotation" />
    </PictureFormatSection>
  </div>
</template>
<style scoped lang="scss">
.picture-format-effects h3 {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
}
</style>
