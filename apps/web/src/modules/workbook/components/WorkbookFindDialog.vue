<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import type { SheetSearchFormat } from "@idea10/core/search";
import WorkbookFindFormatPreview from "./WorkbookFindFormatPreview.vue";
import WorkbookFindResults from "./WorkbookFindResults.vue";
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
    format?: SheetSearchFormat;
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
    @opened="input?.focus()"
    @close="close"
    @closed="emit('closed')"
  >
    <div class="workbook-find-dialog">
      <section class="workbook-find-dialog__form">
        <div class="workbook-find-dialog__query-row">
          <span class="workbook-find-dialog__query-label">{{
            t("navigation.findQueryLabel")
          }}</span>
          <Textarea
            class="workbook-find-dialog__query"
            :value="query"
            v-native-control="{
              onElement: setInput,
              attributes: { 'aria-label': t('navigation.findQueryLabel') },
            }"
            autocomplete="off"
            :spell-check="false"
            :autosize="{ minRows: 1, maxRows: 3 }"
            data-search-input
            @update:value="emit('updateQuery', String($event))"
            @keydown="(_value, { e }) => onKeydown(e)"
          />
          <WorkbookFindFormatPreview
            :format="format"
            :title="formatSummary"
            :empty-label="t('navigation.findFormatUnset')"
          />
          <Button
            ref="formatTrigger"
            variant="outline"
            :aria-expanded="formatOpen"
            :aria-controls="formatOpen ? formatId : undefined"
            @click="toggleFormat"
            @keydown="formatKeydown"
            >{{ t("navigation.findFormat") }}<template #suffix><ChevronDown :size="14" /></template
          ></Button>
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
          <Button
            ref="specialTrigger"
            variant="outline"
            :aria-label="t('navigation.findSpecialContent')"
            :aria-expanded="specialOpen"
            :aria-controls="specialOpen ? specialId : undefined"
            @click="toggleSpecial"
            @keydown="specialKeydown"
            >{{ t("navigation.findSpecialContent")
            }}<template #suffix><ChevronDown :size="14" /></template
          ></Button>
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
  grid-template-columns: minmax(0, 1fr);
  gap: var(--idea-space-4);
  min-width: 0;
  &__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--idea-space-4);
    min-width: 0;
    padding: var(--idea-space-3);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-medium);
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
