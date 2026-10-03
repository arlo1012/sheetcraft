<script setup lang="ts">
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { computed } from "vue";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-vue-next";
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
  reorderable?: boolean;
  readonly?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  select: [id: string | undefined];
  edit: [id: string];
  remove: [id: string];
  move: [id: string, offset: -1 | 1];
  updateRange: [id: string, value: string];
  updateStop: [id: string, value: boolean];
}>();
const { t } = useAppI18n();
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "description", title: t("conditionalFormatting.rulePriority"), ellipsis: true },
  { colKey: "format", title: t("conditionalFormatting.format"), width: 128 },
  { colKey: "range", title: t("conditionalFormatting.appliesTo"), width: 220 },
  { colKey: "stop", title: t("conditionalFormatting.stopIfTrue"), width: 148, align: "center" },
  { colKey: "actions", title: t("conditionalFormatting.actions"), width: 144, align: "center" },
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
    e.target.closest("input, button, [data-cf-range], [data-cf-stop], [data-cf-action]")
  )
    return;
  if (!props.readonly) emit("edit", String(row.id));
}
function isVisual(rule: SheetConditionalFormatRule): boolean {
  return ["dataBar", "colorScale", "iconSet"].includes(rule.condition.kind);
}
function canMove(index: number, offset: -1 | 1): boolean {
  const nextIndex = index + offset;
  return (
    Boolean(props.reorderable) && !props.readonly && nextIndex >= 0 && nextIndex < props.rows.length
  );
}
function editAction(id: string): void {
  if (!props.readonly) emit("edit", id);
}
function removeAction(id: string): void {
  if (!props.readonly) emit("remove", id);
}
function moveAction(id: string, index: number, offset: -1 | 1): void {
  if (canMove(index, offset)) emit("move", id, offset);
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
      vertical-align="middle"
      :height="height"
      :bordered="false"
      resizable
      hover
      :empty="t('conditionalFormatting.noRules')"
      :aria-label="t('conditionalFormatting.manageRules')"
      @active-change="selectRows"
      @row-dblclick="editRow"
    >
      <template #description="{ row }">
        <div
          class="conditional-format-rules-table__cell conditional-format-rules-table__description"
        >
          <span :title="row.description">{{ row.description }}</span>
        </div>
      </template>
      <template #format="{ row }">
        <div class="conditional-format-rules-table__cell">
          <ConditionalFormatPreview
            compact
            :condition="row.rule.condition"
            :format="row.rule.style"
            :text="row.rule.style.numberFormat ? undefined : 'AaBbCcYyZz'"
          />
        </div>
      </template>
      <template #range="{ row }">
        <div
          class="conditional-format-rules-table__cell conditional-format-rules-table__range"
          :data-cf-range="row.id"
          @focusin="emit('select', row.id)"
          @keydown.stop
        >
          <RangeReferenceInput
            :model-value="row.rangeText"
            :label="t('conditionalFormatting.appliesTo')"
            :show-picker="true"
            :disabled="readonly"
            :select-reference="selectReference"
            @update:model-value="emit('updateRange', row.id, $event)"
          />
          <p v-if="row.rangeError" class="conditional-format-rules-table__error" role="alert">
            {{ row.rangeError }}
          </p>
        </div>
      </template>
      <template #stop="{ row }">
        <div
          class="conditional-format-rules-table__cell conditional-format-rules-table__stop"
          :data-cf-stop="row.id"
          @keydown.stop
          @focusin="emit('select', row.id)"
        >
          <TCheckbox
            :checked="Boolean(row.rule.stopIfTrue)"
            :disabled="readonly || isVisual(row.rule)"
            :aria-label="t('conditionalFormatting.stopIfTrue')"
            @change="emit('updateStop', row.id, $event)"
          />
        </div>
      </template>
      <template #actions="{ row, rowIndex }">
        <div
          class="conditional-format-rules-table__cell conditional-format-rules-table__actions"
          @dblclick.stop
        >
          <Pencil
            class="conditional-format-rules-table__action"
            data-cf-action="edit"
            role="button"
            :tabindex="readonly ? -1 : 0"
            :aria-label="t('conditionalFormatting.editRule')"
            :title="t('conditionalFormatting.editRule')"
            :aria-disabled="readonly || undefined"
            @click.stop="editAction(row.id)"
            @keydown.enter.stop="editAction(row.id)"
            @keydown.space.prevent.stop="editAction(row.id)"
          />
          <Trash2
            class="conditional-format-rules-table__action"
            data-cf-action="delete"
            role="button"
            :tabindex="readonly ? -1 : 0"
            :aria-label="t('conditionalFormatting.deleteRule')"
            :title="t('conditionalFormatting.deleteRule')"
            :aria-disabled="readonly || undefined"
            @click.stop="removeAction(row.id)"
            @keydown.enter.stop="removeAction(row.id)"
            @keydown.space.prevent.stop="removeAction(row.id)"
          />
          <ArrowUp
            v-if="reorderable && !readonly"
            class="conditional-format-rules-table__action"
            data-cf-action="up"
            role="button"
            :tabindex="canMove(rowIndex, -1) ? 0 : -1"
            :aria-label="t('conditionalFormatting.moveUp')"
            :title="t('conditionalFormatting.moveUp')"
            :aria-disabled="!canMove(rowIndex, -1) || undefined"
            @click.stop="moveAction(row.id, rowIndex, -1)"
            @keydown.enter.stop="moveAction(row.id, rowIndex, -1)"
            @keydown.space.prevent.stop="moveAction(row.id, rowIndex, -1)"
          />
          <ArrowDown
            v-if="reorderable && !readonly"
            class="conditional-format-rules-table__action"
            data-cf-action="down"
            role="button"
            :tabindex="canMove(rowIndex, 1) ? 0 : -1"
            :aria-label="t('conditionalFormatting.moveDown')"
            :title="t('conditionalFormatting.moveDown')"
            :aria-disabled="!canMove(rowIndex, 1) || undefined"
            @click.stop="moveAction(row.id, rowIndex, 1)"
            @keydown.enter.stop="moveAction(row.id, rowIndex, 1)"
            @keydown.space.prevent.stop="moveAction(row.id, rowIndex, 1)"
          />
        </div>
      </template>
    </TTable>
  </TableHeightWrapper>
</template>

<style scoped lang="scss">
.conditional-format-rules-table {
  &__cell {
    display: flex;
    align-items: center;
    min-height: 28px;
    min-width: 0;
  }
  &__description {
    overflow: hidden;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__range {
    display: grid;
    gap: 4px;
  }
  &__stop {
    justify-content: center;
  }
  &__actions {
    justify-content: center;
    gap: 4px;
  }
  &__action {
    box-sizing: content-box;
    width: var(--idea-action-icon-size);
    height: var(--idea-action-icon-size);
    padding: 3px;
    color: var(--idea-text-secondary);
    cursor: pointer;
    stroke-width: var(--idea-icon-stroke-width);

    &:hover {
      color: var(--idea-action-primary);
    }

    &[aria-disabled="true"] {
      cursor: default;
      opacity: 0.45;
      pointer-events: none;
    }
  }
  &__error {
    margin: 0;
    white-space: normal;
    color: var(--idea-status-error);
  }
}
</style>
