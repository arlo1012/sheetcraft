<script setup lang="ts">
import { DollarSign, Percent } from "lucide-vue-next";
import ThousandsSeparatorIcon from "./ThousandsSeparatorIcon.vue";
import DecimalPlacesIcon from "./DecimalPlacesIcon.vue";
import { computed } from "vue";
import type { CellValueConversionMode } from "@idea10/core/commands";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import NumberFormatMenu from "./NumberFormatMenu.vue";
import NumberConversionMenu from "./NumberConversionMenu.vue";
import { createNumberFormatPreset, type NumberFormatPresetChoice } from "../number-format-presets";

const props = withDefaults(
  defineProps<{
    state: SelectionCellStyleState;
    disabled: boolean;
    conversionDisabled?: boolean;
  }>(),
  { conversionDisabled: undefined },
);
const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  convert: [mode: CellValueConversionMode];
  openCellFormat: [];
}>();
const { locale, t } = useAppI18n();
const currentFormat = computed(() => props.state.numberFormat.value);
const canAdjustDecimals = computed(() => {
  const kind = currentFormat.value?.kind;
  return !kind || ["number", "percent", "currency", "accounting", "scientific"].includes(kind);
});

const isConversionDisabled = computed(() => props.conversionDisabled ?? props.disabled);

function applyThousandsSeparator(): void {
  if (props.disabled) return;
  const current = props.state.numberFormat.mixed ? undefined : currentFormat.value;
  emit("applyStyle", {
    numberFormat:
      current?.kind === "number"
        ? { ...current, useGrouping: true }
        : { kind: "number", fractionDigits: 2, useGrouping: true },
  });
}

function selectFormat(choice: NumberFormatPresetChoice): void {
  if (props.disabled) return;
  emit("applyStyle", {
    numberFormat: createNumberFormatPreset(choice, props.state.numberFormat, locale.value) ?? null,
  });
}
</script>

<template>
  <section
    class="home-number-group"
    data-ribbon-group="number"
    role="group"
    :aria-label="t('ribbon.numberTools')"
    :aria-disabled="disabled && isConversionDisabled"
    :title="disabled && isConversionDisabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-number-group__row" data-ribbon-row="1">
      <NumberFormatMenu
        :state="state.numberFormat"
        :disabled="disabled"
        @select="selectFormat"
        @open-cell-format="emit('openCellFormat')"
      />
      <NumberConversionMenu :disabled="isConversionDisabled" @convert="emit('convert', $event)" />
    </div>
    <div class="home-number-group__row" data-ribbon-row="2">
      <RibbonButton
        :label="t('ribbon.percentFormat')"
        :disabled="disabled"
        data-ribbon-action="percent-format"
        @activate="selectFormat('percent')"
      >
        <Percent aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.currencyFormat')"
        :disabled="disabled"
        data-ribbon-action="currency-format"
        @activate="selectFormat('currency')"
      >
        <DollarSign aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.thousandsSeparator')"
        :disabled="disabled"
        data-ribbon-action="thousands-separator"
        @activate="applyThousandsSeparator"
      >
        <ThousandsSeparatorIcon />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.decreaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="decrease-decimal"
        @activate="emit('adjustDecimals', -1)"
      >
        <DecimalPlacesIcon :increase="false" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.increaseDecimal')"
        :disabled="disabled || !canAdjustDecimals"
        data-ribbon-action="increase-decimal"
        @activate="emit('adjustDecimals', 1)"
      >
        <DecimalPlacesIcon increase />
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
