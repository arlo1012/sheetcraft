<script setup lang="ts">
import { Input } from "tdesign-vue-next/es/input";
import {
  Settings2,
  RefreshCw,
  Database,
  Eraser,
  Move,
  Trash2,
  ChartColumnIncreasing,
  PanelRight,
  Table2,
} from "lucide-vue-next";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
const props = defineProps<{
  table: SheetPivotTable;
  disabled: boolean;
  fieldsVisible: boolean;
  activeField: string;
}>();
const emit = defineEmits<{
  rename: [name: string];
  settings: [];
  refresh: [];
  source: [];
  clear: [];
  move: [];
  remove: [];
  chart: [];
  fields: [];
  convert: [];
}>();
const { t } = useAppI18n();
function rename(value: string): void {
  const name = value.trim();
  if (name && name !== props.table.name && !props.disabled) emit("rename", name);
}
</script>
<template>
  <RibbonToolbar :label="t('pivot.analysis')">
    <section class="pivot-analysis__group">
      <div class="pivot-analysis__stack">
        <label>{{ t("pivot.name") }}</label>
        <Input
          :key="`${table.id}-${table.name}`"
          :default-value="table.name"
          size="small"
          :maxlength="200"
          :disabled="disabled"
          :aria-label="t('pivot.name')"
          @blur="rename(String($event))"
          @enter="rename(String($event))"
        />
      </div>
    </section>
    <section class="pivot-analysis__group">
      <div class="pivot-analysis__stack">
        <label>{{ t("pivot.activeField") }}</label
        ><span class="pivot-analysis__field">{{ activeField || "—" }}</span>
      </div>
      <RibbonButton
        variant="tall"
        :label="t('pivot.fieldSettings')"
        :text="t('pivot.fieldSettings')"
        :disabled="disabled || !activeField"
        @activate="emit('settings')"
        ><Settings2
      /></RibbonButton>
    </section>
    <section class="pivot-analysis__group">
      <RibbonButton
        variant="tall"
        :label="t('pivot.refresh')"
        :text="t('pivot.refresh')"
        :disabled="disabled"
        @activate="emit('refresh')"
        ><RefreshCw
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('pivot.changeSource')"
        :text="t('pivot.changeSource')"
        :disabled="disabled"
        @activate="emit('source')"
        ><Database
      /></RibbonButton>
    </section>
    <section class="pivot-analysis__group">
      <RibbonButton
        variant="tall"
        :label="t('pivot.clearFields')"
        :text="t('pivot.clearFields')"
        :disabled="disabled"
        @activate="emit('clear')"
        ><Eraser
      /></RibbonButton>
      <div class="pivot-analysis__stack">
        <RibbonButton
          :label="t('pivot.move')"
          :text="t('pivot.move')"
          :disabled="disabled"
          @activate="emit('move')"
          ><Move
        /></RibbonButton>
        <RibbonButton
          :label="t('pivot.delete')"
          :text="t('pivot.delete')"
          :disabled="disabled"
          @activate="emit('remove')"
          ><Trash2
        /></RibbonButton>
      </div>
      <RibbonButton
        variant="tall"
        :label="t('pivot.convert')"
        :text="t('pivot.convert')"
        :disabled="disabled"
        @activate="emit('convert')"
        ><Table2
      /></RibbonButton>
    </section>
    <section class="pivot-analysis__group">
      <RibbonButton
        variant="tall"
        :label="t('pivot.chart')"
        :text="t('pivot.chart')"
        :disabled="disabled"
        @activate="emit('chart')"
        ><ChartColumnIncreasing
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('pivot.fieldList')"
        :text="t('pivot.fieldList')"
        :pressed="fieldsVisible"
        @activate="emit('fields')"
        ><PanelRight
      /></RibbonButton>
    </section>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.pivot-analysis {
  &__group {
    @include ribbon.columns;
  }
  &__stack {
    @include ribbon.stack;
    min-width: 110px;
    max-width: 180px;
  }
  &__field {
    box-sizing: border-box;
    height: var(--ribbon-control-height, 26px);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    padding: 2px 6px;
    border: 1px solid var(--idea-border-control);
    border-radius: 3px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>
