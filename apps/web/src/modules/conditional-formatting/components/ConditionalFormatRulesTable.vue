<script setup lang="ts">
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type {
  BaseTableCol,
  RowEventContext,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import { useAppI18n } from "../../../shared/i18n";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";

export type ConditionalFormatTableRow = {
  id: string;
  rule: SheetConditionalFormatRule;
  description: string;
  rangeText: string;
  rangeError?: string;
};
const props = defineProps<{
  rows: ConditionalFormatTableRow[];
  selectedId?: string;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  select: [id: string | undefined];
  edit: [id: string];
  updateRange: [id: string, value: string];
  updateStop: [id: string, value: boolean];
}>();
const { t } = useAppI18n();
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "description", title: t("conditionalFormatting.rulePriority"), ellipsis: true },
  { colKey: "format", title: t("conditionalFormatting.format"), width: 128 },
  { colKey: "range", title: t("conditionalFormatting.appliesTo"), width: 220 },
  { colKey: "stop", title: t("conditionalFormatting.stopIfTrue"), width: 148, align: "center" },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row, rowIndex }) => ({
  "data-cf-rule": String(row.id),
  "aria-selected": String(props.selectedId === row.id),
  tabindex: props.selectedId === row.id || (!props.selectedId && rowIndex === 0) ? "0" : "-1",
});
function selectRows(keys: Array<string | number>): void {
  emit("select", typeof keys[0] === "string" ? keys[0] : undefined);
}
function editRow({ row, e }: RowEventContext<TableRowData>): void {
  if (
    e.target instanceof Element &&
    e.target.closest("input, button, [data-cf-range], [data-cf-stop]")
  )
    return;
  emit("edit", String(row.id));
}
function isVisual(rule: SheetConditionalFormatRule): boolean {
  return ["dataBar", "colorScale", "iconSet"].includes(rule.condition.kind);
}
</script>

<template>
  <TableHeightWrapper v-slot="{ height }">
    <TTable
      class="idea-table--mini"
      row-key="id"
      :data="rows"
      :columns="columns"
      :row-attributes="rowAttributes"
      :active-row-keys="selectedId ? [selectedId] : []"
      active-row-type="single"
      :disable-space-inactive-row="true"
      size="small"
      table-layout="fixed"
      :height="height"
      :bordered="false"
      resizable
      hover
      :empty="t('conditionalFormatting.noRules')"
      :aria-label="t('conditionalFormatting.manageRules')"
      @active-change="selectRows"
      @row-dblclick="editRow"
    >
      <template #format="{ row }">
        <ConditionalFormatPreview
          compact
          :condition="row.rule.condition"
          :format="row.rule.style"
          :text="row.rule.style.numberFormat ? undefined : 'AaBbCcYyZz'"
        />
      </template>
      <template #range="{ row }">
        <div
          class="conditional-format-rules-table__range"
          :data-cf-range="row.id"
          @focusin="emit('select', row.id)"
          @keydown.stop
        >
          <RangeReferenceInput
            :model-value="row.rangeText"
            :label="t('conditionalFormatting.appliesTo')"
            :show-picker="true"
            :select-reference="selectReference"
            @update:model-value="emit('updateRange', row.id, $event)"
          />
          <p v-if="row.rangeError" class="conditional-format-rules-table__error" role="alert">
            {{ row.rangeError }}
          </p>
        </div>
      </template>
      <template #stop="{ row }">
        <span :data-cf-stop="row.id" @keydown.stop @focusin="emit('select', row.id)">
          <TCheckbox
            :checked="Boolean(row.rule.stopIfTrue)"
            :disabled="isVisual(row.rule)"
            :aria-label="t('conditionalFormatting.stopIfTrue')"
            @change="emit('updateStop', row.id, $event)"
          />
        </span>
      </template>
    </TTable>
  </TableHeightWrapper>
</template>

<style scoped lang="scss">
.conditional-format-rules-table {
  &__range {
    display: grid;
    gap: 4px;
  }
  &__error {
    margin: 0;
    white-space: normal;
    color: var(--idea-status-error);
  }
}
</style>
