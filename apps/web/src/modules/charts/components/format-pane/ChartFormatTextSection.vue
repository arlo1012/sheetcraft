<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import { RadioGroup as TRadioGroup, RadioButton as TRadioButton } from "tdesign-vue-next/es/radio";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import FontFormatField from "../../../../shared/cell-text/FontFormatField.vue";
import FontSettingsAction from "../../../../shared/cell-text/FontSettingsAction.vue";
import TextStyleToggleGroup from "../../../../shared/text-format/TextStyleToggleGroup.vue";
import ChartFormatNumericRow from "./ChartFormatNumericRow.vue";
import type { ChartFormatPaneController } from "./useChartFormatPane";

defineProps<{ controller: ChartFormatPaneController }>();
</script>

<template>
  <FormatSection
    v-if="
      controller.kind.value === 'title' ||
      controller.kind.value === 'legend' ||
      controller.isAxis.value
    "
    v-show="controller.kind.value !== 'legend' || controller.legendMode.value === 'text'"
    :title="
      controller.t(
        controller.kind.value === 'legend'
          ? 'chart.legendTextOptions'
          : controller.isAxis.value
            ? controller.axisTextMode.value === 'title'
              ? 'chart.formatAxisTitleText'
              : 'chart.formatAxisTickText'
            : 'chart.formatText',
      )
    "
    initially-open
  >
    <TRadioGroup
      v-if="controller.isAxis.value"
      class="sheetcraft-radio-group--stretched"
      :value="controller.axisTextMode.value"
      variant="default-filled"
      data-chart-format-navigation
      :aria-label="controller.t('chart.formatText')"
      :onChange="controller.captureAction(controller.changeAxisTextMode)"
    >
      <TRadioButton value="ticks">{{ controller.t("chart.formatAxisTickText") }}</TRadioButton>
      <TRadioButton value="title">{{ controller.t("chart.formatAxisTitleText") }}</TRadioButton>
    </TRadioGroup>
    <div class="chart-format-pane__field">
      <span>{{ controller.t("format.fontFamily") }}</span
      ><FontFormatField
        appearance="field"
        :model-value="
          controller.textFormat.value.scriptFonts
            ? undefined
            : (controller.textFormat.value.fontFamily ?? '')
        "
        :placeholder="
          controller.textFormat.value.scriptFonts
            ? controller.t('chart.scriptOrThemeFont')
            : undefined
        "
        :options="controller.fontFamilyOptions.value"
        :label="controller.t('format.fontFamily')"
        :search-label="controller.t('format.searchFonts')"
        :empty-label="controller.t('format.noMatchingFonts')"
        :disabled="controller.disabled.value"
        :popup-attach="() => controller.root.value!"
        :onChange="controller.captureAction(controller.setFontFamily)"
        ><template #searchAction="{ close }"><FontSettingsAction @open="close" /></template
      ></FontFormatField>
    </div>
    <ChartFormatNumericRow
      :controller="controller"
      field="fontSize"
      :input-id="`${controller.paneId}-font-size`"
      :label="controller.fontSizeLabel.value"
      :spec="controller.fontSizeFieldSpec.value"
    />
    <div class="chart-format-pane__field">
      <span>{{ controller.t("format.textColor") }}</span
      ><ColorPaletteSelect
        panel-class="chart-format-options-popup"
        :model-value="controller.textFormat.value.color"
        :label="controller.t('format.textColor')"
        :default-label="controller.t('chart.formatDefault')"
        :disabled="controller.disabled.value"
        size="small"
        show-value
        :onSelect="
          controller.captureAction((value: string | null) =>
            controller.setText('color', value ?? undefined),
          )
        "
      />
    </div>
    <div class="chart-format-pane__field">
      <span>{{ controller.t("cellFormat.fontStyle") }}</span>
      <TextStyleToggleGroup
        variant="field"
        history-control="discrete"
        :items="controller.textStyleItems.value"
        :label="controller.t('cellFormat.fontStyle')"
        :onToggle="controller.captureAction(controller.toggleTextStyle)"
      />
    </div>
    <p class="chart-format-pane__hint">{{ controller.t("chart.formatFontHint") }}</p>
    <TButton
      v-if="controller.isAxis.value && controller.axisTextMode.value === 'title'"
      variant="text"
      size="small"
      :disabled="controller.disabled.value"
      data-chart-format-reset="axisTitleText"
      :onClick="controller.captureAction(controller.resetAxisTitleText)"
      >{{ controller.t("chart.formatResetAxisTitleText") }}</TButton
    >
    <TButton
      v-if="controller.kind.value === 'legend'"
      variant="text"
      size="small"
      :disabled="controller.disabled.value"
      data-chart-format-reset="legendText"
      :onClick="controller.captureAction(() => controller.resetLegendBranch('text'))"
      >{{ controller.t("chart.legendResetText") }}</TButton
    >
  </FormatSection>
</template>

<style scoped lang="scss">
@use "./chart-format-pane" as chartPane;
@include chartPane.pane-field-styles;
</style>
