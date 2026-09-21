<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Steps as TSteps, StepItem as TStepItem } from "tdesign-vue-next/es/steps";
import LookupFieldMappingTable from "./LookupFieldMappingTable.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { LookupFillPreview } from "@idea10/core/commands";
import type { DataToolColumn } from "../data-tools-types";
import type { LookupFillDraft, LookupFillFieldDraft } from "../lookup-fill-types";

type Step = "ranges" | "fields" | "preview";
type MappingKind = "matchFields" | "fillFields";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: LookupFillDraft;
    error?: string;
    preview?: LookupFillPreview;
    sourceColumns: readonly DataToolColumn[];
    targetColumns: readonly DataToolColumn[];
    busy?: boolean;
    picking?: boolean;
  }>(),
  { error: "", busy: false, picking: false },
);
const emit = defineEmits<{
  close: [];
  apply: [draft: LookupFillDraft];
  draftChange: [draft: LookupFillDraft];
  pickRange: [field: "sourceRange" | "targetRange"];
}>();
const { t, locale } = useAppI18n();
const step = ref<Step>("ranges");
const fieldDefaultsApplied = ref(false);
const copy = (value: LookupFillDraft): LookupFillDraft => ({
  ...value,
  matchFields: value.matchFields.map((field) => ({ ...field })),
  fillFields: value.fillFields.map((field) => ({ ...field })),
});
const draft = ref(copy(props.initial));
const same = (left: LookupFillDraft, right: LookupFillDraft) =>
  JSON.stringify(left) === JSON.stringify(right);
const validField = (field: LookupFillFieldDraft) =>
  props.sourceColumns.some((item) => item.column === field.sourceColumn) &&
  props.targetColumns.some((item) => item.column === field.targetColumn);
const rangesReady = computed(
  () =>
    Boolean(draft.value.sourceRange.trim() && draft.value.targetRange.trim()) &&
    props.sourceColumns.length > 0 &&
    props.targetColumns.length > 0,
);
const invalidMappings = computed(
  () =>
    [...draft.value.matchFields, ...draft.value.fillFields].some((field) => !validField(field)) ||
    new Set(draft.value.fillFields.map((field) => field.targetColumn)).size !==
      draft.value.fillFields.length,
);
const fieldsReady = computed(
  () =>
    rangesReady.value &&
    !invalidMappings.value &&
    draft.value.matchFields.length > 0 &&
    draft.value.fillFields.length > 0,
);
const canApply = computed(() => fieldsReady.value && (props.preview?.writeCount ?? 0) > 0);
const previewChanges = computed(() => props.preview?.changes ?? []);
const unmatchedRows = computed(() =>
  Math.max(0, (props.preview?.targetRows ?? 0) - (props.preview?.matchedRows ?? 0)),
);
const stepIndex = computed(() => ["ranges", "fields", "preview"].indexOf(step.value));
function defaultField(): LookupFillFieldDraft | undefined {
  const source = props.sourceColumns[0]?.column,
    target = props.targetColumns[0]?.column;
  return source === undefined || target === undefined
    ? undefined
    : { sourceColumn: source, targetColumn: target };
}
function add(kind: MappingKind): void {
  const field = defaultField();
  if (!field || props.busy) return;
  draft.value[kind].push(field);
}
function changeField(kind: MappingKind, index: number, field: LookupFillFieldDraft): void {
  if (!props.busy && draft.value[kind][index]) draft.value[kind][index] = { ...field };
}
function clearFields(kind: MappingKind): void {
  if (!props.busy) draft.value[kind] = [];
}
function remove(kind: MappingKind, index: number): void {
  if (props.busy) return;
  draft.value[kind].splice(index, 1);
}
function matchRemainingFields(): void {
  if (props.busy) return;
  const unique = (columns: readonly DataToolColumn[]) => {
    const groups = new Map<string, DataToolColumn[]>();
    for (const column of columns) {
      const header = column.header?.trim();
      if (header) groups.set(header, [...(groups.get(header) ?? []), column]);
    }
    return new Map([...groups].filter(([, values]) => values.length === 1));
  };
  const source = unique(props.sourceColumns),
    target = unique(props.targetColumns);
  const usedSource = new Set([
    ...draft.value.matchFields.map((field) => field.sourceColumn),
    ...draft.value.fillFields.map((field) => field.sourceColumn),
  ]);
  const usedTarget = new Set([
    ...draft.value.matchFields.map((field) => field.targetColumn),
    ...draft.value.fillFields.map((field) => field.targetColumn),
  ]);
  for (const [header, sourceItems] of source) {
    const sourceItem = sourceItems[0]!,
      targetItem = target.get(header)?.[0];
    if (!targetItem || usedSource.has(sourceItem.column) || usedTarget.has(targetItem.column))
      continue;
    draft.value.fillFields.push({
      sourceColumn: sourceItem.column,
      targetColumn: targetItem.column,
    });
    usedSource.add(sourceItem.column);
    usedTarget.add(targetItem.column);
  }
}
function next(): void {
  if (step.value === "ranges") {
    if (!rangesReady.value) return;
    if (!fieldDefaultsApplied.value) {
      if (!draft.value.matchFields.length) {
        const field = defaultField();
        if (field) draft.value.matchFields.push(field);
      }
      if (draft.value.hasHeader && !draft.value.fillFields.length) matchRemainingFields();
      fieldDefaultsApplied.value = true;
    }
    step.value = "fields";
  } else if (step.value === "fields" && fieldsReady.value) step.value = "preview";
}
function back(): void {
  if (step.value === "preview") step.value = "fields";
  else if (step.value === "fields") step.value = "ranges";
}
function apply(): void {
  if (!props.busy && canApply.value) emit("apply", copy(draft.value));
}
function reset(value: LookupFillDraft): void {
  draft.value = copy(value);
  step.value = "ranges";
  fieldDefaultsApplied.value = false;
}
watch(
  () => props.initial,
  (value) => {
    if (props.visible && !props.picking && !same(value, draft.value)) reset(value);
  },
  { deep: true },
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) reset(props.initial);
  },
);
watch(
  draft,
  (value) => {
    if (!same(value, props.initial)) emit("draftChange", copy(value));
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    :visible="visible && !picking"
    :header="t('dataTools.lookupFill.title')"
    :width="step === 'fields' ? 'min(860px, calc(100vw - 32px))' : 'min(640px, calc(100vw - 32px))'"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <div class="lookup-fill-dialog">
      <TSteps
        :current="stepIndex"
        readonly
        theme="dot"
        :aria-label="t('dataTools.lookupFill.steps')"
        ><TStepItem :title="t('dataTools.lookupFill.stepRanges')" /><TStepItem
          :title="t('dataTools.lookupFill.stepFields')" /><TStepItem
          :title="t('dataTools.lookupFill.stepPreview')"
      /></TSteps>
      <TForm
        v-if="step === 'ranges'"
        :data="draft"
        label-align="right"
        :label-width="locale === 'zh-CN' ? 88 : 116"
      >
        <TFormItem name="sourceRange" :label="t('dataTools.lookupFill.sourceRange')"
          ><RangeReferenceInput
            v-model="draft.sourceRange"
            :label="t('dataTools.lookupFill.sourceRange')"
            :disabled="busy"
            :select-reference="
              async () => {
                emit('pickRange', 'sourceRange');
                return undefined;
              }
            "
        /></TFormItem>
        <TFormItem name="targetRange" :label="t('dataTools.lookupFill.targetRange')"
          ><RangeReferenceInput
            v-model="draft.targetRange"
            :label="t('dataTools.lookupFill.targetRange')"
            :disabled="busy"
            :select-reference="
              async () => {
                emit('pickRange', 'targetRange');
                return undefined;
              }
            "
        /></TFormItem>
        <TFormItem
          ><TCheckbox v-model="draft.hasHeader" :disabled="busy">{{
            t("dataTools.lookupFill.hasHeader")
          }}</TCheckbox></TFormItem
        >
        <p
          v-if="!rangesReady && (draft.sourceRange || draft.targetRange)"
          class="lookup-fill-dialog__notice"
          role="alert"
        >
          {{ t("dataTools.lookupFill.invalidRange") }}
        </p>
      </TForm>
      <div v-else-if="step === 'fields'" class="lookup-fill-dialog__fields">
        <div class="lookup-fill-dialog__tables">
          <LookupFieldMappingTable
            :title="t('dataTools.lookupFill.matchFields')"
            :empty="t('dataTools.lookupFill.noMatchFields')"
            :fields="draft.matchFields"
            :source-columns="sourceColumns"
            :target-columns="targetColumns"
            :busy="busy"
            @add="add('matchFields')"
            @clear="clearFields('matchFields')"
            @remove="remove('matchFields', $event)"
            @change="(index, field) => changeField('matchFields', index, field)"
          />
          <LookupFieldMappingTable
            :title="t('dataTools.lookupFill.fillFields')"
            :empty="t('dataTools.lookupFill.noFillFields')"
            :fields="draft.fillFields"
            :source-columns="sourceColumns"
            :target-columns="targetColumns"
            :busy="busy"
            @add="add('fillFields')"
            @clear="clearFields('fillFields')"
            @remove="remove('fillFields', $event)"
            @change="(index, field) => changeField('fillFields', index, field)"
          >
            <template #actions>
              <TButton variant="outline" :disabled="busy" @click="matchRemainingFields">{{
                t("dataTools.lookupFill.matchSameHeaders")
              }}</TButton>
            </template>
          </LookupFieldMappingTable>
        </div>
        <div class="lookup-fill-dialog__options">
          <div class="lookup-fill-dialog__match-mode">
            <span>{{ t("dataTools.lookupFill.matchMode") }}</span>
            <TRadioGroup
              v-model="draft.matchMode"
              :disabled="busy"
              :aria-label="t('dataTools.lookupFill.matchMode')"
            >
              <TRadio value="first">{{ t("dataTools.lookupFill.first") }}</TRadio>
              <TRadio value="last">{{ t("dataTools.lookupFill.last") }}</TRadio>
            </TRadioGroup>
          </div>
          <TCheckbox v-model="draft.overwrite" :disabled="busy">{{
            t("dataTools.lookupFill.overwriteExisting")
          }}</TCheckbox>
        </div>
        <p v-if="invalidMappings || !fieldsReady" class="lookup-fill-dialog__notice" role="alert">
          {{
            invalidMappings
              ? t("dataTools.lookupFill.invalidMappings")
              : t("dataTools.lookupFill.completeMappings")
          }}
        </p>
      </div>
      <section
        v-else
        class="lookup-fill-dialog__preview"
        :aria-label="t('dataTools.lookupFill.preview')"
      >
        <div class="lookup-fill-dialog__summary">
          <div>
            <strong>{{ preview?.matchedRows ?? 0 }}</strong
            ><span>{{ t("dataTools.lookupFill.matchedRows") }}</span>
          </div>
          <div>
            <strong>{{ unmatchedRows }}</strong
            ><span>{{ t("dataTools.lookupFill.unmatchedRows") }}</span>
          </div>
          <div>
            <strong>{{ preview?.writeCount ?? 0 }}</strong
            ><span>{{ t("dataTools.lookupFill.writeCount") }}</span>
          </div>
          <div>
            <strong>{{ preview?.skippedExistingCount ?? 0 }}</strong
            ><span>{{ t("dataTools.lookupFill.skippedCount") }}</span>
          </div>
        </div>
        <p v-if="!previewChanges.length && !error" class="lookup-fill-dialog__empty">
          {{ t("dataTools.lookupFill.noPreviewChanges") }}
        </p>
        <div v-else class="lookup-fill-dialog__sample">
          <table>
            <thead>
              <tr>
                <th>{{ t("dataTools.lookupFill.previewSourceRow") }}</th>
                <th>{{ t("dataTools.lookupFill.previewTargetRow") }}</th>
                <th>{{ t("dataTools.lookupFill.previewColumn") }}</th>
                <th>{{ t("dataTools.lookupFill.previewValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="change in previewChanges" :key="`${change.row}:${change.column}`">
                <td>{{ change.sourceRow + 1 }}</td>
                <td>{{ change.row + 1 }}</td>
                <td>{{ change.column + 1 }}</td>
                <td>{{ change.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="preview && preview.writeCount === 0 && !error"
          class="lookup-fill-dialog__notice"
          role="alert"
        >
          {{ t("dataTools.lookupFill.noChanges") }}
        </p>
      </section>
      <p v-if="error" role="alert" class="lookup-fill-dialog__error">
        {{ error }}
      </p>
    </div>
    <template #footer
      ><div class="lookup-fill-dialog__footer">
        <TButton theme="default" :disabled="busy" @click="emit('close')">{{
          t("dataTools.common.cancel")
        }}</TButton
        ><TButton v-if="step !== 'ranges'" theme="default" :disabled="busy" @click="back">{{
          t("dataTools.lookupFill.back")
        }}</TButton
        ><TButton
          v-if="step !== 'preview'"
          theme="primary"
          :disabled="busy || (step === 'ranges' ? !rangesReady : !fieldsReady)"
          @click="next"
          >{{ t("dataTools.lookupFill.next") }}</TButton
        ><TButton v-else theme="primary" :disabled="busy || !canApply" @click="apply">{{
          t("dataTools.lookupFill.apply")
        }}</TButton>
      </div></template
    >
  </Dialog>
</template>

<style scoped lang="scss">
.lookup-fill-dialog {
  display: grid;
  gap: var(--idea-space-5);
}
.lookup-fill-dialog__fields {
  display: grid;
  gap: 12px;
}
.lookup-fill-dialog__tables {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.lookup-fill-dialog__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.lookup-fill-dialog__match-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
@media (max-width: 680px) {
  .lookup-fill-dialog__tables {
    grid-template-columns: minmax(0, 1fr);
  }
}
.lookup-fill-dialog__notice,
.lookup-fill-dialog__empty,
.lookup-fill-dialog__error {
  margin: 0;
  font-size: var(--idea-font-size-body-small);
  line-height: var(--idea-line-height-body-small);
}
.lookup-fill-dialog__notice,
.lookup-fill-dialog__empty {
  color: var(--idea-text-secondary);
}
.lookup-fill-dialog__empty {
  padding-block: var(--idea-space-2);
}
.lookup-fill-dialog__error {
  color: var(--td-error-color);
}
.lookup-fill-dialog__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-medium);
  overflow: hidden;
}
.lookup-fill-dialog__summary div {
  display: grid;
  gap: var(--idea-space-1);
  padding: var(--idea-space-3);
  border-right: 1px solid var(--idea-border-control);
}
.lookup-fill-dialog__summary div:last-child {
  border-right: 0;
}
.lookup-fill-dialog__summary strong {
  font-size: var(--idea-font-size-title-medium);
  line-height: var(--idea-line-height-title-medium);
}
.lookup-fill-dialog__summary span {
  color: var(--idea-text-secondary);
  font-size: var(--idea-font-size-body-small);
}
.lookup-fill-dialog__sample {
  max-height: 192px;
  overflow: auto;
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-medium);
}
.lookup-fill-dialog__sample table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--idea-font-size-body-small);
}
.lookup-fill-dialog__sample th,
.lookup-fill-dialog__sample td {
  padding: var(--idea-space-2) var(--idea-space-3);
  border-bottom: 1px solid var(--idea-border-control);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lookup-fill-dialog__sample th {
  position: sticky;
  top: 0;
  background: var(--idea-surface-secondary);
  color: var(--idea-text-secondary);
  font-weight: var(--idea-font-weight-medium);
}
.lookup-fill-dialog__sample tbody tr:last-child td {
  border-bottom: 0;
}
.lookup-fill-dialog__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--idea-space-2);
}
@media (max-width: 520px) {
  .lookup-fill-dialog__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lookup-fill-dialog__summary div:nth-child(2) {
    border-right: 0;
  }
  .lookup-fill-dialog__summary div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--idea-border-control);
  }
}
</style>
