<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowDown, ArrowUp } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { getSheetFilterValueKey } from "@idea10/core/commands";
import type { SheetFilterValue } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolFilterValueOption } from "../data-tools-types";
import {
  getMatchingFilterValues,
  DEFAULT_FILTER_SEARCH_OPTIONS,
  type FilterSearchOptions,
} from "../filter-value-options";
import FilterSearchMenu from "./FilterSearchMenu.vue";

type SortField = "name" | "count";
type SortDirection = "ascending" | "descending";

const props = withDefaults(
  defineProps<{
    values: readonly DataToolFilterValueOption[];
    modelValue: readonly SheetFilterValue[];
    query: string;
    disabled: boolean;
    searchOptions?: FilterSearchOptions;
  }>(),
  { searchOptions: () => ({ ...DEFAULT_FILTER_SEARCH_OPTIONS }) },
);
const emit = defineEmits<{
  "update:modelValue": [values: SheetFilterValue[]];
  "update:query": [query: string];
  "update:searchOptions": [options: FilterSearchOptions];
}>();
const { t } = useAppI18n();
const sortField = ref<SortField>("name");
const sortDirection = ref<SortDirection>("ascending");
const visibleLimit = ref(100);
const searchMenuRef = ref<InstanceType<typeof FilterSearchMenu> | null>(null);
defineExpose({
  searchMenuElement: computed(() => searchMenuRef.value?.rootElement ?? null),
});
const searchPlaceholder = computed(() =>
  t(
    props.searchOptions.mode === "any"
      ? "dataTools.filter.searchAnyPlaceholder"
      : props.searchOptions.mode === "phrase"
        ? "dataTools.filter.searchPhrasePlaceholder"
        : "dataTools.filter.searchKeywords",
  ),
);

const matchingValues = computed(() =>
  getMatchingFilterValues(props.values, props.query, props.searchOptions),
);
const selectedKeys = computed(() => new Set(props.modelValue.map(getSheetFilterValueKey)));
const allMatchingSelected = computed(
  () =>
    matchingValues.value.length > 0 &&
    matchingValues.value.every((option) =>
      selectedKeys.value.has(getSheetFilterValueKey(option.key)),
    ),
);
const someMatchingSelected = computed(
  () =>
    matchingValues.value.some((option) =>
      selectedKeys.value.has(getSheetFilterValueKey(option.key)),
    ) && !allMatchingSelected.value,
);
const orderedMatchingValues = computed(() => {
  const direction = sortDirection.value === "ascending" ? 1 : -1;
  return [...matchingValues.value].sort((left, right) => {
    if (sortField.value === "count") {
      const count = (left.count - right.count) * direction;
      if (count) return count;
    } else {
      const name = compareNames(left, right) * direction;
      if (name) return name;
    }
    return compareNames(left, right);
  });
});
const displayedValues = computed(() => orderedMatchingValues.value.slice(0, visibleLimit.value));
const remainingCount = computed(() =>
  Math.max(0, orderedMatchingValues.value.length - visibleLimit.value),
);

watch(
  () => [props.query, props.searchOptions] as const,
  () => {
    visibleLimit.value = 100;
  },
);

function compareNames(left: DataToolFilterValueOption, right: DataToolFilterValueOption): number {
  if (left.key.kind === "number" && right.key.kind === "number")
    return left.key.value - right.key.value;
  return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
}

function emitSelection(values: readonly SheetFilterValue[]): void {
  emit(
    "update:modelValue",
    values.map((value) => ({ ...value })),
  );
}

function updateQuery(value: string): void {
  emit("update:query", String(value));
}

function setSort(field: SortField): void {
  if (sortField.value === field)
    sortDirection.value = sortDirection.value === "ascending" ? "descending" : "ascending";
  else {
    sortField.value = field;
    sortDirection.value = field === "count" ? "descending" : "ascending";
  }
}

function toggle(option: DataToolFilterValueOption, checked: boolean): void {
  const key = getSheetFilterValueKey(option.key);
  const next = props.modelValue.filter((value) => getSheetFilterValueKey(value) !== key);
  if (checked) next.push({ ...option.key });
  emitSelection(next);
}

function toggleAll(checked: boolean): void {
  const matchingKeys = new Set(
    matchingValues.value.map((option) => getSheetFilterValueKey(option.key)),
  );
  const next = props.modelValue.filter((value) => !matchingKeys.has(getSheetFilterValueKey(value)));
  if (checked) next.push(...matchingValues.value.map((option) => ({ ...option.key })));
  emitSelection(next);
}

function invertMatching(): void {
  const matchingKeys = new Set(
    matchingValues.value.map((option) => getSheetFilterValueKey(option.key)),
  );
  const next = props.modelValue.filter((value) => !matchingKeys.has(getSheetFilterValueKey(value)));
  next.push(
    ...matchingValues.value
      .filter((option) => !selectedKeys.value.has(getSheetFilterValueKey(option.key)))
      .map((option) => ({ ...option.key })),
  );
  emitSelection(next);
}

function selectDuplicates(): void {
  const matchingKeys = new Set(
    matchingValues.value.map((option) => getSheetFilterValueKey(option.key)),
  );
  const next = props.modelValue.filter((value) => !matchingKeys.has(getSheetFilterValueKey(value)));
  next.push(
    ...matchingValues.value
      .filter((option) => option.count > 1)
      .map((option) => ({ ...option.key })),
  );
  emitSelection(next);
}
</script>

<template>
  <section class="filter-value-list" :aria-label="t('dataTools.filter.listOrder')">
    <TInput
      :value="query"
      :disabled="disabled"
      :placeholder="searchPlaceholder"
      :aria-label="searchPlaceholder"
      type="search"
      autocomplete="off"
      clearable
      @update:value="updateQuery"
    >
      <template #prefix-icon>
        <FilterSearchMenu
          ref="searchMenuRef"
          :options="searchOptions"
          :disabled="disabled"
          @change="emit('update:searchOptions', $event)"
        />
      </template>
    </TInput>
    <div class="filter-value-list__tools">
      <TCheckbox
        :checked="allMatchingSelected"
        :indeterminate="someMatchingSelected"
        :disabled="disabled || matchingValues.length === 0"
        @change="toggleAll(Boolean($event))"
      >
        {{ t("dataTools.filter.selectAll") }} ({{ matchingValues.length }})
      </TCheckbox>
      <TButton
        variant="text"
        size="small"
        :disabled="disabled || !matchingValues.length"
        @click="invertMatching"
      >
        {{ t("dataTools.filter.invert") }}
      </TButton>
      <TButton
        variant="text"
        size="small"
        :disabled="disabled || !matchingValues.length"
        @click="selectDuplicates"
      >
        {{ t("dataTools.filter.duplicates") }}
      </TButton>
    </div>
    <div
      class="filter-value-list__ordering"
      role="group"
      :aria-label="t('dataTools.filter.listOrder')"
    >
      <TButton
        variant="text"
        size="small"
        :aria-pressed="sortField === 'name'"
        :disabled="disabled"
        @click="setSort('name')"
      >
        {{ t("dataTools.filter.name") }}
        <ArrowUp
          v-if="sortField === 'name' && sortDirection === 'ascending'"
          :size="14"
          aria-hidden="true"
        />
        <ArrowDown v-else-if="sortField === 'name'" :size="14" aria-hidden="true" />
      </TButton>
      <TButton
        variant="text"
        size="small"
        :aria-pressed="sortField === 'count'"
        :disabled="disabled"
        @click="setSort('count')"
      >
        {{ t("dataTools.filter.count") }}
        <ArrowUp
          v-if="sortField === 'count' && sortDirection === 'ascending'"
          :size="14"
          aria-hidden="true"
        />
        <ArrowDown v-else-if="sortField === 'count'" :size="14" aria-hidden="true" />
      </TButton>
    </div>
    <div
      class="filter-value-list__values"
      role="group"
      :aria-label="t('dataTools.filter.filterValues')"
    >
      <TCheckbox
        v-for="option in displayedValues"
        :key="getSheetFilterValueKey(option.key)"
        :checked="selectedKeys.has(getSheetFilterValueKey(option.key))"
        :disabled="disabled"
        @change="toggle(option, Boolean($event))"
      >
        <span class="filter-value-list__label">{{ option.label }}</span>
        <span class="filter-value-list__count">({{ option.count }})</span>
      </TCheckbox>
      <p v-if="matchingValues.length === 0" class="filter-value-list__empty" role="status">
        {{ t("dataTools.filter.noMatches") }}
      </p>
    </div>
    <TButton
      v-if="remainingCount"
      class="filter-value-list__more"
      variant="text"
      size="small"
      :disabled="disabled"
      @click="visibleLimit += 100"
    >
      {{ t("dataTools.filter.loadMore", { count: remainingCount }) }}
    </TButton>
  </section>
</template>

<style scoped lang="scss">
.filter-value-list {
  display: grid;
  gap: 8px;
  min-width: 0;
  font: inherit;

  &__tools,
  &__ordering {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: center;
  }

  &__values {
    display: grid;
    align-content: start;
    gap: 4px;
    height: min(230px, 30vh);
    padding: 8px 0 4px;
    overflow: auto;
  }

  &__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    margin-inline-start: 6px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small, 12px);
    font-variant-numeric: tabular-nums;
  }

  &__empty {
    margin: 0;
    padding: 12px 0;
    color: var(--idea-text-secondary);
    text-align: center;
  }

  &__more {
    justify-self: start;
  }
}
</style>
