<script setup lang="ts">
import { nextTick, ref, useId } from "vue";
import HomeFormatToolbar from "../modules/home-tools/components/HomeFormatToolbar.vue";
import FormulaToolbar from "../modules/formula-tools/components/FormulaToolbar.vue";
import type { CellMergeMode, CellValueConversionMode } from "@idea10/core/commands";
import type { DefinedNameLabelPosition } from "@idea10/core/commands";
import type { WorkbookCalculationSettings } from "@idea10/core/workbook";
import type { CellFormatTab } from "../modules/cell-format/components/CellFormatDialog.vue";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../shared/i18n";
import LocaleSwitcher from "./LocaleSwitcher.vue";
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../modules/home-tools/components/data-tool-state";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  readOnly?: boolean;
  formatPainterActive?: boolean;
  dataState?: HomeDataToolState;
  mergeState?: MergeCellsState;
  formulaDisabled?: boolean;
  editSessionId?: string;
  recentFunctions?: readonly string[];
  nameCreationEnabled?: boolean;
  calculationSettings?: WorkbookCalculationSettings;
}>();

const emit = defineEmits<{
  applyBorders: [action: CellBorderAction];
  updateBorderFormat: [patch: CellBorderFormatPatch];
  openCellFormat: [tab: CellFormatTab];
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  convertNumberType: [mode: CellValueConversionMode];
  adjustIndent: [delta: -1 | 1];
  activateFormatPainter: [];
  autoSum: [];
  insertFunction: [name: string];
  aggregate: [name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN"];
  openNames: [];
  createNamesFromSelection: [positions: readonly DefinedNameLabelPosition[]];
  updateCalculationSettings: [settings: WorkbookCalculationSettings];
  recalculate: [];
  formulaInteractionEnd: [];
  sort: [direction: "ascending" | "descending"];
  applyFilter: [includedKeys: FilterValueKey[]];
  clearFilter: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
  merge: [mode: CellMergeMode];
  unmerge: [];
  insertImage: [mode: "cell" | "floating"];
  undo: [];
  redo: [];
  toggleProtection: [];
}>();

const { t } = useAppI18n();
const activeCategory = ref<"home" | "formulas" | "data">("home");
const homeTab = ref<HTMLButtonElement>();
const formulaTab = ref<HTMLButtonElement>();
const dataTab = ref<HTMLButtonElement>();
const tabId = useId();

function onCategoryKeydown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const categories = ["home", "formulas", "data"] as const;
  const current = categories.indexOf(activeCategory.value);
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? categories.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
  activeCategory.value = categories[index]!;
  void nextTick(() => [homeTab, formulaTab, dataTab][index]?.value?.focus());
}

defineSlots<{
  "file-actions"?: () => unknown;
  "row-column-tools"?: () => unknown;
  "worksheet-tools"?: () => unknown;
  "data-tools"?: () => unknown;
}>();
</script>

<template>
  <header class="spreadsheet-ribbon" :aria-label="t('ribbon.label')">
    <div class="spreadsheet-ribbon__categories">
      <nav class="spreadsheet-ribbon__category-list" :aria-label="t('ribbon.categories')">
        <div
          class="spreadsheet-ribbon__tabs"
          role="tablist"
          :aria-label="t('ribbon.categories')"
          :data-cell-edit-session="editSessionId"
          @keydown="onCategoryKeydown"
        >
          <button
            :id="`${tabId}-home`"
            ref="homeTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'home' }"
            data-ribbon-category="home"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'home'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'home' ? 0 : -1"
            @click="activeCategory = 'home'"
          >
            {{ t("ribbon.home") }}
          </button>
          <button
            :id="`${tabId}-formulas`"
            ref="formulaTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'formulas' }"
            data-ribbon-category="formulas"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'formulas'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'formulas' ? 0 : -1"
            @click="activeCategory = 'formulas'"
          >
            {{ t("ribbon.formulas") }}
          </button>
          <button
            :id="`${tabId}-data`"
            ref="dataTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'data' }"
            data-ribbon-category="data"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'data'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'data' ? 0 : -1"
            @click="activeCategory = 'data'"
          >
            {{ t("ribbon.data") }}
          </button>
        </div>
        <slot name="file-actions" />
      </nav>
      <LocaleSwitcher />
    </div>
    <section
      :id="`${tabId}-panel`"
      class="spreadsheet-ribbon__panel"
      role="tabpanel"
      :aria-labelledby="`${tabId}-${activeCategory}`"
    >
      <HomeFormatToolbar
        v-if="activeCategory === 'home'"
        :edit-session-id="editSessionId"
        :state="state"
        :disabled="disabled"
        :read-only="readOnly"
        :format-painter-active="formatPainterActive"
        :data-state="dataState"
        :merge-state="mergeState"
        @apply-borders="emit('applyBorders', $event)"
        @update-border-format="emit('updateBorderFormat', $event)"
        @open-cell-format="emit('openCellFormat', $event)"
        @apply-style="emit('applyStyle', $event)"
        @adjust-decimals="emit('adjustDecimals', $event)"
        @convert-number-type="emit('convertNumberType', $event)"
        @adjust-indent="emit('adjustIndent', $event)"
        @activate-format-painter="emit('activateFormatPainter')"
        @auto-sum="emit('autoSum')"
        @sort="emit('sort', $event)"
        @apply-filter="emit('applyFilter', $event)"
        @clear-filter="emit('clearFilter')"
        @freeze="emit('freeze', $event)"
        @unfreeze="emit('unfreeze')"
        @merge="emit('merge', $event)"
        @unmerge="emit('unmerge')"
        @insert-image="emit('insertImage', $event)"
        @undo="emit('undo')"
        @redo="emit('redo')"
        @toggle-protection="emit('toggleProtection')"
        @open-data-tools="activeCategory = 'data'"
      >
        <template v-if="$slots['row-column-tools']" #row-column-tools>
          <slot name="row-column-tools" />
        </template>
        <template v-if="$slots['worksheet-tools']" #worksheet-tools>
          <slot name="worksheet-tools" />
        </template>
      </HomeFormatToolbar>
      <FormulaToolbar
        v-else-if="activeCategory === 'formulas'"
        :disabled="formulaDisabled ?? disabled"
        :edit-session-id="editSessionId"
        :recent-functions="recentFunctions"
        :name-creation-enabled="nameCreationEnabled"
        :calculation-settings="calculationSettings"
        @insert-function="emit('insertFunction', $event)"
        @aggregate="emit('aggregate', $event)"
        @open-names="emit('openNames')"
        @create-names-from-selection="emit('createNamesFromSelection', $event)"
        @update-calculation-settings="emit('updateCalculationSettings', $event)"
        @recalculate="emit('recalculate')"
        @interaction-end="emit('formulaInteractionEnd')"
      />
      <slot v-else name="data-tools" />
    </section>
  </header>
</template>

<style scoped lang="scss">
.spreadsheet-ribbon {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--idea-surface-canvas);
  border-bottom: 1px solid var(--idea-border-control);

  &__categories {
    display: flex;
    flex: 0 0 30px;
    align-items: stretch;
    justify-content: space-between;
    min-width: 0;
    border-bottom: 1px solid var(--idea-border-subtle);
  }

  &__category-list {
    display: flex;
    min-width: 0;
    padding-left: 4px;
  }

  &__tabs {
    display: flex;
    align-items: stretch;
  }

  &__category {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: var(--idea-text-primary);
    font: inherit;
    cursor: pointer;
    font-size: var(--idea-font-size-body-medium);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
    white-space: nowrap;

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -3px;
    }

    &.is-active {
      color: var(--idea-action-primary);
    }

    &.is-active::after {
      position: absolute;
      right: 8px;
      bottom: -1px;
      left: 8px;
      height: 2px;
      background: var(--idea-action-primary);
      content: "";
    }
  }

  &__panel {
    flex: 0 0 68px;
    min-width: 0;
    margin: 0 8px;
    overflow: hidden;
    background: var(--idea-surface-panel);
    border-radius: 6px;
  }
}
</style>
