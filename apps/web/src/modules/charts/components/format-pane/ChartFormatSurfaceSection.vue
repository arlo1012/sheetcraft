<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import ChartFormatNumericRow from "./ChartFormatNumericRow.vue";
import type { ChartFormatPaneController } from "./useChartFormatPane";

defineProps<{ controller: ChartFormatPaneController }>();
</script>

<template>
  <FormatSection
    v-if="
      controller.kind.value === 'plot' ||
      controller.kind.value === 'legend' ||
      controller.isAxis.value
    "
    v-show="
      controller.kind.value !== 'legend' ||
      (controller.legendMode.value === 'legend' && controller.legendTab.value === 'surface')
    "
    :role="controller.kind.value === 'legend' ? 'tabpanel' : undefined"
    :id="controller.kind.value === 'legend' ? `${controller.paneId}-surface-panel` : undefined"
    :aria-labelledby="
      controller.kind.value === 'legend' ? `${controller.paneId}-surface-tab` : undefined
    "
    :title="
      controller.t(
        controller.kind.value === 'legend' ? 'chart.legendFillLine' : 'chart.formatAppearance',
      )
    "
    initially-open
  >
    <div
      v-if="controller.kind.value === 'plot' || controller.kind.value === 'legend'"
      class="chart-format-pane__field"
    >
      <span>{{ controller.t("chart.formatFill") }}</span>
      <div class="chart-format-pane__paint">
        <ColorPaletteSelect
          panel-class="chart-format-options-popup"
          :model-value="controller.surfaceFormat.value.fill"
          :transparent-label="controller.t('chart.formatNoFill')"
          :label="controller.t('chart.formatFill')"
          :disabled="controller.disabled.value"
          :default-label="controller.t('chart.formatDefault')"
          size="small"
          show-value
          :onSelect="controller.captureAction(controller.setFill)"
        /><TButton
          variant="text"
          size="small"
          :disabled="controller.disabled.value"
          data-format-pane-history-control="command"
          :onClick="controller.captureAction(() => controller.setFill('transparent'))"
          >{{ controller.t("chart.formatNoFill") }}</TButton
        >
      </div>
    </div>
    <div class="chart-format-pane__field">
      <span>{{ controller.t("chart.formatLine") }}</span>
      <div class="chart-format-pane__paint">
        <ColorPaletteSelect
          panel-class="chart-format-options-popup"
          :model-value="controller.lineFormat.value.stroke"
          :transparent-label="controller.t('chart.formatNoLine')"
          :label="controller.t('chart.formatLine')"
          :disabled="controller.disabled.value"
          :default-label="controller.t('chart.formatDefault')"
          size="small"
          show-value
          :onSelect="controller.captureAction(controller.setLineColor)"
        /><TButton
          variant="text"
          size="small"
          :disabled="controller.disabled.value"
          data-format-pane-history-control="command"
          :onClick="controller.captureAction(() => controller.setLineColor('transparent'))"
          >{{ controller.t("chart.formatNoLine") }}</TButton
        >
      </div>
    </div>
    <ChartFormatNumericRow
      :controller="controller"
      field="strokeWidth"
      :input-id="`${controller.paneId}-line-width`"
      :label="controller.surfaceStrokeWidthLabel.value"
      :spec="controller.surfaceStrokeWidthSpec.value"
    />
    <TButton
      v-if="controller.kind.value === 'legend'"
      variant="text"
      size="small"
      :disabled="controller.disabled.value"
      data-chart-format-reset="legendSurface"
      :onClick="controller.captureAction(() => controller.resetLegendBranch('surface'))"
      >{{ controller.t("chart.legendResetSurface") }}</TButton
    >
  </FormatSection>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;
</style>
