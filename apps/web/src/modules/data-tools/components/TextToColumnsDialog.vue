<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import FixedWidthSplitEditor from "./FixedWidthSplitEditor.vue";
import type { TextToColumnsDraft } from "../data-tools-types";
import { convertSplitColumnField, type SplitColumnSuggestion } from "@idea10/core/commands";
import { formatCellNumberValue } from "@idea10/core/number-format";
import type { ExcelDateSystem } from "@idea10/core/formula";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    preview?: readonly string[];
    totalColumnCount?: number;
    previewRows?: readonly { row: number; values: readonly string[] }[];
    sourceRows?: readonly { row: number; text: string }[];
    rangeLabel?: string;
    destinationLabel?: string;
    picking?: boolean;
    selectReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
    suggestions?: readonly SplitColumnSuggestion[];
    previewError?: string;
    dateSystem?: ExcelDateSystem;
  }>(),
  {
    preview: () => [],
    totalColumnCount: 0,
    previewRows: () => [],
    sourceRows: () => [],
    rangeLabel: "",
    destinationLabel: "",
    picking: false,
    suggestions: () => [],
    previewError: "",
    dateSystem: "1900",
  },
);
const emit = defineEmits<{
  close: [];
  apply: [draft: TextToColumnsDraft];
  draftChange: [draft: TextToColumnsDraft];
}>();
const { t } = useAppI18n();
const step = ref(0);
const setupMode = ref<"auto" | "custom">("auto");
const selectedColumn = ref(0);
const breakPositionInput = ref("");
const otherEnabled = ref(false);
const defaultDraft = (): TextToColumnsDraft => ({
  source: props.rangeLabel,
  mode: "auto",
  autoSuggestionId: undefined,
  delimiters: [","],
  otherDelimiter: "",
  otherDelimiterMode: "characters",
  textTypes: ["chinese", "english", "number"],
  keywords: [""],
  keywordPosition: "after",
  keepKeywords: true,
  fixedWidths: [],
  columnTypes: Array.from(
    {
      length: Math.max(
        props.totalColumnCount,
        props.preview.length,
        ...props.previewRows.map((row) => row.values.length),
      ),
    },
    () => "general" as const,
  ),
  dateOrders: [],
  textQualifier: '"',
  mergeDelimiters: false,
  destination: props.destinationLabel,
  overwrite: false,
});
const draft = ref(defaultDraft());
const widthsInput = computed(() => {
  let offset = 0;
  return draft.value.fixedWidths.map((width) => (offset += width)).join(", ");
});
const rows = computed(() =>
  props.previewRows.length
    ? props.previewRows
    : props.preview.length
      ? [{ row: 0, values: props.preview }]
      : [],
);
const columnCount = computed(() =>
  Math.max(props.totalColumnCount, ...rows.value.map((row) => row.values.length)),
);
const showSourcePreview = computed(
  () => step.value === 0 && draft.value.mode === "auto" && !props.suggestions.length,
);
const previewData = computed(() => {
  if (
    showSourcePreview.value ||
    (step.value === 0 && setupMode.value === "custom" && draft.value.mode === "fixed-width")
  )
    return [...props.sourceRows];
  if (step.value === 0) return [...rows.value];
  return rows.value.map((row) => ({
    ...row,
    values: row.values.map((raw, index) => previewField(raw, index)),
  }));
});
const previewColumnWidth = computed(() => 136);
const previewTableWidth = computed(
  () => `max(100%, ${56 + columnCount.value * previewColumnWidth.value}px)`,
);
const previewColumns = computed<BaseTableCol[]>(() => [
  {
    colKey: "row",
    title: t("dataTools.textToColumns.row"),
    width: 56,
    align: "center",
    fixed: "left",
  },
  ...(showSourcePreview.value
    ? [{ colKey: "text", title: t("dataTools.textToColumns.source"), ellipsis: true }]
    : Array.from({ length: columnCount.value }, (_, index) => ({
        colKey: `values.${index}`,
        title: "previewColumnTitle",
        width: previewColumnWidth.value,
        ellipsis: true,
        className: [
          step.value === 1 && selectedColumn.value === index
            ? "text-to-columns-dialog__column--selected"
            : "",
          step.value === 1 && draft.value.columnTypes[index] === "skip"
            ? "text-to-columns-dialog__column--skipped"
            : "",
        ],
        thClassName:
          step.value === 1 && selectedColumn.value === index
            ? "text-to-columns-dialog__column--selected"
            : "",
      }))),
]);
const delimiterOptions = computed(() => [
  { value: "\t", label: t("dataTools.textToColumns.tab") },
  { value: ";", label: t("dataTools.textToColumns.semicolon") },
  { value: ",", label: t("dataTools.textToColumns.comma") },
  { value: " ", label: t("dataTools.textToColumns.space") },
  { value: "\n", label: t("dataTools.textToColumns.lineBreak") },
]);
const typeOptions = computed(() => [
  { value: "general", label: t("cellFormat.general") },
  { value: "text", label: t("ribbon.textFormat") },
  { value: "date", label: t("dataTools.textToColumns.date") },
  { value: "skip", label: t("dataTools.textToColumns.skip") },
]);
const qualifierOptions = computed(() => [
  { value: '"', label: t("dataTools.textToColumns.doubleQuote") },
  { value: "'", label: t("dataTools.textToColumns.singleQuote") },
  { value: "none", label: t("dataTools.textToColumns.none") },
]);
const dateOrderOptions = computed(() =>
  ["YMD", "MDY", "DMY", "YDM", "MYD", "DYM"].map((value) => ({ value, label: value })),
);
const splitModeOptions = computed(() => [
  { value: "delimiter", label: t("dataTools.textToColumns.delimiter") },
  { value: "text-type", label: t("dataTools.textToColumns.textType") },
  { value: "keyword", label: t("dataTools.textToColumns.keyword") },
  { value: "fixed-width", label: t("dataTools.textToColumns.fixedWidth") },
]);
const selectedSuggestion = computed(() =>
  props.suggestions.find((item) => item.id === draft.value.autoSuggestionId),
);
const widthsValid = computed(
  () =>
    !breakPositionInput.value.trim() ||
    (/^\s*[1-9]\d*\s*$/.test(breakPositionInput.value) &&
      Number.isSafeInteger(Number(breakPositionInput.value))),
);
const canNext = computed(
  () =>
    !props.previewError &&
    (draft.value.mode === "auto"
      ? Boolean(selectedSuggestion.value)
      : draft.value.mode === "delimiter"
        ? Boolean(draft.value.delimiters.length || draft.value.otherDelimiter)
        : draft.value.mode === "fixed-width"
          ? widthsValid.value && draft.value.fixedWidths.length > 0
          : draft.value.mode === "text-type"
            ? Boolean(draft.value.textTypes?.length)
            : Boolean(draft.value.keywords?.some((keyword) => keyword.trim()))),
);
const canApply = computed(() =>
  Boolean(
    canNext.value &&
    draft.value.destination.trim() &&
    columnCount.value &&
    draft.value.columnTypes.some((type) => type !== "skip"),
  ),
);
function copyDraft(): TextToColumnsDraft {
  return {
    ...draft.value,
    delimiters: [...draft.value.delimiters],
    fixedWidths: [...draft.value.fixedWidths],
    columnTypes: [...draft.value.columnTypes],
    dateOrders: [...(draft.value.dateOrders ?? [])],
    textTypes: [...(draft.value.textTypes ?? [])],
    keywords: [...(draft.value.keywords ?? [])],
  };
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    step.value = 0;
    setupMode.value = "auto";
    selectedColumn.value = 0;
    breakPositionInput.value = "";
    otherEnabled.value = false;
    draft.value = defaultDraft();
  },
  { immediate: true },
);
watch(
  () => [props.visible, props.suggestions, draft.value.mode] as const,
  ([, suggestions]) => {
    if (!props.visible || draft.value.mode !== "auto" || !suggestions.length) return;
    if (!suggestions.some((suggestion) => suggestion.id === draft.value.autoSuggestionId))
      chooseSuggestion(suggestions[0]!.id);
  },
  { immediate: true },
);
watch(
  columnCount,
  (length) => {
    if (!length) return;
    if (draft.value.columnTypes.length !== length)
      draft.value.columnTypes = Array.from(
        { length },
        (_, index) => draft.value.columnTypes[index] ?? "general",
      );
    selectedColumn.value = Math.min(selectedColumn.value, Math.max(0, length - 1));
  },
  { immediate: true },
);
watch(
  draft,
  () => {
    if (props.visible) emit("draftChange", copyDraft());
  },
  { deep: true, immediate: true },
);
watch(
  () => props.destinationLabel,
  (destination, previous) => {
    if (props.visible && draft.value.destination === previous)
      draft.value.destination = destination;
  },
);
function selectSourceReference(current: string): Promise<string | undefined> {
  return props.selectReference?.(current, { singleCell: false }) ?? Promise.resolve(undefined);
}
function toggleDelimiter(delimiter: string, checked: boolean): void {
  draft.value.delimiters = checked
    ? [...new Set([...draft.value.delimiters, delimiter])]
    : draft.value.delimiters.filter((item) => item !== delimiter);
}
function changeWidths(widths: number[]): void {
  draft.value.fixedWidths = widths;
}
function addBreakPosition(): void {
  if (!widthsValid.value || !breakPositionInput.value.trim()) return;
  const position = Number(breakPositionInput.value);
  const positions = draft.value.fixedWidths.reduce<number[]>(
    (values, width) => [...values, (values.at(-1) ?? 0) + width],
    [],
  );
  if (!positions.includes(position)) {
    const all = [...positions, position].sort((a, b) => a - b);
    draft.value.fixedWidths = all.map((value, index) => value - (all[index - 1] ?? 0));
  }
  breakPositionInput.value = "";
}
function setColumnType(value: unknown): void {
  if (value === "general" || value === "text" || value === "date" || value === "skip")
    draft.value.columnTypes[selectedColumn.value] = value;
}
function setSetupMode(value: "auto" | "custom"): void {
  setupMode.value = value;
  if (value === "custom" && draft.value.mode === "auto") {
    const options = selectedSuggestion.value?.options;
    if (options?.mode === "delimiter") {
      draft.value.mode = "delimiter";
      draft.value.delimiters = [...(options.delimiters ?? [])];
      draft.value.textQualifier = options.textQualifier ?? '"';
      draft.value.mergeDelimiters = options.mergeDelimiters ?? false;
    } else if (options?.mode === "fixedWidth") {
      draft.value.mode = "fixed-width";
      draft.value.fixedWidths = [...(options.fixedWidths ?? [])];
    } else if (options?.mode === "textType") {
      draft.value.mode = "text-type";
      draft.value.textTypes = [...(options.textTypes ?? [])];
    } else if (options?.mode === "keyword") {
      draft.value.mode = "keyword";
      draft.value.keywords = [...(options.keywords ?? [])];
      draft.value.keywordPosition = options.keywordPosition ?? "after";
      draft.value.keepKeywords = options.keepKeywords ?? true;
    } else draft.value.mode = "delimiter";
  } else if (value === "auto") draft.value.mode = "auto";
}
function setCustomMode(value: unknown): void {
  if (
    value === "delimiter" ||
    value === "fixed-width" ||
    value === "text-type" ||
    value === "keyword"
  )
    draft.value.mode = value;
}
function chooseSuggestion(id: string): void {
  const suggestion = props.suggestions.find((item) => item.id === id);
  if (!suggestion) return;
  draft.value.autoSuggestionId = id;
}
function toggleTextType(type: "chinese" | "english" | "number", checked: boolean): void {
  const types = draft.value.textTypes ?? [];
  draft.value.textTypes = checked
    ? [...new Set([...types, type])]
    : types.filter((item) => item !== type);
}
function addKeyword(): void {
  draft.value.keywords = [...(draft.value.keywords ?? []), ""];
}
function removeKeyword(index: number): void {
  draft.value.keywords = (draft.value.keywords ?? []).filter((_, item) => item !== index);
}
function setKeyword(index: number, value: string | number): void {
  const keywords = [...(draft.value.keywords ?? [])];
  keywords[index] = String(value);
  draft.value.keywords = keywords;
}
function setDateOrder(value: unknown): void {
  const orders = [...(draft.value.dateOrders ?? [])];
  const order = String(value) as NonNullable<TextToColumnsDraft["dateOrders"]>[number];
  orders[selectedColumn.value] = order;
  draft.value.dateOrders = orders;
}
function previewField(raw: string, index: number): string {
  const type = draft.value.columnTypes[index] ?? "general";
  const result = convertSplitColumnField(
    raw,
    type,
    draft.value.dateOrders?.[index],
    props.dateSystem,
  );
  if (result.numberFormat && typeof result.value === "number")
    return formatCellNumberValue(result.value, result.numberFormat, {
      dateSystem: props.dateSystem,
    }).text;
  return String(result.value);
}
function suggestionLabel(suggestion: SplitColumnSuggestion): string {
  const mode = suggestion.options.mode;
  const rule =
    mode === "delimiter"
      ? `${t("dataTools.textToColumns.delimiter")} (${suggestion.options.delimiters?.map((delimiter) => delimiterOptions.value.find((option) => option.value === delimiter)?.label ?? delimiter).join(", ")})`
      : mode === "fixedWidth"
        ? t("dataTools.textToColumns.fixedWidth")
        : mode === "textType"
          ? t("dataTools.textToColumns.textType")
          : t("dataTools.textToColumns.keyword");
  return t("dataTools.textToColumns.suggestion", { rule, count: suggestion.columnCount });
}
function confirm(): void {
  if (step.value < 1) {
    if (canNext.value) step.value += 1;
  } else if (canApply.value) emit("apply", copyDraft());
}
</script>
<template>
  <Dialog
    :visible="visible && !picking"
    :header="t('dataTools.textToColumns.wizardTitle')"
    width="680px"
    :footer="true"
    :close-on-overlay-click="false"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="text-to-columns-dialog">
      <TForm label-align="left" :label-width="104" @submit.prevent>
        <TFormItem :label="t('dataTools.textToColumns.source')">
          <div class="text-to-columns-dialog__source">
            <RangeReferenceInput
              :model-value="draft.source ?? ''"
              :label="t('dataTools.textToColumns.source')"
              :select-reference="selectReference ? selectSourceReference : undefined"
              @update:model-value="draft.source = $event"
            />
          </div>
        </TFormItem>
        <template v-if="step === 0">
          <TTabs :value="setupMode" @change="setSetupMode($event as 'auto' | 'custom')">
            <TTabPanel value="auto" :label="t('dataTools.textToColumns.autoSplit')">
              <div class="text-to-columns-dialog__auto-settings">
                <TRadioGroup
                  v-if="suggestions.length"
                  :value="draft.autoSuggestionId"
                  class="text-to-columns-dialog__suggestions"
                  @change="chooseSuggestion(String($event))"
                >
                  <TRadio
                    v-for="suggestion in suggestions"
                    :key="suggestion.id"
                    :value="suggestion.id"
                    >{{ suggestionLabel(suggestion) }}</TRadio
                  >
                </TRadioGroup>
                <p v-else class="text-to-columns-dialog__error">
                  {{ t("dataTools.textToColumns.autoNoSuggestion") }}
                </p>
              </div>
            </TTabPanel>
            <TTabPanel value="custom" :label="t('dataTools.textToColumns.customSplit')">
              <TRadioGroup
                :value="draft.mode"
                class="text-to-columns-dialog__mode-tabs"
                @change="setCustomMode"
              >
                <TRadio v-for="item in splitModeOptions" :key="item.value" :value="item.value">{{
                  item.label
                }}</TRadio>
              </TRadioGroup>
            </TTabPanel>
          </TTabs>
          <template v-if="draft.mode === 'delimiter'">
            <div
              class="text-to-columns-dialog__delimiter-group"
              role="group"
              :aria-label="t('dataTools.textToColumns.delimiter')"
            >
              <div class="text-to-columns-dialog__inline">
                <TCheckbox
                  v-for="item in delimiterOptions"
                  :key="item.value"
                  :checked="draft.delimiters.includes(item.value)"
                  @change="toggleDelimiter(item.value, Boolean($event))"
                  >{{ item.label }}</TCheckbox
                >
              </div>
              <div class="text-to-columns-dialog__other">
                <TCheckbox
                  v-model="otherEnabled"
                  @change="!$event && (draft.otherDelimiter = '')"
                  >{{ t("dataTools.textToColumns.other") }}</TCheckbox
                ><TInput
                  v-model="draft.otherDelimiter"
                  :disabled="!otherEnabled"
                  :aria-label="t('dataTools.textToColumns.other')"
                />
                <TRadioGroup
                  v-model="draft.otherDelimiterMode"
                  :disabled="!otherEnabled"
                  class="text-to-columns-dialog__inline"
                >
                  <TRadio value="characters">{{
                    t("dataTools.textToColumns.anyCharacter")
                  }}</TRadio>
                  <TRadio value="token">{{ t("dataTools.textToColumns.fullToken") }}</TRadio>
                </TRadioGroup>
              </div>
              <TCheckbox v-model="draft.mergeDelimiters">{{
                t("dataTools.textToColumns.mergeDelimiters")
              }}</TCheckbox>
            </div>
            <TFormItem :label="t('dataTools.textToColumns.qualifier')"
              ><TSelect
                v-model="draft.textQualifier"
                :options="qualifierOptions"
                :aria-label="t('dataTools.textToColumns.qualifier')"
            /></TFormItem>
          </template>
          <div
            v-else-if="draft.mode === 'text-type'"
            class="text-to-columns-dialog__setting"
            role="group"
            :aria-label="t('dataTools.textToColumns.textType')"
          >
            <div class="text-to-columns-dialog__inline">
              <TCheckbox
                :checked="draft.textTypes?.includes('chinese')"
                @change="toggleTextType('chinese', Boolean($event))"
                >{{ t("dataTools.textToColumns.chinese") }}</TCheckbox
              >
              <TCheckbox
                :checked="draft.textTypes?.includes('english')"
                @change="toggleTextType('english', Boolean($event))"
                >{{ t("dataTools.textToColumns.english") }}</TCheckbox
              >
              <TCheckbox
                :checked="draft.textTypes?.includes('number')"
                @change="toggleTextType('number', Boolean($event))"
                >{{ t("dataTools.textToColumns.number") }}</TCheckbox
              >
            </div>
          </div>
          <div
            v-else-if="draft.mode === 'keyword'"
            class="text-to-columns-dialog__keywords"
            role="group"
            :aria-label="t('dataTools.textToColumns.keyword')"
          >
            <div
              v-for="(_, index) in draft.keywords"
              :key="index"
              class="text-to-columns-dialog__keyword"
            >
              <TInput
                :value="draft.keywords?.[index]"
                :aria-label="t('dataTools.textToColumns.keyword')"
                @change="setKeyword(index, $event)"
              />
              <TButton
                variant="text"
                theme="danger"
                :disabled="draft.keywords?.length === 1"
                @click="removeKeyword(index)"
                >{{ t("dataTools.textToColumns.removeKeyword") }}</TButton
              >
            </div>
            <TButton variant="dashed" @click="addKeyword">{{
              t("dataTools.textToColumns.addKeyword")
            }}</TButton>
            <TRadioGroup v-model="draft.keywordPosition" class="text-to-columns-dialog__inline"
              ><TRadio value="before">{{ t("dataTools.textToColumns.beforeKeyword") }}</TRadio
              ><TRadio value="after">{{
                t("dataTools.textToColumns.afterKeyword")
              }}</TRadio></TRadioGroup
            >
            <TCheckbox v-model="draft.keepKeywords">{{
              t("dataTools.textToColumns.keepKeywords")
            }}</TCheckbox>
          </div>
          <TFormItem
            v-else-if="draft.mode === 'fixed-width'"
            :label="t('dataTools.textToColumns.breakPosition')"
            :help="t('dataTools.textToColumns.breakPositionHint')"
            :status="widthsValid ? undefined : 'error'"
          >
            <div class="text-to-columns-dialog__break-position">
              <TInput
                v-model="breakPositionInput"
                :aria-label="t('dataTools.textToColumns.breakPosition')"
                placeholder="5"
                @enter="addBreakPosition"
              />
              <TButton theme="primary" variant="outline" @click="addBreakPosition">{{
                t("dataTools.textToColumns.createBreak")
              }}</TButton>
              <span v-if="widthsInput">{{
                t("dataTools.textToColumns.currentBreaks", { positions: widthsInput })
              }}</span>
            </div>
          </TFormItem>
        </template>
        <template v-else>
          <TFormItem :label="t('dataTools.textToColumns.columnFormat')">
            <div class="text-to-columns-dialog__format">
              <TSelect
                :value="draft.columnTypes[selectedColumn] ?? 'general'"
                :options="typeOptions"
                :aria-label="t('dataTools.textToColumns.columnFormat')"
                data-text-to-columns-column-type
                @change="setColumnType"
              /><span>{{
                t("dataTools.textToColumns.columnSelected", { column: selectedColumn + 1 })
              }}</span>
              <TSelect
                v-if="draft.columnTypes[selectedColumn] === 'date'"
                :value="draft.dateOrders?.[selectedColumn] ?? 'YMD'"
                :options="dateOrderOptions"
                :aria-label="t('dataTools.textToColumns.dateOrder')"
                @change="setDateOrder"
              />
            </div>
          </TFormItem>
          <TFormItem :label="t('dataTools.textToColumns.destination')"
            ><div class="text-to-columns-dialog__destination">
              <RangeReferenceInput
                v-model="draft.destination"
                :label="t('dataTools.textToColumns.destination')"
                :select-reference="selectReference"
              /><TCheckbox v-model="draft.overwrite">{{
                t("dataTools.textToColumns.overwrite")
              }}</TCheckbox>
            </div></TFormItem
          >
          <p class="text-to-columns-dialog__hint">{{ t("dataTools.textToColumns.formatHint") }}</p>
        </template>
      </TForm>
      <div class="text-to-columns-dialog__preview-section">
        <div class="text-to-columns-dialog__preview-heading">
          <strong>{{ t("dataTools.textToColumns.preview") }}</strong
          ><span>{{ t("dataTools.textToColumns.previewHint") }}</span>
        </div>
        <p v-if="previewError" class="text-to-columns-dialog__error">{{ previewError }}</p>
        <FixedWidthSplitEditor
          v-if="step === 0 && setupMode === 'custom' && draft.mode === 'fixed-width'"
          :rows="sourceRows"
          :widths="draft.fixedWidths"
          @change="changeWidths"
        />
        <div
          v-else
          class="text-to-columns-dialog__preview"
          :aria-label="t('dataTools.textToColumns.preview')"
        >
          <TableHeightWrapper v-slot="{ height }">
            <TTable
              class="idea-table--mini"
              row-key="row"
              :data="previewData"
              :columns="previewColumns"
              :height="height"
              :table-content-width="previewTableWidth"
              :bordered="false"
              cell-empty-content=""
              size="small"
              table-layout="fixed"
              hover
              :aria-label="t('dataTools.textToColumns.preview')"
            >
              <template #row="{ row }">{{ row.row + 1 }}</template>
              <template #previewColumnTitle="{ colIndex }">
                <TButton
                  v-if="step === 1"
                  variant="text"
                  :theme="selectedColumn === colIndex - 1 ? 'primary' : 'default'"
                  :aria-pressed="selectedColumn === colIndex - 1"
                  :data-split-column="colIndex - 1"
                  @click="selectedColumn = colIndex - 1"
                >
                  {{ t("dataTools.textToColumns.column", { column: colIndex }) }} ·
                  {{
                    typeOptions.find((type) => type.value === draft.columnTypes[colIndex - 1])
                      ?.label
                  }}
                </TButton>
                <span v-else>{{ t("dataTools.textToColumns.column", { column: colIndex }) }}</span>
              </template>
            </TTable>
          </TableHeightWrapper>
        </div>
      </div>
    </div>
    <template #footer
      ><TButton theme="default" @click="emit('close')">{{ t("dataTools.common.cancel") }}</TButton
      ><TButton v-if="step > 0" theme="default" data-split-previous @click="step -= 1">{{
        t("dataTools.textToColumns.previous")
      }}</TButton
      ><TButton
        theme="primary"
        :disabled="step < 1 ? !canNext : !canApply"
        data-split-next
        @click="confirm"
        >{{
          step < 1 ? t("dataTools.textToColumns.next") : t("dataTools.textToColumns.confirm")
        }}</TButton
      ></template
    >
  </Dialog>
</template>
<style scoped lang="scss">
.text-to-columns-dialog {
  display: grid;
  gap: 8px;
  min-width: 0;
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__suggestions,
  &__keywords {
    display: grid;
    gap: 8px;
    width: 100%;
  }
  &__auto-settings {
    display: grid;
    gap: 8px;
    padding-top: 8px;
  }
  &__setting {
    display: grid;
    gap: 8px;
  }
  &__mode-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-block: 8px;
  }
  &__keyword {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 8px;
  }
  &__break-position {
    display: grid;
    grid-template-columns: minmax(0, 120px) max-content;
    align-items: center;
    gap: 8px;
    width: 100%;
    span {
      grid-column: 1 / -1;
      color: var(--idea-text-secondary);
    }
  }
  &__error {
    margin: 0;
    color: var(--td-error-color);
  }
  &__delimiter-group {
    margin-bottom: 8px;
  }
  &__source,
  &__delimiter-group,
  &__destination {
    display: grid;
    gap: 8px;
    width: 100%;
  }
  &__inline {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  &__other {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    align-items: center;
    gap: 8px;
  }
  &__format {
    display: grid;
    grid-template-columns: 180px auto auto;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  &__preview-section {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  &__preview-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    span {
      color: var(--idea-text-secondary);
    }
  }
  &__preview {
    height: 220px;
    min-width: 0;
    min-height: 0;
    :deep(.text-to-columns-dialog__column--selected) {
      background: var(--idea-surface-active);
    }
    :deep(.text-to-columns-dialog__column--skipped) {
      color: var(--idea-text-secondary);
      text-decoration: line-through;
    }
  }
}
</style>
