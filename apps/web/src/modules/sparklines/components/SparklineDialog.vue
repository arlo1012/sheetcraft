<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import type { SparklineDraft } from "../useSparklineActions";
const props = defineProps<{
  initial: SparklineDraft;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: SparklineDraft]; close: [] }>();
const draft = ref({ ...props.initial, sparkline: { ...props.initial.sparkline } });
const { t } = useAppI18n();
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('sparkline.title')"
    width="530px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="sparkline-dialog">
      <label
        >{{ t("sparkline.source")
        }}<RangeReferenceInput
          v-model="draft.source"
          :label="t('sparkline.source')"
          :select-reference="selectReference"
      /></label>
      <label
        >{{ t("sparkline.destination")
        }}<RangeReferenceInput
          v-model="draft.destination"
          :label="t('sparkline.destination')"
          :select-reference="selectReference"
      /></label>
      <label
        >{{ t("sparkline.type")
        }}<Select
          v-model="draft.sparkline.type"
          :options="[
            { value: 'line', label: t('chart.line') },
            { value: 'column', label: t('chart.column') },
            { value: 'winLoss', label: t('sparkline.winLoss') },
          ]"
      /></label>
      <div class="sparkline-dialog__row">
        <label
          >{{ t("sparkline.color") }}<input v-model="draft.sparkline.color" type="color" /></label
        ><label
          >{{ t("sparkline.negative") }}<input v-model="draft.sparkline.negativeColor" type="color"
        /></label>
      </div>
      <div class="sparkline-dialog__row">
        <Checkbox v-model="draft.sparkline.markers">{{ t("sparkline.markers") }}</Checkbox
        ><Checkbox v-model="draft.sparkline.axis">{{ t("sparkline.axis") }}</Checkbox
        ><Checkbox v-model="draft.sparkline.showHidden">{{ t("chart.showHidden") }}</Checkbox>
      </div>
      <label
        >{{ t("sparkline.empty")
        }}<Select
          v-model="draft.sparkline.empty"
          :options="[
            { value: 'gap', label: t('sparkline.gap') },
            { value: 'zero', label: t('sparkline.zero') },
            { value: 'connect', label: t('sparkline.connect') },
          ]"
      /></label>
      <p>{{ t("sparkline.hint") }}</p>
      <p v-if="error" class="sparkline-dialog__error" role="alert">{{ t("sparkline.invalid") }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.sparkline-dialog {
  display: grid;
  gap: 14px;
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    > :last-child {
      flex: 1;
    }
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 14px;
    input[type="color"] {
      width: 34px;
      height: 26px;
      padding: 0;
      border: 0;
    }
  }
  p {
    margin: 0;
    font-size: 12px;
    color: var(--idea-text-secondary);
  }
  &__error {
    color: var(--idea-color-error) !important;
  }
}
</style>
