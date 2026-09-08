<script setup lang="ts">
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed, ref, watch } from "vue";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import type { CellNumberFormat, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";

type NumberKind = "general" | CellNumberFormat["kind"];

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { locale, t } = useAppI18n();
const kind = ref<NumberKind>(resolveKind());
const fractionDigits = ref(resolveFractionDigits());
const currency = ref(resolveCurrency());

function currentFormat(): CellNumberFormat | undefined {
  return Object.hasOwn(props.patch, "numberFormat")
    ? ((props.patch.numberFormat as CellNumberFormat | null | undefined) ?? undefined)
    : props.state.numberFormat.mixed
      ? undefined
      : props.state.numberFormat.value;
}
function resolveKind(): NumberKind {
  return currentFormat()?.kind ?? "general";
}
function resolveFractionDigits(): number {
  return currentFormat()?.fractionDigits ?? 2;
}
function resolveCurrency(): string {
  const format = currentFormat();
  return format?.kind === "currency" ? format.currency : locale.value === "zh-CN" ? "CNY" : "USD";
}
function emitPatch(): void {
  const next: CellStylePatch =
    kind.value === "general"
      ? { numberFormat: null }
      : kind.value === "currency"
        ? {
            numberFormat: {
              kind: "currency",
              currency: currency.value,
              fractionDigits: fractionDigits.value,
            },
          }
        : { numberFormat: { kind: kind.value, fractionDigits: fractionDigits.value } };
  emit("update:patch", next);
}
function updateKind(value: NumberKind): void {
  kind.value = value;
  emitPatch();
}
function updateDigits(value: InputNumberValue): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  fractionDigits.value = Math.max(0, Math.min(20, Math.round(value)));
  emitPatch();
}
function updateCurrency(value: SelectValue): void {
  if (typeof value !== "string") return;
  currency.value = value;
  emitPatch();
}
const kindLabels = computed<Record<NumberKind, string>>(() => ({
  general: t("cellFormat.general"),
  number: t("cellFormat.numeric"),
  percent: t("cellFormat.percent"),
  currency: t("cellFormat.currency"),
}));
const kindDescriptions = computed<Record<NumberKind, string>>(() => ({
  general: t("cellFormat.generalDescription"),
  number: t("cellFormat.numericDescription"),
  percent: t("cellFormat.percentDescription"),
  currency: t("cellFormat.currencyDescription"),
}));
const currencyOptions = computed(() =>
  [...new Set(["CNY", "USD", "EUR", "JPY", currency.value])].map((value) => ({
    label:
      value === "CNY" || value === "JPY"
        ? `${value} (¥)`
        : value === "USD"
          ? "USD ($)"
          : value === "EUR"
            ? "EUR (€)"
            : value,
    value,
  })),
);
const kindValue = computed<NumberKind | undefined>(() =>
  Object.hasOwn(props.patch, "numberFormat")
    ? kind.value
    : props.state.numberFormat.mixed
      ? undefined
      : kind.value,
);
const preview = computed(() => {
  if (
    kind.value === "general" ||
    (props.sampleValue !== null && typeof props.sampleValue !== "number")
  )
    return formatComputedValueForDisplay(props.sampleValue ?? 1234.567);
  const value = typeof props.sampleValue === "number" ? props.sampleValue : 1234.567;
  if (kind.value === "percent")
    return new Intl.NumberFormat(locale.value, {
      style: "percent",
      minimumFractionDigits: fractionDigits.value,
      maximumFractionDigits: fractionDigits.value,
    }).format(value);
  if (kind.value === "currency")
    return new Intl.NumberFormat(locale.value, {
      style: "currency",
      currency: currency.value,
      minimumFractionDigits: fractionDigits.value,
      maximumFractionDigits: fractionDigits.value,
    }).format(value);
  return new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: fractionDigits.value,
    maximumFractionDigits: fractionDigits.value,
  }).format(value);
});
watch(
  () => props.state,
  () => {
    kind.value = resolveKind();
    fractionDigits.value = resolveFractionDigits();
    currency.value = resolveCurrency();
  },
  { deep: true },
);
</script>

<template>
  <section class="cell-format-number" :aria-label="t('cellFormat.number')">
    <div class="cell-format-number__categories">
      <p class="cell-format-number__caption">{{ t("cellFormat.category") }}</p>
      <div
        role="group"
        :aria-label="t('cellFormat.category')"
        class="cell-format-number__choices"
        data-cell-format-number-kind
      >
        <button
          type="button"
          :aria-pressed="kindValue === 'general'"
          data-cell-format-number-category="general"
          @click="updateKind('general')"
        >
          {{ t("cellFormat.general") }}
        </button>
        <button
          type="button"
          :aria-pressed="kindValue === 'number'"
          data-cell-format-number-category="number"
          @click="updateKind('number')"
        >
          {{ t("cellFormat.numeric") }}
        </button>
        <button
          type="button"
          :aria-pressed="kindValue === 'percent'"
          data-cell-format-number-category="percent"
          @click="updateKind('percent')"
        >
          {{ t("cellFormat.percent") }}
        </button>
        <button
          type="button"
          :aria-pressed="kindValue === 'currency'"
          data-cell-format-number-category="currency"
          @click="updateKind('currency')"
        >
          {{ t("cellFormat.currency") }}
        </button>
      </div>
    </div>
    <div class="cell-format-number__details">
      <div class="cell-format-number__settings">
        <div class="cell-format-number__intro">
          <h3>{{ kindValue ? kindLabels[kindValue] : t("format.mixed") }}</h3>
          <p>
            {{ kindValue ? kindDescriptions[kindValue] : t("cellFormat.mixedNumberDescription") }}
          </p>
        </div>
        <label v-if="kindValue && kind !== 'general'" class="cell-format-number__field">
          <span>{{ t("cellFormat.decimalPlaces") }}</span>
          <TInputNumber
            :model-value="fractionDigits"
            class="cell-format-number__control cell-format-number__control--digits"
            :min="0"
            :max="20"
            :decimal-places="0"
            data-cell-format-decimals
            @change="updateDigits"
          />
        </label>
        <label v-if="kindValue && kind === 'currency'" class="cell-format-number__field">
          <span>{{ t("cellFormat.currencyCode") }}</span>
          <TSelect
            :model-value="currency"
            :options="currencyOptions"
            class="cell-format-number__control"
            data-cell-format-currency
            @change="updateCurrency"
          />
        </label>
      </div>
      <div class="cell-format-number__preview">
        <span class="cell-format-number__caption">{{ t("cellFormat.preview") }}</span>
        <div class="cell-format-preview">
          <output data-cell-format-number-preview>{{
            kindValue ? preview : t("format.mixed")
          }}</output>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/format-panel";

.cell-format-number {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 24px;
  padding-top: 16px;
  font-size: 13px;

  &__categories {
    padding-right: 16px;
    border-right: 1px solid var(--idea-border-subtle);
  }

  &__caption {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: 12px;
    line-height: 20px;
  }

  &__categories > &__caption {
    padding: 0 10px;
    margin-bottom: 8px;
  }

  &__choices {
    display: grid;
    gap: 4px;

    button {
      min-height: 36px;
      padding: 8px 10px;
      font: inherit;
      text-align: left;
      color: var(--idea-text-primary);
      background: transparent;
      border: 0;
      border-radius: var(--idea-radius-default);
      cursor: pointer;

      &:hover {
        background: var(--idea-surface-hover);
      }

      &[aria-pressed="true"] {
        color: var(--idea-action-primary);
        background: var(--idea-action-primary-subtle);
        font-weight: 600;
      }

      &:focus-visible {
        outline: 2px solid var(--idea-action-primary);
        outline-offset: 2px;
      }
    }
  }

  &__details {
    display: grid;
    gap: 20px;
    min-width: 0;
  }

  &__settings {
    display: grid;
    align-content: start;
    gap: 16px;
    min-height: 160px;
  }

  &__intro {
    h3 {
      margin: 0 0 8px;
      color: var(--idea-text-primary);
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    p {
      margin: 0;
      color: var(--idea-text-secondary);
      font-size: 12px;
      line-height: 20px;
    }
  }

  &__field {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    color: var(--idea-text-secondary);
  }

  &__control {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;

    &--digits {
      max-width: 144px;
    }
  }

  &__preview {
    display: grid;
    gap: 8px;

    .cell-format-preview {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-height: 88px;
    }

    output {
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: 22px;
      line-height: 1.4;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
  }
}

@media (max-width: 480px) {
  .cell-format-number {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;

    &__categories {
      padding-right: 0;
      border-right: 0;
    }

    &__choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__settings {
      min-height: 0;
    }

    &__field {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
  }
}
</style>
