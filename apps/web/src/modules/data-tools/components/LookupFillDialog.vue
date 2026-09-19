<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolColumn } from "../data-tools-types";
import type { LookupFillDraft } from "../lookup-fill-types";
import type { LookupFillPreview } from "@idea10/core/commands";
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
const { t } = useAppI18n();
const copy = (value: LookupFillDraft): LookupFillDraft => ({
  ...value,
  matchFields: value.matchFields.map((field) => ({ ...field })),
  fillFields: value.fillFields.map((field) => ({ ...field })),
});
const draft = ref(copy(props.initial));
const canApply = computed(() =>
  Boolean(
    draft.value.sourceRange.trim() &&
    draft.value.targetRange.trim() &&
    draft.value.matchFields.length &&
    draft.value.fillFields.length,
  ),
);
function same(left: LookupFillDraft, right: LookupFillDraft) {
  return (
    left.sourceRange === right.sourceRange &&
    left.targetRange === right.targetRange &&
    left.hasHeader === right.hasHeader &&
    left.matchMode === right.matchMode &&
    left.overwrite === right.overwrite &&
    JSON.stringify(left.matchFields) === JSON.stringify(right.matchFields) &&
    JSON.stringify(left.fillFields) === JSON.stringify(right.fillFields)
  );
}
function label(columns: readonly DataToolColumn[], index: number) {
  const item = columns[index];
  return item ? `${item.label}${item.header ? ` (${item.header})` : ""}` : "";
}
function add(kind: "matchFields" | "fillFields") {
  const source = props.sourceColumns[0]?.column,
    target = props.targetColumns[0]?.column;
  if (source === undefined || target === undefined) return;
  draft.value[kind].push({ sourceColumn: source, targetColumn: target });
}
function remove(kind: "matchFields" | "fillFields", index: number) {
  draft.value[kind].splice(index, 1);
}
watch(
  () => props.initial,
  (value) => {
    if (props.visible && !props.picking && !same(value, draft.value)) draft.value = copy(value);
  },
  { deep: true },
);
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) draft.value = copy(props.initial);
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
    width="min(640px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.lookupFill.apply'), disabled: busy || !canApply }"
    :cancel-btn="t('dataTools.common.cancel')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', copy(draft))"
    ><div class="lookup-fill-dialog">
      <label
        ><span>{{ t("dataTools.lookupFill.sourceRange") }}</span
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
      /></label>
      <label
        ><span>{{ t("dataTools.lookupFill.targetRange") }}</span
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
      /></label>
      <TCheckbox v-model="draft.hasHeader" :disabled="busy">{{
        t("dataTools.lookupFill.hasHeader")
      }}</TCheckbox>
      <section>
        <div class="lookup-fill-dialog__section">
          <span>{{ t("dataTools.lookupFill.matchFields") }}</span
          ><TButton size="small" variant="text" :disabled="busy" @click="add('matchFields')">{{
            t("dataTools.lookupFill.addField")
          }}</TButton>
        </div>
        <div
          v-for="(field, index) in draft.matchFields"
          :key="index"
          class="lookup-fill-dialog__mapping"
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
          ><span>→</span
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
            size="small"
            variant="text"
            :disabled="busy"
            @click="remove('matchFields', index)"
            >{{ t("dataTools.lookupFill.removeField") }}</TButton
          >
        </div>
      </section>
      <section>
        <div class="lookup-fill-dialog__section">
          <span>{{ t("dataTools.lookupFill.fillFields") }}</span
          ><TButton size="small" variant="text" :disabled="busy" @click="add('fillFields')">{{
            t("dataTools.lookupFill.addField")
          }}</TButton>
        </div>
        <div
          v-for="(field, index) in draft.fillFields"
          :key="index"
          class="lookup-fill-dialog__mapping"
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
          ><span>→</span
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
            size="small"
            variant="text"
            :disabled="busy"
            @click="remove('fillFields', index)"
            >{{ t("dataTools.lookupFill.removeField") }}</TButton
          >
        </div>
      </section>
      <div>
        <span>{{ t("dataTools.lookupFill.matchMode") }}</span
        ><TRadioGroup v-model="draft.matchMode" :disabled="busy"
          ><TRadio value="first">{{ t("dataTools.lookupFill.first") }}</TRadio
          ><TRadio value="last">{{ t("dataTools.lookupFill.last") }}</TRadio></TRadioGroup
        >
      </div>
      <TCheckbox v-model="draft.overwrite" :disabled="busy">{{
        t("dataTools.lookupFill.overwrite")
      }}</TCheckbox>
      <div v-if="preview" class="lookup-fill-dialog__preview">
        <p>
          {{
            t("dataTools.lookupFill.preview", {
              matched: preview.matchedRows,
              writes: preview.writeCount,
              skipped: preview.skippedExistingCount,
            })
          }}
        </p>
        <ul v-if="preview.changes.length">
          <li v-for="change in preview.changes" :key="`${change.row}:${change.column}`">
            {{
              t("dataTools.lookupFill.previewRow", {
                source: change.sourceRow + 1,
                target: change.row + 1,
                column: change.column + 1,
                value: change.value,
              })
            }}
          </li>
        </ul>
      </div>
      <p v-if="error" role="alert" class="lookup-fill-dialog__error">{{ error }}</p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.lookup-fill-dialog {
  display: grid;
  gap: var(--idea-space-3);
}
label {
  display: grid;
  gap: var(--idea-space-1);
}
section {
  display: grid;
  gap: var(--idea-space-2);
}
.lookup-fill-dialog__section {
  display: flex;
  justify-content: space-between;
}
.lookup-fill-dialog__mapping {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: var(--idea-space-2);
  align-items: center;
}
.lookup-fill-dialog__preview {
  color: var(--idea-text-secondary);
}
.lookup-fill-dialog__error {
  color: var(--td-error-color);
}
</style>
