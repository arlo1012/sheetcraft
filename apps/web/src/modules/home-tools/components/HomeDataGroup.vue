<script setup lang="ts">
import { Database, LockKeyhole, Sigma } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import type { FilterValueKey, HomeDataToolState } from "./data-tool-state";
import FilterValueMenu from "./FilterValueMenu.vue";
import SheetFreezeMenu from "../../../shared/sheet-view/SheetFreezeMenu.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import SortMenu from "./SortMenu.vue";

defineProps<{ state: HomeDataToolState; readOnly?: boolean; editSessionId?: string }>();

const { t } = useAppI18n();

const emit = defineEmits<{
  autoSum: [];
  sort: [direction: "ascending" | "descending"];
  applyFilter: [includedKeys: FilterValueKey[]];
  clearFilter: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
  toggleProtection: [];
  openDataTools: [];
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
      :disabled="readOnly || !state.filterEnabled"
      :active="state.filter.active"
      :options="state.filter.options"
      :applied-keys="state.filter.appliedKeys"
      data-ribbon-layout="tall"
      data-ribbon-span="2"
      @apply="emit('applyFilter', $event)"
      @clear-filter="emit('clearFilter')"
    />

    <div class="home-data-group__stack" data-ribbon-stack="freeze-sort">
      <SheetFreezeMenu
        :disabled="readOnly || !state.freezeEnabled"
        :active-cell="state.activeCell"
        :freeze="state.freeze"
        data-ribbon-row="1"
        @freeze="emit('freeze', $event)"
        @unfreeze="emit('unfreeze')"
      />
      <SortMenu
        :disabled="readOnly || !state.sortEnabled"
        data-ribbon-row="2"
        @sort="emit('sort', $event)"
      />
    </div>

    <div class="home-data-group__stack" data-ribbon-stack="sum-data">
      <RibbonButton
        :label="t('ribbon.autoSum')"
        :text="t('ribbon.autoSum')"
        data-ribbon-action="auto-sum"
        :data-cell-edit-session="editSessionId"
        :disabled="readOnly"
        data-ribbon-row="1"
        @activate="emit('autoSum')"
      >
        <Sigma aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.data')"
        :text="t('ribbon.data')"
        data-ribbon-action="open-data-tools"
        data-ribbon-row="2"
        @activate="emit('openDataTools')"
      >
        <Database aria-hidden="true" />
      </RibbonButton>
    </div>

    <RibbonButton
      variant="tall"
      :label="readOnly ? t('sheetTabs.unprotectAction') : t('sheetTabs.protectAction')"
      :text="readOnly ? t('sheetTabs.unprotectAction') : t('ribbon.protect')"
      :pressed="readOnly"
      data-ribbon-layout="tall"
      data-ribbon-action="protect"
      data-ribbon-span="2"
      @activate="emit('toggleProtection')"
    >
      <LockKeyhole aria-hidden="true" />
    </RibbonButton>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-data-group {
  @include ribbon.columns;

  &__stack {
    @include ribbon.stack;
  }
}
</style>
