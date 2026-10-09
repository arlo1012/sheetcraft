<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { Pencil, Trash2, LockKeyholeOpen } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Button as TButton } from "tdesign-vue-next/es/button";
import {
  BaseTable as TTable,
  type BaseTableCol,
  type TableRowData,
  type TableRowAttributes,
} from "tdesign-vue-next/es/table";
import {
  normalizeSheetProtection,
  type SheetProtection,
  type EditableRange,
} from "@sheetcraft/core";
import type { CellRange } from "@sheetcraft/core/workbook";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import EditableRangeEditorDialog from "./EditableRangeEditorDialog.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  visible: boolean;
  suspended?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
  configuration: SheetProtection;
  selection: CellRange;
  error: string;
  readOnly?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [value: SheetProtection];
  unlock: [name: string];
  protect: [value: SheetProtection];
}>();
const { t } = useAppI18n();
type Row = { id: number; entry: EditableRange };
const rows = ref<Row[]>([]),
  selectedId = ref<number>();
const editor = shallowRef<{ id?: number; entry: EditableRange }>();
let nextId = 0;
watch(
  () => props.visible,
  (visible) => {
    editor.value = undefined;
    if (!visible) return;
    rows.value = (normalizeSheetProtection(props.configuration)?.editableRanges ?? []).map(
      (entry) => ({ id: nextId++, entry }),
    );
    selectedId.value = rows.value[0]?.id;
  },
  { immediate: true },
);
const tableRows = computed(() =>
  rows.value.map((row) => ({
    id: row.id,
    name: row.entry.name,
    reference: `${formatCellAddress(row.entry.range.start)}:${formatCellAddress(row.entry.range.end)}`,
    hasPassword: Boolean(row.entry.password),
    password: t(row.entry.password ? "review.passwordSet" : "review.noPassword"),
  })),
);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("review.rangeName"), width: 160, ellipsis: true },
  { colKey: "reference", title: t("review.rangeReference"), ellipsis: true },
  { colKey: "password", title: t("review.password"), width: 110 },
  { colKey: "actions", title: t("review.rangeActions"), width: 96, align: "center" },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row }) => ({
  "data-editable-range-row": String(row.id),
  "aria-selected": String(selectedId.value === row.id),
});
function selectRows(keys: Array<string | number>): void {
  if (typeof keys[0] === "number") selectedId.value = keys[0];
}
function add(): void {
  if (props.readOnly) return;
  let index = 1;
  let name = t("review.defaultRangeName", { index });
  while (rows.value.some((row) => row.entry.name.toLowerCase() === name.toLowerCase())) {
    name = t("review.defaultRangeName", { index: ++index });
  }
  editor.value = { entry: { name, range: props.selection } };
}
function edit(id = selectedId.value): void {
  const row = rows.value.find((row) => row.id === id);
  if (!props.readOnly && row) {
    selectedId.value = row.id;
    editor.value = { ...row };
  }
}
function editRow({ row }: { row: TableRowData }): void {
  selectedId.value = Number(row.id);
  edit();
}
function remove(id: number): void {
  if (props.readOnly) return;
  const index = rows.value.findIndex((row) => row.id === id);
  if (index < 0) return;
  rows.value.splice(index, 1);
  if (selectedId.value === id)
    selectedId.value = rows.value[Math.min(index, rows.value.length - 1)]?.id;
}
function saveEntry(entry: EditableRange): void {
  const id = editor.value?.id ?? nextId++;
  const existing = rows.value.find((row) => row.id === id);
  if (existing) existing.entry = entry;
  else rows.value.push({ id, entry });
  selectedId.value = id;
  editor.value = undefined;
}
function save(protect = false): void {
  if (props.readOnly) {
    emit("close");
    return;
  }
  const configuration = {
    ...props.configuration,
    editableRanges: rows.value.map((row) => row.entry),
  };
  if (protect) emit("protect", configuration);
  else emit("save", configuration);
}
</script>
<template>
  <TDialog
    :visible="visible && !editor"
    :header="t('review.editableRanges')"
    :footer="!readOnly"
    :confirm-btn="t('review.confirm')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="min(680px, calc(100vw - 32px))"
    placement="center"
    :confirm-on-enter="false"
    @confirm="save()"
    @close="emit('close')"
  >
    <div class="editable-ranges">
      <div class="editable-ranges__toolbar">
        <p class="editable-ranges__hint">
          {{ t(readOnly ? "review.unlockRangesHint" : "review.editableRangesHint") }}
        </p>
        <div class="editable-ranges__actions">
          <TButton v-if="!readOnly" variant="outline" @click="save(true)">{{
            t("review.protectSheet")
          }}</TButton>
          <TButton variant="outline" :disabled="readOnly" data-range-action="add" @click="add">
            {{ t("review.addRange") }}
          </TButton>
        </div>
      </div>
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini idea-table--row-dividers"
          row-key="id"
          :data="tableRows"
          :columns="columns"
          :row-attributes="rowAttributes"
          :active-row-keys="selectedId === undefined ? [] : [selectedId]"
          active-row-type="single"
          :disable-space-inactive-row="true"
          size="small"
          table-layout="fixed"
          vertical-align="middle"
          :height="height"
          :bordered="false"
          hover
          :empty="t('review.noEditableRanges')"
          :aria-label="t('review.editableRanges')"
          @active-change="selectRows"
          @row-dblclick="editRow"
        >
          <template #actions="{ row }">
            <div class="editable-ranges__row-actions" @dblclick.stop>
              <span
                v-if="readOnly"
                v-icon-action="!row.hasPassword"
                data-range-action="unlock"
                :aria-label="t('review.unlockRange')"
                :title="t('review.unlockRange')"
                @click.stop="emit('unlock', row.name)"
                ><LockKeyholeOpen class="idea-action-icon" aria-hidden="true"
              /></span>
              <template v-else>
                <span
                  v-icon-action
                  data-range-action="edit"
                  :aria-label="t('review.editRange')"
                  :title="t('review.editRange')"
                  @click.stop="edit(row.id)"
                  ><Pencil class="idea-action-icon" aria-hidden="true"
                /></span>
                <span
                  v-icon-action
                  data-range-action="delete"
                  :aria-label="t('review.removeRange')"
                  :title="t('review.removeRange')"
                  @click.stop="remove(row.id)"
                  ><Trash2 class="idea-action-icon" aria-hidden="true"
                /></span>
              </template>
            </div>
          </template>
        </TTable>
      </TableHeightWrapper>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </TDialog>
  <EditableRangeEditorDialog
    v-if="editor"
    :visible="true"
    :draft="editor.entry"
    :suspended="suspended"
    :select-reference="selectReference"
    :editing="editor.id !== undefined"
    :names="rows.filter((row) => row.id !== editor?.id).map((row) => row.entry.name)"
    @close="editor = undefined"
    @save="saveEntry"
  />
</template>
<style scoped lang="scss">
.editable-ranges {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--sheetcraft-space-4);
  height: min(300px, calc(100dvh - 240px));
  min-height: 0;
  min-width: 0;
  color: var(--sheetcraft-text-primary);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__hint {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  &__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--sheetcraft-space-4);
  }
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sheetcraft-space-2);

    > span {
      width: 24px;
      height: 28px;
    }
  }
}
</style>
