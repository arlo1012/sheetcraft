<script setup lang="ts">
import { ref, watch } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
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
const { t } = useAppI18n();
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t(editing ? 'sparkline.edit' : 'sparkline.create')"
    :aria-label="t(editing ? 'sparkline.edit' : 'sparkline.create')"
    role="dialog"
    aria-modal="true"
    width="min(460px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
    @opened="focusInitialRange"
  >
    <Form
      class="sparkline-dialog sheetcraft-form-grid"
      label-align="top"
      :prevent-submit-default="true"
    >
      <section class="sparkline-dialog__range" :aria-label="t('sparkline.selectData')">
        <h3 class="sparkline-dialog__legend">{{ t("sparkline.selectData") }}</h3>
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
      </section>
      <section class="sparkline-dialog__range" :aria-label="t('sparkline.selectLocation')">
        <h3 class="sparkline-dialog__legend">{{ t("sparkline.selectLocation") }}</h3>
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
      </section>
      <template v-if="editing">
        <div class="sparkline-dialog__edit-row">
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
        </div>
        <div class="sparkline-dialog__edit-row">
          <FormItem :label="t('sparkline.color')">
            <ColorPaletteSelect
              :model-value="draft.sparkline.color"
              :label="t('sparkline.color')"
              default-color="#2563eb"
              size="small"
              show-value
              :disabled="disabled"
              @select="draft.sparkline.color = $event ?? '#2563eb'"
            />
          </FormItem>
          <FormItem :label="t('sparkline.negative')">
            <ColorPaletteSelect
              :model-value="draft.sparkline.negativeColor"
              :label="t('sparkline.negative')"
              default-color="#ef4444"
              size="small"
              show-value
              :disabled="disabled"
              @select="draft.sparkline.negativeColor = $event ?? '#ef4444'"
            />
          </FormItem>
        </div>
        <div class="sparkline-dialog__row">
          <Checkbox v-if="draft.sparkline.type === 'line'" v-model="draft.sparkline.markers">{{
            t("sparkline.markers")
          }}</Checkbox
          ><Checkbox v-model="draft.sparkline.axis">{{ t("sparkline.axis") }}</Checkbox
          ><Checkbox v-model="draft.sparkline.showHidden">{{ t("chart.showHidden") }}</Checkbox>
        </div>
      </template>
      <p>{{ t("sparkline.hint") }}</p>
      <TAlert
        v-if="error"
        theme="error"
        :message="t(failed ? 'sparkline.failed' : 'sparkline.invalid')"
        role="alert"
      />
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.sparkline-dialog {
  display: grid;
  gap: 10px;
  &__range {
    display: grid;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 10px 12px;
    border: 0;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__legend {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    font-weight: var(--sheetcraft-font-weight-semibold);
    color: var(--sheetcraft-text-primary);
  }
  &__edit-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  &__reference {
    width: 100%;
  }
  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    padding: 9px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  p {
    margin: 0;
    font-size: 12px;
    color: var(--sheetcraft-text-secondary);
  }
  p#{&}__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
