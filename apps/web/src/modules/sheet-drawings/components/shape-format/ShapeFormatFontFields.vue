<script setup lang="ts">
import { computed } from "vue";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import ShapeFontFamilyField from "../ShapeFontFamilyField.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import FormatField from "../../../../shared/format-pane/FormatField.vue";
import TextStyleToggleGroup, {
  type TextStyleToggleItem,
  type TextStyleToggleKey,
} from "../../../../shared/text-format/TextStyleToggleGroup.vue";
import ShapeFormatAlignmentField from "./ShapeFormatAlignmentField.vue";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import type { ShapeFormatBooleanField } from "../../shape-format-pane-model";
import type { ShapeFormatPresentation } from "../../useShapeFormatPresentation";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{
  controller: ShapeFormatController;
  presentationState?: ShapeFormatPresentation;
}>();
const colorAction = computed(() => props.controller.session.fieldAction("textColor"));
const styleFieldByKey: Record<TextStyleToggleKey, ShapeFormatBooleanField> = {
  bold: "textBold",
  italic: "textItalic",
  underline: "textUnderline",
  strike: "textStrike",
};
function stylePressed(field: ShapeFormatBooleanField): boolean | "mixed" {
  return props.controller.isMixedField(field)
    ? "mixed"
    : props.controller.props.snapshot?.values[field] === true;
}
const styleItems = computed<readonly TextStyleToggleItem[]>(() =>
  (["bold", "italic", "underline", "strike"] as const).map((key) => {
    const field = styleFieldByKey[key];
    return {
      key,
      label: props.controller.fieldLabel(field),
      pressed: stylePressed(field),
      disabled: !props.controller.fieldCapability(field).enabled,
      fieldAttr: field,
    };
  }),
);
const styleReason = computed(() => {
  const caps = (["textBold", "textItalic", "textUnderline", "textStrike"] as const).map((field) =>
    props.controller.fieldCapability(field),
  );
  if (caps.some((cap) => cap.enabled)) return undefined;
  return caps.find((cap) => cap.reason)?.reason;
});
function toggleStyle(key: TextStyleToggleKey): void {
  const field = styleFieldByKey[key];
  if (!props.controller.fieldCapability(field).enabled) return;
  const next = props.controller.props.snapshot?.values[field] !== true;
  props.controller.session.fieldAction(field)(next);
}
</script>
<template>
  <div class="shape-format-font-fields">
    <FormatSection
      :title="controller.s.value('font')"
      initially-open
      :open="presentationState?.fontOpen"
      @update:open="
        (value) => {
          if (presentationState) presentationState.fontOpen = value;
        }
      "
    >
      <FormatField
        :label="controller.s.value('fontFamily')"
        :reason="controller.fieldCapability('fontFamily').reason"
        data-shape-format-field="fontFamily"
      >
        <ShapeFontFamilyField :controller="controller" appearance="field" />
      </FormatField>
      <ShapeFormatNumberField :controller="controller" field="fontSizePt" />
      <FormatField :label="controller.s.value('textColor')" data-shape-format-field="textColor">
        <ColorPaletteSelect
          :model-value="controller.props.snapshot?.values.textColor || null"
          :mixed="controller.isMixedField('textColor')"
          :label="controller.s.value('textColor')"
          :disabled="!controller.fieldCapability('textColor').enabled"
          size="small"
          show-value
          @select="(color) => colorAction(color ?? '')"
        />
      </FormatField>
      <FormatField :label="controller.s.value('textStyle')" :reason="styleReason">
        <TextStyleToggleGroup
          variant="field"
          history-control="discrete"
          :items="styleItems"
          :label="controller.s.value('textStyle')"
          @toggle="toggleStyle"
        />
      </FormatField>
    </FormatSection>
    <FormatSection
      :title="controller.s.value('paragraph')"
      :open="presentationState?.paragraphOpen"
      @update:open="
        (value) => {
          if (presentationState) presentationState.paragraphOpen = value;
        }
      "
    >
      <ShapeFormatAlignmentField :controller="controller" field="paragraphAlignment" />
      <ShapeFormatNumberField :controller="controller" field="paragraphBeforePt" />
      <ShapeFormatNumberField :controller="controller" field="paragraphAfterPt" />
      <ShapeFormatChoiceField :controller="controller" field="paragraphLineSpacing" />
      <ShapeFormatNumberField
        v-show="
          controller.isMixedField('paragraphLineSpacing') ||
          controller.props.snapshot?.values.paragraphLineSpacing === 'exact'
        "
        :controller="controller"
        field="paragraphLineSpacingPt"
      />
    </FormatSection>
  </div>
</template>
