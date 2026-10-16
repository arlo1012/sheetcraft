<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import ShapeFormatFontFields from "./ShapeFormatFontFields.vue";
import type { ShapeFormatPresentation } from "../../useShapeFormatPresentation";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = withDefaults(
  defineProps<{
    controller: ShapeFormatController;
    unit: PictureFormatLengthUnit;
    includeFont?: boolean;
    presentationState?: ShapeFormatPresentation;
  }>(),
  { includeFont: true },
);
const marginFields = [
  "textMarginLeftPt",
  "textMarginRightPt",
  "textMarginTopPt",
  "textMarginBottomPt",
] as const;
const marginPresets = {
  standard: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
  none: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
} as const;
const marginsCapability = computed(() => {
  for (const field of marginFields) {
    const c = props.controller.fieldCapability(field);
    if (!c.enabled) return c;
  }
  return { enabled: true, reason: undefined };
});
const root = ref<HTMLElement>();
const marginsPopup = useNativePopupOwnership({
  owner: () =>
    props.controller.props.snapshot ? `${props.controller.ownerKey.value}:margins` : undefined,
  disabled: () => !marginsCapability.value.enabled,
  root: () => root.value,
});
const marginsPopupHost = marginsPopup.host;
const marginInputId = `shape-format-margins-${useId()}`;
const marginNativeControl = computed(() => ({
  attributes: {
    id: marginInputId,
    role: "combobox",
    "aria-label": props.controller.s.value("textMargins"),
    "aria-expanded": String(marginsPopup.visible.value),
    "data-format-pane-history-control": "readonly-combobox",
  },
}));
const selectedPreset = computed(() => {
  if (marginFields.some((field) => props.controller.isMixedField(field))) return undefined;
  const values = props.controller.props.snapshot?.values;
  if (!values) return "custom";
  for (const [key, preset] of Object.entries(marginPresets))
    if (
      Math.abs((values.textMarginLeftPt ?? NaN) - preset.leftPt) < 1e-6 &&
      Math.abs((values.textMarginRightPt ?? NaN) - preset.rightPt) < 1e-6 &&
      Math.abs((values.textMarginTopPt ?? NaN) - preset.topPt) < 1e-6 &&
      Math.abs((values.textMarginBottomPt ?? NaN) - preset.bottomPt) < 1e-6
    )
      return key;
  return "custom";
});
const options = computed(() => [
  { value: "standard", label: props.controller.s.value("marginStandard") },
  { value: "none", label: props.controller.s.value("marginNone") },
  { value: "custom", label: props.controller.s.value("marginCustom"), disabled: true },
]);
const action = computed(() => {
  const apply = props.controller.session.marginsAction();
  return (value: unknown) =>
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(marginPresets, value) &&
    apply(marginPresets[value as keyof typeof marginPresets]);
});
</script>
<template>
  <div ref="root" class="shape-format-text-box">
    <Teleport to="body"><div ref="marginsPopupHost" data-shape-format-margins-popup /></Teleport>
    <FormatSection
      :title="controller.s.value('textBox')"
      initially-open
      :open="presentationState?.textBoxOpen"
      @update:open="
        (value) => {
          if (presentationState) presentationState.textBoxOpen = value;
        }
      "
    >
      <ShapeFormatChoiceField :controller="controller" field="textVerticalAlignment" />
      <ShapeFormatChoiceField :controller="controller" field="textDirection" />
      <ShapeFormatChoiceField
        v-show="
          controller.isMixedField('textDirection') ||
          controller.props.snapshot?.values.textDirection === 'stacked'
        "
        :controller="controller"
        field="textLineOrder"
      />
      <PictureFormatField
        :label="controller.s.value('textMargins')"
        :reason="marginsCapability.enabled ? undefined : marginsCapability.reason"
        data-shape-format-margins
      >
        <TSelect
          v-native-control="marginNativeControl"
          :popup-visible="marginsPopup.visible.value"
          :popup-props="marginsPopup.popupProps"
          @popup-visible-change="marginsPopup.onVisibleChange.value"
          :model-value="selectedPreset ?? ''"
          :placeholder="
            selectedPreset === undefined ? controller.s.value('mixedValues') : undefined
          "
          :options="options"
          :disabled="!marginsCapability.enabled"
          size="small"
          :aria-label="controller.s.value('textMargins')"
          :onChange="action"
        />
      </PictureFormatField>
      <ShapeFormatNumberField :controller="controller" field="textMarginLeftPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="textMarginRightPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="textMarginTopPt" :unit="unit" />
      <ShapeFormatNumberField :controller="controller" field="textMarginBottomPt" :unit="unit" />
      <ShapeFormatCheckbox :controller="controller" field="textResizeToFit" />
      <ShapeFormatCheckbox :controller="controller" field="textOverflow" />
      <ShapeFormatCheckbox :controller="controller" field="textWrap" />
    </FormatSection>
    <ShapeFormatFontFields
      v-if="includeFont"
      :controller="controller"
      :presentation-state="presentationState"
    />
  </div>
</template>
