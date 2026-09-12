<script setup lang="ts">
import {
  Banknote,
  Calculator,
  CalendarDays,
  CaseSensitive,
  ChartColumn,
  Database,
  FunctionSquare,
  GitBranch,
  Info,
  Radical,
  RotateCcw,
  Search,
  Sigma,
  Tags,
  Wrench,
} from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import type { DefinedNameLabelPosition } from "@idea10/core/commands";
import type { WorkbookCalculationSettings } from "@idea10/core/workbook";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonIconAction from "../../home-tools/components/RibbonIconAction.vue";
import RibbonSplitAction from "../../home-tools/components/RibbonSplitAction.vue";
import FormulaCategoryMenu from "./FormulaCategoryMenu.vue";
import FormulaFunctionBrowser from "./FormulaFunctionBrowser.vue";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    editSessionId?: string;
    recentFunctions?: readonly string[];
    nameCreationEnabled?: boolean;
    calculationSettings?: WorkbookCalculationSettings;
  }>(),
  {
    disabled: false,
    editSessionId: undefined,
    recentFunctions: () => [],
    nameCreationEnabled: false,
    calculationSettings: undefined,
  },
);
const emit = defineEmits<{
  insertFunction: [name: string];
  aggregate: [name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN"];
  openNames: [];
  createNamesFromSelection: [positions: DefinedNameLabelPosition[]];
  updateCalculationSettings: [settings: WorkbookCalculationSettings];
  recalculate: [];
  interactionEnd: [];
}>();
const { t } = useAppI18n();
const sumSplitRef = ref<InstanceType<typeof RibbonSplitAction> | null>(null);
const sumTriggerRef = computed(() => sumSplitRef.value?.menuElement ?? null);
const sumPanelRef = ref<HTMLElement | null>(null);
const sumMenuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const sumMenuOpen = ref(false);
const browserOpen = ref(false);
const nameSplitRef = ref<InstanceType<typeof RibbonSplitAction> | null>(null);
const nameTriggerRef = computed(() => nameSplitRef.value?.menuElement ?? null);
const namePanelRef = ref<HTMLElement | null>(null);
const nameMenuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const nameMenuOpen = ref(false);
const calculationSplitRef = ref<InstanceType<typeof RibbonSplitAction> | null>(null);
const calculationTriggerRef = computed(() => calculationSplitRef.value?.menuElement ?? null);
const calculationPanelRef = ref<HTMLElement | null>(null);
const calculationMenuOpen = ref(false);
const sumMenuId = `formula-sum-${Math.random().toString(36).slice(2)}`;
const nameMenuId = `formula-name-${Math.random().toString(36).slice(2)}`;
const calculationMenuId = `formula-calculation-${Math.random().toString(36).slice(2)}`;
const aggregates: ReadonlyArray<{
  name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";
  label: string;
}> = [
  { name: "SUM", label: "SUM" },
  { name: "AVERAGE", label: "AVERAGE" },
  { name: "COUNT", label: "COUNT" },
  { name: "MAX", label: "MAX" },
  { name: "MIN", label: "MIN" },
];
const { floatingStyles } = useDismissibleFloatingPanel(sumTriggerRef, sumPanelRef, sumMenuOpen, {
  placement: "bottom-start",
  offset: 4,
  onDismiss: () => {
    sumMenuOpen.value = false;
  },
});
const { floatingStyles: nameMenuStyles } = useDismissibleFloatingPanel(
  nameTriggerRef,
  namePanelRef,
  nameMenuOpen,
  {
    placement: "bottom-start",
    offset: 4,
    onDismiss: () => {
      nameMenuOpen.value = false;
    },
  },
);
const { floatingStyles: calculationMenuStyles } = useDismissibleFloatingPanel(
  calculationTriggerRef,
  calculationPanelRef,
  calculationMenuOpen,
  {
    placement: "bottom-start",
    offset: 4,
    onDismiss: () => {
      calculationMenuOpen.value = false;
    },
  },
);
function toggleSumMenu(): void {
  if (!props.disabled) sumMenuOpen.value = !sumMenuOpen.value;
}
function chooseAggregate(name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN"): void {
  sumMenuOpen.value = false;
  emit("aggregate", name);
}
function openSumMenuFromKeyboard(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    sumMenuOpen.value = true;
    void nextTick(() => sumMenuRef.value?.focusFirstItem());
  }
}
function closeBrowser(): void {
  browserOpen.value = false;
  emit("interactionEnd");
}
function toggleNameMenu(): void {
  if (!props.disabled && props.nameCreationEnabled) nameMenuOpen.value = !nameMenuOpen.value;
}
function openNameMenuFromKeyboard(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" && props.nameCreationEnabled) {
    event.preventDefault();
    nameMenuOpen.value = true;
    void nextTick(() => nameMenuRef.value?.focusFirstItem());
  }
}
function createNamesFromSelection(position: DefinedNameLabelPosition): void {
  nameMenuOpen.value = false;
  emit("createNamesFromSelection", [position]);
}
function toggleCalculationMenu(): void {
  if (!props.disabled && props.calculationSettings)
    calculationMenuOpen.value = !calculationMenuOpen.value;
}
function updateCalculationSettings(patch: Partial<WorkbookCalculationSettings>): void {
  if (!props.calculationSettings) return;
  emit("updateCalculationSettings", { ...props.calculationSettings, ...patch });
}
function updateNumericCalculationSetting(key: "maxIterations" | "maxChange", event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value) || value <= 0) return;
  updateCalculationSettings({ [key]: key === "maxIterations" ? Math.floor(value) : value });
}
function updateIterativeCalculation(event: Event): void {
  updateCalculationSettings({ iterative: (event.target as HTMLInputElement).checked });
}
function insertFunction(name: string): void {
  emit("insertFunction", name);
  closeBrowser();
}
</script>

<template>
  <div
    class="formula-toolbar"
    role="group"
    data-ribbon-tools
    :aria-label="t('formulaTools.toolbar')"
    :data-cell-edit-session="editSessionId"
  >
    <div class="formula-toolbar__rail">
      <section
        class="formula-toolbar__group formula-toolbar__group--sum"
        data-ribbon-group="formula-sum"
        role="group"
        :aria-label="t('formulaTools.autoSum')"
      >
        <RibbonSplitAction
          ref="sumSplitRef"
          variant="tall"
          :label="t('formulaTools.autoSum')"
          :menu-label="t('formulaTools.autoSumMenu')"
          :text="t('formulaTools.autoSum')"
          :disabled="disabled"
          :menu-disabled="disabled"
          :expanded="sumMenuOpen"
          :menu-id="sumMenuId"
          @activate="chooseAggregate('SUM')"
          @toggle-menu="toggleSumMenu"
          @menu-keydown="openSumMenuFromKeyboard"
          ><Sigma :size="19"
        /></RibbonSplitAction>
        <Teleport to="body"
          ><div
            v-if="sumMenuOpen"
            :id="sumMenuId"
            ref="sumPanelRef"
            class="formula-toolbar__sum-menu"
            role="presentation"
            tabindex="-1"
            :style="floatingStyles"
            :data-cell-edit-session="editSessionId"
          >
            <MenuSurface ref="sumMenuRef" :label="t('formulaTools.autoSumMenu')"
              ><MenuItem
                v-for="aggregate in aggregates"
                :key="aggregate.name"
                :data-formula-aggregate="aggregate.name"
                @select="chooseAggregate(aggregate.name)"
                >{{ aggregate.label }}</MenuItem
              ></MenuSurface
            >
          </div></Teleport
        >
      </section>
      <section
        class="formula-toolbar__group formula-toolbar__group--categories"
        data-ribbon-group="formula-categories"
        role="group"
        :aria-label="t('formulaTools.categories')"
      >
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Financial"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Banknote :size="16" /></template>
          </FormulaCategoryMenu>
          <FormulaCategoryMenu
            category="Logical"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><GitBranch :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Text"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><CaseSensitive :size="16" /></template>
          </FormulaCategoryMenu>
          <FormulaCategoryMenu
            category="Date"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><CalendarDays :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Statistical"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><ChartColumn :size="16" /></template>
          </FormulaCategoryMenu>
          <FormulaCategoryMenu
            category="Engineering"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Wrench :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Information"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Info :size="16" /></template>
          </FormulaCategoryMenu>
          <FormulaCategoryMenu
            category="Database"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Database :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Lookup"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Search :size="16" /></template>
          </FormulaCategoryMenu>
          <FormulaCategoryMenu
            category="Math"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><Radical :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Compatibility"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          >
            <template #icon><RotateCcw :size="16" /></template>
          </FormulaCategoryMenu>
        </div>
      </section>
      <section
        class="formula-toolbar__group formula-toolbar__group--actions"
        data-ribbon-group="formula-actions"
        role="group"
        :aria-label="t('formulaTools.toolbar')"
      >
        <RibbonSplitAction
          ref="nameSplitRef"
          variant="tall"
          :label="t('formulaTools.defineName')"
          :menu-label="t('formulaTools.defineNameMenu')"
          :text="t('formulaTools.defineName')"
          :disabled="disabled"
          :menu-disabled="disabled || !nameCreationEnabled"
          :expanded="nameMenuOpen"
          :menu-id="nameMenuId"
          @activate="emit('openNames')"
          @toggle-menu="toggleNameMenu"
          @menu-keydown="openNameMenuFromKeyboard"
          ><Tags :size="18"
        /></RibbonSplitAction>
        <Teleport to="body"
          ><div
            v-if="nameMenuOpen"
            :id="nameMenuId"
            ref="namePanelRef"
            class="formula-toolbar__name-menu"
            role="presentation"
            tabindex="-1"
            :style="nameMenuStyles"
            :data-cell-edit-session="editSessionId"
          >
            <MenuSurface ref="nameMenuRef" :label="t('formulaTools.defineNameMenu')"
              ><MenuItem
                data-formula-name-position="top"
                @select="createNamesFromSelection('top')"
                >{{ t("formulaTools.nameFromTopRow") }}</MenuItem
              ><MenuItem
                data-formula-name-position="left"
                @select="createNamesFromSelection('left')"
                >{{ t("formulaTools.nameFromLeftColumn") }}</MenuItem
              ><MenuItem
                data-formula-name-position="bottom"
                @select="createNamesFromSelection('bottom')"
                >{{ t("formulaTools.nameFromBottomRow") }}</MenuItem
              ><MenuItem
                data-formula-name-position="right"
                @select="createNamesFromSelection('right')"
                >{{ t("formulaTools.nameFromRightColumn") }}</MenuItem
              ></MenuSurface
            >
          </div></Teleport
        >
        <RibbonIconAction
          variant="tall"
          :label="t('formulaTools.nameManager')"
          :text="t('formulaTools.nameManager')"
          :disabled="disabled"
          @activate="emit('openNames')"
          ><Tags :size="18"
        /></RibbonIconAction>
        <RibbonSplitAction
          ref="calculationSplitRef"
          variant="tall"
          :label="t('formulaTools.recalculate')"
          :menu-label="t('formulaTools.calculationOptions')"
          :text="t('formulaTools.recalculate')"
          :disabled="disabled"
          :menu-disabled="disabled || !calculationSettings"
          :expanded="calculationMenuOpen"
          :menu-id="calculationMenuId"
          popup-role="dialog"
          @activate="emit('recalculate')"
          @toggle-menu="toggleCalculationMenu"
          ><Calculator :size="18"
        /></RibbonSplitAction>
        <Teleport to="body"
          ><section
            v-if="calculationMenuOpen && calculationSettings"
            :id="calculationMenuId"
            ref="calculationPanelRef"
            class="formula-toolbar__calculation-menu"
            role="dialog"
            :aria-label="t('formulaTools.calculationOptions')"
            tabindex="-1"
            :style="calculationMenuStyles"
            :data-cell-edit-session="editSessionId"
          >
            <fieldset>
              <legend>{{ t("formulaTools.calculation") }}</legend>
              <label
                ><input
                  type="radio"
                  name="calculation-mode"
                  :checked="calculationSettings.mode === 'automatic'"
                  @change="updateCalculationSettings({ mode: 'automatic' })"
                />{{ t("formulaTools.automaticCalculation") }}</label
              ><label
                ><input
                  type="radio"
                  name="calculation-mode"
                  :checked="calculationSettings.mode === 'manual'"
                  @change="updateCalculationSettings({ mode: 'manual' })"
                />{{ t("formulaTools.manualCalculation") }}</label
              >
            </fieldset>
            <fieldset>
              <label
                ><input
                  type="checkbox"
                  :checked="calculationSettings.iterative"
                  @change="updateIterativeCalculation"
                />{{ t("formulaTools.iterativeCalculation") }}</label
              >
              <label
                >{{ t("formulaTools.maximumIterations") }}
                <input
                  type="number"
                  min="1"
                  step="1"
                  :disabled="!calculationSettings.iterative"
                  :value="calculationSettings.maxIterations"
                  @change="updateNumericCalculationSetting('maxIterations', $event)"
                />
              </label>
              <label
                >{{ t("formulaTools.maximumChange") }}
                <input
                  type="number"
                  min="0.000000001"
                  step="any"
                  :disabled="!calculationSettings.iterative"
                  :value="calculationSettings.maxChange"
                  @change="updateNumericCalculationSetting('maxChange', $event)"
                />
              </label>
            </fieldset></section
        ></Teleport>
        <RibbonIconAction
          variant="tall"
          :label="t('formulaTools.insertFunction')"
          :text="t('formulaTools.insertFunction')"
          :disabled="disabled"
          @activate="browserOpen = true"
          ><FunctionSquare :size="18"
        /></RibbonIconAction>
      </section>
    </div>
    <FormulaFunctionBrowser
      :visible="browserOpen"
      :recent-functions="recentFunctions"
      :edit-session-id="editSessionId"
      @close="closeBrowser"
      @insert-function="insertFunction"
    />
  </div>
</template>

<style scoped lang="scss">
.formula-toolbar {
  height: 68px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--idea-surface-panel);
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
  &__rail {
    display: flex;
    align-items: stretch;
    width: max-content;
    min-width: 100%;
    height: 56px;
    padding: 5px 8px;
  }
  &__group {
    flex: 0 0 auto;
    min-width: max-content;
    padding: 1px 3px;
    border-right: 1px solid var(--idea-border-subtle);
  }
  &__group--sum {
    display: flex;
    align-items: center;
  }
  &__group--categories {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-inline: 8px;
  }
  &__category-column {
    display: grid;
    grid-template-rows: repeat(2, 26px);
    min-width: 86px;
    gap: 1px;
  }
  &__group--actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-inline: 7px;
  }
  &__sum-menu {
    z-index: 40;
  }
  &__name-menu,
  &__calculation-menu {
    z-index: 40;
  }
  &__calculation-menu {
    display: grid;
    gap: 10px;
    min-width: 224px;
    padding: 12px;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    box-shadow: var(--idea-shadow-floating);
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    fieldset {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 6px;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
    label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    input[type="number"] {
      width: 82px;
      min-height: 26px;
      padding-inline: 5px;
      background: var(--idea-surface-canvas);
      border: 1px solid var(--idea-border-control);
      border-radius: var(--idea-radius-default);
      color: inherit;
      font: inherit;
    }
  }
}
</style>
