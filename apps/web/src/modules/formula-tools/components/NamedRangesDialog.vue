<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
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
  { colKey: "comment", title: t("formulaTools.comment"), width: 180, ellipsis: true },
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
    height: min(340px, calc(100dvh - 180px));
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
