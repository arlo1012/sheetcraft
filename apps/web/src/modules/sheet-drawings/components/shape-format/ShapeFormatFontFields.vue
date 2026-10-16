<script setup lang="ts">
import { computed } from "vue";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import ShapeFontFamilyField from "../ShapeFontFamilyField.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import ShapeFormatNumberField from "./ShapeFormatNumberField.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import ShapeFormatChoiceField from "./ShapeFormatChoiceField.vue";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController }>();
const colorAction = computed(() => props.controller.session.fieldAction("textColor"));
</script>
<template>
  <div class="shape-format-font-fields">
    <FormatSection :title="controller.s.value('font')" initially-open>
      <PictureFormatField
        :label="controller.s.value('fontFamily')"
        :reason="controller.fieldCapability('fontFamily').reason"
        data-shape-format-field="fontFamily"
      >
        <ShapeFontFamilyField :controller="controller" />
      </PictureFormatField>
      <ShapeFormatNumberField :controller="controller" field="fontSizePt" />
      <PictureFormatField
        :label="controller.s.value('textColor')"
        data-shape-format-field="textColor"
      >
        <ColorPaletteSelect
          :model-value="controller.props.snapshot?.values.textColor || null"
          :mixed="controller.isMixedField('textColor')"
          :label="controller.s.value('textColor')"
          :disabled="!controller.fieldCapability('textColor').enabled"
          show-value
          @select="(color) => colorAction(color ?? '')"
        />
      </PictureFormatField>
      <div class="shape-format-font-fields__toggles">
        <ShapeFormatCheckbox :controller="controller" field="textBold" />
        <ShapeFormatCheckbox :controller="controller" field="textItalic" />
        <ShapeFormatCheckbox :controller="controller" field="textUnderline" />
        <ShapeFormatCheckbox :controller="controller" field="textStrike" />
      </div>
    </FormatSection>
    <FormatSection :title="controller.s.value('paragraph')">
      <ShapeFormatChoiceField :controller="controller" field="paragraphAlignment" />
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
<style scoped lang="scss">
.shape-format-font-fields__toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
