<script setup lang="ts">
import { computed, useId } from "vue";
import PictureFormatFeedback from "./PictureFormatFeedback.vue";
import PictureCropShapeMenu from "../PictureCropShapeMenu.vue";
import { useAppI18n } from "../../../../shared/i18n";
import type { PictureFormatLengthUnit } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatResetButton from "./PictureFormatResetButton.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  unit: PictureFormatLengthUnit;
}>();
const shapeFeedbackId = `picture-format-shape-${useId()}`;
const shape = computed(() => props.controller.cropShape());
const { t } = useAppI18n();
</script>
<template>
  <div class="picture-format-picture">
    <FormatSection :title="controller.t('cropSection')" initially-open>
      <div
        role="group"
        :aria-label="t('image.cropShape')"
        :aria-describedby="
          shape.error || (shape.disabled && shape.reason) ? shapeFeedbackId : undefined
        "
      >
        <PictureCropShapeMenu
          :owner-id="shape.ownerKey"
          :current="shape.value"
          :disabled="shape.disabled"
          :handler="shape.apply"
          :labels="{ trigger: t('image.cropShape'), applyRejected: controller.t('applyRejected') }"
        />
        <PictureFormatFeedback
          :id="shapeFeedbackId"
          :reason="shape.disabled ? shape.reason : undefined"
          :error="shape.error"
        />
      </div>
      <h3>{{ controller.t("sourcePosition") }}</h3>
      <PictureFormatNumberField :controller="controller" field="sourceWidthPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="sourceHeightPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="sourceOffsetXPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="sourceOffsetYPt" :unit="unit" />
      <h3>{{ controller.t("cropPosition") }}</h3>
      <PictureFormatNumberField :controller="controller" field="cropWidthPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="cropHeightPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="cropLeftPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="cropTopPt" :unit="unit" />
      <p>{{ controller.t("cropHelp") }}</p>
      <PictureFormatResetButton :controller="controller" type="reset-crop" />
    </FormatSection>
    <div class="picture-format-picture__appearance-reset">
      <PictureFormatResetButton :controller="controller" type="reset-picture" />
    </div>
  </div>
</template>
<style scoped lang="scss">
.picture-format-picture {
  h3 {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 20px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
  &__appearance-reset {
    padding: 14px 0;
  }
}
</style>
