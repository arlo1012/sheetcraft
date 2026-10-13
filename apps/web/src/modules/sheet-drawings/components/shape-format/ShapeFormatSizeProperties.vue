<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import PictureFormatSection from "../../../sheet-images/components/format-pane/PictureFormatSection.vue";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import ShapeFormatTextField from "./ShapeFormatTextField.vue";
import ShapeFormatTextBox from "./ShapeFormatTextBox.vue";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController; unit: PictureFormatLengthUnit }>();
const isConnector = computed(
  () =>
    props.controller.props.snapshot?.drawing.kind === "shape" &&
    !!props.controller.props.snapshot.drawing.shapeConnector,
);
</script>
<template>
  <div class="shape-format-size-properties">
    <PictureFormatSection
      v-if="!isConnector"
      :title="controller.props.t('sizeSection')"
      initially-open
    >
      <ShapeFormatNumberField :controller="controller" field="sizeHeightPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="sizeWidthPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="rotationDeg" />
      <ShapeFormatNumberField :controller="controller" field="scaleHeightPercent" />
      <ShapeFormatNumberField :controller="controller" field="scaleWidthPercent" />
      <ShapeFormatCheckbox :controller="controller" field="lockAspectRatio" />
      <div>
        <TCheckbox :model-value="false" disabled>{{
          controller.s.value("relativeOriginal")
        }}</TCheckbox>
        <p class="shape-format-size-properties__reason">
          {{ controller.s.value("relativeOriginalReason") }}
        </p>
      </div>
    </PictureFormatSection>
    <p v-else class="shape-format-size-properties__reason" data-shape-connector-size-limit>
      {{ controller.s.value("connectorSizeReason") }}
    </p>
    <PictureFormatSection :title="controller.props.t('propertiesSection')" initially-open>
      <ShapeFormatChoiceField v-if="!isConnector" :controller="controller" field="anchor" />
      <ShapeFormatCheckbox :controller="controller" field="printObject" />
      <ShapeFormatCheckbox :controller="controller" field="locked" />
    </PictureFormatSection>
    <ShapeFormatTextBox
      v-if="!isConnector"
      :controller="controller"
      :unit="unit"
      :include-font="false"
    />
    <PictureFormatSection :title="controller.props.t('altTextSection')">
      <ShapeFormatTextField :controller="controller" field="altTitle" />
      <ShapeFormatTextField :controller="controller" field="altDescription" multiline />
    </PictureFormatSection>
  </div>
</template>
<style scoped lang="scss">
.shape-format-size-properties__reason {
  margin: 4px 0 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
</style>
