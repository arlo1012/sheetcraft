<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDownAZ, ArrowUpAZ, FilterX, PaintBucket } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
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
import { getMatchingFilterValues } from "../filter-value-options";
import type { DataToolFilterCriteria, DataToolFilterValueOption } from "../data-tools-types";
import FilterValueList from "./FilterValueList.vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    anchor?: { x: number; y: number; width?: number; height?: number };
    columnLabel: string;
    values: readonly DataToolFilterValueOption[];
    appliedKeys: readonly SheetFilterValue[];
    criteria?: DataToolFilterCriteria;
    preferredKind: "text" | "number" | "date";
    hasCriteria: boolean;
    canSort: boolean;
    disabled?: boolean;
    dateSystem?: ExcelDateSystem;
  }>(),
  { disabled: false, dateSystem: "1900" },
);
const emit = defineEmits<{
  apply: [payload: { includedKeys: SheetFilterValue[]; criteria?: DataToolFilterCriteria }];
  sort: [direction: "ascending" | "descending"];
  openSort: [];
  clear: [];
  close: [];
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const query = ref("");
const selected = ref<SheetFilterValue[]>([]);
const draft = ref(createFilterConditionDraft(props.criteria, props.dateSystem));
const tab = ref<"values" | "condition">("values");
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
  { value: "text", label: t("dataTools.filter.textFilters") },
  { value: "number", label: t("dataTools.filter.numberFilters") },
  { value: "date", label: t("dataTools.filter.dateFilters") },
]);
const conditionLabel = computed(
  () => kindOptions.value.find((option) => option.value === draft.value.kind)?.label,
);
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
const matchingValues = computed(() => getMatchingFilterValues(props.values, query.value));
const includedKeys = computed(() => {
  const keys = new Set(selected.value.map(getSheetFilterValueKey));
  return matchingValues.value
    .filter((option) => keys.has(getSheetFilterValueKey(option.key)))
    .map((option) => option.key);
});
const canApply = computed(
  () => !props.disabled && (tab.value === "values" || condition.value.valid),
);
watch(
  () => [props.visible, props.columnLabel, props.appliedKeys, props.criteria] as const,
  () => {
    if (!props.visible) return;
    query.value = "";
    selected.value = (
      props.criteria && props.appliedKeys.length === 0
        ? props.values.map((option) => option.key)
        : props.appliedKeys
    ).map((value) => ({ ...value }));
    draft.value = createFilterConditionDraft(props.criteria, props.dateSystem);
    if (draft.value.kind === "values") draft.value.kind = props.preferredKind;
    tab.value = props.criteria ? "condition" : "values";
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
function apply(): void {
  if (!canApply.value) return;
  if (tab.value === "values") emit("apply", { includedKeys: includedKeys.value });
  else if (condition.value.valid)
    emit("apply", { includedKeys: [], criteria: condition.value.condition });
}
function onSearchEnter(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement && !event.isComposing) {
    event.preventDefault();
    apply();
  }
}
onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  void nextTick(() =>
    root.value?.querySelector<HTMLInputElement>("input:not([readonly])")?.focus(),
  );
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
      <div class="filter-column-panel__heading">
        <strong :title="columnLabel">{{ columnLabel }}</strong>
        <TButton
          variant="text"
          size="small"
          :disabled="disabled || !hasCriteria"
          @click="emit('clear')"
        >
          <template #icon><FilterX :size="14" /></template>{{ t("dataTools.filter.clear") }}
        </TButton>
      </div>
      <div class="filter-column-panel__sort" role="group" :aria-label="t('dataTools.sort.title')">
        <TButton
          variant="text"
          size="small"
          :disabled="disabled || !canSort"
          @click="emit('sort', 'ascending')"
        >
          <template #icon><ArrowUpAZ :size="15" /></template>{{ t("dataTools.sort.ascending") }}
        </TButton>
        <TButton
          variant="text"
          size="small"
          :disabled="disabled || !canSort"
          @click="emit('sort', 'descending')"
        >
          <template #icon><ArrowDownAZ :size="15" /></template>{{ t("dataTools.sort.descending") }}
        </TButton>
        <TButton
          variant="text"
          theme="default"
          size="small"
          aria-haspopup="dialog"
          :disabled="disabled || !canSort"
          @click="emit('openSort')"
        >
          <template #icon><PaintBucket class="idea-action-icon" aria-hidden="true" /></template>
          {{ t("dataTools.filter.colorSort") }}
        </TButton>
      </div>
      <TTabs v-model="tab" size="medium">
        <TTabPanel value="values" :disabled="disabled" :label="t('dataTools.filter.content')">
          <FilterValueList
            v-model="selected"
            v-model:query="query"
            :values="values"
            :disabled="disabled"
            @keydown.enter="onSearchEnter"
          />
        </TTabPanel>
        <TTabPanel value="condition" :disabled="disabled" :label="conditionLabel">
          <div class="filter-column-panel__condition">
            <label
              >{{ t("dataTools.filter.filterType") }}
              <TSelect
                v-model="draft.kind"
                :disabled="disabled"
                :options="kindOptions"
                :popup-props="{ attach: attachToPanel }"
                :aria-label="t('dataTools.filter.filterType')"
              />
            </label>
            <label
              >{{ t("dataTools.filter.condition") }}
              <TSelect
                v-model="draft.operator"
                :disabled="disabled"
                :options="operatorOptions"
                :popup-props="{ attach: attachToPanel }"
                :aria-label="t('dataTools.filter.condition')"
              />
            </label>
            <TInput
              :value="draft.first"
              :disabled="disabled"
              :type="draft.kind === 'number' ? 'number' : 'text'"
              :aria-label="t('dataTools.filter.condition')"
              :placeholder="draft.kind === 'date' ? 'YYYY-MM-DD' : ''"
              :status="!condition.valid && draft.first !== '' ? 'error' : undefined"
              @update:value="draft.first = String($event)"
              @enter="apply"
            />
            <template v-if="between">
              <span>{{ t("dataTools.filter.and") }}</span>
              <TInput
                :value="draft.second"
                :disabled="disabled"
                :type="draft.kind === 'number' ? 'number' : 'text'"
                :aria-label="t('dataTools.filter.and')"
                :placeholder="draft.kind === 'date' ? 'YYYY-MM-DD' : ''"
                @update:value="draft.second = String($event)"
                @enter="apply"
              />
            </template>
            <p
              v-if="!condition.valid && (draft.first || draft.second)"
              role="status"
              class="filter-column-panel__error"
            >
              {{ t("dataTools.filter.invalidCondition") }}
            </p>
          </div>
        </TTabPanel>
      </TTabs>
      <footer>
        <span v-if="tab === 'values'" class="filter-column-panel__summary" role="status">
          {{
            t(
              query.trim()
                ? "dataTools.filter.searchSelectionSummary"
                : "dataTools.filter.selectionSummary",
              { selected: includedKeys.length, total: matchingValues.length },
            )
          }}
        </span>
        <TButton theme="primary" size="small" :disabled="!canApply" @click="apply">{{
          t("dataTools.filter.apply")
        }}</TButton>
        <TButton variant="outline" size="small" @click="emit('close')">{{
          t("dataTools.filter.cancel")
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
  width: min(390px, calc(100vw - 16px));
  padding: var(--idea-tool-panel-padding);
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);
  &__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
  }
  &__sort {
    display: flex;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--idea-border-subtle);
  }
  &__condition {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 260px;
    padding-top: 8px;
    label {
      display: grid;
      gap: 4px;
    }
  }
  &__error {
    margin: 0;
    color: var(--idea-text-danger);
  }
  &__summary {
    margin-right: auto;
    color: var(--idea-text-secondary);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--idea-border-subtle);
  }
}
</style>
