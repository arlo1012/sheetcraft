<script setup lang="ts">
import { Sparkles, TableProperties } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-styles-group"
    data-ribbon-group="styles"
    role="group"
    :aria-label="t('format.styleRuleTools')"
  >
    <div class="home-styles-group__row" data-ribbon-row="1">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
        :text="t('ribbon.tableStyles')"
        disabled
        disclosure
        data-ribbon-placeholder="table-styles"
      >
        <TableProperties :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-styles-group__row" data-ribbon-row="2">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.conditionalFormatting') })"
        :text="t('ribbon.conditionalFormatting')"
        disabled
        disclosure
        data-ribbon-placeholder="conditional-formatting"
      >
        <Sparkles :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-styles-group {
  @include ribbon.compact;

  --ribbon-labeled-action-width: 100%;
  --ribbon-labeled-action-justify: flex-start;
  --ribbon-labeled-action-padding: 3px;

  &__row {
    @include ribbon.row;
  }
}
</style>
