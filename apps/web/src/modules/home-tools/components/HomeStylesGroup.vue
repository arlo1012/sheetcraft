<script setup lang="ts">
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { Sparkles, TableProperties } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";

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
      <RibbonMenuButton
        full-width
        :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
        :text="t('ribbon.tableStyles')"
        disabled
        data-ribbon-placeholder="table-styles"
      >
        <TableProperties aria-hidden="true" />
      </RibbonMenuButton>
    </div>
    <div class="home-styles-group__row" data-ribbon-row="2">
      <RibbonMenuButton
        full-width
        :label="t('app.unavailableFeature', { feature: t('ribbon.conditionalFormatting') })"
        :text="t('ribbon.conditionalFormatting')"
        disabled
        data-ribbon-placeholder="conditional-formatting"
      >
        <Sparkles aria-hidden="true" />
      </RibbonMenuButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-styles-group {
  @include ribbon.compact;

  &__row {
    @include ribbon.row;
  }
}
</style>
