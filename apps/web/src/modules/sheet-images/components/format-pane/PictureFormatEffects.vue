<script setup lang="ts">
import { computed, inject } from "vue";
import { pictureFormatCommonReasons } from "./picture-format-feedback";
import PictureEffectPresetField from "./PictureEffectPresetField.vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { PictureFormatLengthUnit } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatChoiceField from "./PictureFormatChoiceField.vue";
import PictureFormatColorField from "./PictureFormatColorField.vue";
import PictureFormatResetButton from "./PictureFormatResetButton.vue";
import PictureShadowEditor from "./PictureShadowEditor.vue";
import PictureReflectionEditor from "./PictureReflectionEditor.vue";
import PictureGlowEditor from "./PictureGlowEditor.vue";
import PictureSoftEdgesEditor from "./PictureSoftEdgesEditor.vue";
import PictureFormat3dEditor from "./PictureFormat3dEditor.vue";
import PictureRotation3dEditor from "./PictureRotation3dEditor.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  unit: PictureFormatLengthUnit;
}>();
const commonReasons = inject(pictureFormatCommonReasons, undefined);
const showReason = (reason?: string) => reason && !commonReasons?.value.has(reason);
const shadow = computed(() => props.controller.detailed("shadow"));
const reflection = computed(() => props.controller.detailed("reflection"));
const glow = computed(() => props.controller.detailed("glow"));
const softEdges = computed(() => props.controller.detailed("softEdges"));
const format3d = computed(() => props.controller.detailed("format3d"));
const rotation3d = computed(() => props.controller.detailed("rotation3d"));
</script>
<template>
  <div class="picture-format-effects">
    <FormatSection :title="controller.t('shadowSection')">
      <template v-if="controller.hasDetailedCapabilities.value" #control>
        <PictureEffectPresetField :controller="controller" category="shadow" />
      </template>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureShadowEditor
          hide-preset
          :owner-key="shadow.ownerKey"
          :value="shadow.value"
          :disabled="shadow.disabled"
          :t="controller.t"
          :on-commit="shadow.apply"
        />
      </template>
      <template v-else>
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
      </template>
    </FormatSection>
    <FormatSection :title="controller.t('reflectionSection')">
      <template v-if="controller.hasDetailedCapabilities.value" #control>
        <PictureEffectPresetField :controller="controller" category="reflection" />
      </template>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureReflectionEditor
          hide-preset
          :owner-key="reflection.ownerKey"
          :value="reflection.value"
          :disabled="reflection.disabled"
          :t="controller.t"
          :on-commit="reflection.apply"
        />
      </template>
      <template v-else>
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
      </template>
    </FormatSection>
    <FormatSection :title="controller.t('glowSection')">
      <template v-if="controller.hasDetailedCapabilities.value" #control>
        <PictureEffectPresetField :controller="controller" category="glow" />
      </template>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureGlowEditor
          hide-preset
          :owner-key="glow.ownerKey"
          :value="glow.value"
          :disabled="glow.disabled"
          :t="controller.t"
          :on-commit="glow.apply"
        />
      </template>
      <template v-else>
        <PictureFormatChoiceField :controller="controller" field="glowPreset" />
        <PictureFormatColorField :controller="controller" field="glowColor" />
        <PictureFormatNumberField :controller="controller" field="glowSizePt" :unit="unit" />
        <PictureFormatNumberField
          :controller="controller"
          field="glowTransparencyPercent"
          :unit="unit"
        />
      </template>
    </FormatSection>
    <FormatSection :title="controller.t('softEdgesSection')">
      <template v-if="controller.hasDetailedCapabilities.value" #control>
        <PictureEffectPresetField :controller="controller" category="softEdges" />
      </template>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureSoftEdgesEditor
          hide-preset
          :owner-key="softEdges.ownerKey"
          :value="softEdges.value"
          :disabled="softEdges.disabled"
          :t="controller.t"
          :on-commit="softEdges.apply"
        />
      </template>
      <template v-else>
        <PictureFormatChoiceField :controller="controller" field="softEdgePreset" />
        <PictureFormatNumberField :controller="controller" field="softEdgeSizePt" :unit="unit" />
      </template>
    </FormatSection>
    <FormatSection :title="controller.t('format3dSection')">
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureFormat3dEditor
          :owner-key="format3d.ownerKey"
          :value="format3d.value"
          :disabled="format3d.disabled"
          :t="controller.t"
          :on-commit="format3d.apply"
        />
        <p v-if="format3d.error" role="alert">{{ format3d.error }}</p>
        <p v-else-if="showReason(format3d.reason)">{{ format3d.reason }}</p>
      </template>
      <template v-else>
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
      </template>
    </FormatSection>
    <FormatSection :title="controller.t('rotation3dSection')">
      <template v-if="controller.hasDetailedCapabilities.value" #control>
        <PictureEffectPresetField :controller="controller" category="rotation3d" />
      </template>
      <template v-if="controller.hasDetailedCapabilities.value">
        <PictureRotation3dEditor
          hide-preset
          :owner-key="rotation3d.ownerKey"
          :value="rotation3d.value"
          :disabled="rotation3d.disabled"
          :t="controller.t"
          :on-commit="rotation3d.apply"
        />
      </template>
      <template v-else>
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
      </template>
    </FormatSection>
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
