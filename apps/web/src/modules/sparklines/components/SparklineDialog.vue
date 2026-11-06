<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import type { SparklineDraft } from "../useSparklineActions";
const props = defineProps<{
  initial: SparklineDraft;
  editing?: boolean;
  disabled: boolean;
  error: boolean;
  failed?: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: SparklineDraft]; close: [] }>();
const draft = ref({ ...props.initial, sparkline: { ...props.initial.sparkline } });
const sourceInput = ref<InstanceType<typeof RangeReferenceInput>>();
const destinationInput = ref<InstanceType<typeof RangeReferenceInput>>();
const initialFocus =
  !props.editing && props.initial.source && !props.initial.destination ? "destination" : "source";
let focused = false;
function focusInitialRange(): void {
  if (focused || props.disabled || props.suspended) return;
  const input = initialFocus === "destination" ? destinationInput.value : sourceInput.value;
  if (!input) return;
  input.focus();
  focused = true;
}
watch([sourceInput, destinationInput], focusInitialRange, { flush: "post" });
const { t, locale } = useAppI18n();
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t(editing ? 'sparkline.edit' : 'sparkline.create')"
    :aria-label="t(editing ? 'sparkline.edit' : 'sparkline.create')"
    role="dialog"
    aria-modal="true"
    width="min(530px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
    @opened="focusInitialRange"
  >
    <Form
      class="sparkline-dialog sheetcraft-form-grid"
      label-align="right"
      :label-width="locale === 'zh-CN' ? 104 : 136"
      :prevent-submit-default="true"
    >
      <fieldset class="sparkline-dialog__range">
        <legend>{{ t("sparkline.selectData") }}</legend>
        <FormItem :label="t('sparkline.source')">
          <div class="sparkline-dialog__reference">
            <RangeReferenceInput
              ref="sourceInput"
              v-model="draft.source"
              :label="t('sparkline.source')"
              :disabled="disabled"
              :select-reference="selectReference"
            />
          </div>
        </FormItem>
      </fieldset>
      <fieldset class="sparkline-dialog__range">
        <legend>{{ t("sparkline.selectLocation") }}</legend>
        <FormItem :label="t('sparkline.destination')">
          <div class="sparkline-dialog__reference">
            <RangeReferenceInput
              ref="destinationInput"
              v-model="draft.destination"
              :label="t('sparkline.destination')"
              :disabled="disabled"
              :select-reference="selectReference"
            />
          </div>
        </FormItem>
      </fieldset>
      <template v-if="editing">
        <FormItem :label="t('sparkline.type')"
          ><Select
            v-model="draft.sparkline.type"
            v-native-control="{ attributes: { 'aria-label': t('sparkline.type') } }"
            :options="[
              { value: 'line', label: t('chart.line') },
              { value: 'column', label: t('chart.column') },
              { value: 'winLoss', label: t('sparkline.winLoss') },
            ]"
        /></FormItem>
        <FormItem :label="t('sparkline.color')"
          ><input v-model="draft.sparkline.color" type="color" :aria-label="t('sparkline.color')"
        /></FormItem>
        <FormItem :label="t('sparkline.negative')"
          ><input
            v-model="draft.sparkline.negativeColor"
            type="color"
            :aria-label="t('sparkline.negative')"
        /></FormItem>
        <FormItem
          ><div class="sparkline-dialog__row">
            <Checkbox v-if="draft.sparkline.type === 'line'" v-model="draft.sparkline.markers">{{
              t("sparkline.markers")
            }}</Checkbox
            ><Checkbox v-model="draft.sparkline.axis">{{ t("sparkline.axis") }}</Checkbox
            ><Checkbox v-model="draft.sparkline.showHidden">{{ t("chart.showHidden") }}</Checkbox>
          </div></FormItem
        >
        <FormItem :label="t('sparkline.empty')"
          ><Select
            v-model="draft.sparkline.empty"
            v-native-control="{ attributes: { 'aria-label': t('sparkline.empty') } }"
            :options="[
              { value: 'gap', label: t('sparkline.gap') },
              { value: 'zero', label: t('sparkline.zero') },
              { value: 'connect', label: t('sparkline.connect') },
            ]"
        /></FormItem>
      </template>
      <p>{{ t("sparkline.hint") }}</p>
      <p v-if="error" class="sparkline-dialog__error" role="alert">
        {{ t(failed ? "sparkline.failed" : "sparkline.invalid") }}
      </p>
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.sparkline-dialog {
  display: grid;
  gap: 14px;
  &__range {
    min-width: 0;
    margin: 0;
    padding: 12px 0 0;
    border: 0;
    border-top: 1px solid var(--sheetcraft-border-subtle);
    legend {
      padding: 0 8px 0 0;
      font-weight: 500;
    }
  }
  &__reference {
    width: 100%;
  }
  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
  }
  input[type="color"] {
    width: 34px;
    height: 26px;
    padding: 0;
    border: 0;
  }
  p {
    margin: 0;
    font-size: 12px;
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-color-error) !important;
  }
}
</style>
