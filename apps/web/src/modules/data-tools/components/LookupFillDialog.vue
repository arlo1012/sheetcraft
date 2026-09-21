<script setup lang="ts">
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { Steps as TSteps, StepItem as TStepItem } from "tdesign-vue-next/es/steps";
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
const copy = (value: LookupFillDraft): LookupFillDraft => ({
  ...value,
  matchFields: value.matchFields.map((field) => ({ ...field })),
  fillFields: value.fillFields.map((field) => ({ ...field })),
});
const draft = ref(copy(props.initial));
const same = (left: LookupFillDraft, right: LookupFillDraft) =>
  JSON.stringify(left) === JSON.stringify(right);
const label = (columns: readonly DataToolColumn[], index: number) => {
  const item = columns.find((column) => column.column === index);
  return item ? `${item.label}${item.header ? ` (${item.header})` : ""}` : "";
};
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
    if (rangesReady.value) step.value = "fields";
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
  [() => props.sourceColumns, () => props.targetColumns],
  () => {
    if (!rangesReady.value || draft.value.matchFields.length) return;
    const field = defaultField();
    if (field) {
      draft.value.matchFields.push(field);
    }
  },
  { deep: true, immediate: true },
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
    width="min(640px, calc(100vw - 32px))"
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
      <TForm
        v-else-if="step === 'fields'"
        :data="draft"
        label-align="right"
        :label-width="locale === 'zh-CN' ? 88 : 116"
      >
        <TFormItem name="matchFields" :label="t('dataTools.lookupFill.matchFields')">
          <section class="lookup-fill-dialog__mapping-panel">
            <div class="lookup-fill-dialog__mapping-head">
              <span>{{ t("dataTools.lookupFill.sourceColumn") }}</span
              ><span>{{ t("dataTools.lookupFill.targetColumn") }}</span
              ><span aria-hidden="true" />
            </div>
            <p v-if="!draft.matchFields.length" class="lookup-fill-dialog__empty">
              {{ t("dataTools.lookupFill.noMatchFields") }}
            </p>
            <div
              v-for="(field, index) in draft.matchFields"
              :key="`match-${index}`"
              class="lookup-fill-dialog__mapping-row"
            >
              <TSelect
                v-model="field.sourceColumn"
                :aria-label="t('dataTools.lookupFill.sourceField')"
                :disabled="busy"
                ><TOption
                  v-for="item in sourceColumns"
                  :key="item.column"
                  :value="item.column"
                  :label="label(sourceColumns, item.column)" /></TSelect
              ><TSelect
                v-model="field.targetColumn"
                :aria-label="t('dataTools.lookupFill.targetField')"
                :disabled="busy"
                ><TOption
                  v-for="item in targetColumns"
                  :key="item.column"
                  :value="item.column"
                  :label="label(targetColumns, item.column)" /></TSelect
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="t('dataTools.lookupFill.removeField')"
                @click="remove('matchFields', index)"
                ><template #icon><Trash2 :size="16" /></template
              ></TButton>
            </div>
            <TButton variant="text" size="small" :disabled="busy" @click="add('matchFields')"
              ><template #icon><Plus :size="15" /></template
              >{{ t("dataTools.lookupFill.addField") }}</TButton
            >
          </section>
        </TFormItem>
        <TFormItem name="fillFields" :label="t('dataTools.lookupFill.fillFields')">
          <section class="lookup-fill-dialog__mapping-panel">
            <div class="lookup-fill-dialog__mapping-actions">
              <TButton variant="text" size="small" :disabled="busy" @click="matchRemainingFields">{{
                t("dataTools.lookupFill.matchSameHeaders")
              }}</TButton>
            </div>
            <div class="lookup-fill-dialog__mapping-head">
              <span>{{ t("dataTools.lookupFill.sourceColumn") }}</span
              ><span>{{ t("dataTools.lookupFill.targetColumn") }}</span
              ><span aria-hidden="true" />
            </div>
            <p v-if="!draft.fillFields.length" class="lookup-fill-dialog__empty">
              {{ t("dataTools.lookupFill.noFillFields") }}
            </p>
            <div
              v-for="(field, index) in draft.fillFields"
              :key="`fill-${index}`"
              class="lookup-fill-dialog__mapping-row"
            >
              <TSelect
                v-model="field.sourceColumn"
                :aria-label="t('dataTools.lookupFill.sourceField')"
                :disabled="busy"
                ><TOption
                  v-for="item in sourceColumns"
                  :key="item.column"
                  :value="item.column"
                  :label="label(sourceColumns, item.column)" /></TSelect
              ><TSelect
                v-model="field.targetColumn"
                :aria-label="t('dataTools.lookupFill.targetField')"
                :disabled="busy"
                ><TOption
                  v-for="item in targetColumns"
                  :key="item.column"
                  :value="item.column"
                  :label="label(targetColumns, item.column)" /></TSelect
              ><TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="t('dataTools.lookupFill.removeField')"
                @click="remove('fillFields', index)"
                ><template #icon><Trash2 :size="16" /></template
              ></TButton>
            </div>
            <TButton variant="text" size="small" :disabled="busy" @click="add('fillFields')"
              ><template #icon><Plus :size="15" /></template
              >{{ t("dataTools.lookupFill.addField") }}</TButton
            >
          </section>
        </TFormItem>
        <TFormItem name="matchMode" :label="t('dataTools.lookupFill.matchMode')"
          ><TRadioGroup v-model="draft.matchMode" :disabled="busy"
            ><TRadio value="first">{{ t("dataTools.lookupFill.first") }}</TRadio
            ><TRadio value="last">{{ t("dataTools.lookupFill.last") }}</TRadio></TRadioGroup
          ></TFormItem
        >
        <TFormItem name="overwrite" :label="t('dataTools.lookupFill.overwrite')"
          ><TCheckbox v-model="draft.overwrite" :disabled="busy">{{
            t("dataTools.lookupFill.overwriteExisting")
          }}</TCheckbox></TFormItem
        >
        <p v-if="invalidMappings || !fieldsReady" class="lookup-fill-dialog__notice" role="alert">
          {{
            invalidMappings
              ? t("dataTools.lookupFill.invalidMappings")
              : t("dataTools.lookupFill.completeMappings")
          }}
        </p>
      </TForm>
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
        ><TButton v-if="step !== 'ranges'" theme="default" :disabled="busy" @click="back"
          ><template #icon><ArrowLeft :size="16" /></template
          >{{ t("dataTools.lookupFill.back") }}</TButton
        ><TButton
          v-if="step !== 'preview'"
          theme="primary"
          :disabled="busy || (step === 'ranges' ? !rangesReady : !fieldsReady)"
          @click="next"
          >{{ t("dataTools.lookupFill.next")
          }}<template #suffix><ArrowRight :size="16" /></template></TButton
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
.lookup-fill-dialog__mapping-panel {
  display: grid;
  gap: var(--idea-space-2);
  width: 100%;
  padding: var(--idea-space-3);
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-medium);
  background: var(--idea-surface-secondary);
}
.lookup-fill-dialog__mapping-head,
.lookup-fill-dialog__mapping-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px;
  gap: var(--idea-space-2);
  align-items: center;
}
.lookup-fill-dialog__mapping-head {
  color: var(--idea-text-secondary);
  font-size: var(--idea-font-size-body-small);
}
.lookup-fill-dialog__mapping-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
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
