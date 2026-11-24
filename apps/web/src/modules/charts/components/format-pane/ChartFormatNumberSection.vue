<script setup lang="ts">
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import OptionList from "../../../../shared/option-list/OptionList.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { chartDecimalsSpec as decimalsSpec } from "../../chart-format-specs";
import ChartFormatNumericRow from "./ChartFormatNumericRow.vue";
import type { ChartFormatPaneController } from "./useChartFormatPane";

defineProps<{ controller: ChartFormatPaneController }>();
</script>

<template>
  <FormatSection
    v-if="controller.isValueAxis.value"
    :title="controller.t('chart.formatNumber')"
    initially-open
  >
    <TCheckbox
      v-if="!controller.percentageAxis.value"
      data-format-pane-history-control="discrete"
      :checked="controller.linkedToSource.value"
      :disabled="controller.disabled.value"
      :onChange="controller.captureAction(controller.toggleSourceLink)"
      >{{ controller.t("chart.formatLinkedToSource") }}</TCheckbox
    >
    <p class="chart-format-pane__hint">
      {{
        controller.t(
          controller.percentageAxis.value
            ? "chart.formatPercentAxisHint"
            : "chart.formatNumberSourceHint",
        )
      }}
    </p>
    <div class="chart-format-pane__preview">
      <span>{{ controller.t("cellFormat.preview") }}</span
      ><output :style="{ color: controller.numberPreview.value.color }">{{
        controller.numberPreview.value.text
      }}</output>
    </div>
    <div class="chart-format-pane__field">
      <span>{{ controller.t("cellFormat.category") }}</span
      ><TSelect
        v-native-control="controller.selectControlAttrs('numberCategory')"
        :popup-props="controller.popupProps"
        :value="controller.numberCategory.value"
        :options="controller.numberCategoryOptions.value"
        size="small"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('cellFormat.category')"
        :onPopupVisibleChange="
          (v: boolean) => controller.onSelectPopupVisibleChange('numberCategory', v)
        "
        :onChange="controller.captureAction(controller.selectNumberCategory)"
      />
    </div>
    <ChartFormatNumericRow
      v-if="controller.showDecimals.value"
      :controller="controller"
      field="decimals"
      :input-id="`${controller.paneId}-decimals`"
      :label="controller.t('cellFormat.decimalPlaces')"
      :spec="decimalsSpec"
      :resettable="false"
    />
    <div v-if="controller.showCurrency.value" class="chart-format-pane__field">
      <span>{{ controller.t("cellFormat.currencyCode") }}</span
      ><TSelect
        v-native-control="controller.selectControlAttrs('currencyCode')"
        :popup-props="controller.popupProps"
        :value="
          controller.numberFormat.value && 'currency' in controller.numberFormat.value
            ? controller.numberFormat.value.currency
            : ''
        "
        :options="controller.currencyOptions.value"
        size="small"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('cellFormat.currencyCode')"
        :onPopupVisibleChange="
          (v: boolean) => controller.onSelectPopupVisibleChange('currencyCode', v)
        "
        :onChange="controller.captureAction(controller.setCurrency)"
      />
    </div>
    <TCheckbox
      v-if="controller.numberCategory.value === 'number'"
      data-format-pane-history-control="discrete"
      :checked="
        controller.numberFormat.value && 'useGrouping' in controller.numberFormat.value
          ? (controller.numberFormat.value.useGrouping ?? true)
          : true
      "
      :disabled="controller.disabled.value"
      :onChange="controller.captureAction(controller.setGrouping)"
      >{{ controller.t("cellFormat.grouping") }}</TCheckbox
    >
    <fieldset
      v-if="controller.showNegative.value"
      class="chart-format-pane__stack chart-format-pane__negative"
      :disabled="controller.disabled.value"
    >
      <legend>{{ controller.t("cellFormat.negativeNumbers") }}</legend>
      <OptionList
        :model-value="
          controller.numberFormat.value && 'negativeStyle' in controller.numberFormat.value
            ? (controller.numberFormat.value.negativeStyle ?? 'minus')
            : 'minus'
        "
        :options="controller.negativeOptions.value"
        :label="controller.t('cellFormat.negativeNumbers')"
        :onSelect="controller.captureAction(controller.setNegative)"
      />
    </fieldset>
    <div
      v-if="controller.showCode.value"
      class="chart-format-pane__field chart-format-pane__field--stack"
      data-chart-format-field="formatCode"
    >
      <label :for="`${controller.paneId}-format-code`">{{
        controller.t("cellFormat.customCode")
      }}</label
      ><TInput
        :id="`${controller.paneId}-format-code`"
        :value="controller.drafts.formatCode!.text"
        size="small"
        :maxlength="255"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('cellFormat.customCode')"
        :status="controller.drafts.formatCode!.error ? 'error' : undefined"
        :onChange="controller.editAction('formatCode')"
        :onCompositionstart="controller.compositionStartAction('formatCode')"
        :onCompositionend="controller.compositionEndAction('formatCode')"
        :onEnter="controller.textAction('formatCode')"
        :onBlur="controller.textAction('formatCode')"
      />
    </div>
  </FormatSection>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;

.chart-format-pane__stack {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chart-format-pane__negative {
  border: 0;
  padding: 0;
  margin: 0;

  legend {
    padding: 0 0 4px;
    white-space: nowrap;
  }
}

.chart-format-pane__preview {
  display: grid;
  gap: 4px;

  output {
    padding: 8px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 22px;
  }
}
</style>
