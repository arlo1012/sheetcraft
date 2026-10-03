<script setup lang="ts">
import { computed } from "vue";
import { Trash2 } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import type { DataToolColumn } from "../data-tools-types";
import type { LookupFillFieldDraft } from "../lookup-fill-types";

const props = defineProps<{
  title: string;
  empty: string;
  fields: readonly LookupFillFieldDraft[];
  sourceColumns: readonly DataToolColumn[];
  targetColumns: readonly DataToolColumn[];
  busy?: boolean;
}>();
const emit = defineEmits<{
  add: [];
  clear: [];
  remove: [index: number];
  change: [index: number, field: LookupFillFieldDraft];
}>();
defineSlots<{ actions?(): unknown }>();
const { t } = useAppI18n();
const rows = computed(() => props.fields.map((field, index) => ({ ...field, id: index })));
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "sourceColumn", title: t("dataTools.lookupFill.sourceColumn") },
  { colKey: "targetColumn", title: t("dataTools.lookupFill.targetColumn") },
  { colKey: "remove", title: "", width: 36 },
]);
const options = (items: readonly DataToolColumn[]) =>
  items.map((item) => ({
    value: item.column,
    label: item.header ? `${item.label} (${item.header})` : item.label,
  }));
const sourceOptions = computed(() => options(props.sourceColumns));
const targetOptions = computed(() => options(props.targetColumns));
function change(index: number, key: keyof LookupFillFieldDraft, value: unknown): void {
  const field = props.fields[index];
  if (!props.busy && field && typeof value === "number")
    emit("change", index, { ...field, [key]: value });
}
</script>
<template>
  <section class="lookup-field-mapping-table" :aria-label="title">
    <div class="lookup-field-mapping-table__header">
      <strong class="lookup-field-mapping-table__title">{{ title }}</strong>
      <div class="lookup-field-mapping-table__toolbar">
        <slot name="actions" />
        <TButton variant="outline" :disabled="busy || !fields.length" @click="emit('clear')">{{
          t("dataTools.lookupFill.clearFields")
        }}</TButton>
        <TButton variant="outline" :disabled="busy" @click="emit('add')">{{
          t("dataTools.lookupFill.addField")
        }}</TButton>
      </div>
    </div>
    <div class="lookup-field-mapping-table__table">
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini"
          row-key="id"
          :data="rows"
          :columns="columns"
          :height="height"
          :bordered="false"
          :empty="empty"
          size="small"
          table-layout="fixed"
          hover
          :aria-label="title"
        >
          <template #sourceColumn="{ row, rowIndex }">
            <TSelect
              :value="row.sourceColumn"
              :options="sourceOptions"
              :disabled="busy"
              :aria-label="t('dataTools.lookupFill.sourceField')"
              @update:value="change(rowIndex, 'sourceColumn', $event)"
            />
          </template>
          <template #targetColumn="{ row, rowIndex }">
            <TSelect
              :value="row.targetColumn"
              :options="targetOptions"
              :disabled="busy"
              :aria-label="t('dataTools.lookupFill.targetField')"
              @update:value="change(rowIndex, 'targetColumn', $event)"
            />
          </template>
          <template #remove="{ rowIndex }">
            <span
              v-icon-action="busy"
              :aria-label="t('dataTools.lookupFill.removeField')"
              :title="t('dataTools.lookupFill.removeField')"
              @click="emit('remove', rowIndex)"
              ><Trash2 :size="15"
            /></span>
          </template>
        </TTable>
      </TableHeightWrapper>
    </div>
  </section>
</template>
<style scoped lang="scss">
.lookup-field-mapping-table {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  &__title {
    flex-shrink: 0;
    font-weight: 500;
  }
  &__toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  &__table {
    height: 220px;
    min-width: 0;
    min-height: 0;
  }
  &__table [role="button"] {
    width: 28px;
    height: 28px;
  }
}
</style>
