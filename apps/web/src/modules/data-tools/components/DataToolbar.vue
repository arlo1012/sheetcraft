<script setup lang="ts">
import {
  SquarePlus,
  SquareMinus,
  Rows3,
  Columns3,
  TableProperties,
  Combine,
  Database,
  Filter,
  ShieldCheck,
  ListFilter,
} from "lucide-vue-next";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolCapabilities } from "../data-tools-types";
import DataOutlineTools from "./DataOutlineTools.vue";
import DataFilterTool from "./DataFilterTool.vue";
import DataDuplicatesTool from "./DataDuplicatesTool.vue";
import DataComparisonTool from "./DataComparisonTool.vue";
import type { DataComparisonAction } from "../data-comparison-types";
import type { FillDirection } from "@idea10/sheet-engine/fill-selection";
import DataFillTool from "./DataFillTool.vue";
import DataSortTool from "./DataSortTool.vue";
import type { DuplicateToolMode } from "../duplicate-tools-types";
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    comparisonDisabled?: boolean;
    fillDisabled?: boolean;
    canFillRows?: boolean;
    canFillColumns?: boolean;
    filterActive?: boolean;
    editSessionId?: string;
    capabilities: DataToolCapabilities;
  }>(),
  {
    disabled: false,
    comparisonDisabled: undefined,
    fillDisabled: false,
    canFillRows: false,
    canFillColumns: false,
    filterActive: false,
    editSessionId: undefined,
  },
);
const emit = defineEmits<{
  sort: [direction: "ascending" | "descending"];
  openSort: [];
  toggleFilter: [];
  advancedFilter: [];
  clearFilter: [];
  reapplyFilter: [];
  openTextToColumns: [];
  openRemoveDuplicates: [];
  openDuplicateValues: [mode: DuplicateToolMode];
  openConsolidate: [];
  openLookupFill: [];
  openComparison: [action: DataComparisonAction];
  clearDuplicateHighlights: [];
  clearDuplicateRejections: [];
  errorCheckOptions: [];
  openValidation: [];
  openDropdownList: [];
  fill: [direction: FillDirection];
  openFillSeries: [];
  openFillCurrentDate: [format: string];
  openFillBlanks: [];
  openFillText: [position: "start" | "end" | "index"];
  openFillNumberSequence: [];
  openFillRank: [];
  flashFill: [];
  group: [axis: "rows" | "columns"];
  ungroup: [axis: "rows" | "columns"];
  clearOutline: [];
  expand: [];
  collapse: [];
  openSubtotal: [];
}>();
const { t } = useAppI18n();
</script>
<template>
  <div
    class="data-toolbar"
    data-ribbon-tools
    role="group"
    :aria-label="t('dataTools.toolbar')"
    :data-cell-edit-session="editSessionId"
  >
    <section
      class="data-toolbar__group"
      role="group"
      :aria-label="t('dataTools.groups.sortFilter')"
    >
      <DataSortTool
        :disabled="disabled || !capabilities.sort"
        @sort="emit('sort', $event)"
        @custom="emit('openSort')"
      /><DataFilterTool
        :disabled="disabled"
        :active="filterActive"
        @toggle="emit('toggleFilter')"
        @advanced="emit('advancedFilter')"
      />
      <div class="data-toolbar__stack">
        <RibbonButton
          :disabled="disabled || !filterActive || !capabilities.clearFilter"
          :label="t('dataTools.filter.showAll')"
          :text="t('dataTools.filter.showAll')"
          data-data-action="clear-filter"
          @activate="emit('clearFilter')"
          ><Filter :size="14" /></RibbonButton
        ><RibbonButton
          :disabled="disabled || !filterActive"
          :label="t('dataTools.filter.reapply')"
          :text="t('dataTools.filter.reapply')"
          data-data-action="reapply-filter"
          @activate="emit('reapplyFilter')"
          ><Database :size="14"
        /></RibbonButton>
      </div>
    </section>
    <section class="data-toolbar__group" role="group" :aria-label="t('dataTools.groups.cleanup')">
      <RibbonButton
        variant="tall"
        :disabled="disabled || !capabilities.split"
        :label="t('dataTools.textToColumns.title')"
        :text="t('dataTools.textToColumns.title')"
        data-data-action="split"
        @activate="emit('openTextToColumns')"
        ><Columns3 :size="18" /></RibbonButton
      ><DataDuplicatesTool
        :disabled="disabled"
        :remove-duplicates="capabilities.removeDuplicates"
        @open="emit('openDuplicateValues', $event)"
        @clear-highlights="emit('clearDuplicateHighlights')"
        @clear-rejections="emit('clearDuplicateRejections')"
        @remove="emit('openRemoveDuplicates')"
        @error-check-options="emit('errorCheckOptions')"
      />
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('dataTools.lookupFill.title')"
        :text="t('dataTools.lookupFill.title')"
        data-data-action="lookup-fill"
        @activate="emit('openLookupFill')"
        ><TableProperties :size="18"
      /></RibbonButton>
      <DataComparisonTool
        :disabled="comparisonDisabled ?? disabled"
        @open="emit('openComparison', $event)"
      />
      <DataFillTool
        :disabled="disabled || fillDisabled"
        :can-fill-rows="canFillRows"
        :can-fill-columns="canFillColumns"
        @fill="emit('fill', $event)"
        @series="emit('openFillSeries')"
        @current-date="emit('openFillCurrentDate', $event)"
        @blanks="emit('openFillBlanks')"
        @insert-text="emit('openFillText', $event)"
        @number-sequence="emit('openFillNumberSequence')"
        @rank="emit('openFillRank')"
        @flash-fill="emit('flashFill')"
      />
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('dataTools.dropdownList')"
        :text="t('dataTools.dropdownList')"
        data-data-action="dropdown-list"
        @activate="emit('openDropdownList')"
        ><ListFilter :size="18"
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('dataTools.validation.title')"
        :text="t('dataTools.validation.title')"
        data-data-action="validation"
        @activate="emit('openValidation')"
        ><ShieldCheck :size="18"
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="disabled"
        :label="t('dataTools.consolidate.title')"
        :text="t('dataTools.consolidate.title')"
        data-data-action="consolidate"
        @activate="emit('openConsolidate')"
        ><Combine :size="18"
      /></RibbonButton>
    </section>
    <section class="data-toolbar__group" role="group" :aria-label="t('dataTools.groups.outline')">
      <RibbonButton
        variant="tall"
        :disabled="disabled || !capabilities.subtotal"
        :label="t('dataTools.outline.subtotal')"
        :text="t('dataTools.outline.subtotal')"
        data-data-action="subtotal"
        @activate="emit('openSubtotal')"
        ><Rows3 :size="18" /></RibbonButton
      ><DataOutlineTools
        :disabled="disabled"
        :ungroup-rows="capabilities.ungroupRows"
        :ungroup-columns="capabilities.ungroupColumns"
        :clear-outline="capabilities.clearOutline"
        @group="emit('group', $event)"
        @ungroup="emit('ungroup', $event)"
        @clear-outline="emit('clearOutline')"
      />
      <div class="data-toolbar__stack data-toolbar__stack--outline">
        <RibbonButton
          :disabled="disabled || !capabilities.expand"
          :label="t('dataTools.outline.expand')"
          :text="t('dataTools.outline.expandShort')"
          data-data-action="expand"
          @activate="emit('expand')"
          ><SquarePlus :size="16" /></RibbonButton
        ><RibbonButton
          :disabled="disabled || !capabilities.collapse"
          :label="t('dataTools.outline.collapse')"
          :text="t('dataTools.outline.collapseShort')"
          data-data-action="collapse"
          @activate="emit('collapse')"
          ><SquareMinus :size="16"
        /></RibbonButton>
      </div>
    </section>
  </div>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.data-toolbar {
  @include ribbon.columns;
  &__group {
    @include ribbon.columns;
    gap: var(--idea-space-1);
    padding-right: var(--idea-space-2);
    border-right: 1px solid var(--idea-border-subtle);
    &:last-child {
      border-right: 0;
    }
  }
  &__stack {
    @include ribbon.stack;
    min-width: 64px;
    &--outline {
      min-width: 0;
    }
  }
}
</style>
