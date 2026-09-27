<script setup lang="ts">
import { computed, ref } from "vue";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type {
  BaseTableCol,
  RowEventContext,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import { useAppI18n } from "../../../shared/i18n";
import type { WorkbookFindResult } from "../workbook-find-types";

const props = defineProps<{
  results: readonly WorkbookFindResult[];
  resultCount: number;
}>();
const emit = defineEmits<{ selectResult: [result: WorkbookFindResult] }>();
const { t } = useAppI18n();

type FindResultRow = WorkbookFindResult & { id: string };
const selectedId = ref<string>();
const rows = computed<FindResultRow[]>(() =>
  props.results.map((result) => ({
    ...result,
    id: `${result.sheetId}:${result.address.row}:${result.address.column}`,
  })),
);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "workbookName", title: t("navigation.findResultWorkbook"), width: 88, ellipsis: true },
  { colKey: "sheetName", title: t("navigation.findResultSheet"), width: 80, ellipsis: true },
  { colKey: "definedName", title: t("navigation.findResultName"), width: 80, ellipsis: true },
  { colKey: "addressLabel", title: t("navigation.findResultCell"), width: 68, ellipsis: true },
  { colKey: "value", title: t("navigation.findResultValue"), width: 106, ellipsis: true },
  { colKey: "formula", title: t("navigation.findResultFormula"), width: 114, ellipsis: true },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row, rowIndex }) => ({
  "data-find-result": String(row.id),
  "aria-selected": String(selectedId.value === row.id),
  tabindex: selectedId.value === row.id || (!selectedId.value && rowIndex === 0) ? "0" : "-1",
});

function selectRow({ row }: RowEventContext<TableRowData>): void {
  const result = rows.value.find((item) => item.id === row.id);
  selectedId.value = result?.id;
  if (result) emit("selectResult", result);
}

function onTableKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const row = target.closest<HTMLElement>("[data-find-result]");
  const id = row?.dataset.findResult;
  const result = rows.value.find((item) => item.id === id);
  if (!result) return;
  event.preventDefault();
  selectedId.value = result.id;
  emit("selectResult", result);
}
</script>

<template>
  <section class="workbook-find-results" :aria-label="t('navigation.findResults')">
    <div class="workbook-find-results__header">
      <h3 class="workbook-find-results__heading">{{ t("navigation.findResults") }}</h3>
      <p class="workbook-find-results__count">
        {{
          t(
            resultCount > results.length
              ? "navigation.findResultsLimited"
              : "navigation.findResultsCount",
            {
              count: resultCount,
              shown: results.length,
            },
          )
        }}
      </p>
    </div>
    <div class="workbook-find-results__table narrow-scrollbar">
      <TTable
        class="idea-table--mini workbook-find-results__data"
        row-key="id"
        :data="rows"
        :columns="columns"
        :row-attributes="rowAttributes"
        :active-row-keys="selectedId ? [selectedId] : []"
        active-row-type="single"
        :disable-space-inactive-row="true"
        :bordered="false"
        :aria-label="t('navigation.findResults')"
        size="small"
        table-layout="fixed"
        height="180"
        hover
        :empty="t('navigation.findNoMatches')"
        @row-click="selectRow"
        @keydown="onTableKeydown"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.workbook-find-results {
  display: grid;
  gap: var(--idea-space-3);
  min-width: 0;

  &__header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--idea-space-2);
  }

  &__count {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }

  &__heading {
    margin: 0;
    font-size: var(--idea-font-size-body-large);
    font-weight: var(--idea-font-weight-semibold);
    line-height: var(--idea-line-height-body-large);
  }

  &__table {
    max-width: 100%;
    overflow-x: auto;
  }

  &__data {
    min-width: 536px;
  }
}
</style>
