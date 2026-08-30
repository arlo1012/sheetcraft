<script setup lang="ts">
import { DollarSign, Hash, MoveLeft, MoveRight, Percent } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-number-group"
    data-ribbon-group="number"
    role="group"
    :aria-label="t('ribbon.numberTools')"
  >
    <div class="home-number-group__row" data-ribbon-row="1">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.numberFormat') })"
        :text="t('ribbon.generalFormat')"
        disabled
        disclosure
        data-ribbon-placeholder="number-format"
      >
        <Hash :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-number-group__row" data-ribbon-row="2">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.percentFormat') })"
        disabled
        data-ribbon-placeholder="percent-format"
      >
        <Percent :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.currencyFormat') })"
        disabled
        data-ribbon-placeholder="currency-format"
      >
        <DollarSign :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.decreaseDecimal') })"
        disabled
        data-ribbon-placeholder="decrease-decimal"
      >
        <MoveLeft :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.increaseDecimal') })"
        disabled
        data-ribbon-placeholder="increase-decimal"
      >
        <MoveRight :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-number-group {
  @include ribbon.compact;

  &__row {
    @include ribbon.row;
  }
}
</style>
