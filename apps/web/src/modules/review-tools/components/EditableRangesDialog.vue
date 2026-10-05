<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Button as TButton } from "tdesign-vue-next/es/button";
import {
  BaseTable as TTable,
  type BaseTableCol,
  type TableRowData,
} from "tdesign-vue-next/es/table";
import { normalizeSheetProtection, type SheetProtection, type EditableRange } from "@idea10/core";
import type { CellRange } from "@idea10/core/workbook";
import { formatCellAddress } from "@idea10/core/coordinates";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import EditableRangeEditorDialog from "./EditableRangeEditorDialog.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  visible: boolean;
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
const selected = computed(() => rows.value.find((row) => row.id === selectedId.value));
const tableRows = computed(() =>
  rows.value.map((row) => ({
    id: row.id,
    name: row.entry.name,
    reference: `${formatCellAddress(row.entry.range.start)}:${formatCellAddress(row.entry.range.end)}`,
    password: t(row.entry.password ? "review.passwordSet" : "review.noPassword"),
  })),
);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("review.rangeName"), width: 160, ellipsis: true },
  { colKey: "reference", title: t("review.rangeReference"), ellipsis: true },
  { colKey: "password", title: t("review.password"), width: 110 },
]);
function add(): void {
  if (props.readOnly) return;
  let index = 1;
  while (rows.value.some((row) => row.entry.name.toLowerCase() === `range${index}`)) index++;
  editor.value = { entry: { name: `Range${index}`, range: props.selection } };
}
function edit(): void {
  if (!props.readOnly && selected.value) editor.value = { ...selected.value };
}
function editRow({ row }: { row: TableRowData }): void {
  selectedId.value = Number(row.id);
  edit();
}
function remove(): void {
  if (!props.readOnly) rows.value = rows.value.filter((row) => row.id !== selectedId.value);
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
    :visible="visible"
    :header="t('review.editableRanges')"
    :confirm-btn="t(readOnly ? 'review.close' : 'review.save')"
    :cancel-btn="readOnly ? null : t('review.cancel')"
    :close-on-overlay-click="false"
    width="680px"
    @confirm="save()"
    @close="emit('close')"
  >
    <div class="editable-ranges">
      <p>{{ t(readOnly ? "review.unlockRangesHint" : "review.editableRangesHint") }}</p>
      <div class="editable-ranges__toolbar">
        <TButton variant="outline" :disabled="readOnly" data-range-action="add" @click="add">{{
          t("review.addRange")
        }}</TButton>
        <TButton
          variant="outline"
          :disabled="readOnly || !selected"
          data-range-action="edit"
          @click="edit"
          >{{ t("review.editRange") }}</TButton
        >
        <TButton
          variant="outline"
          :disabled="readOnly || !selected"
          data-range-action="delete"
          @click="remove"
          >{{ t("review.removeRange") }}</TButton
        >
        <TButton
          v-if="readOnly"
          variant="outline"
          :disabled="!selected?.entry.password"
          @click="selected && emit('unlock', selected.entry.name)"
          >{{ t("review.unlockRange") }}</TButton
        >
        <TButton v-else variant="text" @click="save(true)">{{ t("review.protectSheet") }}</TButton>
      </div>
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini"
          row-key="id"
          :data="tableRows"
          :columns="columns"
          :active-row-keys="selectedId === undefined ? [] : [selectedId]"
          active-row-type="single"
          :disable-space-inactive-row="true"
          size="small"
          table-layout="fixed"
          :height="height"
          :bordered="false"
          resizable
          hover
          :empty="t('review.noEditableRanges')"
          :aria-label="t('review.editableRanges')"
          @active-change="
            (keys) => (selectedId = keys[0] === undefined ? undefined : Number(keys[0]))
          "
          @row-dblclick="editRow"
        />
      </TableHeightWrapper>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </TDialog>
  <EditableRangeEditorDialog
    v-if="editor"
    :visible="true"
    :draft="editor.entry"
    :editing="editor.id !== undefined"
    :names="rows.filter((row) => row.id !== editor?.id).map((row) => row.entry.name)"
    @close="editor = undefined"
    @save="saveEntry"
  />
</template>
<style scoped lang="scss">
.editable-ranges {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: min(52vh, 420px);
  min-height: 240px;
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  p {
    margin: 0;
  }
}
</style>
