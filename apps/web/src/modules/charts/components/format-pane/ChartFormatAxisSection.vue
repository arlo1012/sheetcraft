<script setup lang="ts">
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import {
  chartAxisBoundSpec as axisBoundSpec,
  chartAxisUnitSpec as axisUnitSpec,
  chartLabelAngleSpec as labelAngleSpec,
} from "../../chart-format-specs";
import ChartFormatNumericRow from "./ChartFormatNumericRow.vue";
import type { ChartFormatPaneController } from "./useChartFormatPane";

defineProps<{ controller: ChartFormatPaneController }>();
</script>

<template>
  <FormatSection
    v-if="controller.isAxis.value"
    :title="controller.t('chart.formatAxisOptions')"
    initially-open
  >
    <TCheckbox
      data-format-pane-history-control="discrete"
      :checked="controller.axis.value.show ?? true"
      :disabled="controller.disabled.value"
      :onChange="
        controller.captureAction((value: unknown) => controller.setAxisBoolean('show', value))
      "
      >{{ controller.t("chart.formatShowAxis") }}</TCheckbox
    >
    <TCheckbox
      data-format-pane-history-control="discrete"
      :checked="controller.axis.value.reverse ?? false"
      :disabled="controller.disabled.value"
      :onChange="
        controller.captureAction((value: unknown) => controller.setAxisBoolean('reverse', value))
      "
      >{{ controller.t("chart.formatReverse") }}</TCheckbox
    >
    <template v-if="controller.isValueAxis.value">
      <TCheckbox
        data-format-pane-history-control="discrete"
        :checked="controller.valueAxis.value.majorGridlines ?? true"
        :disabled="controller.disabled.value"
        data-chart-format-field="majorGridlines"
        :onChange="
          controller.captureAction((value: unknown) =>
            controller.setAxisBoolean('majorGridlines', value),
          )
        "
        >{{ controller.t("chart.formatMajorGridlines") }}</TCheckbox
      >
      <TCheckbox
        data-format-pane-history-control="discrete"
        :checked="controller.minorGridlinesState.value.checked"
        :indeterminate="controller.minorGridlinesState.value.invalid"
        :disabled="controller.disabled.value || controller.minorGridlinesState.value.invalid"
        data-chart-format-field="minorGridlines"
        :onChange="
          controller.captureAction((value: unknown) =>
            controller.setAxisBoolean('minorGridlines', value),
          )
        "
        >{{ controller.t("chart.formatMinorGridlines") }}</TCheckbox
      >
    </template>
    <ChartFormatNumericRow
      v-if="controller.kind.value === 'categoryAxis'"
      :controller="controller"
      field="labelAngle"
      :input-id="`${controller.paneId}-angle`"
      :label="controller.t('chart.formatLabelAngle')"
      :spec="labelAngleSpec"
    />
  </FormatSection>

  <FormatSection
    v-if="controller.isAxis.value"
    :title="controller.t('chart.formatAxisTitle')"
    initially-open
  >
    <TCheckbox
      data-format-pane-history-control="discrete"
      :checked="controller.axis.value.titleVisible ?? !!controller.axis.value.title"
      :disabled="controller.disabled.value"
      data-chart-format-field="titleVisible"
      :onChange="
        controller.captureAction((value: unknown) =>
          controller.setAxisBoolean('titleVisible', value),
        )
      "
      >{{ controller.t("chart.formatShowAxisTitle") }}</TCheckbox
    >
    <div class="chart-format-pane__field" data-chart-format-field="axisTitle">
      <label :for="`${controller.paneId}-axis-title`">{{
        controller.t("chart.formatAxisTitle")
      }}</label
      ><TInput
        :id="`${controller.paneId}-axis-title`"
        :value="controller.drafts.axisTitle!.text"
        size="small"
        :maxlength="1000"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('chart.formatAxisTitle')"
        :status="controller.drafts.axisTitle!.error ? 'error' : undefined"
        :onChange="controller.editAction('axisTitle')"
        :onCompositionstart="controller.compositionStartAction('axisTitle')"
        :onCompositionend="controller.compositionEndAction('axisTitle')"
        :onEnter="controller.textAction('axisTitle')"
        :onBlur="controller.textAction('axisTitle')"
      />
    </div>
    <ChartFormatNumericRow
      :controller="controller"
      field="titleRotation"
      :input-id="`${controller.paneId}-title-rotation`"
      :label="controller.t('chart.formatTitleRotation')"
      :spec="labelAngleSpec"
    />
  </FormatSection>

  <FormatSection
    v-if="controller.isValueAxis.value"
    :title="controller.t('chart.formatBounds')"
    initially-open
  >
    <p v-if="controller.percentageAxis.value" class="chart-format-pane__hint">
      {{ controller.t("chart.formatPercentAxisHint") }}
    </p>
    <ChartFormatNumericRow
      :controller="controller"
      field="min"
      :input-id="`${controller.paneId}-min`"
      :label="controller.t('chart.formatMinimum')"
      :spec="axisBoundSpec"
    />
    <ChartFormatNumericRow
      :controller="controller"
      field="max"
      :input-id="`${controller.paneId}-max`"
      :label="controller.t('chart.formatMaximum')"
      :spec="axisBoundSpec"
    />
    <ChartFormatNumericRow
      :controller="controller"
      field="majorUnit"
      :input-id="`${controller.paneId}-major`"
      :label="controller.t('chart.formatMajorUnit')"
      :spec="axisUnitSpec"
      :invalid-message="controller.t('chart.formatAxisPositiveUnit')"
    />
    <ChartFormatNumericRow
      :controller="controller"
      field="minorUnit"
      :input-id="`${controller.paneId}-minor`"
      :label="controller.t('chart.formatMinorUnit')"
      :spec="axisUnitSpec"
      :invalid-message="controller.t('chart.formatAxisPositiveUnit')"
    />
    <div
      v-if="!controller.percentageAxis.value"
      class="chart-format-pane__field"
      data-chart-format-field="displayUnit"
    >
      <span>{{ controller.t("chart.formatDisplayUnit") }}</span>
      <TSelect
        v-native-control="controller.selectControlAttrs('displayUnit')"
        :popup-props="controller.popupProps"
        :value="controller.valueAxis.value.displayUnit ?? 'none'"
        :options="controller.displayUnitOptions.value"
        size="small"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('chart.formatDisplayUnit')"
        data-chart-display-unit-select
        :onPopupVisibleChange="
          (v: boolean) => controller.onSelectPopupVisibleChange('displayUnit', v)
        "
        :onChange="controller.captureAction(controller.setAxisDisplayUnit)"
      />
    </div>
  </FormatSection>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;
</style>
