<script setup lang="ts">
import { Database, LockKeyhole, Sigma } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import type { FilterValueKey, HomeDataToolState } from "./data-tool-state";
import FilterValueMenu from "./FilterValueMenu.vue";
import FreezeMenu from "./FreezeMenu.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import SortMenu from "./SortMenu.vue";

defineProps<{ state: HomeDataToolState }>();

const { t } = useAppI18n();

const emit = defineEmits<{
  autoSum: [];
  sort: [direction: "ascending" | "descending"];
  applyFilter: [includedKeys: FilterValueKey[]];
  clearFilter: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
}>();
</script>

<template>
  <section
    class="home-data-group"
    data-ribbon-group="data"
    role="group"
    :aria-label="t('ribbon.dataTools')"
  >
    <FilterValueMenu
      class="home-data-group__filter"
      :disabled="!state.filterEnabled"
      :active="state.filter.active"
      :options="state.filter.options"
      :applied-keys="state.filter.appliedKeys"
      data-ribbon-layout="tall"
      data-ribbon-span="2"
      @apply="emit('applyFilter', $event)"
      @clear-filter="emit('clearFilter')"
    />

    <div
      class="home-data-group__stack home-data-group__freeze-stack"
      data-ribbon-stack="freeze-sort"
    >
      <FreezeMenu
        :disabled="!state.freezeEnabled"
        :active-cell="state.activeCell"
        :freeze="state.freeze"
        data-ribbon-row="1"
        @freeze="emit('freeze', $event)"
        @unfreeze="emit('unfreeze')"
      />
      <SortMenu :disabled="!state.sortEnabled" data-ribbon-row="2" @sort="emit('sort', $event)" />
    </div>

    <div class="home-data-group__stack home-data-group__sum-stack" data-ribbon-stack="sum-data">
      <RibbonIconAction
        :label="t('ribbon.autoSum')"
        :text="t('ribbon.autoSum')"
        data-ribbon-action="auto-sum"
        data-ribbon-row="1"
        @activate="emit('autoSum')"
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
