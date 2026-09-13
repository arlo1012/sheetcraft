<script setup lang="ts">
import { DollarSign, MoveLeft, MoveRight, Percent } from "lucide-vue-next";
import { computed } from "vue";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import NumberFormatMenu from "./NumberFormatMenu.vue";

type NumberFormatShortcut = "number" | "percent" | "currency";
const props = defineProps<{ state: SelectionCellStyleState; disabled: boolean }>();
const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  openCellFormat: [];
}>();
const { locale, t } = useAppI18n();
const currentFormat = computed(() => props.state.numberFormat.value);
const canAdjustDecimals = computed(() => {
  const kind = currentFormat.value?.kind;
  return !kind || ["number", "percent", "currency", "accounting", "scientific"].includes(kind);
});

function defaultCurrency(): "CNY" | "USD" {
  return locale.value === "zh-CN" ? "CNY" : "USD";
}

function selectedCurrency(): string {
  return currentFormat.value?.kind === "currency"
    ? currentFormat.value.currency
    : defaultCurrency();
}

function formatPatch(choice: NumberFormatShortcut): CellStylePatch {
  if (choice === "number") {
    return { numberFormat: { kind: "number", fractionDigits: 2 } };
  }
  if (choice === "percent") {
    return { numberFormat: { kind: "percent", fractionDigits: 0 } };
  }
  return { numberFormat: { kind: "currency", currency: selectedCurrency(), fractionDigits: 2 } };
}

function selectFormat(choice: "general" | NumberFormatShortcut): void {
  if (props.disabled) return;
  emit("applyStyle", choice === "general" ? { numberFormat: null } : formatPatch(choice));
}
</script>

<template>
  <section
    class="home-number-group"
    data-ribbon-group="number"
    role="group"
    :aria-label="t('ribbon.numberTools')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-number-group__row" data-ribbon-row="1">
      <NumberFormatMenu :state="state.numberFormat" :disabled="disabled" @select="selectFormat" />
    </div>
    <div class="home-number-group__row" data-ribbon-row="2">
      <RibbonButton
        :label="t('ribbon.percentFormat')"
        :disabled="disabled"
        data-ribbon-action="percent-format"
        @activate="selectFormat('percent')"
      >
        <Percent :size="15" aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.currencyFormat')"
        :disabled="disabled"
        data-ribbon-action="currency-format"
        @activate="selectFormat('currency')"
      >
        <DollarSign :size="15" aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.decreaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="decrease-decimal"
        @activate="emit('adjustDecimals', -1)"
      >
        <MoveLeft :size="15" aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.increaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="increase-decimal"
        @activate="emit('adjustDecimals', 1)"
      >
        <MoveRight :size="15" aria-hidden="true" />
      </RibbonButton>
    </div>
    <RibbonDialogLauncher
      :label="`${t('cellFormat.title')} · ${t('cellFormat.number')}`"
      :disabled="disabled"
      data-ribbon-dialog-launcher="number"
      @activate="emit('openCellFormat')"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-number-group {
  @include ribbon.compact;
  @include ribbon.dialog-launcher-anchor;

  &__row {
    @include ribbon.row;
  }
}
</style>
