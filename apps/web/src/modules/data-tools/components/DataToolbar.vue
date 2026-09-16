<script setup lang="ts">
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronUp,
  Columns3,
  Database,
  Filter,
  ListFilter,
  Rows3,
  ShieldCheck,
  TableProperties,
  Ungroup,
} from "lucide-vue-next";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = withDefaults(
  defineProps<{ disabled?: boolean; filterActive?: boolean; editSessionId?: string }>(),
  { disabled: false, filterActive: false, editSessionId: undefined },
);
const emit = defineEmits<{
  sort: [direction: "ascending" | "descending"];
  openSort: [];
  toggleFilter: [];
  clearFilter: [];
  reapplyFilter: [];
  openTextToColumns: [];
  openRemoveDuplicates: [];
  openValidation: [];
  group: [axis: "rows" | "columns"];
  ungroup: [axis: "rows" | "columns"];
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
    <section class="data-toolbar__group" role="group" :aria-label="t('dataTools.sort.title')">
      <RibbonButton
        :disabled="disabled"
        :label="t('dataTools.sort.ascending')"
        :text="t('dataTools.sort.ascending')"
        @activate="emit('sort', 'ascending')"
        ><ArrowUpAZ :size="17" /></RibbonButton
      ><RibbonButton
        :disabled="disabled"
        :label="t('dataTools.sort.descending')"
        :text="t('dataTools.sort.descending')"
        @activate="emit('sort', 'descending')"
        ><ArrowDownAZ :size="17" /></RibbonButton
      ><RibbonButton
        :disabled="disabled"
        :label="t('dataTools.sort.custom')"
        :text="t('dataTools.sort.custom')"
        @activate="emit('openSort')"
        ><ListFilter :size="17"
      /></RibbonButton>
    </section>
    <section class="data-toolbar__group" role="group" :aria-label="t('dataTools.filter.toggle')">
      <RibbonButton
        :disabled="disabled"
        :pressed="filterActive"
        :label="t('dataTools.filter.toggle')"
        :text="t('dataTools.filter.toggle')"
        @activate="emit('toggleFilter')"
        ><Filter :size="18"
      /></RibbonButton>
      <div class="data-toolbar__stack">
        <RibbonButton
          :disabled="disabled || !filterActive"
          :label="t('dataTools.filter.clear')"
          :text="t('dataTools.filter.clear')"
          @activate="emit('clearFilter')"
          ><Filter :size="14" /></RibbonButton
        ><RibbonButton
          :disabled="disabled || !filterActive"
          :label="t('dataTools.filter.reapply')"
          :text="t('dataTools.filter.reapply')"
          @activate="emit('reapplyFilter')"
          ><Database :size="14"
        /></RibbonButton>
      </div>
    </section>
    <section
      class="data-toolbar__group"
      role="group"
      :aria-label="t('dataTools.textToColumns.title')"
    >
      <RibbonButton
        :disabled="disabled"
        :label="t('dataTools.textToColumns.title')"
        :text="t('dataTools.textToColumns.title')"
        @activate="emit('openTextToColumns')"
        ><Columns3 :size="18" /></RibbonButton
      ><RibbonButton
        :disabled="disabled"
        :label="t('dataTools.removeDuplicates.title')"
        :text="t('dataTools.removeDuplicates.title')"
        @activate="emit('openRemoveDuplicates')"
        ><TableProperties :size="18" /></RibbonButton
      ><RibbonButton
        :disabled="disabled"
        :label="t('dataTools.validation.title')"
        :text="t('dataTools.validation.title')"
        @activate="emit('openValidation')"
        ><ShieldCheck :size="18"
      /></RibbonButton>
    </section>
    <section class="data-toolbar__group" role="group" :aria-label="t('dataTools.outline.group')">
      <div class="data-toolbar__stack">
        <RibbonButton
          :disabled="disabled"
          :label="`${t('dataTools.outline.group')} ${t('dataTools.outline.rows')}`"
          :text="t('dataTools.outline.group')"
          @activate="emit('group', 'rows')"
          ><Rows3 :size="14" /></RibbonButton
        ><RibbonButton
          :disabled="disabled"
          :label="`${t('dataTools.outline.group')} ${t('dataTools.outline.columns')}`"
          :text="t('dataTools.outline.group')"
          @activate="emit('group', 'columns')"
          ><Columns3 :size="14"
        /></RibbonButton>
      </div>
      <div class="data-toolbar__stack">
        <RibbonButton
          :disabled="disabled"
          :label="`${t('dataTools.outline.ungroup')} ${t('dataTools.outline.rows')}`"
          :text="t('dataTools.outline.ungroup')"
          @activate="emit('ungroup', 'rows')"
          ><Ungroup :size="14" /></RibbonButton
        ><RibbonButton
          :disabled="disabled"
          :label="`${t('dataTools.outline.ungroup')} ${t('dataTools.outline.columns')}`"
          :text="t('dataTools.outline.ungroup')"
          @activate="emit('ungroup', 'columns')"
          ><Ungroup :size="14"
        /></RibbonButton>
      </div>
      <div class="data-toolbar__stack">
        <RibbonButton
          :disabled="disabled"
          :label="t('dataTools.outline.expand')"
          :text="t('dataTools.outline.expand')"
          @activate="emit('expand')"
          ><ChevronDown :size="14" /></RibbonButton
        ><RibbonButton
          :disabled="disabled"
          :label="t('dataTools.outline.collapse')"
          :text="t('dataTools.outline.collapse')"
          @activate="emit('collapse')"
          ><ChevronUp :size="14"
        /></RibbonButton>
      </div>
      <RibbonButton
        :disabled="disabled"
        :label="t('dataTools.outline.subtotal')"
        :text="t('dataTools.outline.subtotal')"
        @activate="emit('openSubtotal')"
        ><Database :size="18"
      /></RibbonButton>
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
    border-right: 1px solid var(--idea-border);
  }
  &__stack {
    @include ribbon.stack;
    min-width: 70px;
  }
}
</style>
