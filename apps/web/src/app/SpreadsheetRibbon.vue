<script setup lang="ts">
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { CellStyleDefinition } from "@sheetcraft/core/cell-styles";
import { nextTick, ref, useId, watch } from "vue";
import HomeFormatToolbar from "../modules/home-tools/components/HomeFormatToolbar.vue";
import FormulaToolbar from "../modules/formula-tools/components/FormulaToolbar.vue";
import type { CellMergeMode, CellValueConversionMode } from "@sheetcraft/core/commands";
import type { DefinedNameLabelPosition } from "@sheetcraft/core/commands";
import type { WorkbookCalculationSettings } from "@sheetcraft/core/workbook";
import type { CellFormatTab } from "../modules/cell-format/components/CellFormatDialog.vue";
import type { ConditionalFormatQuickRule } from "../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import type {
  CellBorderAction,
  CellBorderFormatPatch,
  CellStylePatch,
} from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import type { TableStyleDefinition } from "@sheetcraft/core/table-styles";
import type { PivotTableStyleDefinition } from "@sheetcraft/core/pivot-table-styles";
import { useAppI18n } from "../shared/i18n";
import LocaleSwitcher from "./LocaleSwitcher.vue";
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../modules/home-tools/components/data-tool-state";

const props = withDefaults(
  defineProps<{
    theme?: WorkbookTheme;
    state: SelectionCellStyleState;
    disabled: boolean;
    hyperlinkDisabled?: boolean;
    imageDisabled?: boolean;
    conditionalFormattingDisabled?: boolean;
    readOnly?: boolean;
    formatPainterActive?: boolean;
    dataState?: HomeDataToolState;
    mergeState?: MergeCellsState;
    formulaDisabled?: boolean;
    editSessionId?: string;
    recentFunctions?: readonly string[];
    nameCreationEnabled?: boolean;
    calculationSettings?: WorkbookCalculationSettings;
    cellStyles?: readonly CellStyleDefinition[];
    tableStyles?: readonly TableStyleDefinition[];
    pivotTableStyles?: readonly PivotTableStyleDefinition[];
    selectedTableStyleId?: string;
    selectedTableStyleColor?: string;
    hasTable?: boolean;
    hasImage?: boolean;
    hasShape?: boolean;
    hasEquation?: boolean;
    hasChart?: boolean;
    pivotId?: string;
  }>(),
  { conditionalFormattingDisabled: undefined },
);

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
  freeze: [mode: "panes" | "rows" | "columns" | "top-row" | "first-column"];
  unfreeze: [];
  merge: [mode: CellMergeMode];
  unmerge: [];
  insertImage: [mode: "cell" | "floating"];
  insertHyperlink: [];
  undo: [];
  redo: [];
  toggleProtection: [];
  createConditionalFormat: [kind: ConditionalFormatQuickRule];
  manageConditionalFormats: [];
  clearConditionalFormats: [scope: "selection" | "sheet"];
  applyNamedCellStyle: [style: CellStyleDefinition];
  createCellStyle: [];
  editCellStyle: [style: CellStyleDefinition];
  deleteCellStyle: [style: CellStyleDefinition];
  mergeCellStyles: [];
  applyTableStyle: [style: TableStyleDefinition];
  createTableStyle: [];
  editTableStyle: [style: TableStyleDefinition];
  deleteTableStyle: [style: TableStyleDefinition];
  createPivotTableStyle: [];
  editPivotTableStyle: [style: PivotTableStyleDefinition];
  deletePivotTableStyle: [style: PivotTableStyleDefinition];
  clearTableStyle: [];
  manageTable: [];
}>();

const { t, locale } = useAppI18n();
type Category =
  | "home"
  | "insert"
  | "image"
  | "shape"
  | "equation"
  | "chart"
  | "pivot-analysis"
  | "pivot-design"
  | "page"
  | "formulas"
  | "data"
  | "review"
  | "view"
  | "table"
  | "proofreading";
const proofreadingOpen = ref(false);
const activeCategory = ref<Category>("home");
let previousCategory: Exclude<
  Category,
  "table" | "image" | "shape" | "equation" | "chart" | "pivot-analysis" | "pivot-design"
> = "home";
const homeTab = ref<HTMLButtonElement>();
const insertTab = ref<HTMLButtonElement>();
const pivotAnalysisTab = ref<HTMLButtonElement>();
const pivotDesignTab = ref<HTMLButtonElement>();
const imageTab = ref<HTMLButtonElement>();
const equationTab = ref<HTMLButtonElement>();
const chartTab = ref<HTMLButtonElement>();
const shapeTab = ref<HTMLButtonElement>();
const pageTab = ref<HTMLButtonElement>();
const formulaTab = ref<HTMLButtonElement>();
const dataTab = ref<HTMLButtonElement>();
const tableTab = ref<HTMLButtonElement>();
const reviewTab = ref<HTMLButtonElement>();
const viewTab = ref<HTMLButtonElement>();
const proofreadingTab = ref<HTMLButtonElement>();
const tabId = useId();

watch(activeCategory, (category) => {
  if (
    category !== "table" &&
    category !== "image" &&
    category !== "shape" &&
    category !== "equation" &&
    category !== "chart" &&
    category !== "pivot-analysis" &&
    category !== "pivot-design"
  )
    previousCategory = category;
});
watch(
  () => props.hasTable,
  (hasTable) => {
    if (!hasTable && activeCategory.value === "table") activeCategory.value = previousCategory;
  },
);

watch(
  () => props.hasImage,
  (hasImage) => {
    if (hasImage) activeCategory.value = "image";
    else if (activeCategory.value === "image") activeCategory.value = previousCategory;
  },
);

watch(
  () => props.hasShape,
  (hasShape) => {
    if (hasShape) {
      if (!props.hasEquation && !props.hasChart) activeCategory.value = "shape";
    } else if (activeCategory.value === "shape") activeCategory.value = previousCategory;
  },
);
watch(
  () => props.hasEquation,
  (active) => {
    if (active) activeCategory.value = "equation";
    else if (activeCategory.value === "equation")
      activeCategory.value = props.hasShape ? "shape" : previousCategory;
  },
);
watch(
  () => props.hasChart,
  (active) => {
    if (active) activeCategory.value = "chart";
    else if (activeCategory.value === "chart") activeCategory.value = previousCategory;
  },
);
watch(
  () => props.pivotId,
  (id) => {
    if (id && !props.hasImage && !props.hasShape && !props.hasEquation && !props.hasChart)
      activeCategory.value = "pivot-analysis";
    else if (
      !id &&
      (activeCategory.value === "pivot-analysis" || activeCategory.value === "pivot-design")
    )
      activeCategory.value = previousCategory;
  },
);
function onCategoryKeydown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const categories: Category[] = ["home", "insert", "page", "formulas", "data", "review", "view"];
  const tabs = [homeTab, insertTab, pageTab, formulaTab, dataTab, reviewTab, viewTab];
  if (props.hasTable) {
    categories.push("table");
    tabs.push(tableTab);
  }
  if (props.pivotId) {
    categories.push("pivot-analysis", "pivot-design");
    tabs.push(pivotAnalysisTab, pivotDesignTab);
  }
  if (props.hasImage) {
    categories.push("image");
    tabs.push(imageTab);
  }

  if (props.hasShape) {
    categories.push("shape");
    tabs.push(shapeTab);
  }
  if (props.hasEquation) {
    categories.push("equation");
    tabs.push(equationTab);
  }
  if (props.hasChart) {
    categories.push("chart");
    tabs.push(chartTab);
  }
  if (proofreadingOpen.value) {
    categories.push("proofreading");
    tabs.push(proofreadingTab);
  }
  const current = categories.indexOf(activeCategory.value);
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? categories.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
  activeCategory.value = categories[index]!;
  void nextTick(() => tabs[index]?.value?.focus());
}

function openProofreading() {
  proofreadingOpen.value = true;
  activeCategory.value = "proofreading";
  void nextTick(() => proofreadingTab.value?.focus());
}
function closeProofreading() {
  proofreadingOpen.value = false;
  previousCategory = "review";
  activeCategory.value = "review";
  void nextTick(() => reviewTab.value?.focus());
}

defineSlots<{
  "file-actions"?: () => unknown;
  "row-column-tools"?: () => unknown;
  "worksheet-tools"?: () => unknown;
  "data-tools"?: () => unknown;
  "table-tools"?: () => unknown;
  "page-tools"?: () => unknown;
  "insert-tools"?: () => unknown;
  "image-tools"?: () => unknown;
  "shape-tools"?: () => unknown;
  "equation-tools"?: () => unknown;
  "chart-tools"?: () => unknown;
  "pivot-analysis-tools"?: () => unknown;
  "pivot-design-tools"?: () => unknown;
  "review-tools"?: (props: { openProofreading: () => void }) => unknown;
  "view-tools"?: () => unknown;
  "proofreading-tools"?: (props: { close: () => void }) => unknown;
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
            :id="`${tabId}-insert`"
            ref="insertTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'insert' }"
            data-ribbon-category="insert"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'insert'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'insert' ? 0 : -1"
            @click="activeCategory = 'insert'"
          >
            {{ t("ribbon.insert") }}
          </button>
          <button
            :id="`${tabId}-page`"
            ref="pageTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'page' }"
            data-ribbon-category="page"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'page'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'page' ? 0 : -1"
            @click="activeCategory = 'page'"
          >
            {{ t("pageTools.tab") }}
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
          <button
            :id="`${tabId}-review`"
            ref="reviewTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'review' }"
            data-ribbon-category="review"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'review'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'review' ? 0 : -1"
            @click="activeCategory = 'review'"
          >
            {{ t("review.title") }}
          </button>
          <button
            :id="`${tabId}-view`"
            ref="viewTab"
            class="spreadsheet-ribbon__category"
            :class="{ 'is-active': activeCategory === 'view' }"
            data-ribbon-category="view"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'view'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'view' ? 0 : -1"
            @click="activeCategory = 'view'"
          >
            {{ t("ribbon.view") }}
          </button>
          <button
            v-if="pivotId"
            :id="`${tabId}-pivot-analysis`"
            ref="pivotAnalysisTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'pivot-analysis' }"
            data-ribbon-category="pivot-analysis"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'pivot-analysis'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'pivot-analysis' ? 0 : -1"
            @click="activeCategory = 'pivot-analysis'"
          >
            {{ t("pivot.analysis") }}
          </button>
          <button
            v-if="pivotId"
            :id="`${tabId}-pivot-design`"
            ref="pivotDesignTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'pivot-design' }"
            data-ribbon-category="pivot-design"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'pivot-design'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'pivot-design' ? 0 : -1"
            @click="activeCategory = 'pivot-design'"
          >
            {{ t("pivot.design") }}
          </button>
          <button
            v-if="hasChart"
            :id="`${tabId}-chart`"
            ref="chartTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'chart' }"
            data-ribbon-category="chart"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'chart'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'chart' ? 0 : -1"
            @click="activeCategory = 'chart'"
          >
            {{ t("chart.contextTools") }}
          </button>
          <button
            v-if="hasEquation"
            :id="`${tabId}-equation`"
            ref="equationTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'equation' }"
            data-ribbon-category="equation"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'equation'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'equation' ? 0 : -1"
            @click="activeCategory = 'equation'"
          >
            {{ t("equation.tools") }}
          </button>
          <button
            v-if="hasShape"
            :id="`${tabId}-shape`"
            ref="shapeTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'shape' }"
            data-ribbon-category="shape"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'shape'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'shape' ? 0 : -1"
            @click="activeCategory = 'shape'"
          >
            {{ locale === "zh-CN" ? "绘图工具" : "Drawing Tools" }}
          </button>
          <button
            v-if="hasImage"
            :id="`${tabId}-image`"
            ref="imageTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'image' }"
            data-ribbon-category="image"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'image'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'image' ? 0 : -1"
            @click="activeCategory = 'image'"
          >
            {{ t("image.tools") }}
          </button>
          <button
            v-if="hasTable"
            :id="`${tabId}-table`"
            ref="tableTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'table' }"
            data-ribbon-category="table"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'table'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'table' ? 0 : -1"
            @click="activeCategory = 'table'"
          >
            {{ t("tables.tools") }}
          </button>
          <button
            v-if="proofreadingOpen"
            :id="`${tabId}-proofreading`"
            ref="proofreadingTab"
            class="spreadsheet-ribbon__category spreadsheet-ribbon__category--contextual"
            :class="{ 'is-active': activeCategory === 'proofreading' }"
            data-ribbon-category="proofreading"
            type="button"
            role="tab"
            :aria-selected="activeCategory === 'proofreading'"
            :aria-controls="`${tabId}-panel`"
            :tabindex="activeCategory === 'proofreading' ? 0 : -1"
            @click="activeCategory = 'proofreading'"
          >
            {{ t("wordProof.title") }}
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
        :theme="theme"
        :theme-accent-color="theme?.accentColors[0]"
        :state="state"
        :disabled="disabled"
        :hyperlink-disabled="hyperlinkDisabled"
        :image-disabled="imageDisabled"
        :conditional-formatting-disabled="conditionalFormattingDisabled"
        :read-only="readOnly"
        :format-painter-active="formatPainterActive"
        :data-state="dataState"
        :merge-state="mergeState"
        :cell-styles="cellStyles"
        :table-styles="tableStyles"
        :pivot-table-styles="pivotTableStyles"
        :selected-table-style-id="selectedTableStyleId"
        :selected-table-style-color="selectedTableStyleColor"
        :has-table="hasTable"
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
        @insert-hyperlink="emit('insertHyperlink')"
        @undo="emit('undo')"
        @redo="emit('redo')"
        @toggle-protection="emit('toggleProtection')"
        @open-data-tools="activeCategory = 'data'"
        @create-conditional-format="emit('createConditionalFormat', $event)"
        @manage-conditional-formats="emit('manageConditionalFormats')"
        @clear-conditional-formats="emit('clearConditionalFormats', $event)"
        @apply-named-cell-style="emit('applyNamedCellStyle', $event)"
        @create-cell-style="emit('createCellStyle')"
        @edit-cell-style="emit('editCellStyle', $event)"
        @delete-cell-style="emit('deleteCellStyle', $event)"
        @merge-cell-styles="emit('mergeCellStyles')"
        @apply-table-style="emit('applyTableStyle', $event)"
        @create-table-style="emit('createTableStyle')"
        @edit-table-style="emit('editTableStyle', $event)"
        @delete-table-style="emit('deleteTableStyle', $event)"
        @create-pivot-table-style="emit('createPivotTableStyle')"
        @edit-pivot-table-style="emit('editPivotTableStyle', $event)"
        @delete-pivot-table-style="emit('deletePivotTableStyle', $event)"
        @clear-table-style="emit('clearTableStyle')"
        @manage-table="emit('manageTable')"
      >
        <template v-if="$slots['row-column-tools']" #row-column-tools>
          <slot name="row-column-tools" />
        </template>
        <template v-if="$slots['worksheet-tools']" #worksheet-tools>
          <slot name="worksheet-tools" />
        </template>
      </HomeFormatToolbar>
      <slot v-else-if="activeCategory === 'image'" name="image-tools" />
      <slot v-else-if="activeCategory === 'shape'" name="shape-tools" />
      <slot v-else-if="activeCategory === 'equation'" name="equation-tools" />
      <slot v-else-if="activeCategory === 'chart'" name="chart-tools" />
      <slot v-else-if="activeCategory === 'pivot-analysis'" name="pivot-analysis-tools" />
      <slot v-else-if="activeCategory === 'pivot-design'" name="pivot-design-tools" />
      <slot v-else-if="activeCategory === 'insert'" name="insert-tools" />
      <slot v-else-if="activeCategory === 'page'" name="page-tools" />
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
      <slot v-else-if="activeCategory === 'data'" name="data-tools" />
      <slot
        v-else-if="activeCategory === 'proofreading'"
        name="proofreading-tools"
        :close="closeProofreading"
      />
      <slot
        v-else-if="activeCategory === 'review'"
        name="review-tools"
        :open-proofreading="openProofreading"
      />
      <slot v-else-if="activeCategory === 'view'" name="view-tools" />
      <slot v-else name="table-tools" />
    </section>
  </header>
</template>

<style scoped lang="scss">
.spreadsheet-ribbon {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--sheetcraft-surface-canvas);
  border-bottom: 1px solid var(--sheetcraft-border-control);

  &__categories {
    display: flex;
    flex: 0 0 30px;
    align-items: stretch;
    justify-content: space-between;
    min-width: 0;
    border-bottom: 1px solid var(--sheetcraft-border-subtle);
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
    color: var(--sheetcraft-text-primary);
    font: inherit;
    cursor: pointer;
    font-size: var(--sheetcraft-font-size-body-medium);
    font-weight: var(--sheetcraft-font-weight-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    white-space: nowrap;

    &--contextual {
      color: var(--sheetcraft-action-primary);
    }

    &.is-active {
      color: var(--sheetcraft-action-primary);
    }

    &.is-active::after {
      position: absolute;
      right: 8px;
      bottom: -1px;
      left: 8px;
      height: 2px;
      background: var(--sheetcraft-action-primary);
      content: "";
    }
  }

  &__panel {
    flex: 0 0 var(--sheetcraft-ribbon-toolbar-height);
    min-width: 0;
    margin: 0 8px;
    overflow: hidden;
    background: var(--sheetcraft-surface-panel);
    border-radius: 6px;
  }
}
</style>
