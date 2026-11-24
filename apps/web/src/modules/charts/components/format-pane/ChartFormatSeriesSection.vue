<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { RotateCcw } from "lucide-vue-next";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import {
  chartGapWidthSpec as gapWidthSpec,
  chartMarkerSizePtSpec as markerSizePtSpec,
  chartOverlapSpec as overlapSpec,
  chartStrokeWidthSpec as strokeWidthSpec,
} from "../../chart-format-specs";
import ChartFormatNumericRow from "./ChartFormatNumericRow.vue";
import type { ChartFormatPaneController } from "./useChartFormatPane";

defineProps<{ controller: ChartFormatPaneController }>();
</script>

<template>
  <FormatSection
    v-if="controller.kind.value === 'series'"
    :title="controller.t('chart.formatSeriesOptions')"
    initially-open
  >
    <div v-if="controller.capabilities.value.seriesAxis" class="chart-format-pane__field">
      <span>{{ controller.t("chart.formatSeriesAxis") }}</span
      ><TSelect
        v-native-control="controller.selectControlAttrs('seriesAxis')"
        :popup-props="controller.popupProps"
        :value="controller.series.value.axis ?? 'primary'"
        :options="controller.seriesAxisOptions.value"
        size="small"
        :disabled="controller.disabled.value"
        :aria-label="controller.t('chart.formatSeriesAxis')"
        :onPopupVisibleChange="
          (v: boolean) => controller.onSelectPopupVisibleChange('seriesAxis', v)
        "
        :onChange="
          controller.captureAction(
            (value: unknown) =>
              (value === 'primary' || value === 'secondary') && controller.setSeries('axis', value),
          )
        "
      />
    </div>
    <div class="chart-format-pane__field">
      <span>{{ controller.t("chart.formatSeriesColor") }}</span
      ><ColorPaletteSelect
        panel-class="chart-format-options-popup"
        :model-value="controller.series.value.color"
        :label="controller.t('chart.formatSeriesColor')"
        :disabled="controller.disabled.value"
        :default-label="controller.t('chart.formatDefault')"
        size="small"
        show-value
        :onSelect="
          controller.captureAction((value: string | null) =>
            controller.setSeries('color', value ?? undefined),
          )
        "
      />
    </div>
    <ChartFormatNumericRow
      v-if="controller.capabilities.value.seriesStroke"
      :controller="controller"
      field="strokeWidth"
      :input-id="`${controller.paneId}-series-width`"
      :label="controller.t('chart.formatLineWidth')"
      :spec="strokeWidthSpec"
    />
    <TCheckbox
      v-if="controller.capabilities.value.seriesSmooth"
      data-format-pane-history-control="discrete"
      :checked="controller.series.value.smooth ?? false"
      :disabled="controller.disabled.value"
      :onChange="
        controller.captureAction((value: unknown) => controller.setSeries('smooth', !!value))
      "
      >{{ controller.t("chart.formatSmooth") }}</TCheckbox
    >
    <TCheckbox
      v-if="controller.capabilities.value.seriesMarkers"
      data-format-pane-history-control="discrete"
      :checked="controller.seriesMarkersVisible.value"
      :disabled="controller.disabled.value"
      :onChange="
        controller.captureAction((value: unknown) => controller.setSeries('markers', !!value))
      "
      >{{ controller.t("chart.formatMarkers") }}</TCheckbox
    >
    <div
      v-if="controller.capabilities.value.seriesMarkerSymbol"
      class="chart-format-pane__field"
      data-chart-format-field="markerSymbol"
    >
      <label :for="`${controller.paneId}-marker-symbol`">{{
        controller.t("chart.formatMarkerSymbol")
      }}</label>
      <div class="chart-format-pane__number">
        <TSelect
          v-native-control="controller.selectControlAttrs('markerSymbol')"
          :id="`${controller.paneId}-marker-symbol`"
          :popup-props="controller.popupProps"
          :value="controller.series.value.markerSymbol ?? ''"
          :options="controller.markerSymbolOptions.value"
          size="small"
          :disabled="controller.disabled.value || !controller.seriesMarkersVisible.value"
          :aria-label="controller.t('chart.formatMarkerSymbol')"
          :onPopupVisibleChange="
            (v: boolean) => controller.onSelectPopupVisibleChange('markerSymbol', v)
          "
          :onChange="controller.captureAction(controller.setMarkerSymbol)"
        /><TButton
          variant="text"
          shape="square"
          size="small"
          :disabled="
            controller.disabled.value || controller.series.value.markerSymbol === undefined
          "
          :aria-label="controller.t('chart.formatReset')"
          data-chart-format-reset="markerSymbol"
          :onClick="controller.captureAction(() => controller.setMarkerSymbol(''))"
          ><RotateCcw :size="14" aria-hidden="true"
        /></TButton>
      </div>
    </div>
    <p
      v-if="
        controller.capabilities.value.seriesMarkerSymbol && !controller.seriesMarkersVisible.value
      "
      class="chart-format-pane__hint"
    >
      {{ controller.t("chart.formatMarkerSymbolHidden") }}
    </p>
    <ChartFormatNumericRow
      v-if="controller.capabilities.value.seriesMarkerSize"
      :controller="controller"
      field="markerSizePt"
      :input-id="`${controller.paneId}-marker-size`"
      :label="controller.t('chart.formatMarkerSize')"
      :spec="markerSizePtSpec"
      :input-disabled="controller.disabled.value || !controller.seriesMarkersVisible.value"
    />
    <p
      v-if="
        controller.capabilities.value.seriesMarkerSize && !controller.seriesMarkersVisible.value
      "
      class="chart-format-pane__hint"
    >
      {{ controller.t("chart.formatMarkerSizeHidden") }}
    </p>
  </FormatSection>

  <FormatSection
    v-if="
      controller.capabilities.value.bar &&
      (controller.kind.value === 'chart' || controller.kind.value === 'series')
    "
    :title="controller.t('chart.formatBarLayout')"
    initially-open
  >
    <p class="chart-format-pane__hint">{{ controller.t("chart.formatBarGlobalHint") }}</p>
    <ChartFormatNumericRow
      :controller="controller"
      field="gapWidth"
      :input-id="`${controller.paneId}-gap`"
      :label="controller.t('chart.formatGapWidth')"
      :spec="gapWidthSpec"
    />
    <ChartFormatNumericRow
      :controller="controller"
      field="overlap"
      :input-id="`${controller.paneId}-overlap`"
      :label="controller.t('chart.formatOverlap')"
      :spec="overlapSpec"
    />
  </FormatSection>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;
</style>
