<script setup lang="ts">
import { ArrowDownAZ, Database, ListFilter, LockKeyhole, Sigma, Snowflake } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-data-group"
    data-ribbon-group="data"
    role="group"
    :aria-label="t('ribbon.dataTools')"
  >
    <RibbonIconAction
      class="home-data-group__filter"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.filter') })"
      :text="t('ribbon.filter')"
      disabled
      disclosure
      data-ribbon-layout="tall"
      data-ribbon-placeholder="filter"
      data-ribbon-span="2"
    >
      <ListFilter :size="17" aria-hidden="true" />
    </RibbonIconAction>

    <div
      class="home-data-group__stack home-data-group__freeze-stack"
      data-ribbon-stack="freeze-sort"
    >
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.freeze') })"
        :text="t('ribbon.freeze')"
        disabled
        disclosure
        data-ribbon-placeholder="freeze"
        data-ribbon-row="1"
      >
        <Snowflake :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.sort') })"
        :text="t('ribbon.sort')"
        disabled
        disclosure
        data-ribbon-placeholder="sort"
        data-ribbon-row="2"
      >
        <ArrowDownAZ :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>

    <div class="home-data-group__stack home-data-group__sum-stack" data-ribbon-stack="sum-data">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.sum') })"
        :text="t('ribbon.sum')"
        disabled
        disclosure
        data-ribbon-placeholder="sum"
        data-ribbon-row="1"
      >
        <Sigma :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.data') })"
        :text="t('ribbon.data')"
        disabled
        disclosure
        data-ribbon-placeholder="data"
        data-ribbon-row="2"
      >
        <Database :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>

    <RibbonIconAction
      class="home-data-group__protect"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.protect') })"
      :text="t('ribbon.protect')"
      disabled
      disclosure
      data-ribbon-layout="tall"
      data-ribbon-placeholder="protect"
      data-ribbon-span="2"
    >
      <LockKeyhole :size="17" aria-hidden="true" />
    </RibbonIconAction>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-data-group {
  @include ribbon.mixed(58px max-content max-content 58px);

  &__filter,
  &__stack,
  &__protect {
    grid-row: 1 / 3;
  }

  &__filter {
    grid-column: 1;
  }

  &__freeze-stack {
    grid-column: 2;
  }

  &__sum-stack {
    grid-column: 3;
  }

  &__protect {
    grid-column: 4;
  }

  &__stack {
    @include ribbon.stack;

    min-width: 60px;
  }
}
</style>
