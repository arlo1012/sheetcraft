<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { ArrowDown, ArrowUp, Pencil, Plus, SquareMousePointer, Trash2 } from "lucide-vue-next";
import {
  createChartSourceFromRange,
  normalizeChartSource,
  type ChartSourceCategories,
  type ChartSourceSeries,
} from "@sheetcraft/core/chart-source";
import { reconcileChartRangeSeriesForRange } from "@sheetcraft/core/chart-range-series";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import { formatRangeReference } from "../../../shared/range-reference/formatRangeReference";
import {
  allocateChartSourceSeriesId,
  cloneChartSourceDrawing,
  createChartSourceCandidate,
  formatChartSourceName,
  getChartSourceApplicability,
  getEditableChartSource,
  parseChartSourceRange,
  readChartSourcePreview,
  type ChartSourceReferencePicker,
} from "../chart-source-editor";
import ChartContent from "./ChartContent.vue";
import ChartSeriesDialog from "./ChartSeriesDialog.vue";
import ChartCategoriesDialog from "./ChartCategoriesDialog.vue";

const props = withDefaults(
  defineProps<{
    drawing: SheetChartDrawing;
    sheet: Sheet;
    workbook: Workbook;
    evaluator: SheetEvaluator;
    revision: number;
    disabled: boolean;
    error?: boolean;
    suspended?: boolean;
    ownerValid?: () => boolean;
    commit: (drawing: SheetChartDrawing) => boolean;
    selectReference?: ChartSourceReferencePicker;
  }>(),
  { error: false, suspended: false },
);
const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
const draft = ref(cloneChartSourceDrawing(props.drawing));
const sourceText = ref(
  !draft.value.chart.source && draft.value.chart.range
    ? formatRangeReference(props.sheet.name, draft.value.chart.range)
    : "",
);
const selectedId = ref<string>();
const feedback = ref(false);
const invalidRange = ref(false);
const compositionBlocked = ref(false);
let composing = false;
let alive = true;
let epoch = 0;
let tokenCounter = 0;
let pickerEpoch = 0;
const entryTokens = new Map<string, number>();
type SeriesSession = {
  kind: "series";
  token: number;
  adding: boolean;
  entry: ChartSourceSeries;
  apply: (entry: ChartSourceSeries) => boolean;
  valid: () => boolean;
  close: () => void;
};
type CategoriesSession = {
  kind: "categories";
  token: number;
  categories: ChartSourceCategories;
  apply: (categories: ChartSourceCategories) => boolean;
  valid: () => boolean;
  close: () => void;
};
const nested = shallowRef<SeriesSession | CategoriesSession>();
const applicability = computed(() => getChartSourceApplicability(draft.value.chart));
const customSource = computed(() => !!draft.value.chart.source);
const blocked = computed(() => props.disabled || applicability.value !== "editable");
const source = computed(() => {
  try {
    return getEditableChartSource(props.sheet.id, draft.value.chart, props.sheet);
  } catch {
    return undefined;
  }
});
const preview = computed(() => {
  void props.revision;
  return readChartSourcePreview(
    props.sheet,
    source.value ? createChartSourceCandidate(draft.value.chart, source.value) : draft.value.chart,
    props.evaluator,
    props.workbook,
  );
});
const selectedIndex = computed(
  () => source.value?.series.findIndex((entry) => entry.id === selectedId.value) ?? -1,
);
const orderedSeries = computed(
  () =>
    source.value?.series.map((entry, index) => ({
      ...entry,
      label:
        preview.value.data.series.find((resolved) => resolved.id === entry.id)?.name ??
        (entry.name.kind === "literal"
          ? entry.name.text || `${t("chart.sourceSeries")} ${index + 1}`
          : formatChartSourceName(props.workbook, entry.name)),
    })) ?? [],
);
const directionOptions = computed(() => [
  { value: "columns", label: t("chart.sourceColumns") },
  { value: "rows", label: t("chart.sourceRows") },
]);
const previewDrawing = computed(() => ({ ...draft.value, width: 680, height: 250 }));
function resetTokens(): void {
  entryTokens.clear();
  for (const entry of source.value?.series ?? []) entryTokens.set(entry.id, ++tokenCounter);
  selectedId.value = source.value?.series[0]?.id;
}
resetTokens();
function current(): boolean {
  return alive && !blocked.value && (props.ownerValid?.() ?? true);
}
function syncInput(): void {
  const input = root.value?.querySelector<HTMLInputElement>("[data-chart-source-range] input");
  if (input) sourceText.value = input.value;
}
function setSource(next: NonNullable<typeof source.value>): void {
  draft.value.chart = createChartSourceCandidate(draft.value.chart, next);
  sourceText.value = "";
  invalidRange.value = false;
  feedback.value = false;
}
function close(): void {
  if (!alive) return;
  alive = false;
  epoch++;
  pickerEpoch++;
  nested.value = undefined;
  emit("close");
}
function confirm(): void {
  if (!current() || nested.value) return;
  if (composing) {
    compositionBlocked.value = true;
    return;
  }
  syncInput();
  // A typed new rectangle is never silently ignored in favour of the previous selection.
  const originalText =
    !customSource.value && draft.value.chart.range
      ? formatRangeReference(props.sheet.name, draft.value.chart.range)
      : "";
  if (sourceText.value !== originalText && !resetRange()) return;
  if (preview.value.invalid || invalidRange.value) {
    invalidRange.value = true;
    return;
  }
  if (!props.commit(cloneChartSourceDrawing(draft.value))) {
    feedback.value = true;
    return;
  }
  close();
}
function resetRange(): boolean {
  if (!current() || nested.value) return false;
  if (composing) {
    compositionBlocked.value = true;
    return false;
  }
  syncInput();
  const resolved = parseChartSourceRange(props.workbook, sourceText.value, props.sheet.id);
  if (!resolved) {
    invalidRange.value = true;
    return false;
  }
  // Reconcile the final rectangle against the captured owner. Intermediate draft
  // resets never make arbitrary identity edits or acquire new formatting identities.
  const base: SheetChart = { ...draft.value.chart, range: props.drawing.chart.range };
  delete base.source;
  if (props.drawing.chart.rectangleSeries)
    base.rectangleSeries = props.drawing.chart.rectangleSeries;
  else delete base.rectangleSeries;
  try {
    let chart = reconcileChartRangeSeriesForRange(
      base,
      resolved.range,
      resolved.sheetId === props.sheet.id,
    );
    if (resolved.sheetId !== props.sheet.id) {
      const source = createChartSourceFromRange(
        resolved.sheetId,
        chart,
        props.workbook.sheets.get(resolved.sheetId),
      );
      chart = createChartSourceCandidate(chart, source);
    }
    const result = readChartSourcePreview(props.sheet, chart, props.evaluator, props.workbook);
    if (result.invalid) {
      invalidRange.value = true;
      return false;
    }
    draft.value.chart = chart;
    sourceText.value = chart.source ? "" : formatRangeReference(props.sheet.name, resolved.range);
    invalidRange.value = false;
    feedback.value = false;
    epoch++;
    resetTokens();
    return true;
  } catch {
    invalidRange.value = true;
    return false;
  }
}
function changeLayout(key: "seriesBy" | "headerRow" | "headerColumn", value: unknown): void {
  if (!current() || nested.value || customSource.value || composing) return;
  syncInput();
  if (
    sourceText.value !==
      (draft.value.chart.range
        ? formatRangeReference(props.sheet.name, draft.value.chart.range)
        : "") &&
    !resetRange()
  )
    return;
  // A pending cross-sheet rectangle may have switched to independent sources.
  if (customSource.value) return;
  if (key === "seriesBy") {
    if (value !== "rows" && value !== "columns") return;
    draft.value.chart = { ...draft.value.chart, seriesBy: value };
  } else if (typeof value === "boolean") draft.value.chart = { ...draft.value.chart, [key]: value };
  epoch++;
  resetTokens();
  feedback.value = false;
}
function prepareSourceAction(): boolean {
  if (!current() || nested.value) return false;
  if (composing) {
    compositionBlocked.value = true;
    return false;
  }
  syncInput();
  const expected =
    !customSource.value && draft.value.chart.range
      ? formatRangeReference(props.sheet.name, draft.value.chart.range)
      : "";
  return sourceText.value === expected || resetRange();
}
function changeHidden(value: unknown): void {
  if (typeof value === "boolean" && prepareSourceAction()) draft.value.chart.showHidden = value;
}
function select(id: string): void {
  if (prepareSourceAction()) selectedId.value = id;
}
function remove(): void {
  if (!prepareSourceAction() || !source.value || selectedIndex.value < 0) return;
  const next = normalizeChartSource(source.value);
  const index = selectedIndex.value;
  const removed = next.series.splice(index, 1)[0]!;
  entryTokens.delete(removed.id);
  setSource(next);
  selectedId.value = next.series[Math.min(index, next.series.length - 1)]?.id;
}
function move(delta: -1 | 1): void {
  if (!prepareSourceAction() || !source.value) return;
  const index = selectedIndex.value;
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= source.value.series.length) return;
  const next = normalizeChartSource(source.value);
  const entry = next.series.splice(index, 1)[0]!;
  next.series.splice(nextIndex, 0, entry);
  setSource(next);
}
function openSeries(adding: boolean): void {
  if (!prepareSourceAction() || !source.value || (adding && source.value.series.length >= 256))
    return;
  const entries = source.value.series;
  let entry: ChartSourceSeries;
  if (adding) {
    const id = allocateChartSourceSeriesId(draft.value.chart, source.value);
    let colorIndex = Math.max(-1, ...entries.map((item) => item.colorIndex)) + 1;
    if (colorIndex > 9999) {
      colorIndex = 0;
      while (entries.some((item) => item.colorIndex === colorIndex)) colorIndex++;
    }
    entry = {
      id,
      colorIndex,
      name: { kind: "literal", text: "" },
      values: { kind: "literal", values: [1] },
    };
  } else {
    const selected = entries.find((item) => item.id === selectedId.value);
    if (!selected) return;
    entry = selected;
  }
  const ownerEpoch = epoch;
  const entryToken = adding ? ++tokenCounter : entryTokens.get(entry.id);
  const session: SeriesSession = {
    kind: "series",
    token: ++tokenCounter,
    adding,
    entry,
    close: () => {
      if (nested.value === session) nested.value = undefined;
    },
    valid: () =>
      current() &&
      epoch === ownerEpoch &&
      nested.value === session &&
      (adding || entryTokens.get(entry.id) === entryToken),
    apply: (updated) => {
      if (
        !session.valid() ||
        updated.id !== entry.id ||
        updated.colorIndex !== entry.colorIndex ||
        !source.value
      )
        return false;
      const next = normalizeChartSource(source.value);
      if (adding) {
        if (next.series.length >= 256 || next.series.some((item) => item.id === entry.id))
          return false;
        next.series.push(updated);
      } else {
        const index = next.series.findIndex((item) => item.id === entry.id);
        if (index < 0) return false;
        next.series[index] = updated;
      }
      const result = readChartSourcePreview(
        props.sheet,
        createChartSourceCandidate(draft.value.chart, next),
        props.evaluator,
        props.workbook,
      );
      if (result.invalid) return false;
      setSource(next);
      if (adding) entryTokens.set(entry.id, entryToken!);
      selectedId.value = entry.id;
      return true;
    },
  };
  nested.value = session;
}
function openCategories(): void {
  if (!prepareSourceAction() || !source.value) return;
  const ownerEpoch = epoch;
  const session: CategoriesSession = {
    kind: "categories",
    token: ++tokenCounter,
    categories: source.value.categories,
    close: () => {
      if (nested.value === session) nested.value = undefined;
    },
    valid: () => current() && epoch === ownerEpoch && nested.value === session,
    apply: (categories) => {
      if (!session.valid() || !source.value) return false;
      const next = { ...source.value, categories };
      if (
        readChartSourcePreview(
          props.sheet,
          createChartSourceCandidate(draft.value.chart, next),
          props.evaluator,
          props.workbook,
        ).invalid
      )
        return false;
      setSource(next);
      return true;
    },
  };
  nested.value = session;
}
function compositionStart(): void {
  composing = true;
}
function compositionEnd(): void {
  composing = false;
  compositionBlocked.value = false;
  syncInput();
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229))
    event.stopImmediatePropagation();
}
async function pickSource(): Promise<void> {
  if (!current() || nested.value || !props.selectReference || composing) return;
  syncInput();
  const before = sourceText.value;
  const requestEpoch = ++pickerEpoch;
  const selected = await props.selectReference(before, "source");
  if (
    !current() ||
    requestEpoch !== pickerEpoch ||
    selected === undefined ||
    sourceText.value !== before
  )
    return;
  sourceText.value = selected;
  invalidRange.value = false;
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      epoch++;
      pickerEpoch++;
    }
  },
);
onBeforeUnmount(() => {
  alive = false;
  epoch++;
  pickerEpoch++;
});
</script>

<template>
  <Dialog
    :visible="!suspended && !nested"
    :header="t('chart.selectData')"
    width="min(840px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: blocked }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="close"
  >
    <div
      ref="root"
      class="chart-source-editor"
      data-chart-source-dialog
      @compositionstart.capture="compositionStart"
      @compositionend.capture="compositionEnd"
      @keydown.capture="keydown"
    >
      <p v-if="applicability !== 'editable'" class="chart-source-editor__hint" role="status">
        {{
          t(
            applicability === "pivot"
              ? "chart.sourcePivotUnavailable"
              : applicability === "cached"
                ? "chart.sourceCachedUnavailable"
                : applicability === "broken-range"
                  ? "chart.sourceBrokenUnavailable"
                  : "chart.sourceTypeUnavailable",
          )
        }}
      </p>
      <div class="chart-source-editor__range" data-chart-source-range>
        <span class="chart-source-editor__label">{{ t("chart.sourceChartRange") }}</span>
        <div class="chart-source-editor__range-row">
          <label class="chart-source-editor__range-input"
            ><span class="ui-visually-hidden">{{ t("chart.sourceChartRange") }}</span>
            <Input
              v-model="sourceText"
              :disabled="blocked"
              :aria-label="t('chart.sourceChartRange')"
              autocomplete="off"
              :placeholder="customSource ? t('chart.sourceComplexPlaceholder') : undefined"
              @enter="resetRange"
              @blur="syncInput"
            >
              <template v-if="selectReference" #suffixIcon
                ><Button
                  size="small"
                  variant="text"
                  :disabled="blocked"
                  :aria-label="t('chart.sourcePickRange')"
                  @click.stop="pickSource"
                  ><template #icon
                    ><SquareMousePointer
                      class="sheetcraft-action-icon"
                      aria-hidden="true" /></template></Button
              ></template> </Input
          ></label>
          <Button :disabled="blocked" data-reset-chart-range @click="resetRange">{{
            t("chart.sourceResetRange")
          }}</Button>
        </div>
        <p class="chart-source-editor__hint">
          {{ t(customSource ? "chart.sourceComplexHint" : "chart.sourceResetHint") }}
        </p>
      </div>
      <div v-if="!customSource" class="chart-source-editor__layout">
        <span class="chart-source-editor__label">{{ t("chart.sourceDirection") }}</span>
        <Select
          :value="draft.chart.seriesBy"
          :options="directionOptions"
          :popup-props="{ overlayClassName: 'chart-source-options-popup' }"
          :disabled="blocked"
          :aria-label="t('chart.sourceDirection')"
          @change="changeLayout('seriesBy', $event)"
        />
        <div class="chart-source-editor__headers">
          <Checkbox
            :checked="draft.chart.headerRow"
            :disabled="blocked"
            @change="changeLayout('headerRow', $event)"
            >{{
              t(draft.chart.seriesBy === "rows" ? "chart.headerRowCategories" : "chart.headerRow")
            }}</Checkbox
          >
          <Checkbox
            :checked="draft.chart.headerColumn"
            :disabled="blocked"
            @change="changeLayout('headerColumn', $event)"
            >{{
              t(draft.chart.seriesBy === "rows" ? "chart.headerColumnSeries" : "chart.headerColumn")
            }}</Checkbox
          >
        </div>
      </div>
      <div class="chart-source-editor__columns">
        <section class="chart-source-editor__section">
          <div class="chart-source-editor__section-title">
            <h3>{{ t("chart.sourceLegendEntries") }}</h3>
            <span>{{ orderedSeries.length }}</span>
          </div>
          <div class="chart-source-editor__toolbar">
            <Button
              size="small"
              variant="text"
              :disabled="blocked || orderedSeries.length >= 256"
              :aria-label="t('chart.sourceAddSeries')"
              data-source-add
              @click="openSeries(true)"
              ><template #icon><Plus class="sheetcraft-action-icon" aria-hidden="true" /></template
              >{{ t("chart.sourceAdd") }}</Button
            >
            <Button
              size="small"
              variant="text"
              :disabled="blocked || selectedIndex < 0"
              :aria-label="t('chart.sourceEditSeries')"
              data-source-edit
              @click="openSeries(false)"
              ><template #icon
                ><Pencil class="sheetcraft-action-icon" aria-hidden="true" /></template
              >{{ t("chart.sourceEdit") }}</Button
            >
            <Button
              size="small"
              variant="text"
              :disabled="blocked || selectedIndex < 0"
              :aria-label="t('chart.sourceRemoveSeries')"
              data-source-remove
              @click="remove"
              ><template #icon
                ><Trash2 class="sheetcraft-action-icon" aria-hidden="true" /></template
              >{{ t("chart.sourceRemove") }}</Button
            >
            <span class="chart-source-editor__toolbar-spacer" />
            <Button
              size="small"
              variant="text"
              :disabled="blocked || selectedIndex <= 0"
              :aria-label="t('chart.sourceMoveUp')"
              data-source-up
              @click="move(-1)"
              ><ArrowUp
            /></Button>
            <Button
              size="small"
              variant="text"
              :disabled="blocked || selectedIndex < 0 || selectedIndex >= orderedSeries.length - 1"
              :aria-label="t('chart.sourceMoveDown')"
              data-source-down
              @click="move(1)"
              ><ArrowDown
            /></Button>
          </div>
          <div
            class="chart-source-editor__list"
            role="listbox"
            :aria-label="t('chart.sourceLegendEntries')"
          >
            <button
              v-for="(entry, index) in orderedSeries"
              :key="entry.id"
              type="button"
              role="option"
              :aria-selected="entry.id === selectedId"
              :disabled="blocked"
              class="chart-source-editor__series"
              :class="{ 'is-selected': entry.id === selectedId }"
              :data-source-series="entry.id"
              @click="select(entry.id)"
              @dblclick="openSeries(false)"
            >
              <span class="chart-source-editor__ordinal">{{ index + 1 }}</span
              ><span class="chart-source-editor__series-label">{{ entry.label }}</span>
            </button>
            <p v-if="!orderedSeries.length" class="chart-source-editor__empty">
              {{ t("chart.sourceNoSeries") }}
            </p>
          </div>
        </section>
        <section class="chart-source-editor__section">
          <div class="chart-source-editor__section-title">
            <h3>{{ t("chart.sourceAxisCategories") }}</h3>
            <span>{{ preview.data.categories.length }}</span>
          </div>
          <div class="chart-source-editor__toolbar">
            <Button
              size="small"
              variant="text"
              :disabled="blocked"
              :aria-label="t('chart.sourceEditCategories')"
              data-source-categories
              @click="openCategories"
              ><template #icon
                ><Pencil class="sheetcraft-action-icon" aria-hidden="true" /></template
              >{{ t("chart.sourceEdit") }}</Button
            >
          </div>
          <ol
            class="chart-source-editor__list chart-source-editor__categories"
            :aria-label="t('chart.sourceAxisCategories')"
          >
            <li v-for="(category, index) in preview.data.categories" :key="index">
              <span class="chart-source-editor__ordinal">{{ index + 1 }}</span
              ><span>{{ category }}</span>
            </li>
            <li v-if="!preview.data.categories.length" class="chart-source-editor__empty">
              {{ t("chart.sourceNoCategories") }}
            </li>
          </ol>
        </section>
      </div>
      <Checkbox :checked="draft.chart.showHidden" :disabled="blocked" @change="changeHidden">{{
        t("chart.showHidden")
      }}</Checkbox>
      <p v-if="compositionBlocked" class="chart-source-editor__error" role="alert">
        {{ t("chart.sourceFinishComposition") }}
      </p>
      <p
        v-else-if="invalidRange || preview.invalid"
        class="chart-source-editor__error"
        role="alert"
      >
        {{ t("chart.sourceInvalidRange") }}
      </p>
      <p v-else-if="error || feedback" class="chart-source-editor__error" role="alert">
        {{ t("chart.sourceApplyFailed") }}
      </p>
      <div class="chart-source-editor__preview" :aria-label="t('chart.sourcePreview')">
        <ChartContent
          :drawing="previewDrawing"
          :sheet="sheet"
          :evaluator="evaluator"
          :revision="revision"
          :resolve-sheet="(id) => workbook.sheets.get(id)"
        />
      </div>
    </div>
  </Dialog>
  <ChartSeriesDialog
    v-if="nested?.kind === 'series'"
    :key="nested.token"
    :entry="nested.entry"
    :adding="nested.adding"
    :chart="draft.chart"
    :sheet="sheet"
    :workbook="workbook"
    :evaluator="evaluator"
    :revision="revision"
    :disabled="blocked"
    :suspended="suspended"
    :owner-valid="nested.valid"
    :apply="nested.apply"
    :select-reference="selectReference"
    @close="nested.close"
  />
  <ChartCategoriesDialog
    v-if="nested?.kind === 'categories'"
    :key="nested.token"
    :categories="nested.categories"
    :chart="draft.chart"
    :sheet="sheet"
    :workbook="workbook"
    :evaluator="evaluator"
    :revision="revision"
    :disabled="blocked"
    :suspended="suspended"
    :owner-valid="nested.valid"
    :apply="nested.apply"
    :select-reference="selectReference"
    @close="nested.close"
  />
</template>
<style scoped lang="scss">
.chart-source-editor {
  display: grid;
  gap: 16px;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  min-width: 0;
  &__label {
    white-space: nowrap;
    font-weight: 500;
  }
  &__range {
    display: grid;
    gap: 8px;
  }
  &__range-input {
    display: block;
    min-width: 0;
  }
  &__range-row {
    display: flex;
    gap: 8px;
    align-items: center;
    > :first-child {
      flex: 1;
      min-width: 0;
    }
  }
  &__layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 12px;
    align-items: center;
  }
  &__headers {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
  }
  &__columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
  }
  &__section {
    min-width: 0;
  }
  &__section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    h3 {
      margin: 0;
      font-size: 14px;
      line-height: 22px;
      font-weight: 600;
      white-space: nowrap;
    }
    > span {
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 38px;
    white-space: nowrap;
  }
  &__toolbar-spacer {
    flex: 1;
  }
  &__list {
    height: 200px;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-default);
    margin: 0;
    padding: 6px;
    list-style: none;
  }
  &__series {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--sheetcraft-radius-default);
    text-align: left;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    &:hover:not(:disabled) {
      background: var(--sheetcraft-surface-hover);
    }
    &.is-selected {
      background: var(--sheetcraft-action-primary-subtle);
    }
    &:disabled {
      color: var(--sheetcraft-text-disabled);
      cursor: default;
    }
  }
  &__series-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__ordinal {
    color: var(--sheetcraft-text-secondary);
    flex: 0 0 22px;
  }
  &__categories > li {
    display: flex;
    gap: 10px;
    padding: 7px 10px;
    > :last-child {
      overflow-wrap: anywhere;
      min-width: 0;
    }
  }
  &__empty {
    margin: 0;
    padding: 20px 10px;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
  &__hint,
  &__error {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
  &__preview {
    height: 250px;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-subtle);
  }
}
@media (max-width: 600px) {
  .chart-source-editor {
    &__columns {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    &__list {
      height: 150px;
    }
    &__range-input {
      display: block;
      min-width: 0;
    }
    &__range-row {
      flex-wrap: wrap;
      > :first-child {
        flex-basis: 100%;
      }
    }
  }
}
</style>
