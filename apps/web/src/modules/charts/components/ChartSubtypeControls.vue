<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { ChartDesignIntent, ChartVariant, CommonChartType } from "../chart-design-intents";

const props = defineProps<{
  type: CommonChartType;
  presentation?: "menu" | "dialog";
  variant?: ChartVariant;
  disabled: boolean;
  apply: (intent: ChartDesignIntent) => boolean;
}>();
const { t } = useAppI18n();
const failed = ref(false);
const root = ref<HTMLElement>();
function variantTabIndex(value: ChartVariant): number | undefined {
  return props.presentation === "dialog"
    ? props.variant === value || (!props.variant && value === "standard")
      ? 0
      : -1
    : undefined;
}

function onKeydown(event: KeyboardEvent): void {
  if (
    props.presentation !== "dialog" ||
    event.isComposing ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
  )
    return;
  const buttons = [
    ...(root.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
  ];
  if (!buttons.length) return;
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + buttons.length) %
          buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
  buttons[next]?.click();
}
watch(
  () => props.apply,
  () => {
    failed.value = false;
  },
);
const select = computed(() => {
  const apply = props.apply,
    type = props.type;
  return (variant: ChartVariant) => {
    if (props.disabled || props.apply !== apply || props.type !== type) return;
    try {
      failed.value = !apply({ kind: "variant", variant });
    } catch {
      failed.value = true;
    }
  };
});
const standardKey = computed(() => `chart.variant.${props.type}.standard` as const);
const stackedKey = computed(() => `chart.variant.${props.type}.stacked` as const);
const percentKey = computed(() => `chart.variant.${props.type}.percentStacked` as const);
</script>

<template>
  <div
    ref="root"
    class="chart-subtype-controls"
    :class="{ 'is-dialog': presentation === 'dialog' }"
    :role="presentation === 'dialog' ? 'radiogroup' : 'group'"
    :aria-label="t('chart.subtypes')"
    @keydown="onKeydown"
  >
    <div class="chart-subtype-controls__choices">
      <button
        type="button"
        :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
        :aria-checked="variant === 'standard'"
        :tabindex="variantTabIndex('standard')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t(standardKey)"
        data-chart-variant="standard"
        @click="select('standard')"
      >
        <svg viewBox="0 0 80 48" aria-hidden="true">
          <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
          <template v-if="type === 'line'">
            <path
              d="M12 33l18-18 18 8 20-15M12 36l18-9 18 8 20-15"
              fill="none"
              stroke="#5470c6"
              stroke-width="3"
            />
          </template>
          <template v-else-if="type === 'area'">
            <path d="M12 36l18-20 18 9 20-17v31H12Z" fill="#5470c6" />
            <path d="M12 37l18-8 18 6 20-14v18H12Z" fill="#91cc75" />
          </template>
          <template v-else-if="type === 'bar'">
            <path d="M12 10h38v6H12zm0 9h24v6H12zm0 9h49v6H12Z" fill="#5470c6" />
            <path d="M12 16h23v3H12zm0 9h42v3H12zm0 9h31v3H12Z" fill="#91cc75" />
          </template>
          <template v-else>
            <path d="M15 20h7v19h-7zm20-9h7v28h-7zm20 7h7v21h-7Z" fill="#5470c6" />
            <path d="M23 28h7v11h-7zm20-8h7v19h-7zm20-3h7v22h-7Z" fill="#91cc75" />
          </template>
        </svg>
        <span>{{ t(standardKey) }}</span>
      </button>
      <button
        type="button"
        :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
        :aria-checked="variant === 'stacked'"
        :tabindex="variantTabIndex('stacked')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t(stackedKey)"
        data-chart-variant="stacked"
        @click="select('stacked')"
      >
        <svg viewBox="0 0 80 48" aria-hidden="true">
          <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
          <template v-if="type === 'line'">
            <path d="M12 32l18-11 18 6 20-10" fill="none" stroke="#5470c6" stroke-width="3" />
            <path d="M12 22l18-11 18 7 20-12" fill="none" stroke="#91cc75" stroke-width="3" />
          </template>
          <template v-else-if="type === 'area'">
            <path d="M12 39V22l18-11 18 7 20-12v33Z" fill="#91cc75" />
            <path d="M12 39v-7l18-11 18 6 20-10v22Z" fill="#5470c6" />
          </template>
          <template v-else-if="type === 'bar'">
            <path d="M12 9h28v7H12zm0 12h38v7H12zm0 12h20v7H12Z" fill="#5470c6" />
            <path d="M40 9h20v7H40zm10 12h18v7H50zm-18 12h19v7H32Z" fill="#91cc75" />
          </template>
          <template v-else>
            <path d="M16 26h12v13H16zm22-7h12v20H38zm22 8h12v12H60Z" fill="#5470c6" />
            <path d="M16 16h12v10H16zm22-12h12v15H38zm22 10h12v17H60Z" fill="#91cc75" />
          </template>
        </svg>
        <span>{{ t(stackedKey) }}</span>
      </button>
      <button
        type="button"
        :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
        :aria-checked="variant === 'percentStacked'"
        :tabindex="variantTabIndex('percentStacked')"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t(percentKey)"
        data-chart-variant="percentStacked"
        @click="select('percentStacked')"
      >
        <svg viewBox="0 0 80 48" aria-hidden="true">
          <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
          <template v-if="type === 'line'">
            <path d="M12 25l18-7 18 9 20-9" fill="none" stroke="#5470c6" stroke-width="3" />
            <path d="M12 8h56" stroke="#91cc75" stroke-width="3" />
          </template>
          <template v-else-if="type === 'area'">
            <path d="M12 8h56v31H12Z" fill="#91cc75" />
            <path d="M12 39V25l18-7 18 9 20-9v21Z" fill="#5470c6" />
          </template>
          <template v-else-if="type === 'bar'">
            <path d="M12 9h56v7H12zm0 12h56v7H12zm0 12h56v7H12Z" fill="#91cc75" />
            <path d="M12 9h25v7H12zm0 12h38v7H12zm0 12h17v7H12Z" fill="#5470c6" />
          </template>
          <template v-else>
            <path d="M16 7h12v32H16zm22 0h12v32H38zm22 0h12v32H60Z" fill="#91cc75" />
            <path d="M16 24h12v15H16zm22-10h12v25H38zm22 12h12v13H60Z" fill="#5470c6" />
          </template>
        </svg>
        <span>{{ t(percentKey) }}</span>
      </button>
      <template v-if="type === 'line'">
        <button
          type="button"
          :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
          :aria-checked="variant === 'standardMarkers'"
          :tabindex="variantTabIndex('standardMarkers')"
          :aria-disabled="disabled"
          :disabled="disabled"
          :title="t('chart.variant.line.standardMarkers')"
          data-chart-variant="standardMarkers"
          @click="select('standardMarkers')"
        >
          <svg viewBox="0 0 80 48" aria-hidden="true">
            <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
            <path d="M12 33l18-18 18 8 20-15" fill="none" stroke="#5470c6" stroke-width="3" />
            <g fill="#5470c6">
              <circle cx="12" cy="33" r="3" />
              <circle cx="30" cy="15" r="3" />
              <circle cx="48" cy="23" r="3" />
              <circle cx="68" cy="8" r="3" />
            </g>
          </svg>
          <span>{{ t("chart.variant.line.standardMarkers") }}</span>
        </button>
        <button
          type="button"
          :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
          :aria-checked="variant === 'stackedMarkers'"
          :tabindex="variantTabIndex('stackedMarkers')"
          :aria-disabled="disabled"
          :disabled="disabled"
          :title="t('chart.variant.line.stackedMarkers')"
          data-chart-variant="stackedMarkers"
          @click="select('stackedMarkers')"
        >
          <svg viewBox="0 0 80 48" aria-hidden="true">
            <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
            <path d="M12 32l18-11 18 6 20-10" fill="none" stroke="#5470c6" stroke-width="3" />
            <path d="M12 22l18-11 18 7 20-12" fill="none" stroke="#91cc75" stroke-width="3" />
            <g fill="#5470c6">
              <circle cx="12" cy="32" r="3" />
              <circle cx="30" cy="21" r="3" />
              <circle cx="48" cy="27" r="3" />
              <circle cx="68" cy="17" r="3" />
            </g>
            <g fill="#91cc75">
              <circle cx="12" cy="22" r="3" />
              <circle cx="30" cy="11" r="3" />
              <circle cx="48" cy="18" r="3" />
              <circle cx="68" cy="6" r="3" />
            </g>
          </svg>
          <span>{{ t("chart.variant.line.stackedMarkers") }}</span>
        </button>
        <button
          type="button"
          :role="presentation === 'dialog' ? 'radio' : 'menuitemradio'"
          :aria-checked="variant === 'percentStackedMarkers'"
          :tabindex="variantTabIndex('percentStackedMarkers')"
          :aria-disabled="disabled"
          :disabled="disabled"
          :title="t('chart.variant.line.percentStackedMarkers')"
          data-chart-variant="percentStackedMarkers"
          @click="select('percentStackedMarkers')"
        >
          <svg viewBox="0 0 80 48" aria-hidden="true">
            <path d="M8 5v35h66" fill="none" stroke="currentColor" opacity=".4" />
            <path d="M12 25l18-7 18 9 20-9" fill="none" stroke="#5470c6" stroke-width="3" />
            <path d="M12 8h56" stroke="#91cc75" stroke-width="3" />
            <g fill="#5470c6">
              <circle cx="12" cy="25" r="3" />
              <circle cx="30" cy="18" r="3" />
              <circle cx="48" cy="27" r="3" />
              <circle cx="68" cy="18" r="3" />
            </g>
            <g fill="#91cc75">
              <circle cx="12" cy="8" r="3" />
              <circle cx="30" cy="8" r="3" />
              <circle cx="48" cy="8" r="3" />
              <circle cx="68" cy="8" r="3" />
            </g>
          </svg>
          <span>{{ t("chart.variant.line.percentStackedMarkers") }}</span>
        </button>
      </template>
    </div>
    <p
      v-if="variant === 'percentStacked' || variant === 'percentStackedMarkers'"
      class="chart-subtype-controls__hint"
    >
      {{ t("chart.percentStackedHint") }}
    </p>
    <p v-if="type === 'line'" class="chart-subtype-controls__hint">
      {{ t("chart.lineMarkersHint") }}
    </p>
    <p v-if="failed" class="chart-subtype-controls__error" role="alert">
      {{ t("chart.designApplyFailed") }}
    </p>
  </div>
</template>
<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
.chart-subtype-controls {
  width: min(630px, calc(100vw - 48px));
  max-width: 100%;
  &__choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    width: 80px;
    height: 48px;
  }
  span {
    white-space: nowrap;
  }
  &.is-dialog {
    width: 100%;
    .chart-subtype-controls__choices {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    button {
      flex: 0 0 108px;
      min-height: 76px;
      align-content: start;
    }
    svg {
      width: 66px;
      height: 40px;
    }
    span {
      white-space: normal;
      text-wrap: balance;
    }
    .chart-subtype-controls__hint {
      display: none;
    }
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
    color: var(--sheetcraft-status-error);
  }
}

@media (max-width: 560px) {
  .chart-subtype-controls__choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 440px) {
  .chart-subtype-controls__choices {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
