<script setup lang="ts">
import { computed, ref } from "vue";
import { Eye, Trash2 } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { Input } from "tdesign-vue-next/es/input";
import { Button } from "tdesign-vue-next/es/button";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import {
  BaseTable,
  type BaseTableCol,
  type TableRowAttributes,
  type TableRowData,
} from "tdesign-vue-next/es/table";
import { rangesIntersect } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";

const props = defineProps<{
  workbook: Workbook;
  referenceSheetId: string;
  initialReference: string;
  disabled: boolean;
  pageCount: number;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const sources = defineModel<string[]>({ required: true });
const pageItems = defineModel<string[][]>("pageItems", { required: true });
const pendingPageItems = defineModel<string[]>("pendingPageItems", { required: true });
defineSlots<{ "page-count"?: () => unknown }>();
const { t, locale } = useAppI18n();
const reference = ref(props.initialReference);
const selected = ref<number | undefined>(sources.value.length ? 0 : undefined);
const browseError = ref(false);
const selectedItems = computed(() =>
  selected.value === undefined ? pendingPageItems.value : pageItems.value[selected.value],
);
function validArea(value: string, replacing?: number) {
  const next = resolveRangeReference(props.workbook, value, props.referenceSheetId);
  if (
    !next ||
    next.range.end.row <= next.range.start.row ||
    next.range.end.column <= next.range.start.column ||
    sources.value.some((source, index) => {
      if (index === replacing) return false;
      const existing = resolveRangeReference(props.workbook, source, props.referenceSheetId);
      return existing?.sheetId === next.sheetId && rangesIntersect(existing.range, next.range);
    })
  )
    return undefined;
  return next;
}
async function browse(index: number): Promise<void> {
  const current = sources.value[index];
  if (props.disabled || current === undefined) return;
  const picked = await props.selectReference(current);
  if (picked === undefined || props.disabled || sources.value[index] !== current) return;
  const next = validArea(picked, index);
  browseError.value = !next;
  if (!next) return;
  sources.value = sources.value.map((source, at) =>
    at === index
      ? formatRangeReference(props.workbook.sheets.get(next.sheetId)!.name, next.range)
      : source,
  );
  select([index]);
}
const rows = computed(() => sources.value.map((reference, index) => ({ index, reference })));
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "reference", title: t("pivot.sourceArea"), ellipsis: true },
  { colKey: "actions", title: t("pivot.rangeActions"), width: 80, align: "center" },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row }) => ({
  "data-pivot-range-row": String(row.index),
  "aria-selected": String(selected.value === row.index),
});
const area = computed(() => validArea(reference.value));
const canAdd = computed(() => !!area.value && sources.value.length < 128);
function add(): void {
  const next = area.value;
  if (props.disabled || !canAdd.value || !next) return;
  browseError.value = false;
  const nextSources = [
    ...sources.value,
    formatRangeReference(props.workbook.sheets.get(next.sheetId)!.name, next.range),
  ];
  sources.value = nextSources;
  pageItems.value = [
    ...pageItems.value,
    selected.value === undefined ? [...pendingPageItems.value] : ["", "", "", ""],
  ];
  selected.value = nextSources.length - 1;
}
function remove(index = selected.value): void {
  if (props.disabled || index === undefined || sources.value[index] === undefined) return;
  browseError.value = false;
  const nextSources = sources.value.filter((_, at) => at !== index);
  if (!nextSources.length)
    pendingPageItems.value = [...(pageItems.value[index] ?? ["", "", "", ""])];
  sources.value = nextSources;
  pageItems.value = pageItems.value.filter((_, at) => at !== index);
  if (!nextSources.length) selected.value = undefined;
  else if (selected.value === index) selected.value = Math.min(index, nextSources.length - 1);
  else if (selected.value !== undefined && selected.value > index) selected.value--;
}
function select(keys: Array<string | number>): void {
  if (props.disabled || typeof keys[0] !== "number") return;
  selected.value = keys[0];
  reference.value = sources.value[keys[0]] ?? "";
}
</script>
<template>
  <div class="pivot-consolidation-ranges">
    <Form
      label-align="right"
      :label-width="locale === 'zh-CN' ? 72 : 104"
      :prevent-submit-default="true"
    >
      <FormItem :label="t('pivot.addRange')">
        <div class="pivot-consolidation-ranges__add">
          <RangeReferenceInput
            v-model="reference"
            :label="t('pivot.addRange')"
            :disabled="disabled"
            :select-reference="selectReference"
            @enter="add"
          />
          <Button
            size="medium"
            variant="text"
            data-pivot-range-action="add"
            :disabled="disabled || !canAdd"
            @click="add"
            >{{ t("pivot.confirmAddRange") }}</Button
          >
        </div>
      </FormItem>
    </Form>
    <section class="pivot-consolidation-ranges__areas">
      <div class="pivot-consolidation-ranges__list" @keydown.delete.stop.prevent="remove()">
        <TableHeightWrapper v-slot="{ height }">
          <BaseTable
            class="idea-table--mini idea-table--row-dividers"
            row-key="index"
            :data="rows"
            :columns="columns"
            :row-attributes="rowAttributes"
            :active-row-keys="selected === undefined ? [] : [selected]"
            active-row-type="single"
            :disable-space-inactive-row="true"
            :height="height"
            :bordered="false"
            size="small"
            table-layout="fixed"
            vertical-align="middle"
            hover
            :empty="t('pivot.noRanges')"
            :aria-label="t('pivot.allRanges')"
            @active-change="select"
          >
            <template #actions="{ row }">
              <div class="pivot-consolidation-ranges__row-actions">
                <span
                  v-icon-action="disabled"
                  data-pivot-range-action="remove"
                  :aria-label="t('pivot.remove')"
                  :title="t('pivot.remove')"
                  @click.stop="remove(row.index)"
                  ><Trash2 class="idea-action-icon" aria-hidden="true"
                /></span>
                <span
                  v-icon-action="disabled"
                  data-pivot-range-action="browse"
                  :aria-label="t('pivot.browse')"
                  :title="t('pivot.browse')"
                  @click.stop="browse(row.index)"
                  ><Eye class="idea-action-icon" aria-hidden="true"
                /></span>
              </div>
            </template>
          </BaseTable>
        </TableHeightWrapper>
      </div>
      <p v-if="browseError" role="alert">{{ t("pivot.invalidConsolidationRange") }}</p>
    </section>
    <slot name="page-count" />
    <section v-if="pageCount" class="pivot-consolidation-ranges__page-items">
      <p>{{ t("pivot.pageItemsHint") }}</p>
      <div class="pivot-consolidation-ranges__page-grid">
        <label v-for="field in pageCount" :key="field"
          >{{ t("pivot.pageField", { index: field }) }}
          <Input
            v-if="selectedItems"
            v-model="selectedItems[field - 1]"
            :disabled="disabled"
            :maxlength="200"
            :aria-label="t('pivot.pageField', { index: field })"
          />
          <Input v-else :disabled="true" />
        </label>
      </div>
    </section>
  </div>
</template>
<style scoped lang="scss">
.pivot-consolidation-ranges {
  display: grid;
  gap: 8px;
  min-width: 0;
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  &__areas,
  &__page-items {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  &__page-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    label {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
    }
  }
  &__list {
    height: 160px;
    min-height: 0;
  }
  [role="alert"] {
    color: var(--idea-status-error);
  }
  @media (max-width: 420px) {
    &__page-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
