<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Steps as TSteps, StepItem as TStepItem } from "tdesign-vue-next/es/steps";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import FixedWidthSplitEditor from "./FixedWidthSplitEditor.vue";
import type { TextToColumnsDraft } from "../data-tools-types";

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
    selectReference?: (current: string) => Promise<string | undefined>;
  }>(),
  {
    preview: () => [],
    totalColumnCount: 0,
    previewRows: () => [],
    sourceRows: () => [],
    rangeLabel: "",
    destinationLabel: "",
    picking: false,
  },
);
const emit = defineEmits<{
  close: [];
  apply: [draft: TextToColumnsDraft];
  draftChange: [draft: TextToColumnsDraft];
}>();
const { t } = useAppI18n();
const step = ref(0);
const selectedColumn = ref(0);
const widthsInput = ref("");
const otherEnabled = ref(false);
const defaultDraft = (): TextToColumnsDraft => ({
  mode: "delimiter",
  delimiters: [","],
  otherDelimiter: "",
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
  textQualifier: '"',
  mergeDelimiters: false,
  destination: props.destinationLabel,
  overwrite: false,
});
const draft = ref(defaultDraft());
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
const delimiterOptions = computed(() => [
  { value: "\t", label: t("dataTools.textToColumns.tab") },
  { value: ";", label: t("dataTools.textToColumns.semicolon") },
  { value: ",", label: t("dataTools.textToColumns.comma") },
  { value: " ", label: t("dataTools.textToColumns.space") },
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
const widthsValid = computed(
  () => !widthsInput.value.trim() || /^\s*[1-9]\d*(\s*,\s*[1-9]\d*)*\s*$/.test(widthsInput.value),
);
const canNext = computed(
  () =>
    step.value === 0 ||
    (draft.value.mode === "delimiter"
      ? Boolean(draft.value.delimiters.length || draft.value.otherDelimiter)
      : widthsValid.value && draft.value.fixedWidths.length > 0),
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
  };
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    step.value = 0;
    selectedColumn.value = 0;
    widthsInput.value = "";
    otherEnabled.value = false;
    draft.value = defaultDraft();
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
function toggleDelimiter(delimiter: string, checked: boolean): void {
  draft.value.delimiters = checked
    ? [...new Set([...draft.value.delimiters, delimiter])]
    : draft.value.delimiters.filter((item) => item !== delimiter);
}
function setWidths(value: string | number): void {
  widthsInput.value = String(value);
  if (widthsValid.value)
    draft.value.fixedWidths = widthsInput.value.trim()
      ? widthsInput.value.split(",").map(Number)
      : [];
}
function changeWidths(widths: number[]): void {
  draft.value.fixedWidths = widths;
  widthsInput.value = widths.join(",");
}
function setColumnType(value: unknown): void {
  if (value === "general" || value === "text" || value === "date" || value === "skip")
    draft.value.columnTypes[selectedColumn.value] = value;
}
function confirm(): void {
  if (step.value < 2) {
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
      <TSteps :current="step" readonly theme="dot">
        <TStepItem :title="t('dataTools.textToColumns.stepType')" />
        <TStepItem :title="t('dataTools.textToColumns.stepSplit')" />
        <TStepItem :title="t('dataTools.textToColumns.stepOutput')" />
      </TSteps>
      <p class="text-to-columns-dialog__summary">
        {{ t("dataTools.textToColumns.source") }}：{{ rangeLabel || destinationLabel }}
      </p>
      <TForm label-align="left" :label-width="104" @submit.prevent>
        <template v-if="step === 0">
          <TFormItem :label="t('dataTools.textToColumns.stepType')">
            <TRadioGroup v-model="draft.mode" class="text-to-columns-dialog__modes">
              <div>
                <TRadio value="delimiter">{{ t("dataTools.textToColumns.delimiter") }}</TRadio>
                <p>{{ t("dataTools.textToColumns.delimiterHint") }}</p>
              </div>
              <div>
                <TRadio value="fixed-width">{{ t("dataTools.textToColumns.fixedWidth") }}</TRadio>
                <p>{{ t("dataTools.textToColumns.widthHint") }}</p>
              </div>
            </TRadioGroup>
          </TFormItem>
        </template>
        <template v-else-if="step === 1">
          <template v-if="draft.mode === 'delimiter'">
            <TFormItem :label="t('dataTools.textToColumns.delimiter')">
              <div class="text-to-columns-dialog__delimiter-group">
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
                </div>
                <TCheckbox v-model="draft.mergeDelimiters">{{
                  t("dataTools.textToColumns.mergeDelimiters")
                }}</TCheckbox>
              </div>
            </TFormItem>
            <TFormItem :label="t('dataTools.textToColumns.qualifier')"
              ><TSelect
                v-model="draft.textQualifier"
                :options="qualifierOptions"
                :aria-label="t('dataTools.textToColumns.qualifier')"
            /></TFormItem>
          </template>
          <TFormItem
            v-else
            :label="t('dataTools.textToColumns.widths')"
            :help="t('dataTools.textToColumns.widthsHint')"
            :status="widthsValid ? undefined : 'error'"
          >
            <TInput
              :value="widthsInput"
              :aria-label="t('dataTools.textToColumns.widths')"
              placeholder="5,8,4"
              @change="setWidths"
            />
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
      <div class="text-to-columns-dialog__preview-heading">
        <strong>{{ t("dataTools.textToColumns.preview") }}</strong
        ><span>{{ t("dataTools.textToColumns.previewHint") }}</span>
      </div>
      <FixedWidthSplitEditor
        v-if="step === 1 && draft.mode === 'fixed-width'"
        :rows="sourceRows"
        :widths="draft.fixedWidths"
        @change="changeWidths"
      />
      <div
        v-else
        class="text-to-columns-dialog__preview"
        :aria-label="t('dataTools.textToColumns.preview')"
      >
        <table v-if="step === 0">
          <thead>
            <tr>
              <th>{{ t("dataTools.textToColumns.row") }}</th>
              <th>{{ t("dataTools.textToColumns.source") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sourceRows" :key="row.row">
              <th>{{ row.row + 1 }}</th>
              <td>{{ row.text }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else>
          <thead>
            <tr>
              <th>{{ t("dataTools.textToColumns.row") }}</th>
              <th
                v-for="(_, index) in columnCount"
                :key="index"
                :class="{ 'is-selected': step === 2 && selectedColumn === index }"
              >
                <button
                  v-if="step === 2"
                  type="button"
                  :aria-pressed="selectedColumn === index"
                  :data-split-column="index"
                  @click="selectedColumn = index"
                >
                  {{ t("dataTools.textToColumns.column", { column: index + 1 }) }} ·
                  {{
                    typeOptions.find((type) => type.value === draft.columnTypes[index])?.label
                  }}</button
                ><span v-else>{{
                  t("dataTools.textToColumns.column", { column: index + 1 })
                }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.row">
              <th>{{ row.row + 1 }}</th>
              <td
                v-for="(_, index) in columnCount"
                :key="index"
                :class="{
                  'is-selected': step === 2 && selectedColumn === index,
                  'is-skipped': step === 2 && draft.columnTypes[index] === 'skip',
                }"
              >
                {{ row.values[index] ?? "" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer
      ><TButton theme="default" @click="emit('close')">{{ t("dataTools.common.cancel") }}</TButton
      ><TButton v-if="step > 0" theme="default" data-split-previous @click="step -= 1">{{
        t("dataTools.textToColumns.previous")
      }}</TButton
      ><TButton
        theme="primary"
        :disabled="step < 2 ? !canNext : !canApply"
        data-split-next
        @click="confirm"
        >{{
          step < 2 ? t("dataTools.textToColumns.next") : t("dataTools.textToColumns.confirm")
        }}</TButton
      ></template
    >
  </Dialog>
</template>
<style scoped lang="scss">
.text-to-columns-dialog {
  display: grid;
  gap: 12px;
  min-width: 0;
  &__summary,
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__modes {
    display: grid;
    gap: 12px;
    p {
      margin: 2px 0 0 24px;
      color: var(--idea-text-secondary);
    }
  }
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
    grid-template-columns: auto 100px;
    align-items: center;
    gap: 8px;
  }
  &__format {
    display: grid;
    grid-template-columns: 180px auto;
    align-items: center;
    gap: 12px;
    width: 100%;
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
    overflow: auto;
    height: 220px;
    border: 1px solid var(--idea-border-subtle);
    table {
      border-collapse: separate;
      border-spacing: 0;
      min-width: 100%;
    }
    th,
    td {
      padding: 4px 8px;
      min-width: 110px;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-right: 1px solid var(--idea-border-subtle);
      border-bottom: 1px solid var(--idea-border-subtle);
      text-align: left;
    }
    th {
      font-weight: 400;
      background: var(--idea-surface-secondary);
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
    }
    th:first-child {
      min-width: 40px;
      width: 40px;
    }
    button {
      font: inherit;
      background: transparent;
      border: 0;
      padding: 0;
      color: inherit;
      cursor: pointer;
      width: 100%;
      text-align: left;
    }
    .is-selected {
      background: var(--idea-surface-active);
    }
    .is-skipped {
      color: var(--idea-text-secondary);
      text-decoration: line-through;
    }
  }
}
</style>
