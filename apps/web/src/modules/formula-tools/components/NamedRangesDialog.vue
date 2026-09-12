<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type {
  BaseTableCol,
  RowEventContext,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import { useAppI18n } from "../../../shared/i18n";
import type { NamedRangeDraft, NamedRangeRow, NamedRangeSheet } from "../named-range-types";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import NamedRangeEditorDialog from "./NamedRangeEditorDialog.vue";

type NameTableRow = NamedRangeRow & { scopeLabel: string };
const props = withDefaults(
  defineProps<{
    visible: boolean;
    ranges: readonly NamedRangeRow[];
    sheets: readonly NamedRangeSheet[];
    activeSheetId?: string;
    selectionReference?: string;
    editSessionId?: string;
    suspended?: boolean;
    selectReference?: (current: string) => Promise<string | undefined>;
  }>(),
  {
    activeSheetId: undefined,
    selectionReference: undefined,
    editSessionId: undefined,
    suspended: false,
    selectReference: undefined,
  },
);
const emit = defineEmits<{
  close: [];
  save: [row: NamedRangeDraft];
  delete: [id: string];
}>();
const { t } = useAppI18n();
const contentRef = ref<HTMLElement | null>(null);
const filterPopupProps = { attach: () => contentRef.value ?? document.body };
const nameFilter = ref("all");
const selectedId = ref<string | undefined>();
const editorDraft = ref<NamedRangeDraft>();
const referenceDraft = ref("");
const selectedRange = computed(() => props.ranges.find((range) => range.id === selectedId.value));
const filteredRanges = computed<NameTableRow[]>(() =>
  props.ranges
    .filter((range) =>
      nameFilter.value === "workbook"
        ? range.scopeSheetId === undefined
        : nameFilter.value === "sheet"
          ? range.scopeSheetId === props.activeSheetId
          : true,
    )
    .map((range) => ({
      ...range,
      scopeLabel: range.scopeSheetId
        ? (props.sheets.find((sheet) => sheet.id === range.scopeSheetId)?.name ??
          range.scopeSheetId)
        : t("formulaTools.workbook"),
    })),
);
const filterOptions = computed(() => [
  { value: "all", label: t("formulaTools.allNames") },
  { value: "workbook", label: t("formulaTools.workbookNames") },
  { value: "sheet", label: t("formulaTools.currentSheetNames"), disabled: !props.activeSheetId },
]);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("formulaTools.name"), width: 170, ellipsis: true },
  { colKey: "reference", title: t("formulaTools.reference"), ellipsis: true },
  { colKey: "scopeLabel", title: t("formulaTools.scope"), width: 140, ellipsis: true },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row, rowIndex }) => ({
  "data-named-range": String(row.id),
  "aria-selected": String(selectedId.value === row.id),
  tabindex: selectedId.value === row.id || (!selectedId.value && rowIndex === 0) ? "0" : "-1",
});
const referenceChanged = computed(() =>
  Boolean(selectedRange.value && referenceDraft.value !== selectedRange.value.reference),
);

function selectRows(keys: Array<string | number>): void {
  selectedId.value = typeof keys[0] === "string" ? keys[0] : undefined;
}
function createRange(): void {
  editorDraft.value = {
    name: "",
    scopeSheetId: props.activeSheetId,
    reference: props.selectionReference ?? "",
  };
}
function editRange(range = selectedRange.value): void {
  if (!range) return;
  selectedId.value = range.id;
  editorDraft.value = {
    id: range.id,
    name: range.name,
    scopeSheetId: range.scopeSheetId,
    reference: range.reference,
  };
}
function editRow({ row }: RowEventContext<TableRowData>): void {
  const range = props.ranges.find((range) => range.id === row.id);
  if (range) editRange(range);
}
function remove(): void {
  if (!selectedId.value) return;
  emit("delete", selectedId.value);
  selectedId.value = undefined;
}
function resetReference(): void {
  referenceDraft.value = selectedRange.value?.reference ?? "";
}
function saveReference(): void {
  if (!selectedRange.value || !referenceChanged.value || !referenceDraft.value.trim()) return;
  emit("save", { ...selectedRange.value, reference: referenceDraft.value.trim() });
}
watch(selectedRange, resetReference);
watch(filteredRanges, (ranges) => {
  if (!ranges.some((range) => range.id === selectedId.value)) selectedId.value = undefined;
});
watch(
  () => props.visible,
  () => {
    selectedId.value = undefined;
    nameFilter.value = "all";
    editorDraft.value = undefined;
    resetReference();
  },
);
</script>

<template>
  <Dialog
    v-if="visible"
    :visible="visible && !suspended"
    :header="t('formulaTools.namedRanges')"
    width="min(720px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!editorDraft"
    :confirm-on-enter="false"
    :data-cell-edit-session="editSessionId"
    @close="emit('close')"
  >
    <div
      ref="contentRef"
      class="named-ranges-dialog__content"
      :data-cell-edit-session="editSessionId"
    >
      <div class="named-ranges-dialog__toolbar">
        <div class="named-ranges-dialog__actions">
          <TButton variant="outline" data-name-action="new" @click="createRange">{{
            t("formulaTools.newName")
          }}</TButton>
          <TButton
            variant="outline"
            data-name-action="edit"
            :disabled="!selectedRange"
            @click="editRange()"
            >{{ t("formulaTools.editName") }}</TButton
          >
          <TButton
            variant="outline"
            data-name-action="delete"
            :disabled="!selectedRange"
            @click="remove"
            >{{ t("formulaTools.deleteName") }}</TButton
          >
        </div>
        <TSelect
          v-model="nameFilter"
          class="named-ranges-dialog__filter"
          :options="filterOptions"
          :popup-props="filterPopupProps"
          :aria-label="t('formulaTools.filterNames')"
          data-name-filter
        />
      </div>
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini"
          row-key="id"
          :data="filteredRanges"
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
          :empty="t('formulaTools.noNames')"
          :aria-label="t('formulaTools.namedRanges')"
          @active-change="selectRows"
          @row-dblclick="editRow"
        />
      </TableHeightWrapper>
      <div
        class="named-ranges-dialog__reference"
        role="group"
        :aria-label="t('formulaTools.reference')"
      >
        <span>{{ t("formulaTools.reference") }}</span>
        <div class="named-ranges-dialog__reference-controls">
          <TButton
            variant="outline"
            shape="square"
            :disabled="!referenceChanged"
            :aria-label="t('formulaTools.resetReference')"
            :title="t('formulaTools.resetReference')"
            data-name-reference-reset
            @click="resetReference"
            ><X :size="15"
          /></TButton>
          <TButton
            variant="outline"
            shape="square"
            :disabled="!referenceChanged || !referenceDraft.trim()"
            :aria-label="t('formulaTools.saveReference')"
            :title="t('formulaTools.saveReference')"
            data-name-reference-save
            @click="saveReference"
            ><Check :size="15"
          /></TButton>
          <TInput
            v-model="referenceDraft"
            :disabled="!selectedRange"
            :aria-label="t('formulaTools.reference')"
            data-name-reference
            @enter="saveReference"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <TButton variant="outline" data-name-action="close" @click="emit('close')">{{
        t("formulaTools.close")
      }}</TButton>
    </template>
  </Dialog>
  <NamedRangeEditorDialog
    v-if="visible && editorDraft"
    :initial-draft="editorDraft"
    :sheets="sheets"
    :selection-reference="selectionReference"
    :edit-session-id="editSessionId"
    :suspended="suspended"
    :select-reference="selectReference"
    @close="editorDraft = undefined"
    @save="emit('save', $event)"
  />
</template>

<style scoped lang="scss">
.named-ranges-dialog {
  &__content {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: min(440px, calc(100dvh - 180px));
    min-height: 0;
    gap: 12px;
    color: var(--idea-text-primary);
  }
  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  &__actions {
    display: flex;
    gap: 8px;
  }
  &__filter {
    width: 170px;
  }
  &__reference {
    display: grid;
    gap: 4px;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  &__reference-controls {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }
}
@media (max-width: 480px) {
  .named-ranges-dialog__toolbar {
    flex-wrap: wrap;
  }
}
</style>
