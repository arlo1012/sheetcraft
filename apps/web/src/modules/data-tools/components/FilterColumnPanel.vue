<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { getSheetFilterValueKey } from "@idea10/core/commands";
import type { SheetFilterValue } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import {
  buildFilterCondition,
  createFilterConditionDraft,
  NUMBER_FILTER_OPERATORS,
  TEXT_FILTER_OPERATORS,
  type FilterConditionOperator,
} from "../filter-conditions";
import type { DataToolFilterCriteria, DataToolFilterValueOption } from "../data-tools-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    anchor?: { x: number; y: number; width?: number; height?: number };
    columnLabel: string;
    values: readonly DataToolFilterValueOption[];
    appliedKeys: readonly SheetFilterValue[];
    criteria?: DataToolFilterCriteria;
    disabled?: boolean;
    dateSystem?: ExcelDateSystem;
  }>(),
  { disabled: false, dateSystem: "1900" },
);
const emit = defineEmits<{
  apply: [payload: { includedKeys: SheetFilterValue[]; criteria?: DataToolFilterCriteria }];
  clear: [];
  close: [];
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const query = ref("");
const selected = ref<SheetFilterValue[]>([]);
const draft = ref(createFilterConditionDraft(props.criteria, props.dateSystem));
let opener: HTMLElement | null = null;
const open = computed(() => props.visible);
const reference = computed<FloatingReference>(() => ({
  getBoundingClientRect: () =>
    new DOMRect(
      props.anchor?.x ?? 8,
      props.anchor?.y ?? 8,
      props.anchor?.width ?? 0,
      props.anchor?.height ?? 0,
    ),
}));
const { floatingStyles } = useDismissibleFloatingPanel(reference, root, open, {
  placement: "bottom-start",
  offset: 3,
  onDismiss: ({ restoreFocus }) => {
    emit("close");
    if (restoreFocus) void nextTick(() => opener?.focus());
  },
});
const attachToPanel = () => root.value ?? document.body;
const kindOptions = computed(() => [
  { value: "values", label: t("dataTools.filter.filterValues") },
  { value: "text", label: t("dataTools.filter.textFilters") },
  { value: "number", label: t("dataTools.filter.numberFilters") },
  { value: "date", label: t("dataTools.filter.dateFilters") },
]);
const operatorLabels: Record<FilterConditionOperator, MessageKey> = {
  equals: "dataTools.filter.equals",
  notEquals: "dataTools.filter.notEquals",
  contains: "dataTools.filter.contains",
  doesNotContain: "dataTools.filter.doesNotContain",
  beginsWith: "dataTools.filter.beginsWith",
  endsWith: "dataTools.filter.endsWith",
  greaterThan: "dataTools.filter.greaterThan",
  greaterThanOrEqual: "dataTools.filter.greaterThanOrEqual",
  lessThan: "dataTools.filter.lessThan",
  lessThanOrEqual: "dataTools.filter.lessThanOrEqual",
  between: "dataTools.filter.between",
  notBetween: "dataTools.filter.notBetween",
};
const operatorOptions = computed(() =>
  (draft.value.kind === "text" ? TEXT_FILTER_OPERATORS : NUMBER_FILTER_OPERATORS).map((value) => ({
    value,
    label: t(operatorLabels[value]),
  })),
);
const condition = computed(() => buildFilterCondition(draft.value, props.dateSystem));
const between = computed(
  () => draft.value.operator === "between" || draft.value.operator === "notBetween",
);
const matchingValues = computed(() => {
  const text = query.value.trim().toLocaleLowerCase();
  return text
    ? props.values.filter((option) => option.label.toLocaleLowerCase().includes(text))
    : props.values;
});
const selectedSet = computed(() => new Set(selected.value.map(getSheetFilterValueKey)));
const allMatchingSelected = computed(
  () =>
    matchingValues.value.length > 0 &&
    matchingValues.value.every((option) =>
      selectedSet.value.has(getSheetFilterValueKey(option.key)),
    ),
);
const someMatchingSelected = computed(() =>
  matchingValues.value.some((option) => selectedSet.value.has(getSheetFilterValueKey(option.key))),
);

watch(
  () => [props.visible, props.columnLabel, props.appliedKeys, props.criteria] as const,
  () => {
    if (!props.visible) return;
    query.value = "";
    selected.value = props.appliedKeys.map((value) => ({ ...value }));
    draft.value = createFilterConditionDraft(props.criteria, props.dateSystem);
  },
  { immediate: true },
);
watch(
  () => draft.value.kind,
  () => {
    if (!operatorOptions.value.some((option) => option.value === draft.value.operator))
      draft.value.operator = "equals";
  },
);

function toggle(option: DataToolFilterValueOption, checked: boolean): void {
  const key = getSheetFilterValueKey(option.key);
  selected.value = selected.value.filter((value) => getSheetFilterValueKey(value) !== key);
  if (checked) selected.value.push({ ...option.key });
}
function toggleAll(checked: boolean): void {
  const keys = new Set(matchingValues.value.map((option) => getSheetFilterValueKey(option.key)));
  selected.value = selected.value.filter((value) => !keys.has(getSheetFilterValueKey(value)));
  if (checked) selected.value.push(...matchingValues.value.map((option) => ({ ...option.key })));
}
function apply(): void {
  if (props.disabled || !condition.value.valid) return;
  emit("apply", {
    includedKeys: draft.value.kind === "values" ? selected.value : [],
    criteria: condition.value.condition,
  });
}
onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void nextTick(() => root.value?.querySelector<HTMLInputElement>("input")?.focus());
});
onBeforeUnmount(() => {
  if (document.activeElement && root.value?.contains(document.activeElement)) opener?.focus();
});
</script>

<template>
  <Teleport to="body">
    <section
      v-if="visible"
      ref="root"
      class="filter-column-panel"
      role="dialog"
      :aria-label="t('dataTools.filter.filterValues') + ' ' + columnLabel"
      :style="floatingStyles"
    >
      <strong>{{ columnLabel }}</strong>
      <TSelect
        v-model="draft.kind"
        :options="kindOptions"
        :popup-props="{ attach: attachToPanel }"
        :aria-label="t('dataTools.filter.condition')"
      />
      <template v-if="draft.kind !== 'values'">
        <TSelect
          v-model="draft.operator"
          :options="operatorOptions"
          :popup-props="{ attach: attachToPanel }"
          :aria-label="t('dataTools.filter.condition')"
        />
        <TInput
          v-model="draft.first"
          :aria-label="t('dataTools.filter.condition')"
          :placeholder="draft.kind === 'date' ? 'YYYY-MM-DD' : ''"
          :status="!condition.valid && draft.first !== '' ? 'error' : undefined"
        />
        <TInput
          v-if="between"
          v-model="draft.second"
          :aria-label="t('dataTools.filter.and')"
          :placeholder="draft.kind === 'date' ? 'YYYY-MM-DD' : ''"
        />
        <p v-if="!condition.valid" role="status" class="filter-column-panel__error">
          {{ t("dataTools.filter.invalidCondition") }}
        </p>
      </template>
      <template v-else>
        <TInput
          v-model="query"
          :placeholder="t('dataTools.filter.searchValues')"
          :aria-label="t('dataTools.filter.searchValues')"
        />
        <label class="filter-column-panel__all"
          ><TCheckbox
            :checked="allMatchingSelected"
            :indeterminate="someMatchingSelected && !allMatchingSelected"
            @change="toggleAll(Boolean($event))"
          />{{ t("dataTools.filter.selectAll") }}</label
        >
        <div
          class="filter-column-panel__values"
          role="group"
          :aria-label="t('dataTools.filter.filterValues')"
        >
          <label v-for="option in matchingValues" :key="getSheetFilterValueKey(option.key)"
            ><TCheckbox
              :checked="selectedSet.has(getSheetFilterValueKey(option.key))"
              @change="toggle(option, Boolean($event))"
            />{{ option.label }}</label
          >
        </div>
      </template>
      <footer>
        <TButton variant="text" :disabled="disabled" @click="emit('clear')">{{
          t("dataTools.filter.clear")
        }}</TButton>
        <TButton variant="outline" @click="emit('close')">{{
          t("dataTools.filter.cancel")
        }}</TButton>
        <TButton theme="primary" :disabled="disabled || !condition.valid" @click="apply">{{
          t("dataTools.filter.apply")
        }}</TButton>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-column-panel {
  z-index: 2200;
  display: grid;
  gap: 8px;
  width: min(310px, calc(100vw - 16px));
  padding: var(--idea-tool-panel-padding);
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);

  &__all,
  &__values label {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  &__values {
    display: grid;
    gap: 4px;
    max-height: min(220px, 35vh);
    overflow: auto;
  }
  &__error {
    margin: 0;
    color: var(--idea-text-danger, #c9353f);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
