<script setup lang="ts">
import { ref } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import {
  Radio as TRadio,
  RadioGroup as TRadioGroup,
  RadioButton as TRadioButton,
} from "tdesign-vue-next/es/radio";
import { Tabs as TTabs, TabPanel as TTabPanel } from "tdesign-vue-next/es/tabs";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChartNoAxesColumn, RotateCcw, X } from "lucide-vue-next";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import FormatSection from "../../../shared/format-pane/FormatSection.vue";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import type { ChartFormatIntentHandler, ChartFormatTarget } from "../chart-format-pane";
import ChartFormatAxisSection from "./format-pane/ChartFormatAxisSection.vue";
import ChartFormatNumberSection from "./format-pane/ChartFormatNumberSection.vue";
import ChartFormatSeriesSection from "./format-pane/ChartFormatSeriesSection.vue";
import ChartFormatSurfaceSection from "./format-pane/ChartFormatSurfaceSection.vue";
import ChartFormatTextSection from "./format-pane/ChartFormatTextSection.vue";
import { useChartFormatPane } from "./format-pane/useChartFormatPane";

const props = defineProps<{
  drawing: SheetChartDrawing;
  data: ChartData;
  visibleData?: ChartData;
  target: ChartFormatTarget;
  disabled: boolean;
  error?: string;
  apply: ChartFormatIntentHandler;
}>();
const emit = defineEmits<{ "update:target": [target: ChartFormatTarget]; close: [] }>();
const root = ref<HTMLElement>();
const controller = useChartFormatPane(props, (target) => emit("update:target", target), root);

defineExpose({
  canChangeTarget: controller.canChangeTarget,
  getHistoryElement: controller.getHistoryElement,
});
</script>

<template>
  <aside
    ref="root"
    class="chart-format-pane"
    data-chart-format-pane
    :style="{
      '--chart-format-label-width': controller.locale.value === 'zh-CN' ? '84px' : '120px',
    }"
    :aria-label="controller.t('chart.formatPane')"
    @keydown.capture="controller.escapeDraft"
    @pointerdown.capture="controller.pointerDown"
  >
    <header class="chart-format-pane__header">
      <ChartNoAxesColumn :size="18" aria-hidden="true" />
      <div class="chart-format-pane__heading">
        <strong>{{ controller.t("chart.formatPane") }}</strong
        ><span :title="drawing.name">{{ drawing.name }}</span>
      </div>
      <TButton
        size="small"
        shape="square"
        variant="text"
        :aria-label="controller.t('chart.formatClose')"
        @click="emit('close')"
      >
        <template #icon><X class="sheetcraft-action-icon" aria-hidden="true" /></template>
      </TButton>
    </header>
    <div class="chart-format-pane__selector">
      <label :for="`${controller.paneId}-element`">{{ controller.t("chart.formatElement") }}</label>
      <TSelect
        :popup-props="controller.popupProps"
        :id="`${controller.paneId}-element`"
        :value="controller.available.value ? controller.targetKey.value : 'chart'"
        :options="controller.targetOptions.value"
        size="small"
        :aria-label="controller.t('chart.formatElement')"
        :onChange="controller.captureAction(controller.changeTarget)"
      />
    </div>
    <p v-if="controller.errorMessage.value" class="chart-format-pane__error" role="alert">
      {{ controller.errorMessage.value }}
    </p>
    <div
      v-if="controller.kind.value === 'legend'"
      class="chart-format-pane__navigation"
      data-chart-format-navigation
    >
      <TRadioGroup
        class="sheetcraft-radio-group--stretched"
        :value="controller.legendMode.value"
        variant="default-filled"
        :aria-label="controller.t('chart.formatPane')"
        :onChange="controller.captureAction(controller.changeLegendMode)"
      >
        <TRadioButton value="legend">{{ controller.t("chart.legendOptions") }}</TRadioButton>
        <TRadioButton value="text">{{ controller.t("chart.legendTextOptions") }}</TRadioButton>
      </TRadioGroup>
      <TTabs
        v-show="controller.legendMode.value === 'legend'"
        class="sheetcraft-tabs--compact"
        :value="controller.legendTab.value"
        :onChange="controller.captureAction(controller.changeLegendTab)"
        role="tablist"
        :aria-label="controller.t('chart.legendOptions')"
        @keydown="controller.legendTabKeydown"
      >
        <TTabPanel value="surface" :destroy-on-hide="false">
          <template #label
            ><button
              type="button"
              class="chart-format-pane__tab-label"
              role="tab"
              :id="`${controller.paneId}-surface-tab`"
              :aria-selected="controller.legendTab.value === 'surface'"
              :aria-controls="`${controller.paneId}-surface-panel`"
              :tabindex="controller.legendTab.value === 'surface' ? 0 : -1"
            >
              {{ controller.t("chart.legendFillLine") }}
            </button></template
          >
        </TTabPanel>
        <TTabPanel value="layout" :destroy-on-hide="false">
          <template #label
            ><button
              type="button"
              class="chart-format-pane__tab-label"
              role="tab"
              :id="`${controller.paneId}-layout-tab`"
              :aria-selected="controller.legendTab.value === 'layout'"
              :aria-controls="`${controller.paneId}-layout-panel`"
              :tabindex="controller.legendTab.value === 'layout' ? 0 : -1"
            >
              {{ controller.t("chart.legend") }}
            </button></template
          >
        </TTabPanel>
      </TTabs>
    </div>
    <div class="chart-format-pane__body">
      <template v-if="controller.kind.value === 'chart'">
        <p class="chart-format-pane__hint">{{ controller.t("chart.formatSelectHint") }}</p>
        <p v-if="!controller.capabilities.value.hasData" class="chart-format-pane__hint">
          {{ controller.t("chart.formatNoData") }}
        </p>
      </template>
      <p
        v-if="
          !controller.capabilities.value.series &&
          controller.capabilities.value.hasData &&
          (controller.kind.value === 'chart' || controller.isAxis.value)
        "
        class="chart-format-pane__hint"
      >
        {{ controller.t("chart.formatSeriesUnavailable") }}
      </p>

      <FormatSection
        v-if="controller.kind.value === 'legend'"
        v-show="controller.legendMode.value === 'legend' && controller.legendTab.value === 'layout'"
        role="tabpanel"
        :id="`${controller.paneId}-layout-panel`"
        :aria-labelledby="`${controller.paneId}-layout-tab`"
        :title="controller.t('chart.legend')"
        initially-open
      >
        <span>{{ controller.t("chart.legendPosition") }}</span>
        <TRadioGroup
          :model-value="controller.elementSettings.value.legendPosition"
          :disabled="disabled"
          :aria-label="controller.t('chart.legendPosition')"
          role="radiogroup"
          class="chart-format-pane__legend-positions"
          :onChange="controller.captureAction(controller.setLegendPosition)"
        >
          <TRadio data-format-pane-history-control="discrete" value="top">{{
            controller.t("chart.positionTop")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="bottom">{{
            controller.t("chart.positionBottom")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="left">{{
            controller.t("chart.positionLeft")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="right">{{
            controller.t("chart.positionRight")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="topRight">{{
            controller.t("chart.positionTopRight")
          }}</TRadio>
        </TRadioGroup>
        <TCheckbox
          data-format-pane-history-control="discrete"
          :checked="!controller.elementSettings.value.legendOverlay"
          :disabled="disabled"
          :onChange="controller.captureAction(controller.setLegendNonOverlapping)"
        >
          {{ controller.t("chart.legendNonOverlapping") }}
        </TCheckbox>
      </FormatSection>

      <FormatSection
        v-if="controller.kind.value === 'title'"
        :title="controller.t('chart.title')"
        initially-open
      >
        <div class="chart-format-pane__field" data-chart-format-field="title">
          <label :for="`${controller.paneId}-title`">{{ controller.t("chart.titleText") }}</label>
          <TInput
            :id="`${controller.paneId}-title`"
            :value="controller.drafts.title!.text"
            size="small"
            :maxlength="1000"
            :disabled="disabled"
            :aria-label="controller.t('chart.titleText')"
            :status="controller.drafts.title!.error ? 'error' : undefined"
            :onChange="controller.editAction('title')"
            :onCompositionstart="controller.compositionStartAction('title')"
            :onCompositionend="controller.compositionEndAction('title')"
            :onEnter="controller.textAction('title')"
            :onBlur="controller.captureAction(controller.blurTitle)"
          />
        </div>
        <div class="chart-format-pane__field" data-chart-format-title-position>
          <span>{{ controller.t("chart.titlePosition") }}</span
          ><TSelect
            v-native-control="controller.selectControlAttrs('titlePosition')"
            :popup-props="controller.popupProps"
            :value="controller.chart.value.elements?.titlePosition ?? 'above'"
            :options="controller.titlePositionOptions.value"
            size="small"
            :disabled="disabled"
            :aria-label="controller.t('chart.titlePosition')"
            :onPopupVisibleChange="
              (v: boolean) => controller.onSelectPopupVisibleChange('titlePosition', v)
            "
            :onChange="controller.captureAction(controller.setTitlePosition)"
          />
        </div>
      </FormatSection>

      <ChartFormatAxisSection :controller="controller" />
      <ChartFormatTextSection :controller="controller" />
      <ChartFormatSurfaceSection :controller="controller" />
      <ChartFormatNumberSection :controller="controller" />
      <ChartFormatSeriesSection :controller="controller" />

      <div
        v-if="
          controller.available.value &&
          (controller.kind.value !== 'chart' || controller.capabilities.value.bar)
        "
        class="chart-format-pane__reset"
        v-show="
          controller.kind.value !== 'legend' ||
          (controller.legendMode.value === 'legend' && controller.legendTab.value === 'layout')
        "
      >
        <TButton
          variant="text"
          size="small"
          :disabled="disabled"
          data-chart-format-reset="element"
          :onClick="controller.captureAction(controller.resetElement)"
          ><RotateCcw :size="14" aria-hidden="true" />{{
            controller.t(
              controller.kind.value === "legend"
                ? "chart.legendResetLayout"
                : "chart.formatResetAll",
            )
          }}</TButton
        >
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
@use "../../../shared/format-pane/side-pane" as sidePane;
@use "../../../shared/tabs/tab-label";
@use "./format-pane/chart-format-pane" as chartPane;

@include chartPane.pane-field-styles;

.chart-format-pane {
  @include sidePane.shell;
  @include sidePane.mobile-width;
  height: 100%;

  &__header {
    @include sidePane.header;
  }

  &__heading {
    @include sidePane.heading;
  }

  &__selector {
    display: grid;
    gap: 6px;
    padding: 0 12px 12px;
    border-bottom: 1px solid var(--sheetcraft-border-subtle);

    label {
      font-weight: 500;
    }
  }

  &__error {
    flex: none;
    margin: 0;
    padding: 8px 12px;
    color: var(--sheetcraft-status-error);
    font-size: 12px;
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  &__body {
    @include sidePane.body(8px 12px 12px);
  }

  &__tab-label {
    @include tab-label.label;
  }

  &__navigation {
    padding: 0 12px;
    display: grid;
    gap: 6px;
  }

  &__legend-positions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  &__body > &__hint {
    margin: 4px 0 10px;
  }

  &__reset {
    padding-top: 12px;
  }
}
</style>
