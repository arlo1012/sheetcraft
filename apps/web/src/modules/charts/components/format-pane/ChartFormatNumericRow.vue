<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { RotateCcw } from "lucide-vue-next";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import type { NumericFieldSpec } from "../../../../shared/numeric-field/types";
import type { ChartFormatNumericField } from "../../chart-format-pane";
import type {
  ChartFormatPaneController,
  ChartFormatSharedNumericField,
} from "./useChartFormatPane";

const props = withDefaults(
  defineProps<{
    controller: ChartFormatPaneController;
    field: ChartFormatSharedNumericField;
    inputId: string;
    label: string;
    spec: NumericFieldSpec;
    invalidMessage?: string;
    inputDisabled?: boolean;
    resettable?: boolean;
  }>(),
  {
    invalidMessage: undefined,
    inputDisabled: undefined,
    resettable: true,
  },
);

let registeredControl: InstanceType<typeof NumericField> | null = null;
function setControlRef(instance: unknown): void {
  const next = (instance as InstanceType<typeof NumericField> | null) ?? null;
  if (next === registeredControl) return;
  props.controller.registerNumericControl(props.field, next, registeredControl);
  registeredControl = next;
}
onBeforeUnmount(() => {
  if (registeredControl) {
    props.controller.registerNumericControl(props.field, null, registeredControl);
    registeredControl = null;
  }
});

const numericValue = computed(() => props.controller.numericValues[props.field].value);
const resolvedDisabled = computed(() => props.inputDisabled ?? props.controller.disabled.value);
const resolvedInvalidMessage = computed(
  () => props.invalidMessage ?? props.controller.t("chart.formatInvalidNumber"),
);
const resetDisabled = computed(
  () =>
    props.controller.disabled.value ||
    (numericValue.value.kind === "auto" &&
      !props.controller.sharedNumericDrafts[props.field]?.dirty),
);
</script>

<template>
  <div class="chart-format-pane__field" :data-chart-format-field="field">
    <label :for="inputId">{{ label }}</label>
    <div v-if="resettable" class="chart-format-pane__number">
      <NumericField
        :ref="setControlRef"
        :id="inputId"
        :owner-key="`${controller.ownerKey.value}/${field}`"
        :value="numericValue"
        :spec="spec"
        :label="label"
        :auto-text="controller.t('chart.formatAuto')"
        :disabled="resolvedDisabled"
        :invalid-message="resolvedInvalidMessage"
        :rejected-message="controller.t('chart.formatApplyFailed')"
        :stale-message="controller.t('chart.formatApplyFailed')"
        :external-error="controller.sharedNumericResetErrors[field]"
        :focus-boundary="() => controller.sharedNumericFocusBoundary(field)"
        :on-commit="controller.numericCommits[field].value"
        presentation="inline-stepper"
        full-width
        :show-unit="false"
        @draft-change="controller.sharedNumericDraftChange(field, $event)"
        @cancel="controller.clearNumericResetError(field)"
      /><TButton
        variant="text"
        shape="square"
        size="small"
        :disabled="resetDisabled"
        :aria-label="controller.t('chart.formatReset')"
        :data-chart-format-reset="field"
        :onClick="
          controller.captureAction(() => controller.resetNumber(field as ChartFormatNumericField))
        "
        ><RotateCcw :size="14" aria-hidden="true"
      /></TButton>
    </div>
    <NumericField
      v-else
      :ref="setControlRef"
      :id="inputId"
      :owner-key="`${controller.ownerKey.value}/${field}`"
      :value="numericValue"
      :spec="spec"
      :label="label"
      :auto-text="controller.t('chart.formatAuto')"
      :disabled="resolvedDisabled"
      :invalid-message="resolvedInvalidMessage"
      :rejected-message="controller.t('chart.formatApplyFailed')"
      :stale-message="controller.t('chart.formatApplyFailed')"
      :external-error="controller.sharedNumericResetErrors[field]"
      :focus-boundary="() => controller.sharedNumericFocusBoundary(field)"
      :on-commit="controller.numericCommits[field].value"
      presentation="inline-stepper"
      full-width
      :show-unit="false"
      @draft-change="controller.sharedNumericDraftChange(field, $event)"
      @cancel="controller.clearNumericResetError(field)"
    />
  </div>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;
</style>
