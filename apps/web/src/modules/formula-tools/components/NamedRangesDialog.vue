<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Pencil, Trash2, X } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
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
import {
  matchesNamedRangeFilters,
  updateNamedRangeFilters,
  type NamedRangeFilter,
} from "../named-range-filters";
import NamedRangeEditorDialog from "./NamedRangeEditorDialog.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";

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
  save: [row: NamedRangeDraft, onSaved?: (id: string) => void];
  delete: [id: string];
}>();
const { t } = useAppI18n();
const contentRef = ref<HTMLElement | null>(null);
const filterPopupProps = {
  attach: () => contentRef.value ?? document.body,
  overlayInnerStyle: { minWidth: "250px" },
};
const nameFilters = ref<NamedRangeFilter[]>([]);
const searchQuery = ref("");
const selectedId = ref<string | undefined>();
const editorDraft = ref<NamedRangeDraft>();
const referenceDraft = ref("");
const selectedRange = computed(() => props.ranges.find((range) => range.id === selectedId.value));
const filteredRanges = computed<NameTableRow[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return props.ranges
    .map((range) => ({
      ...range,
      scopeLabel: range.scopeSheetId
        ? (props.sheets.find((sheet) => sheet.id === range.scopeSheetId)?.name ??
          range.scopeSheetId)
        : t("formulaTools.workbook"),
    }))
    .filter((range) => matchesNamedRangeFilters(range, nameFilters.value))
    .filter(
      (range) =>
        !query ||
        [range.name, range.value, range.reference, range.scopeLabel, range.comment].some((value) =>
          value?.toLocaleLowerCase().includes(query),
        ),
    );
});
const filterOptions = computed(() => [
  {
    group: "",
    children: [
      {
        value: "clear",
        label: t("formulaTools.clearNameFilters"),
        class: "idea-select-option--action",
      },
    ],
  },
  {
    group: "",
    children: [
      { value: "sheet", label: t("formulaTools.worksheetNames") },
      { value: "workbook", label: t("formulaTools.workbookNames") },
    ],
  },
  {
    group: "",
    children: [
      { value: "errors", label: t("formulaTools.namesWithErrors") },
      { value: "no-errors", label: t("formulaTools.namesWithoutErrors") },
    ],
  },
  {
    group: "",
    children: [
      { value: "defined", label: t("formulaTools.definedNames") },
      { value: "table", label: t("formulaTools.tableNames") },
    ],
  },
]);
function changeFilters(value: SelectValue): void {
  const next = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  if (next.includes("clear")) {
    clearFilters();
    return;
  }
  nameFilters.value = updateNamedRangeFilters(nameFilters.value, next);
}
function clearFilters(): void {
  nameFilters.value = [];
  searchQuery.value = "";
}
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("formulaTools.name"), width: 140, ellipsis: true },
  { colKey: "value", title: t("formulaTools.value"), width: 140, ellipsis: true },
  { colKey: "reference", title: t("formulaTools.reference"), ellipsis: true },
  { colKey: "scopeLabel", title: t("formulaTools.scope"), width: 110, ellipsis: true },
  { colKey: "comment", title: t("formulaTools.comment"), width: 140, ellipsis: true },
  { colKey: "actions", title: t("formulaTools.actions"), width: 88, align: "center" },
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
    comment: range.comment,
  };
}
function editRow({ row }: RowEventContext<TableRowData>): void {
  const range = props.ranges.find((range) => range.id === row.id);
  if (range) editRange(range);
}
function saveEditor(draft: NamedRangeDraft): void {
  emit("save", draft, (id) => {
    editorDraft.value = undefined;
    clearFilters();
    selectedId.value = id;
  });
}
function remove(id: string): void {
  emit("delete", id);
  if (selectedId.value === id) selectedId.value = undefined;
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
    clearFilters();
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
    width="min(920px, calc(100vw - 32px))"
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
        </div>
        <div class="named-ranges-dialog__filters">
          <TInput
            v-model="searchQuery"
            class="named-ranges-dialog__search"
            clearable
            :placeholder="t('formulaTools.searchNames')"
            :aria-label="t('formulaTools.searchNames')"
            data-name-search
          />
          <TSelect
            :value="nameFilters"
            class="named-ranges-dialog__filter"
            multiple
            clearable
            :options="filterOptions"
            :popup-props="filterPopupProps"
            :placeholder="t('formulaTools.allNames')"
            :min-collapsed-num="1"
            :tag-input-props="{ excessTagsDisplayType: 'scroll' }"
            :tag-props="{ maxWidth: 110 }"
            :aria-label="t('formulaTools.filterNames')"
            data-name-filter
            @change="changeFilters"
          />
        </div>
      </div>
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini idea-table--row-dividers"
          row-key="id"
          :data="filteredRanges"
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
          :empty="
            t(
              searchQuery || nameFilters.length
                ? 'formulaTools.noMatchingNames'
                : 'formulaTools.noNames',
            )
          "
          :aria-label="t('formulaTools.namedRanges')"
          @active-change="selectRows"
          @row-dblclick="editRow"
        >
          <template #actions="{ row }">
            <div class="named-ranges-dialog__row-actions" @dblclick.stop>
              <span
                v-icon-action
                data-name-action="edit"
                :aria-label="t('formulaTools.editName')"
                :title="t('formulaTools.editName')"
                @click.stop="editRange(row)"
                ><Pencil class="idea-action-icon" aria-hidden="true"
              /></span>
              <span
                v-icon-action
                data-name-action="delete"
                :aria-label="t('formulaTools.deleteName')"
                :title="t('formulaTools.deleteName')"
                @click.stop="remove(row.id)"
                ><Trash2 class="idea-action-icon" aria-hidden="true"
              /></span>
            </div>
          </template>
        </TTable>
      </TableHeightWrapper>
      <div
        class="named-ranges-dialog__reference"
        role="group"
        :aria-label="t('formulaTools.reference')"
      >
        <span>{{ t("formulaTools.reference") }}</span>
        <div class="named-ranges-dialog__reference-controls">
          <span
            v-icon-action="!referenceChanged"
            class="named-ranges-dialog__reference-action"
            :aria-label="t('formulaTools.resetReference')"
            :title="t('formulaTools.resetReference')"
            data-name-reference-reset
            @click="resetReference"
            ><X :size="15"
          /></span>
          <span
            v-icon-action="!referenceChanged || !referenceDraft.trim()"
            class="named-ranges-dialog__reference-action"
            :aria-label="t('formulaTools.saveReference')"
            :title="t('formulaTools.saveReference')"
            data-name-reference-save
            @click="saveReference"
            ><Check :size="15"
          /></span>
          <RangeReferenceInput
            v-model="referenceDraft"
            :disabled="!selectedRange"
            :select-reference="selectReference"
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
    @save="saveEditor"
  />
</template>

<style scoped lang="scss">
.named-ranges-dialog {
  &__content {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: min(340px, calc(100dvh - 180px));
    min-height: 0;
    gap: var(--idea-space-4);
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
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--idea-space-2);

    > span {
      width: 24px;
      height: 28px;
    }
  }
  &__filters {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }
  &__search {
    width: 210px;
    min-width: 100px;
  }
  &__filter {
    width: 260px;
    flex-shrink: 0;
  }
  &__reference {
    display: grid;
    gap: 4px;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  &__reference-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--idea-radius-small);
    cursor: pointer;

    &:hover:not([aria-disabled="true"]) {
      background: var(--idea-icon-button-hover-bg);
    }

    &[aria-disabled="true"] {
      color: var(--idea-text-disabled);
      cursor: not-allowed;
    }
  }

  &__reference-controls {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }
}
@media (max-width: 760px) {
  .named-ranges-dialog__toolbar {
    flex-wrap: wrap;
  }
  .named-ranges-dialog__filters {
    width: 100%;
  }
  .named-ranges-dialog__search {
    flex: 1;
  }
}
</style>
