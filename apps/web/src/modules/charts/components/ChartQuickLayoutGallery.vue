<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import type { ChartQuickLayoutId } from "../chart-quick-layout";

const props = defineProps<{
  chart: SheetChart;
  disabled: boolean;
  selected?: ChartQuickLayoutId;
  preview: (id?: ChartQuickLayoutId) => boolean;
  apply: (id: ChartQuickLayoutId) => boolean;
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const failed = ref(false);
const previewFailed = ref(false);
let active = true;
let previewLease: { callback: typeof props.preview; id: ChartQuickLayoutId } | undefined;

function clearPreview(): void {
  const lease = previewLease;
  previewLease = undefined;
  if (!lease) return;
  try {
    // Cleanup belongs to the callback that created this transient preview.
    lease.callback(undefined);
  } catch {
    // The owner can have been removed while the gallery was being dismissed.
  }
}
watch(
  () => [props.chart, props.chart.type, props.apply, props.preview, props.disabled],
  () => {
    clearPreview();
    failed.value = false;
    previewFailed.value = false;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  active = false;
  clearPreview();
});

function leaveFocus(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)) return;
  clearPreview();
}

const bindings = computed(() => {
  const chart = props.chart,
    type = props.chart.type,
    apply = props.apply,
    preview = props.preview;
  const current = () =>
    active &&
    !props.disabled &&
    props.chart === chart &&
    props.chart.type === type &&
    props.apply === apply &&
    props.preview === preview;

  function choice(id: ChartQuickLayoutId) {
    function showPreview(): void {
      if (!current()) return;
      if (previewLease?.callback === preview && previewLease.id === id) return;
      const lease = { callback: preview, id };
      previewLease = lease;
      let accepted = false;
      try {
        accepted = preview(id);
      } catch {
        accepted = false;
      }
      if (!current() || previewLease !== lease) return;
      previewFailed.value = !accepted;
      if (!accepted) clearPreview();
    }
    function select(): void {
      if (!current()) return;
      let accepted = false;
      try {
        accepted = apply(id);
      } catch {
        accepted = false;
      }
      clearPreview();
      if (current()) failed.value = !accepted;
    }
    function keydown(event: KeyboardEvent): void {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Prevent the native button click: one key activation is one owner command.
      event.preventDefault();
      if (event.repeat || event.isComposing) return;
      select();
    }
    function leavePreview(): void {
      if (current() && previewLease?.callback === preview && previewLease.id === id) clearPreview();
    }
    return {
      click: select,
      keydown,
      pointerenter: showPreview,
      focus: showPreview,
      pointerleave: leavePreview,
    };
  }

  // These are captured command bindings; the eleven visual choices stay explicit below.
  return {
    one: choice(1),
    two: choice(2),
    three: choice(3),
    four: choice(4),
    five: choice(5),
    six: choice(6),
    seven: choice(7),
    eight: choice(8),
    nine: choice(9),
    ten: choice(10),
    eleven: choice(11),
  };
});
</script>

<template>
  <div
    ref="root"
    class="chart-quick-layout-gallery"
    role="group"
    :aria-label="t('chart.quickLayout')"
    @pointerleave="clearPreview"
    @focusout="leaveFocus"
  >
    <div class="chart-quick-layout-gallery__choices">
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 1"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout1')"
        data-chart-quick-layout="1"
        v-on="bindings.one"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <g data-thumbnail-element="gridlines" class="thumbnail-grid">
            <path d="M16 23h63M16 34h63M16 45h63" />
          </g>
          <path data-thumbnail-element="axes" d="M16 18v42h63" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M10 23h3M10 34h3M10 45h3M10 59h3M24 64h9M43 64h9M62 64h9"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M23 42h7v18h-7zM42 30h7v30h-7zM61 23h7v37h-7z" class="thumbnail-first" />
            <path d="M31 39h7v21h-7zM50 36h7v24h-7zM69 33h7v27h-7z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="legend-right">
            <path d="M86 34h4v4h-4z" class="thumbnail-first" />
            <path d="M86 43h4v4h-4z" class="thumbnail-second" />
            <path d="M93 36h12M93 45h12" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout1") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 2"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout2')"
        data-chart-quick-layout="2"
        v-on="bindings.two"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <g data-thumbnail-element="legend-top">
            <path d="M34 16h4v4h-4z" class="thumbnail-first" />
            <path d="M62 16h4v4h-4z" class="thumbnail-second" />
            <path d="M41 18h14M69 18h14" class="thumbnail-label" />
          </g>
          <path data-thumbnail-element="axes" d="M12 63h88" class="thumbnail-axis" />
          <path
            data-thumbnail-element="category-labels"
            d="M24 68h12M51 68h12M78 68h12"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M22 47h9v16h-9zM49 36h9v27h-9zM76 30h9v33h-9z" class="thumbnail-first" />
            <path d="M33 44h9v19h-9zM60 41h9v22h-9zM87 38h9v25h-9z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="labels-all-outside" class="thumbnail-label">
            <path d="M24 43h5M35 40h5M51 32h5M62 37h5M78 26h5M89 34h5" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout2") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 3"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout3')"
        data-chart-quick-layout="3"
        v-on="bindings.three"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines"
            d="M16 22h84M16 33h84M16 44h84"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M16 17v39h84" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M10 22h3M10 33h3M10 44h3M10 55h3M27 60h10M54 60h10M81 60h10"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="separated-series">
            <path d="M24 40h10v16H24zM51 29h10v27H51zM78 22h10v34H78z" class="thumbnail-first" />
            <path d="M36 36h10v20H36zM63 33h10v23H63zM90 30h10v26H90z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="legend-bottom">
            <path d="M34 66h4v4h-4z" class="thumbnail-first" />
            <path d="M62 66h4v4h-4z" class="thumbnail-second" />
            <path d="M41 68h14M69 68h14" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout3") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 4"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout4')"
        data-chart-quick-layout="4"
        v-on="bindings.four"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="axes" d="M16 10v46h84" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M10 16h3M10 29h3M10 42h3M10 55h3M27 60h10M54 60h10M81 60h10"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="touching-series">
            <path d="M24 35h10v21H24zM51 23h10v33H51zM78 16h10v40H78z" class="thumbnail-first" />
            <path d="M34 31h10v25H34zM61 28h10v28H61zM88 25h10v31H88z" class="thumbnail-second" />
          </g>
          <path
            data-thumbnail-element="labels-all-outside"
            d="M26 31h6M36 27h6M53 19h6M63 24h6M80 12h6M90 21h6"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="legend-bottom">
            <path d="M34 66h4v4h-4z" class="thumbnail-first" />
            <path d="M62 66h4v4h-4z" class="thumbnail-second" />
            <path d="M41 68h14M69 68h14" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout4") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 5"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout5')"
        data-chart-quick-layout="5"
        v-on="bindings.five"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-y" d="M5 27v18" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines"
            d="M25 22h78M25 32h78M25 42h78"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M25 17v34h78" class="thumbnail-axis" />
          <path
            data-thumbnail-element="value-labels"
            d="M18 22h3M18 32h3M18 42h3M18 51h3"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M32 37h9v14h-9zM57 28h9v23h-9zM82 22h9v29h-9z" class="thumbnail-first" />
            <path d="M41 34h9v17h-9zM66 31h9v20h-9zM91 29h9v22h-9z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="data-table-with-keys">
            <path
              d="M12 51h91v21H12zM12 58h91M12 65h91M25 51v21M51 51v21M77 51v21"
              class="thumbnail-grid"
            />
            <path d="M15 60h3v3h-3z" class="thumbnail-first" />
            <path d="M15 67h3v3h-3z" class="thumbnail-second" />
            <path
              d="M20 61h3M20 68h3M33 55h9M59 55h9M85 55h9M35 61h5M61 61h5M87 61h5M35 68h5M61 68h5M87 68h5"
              class="thumbnail-label"
            />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout5") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 6"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout6')"
        data-chart-quick-layout="6"
        v-on="bindings.six"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-y" d="M5 31v20" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines"
            d="M25 22h78M25 35h78M25 48h78"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M25 17v45h78" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M18 22h3M18 35h3M18 48h3M18 61h3M34 67h11M59 67h11M84 67h11"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M32 43h9v19h-9zM57 31h9v31h-9zM82 24h9v38h-9z" class="thumbnail-first" />
            <path d="M41 39h9v23h-9zM66 36h9v26h-9zM91 33h9v29h-9z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="labels-last-category-series-value" class="thumbnail-label">
            <path d="M74 20h12m2 0h8M86 29h12m2 0h6" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout6") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 7"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout7')"
        data-chart-quick-layout="7"
        v-on="bindings.seven"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="axis-title-y" d="M5 27v20" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-x" d="M39 70h24" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines-major"
            d="M25 15h56M25 29h56M25 43h56"
            class="thumbnail-grid"
          />
          <path
            data-thumbnail-element="gridlines-minor"
            d="M25 22h56M25 36h56M25 50h56"
            class="thumbnail-minor-grid"
          />
          <path data-thumbnail-element="axes" d="M25 8v49h56" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M18 15h3M18 29h3M18 43h3M18 56h3M30 62h9M48 62h9M66 62h9"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M28 36h7v21h-7zM46 22h7v35h-7zM64 15h7v42h-7z" class="thumbnail-first" />
            <path d="M35 32h7v25h-7zM53 29h7v28h-7zM71 26h7v31h-7z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="legend-right">
            <path d="M86 30h4v4h-4z" class="thumbnail-first" />
            <path d="M86 39h4v4h-4z" class="thumbnail-second" />
            <path d="M93 32h12M93 41h12" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout7") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 8"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout8')"
        data-chart-quick-layout="8"
        v-on="bindings.eight"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-y" d="M5 30v18" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-x" d="M46 71h26" class="thumbnail-title" />
          <path data-thumbnail-element="axes" d="M25 17v40h78" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M18 23h3M18 35h3M18 47h3M18 57h3M32 63h12M58 63h12M84 63h12"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="gapless-series">
            <path d="M25 40h13v17H25zM51 29h13v28H51zM77 23h13v34H77z" class="thumbnail-first" />
            <path d="M38 37h13v20H38zM64 34h13v23H64zM90 31h13v26H90z" class="thumbnail-second" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout8") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 9"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout9')"
        data-chart-quick-layout="9"
        v-on="bindings.nine"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-y" d="M5 31v18" class="thumbnail-title" />
          <path data-thumbnail-element="axis-title-x" d="M39 71h24" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines"
            d="M25 22h56M25 34h56M25 46h56"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M25 17v40h56" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M18 22h3M18 34h3M18 46h3M18 57h3M30 63h9M48 63h9M66 63h9"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M28 40h7v17h-7zM46 29h7v28h-7zM64 22h7v35h-7z" class="thumbnail-first" />
            <path d="M35 36h7v21h-7zM53 34h7v23h-7zM71 31h7v26h-7z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="legend-right">
            <path d="M86 32h4v4h-4z" class="thumbnail-first" />
            <path d="M86 41h4v4h-4z" class="thumbnail-second" />
            <path d="M93 34h12M93 43h12" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout9") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 10"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout10')"
        data-chart-quick-layout="10"
        v-on="bindings.ten"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path data-thumbnail-element="title" d="M34 8h44" class="thumbnail-title" />
          <path
            data-thumbnail-element="gridlines"
            d="M16 23h63M16 35h63M16 47h63"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M16 17v43h63" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M10 23h3M10 35h3M10 47h3M10 59h3M24 65h10M43 65h10M62 65h10"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="overlapping-series">
            <path d="M22 41h12v19H22zM41 29h12v31H41zM60 23h12v37H60z" class="thumbnail-first" />
            <path d="M28 37h12v23H28zM47 34h12v26H47zM66 31h12v29H66z" class="thumbnail-second" />
          </g>
          <path
            data-thumbnail-element="labels-front-series-inside"
            d="M31 42h6M50 39h6M69 36h6"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="legend-right">
            <path d="M86 34h4v4h-4z" class="thumbnail-first" />
            <path d="M86 43h4v4h-4z" class="thumbnail-second" />
            <path d="M93 36h12M93 45h12" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout10") }}</span>
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="selected === 11"
        :aria-disabled="disabled"
        :disabled="disabled"
        :title="t('chart.quickLayout11')"
        data-chart-quick-layout="11"
        v-on="bindings.eleven"
      >
        <svg viewBox="0 0 112 76" aria-hidden="true">
          <path
            data-thumbnail-element="gridlines"
            d="M16 14h63M16 29h63M16 44h63"
            class="thumbnail-grid"
          />
          <path data-thumbnail-element="axes" d="M16 8v52h63" class="thumbnail-axis" />
          <path
            data-thumbnail-element="axis-labels"
            d="M10 14h3M10 29h3M10 44h3M10 59h3M24 65h9M43 65h9M62 65h9"
            class="thumbnail-label"
          />
          <g data-thumbnail-element="series">
            <path d="M23 36h7v24h-7zM42 21h7v39h-7zM61 14h7v46h-7z" class="thumbnail-first" />
            <path d="M31 32h7v28h-7zM50 28h7v32h-7zM69 25h7v35h-7z" class="thumbnail-second" />
          </g>
          <g data-thumbnail-element="legend-right">
            <path d="M86 30h4v4h-4z" class="thumbnail-first" />
            <path d="M86 39h4v4h-4z" class="thumbnail-second" />
            <path d="M93 32h12M93 41h12" class="thumbnail-label" />
          </g>
        </svg>
        <span>{{ t("chart.quickLayout11") }}</span>
      </button>
    </div>
    <p class="chart-quick-layout-gallery__hint">{{ t("chart.quickLayoutHint") }}</p>
    <p v-if="selected === undefined" class="chart-quick-layout-gallery__hint">
      {{ t("chart.quickLayoutCustomHint") }}
    </p>
    <p v-if="previewFailed" class="chart-quick-layout-gallery__error" role="alert">
      {{ t("chart.quickLayoutPreviewFailed") }}
    </p>
    <p v-if="failed" class="chart-quick-layout-gallery__error" role="alert">
      {{ t("chart.quickLayoutApplyFailed") }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
.chart-quick-layout-gallery {
  width: min(396px, calc(100vw - 48px));
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
    width: 100%;
    max-width: 112px;
    height: 76px;
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

  .thumbnail-title,
  .thumbnail-label,
  .thumbnail-axis,
  .thumbnail-grid,
  .thumbnail-minor-grid {
    fill: none;
    stroke: currentColor;
  }

  .thumbnail-title {
    stroke-width: 2.5;
    opacity: 0.7;
  }

  .thumbnail-label,
  .thumbnail-axis {
    stroke-width: 1;
    opacity: 0.65;
  }

  .thumbnail-grid {
    stroke-width: 0.75;
    opacity: 0.3;
  }

  .thumbnail-minor-grid {
    stroke-width: 0.5;
    opacity: 0.2;
  }

  .thumbnail-first {
    fill: #5470c6;
  }

  .thumbnail-second {
    fill: #eea34a;
  }
}

@media (max-width: 360px) {
  .chart-quick-layout-gallery__choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
