<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import {
  getChartStyleRecipe,
  matchesChartStyle,
  type ChartDesignIntent,
  type ChartStyleId,
} from "../chart-design-intents";
const props = defineProps<{
  chart: SheetChart;
  disabled: boolean;
  apply: (intent: ChartDesignIntent) => boolean;
}>();
const { t } = useAppI18n();
const failed = ref(false);
watch(
  () => props.apply,
  () => {
    failed.value = false;
  },
);
const select = computed(() => {
  const apply = props.apply;
  return (style: ChartStyleId) => {
    if (props.disabled || props.apply !== apply) return;
    try {
      failed.value = !apply({ kind: "style", style });
    } catch {
      failed.value = true;
    }
  };
});
// This is appearance data for owned vector thumbnails, not a component registry.
const colorful = getChartStyleRecipe("colorful"),
  office = getChartStyleRecipe("office"),
  forest = getChartStyleRecipe("forest"),
  warm = getChartStyleRecipe("warm"),
  cool = getChartStyleRecipe("cool"),
  monochrome = getChartStyleRecipe("monochrome"),
  dark = getChartStyleRecipe("dark"),
  minimal = getChartStyleRecipe("minimal");
</script>
<template>
  <div class="chart-style-gallery" role="group" :aria-label="t('chart.styles')">
    <div class="chart-style-gallery__choices">
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'colorful')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.colorful')"
        data-chart-style="colorful"
        @click="select('colorful')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="colorful.background" />
          <path d="M28 8h44" :stroke="colorful.text" stroke-width="3" />
          <path
            d="M10 18v34h80"
            :stroke="colorful.axis"
            :stroke-width="colorful.axisWidth"
            fill="none"
          />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="colorful.plotFill"
            :stroke="colorful.plotStroke"
            :stroke-width="colorful.plotWidth"
          />
          <rect
            v-for="(color, index) in colorful.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.colorful") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'office')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.office')"
        data-chart-style="office"
        @click="select('office')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="office.background" />
          <path d="M28 8h44" :stroke="office.text" stroke-width="3" />
          <path
            d="M10 18v34h80"
            :stroke="office.axis"
            :stroke-width="office.axisWidth"
            fill="none"
          />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="office.plotFill"
            :stroke="office.plotStroke"
            :stroke-width="office.plotWidth"
          />
          <rect
            v-for="(color, index) in office.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.office") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'forest')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.forest')"
        data-chart-style="forest"
        @click="select('forest')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="forest.background" />
          <path d="M28 8h44" :stroke="forest.text" stroke-width="3" />
          <path
            d="M10 18v34h80"
            :stroke="forest.axis"
            :stroke-width="forest.axisWidth"
            fill="none"
          />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="forest.plotFill"
            :stroke="forest.plotStroke"
            :stroke-width="forest.plotWidth"
          />
          <rect
            v-for="(color, index) in forest.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.forest") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'warm')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.warm')"
        data-chart-style="warm"
        @click="select('warm')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="warm.background" />
          <path d="M28 8h44" :stroke="warm.text" stroke-width="3" />
          <path d="M10 18v34h80" :stroke="warm.axis" :stroke-width="warm.axisWidth" fill="none" />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="warm.plotFill"
            :stroke="warm.plotStroke"
            :stroke-width="warm.plotWidth"
          />
          <rect
            v-for="(color, index) in warm.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.warm") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'cool')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.cool')"
        data-chart-style="cool"
        @click="select('cool')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="cool.background" />
          <path d="M28 8h44" :stroke="cool.text" stroke-width="3" />
          <path d="M10 18v34h80" :stroke="cool.axis" :stroke-width="cool.axisWidth" fill="none" />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="cool.plotFill"
            :stroke="cool.plotStroke"
            :stroke-width="cool.plotWidth"
          />
          <rect
            v-for="(color, index) in cool.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.cool") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'monochrome')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.monochrome')"
        data-chart-style="monochrome"
        @click="select('monochrome')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="monochrome.background" />
          <path d="M28 8h44" :stroke="monochrome.text" stroke-width="3" />
          <path
            d="M10 18v34h80"
            :stroke="monochrome.axis"
            :stroke-width="monochrome.axisWidth"
            fill="none"
          />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="monochrome.plotFill"
            :stroke="monochrome.plotStroke"
            :stroke-width="monochrome.plotWidth"
          />
          <rect
            v-for="(color, index) in monochrome.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.monochrome") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'dark')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.dark')"
        data-chart-style="dark"
        @click="select('dark')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="dark.background" />
          <path d="M28 8h44" :stroke="dark.text" stroke-width="3" />
          <path d="M10 18v34h80" :stroke="dark.axis" :stroke-width="dark.axisWidth" fill="none" />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="dark.plotFill"
            :stroke="dark.plotStroke"
            :stroke-width="dark.plotWidth"
          />
          <rect
            v-for="(color, index) in dark.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.dark") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="matchesChartStyle(chart, 'minimal')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.style.minimal')"
        data-chart-style="minimal"
        @click="select('minimal')"
      >
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect width="100" height="64" :fill="minimal.background" />
          <path d="M28 8h44" :stroke="minimal.text" stroke-width="3" />
          <path
            d="M10 18v34h80"
            :stroke="minimal.axis"
            :stroke-width="minimal.axisWidth"
            fill="none"
          />
          <rect
            x="11"
            y="19"
            width="78"
            height="32"
            :fill="minimal.plotFill"
            :stroke="minimal.plotStroke"
            :stroke-width="minimal.plotWidth"
          />
          <rect
            v-for="(color, index) in minimal.palette"
            :key="color"
            :x="17 + index * 12"
            :y="22 + ((index * 7) % 18)"
            width="8"
            :height="29 - ((index * 7) % 18)"
            :fill="color"
          />
        </svg>
        <span>{{ t("chart.style.minimal") }}</span>
      </button>
    </div>
    <p class="chart-style-gallery__hint">{{ t("chart.ownedStyleHint") }}</p>
    <p v-if="failed" class="chart-style-gallery__error" role="alert">
      {{ t("chart.designApplyFailed") }}
    </p>
  </div>
</template>
<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
.chart-style-gallery {
  width: min(460px, calc(100vw - 48px));
  max-width: 100%;
  &__choices {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  button {
    @include gallery.choice(6px);
    display: grid;
    justify-items: center;
    gap: 4px;
    min-width: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }
  svg {
    width: 100%;
    max-width: 100px;
    height: 64px;
  }
  span {
    white-space: nowrap;
  }
  &__hint,
  &__error {
    margin: 8px 0 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-color-error);
  }
}

@media (max-width: 440px) {
  .chart-style-gallery__choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
