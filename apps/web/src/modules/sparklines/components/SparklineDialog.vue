<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
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
    width="530px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
    @opened="focusInitialRange"
  >
    <div class="sparkline-dialog">
      <fieldset class="sparkline-dialog__range">
        <legend>{{ t("sparkline.selectData") }}</legend>
        <div class="sparkline-dialog__field">
          <span>{{ t("sparkline.source") }}</span
          ><RangeReferenceInput
            ref="sourceInput"
            v-model="draft.source"
            :label="t('sparkline.source')"
            :disabled="disabled"
            :select-reference="selectReference"
          />
        </div>
      </fieldset>
      <fieldset class="sparkline-dialog__range">
        <legend>{{ t("sparkline.selectLocation") }}</legend>
        <div class="sparkline-dialog__field">
          <span>{{ t("sparkline.destination") }}</span
          ><RangeReferenceInput
            ref="destinationInput"
            v-model="draft.destination"
            :label="t('sparkline.destination')"
            :disabled="disabled"
            :select-reference="selectReference"
          />
        </div>
      </fieldset>
      <template v-if="editing">
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
            >{{ t("sparkline.negative")
            }}<input v-model="draft.sparkline.negativeColor" type="color"
          /></label>
        </div>
        <div class="sparkline-dialog__row">
          <Checkbox v-if="draft.sparkline.type === 'line'" v-model="draft.sparkline.markers">{{
            t("sparkline.markers")
          }}</Checkbox
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
      </template>
      <p>{{ t("sparkline.hint") }}</p>
      <p v-if="error" class="sparkline-dialog__error" role="alert">
        {{ t(failed ? "sparkline.failed" : "sparkline.invalid") }}
      </p>
    </div>
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
  &__field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
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
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-color-error) !important;
  }
}
</style>
