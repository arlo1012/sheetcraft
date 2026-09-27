<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Dropdown, DropdownItem, DropdownMenu } from "tdesign-vue-next/es/dropdown";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import type { SheetSearchFormat } from "@idea10/core/search";
import WorkbookFindFormatPreview from "./WorkbookFindFormatPreview.vue";
import WorkbookFindResults from "./WorkbookFindResults.vue";
import { useAppI18n } from "../../../shared/i18n";
import WorkbookFindQueryInput from "./WorkbookFindQueryInput.vue";
import {
  DEFAULT_WORKBOOK_FIND_OPTIONS,
  type WorkbookFindFormatMode,
  type WorkbookFindOptions,
  type WorkbookFindResult,
} from "../workbook-find-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    query: string;
    history?: readonly string[];
    options?: WorkbookFindOptions;
    results?: readonly WorkbookFindResult[];
    hasSearchedAll?: boolean;
    resultCount?: number;
    status?: string;
    formatSummary?: string;
    format?: SheetSearchFormat;
    pickingFormat?: boolean;
  }>(),
  {
    options: () => ({ ...DEFAULT_WORKBOOK_FIND_OPTIONS }),
    results: () => [],
    history: () => [],
    hasSearchedAll: false,
    resultCount: 0,
    status: "",
    formatSummary: "",
    pickingFormat: false,
  },
);
const emit = defineEmits<{
  updateQuery: [query: string];
  find: [direction: "forward" | "backward"];
  close: [];
  closed: [];
  updateOptions: [options: Partial<WorkbookFindOptions>];
  findAll: [];
  selectResult: [result: WorkbookFindResult];
  pickFormat: [mode: WorkbookFindFormatMode];
  clearFormat: [];
  configureFormat: [];
  cancelFormatPick: [];
}>();
const { t } = useAppI18n();
const queryInput = ref<InstanceType<typeof WorkbookFindQueryInput>>();
const expanded = ref(false);
const formatOpen = ref(false);
const specialOpen = ref(false);
const canFind = computed(() => Boolean(props.query || props.formatSummary));
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
  if (canFind.value) emit("find", direction);
}
function insertSpecial(text: string): void {
  queryInput.value?.insertText(text);
}
function close(): void {
  if (props.pickingFormat) emit("cancelFormatPick");
  else emit("close");
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('navigation.findPlaceholder')"
    mode="modeless"
    dialog-class-name="workbook-find-dialog-frame"
    draggable
    top="160px"
    width="min(600px, calc(100vw - 32px))"
    :show-overlay="false"
    :prevent-scroll-through="false"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :footer="false"
    @opened="queryInput?.focus()"
    @close="close"
    @closed="emit('closed')"
  >
    <div class="workbook-find-dialog">
      <section class="workbook-find-dialog__form">
        <div class="workbook-find-dialog__query-row">
          <span class="workbook-find-dialog__query-label">{{
            t("navigation.findQueryLabel")
          }}</span>
          <WorkbookFindQueryInput
            ref="queryInput"
            class="workbook-find-dialog__query"
            :value="query"
            :history="history"
            @update:value="emit('updateQuery', $event)"
            @find="find"
          />
          <WorkbookFindFormatPreview
            :format="format"
            :title="formatSummary"
            :empty-label="t('navigation.findFormatUnset')"
          />
          <Dropdown
            trigger="click"
            placement="bottom-left"
            :min-column-width="180"
            :max-column-width="300"
            :popup-props="{ zIndex: 2600, onVisibleChange: (visible) => (formatOpen = visible) }"
          >
            <Button variant="outline" aria-haspopup="menu" :aria-expanded="formatOpen">
              {{ t("navigation.findFormat") }}
              <template #suffix><ChevronDown :size="14" /></template>
            </Button>
            <template #dropdown>
              <DropdownMenu>
                <DropdownItem @click="emit('configureFormat')">
                  <span data-find-format="configure">{{ t("navigation.findCustomFormat") }}</span>
                </DropdownItem>
                <DropdownItem @click="emit('pickFormat', 'fill')">
                  <span data-find-format="fill">{{ t("navigation.findFormatFill") }}</span>
                </DropdownItem>
                <DropdownItem @click="emit('pickFormat', 'font')">
                  <span data-find-format="font">{{ t("navigation.findFormatFont") }}</span>
                </DropdownItem>
                <DropdownItem @click="emit('pickFormat', 'colors')">
                  <span data-find-format="colors">{{ t("navigation.findFormatColors") }}</span>
                </DropdownItem>
                <DropdownItem @click="emit('pickFormat', 'all')">
                  <span data-find-format="all">{{ t("navigation.findFormatAll") }}</span>
                </DropdownItem>
                <DropdownItem :disabled="!formatSummary" @click="emit('clearFormat')">
                  <span data-find-format="clear">{{ t("navigation.findClearFormat") }}</span>
                </DropdownItem>
              </DropdownMenu>
            </template>
          </Dropdown>
        </div>
        <section
          v-if="expanded"
          id="find-options"
          class="workbook-find-dialog__options"
          :aria-label="t('navigation.findOptions')"
        >
          <div class="workbook-find-dialog__option">
            <span>{{ t("navigation.findScope") }}</span>
            <TSelect
              class="workbook-find-dialog__select"
              :value="options.scope"
              :options="scopeOptions"
              :aria-label="t('navigation.findScope')"
              @change="updateOptions({ scope: $event === 'workbook' ? 'workbook' : 'sheet' })"
            />
            <TCheckbox
              :checked="options.matchCase"
              @change="updateOptions({ matchCase: Boolean($event) })"
              >{{ t("navigation.findMatchCase") }}</TCheckbox
            >
          </div>
          <div class="workbook-find-dialog__option">
            <span>{{ t("navigation.findOrder") }}</span>
            <TSelect
              class="workbook-find-dialog__select"
              :value="options.order"
              :options="orderOptions"
              :aria-label="t('navigation.findOrder')"
              @change="updateOptions({ order: $event === 'columns' ? 'columns' : 'rows' })"
            />
            <TCheckbox
              :checked="options.matchEntireCell"
              @change="updateOptions({ matchEntireCell: Boolean($event) })"
              >{{ t("navigation.findMatchEntireCell") }}</TCheckbox
            >
          </div>
          <div class="workbook-find-dialog__option">
            <span>{{ t("navigation.findLookIn") }}</span>
            <TSelect
              class="workbook-find-dialog__select"
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
        <div class="workbook-find-dialog__tools">
          <Dropdown
            trigger="click"
            placement="bottom-left"
            :min-column-width="184"
            :max-column-width="300"
            :popup-props="{ zIndex: 2600, onVisibleChange: (visible) => (specialOpen = visible) }"
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
                  <span
                    class="workbook-find-dialog__special-content"
                    data-find-special="line-break"
                  >
                    {{ t("navigation.findSpecialLineBreak") }}
                    <span class="workbook-find-dialog__special-token">^l</span>
                  </span>
                </DropdownItem>
                <DropdownItem @click="insertSpecial('?')">
                  <span class="workbook-find-dialog__special-content" data-find-special="single">
                    {{ t("navigation.findSpecialSingleCharacter") }}
                    <span class="workbook-find-dialog__special-token">?</span>
                  </span>
                </DropdownItem>
                <DropdownItem @click="insertSpecial('*')">
                  <span class="workbook-find-dialog__special-content" data-find-special="multiple">
                    {{ t("navigation.findSpecialAnyText") }}
                    <span class="workbook-find-dialog__special-token">*</span>
                  </span>
                </DropdownItem>
              </DropdownMenu>
            </template>
          </Dropdown>
          <Button
            variant="outline"
            :aria-expanded="expanded"
            aria-controls="find-options"
            @click="expanded = !expanded"
            >{{ t("navigation.findOptions")
            }}<template #suffix
              ><ChevronUp v-if="expanded" :size="14" /><ChevronDown v-else :size="14" /></template
          ></Button>
        </div>
      </section>
      <div class="workbook-find-dialog__actions">
        <Button variant="outline" :disabled="!canFind" @click="emit('findAll')">{{
          t("navigation.findAll")
        }}</Button>
        <Button variant="outline" :disabled="!canFind" @click="find('backward')">{{
          t("navigation.findPrevious")
        }}</Button>
        <Button theme="primary" :disabled="!canFind" @click="find('forward')">{{
          t("navigation.findNext")
        }}</Button>
        <Button variant="outline" @click="close">{{ t("navigation.findClose") }}</Button>
      </div>
      <WorkbookFindResults
        v-if="hasSearchedAll"
        :results="results"
        :result-count="resultCount"
        :status="status"
        @select-result="emit('selectResult', $event)"
      />
      <p v-else-if="status || pickingFormat" class="workbook-find-dialog__status" role="status">
        {{ pickingFormat ? t("navigation.findPickFormatHint") : status }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.workbook-find-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--idea-space-4);
  min-width: 0;
  &__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--idea-space-4);
    min-width: 0;
  }
  &__query-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 108px auto;
    align-items: center;
    gap: var(--idea-space-2);
    min-width: 0;
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
  &__tools,
  &__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--idea-space-2);
    min-width: 0;
  }
  &__actions {
    justify-content: flex-end;
  }
  &__status {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    overflow-wrap: anywhere;
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
  .workbook-find-dialog {
    &__query-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    &__query-label {
      grid-column: 1 / -1;
    }
    &__query {
      grid-column: 1 / -1;
    }
    &__options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
