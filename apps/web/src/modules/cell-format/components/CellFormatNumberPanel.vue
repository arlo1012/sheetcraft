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
function updateKind(value: SelectValue): void {
  if (typeof value !== "string") return;
  kind.value = value as NumberKind;
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
const kindOptions = computed(() => [
  { label: t("cellFormat.general"), value: "general" },
  { label: t("cellFormat.numeric"), value: "number" },
  { label: t("cellFormat.percent"), value: "percent" },
  { label: t("cellFormat.currency"), value: "currency" },
]);
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
    return formatComputedValueForDisplay(props.sampleValue);
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
    <label class="cell-format-number__field"
      ><span>{{ t("cellFormat.category") }}</span
      ><TSelect
        :model-value="kindValue"
        :options="kindOptions"
        :placeholder="
          state.numberFormat.mixed && !Object.hasOwn(patch, 'numberFormat')
            ? t('format.mixed')
            : undefined
        "
        class="cell-format-number__control"
        data-cell-format-number-kind
        @change="updateKind"
    /></label>
    <label v-if="kind !== 'general'" class="cell-format-number__field"
      ><span>{{ t("cellFormat.decimalPlaces") }}</span
      ><TInputNumber
        :model-value="fractionDigits"
        class="cell-format-number__control"
        :min="0"
        :max="20"
        :decimal-places="0"
        data-cell-format-decimals
        @change="updateDigits"
    /></label>
    <label v-if="kind === 'currency'" class="cell-format-number__field"
      ><span>{{ t("cellFormat.currencyCode") }}</span
      ><TSelect
        :model-value="currency"
        :options="currencyOptions"
        class="cell-format-number__control"
        data-cell-format-currency
        @change="updateCurrency"
    /></label>
    <div class="cell-format-number__preview">
      <span>{{ t("cellFormat.preview") }}</span
      ><output data-cell-format-number-preview>{{ preview }}</output>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-number {
  display: grid;
  gap: 16px;
  padding: 8px 4px;
  &__field {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
  &__control {
    box-sizing: border-box;
    min-width: 0;
  }
  &__preview {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--idea-border-subtle);
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
  output {
    color: var(--idea-text-primary);
  }
}

@media (max-width: 480px) {
  .cell-format-number {
    > label,
    &__field,
    &__color,
    &__palette,
    &__preview {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    &__emphasis {
      padding-left: 0;
    }
  }
}
</style>
