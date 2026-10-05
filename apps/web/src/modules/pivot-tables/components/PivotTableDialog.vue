<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Button } from "tdesign-vue-next/es/button";
import { buildPivotResult, getPivotSource, type PivotAggregate } from "@idea10/core/pivot-tables";
import type { Workbook, CellValue } from "@idea10/core/workbook";
import { isFormulaError } from "@idea10/core/formula";
import type { PivotDraft } from "../usePivotActions";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { resolveRangeReference } from "../../../shared/range-reference/formatRangeReference";
const props = defineProps<{
  initial: PivotDraft;
  workbook: Workbook;
  revision: number;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: PivotDraft]; close: [] }>();
const { t } = useAppI18n();
const draft = ref<PivotDraft>(JSON.parse(JSON.stringify(props.initial)) as PivotDraft);
const source = computed(() => {
  void props.revision;
  const reference = resolveRangeReference(
    props.workbook,
    draft.value.source,
    draft.value.referenceSheetId,
  );
  if (!reference) return undefined;
  try {
    return getPivotSource(props.workbook, reference.sheetId, reference.range);
  } catch {
    return undefined;
  }
});
const fields = computed(
  () => source.value?.headers.map((label, value) => ({ label, value })) ?? [],
);
const aggregates: PivotAggregate[] = ["sum", "count", "average", "min", "max"];
const aggregateOptions = computed(() =>
  aggregates.map((value) => ({ value, label: t(`pivot.${value}`) })),
);
const styles = computed(() => [
  { label: t("pivot.defaultStyle"), value: "" },
  ...(props.workbook.pivotTableStyles ?? []).map((style) => ({
    label: style.name,
    value: style.id,
  })),
]);
const preview = computed(() => {
  if (!source.value) return undefined;
  try {
    return buildPivotResult(props.workbook, {
      ...draft.value.table,
      sourceSheetId: source.value.sheet.id,
      source: source.value.range,
    });
  } catch {
    return undefined;
  }
});
const filterOptions = computed(() => {
  const result = new Map<number, Array<{ label: string; value: string }>>();
  const info = source.value;
  if (!info) return result;
  for (const filter of draft.value.table.filters) {
    const values = new Map<string, CellValue>();
    if (filter.field < 0 || filter.field >= info.headers.length) continue;
    for (let row = info.range.start.row + 1; row <= info.range.end.row; row++) {
      const value = info.evaluator.getComputedValue({
        row,
        column: info.range.start.column + filter.field,
      });
      if (!isFormulaError(value)) values.set(JSON.stringify(value), value);
      if (values.size >= 10000) break;
    }
    result.set(
      filter.field,
      [...values].map(([value, raw]) => ({
        value,
        label: raw === null || raw === "" ? t("pivot.empty") : String(raw),
      })),
    );
  }
  return result;
});
function addValue() {
  if (!fields.value.length || draft.value.table.values.length >= 16) return;
  const field = fields.value.at(-1)!;
  draft.value.table.values.push({
    field: field.value,
    aggregate: "sum",
    caption: `${t("pivot.sum")} · ${field.label}`,
  });
}
function addFilter() {
  const field = fields.value.find(
    (field) => !draft.value.table.filters.some((filter) => filter.field === field.value),
  );
  if (!field) return;
  draft.value.table.filters.push({ field: field.value, values: [] });
}
function setFilterValues(index: number, value: unknown) {
  if (!Array.isArray(value)) return;
  draft.value.table.filters[index]!.values = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => JSON.parse(entry) as CellValue);
}
function display(value: unknown) {
  return isFormulaError(value) ? value.code : value === null ? "" : String(value);
}
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="initial.chart ? t('pivot.chart') : t('pivot.title')"
    width="860px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: disabled || !preview }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
    ><div class="pivot-editor">
      <label>{{ t("drawing.name") }}<Input v-model="draft.table.name" :maxlength="200" /></label>
      <label
        >{{ t("chart.source")
        }}<RangeReferenceInput
          v-model="draft.source"
          :label="t('chart.source')"
          :select-reference="selectReference"
      /></label>
      <div class="pivot-editor__pair">
        <label
          >{{ t("pivot.rows")
          }}<Select
            v-model="draft.table.rowFields"
            multiple
            :options="fields"
            :placeholder="t('pivot.rows')" /></label
        ><label
          >{{ t("pivot.columns")
          }}<Select
            v-model="draft.table.columnFields"
            multiple
            :options="fields"
            :placeholder="t('pivot.columns')"
        /></label>
      </div>
      <section>
        <h3>{{ t("pivot.values") }}</h3>
        <div v-for="(value, index) in draft.table.values" :key="index" class="pivot-editor__value">
          <Select v-model="value.field" :options="fields" :aria-label="t('pivot.values')" /><Select
            v-model="value.aggregate"
            :options="aggregateOptions"
            :aria-label="t('pivot.aggregate')"
          /><Input
            v-model="value.caption"
            :placeholder="t('pivot.caption')"
            :maxlength="200"
          /><Button
            size="small"
            :disabled="draft.table.values.length < 2"
            @click="draft.table.values.splice(index, 1)"
            >{{ t("pivot.remove") }}</Button
          >
        </div>
        <Button
          size="small"
          :disabled="!fields.length || draft.table.values.length >= 16"
          @click="addValue"
          >{{ t("pivot.addValue") }}</Button
        >
      </section>
      <section>
        <h3>{{ t("pivot.filters") }}</h3>
        <div
          v-for="(filter, index) in draft.table.filters"
          :key="index"
          class="pivot-editor__filter"
        >
          <Select
            v-model="filter.field"
            :options="fields"
            :aria-label="t('pivot.filters')"
            @change="filter.values = []"
          /><Select
            :value="filter.values.map((value) => JSON.stringify(value))"
            multiple
            :options="filterOptions.get(filter.field) ?? []"
            :aria-label="t('pivot.filters')"
            @change="setFilterValues(index, $event)"
          /><Button size="small" @click="draft.table.filters.splice(index, 1)">{{
            t("pivot.remove")
          }}</Button>
        </div>
        <Button
          size="small"
          :disabled="draft.table.filters.length >= fields.length"
          @click="addFilter"
          >{{ t("pivot.addFilter") }}</Button
        >
      </section>
      <div class="pivot-editor__options">
        <Checkbox v-model="draft.table.rowTotals">{{ t("pivot.rowTotals") }}</Checkbox
        ><Checkbox v-model="draft.table.columnTotals">{{ t("pivot.columnTotals") }}</Checkbox
        ><Checkbox v-model="draft.table.includeHidden">{{ t("pivot.includeHidden") }}</Checkbox
        ><Checkbox v-model="draft.chart">{{ t("pivot.chart") }}</Checkbox>
      </div>
      <div class="pivot-editor__pair">
        <label
          >{{ t("pivot.sort")
          }}<Select
            v-model="draft.table.sort"
            :options="[
              { value: 'source', label: t('pivot.sourceOrder') },
              { value: 'ascending', label: t('pivot.ascending') },
              { value: 'descending', label: t('pivot.descending') },
            ]" /></label
        ><label
          >{{ t("pivot.style")
          }}<Select
            :value="draft.table.styleId ?? ''"
            :options="styles"
            @change="
              draft.table.styleId = typeof $event === 'string' && $event ? $event : undefined
            "
        /></label>
      </div>
      <Checkbox v-if="!initial.existing" v-model="draft.newSheet">{{
        t("pivot.newSheet")
      }}</Checkbox>
      <label v-if="draft.newSheet"
        >{{ t("pivot.sheetName") }}<Input v-model="draft.newSheetName" :maxlength="31" /></label
      ><label v-else
        >{{ t("pivot.destination")
        }}<RangeReferenceInput
          v-model="draft.destination"
          :label="t('pivot.destination')"
          :select-reference="selectReference"
      /></label>
      <Checkbox v-if="!draft.newSheet" v-model="draft.overwrite">{{
        t("pivot.overwrite")
      }}</Checkbox>
      <p>{{ t("pivot.hint") }}</p>
      <p v-if="error || !source" role="alert">{{ t("pivot.invalid") }}</p>
      <section v-if="preview" class="pivot-editor__preview">
        <h3>
          {{ t("pivot.preview") }} · {{ preview.matrix.length }} ×
          {{ preview.matrix[0]?.length ?? 0 }}
        </h3>
        <table>
          <tbody>
            <tr v-for="(row, rowIndex) in preview.matrix.slice(0, 8)" :key="rowIndex">
              <td v-for="(value, index) in row.slice(0, 8)" :key="index">{{ display(value) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.pivot-editor {
  display: grid;
  gap: 12px;
  max-height: 70vh;
  overflow: auto;
  label {
    display: grid;
    gap: 5px;
  }
  h3 {
    font-size: 13px;
    margin: 0 0 8px;
  }
  section {
    display: grid;
    gap: 8px;
  }
  &__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  &__value {
    display: grid;
    grid-template-columns: 1fr 120px 1fr auto;
    gap: 8px;
  }
  &__filter {
    display: grid;
    grid-template-columns: 160px 1fr auto;
    gap: 8px;
  }
  &__options {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  &__preview {
    overflow: auto;
    table {
      border-collapse: collapse;
      width: 100%;
    }
    td {
      border: 1px solid var(--idea-border-control);
      padding: 5px 8px;
      white-space: nowrap;
    }
    tr:first-child {
      font-weight: 600;
      background: var(--surface-secondary);
    }
  }
  p {
    margin: 0;
    color: var(--text-secondary);
  }
  [role="alert"] {
    color: var(--idea-status-error);
  }
}
</style>
