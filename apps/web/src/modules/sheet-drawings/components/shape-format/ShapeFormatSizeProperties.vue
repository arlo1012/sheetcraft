<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
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
const bindings = computed(() => props.controller.props.snapshot?.connectorBindings ?? []);
const disconnect = computed(() => props.controller.session.disconnectConnectorAction());
</script>
<template>
  <div class="shape-format-size-properties">
    <PictureFormatSection :title="controller.props.t('sizeSection')" initially-open>
      <div v-if="isConnector" class="shape-format-size-properties__connector">
        <p class="shape-format-size-properties__reason" data-shape-connector-size-limit>
          {{ controller.s.value("connectorSizeReason") }}
        </p>
        <template v-if="bindings.length">
          <p class="shape-format-size-properties__reason">
            {{ controller.s.value("connectorBoundSizeReason") }}
          </p>
          <ul data-shape-connector-bindings>
            <li v-for="binding in bindings" :key="binding.endpoint">
              {{
                controller.s.value(
                  binding.endpoint === "begin" ? "connectorBegin" : "connectorEnd",
                )
              }}:
              {{ binding.targetName }}
            </li>
          </ul>
          <TButton
            size="small"
            variant="outline"
            data-shape-connector-disconnect
            :disabled="controller.props.capabilities.disconnectConnector?.enabled !== true"
            @click="disconnect"
            >{{ controller.s.value("connectorDisconnect") }}</TButton
          >
        </template>
      </div>
      <ShapeFormatNumberField :controller="controller" field="sizeHeightPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="sizeWidthPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="rotationDeg" />
      <ShapeFormatNumberField :controller="controller" field="scaleHeightPercent" />
      <ShapeFormatNumberField :controller="controller" field="scaleWidthPercent" />
      <ShapeFormatCheckbox :controller="controller" field="lockAspectRatio" />
      <div v-if="!isConnector">
        <TCheckbox :model-value="false" disabled>{{
          controller.s.value("relativeOriginal")
        }}</TCheckbox>
        <p class="shape-format-size-properties__reason">
          {{ controller.s.value("relativeOriginalReason") }}
        </p>
      </div>
    </PictureFormatSection>
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
.shape-format-size-properties__connector {
  margin-bottom: 10px;
  ul {
    padding-left: 18px;
    margin: 6px 0;
    overflow-wrap: anywhere;
  }
}
</style>
