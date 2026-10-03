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
import type { FilterPanelSettings } from "../filter-panel-settings";
import FilterSettingsMenu from "./FilterSettingsMenu.vue";
import FilterSearchMenu from "./FilterSearchMenu.vue";

type SortField = "name" | "count";
type SortDirection = "ascending" | "descending";

const props = withDefaults(
  defineProps<{
    values: readonly DataToolFilterValueOption[];
    modelValue: readonly SheetFilterValue[];
    query: string;
    disabled: boolean;
    settings: FilterPanelSettings;
    searchOptions?: FilterSearchOptions;
  }>(),
  { searchOptions: () => ({ ...DEFAULT_FILTER_SEARCH_OPTIONS }) },
);
const emit = defineEmits<{
  "update:modelValue": [values: SheetFilterValue[]];
  "update:query": [query: string];
  "update:searchOptions": [options: FilterSearchOptions];
  "update:settings": [settings: FilterPanelSettings];
}>();
const { t } = useAppI18n();
const sortField = computed(() => props.settings.sortField);
const sortDirection = computed(() => props.settings.sortDirection);
const visibleLimit = ref(100);
const settingsMenuRef = ref<InstanceType<typeof FilterSettingsMenu> | null>(null);
const searchMenuRef = ref<InstanceType<typeof FilterSearchMenu> | null>(null);
defineExpose({
  settingsMenuElement: computed(() => settingsMenuRef.value?.rootElement ?? null),
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
const openingSelection = ref(new Set(props.modelValue.map(getSheetFilterValueKey)));
watch(
  () => props.values,
  () => {
    openingSelection.value = new Set(props.modelValue.map(getSheetFilterValueKey));
    visibleLimit.value = 100;
  },
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
    if (props.settings.checkedFirst) {
      const checked =
        Number(openingSelection.value.has(getSheetFilterValueKey(right.key))) -
        Number(openingSelection.value.has(getSheetFilterValueKey(left.key)));
      if (checked) return checked;
    }
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
  const direction: SortDirection =
    sortField.value === field
      ? sortDirection.value === "ascending"
        ? "descending"
        : "ascending"
      : field === "count"
        ? "descending"
        : "ascending";
  emit("update:settings", { ...props.settings, sortField: field, sortDirection: direction });
}

function changeSettings(settings: FilterPanelSettings): void {
  emit("update:settings", settings);
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
    <div
      class="filter-value-list__search-bar"
      role="group"
      :aria-label="t('dataTools.filter.listOrder')"
    >
      <div class="filter-value-list__search">
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
      </div>
      <TButton
        :variant="sortField === 'name' ? 'base' : 'text'"
        theme="default"
        size="small"
        :aria-pressed="sortField === 'name'"
        :disabled="disabled"
        @click="setSort('name')"
      >
        {{ t("dataTools.filter.name") }}
        <ArrowUp
          v-if="sortField === 'name' && sortDirection === 'ascending'"
          class="idea-action-icon"
          aria-hidden="true"
        />
        <ArrowDown v-else-if="sortField === 'name'" class="idea-action-icon" aria-hidden="true" />
      </TButton>
      <TButton
        :variant="sortField === 'count' ? 'base' : 'text'"
        theme="default"
        size="small"
        :aria-pressed="sortField === 'count'"
        :disabled="disabled"
        @click="setSort('count')"
      >
        {{ t("dataTools.filter.count") }}
        <ArrowUp
          v-if="sortField === 'count' && sortDirection === 'ascending'"
          class="idea-action-icon"
          aria-hidden="true"
        />
        <ArrowDown v-else-if="sortField === 'count'" class="idea-action-icon" aria-hidden="true" />
      </TButton>
      <FilterSettingsMenu
        ref="settingsMenuRef"
        :settings="settings"
        :disabled="disabled"
        @change="changeSettings"
      />
    </div>
    <div class="filter-value-list__frame">
      <div class="filter-value-list__tools">
        <TCheckbox
          :checked="allMatchingSelected"
          :indeterminate="someMatchingSelected"
          :disabled="disabled || matchingValues.length === 0"
          @change="toggleAll(Boolean($event))"
        >
          {{ t("dataTools.filter.selectAll") }}
          <span class="filter-value-list__count">({{ matchingValues.length }})</span>
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
          {{ t("dataTools.filter.selectDuplicates") }}
        </TButton>
      </div>
      <div
        class="filter-value-list__values"
        role="group"
        :aria-label="t('dataTools.filter.filterValues')"
      >
        <div
          v-for="option in displayedValues"
          :key="getSheetFilterValueKey(option.key)"
          class="filter-value-list__row"
        >
          <TCheckbox
            class="filter-value-list__checkbox"
            :title="option.label"
            :checked="selectedKeys.has(getSheetFilterValueKey(option.key))"
            :disabled="disabled"
            @change="toggle(option, Boolean($event))"
          >
            <span class="filter-value-list__value-text">
              <span class="filter-value-list__label">{{ option.label }}</span>
              <span v-if="settings.showItemCount" class="filter-value-list__count"
                >({{ option.count }})</span
              >
            </span>
          </TCheckbox>
        </div>
        <p v-if="matchingValues.length === 0" class="filter-value-list__empty" role="status">
          {{ t("dataTools.filter.noMatches") }}
        </p>
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
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.filter-value-list {
  display: grid;
  gap: var(--idea-space-4);
  min-width: 0;
  font: inherit;

  &__search-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: var(--idea-space-2);
  }

  &__search {
    min-width: 0;
  }

  &__frame {
    @include option-list.surface;
    overflow: hidden;
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--idea-space-2) var(--idea-space-4);
    align-items: center;
    padding-inline: var(--idea-space-4);
    padding-bottom: var(--idea-space-2);
  }

  &__values {
    @include option-list.scrollbar;
    display: grid;
    align-content: start;
    max-height: min(300px, calc(100vh - 280px));
    padding-top: var(--idea-space-2);
    overflow: auto;
  }

  &__row {
    @include option-list.item;
  }

  &__checkbox {
    display: flex;
    width: 100%;
  }

  &__value-text {
    display: flex;
    align-items: center;
    max-width: min(330px, calc(100vw - 96px));
  }

  &__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    flex: none;
    margin-inline-start: var(--idea-space-3);
    color: var(--idea-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  &__empty {
    margin: 0;
    padding: var(--idea-space-6) var(--idea-space-4);
    color: var(--idea-text-secondary);
    text-align: center;
  }

  &__more {
    justify-self: start;
  }
}
</style>
