<script setup lang="ts">
import { Printer } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-utility-group"
    data-ribbon-group="utility"
    role="group"
    :aria-label="t('ribbon.utilityTools')"
  >
    <RibbonIconAction
      class="home-utility-group__print"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.print') })"
      :text="t('ribbon.print')"
      disabled
      data-ribbon-layout="tall"
      data-ribbon-placeholder="print"
      data-ribbon-span="2"
    >
      <Printer :size="17" aria-hidden="true" />
    </RibbonIconAction>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-utility-group {
  @include ribbon.mixed(58px);

  padding-right: 6px;
  padding-left: 6px;
  border-right: 0;

  &__print {
    grid-row: 1 / 3;
  }
}
</style>
