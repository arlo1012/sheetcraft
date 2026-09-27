<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dropdown, DropdownItem, DropdownMenu } from "tdesign-vue-next/es/dropdown";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import type { SheetSearchFormat } from "@idea10/core/search";
import WorkbookFindFormatControl from "./WorkbookFindFormatControl.vue";
import WorkbookFindQueryInput from "./WorkbookFindQueryInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { WorkbookFindFormatMode, WorkbookFindOptions } from "../workbook-find-types";

defineProps<{
  query: string;
  history: readonly string[];
  options: WorkbookFindOptions;
  expanded: boolean;
  format?: SheetSearchFormat;
  formatSummary?: string;
}>();
const emit = defineEmits<{
  updateQuery: [value: string];
  find: [direction: "forward" | "backward"];
  updateOptions: [options: Partial<WorkbookFindOptions>];
  updateExpanded: [expanded: boolean];
  pickFormat: [mode: WorkbookFindFormatMode];
  configureFormat: [];
  clearFormat: [];
}>();
const { t } = useAppI18n();
const queryInput = ref<InstanceType<typeof WorkbookFindQueryInput>>();
const specialOpen = ref(false);
const scopeOptions = computed(() => [
  { value: "sheet", label: t("navigation.findScopeSheet") },
  { value: "workbook", label: t("navigation.findScopeWorkbook") },
]);
const orderOptions = computed(() => [
  { value: "rows", label: t("navigation.findOrderRows") },
  { value: "columns", label: t("navigation.findOrderColumns") },
]);
const lookInOptions = computed(() => [
  { value: "smart", label: t("navigation.findLookInSmart") },
  { value: "formulas", label: t("navigation.findLookInFormulas") },
  { value: "values", label: t("navigation.findLookInValues") },
]);
function updateOptions(options: Partial<WorkbookFindOptions>): void {
  emit("updateOptions", options);
}
function find(direction: "forward" | "backward"): void {
  emit("find", direction);
}
function insertSpecial(text: string): void {
  queryInput.value?.insertText(text);
}
function focusQuery(): void {
  queryInput.value?.focus();
}
defineExpose({ focusQuery });
</script>

<template>
  <section class="workbook-find-criteria">
    <div class="workbook-find-criteria__query-row" :class="{ 'is-expanded': expanded }">
      <span class="workbook-find-criteria__query-label">{{ t("navigation.findQueryLabel") }}</span>
      <WorkbookFindQueryInput
        ref="queryInput"
        class="workbook-find-criteria__query"
        :value="query"
        :history="history"
        @update:value="emit('updateQuery', $event)"
        @find="find"
      />
      <WorkbookFindFormatControl
        v-if="expanded"
        :format="format"
        :summary="formatSummary"
        @pick-format="emit('pickFormat', $event)"
        @configure-format="emit('configureFormat')"
        @clear-format="emit('clearFormat')"
      />
    </div>
    <slot name="after-query" />
    <section
      v-if="expanded"
      id="find-options"
      class="workbook-find-criteria__options"
      :aria-label="t('navigation.findOptions')"
    >
      <div class="workbook-find-criteria__option">
        <span>{{ t("navigation.findScope") }}</span>
        <TSelect
          class="workbook-find-criteria__select"
          :value="options.scope"
          :options="scopeOptions"
          :aria-label="t('navigation.findScope')"
          @change="
            updateOptions({
              scope: $event === 'workbook' ? 'workbook' : 'sheet',
            })
          "
        />
        <TCheckbox
          :checked="options.matchCase"
          @change="updateOptions({ matchCase: Boolean($event) })"
          >{{ t("navigation.findMatchCase") }}</TCheckbox
        >
      </div>
      <div class="workbook-find-criteria__option">
        <span>{{ t("navigation.findOrder") }}</span>
        <TSelect
          class="workbook-find-criteria__select"
          :value="options.order"
          :options="orderOptions"
          :aria-label="t('navigation.findOrder')"
          @change="
            updateOptions({
              order: $event === 'columns' ? 'columns' : 'rows',
            })
          "
        />
        <TCheckbox
          :checked="options.matchEntireCell"
          @change="updateOptions({ matchEntireCell: Boolean($event) })"
          >{{ t("navigation.findMatchEntireCell") }}</TCheckbox
        >
      </div>
      <div class="workbook-find-criteria__option">
        <span>{{ t("navigation.findLookIn") }}</span>
        <TSelect
          class="workbook-find-criteria__select"
          :value="options.lookIn"
          :options="lookInOptions"
          :aria-label="t('navigation.findLookIn')"
          @change="
            updateOptions({
              lookIn: $event === 'formulas' || $event === 'values' ? $event : 'smart',
            })
          "
        />
        <TCheckbox
          :checked="options.matchWidth"
          @change="updateOptions({ matchWidth: Boolean($event) })"
          >{{ t("navigation.findMatchWidth") }}</TCheckbox
        >
      </div>
    </section>
    <div class="workbook-find-criteria__tools">
      <Dropdown
        trigger="click"
        placement="bottom-left"
        :min-column-width="184"
        :max-column-width="300"
        :popup-props="{
          zIndex: 2600,
          onVisibleChange: (visible) => (specialOpen = visible),
        }"
      >
        <Button
          variant="outline"
          :aria-label="t('navigation.findSpecialContent')"
          aria-haspopup="menu"
          :aria-expanded="specialOpen"
        >
          {{ t("navigation.findSpecialContent") }}
          <template #suffix><ChevronDown :size="14" /></template>
        </Button>
        <template #dropdown>
          <DropdownMenu>
            <DropdownItem divider @click="insertSpecial('^l')">
              <span class="workbook-find-criteria__special-content" data-find-special="line-break">
                {{ t("navigation.findSpecialLineBreak") }}
                <span class="workbook-find-criteria__special-token">^l</span>
              </span>
            </DropdownItem>
            <DropdownItem @click="insertSpecial('?')">
              <span class="workbook-find-criteria__special-content" data-find-special="single">
                {{ t("navigation.findSpecialSingleCharacter") }}
                <span class="workbook-find-criteria__special-token">?</span>
              </span>
            </DropdownItem>
            <DropdownItem @click="insertSpecial('*')">
              <span class="workbook-find-criteria__special-content" data-find-special="multiple">
                {{ t("navigation.findSpecialAnyText") }}
                <span class="workbook-find-criteria__special-token">*</span>
              </span>
            </DropdownItem>
          </DropdownMenu>
        </template>
      </Dropdown>
      <Button
        variant="outline"
        :aria-expanded="expanded"
        aria-controls="find-options"
        @click="emit('updateExpanded', !expanded)"
        >{{ t("navigation.findOptions")
        }}<template #suffix
          ><ChevronUp v-if="expanded" :size="14" /><ChevronDown v-else :size="14" /></template
      ></Button>
    </div>
  </section>
</template>
<style scoped lang="scss">
.workbook-find-criteria {
  display: grid;
  gap: var(--idea-space-4);
  min-width: 0;
  &__query-row {
    display: grid;
    grid-template-columns: 6em minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-2);
    min-width: 0;
    &.is-expanded {
      grid-template-columns: 6em minmax(0, 1fr) 108px auto;
    }
  }
  &__query-label {
    white-space: nowrap;
  }
  &__query,
  &__select {
    min-width: 0;
    width: 100%;
  }
  &__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--idea-space-3);
    min-width: 0;
  }
  &__option {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--idea-space-2);
    min-width: 0;
    > * {
      min-width: 0;
      max-width: 100%;
    }
  }
  &__tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--idea-space-2);
    min-width: 0;
  }
  &__special-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--idea-space-4);
    width: 100%;
  }
  &__special-token {
    color: var(--idea-text-secondary);
  }
}
@media (max-width: 520px) {
  .workbook-find-criteria {
    &__query-row,
    &__query-row.is-expanded {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    &__query-label,
    &__query {
      grid-column: 1 / -1;
    }
    &__options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
