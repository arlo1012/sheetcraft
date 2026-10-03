<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDownAZ, ArrowUpAZ, FilterX, PaintBucket } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { getSheetFilterValueKey } from "@idea10/core/commands";
import type { SheetFilterCondition, SheetFilterValue } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createFilterConditionDraft, type FilterConditionOperator } from "../filter-conditions";
import type { FilterConditionAction } from "../filter-condition-actions";
import {
  getMatchingFilterValues,
  DEFAULT_FILTER_SEARCH_OPTIONS,
  type FilterSearchOptions,
} from "../filter-value-options";
import type { DataToolFilterCriteria, DataToolFilterValueOption } from "../data-tools-types";
import FilterValueList from "./FilterValueList.vue";
import FilterColorOptions from "./FilterColorOptions.vue";
import FilterConditionMenu from "./FilterConditionMenu.vue";
import FilterConditionDialog from "./FilterConditionDialog.vue";
import FilterRankDialog from "./FilterRankDialog.vue";

type ColorCondition = Extract<SheetFilterCondition, { kind: "color" | "color-set" }>;

const props = withDefaults(
  defineProps<{
    visible: boolean;
    anchor?: { x: number; y: number; width?: number; height?: number };
    columnLabel: string;
    values: readonly DataToolFilterValueOption[];
    appliedKeys: readonly SheetFilterValue[];
    criteria?: DataToolFilterCriteria;
    colors?: { cellColors: readonly (string | null)[]; fontColors: readonly string[] };
    preferredKind: "text" | "number" | "date";
    hasCriteria: boolean;
    canSort: boolean;
    disabled?: boolean;
    dateSystem?: ExcelDateSystem;
  }>(),
  {
    disabled: false,
    dateSystem: "1900",
    colors: () => ({ cellColors: [], fontColors: [] }),
  },
);
const emit = defineEmits<{
  apply: [
    payload: {
      includedKeys: SheetFilterValue[];
      criteria?: DataToolFilterCriteria;
    },
  ];
  sort: [direction: "ascending" | "descending"];
  openSort: [];
  clear: [];
  close: [];
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const valueListRef = ref<InstanceType<typeof FilterValueList> | null>(null);
const conditionMenuRef = ref<InstanceType<typeof FilterConditionMenu> | null>(null);
const query = ref("");
const searchOptions = ref<FilterSearchOptions>({ ...DEFAULT_FILTER_SEARCH_OPTIONS });
const selected = ref<SheetFilterValue[]>([]);
const colorDraft = ref<ColorCondition>();
const tab = ref<"values" | "color">("values");
const valuesDirty = ref(false);
const editingAction = ref<FilterConditionAction>();
const editing = computed(() => editingAction.value !== undefined);
const filterDisabled = computed(() => props.disabled);
function isColorCondition(
  condition: SheetFilterCondition | undefined,
): condition is ColorCondition {
  return condition?.kind === "color" || condition?.kind === "color-set";
}
const pendingValueCriteria = computed(() =>
  !valuesDirty.value && !isColorCondition(props.criteria) ? props.criteria : undefined,
);
let opener: HTMLElement | null = null;
const open = computed(() => props.visible && !editing.value);
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
  additionalInside: () => [
    conditionMenuRef.value?.rootElement,
    valueListRef.value?.searchMenuElement,
  ],
  onDismiss: ({ restoreFocus }) => {
    emit("close");
    if (restoreFocus) void nextTick(() => opener?.focus());
  },
});
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
const matchingValues = computed(() =>
  getMatchingFilterValues(props.values, query.value, searchOptions.value),
);
const includedKeys = computed(() => {
  const keys = new Set(selected.value.map(getSheetFilterValueKey));
  return matchingValues.value
    .filter((option) => keys.has(getSheetFilterValueKey(option.key)))
    .map((option) => option.key);
});
const validColor = computed(() => {
  const color = colorDraft.value;
  if (!color) return false;
  const colors = color.kind === "color" ? [color.color] : color.colors;
  return (
    colors.length > 0 &&
    colors.every((value) =>
      color.target === "fill"
        ? props.colors.cellColors.includes(value)
        : value !== null && props.colors.fontColors.includes(value),
    )
  );
});
const canApply = computed(
  () => !filterDisabled.value && (tab.value === "values" || validColor.value),
);
function describeCondition(condition: Exclude<SheetFilterCondition, ColorCondition>): string {
  if (condition.kind === "compound")
    return condition.conditions
      .map(describeCondition)
      .join(
        ` ${t(condition.operator === "and" ? "dataTools.filter.and" : "dataTools.filter.or")} `,
      );
  if (condition.kind === "rank")
    return t("dataTools.filter.rankSummary", {
      direction: t(condition.bottom ? "dataTools.filter.bottom" : "dataTools.filter.top"),
      count: condition.count,
      unit: t(condition.percent ? "dataTools.filter.percent" : "dataTools.filter.items"),
    });
  if (condition.kind === "average")
    return t(condition.above ? "dataTools.filter.aboveAverage" : "dataTools.filter.belowAverage");
  const draft = createFilterConditionDraft(condition, props.dateSystem);
  return `${t(operatorLabels[condition.operator])} ${draft.first}${draft.second ? ` ${t("dataTools.filter.and")} ${draft.second}` : ""}`;
}
const criteriaSummary = computed(() => {
  return pendingValueCriteria.value ? describeCondition(pendingValueCriteria.value) : "";
});
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
    valuesDirty.value = false;
    const condition = props.criteria;
    colorDraft.value = isColorCondition(condition)
      ? condition.kind === "color-set"
        ? { ...condition, colors: [...condition.colors] }
        : { ...condition }
      : undefined;
    tab.value = isColorCondition(condition) ? "color" : "values";
    editingAction.value = undefined;
  },
  { immediate: true },
);
function updateSearchOptions(options: FilterSearchOptions): void {
  searchOptions.value = options;
  if (query.value.trim()) valuesDirty.value = true;
}
function applyCondition(criteria: SheetFilterCondition): void {
  if (!filterDisabled.value)
    emit("apply", {
      includedKeys: [],
      criteria,
    });
}
function apply(): void {
  if (!canApply.value) return;
  if (tab.value === "color" && colorDraft.value) applyCondition(colorDraft.value);
  else if (pendingValueCriteria.value) applyCondition(pendingValueCriteria.value);
  else
    emit("apply", {
      includedKeys: includedKeys.value,
    });
}
function chooseCondition(action: FilterConditionAction): void {
  if (filterDisabled.value) return;
  if (action === "aboveAverage" || action === "belowAverage")
    applyCondition({ kind: "average", above: action === "aboveAverage" });
  else editingAction.value = action;
}
function closeEditor(): void {
  editingAction.value = undefined;
  void nextTick(() =>
    root.value
      ?.querySelector<HTMLElement>("input:not([readonly]), button:not([disabled])")
      ?.focus(),
  );
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
      v-if="open"
      ref="root"
      class="filter-column-panel"
      role="dialog"
      :aria-label="t('dataTools.filter.filterValues') + ' ' + columnLabel"
      :style="floatingStyles"
    >
      <header class="filter-column-panel__heading">
        <div class="filter-column-panel__sort" role="group" :aria-label="t('dataTools.sort.title')">
          <span v-icon-action="disabled || !canSort" @click="emit('sort', 'ascending')">
            <ArrowUpAZ class="idea-action-icon" />{{ t("dataTools.sort.ascending") }}
          </span>
          <span v-icon-action="disabled || !canSort" @click="emit('sort', 'descending')">
            <ArrowDownAZ class="idea-action-icon" />{{ t("dataTools.sort.descending") }}
          </span>
          <span
            v-icon-action="disabled || !canSort"
            aria-haspopup="dialog"
            @click="emit('openSort')"
          >
            <PaintBucket class="idea-action-icon" aria-hidden="true" />
            {{ t("dataTools.filter.colorSort") }}
          </span>
        </div>
      </header>
      <TTabs v-model="tab" class="filter-column-panel__tabs" size="medium">
        <template #action>
          <div class="filter-column-panel__actions">
            <FilterConditionMenu
              ref="conditionMenuRef"
              :kind="preferredKind"
              :disabled="filterDisabled"
              @select="chooseCondition"
            />
            <span
              v-icon-action="disabled || !hasCriteria"
              :aria-label="t('dataTools.filter.clear')"
              :title="t('dataTools.filter.clear')"
              @click="emit('clear')"
              ><FilterX class="idea-action-icon" aria-hidden="true" />
            </span>
          </div>
        </template>
        <TTabPanel value="values" :disabled="disabled" :label="t('dataTools.filter.content')">
          <div class="filter-column-panel__content">
            <FilterValueList
              ref="valueListRef"
              v-model="selected"
              v-model:query="query"
              :search-options="searchOptions"
              :values="values"
              :disabled="disabled"
              @update:model-value="valuesDirty = true"
              @update:query="valuesDirty = true"
              @update:search-options="updateSearchOptions"
              @keydown.enter="onSearchEnter"
            />
          </div>
        </TTabPanel>
        <TTabPanel value="color" :disabled="disabled" :label="t('dataTools.filter.byColor')">
          <div class="filter-column-panel__content">
            <FilterColorOptions v-model="colorDraft" :colors="colors" :disabled="disabled" />
          </div>
        </TTabPanel>
      </TTabs>
      <div class="filter-column-panel__bottom">
        <p
          v-if="tab === 'values' && criteriaSummary"
          class="filter-column-panel__criteria"
          :title="criteriaSummary"
        >
          {{ criteriaSummary }}
        </p>
        <footer>
          <span
            v-if="tab === 'values' && !pendingValueCriteria"
            class="filter-column-panel__summary"
            role="status"
          >
            {{
              t(
                query.trim()
                  ? "dataTools.filter.searchSelectionSummary"
                  : "dataTools.filter.selectionSummary",
                { selected: includedKeys.length, total: matchingValues.length },
              )
            }}
          </span>
          <TButton theme="default" variant="base" size="small" @click="emit('close')">{{
            t("dataTools.filter.cancel")
          }}</TButton>
          <TButton theme="primary" size="small" :disabled="!canApply" @click="apply">{{
            t("dataTools.filter.apply")
          }}</TButton>
        </footer>
      </div>
    </section>
  </Teleport>
  <FilterConditionDialog
    v-if="visible && editing && editingAction !== 'rank'"
    :visible="true"
    :column-label="columnLabel"
    :kind="preferredKind"
    :initial="criteria"
    :action="editingAction"
    :values="values"
    :date-system="dateSystem"
    :disabled="filterDisabled"
    @close="closeEditor"
    @apply="applyCondition"
  />
  <FilterRankDialog
    v-if="visible && editingAction === 'rank'"
    :visible="true"
    :initial="criteria?.kind === 'rank' ? criteria : undefined"
    :disabled="filterDisabled"
    @close="closeEditor"
    @apply="applyCondition"
  />
</template>
<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.filter-column-panel {
  @include option-list.scrollbar;
  z-index: 2200;
  display: grid;
  gap: var(--idea-space-4);
  width: min(420px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  padding: var(--idea-tool-panel-padding);
  overflow: auto;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);
  &__heading {
    display: flex;
    align-items: center;
    min-height: 32px;
    gap: var(--idea-space-4);
    border-bottom: 1px solid var(--idea-border-subtle);
  }
  &__sort {
    display: flex;
    align-items: center;
    flex: none;
    gap: var(--idea-space-4);

    > [role="button"] {
      min-height: 24px;
      padding-inline: var(--idea-space-2);
    }
  }
  &__tabs {
    min-width: 0;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);

    > [role="button"] {
      width: 24px;
      height: 24px;
    }
  }
  &__content {
    padding-top: var(--idea-space-4);
  }
  &__criteria {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--idea-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__error {
    margin: 0;
    color: var(--idea-text-danger);
  }
  &__summary {
    min-width: 0;
    margin-right: auto;
    color: var(--idea-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  &__bottom {
    position: sticky;
    z-index: 1;
    bottom: 0;
    display: grid;
    gap: var(--idea-space-4);
    background: var(--idea-surface-panel);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--idea-space-4);
  }
}
</style>
