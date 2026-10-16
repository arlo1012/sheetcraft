<script setup lang="ts">
import { computed, useId } from "vue";
import PictureFormatFeedback from "./PictureFormatFeedback.vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { PictureIntrinsicSizeStatus } from "../../usePictureIntrinsicSize";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import {
  pictureFormatDisplayNumber,
  pictureFormatPointsToUnit,
  type PictureFormatLengthUnit,
} from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PictureFormatNumberField from "./PictureFormatNumberField.vue";
import PictureFormatField from "./PictureFormatField.vue";
import PictureFormatCheckbox from "./PictureFormatCheckbox.vue";
import PictureFormatResetButton from "./PictureFormatResetButton.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  unit: PictureFormatLengthUnit;
  intrinsicStatus?: PictureIntrinsicSizeStatus;
  retryIntrinsic?: () => void;
}>();
const anchorFeedbackId = `picture-format-anchor-${useId()}`;
const anchor = computed(() => props.controller.choice("anchor"));
const title = computed(() => props.controller.text("altTitle"));
const description = computed(() => props.controller.text("altDescription"));
const original = computed(() => {
  const size = props.controller.snapshot.value?.originalSizePt;
  if (!size) return undefined;
  return `${pictureFormatDisplayNumber(pictureFormatPointsToUnit(size.width, props.unit))} × ${pictureFormatDisplayNumber(pictureFormatPointsToUnit(size.height, props.unit))} ${props.controller.t(props.unit === "in" ? "unitIn" : props.unit === "cm" ? "unitCm" : "unitPt")}`;
});
</script>
<template>
  <div class="picture-format-size-properties">
    <FormatSection :title="controller.t('sizeSection')" initially-open>
      <PictureFormatNumberField :controller="controller" field="sizeHeightPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="sizeWidthPt" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="rotationDeg" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="scaleHeightPercent" :unit="unit" />
      <PictureFormatNumberField :controller="controller" field="scaleWidthPercent" :unit="unit" />
      <PictureFormatCheckbox :controller="controller" field="lockAspectRatio" />
      <PictureFormatCheckbox :controller="controller" field="relativeToOriginalSize" />
      <PictureFormatField v-if="original" :label="controller.t('originalSize')"
        ><span>{{ original }}</span></PictureFormatField
      >
      <div
        v-if="
          controller.snapshot.value?.owner.assetId &&
          !original &&
          intrinsicStatus &&
          intrinsicStatus !== 'idle'
        "
        class="picture-format-size-properties__original-status"
        role="status"
        data-picture-original-status
      >
        <span>{{
          controller.t(
            intrinsicStatus === "loading" ? "originalSizeLoading" : "originalSizeUnavailable",
          )
        }}</span>
        <TButton
          v-if="intrinsicStatus === 'unavailable' && retryIntrinsic"
          size="small"
          variant="text"
          data-picture-original-retry
          @click="retryIntrinsic()"
          >{{ controller.t("retryOriginalSize") }}</TButton
        >
      </div>
      <p class="picture-format-size-properties__hint">{{ controller.t("sizeHelp") }}</p>
      <PictureFormatResetButton :controller="controller" type="reset-size" />
    </FormatSection>
    <FormatSection :title="controller.t('propertiesSection')">
      <TRadioGroup
        :model-value="anchor.value"
        :disabled="anchor.disabled"
        :aria-label="controller.t('anchor')"
        role="radiogroup"
        :aria-describedby="anchor.error || anchor.reason ? anchorFeedbackId : undefined"
        class="picture-format-size-properties__anchors"
        data-picture-format-field="anchor"
        @change="anchor.select"
      >
        <TRadio value="move-size">{{ controller.t("anchorMoveSize") }}</TRadio>
        <TRadio value="move">{{ controller.t("anchorMove") }}</TRadio>
        <TRadio value="fixed">{{ controller.t("anchorFixed") }}</TRadio>
      </TRadioGroup>
      <PictureFormatFeedback :id="anchorFeedbackId" :reason="anchor.reason" :error="anchor.error" />
      <PictureFormatCheckbox :controller="controller" field="printObject" />
      <PictureFormatCheckbox :controller="controller" field="locked" />
    </FormatSection>
    <FormatSection :title="controller.t('altTextSection')">
      <PictureFormatField
        :label="controller.t('altTitle')"
        :reason="title.reason"
        :error="title.error"
        stacked
      >
        <template #default="{ feedbackId }"
          ><TInput
            :model-value="title.text"
            :disabled="title.disabled"
            :aria-label="controller.t('altTitle')"
            :aria-describedby="feedbackId"
            :aria-invalid="!!title.error"
            data-picture-format-field="altTitle"
            size="small"
            @change="title.edit"
            @focus="title.focus"
            @blur="title.blur"
            @enter="title.enter"
            @keydown="title.keydown"
        /></template>
      </PictureFormatField>
      <PictureFormatField
        :label="controller.t('altDescription')"
        :reason="description.reason"
        :error="description.error"
        stacked
      >
        <template #default="{ feedbackId }"
          ><TTextarea
            :model-value="description.text"
            :disabled="description.disabled"
            :aria-label="controller.t('altDescription')"
            :aria-describedby="feedbackId"
            :aria-invalid="!!description.error"
            data-picture-format-field="altDescription"
            :autosize="{ minRows: 4, maxRows: 8 }"
            @change="description.edit"
            @focus="description.focus"
            @blur="description.blur"
            @keydown="description.keydown"
        /></template>
      </PictureFormatField>
    </FormatSection>
  </div>
</template>
<style scoped lang="scss">
.picture-format-size-properties {
  &__anchors {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  &__original-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    margin: 0;
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
