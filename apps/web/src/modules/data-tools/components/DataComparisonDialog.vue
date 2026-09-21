<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolColumn } from "../data-tools-types";
import type { DataComparisonAction, DataComparisonDraft } from "../data-comparison-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    action: DataComparisonAction;
    initial: DataComparisonDraft;
    columns: readonly DataToolColumn[];
    error?: string;
    busy?: boolean;
    picking?: boolean | "firstRange" | "secondRange";
  }>(),
  { error: "", busy: false, picking: undefined },
);
const emit = defineEmits<{
  apply: [draft: DataComparisonDraft];
  close: [];
  draftChange: [draft: DataComparisonDraft];
  pickRange: [field: "firstRange" | "secondRange"];
}>();
const { t, locale } = useAppI18n();
const draft = ref<DataComparisonDraft>(copyDraft(props.initial));
const colors = [
  { value: "#ffc7ce", label: "lightRed" },
  { value: "#ffeb9c", label: "yellow" },
  { value: "#c6efce", label: "green" },
] as const;
const isMarking = computed(() => props.action === "markDuplicate" || props.action === "markUnique");
const title = computed(() => t(`dataTools.comparison.${props.action}Title`));
const selectedCount = computed(
  () => props.columns.filter((column) => draft.value.columns.includes(column.column)).length,
);
const allSelected = computed(
  () => props.columns.length > 0 && selectedCount.value === props.columns.length,
);
const partlySelected = computed(() => selectedCount.value > 0 && !allSelected.value);
const canApply = computed(
  () =>
    Boolean(draft.value.firstRange.trim()) &&
    (draft.value.scope === "single" || Boolean(draft.value.secondRange.trim())) &&
    (draft.value.comparisonMode === "cells" || draft.value.columns.length > 0),
);

function copyDraft(value: DataComparisonDraft): DataComparisonDraft {
  return { ...value, columns: [...value.columns] };
}
function draftsMatch(left: DataComparisonDraft, right: DataComparisonDraft): boolean {
  return (
    left.scope === right.scope &&
    left.firstRange === right.firstRange &&
    left.secondRange === right.secondRange &&
    left.comparisonMode === right.comparisonMode &&
    left.hasHeader === right.hasHeader &&
    left.side === right.side &&
    left.fillColor === right.fillColor &&
    left.columns.length === right.columns.length &&
    left.columns.every((column, index) => column === right.columns[index])
  );
}
function toggle(column: number, checked: boolean): void {
  draft.value.columns = checked
    ? [...draft.value.columns, column]
    : draft.value.columns.filter((item) => item !== column);
}
function toggleAll(checked: boolean): void {
  draft.value.columns = checked ? props.columns.map((column) => column.column) : [];
}
function invertSelection(): void {
  const selected = new Set(draft.value.columns);
  draft.value.columns = props.columns
    .filter((column) => !selected.has(column.column))
    .map((column) => column.column);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) draft.value = copyDraft(props.initial);
  },
);
watch(
  () => props.initial,
  (initial) => {
    if (props.visible && !props.picking) draft.value = copyDraft(initial);
  },
  { deep: true },
);
watch(
  () => props.picking,
  (picking, previous) => {
    if (!picking && previous && props.visible) draft.value = copyDraft(props.initial);
  },
);
watch(
  draft,
  (value) => {
    if (!draftsMatch(value, props.initial)) emit("draftChange", copyDraft(value));
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    width="min(500px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="title"
    :confirm-btn="{
      content: t('dataTools.comparison.apply'),
      disabled: busy || !canApply,
    }"
    :cancel-btn="t('dataTools.common.cancel')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', copyDraft(draft))"
  >
    <div class="data-comparison-dialog">
      <TForm :data="draft" label-align="right" :label-width="locale === 'zh-CN' ? 88 : 104">
        <TFormItem name="scope">
          <TRadioGroup v-model="draft.scope" :disabled="busy">
            <TRadio value="single">{{ t("dataTools.comparison.singleRange") }}</TRadio>
            <TRadio value="double">{{ t("dataTools.comparison.doubleRange") }}</TRadio>
          </TRadioGroup>
        </TFormItem>

        <TFormItem name="firstRange" :label="t('dataTools.comparison.firstRange')">
          <TInput
            v-model="draft.firstRange"
            :disabled="busy"
            autocomplete="off"
            placeholder="A1:C10"
            :aria-label="t('dataTools.comparison.firstRange')"
          >
            <template #suffix>
              <TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="`${t('dataTools.comparison.pickRange')}：${t('dataTools.comparison.firstRange')}`"
                :title="t('formulaTools.selectRange')"
                @click="emit('pickRange', 'firstRange')"
                ><SquareMousePointer :size="16" aria-hidden="true" />
              </TButton>
            </template>
          </TInput>
        </TFormItem>
        <TFormItem
          v-if="draft.scope === 'double'"
          name="secondRange"
          :label="t('dataTools.comparison.secondRange')"
        >
          <TInput
            v-model="draft.secondRange"
            :disabled="busy"
            autocomplete="off"
            placeholder="E1:G10"
            :aria-label="t('dataTools.comparison.secondRange')"
          >
            <template #suffix>
              <TButton
                variant="text"
                shape="square"
                :disabled="busy"
                :aria-label="`${t('dataTools.comparison.pickRange')}：${t('dataTools.comparison.secondRange')}`"
                :title="t('formulaTools.selectRange')"
                @click="emit('pickRange', 'secondRange')"
                ><SquareMousePointer :size="16" aria-hidden="true" />
              </TButton>
            </template>
          </TInput>
        </TFormItem>

        <TFormItem name="comparisonMode" :label="t('dataTools.comparison.comparisonMode')">
          <TRadioGroup v-model="draft.comparisonMode" :disabled="busy">
            <TRadio value="cells">{{ t("dataTools.comparison.cells") }}</TRadio>
            <TRadio value="rows">{{ t("dataTools.comparison.rows") }}</TRadio>
          </TRadioGroup>
        </TFormItem>
        <TFormItem name="hasHeader">
          <TCheckbox v-model="draft.hasHeader" :disabled="busy">
            {{ t("dataTools.comparison.header") }}
          </TCheckbox>
        </TFormItem>

        <TFormItem v-if="draft.comparisonMode === 'rows'" name="columns">
          <div class="data-comparison-dialog__columns">
            <div class="data-comparison-dialog__selection-actions">
              <TCheckbox
                :checked="allSelected"
                :indeterminate="partlySelected"
                :disabled="busy || columns.length === 0"
                @change="toggleAll(Boolean($event))"
                >{{ t("dataTools.comparison.selectAll") }}</TCheckbox
              >
              <TButton
                variant="text"
                size="small"
                :disabled="busy || columns.length === 0"
                @click="invertSelection"
                >{{ t("dataTools.comparison.invert") }}</TButton
              >
            </div>
            <TCheckbox
              v-for="column in columns"
              :key="column.column"
              :checked="draft.columns.includes(column.column)"
              :disabled="busy"
              @change="toggle(column.column, Boolean($event))"
              >{{ t("dataTools.comparison.column", { column: column.label })
              }}{{ column.header ? ` (${column.header})` : "" }}</TCheckbox
            >
            <p v-if="draft.scope === 'double'" class="data-comparison-dialog__hint">
              {{ t("dataTools.comparison.doubleRowsHint") }}
            </p>
          </div>
        </TFormItem>

        <TFormItem
          v-if="draft.scope === 'double'"
          name="side"
          :label="t('dataTools.comparison.resultSource')"
        >
          <TRadioGroup v-model="draft.side" :disabled="busy">
            <TRadio value="first">{{ t("dataTools.comparison.firstSource") }}</TRadio>
            <TRadio value="second">{{ t("dataTools.comparison.secondSource") }}</TRadio>
            <TRadio value="both">{{ t("dataTools.comparison.bothSource") }}</TRadio>
          </TRadioGroup>
        </TFormItem>

        <TFormItem v-if="isMarking" name="fillColor" :label="t('dataTools.comparison.fillColor')">
          <TRadioGroup
            v-model="draft.fillColor"
            direction="horizontal"
            :disabled="busy"
            :aria-label="t('dataTools.comparison.fillColor')"
          >
            <TRadio v-for="color in colors" :key="color.value" :value="color.value"
              ><span
                class="data-comparison-dialog__swatch"
                :style="{ backgroundColor: color.value }"
                aria-hidden="true"
              />{{ t(`dataTools.comparison.colors.${color.label}`) }}</TRadio
            >
          </TRadioGroup>
        </TFormItem>
      </TForm>
      <p v-if="error" class="data-comparison-dialog__error" role="alert">
        {{ error }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.data-comparison-dialog {
  display: grid;
  gap: var(--idea-space-2);

  &__columns {
    display: grid;
    align-content: start;
    gap: var(--idea-space-2);
    max-height: 180px;
    overflow: auto;
    padding: var(--idea-space-1) 0;
  }

  &__selection-actions {
    display: flex;
    align-items: center;
    gap: var(--idea-space-4);
  }

  &__swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: var(--idea-space-1);
    border: 1px solid var(--idea-border-subtle);
    border-radius: 2px;
    vertical-align: -2px;
  }

  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }

  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
