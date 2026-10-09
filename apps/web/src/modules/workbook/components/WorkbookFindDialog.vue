<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { TabPanel, Tabs } from "tdesign-vue-next/es/tabs";
import type { SheetSearchFormat } from "@sheetcraft/core/search";
import type { SheetGoToOptions } from "@sheetcraft/core/go-to";
import WorkbookFindFormatControl from "./WorkbookFindFormatControl.vue";
import WorkbookFindCriteria from "./WorkbookFindCriteria.vue";
import WorkbookGoToPanel from "./WorkbookGoToPanel.vue";
import WorkbookFindResults from "./WorkbookFindResults.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import {
  DEFAULT_WORKBOOK_FIND_OPTIONS,
  type WorkbookFindFormatMode,
  type WorkbookFindOptions,
  type WorkbookFindResult,
  type WorkbookFindMode,
} from "../workbook-find-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    query: string;
    mode?: WorkbookFindMode;
    replacement?: string;
    replacementFormat?: SheetSearchFormat;
    replacementFormatSummary?: string;
    goToStatus?: string;
    goToResults?: readonly WorkbookFindResult[];
    goToResultCount?: number;
    history?: readonly string[];
    options?: WorkbookFindOptions;
    expanded?: boolean;
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
    mode: "find",
    replacement: "",
    goToStatus: "",
    goToResults: () => [],
    goToResultCount: 0,
    expanded: false,
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
  updateMode: [mode: WorkbookFindMode];
  updateReplacement: [text: string];
  configureReplacementFormat: [];
  pickReplacementFormat: [mode: WorkbookFindFormatMode];
  clearReplacementFormat: [];
  replace: [];
  replaceAll: [];
  goTo: [options: SheetGoToOptions];
  selectGoToResult: [result: WorkbookFindResult];
  find: [direction: "forward" | "backward"];
  close: [];
  closed: [];
  updateOptions: [options: Partial<WorkbookFindOptions>];
  updateExpanded: [expanded: boolean];
  findAll: [];
  selectResult: [result: WorkbookFindResult];
  pickFormat: [mode: WorkbookFindFormatMode];
  clearFormat: [];
  configureFormat: [];
  cancelFormatPick: [];
}>();

const { t } = useAppI18n();
const criteriaInput = ref<InstanceType<typeof WorkbookFindCriteria>>();
const replaceCriteriaInput = ref<InstanceType<typeof WorkbookFindCriteria>>();
const goToPanel = ref<InstanceType<typeof WorkbookGoToPanel>>();
const canFind = computed(() => Boolean(props.query || (props.expanded && props.formatSummary)));
function find(direction: "forward" | "backward"): void {
  if (canFind.value) emit("find", direction);
}
function focusQuery(): void {
  if (props.mode === "goto") goToPanel.value?.focus();
  else (props.mode === "replace" ? replaceCriteriaInput.value : criteriaInput.value)?.focusQuery();
}
function changeMode(value: string | number): void {
  if (value !== "find" && value !== "replace" && value !== "goto") return;
  emit("updateMode", value);
  void nextTick(focusQuery);
}
function close(): void {
  if (props.pickingFormat) emit("cancelFormatPick");
  else emit("close");
}
defineExpose({ focusQuery });
</script>
<template>
  <Dialog
    :visible="visible"
    :header="
      t(
        mode === 'goto'
          ? 'navigation.goToTab'
          : mode === 'replace'
            ? 'navigation.replaceTab'
            : 'navigation.findPlaceholder',
      )
    "
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
    @opened="focusQuery"
    @close="close"
    @closed="emit('closed')"
  >
    <div class="workbook-find-dialog">
      <Tabs :value="mode" @change="changeMode">
        <TabPanel value="find" :label="t('navigation.findTab')" destroy-on-hide>
          <div class="workbook-find-dialog__pane">
            <WorkbookFindCriteria
              ref="criteriaInput"
              :query="query"
              :history="history"
              :options="options"
              :expanded="expanded"
              :format="format"
              :format-summary="formatSummary"
              @update-query="emit('updateQuery', $event)"
              @find="find"
              @update-options="emit('updateOptions', $event)"
              @update-expanded="emit('updateExpanded', $event)"
              @pick-format="emit('pickFormat', $event)"
              @configure-format="emit('configureFormat')"
              @clear-format="emit('clearFormat')"
            />
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
              @select-result="emit('selectResult', $event)"
            />
            <p
              v-else-if="status || pickingFormat"
              class="workbook-find-dialog__status"
              role="status"
            >
              {{ pickingFormat ? t("navigation.findPickFormatHint") : status }}
            </p>
          </div>
        </TabPanel>
        <TabPanel value="replace" :label="t('navigation.replaceTab')" destroy-on-hide>
          <div class="workbook-find-dialog__pane">
            <WorkbookFindCriteria
              ref="replaceCriteriaInput"
              :query="query"
              :history="history"
              :options="options"
              :expanded="expanded"
              :format="format"
              :format-summary="formatSummary"
              @update-query="emit('updateQuery', $event)"
              @find="find"
              @update-options="emit('updateOptions', $event)"
              @update-expanded="emit('updateExpanded', $event)"
              @pick-format="emit('pickFormat', $event)"
              @configure-format="emit('configureFormat')"
              @clear-format="emit('clearFormat')"
            >
              <template #after-query>
                <div class="workbook-find-dialog__replacement" :class="{ 'is-expanded': expanded }">
                  <span>{{ t("navigation.replaceWith") }}</span>
                  <Input
                    class="workbook-find-dialog__replacement-input"
                    :value="replacement"
                    v-native-control="{ attributes: { 'aria-label': t('navigation.replaceWith') } }"
                    @change="emit('updateReplacement', String($event))"
                  />
                  <WorkbookFindFormatControl
                    v-if="expanded"
                    :format="replacementFormat"
                    :summary="replacementFormatSummary"
                    @configure-format="emit('configureReplacementFormat')"
                    @pick-format="emit('pickReplacementFormat', $event)"
                    @clear-format="emit('clearReplacementFormat')"
                  />
                </div>
              </template>
            </WorkbookFindCriteria>
            <p v-if="status" class="workbook-find-dialog__status" role="status">{{ status }}</p>
            <div class="workbook-find-dialog__actions">
              <Button variant="outline" :disabled="!canFind" @click="emit('replace')">{{
                t("navigation.replace")
              }}</Button>
              <Button theme="primary" :disabled="!canFind" @click="emit('replaceAll')">{{
                t("navigation.replaceAll")
              }}</Button>
              <Button variant="outline" :disabled="!canFind" @click="find('forward')">{{
                t("navigation.findNext")
              }}</Button>
              <Button variant="outline" @click="close">{{ t("navigation.findClose") }}</Button>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="goto" :label="t('navigation.goToTab')">
          <div class="workbook-find-dialog__pane">
            <WorkbookGoToPanel ref="goToPanel" @go-to="emit('goTo', $event)" @close="close" />
            <p v-if="goToStatus" class="workbook-find-dialog__status" role="status">
              {{ goToStatus }}
            </p>
            <p v-if="goToResults.length" class="workbook-find-dialog__status">
              {{ t("navigation.goToResultHint") }}
            </p>
            <WorkbookFindResults
              v-if="goToResults.length"
              :results="goToResults"
              :result-count="goToResultCount"
              @select-result="emit('selectGoToResult', $event)"
            />
          </div>
        </TabPanel>
      </Tabs>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.workbook-find-dialog {
  min-width: 0;
  &__pane {
    display: grid;
    gap: var(--sheetcraft-space-4);
    padding-top: var(--sheetcraft-space-4);
    min-width: 0;
  }
  &__replacement {
    display: grid;
    grid-template-columns: 6em minmax(0, 1fr);
    &.is-expanded {
      grid-template-columns: 6em minmax(0, 1fr) 108px auto;
    }
    align-items: center;
    gap: var(--sheetcraft-space-2);
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sheetcraft-space-2);
  }
  &__status {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    overflow-wrap: anywhere;
  }
}
@media (max-width: 520px) {
  .workbook-find-dialog__replacement,
  .workbook-find-dialog__replacement.is-expanded {
    grid-template-columns: minmax(0, 1fr) auto;
    > span,
    > .workbook-find-dialog__replacement-input {
      grid-column: 1 / -1;
    }
  }
}
</style>
