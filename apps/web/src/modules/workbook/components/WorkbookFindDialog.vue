<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChevronDown, ChevronUp, ListFilter, Palette, Sparkles } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { vNativeControl } from "../../../shared/tdesign/native-control";
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
    options?: WorkbookFindOptions;
    results?: readonly WorkbookFindResult[];
    hasSearchedAll?: boolean;
    resultCount?: number;
    status?: string;
    formatSummary?: string;
    pickingFormat?: boolean;
  }>(),
  {
    options: () => ({ ...DEFAULT_WORKBOOK_FIND_OPTIONS }),
    results: () => [],
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
const input = ref<HTMLTextAreaElement | null>(null);
const expanded = ref(false);
const formatTrigger = ref<InstanceType<typeof Button> | null>(null);
const specialTrigger = ref<InstanceType<typeof Button> | null>(null);
const formatSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const specialSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const formatId = `find-format-${useId().replaceAll(":", "")}`;
const specialId = `find-special-${useId().replaceAll(":", "")}`;
const {
  open: formatOpen,
  floatingStyles: formatStyles,
  dismiss: dismissFormat,
  toggleMenu: toggleFormat,
  onTriggerKeydown: formatKeydown,
} = useMenu({
  triggerRef: computed(() => formatTrigger.value?.$el as HTMLElement | null),
  menuSurfaceRef: formatSurface,
  placement: "bottom-start",
  pointerFocus: "menu",
});
const {
  open: specialOpen,
  floatingStyles: specialStyles,
  dismiss: dismissSpecial,
  toggleMenu: toggleSpecial,
  onTriggerKeydown: specialKeydown,
} = useMenu({
  triggerRef: computed(() => specialTrigger.value?.$el as HTMLElement | null),
  menuSurfaceRef: specialSurface,
  placement: "bottom-end",
  pointerFocus: "menu",
});
const canFind = computed(() => Boolean(props.query || props.formatSummary));
const limited = computed(() => props.resultCount > props.results.length);
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
function setInput(element: HTMLInputElement | HTMLTextAreaElement | null): void {
  input.value = element instanceof HTMLTextAreaElement ? element : null;
}
function updateOptions(options: Partial<WorkbookFindOptions>): void {
  emit("updateOptions", options);
}
function find(direction: "forward" | "backward"): void {
  if (canFind.value) emit("find", direction);
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.isComposing && canFind.value) {
    event.preventDefault();
    find(event.shiftKey ? "backward" : "forward");
  }
}
function chooseFormat(mode: WorkbookFindFormatMode): void {
  emit("pickFormat", mode);
  dismissFormat("programmatic", true);
}
function insertSpecial(text: string): void {
  const edit = insertTextAtSelection(
    props.query,
    input.value?.selectionStart ?? props.query.length,
    input.value?.selectionEnd ?? props.query.length,
    text,
  );
  emit("updateQuery", edit.value);
  dismissSpecial("programmatic", false);
  void nextTick(() => {
    input.value?.focus({ preventScroll: true });
    input.value?.setSelectionRange(edit.caret, edit.caret);
  });
}
function close(): void {
  if (props.pickingFormat) emit("cancelFormatPick");
  else emit("close");
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('navigation.findInSheet')"
    mode="modeless"
    draggable
    top="160px"
    width="min(560px, calc(100vw - 32px))"
    :show-overlay="false"
    :prevent-scroll-through="false"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @opened="input?.focus()"
    @close="close"
    @closed="emit('closed')"
  >
    <div class="workbook-find-dialog">
      <div class="workbook-find-dialog__query-row">
        <Textarea
          :value="query"
          v-native-control="{
            onElement: setInput,
            attributes: { 'aria-label': t('navigation.findInSheet') },
          }"
          :placeholder="t('navigation.findPlaceholder')"
          autocomplete="off"
          :spell-check="false"
          :autosize="{ minRows: 1, maxRows: 3 }"
          data-search-input
          @update:value="emit('updateQuery', String($event))"
          @keydown="(_value, { e }) => onKeydown(e)"
        />
        <Button
          ref="specialTrigger"
          variant="outline"
          shape="square"
          :aria-label="t('navigation.findSpecialContent')"
          :aria-expanded="specialOpen"
          :aria-controls="specialOpen ? specialId : undefined"
          @click="toggleSpecial"
          @keydown="specialKeydown"
          ><Sparkles :size="16"
        /></Button>
        <Button
          variant="text"
          :aria-expanded="expanded"
          aria-controls="find-options"
          @click="expanded = !expanded"
          ><template #icon
            ><ChevronUp v-if="expanded" :size="16" /><ChevronDown v-else :size="16" /></template
          >{{ t(expanded ? "navigation.findHideOptions" : "navigation.findOptions") }}</Button
        >
      </div>
      <p v-if="formatSummary || pickingFormat" class="workbook-find-dialog__status" role="status">
        {{ pickingFormat ? t("navigation.findPickFormatHint") : formatSummary }}
      </p>
      <section
        v-if="expanded"
        id="find-options"
        class="workbook-find-dialog__options"
        :aria-label="t('navigation.findOptions')"
      >
        <label
          ><span>{{ t("navigation.findScope") }}</span
          ><TSelect
            :value="options.scope"
            :options="scopeOptions"
            :aria-label="t('navigation.findScope')"
            @change="
              updateOptions({
                scope: $event === 'workbook' ? 'workbook' : 'sheet',
              })
            "
        /></label>
        <label
          ><span>{{ t("navigation.findOrder") }}</span
          ><TSelect
            :value="options.order"
            :options="orderOptions"
            :aria-label="t('navigation.findOrder')"
            @change="
              updateOptions({
                order: $event === 'columns' ? 'columns' : 'rows',
              })
            "
        /></label>
        <label
          ><span>{{ t("navigation.findLookIn") }}</span
          ><TSelect
            :value="options.lookIn"
            :options="lookInOptions"
            :aria-label="t('navigation.findLookIn')"
            @change="
              updateOptions({
                lookIn: $event === 'formulas' || $event === 'values' ? $event : 'smart',
              })
            "
        /></label>
        <div class="workbook-find-dialog__checks">
          <TCheckbox
            :checked="options.matchCase"
            @change="updateOptions({ matchCase: Boolean($event) })"
            >{{ t("navigation.findMatchCase") }}</TCheckbox
          ><TCheckbox
            :checked="options.matchEntireCell"
            @change="updateOptions({ matchEntireCell: Boolean($event) })"
            >{{ t("navigation.findMatchEntireCell") }}</TCheckbox
          ><TCheckbox
            :checked="options.matchWidth"
            @change="updateOptions({ matchWidth: Boolean($event) })"
            >{{ t("navigation.findMatchWidth") }}</TCheckbox
          >
        </div>
        <p v-if="options.scope === 'workbook'" class="workbook-find-dialog__visible-sheets">
          {{ t("navigation.findVisibleSheetsOnly") }}
        </p>
        <div class="workbook-find-dialog__format">
          <span>{{ t("navigation.findFormat") }}</span
          ><Button
            ref="formatTrigger"
            variant="outline"
            :aria-expanded="formatOpen"
            :aria-controls="formatOpen ? formatId : undefined"
            @click="toggleFormat"
            @keydown="formatKeydown"
            ><template #icon><Palette :size="16" /></template
            >{{ formatSummary || t("navigation.findChooseFormat") }}</Button
          >
        </div>
      </section>
      <section
        v-if="hasSearchedAll"
        class="workbook-find-dialog__results"
        :aria-label="t('navigation.findResults')"
      >
        <div>
          <strong>{{
            limited
              ? t("navigation.findResultsLimited", {
                  shown: results.length,
                  count: resultCount,
                })
              : t("navigation.findResultsCount", { count: resultCount })
          }}</strong
          ><span v-if="status">{{ status }}</span>
        </div>
        <div v-if="results.length" class="workbook-find-dialog__results-list">
          <table>
            <thead>
              <tr>
                <th>{{ t("navigation.findResultCell") }}</th>
                <th>{{ t("navigation.findResultValue") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="result in results" :key="`${result.sheetId}:${result.addressLabel}`">
                <td>
                  <Button variant="text" @click="emit('selectResult', result)"
                    >{{ result.sheetName }}!{{ result.addressLabel }}</Button
                  >
                </td>
                <td>{{ result.value || result.formula }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="workbook-find-dialog__status">
          {{ status || t("navigation.findNoMatches") }}
        </p>
      </section>
      <p v-else-if="status" class="workbook-find-dialog__status" role="status">
        {{ status }}
      </p>
    </div>
    <template #footer
      ><div class="workbook-find-dialog__actions">
        <Button variant="text" @click="close">{{ t("navigation.findClose") }}</Button
        ><Button variant="outline" :disabled="!canFind" @click="emit('findAll')"
          ><template #icon><ListFilter :size="16" /></template>{{ t("navigation.findAll") }}</Button
        ><Button variant="outline" :disabled="!canFind" @click="find('backward')">{{
          t("navigation.findPrevious")
        }}</Button
        ><Button theme="primary" :disabled="!canFind" @click="find('forward')">{{
          t("navigation.findNext")
        }}</Button>
      </div></template
    >
  </Dialog>
  <Teleport to="body"
    ><MenuSurface
      v-if="formatOpen"
      :id="formatId"
      ref="formatSurface"
      class="workbook-find-dialog__menu"
      :style="formatStyles"
      :label="t('navigation.findFormat')"
      ><MenuItem
        data-find-format="configure"
        @select="
          emit('configureFormat');
          dismissFormat('programmatic', true);
        "
        >{{ t("navigation.findCustomFormat") }}</MenuItem
      ><MenuItem data-find-format="fill" @select="chooseFormat('fill')">{{
        t("navigation.findFormatFill")
      }}</MenuItem
      ><MenuItem data-find-format="font" @select="chooseFormat('font')">{{
        t("navigation.findFormatFont")
      }}</MenuItem
      ><MenuItem data-find-format="colors" @select="chooseFormat('colors')">{{
        t("navigation.findFormatColors")
      }}</MenuItem
      ><MenuItem data-find-format="all" @select="chooseFormat('all')">{{
        t("navigation.findFormatAll")
      }}</MenuItem
      ><MenuItem
        data-find-format="clear"
        :disabled="!formatSummary"
        @select="
          emit('clearFormat');
          dismissFormat('programmatic', true);
        "
        >{{ t("navigation.findClearFormat") }}</MenuItem
      ></MenuSurface
    ></Teleport
  >
  <Teleport to="body"
    ><MenuSurface
      v-if="specialOpen"
      :id="specialId"
      ref="specialSurface"
      class="workbook-find-dialog__menu"
      :style="specialStyles"
      :label="t('navigation.findSpecialContent')"
      ><MenuItem data-find-special="line-break" @select="insertSpecial('\n')">{{
        t("navigation.findSpecialLineBreak")
      }}</MenuItem
      ><MenuItem data-find-special="single" @select="insertSpecial('?')">{{
        t("navigation.findSpecialSingleCharacter")
      }}</MenuItem
      ><MenuItem data-find-special="multiple" @select="insertSpecial('*')">{{
        t("navigation.findSpecialAnyText")
      }}</MenuItem>
      <li class="workbook-find-dialog__hint">
        {{ t("navigation.findWildcardHint") }}
      </li></MenuSurface
    ></Teleport
  >
</template>

<style scoped lang="scss">
.workbook-find-dialog {
  display: grid;
  gap: var(--idea-space-3);
  min-width: 0;
  &__query-row,
  &__actions,
  &__format,
  &__results > div:first-child {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__query-row > :first-child {
    flex: 1;
    min-width: 0;
  }
  &__status,
  &__visible-sheets {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--idea-space-3);
    padding-block: var(--idea-space-3);
    border-block: 1px solid var(--idea-border-subtle);
    > label {
      display: grid;
      gap: var(--idea-space-1);
      min-width: 0;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
  }
  &__checks,
  &__format,
  &__visible-sheets {
    grid-column: 1/-1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--idea-space-3);
  }
  &__format {
    justify-content: space-between;
  }
  &__results {
    display: grid;
    gap: var(--idea-space-2);
  }
  &__results > div:first-child {
    justify-content: space-between;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__results-list {
    max-height: 200px;
    overflow: auto;
    border: 1px solid var(--idea-border-subtle);
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: var(--idea-font-size-body-small);
    }
    th,
    td {
      padding: var(--idea-space-2) var(--idea-space-3);
      text-align: left;
      border-bottom: 1px solid var(--idea-border-subtle);
    }
    td:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    th:first-child,
    td:first-child {
      width: 38%;
    }
  }
  &__actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  &__menu {
    position: fixed;
    z-index: 2600;
    min-width: 180px;
  }
  &__hint {
    padding: var(--idea-space-2) var(--idea-space-3);
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    list-style: none;
    border-top: 1px solid var(--idea-border-subtle);
  }
}
@media (max-width: 560px) {
  .workbook-find-dialog__options {
    grid-template-columns: 1fr;
  }
}
</style>
