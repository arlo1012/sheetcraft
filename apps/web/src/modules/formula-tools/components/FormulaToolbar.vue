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
  Plus,
  Radical,
  RotateCcw,
  Search,
  Sigma,
  Tags,
  Wrench,
} from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import type { RadioValue } from "tdesign-vue-next/es/radio/type";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { DefinedNameLabelPosition } from "@idea10/core/commands";
import type { WorkbookCalculationSettings } from "@idea10/core/workbook";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
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
const sumSplitRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const sumTriggerRef = computed(() => sumSplitRef.value?.menuElement ?? null);
const sumPanelRef = ref<HTMLElement | null>(null);
const sumMenuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const sumMenuOpen = ref(false);
const browserOpen = ref(false);
const nameQuickCreateRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const nameTriggerRef = computed(() => nameQuickCreateRef.value?.rootElement ?? null);
const namePanelRef = ref<HTMLElement | null>(null);
const nameMenuOpen = ref(false);
const calculationSplitRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const calculationTriggerRef = computed(() => calculationSplitRef.value?.menuElement ?? null);
const calculationPanelRef = ref<HTMLElement | null>(null);
const calculationMenuOpen = ref(false);
const sumMenuId = `formula-sum-${Math.random().toString(36).slice(2)}`;
const nameMenuId = `formula-name-create-${Math.random().toString(36).slice(2)}`;
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
const namePositions = ref<Record<DefinedNameLabelPosition, boolean>>({
  top: true,
  left: false,
  bottom: false,
  right: false,
});
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
function openNameMenu(): void {
  if (props.disabled || !props.nameCreationEnabled) return;
  if (!nameMenuOpen.value) {
    namePositions.value = { top: true, left: false, bottom: false, right: false };
    nameMenuOpen.value = true;
  } else {
    nameMenuOpen.value = false;
  }
}
function createNamesFromSelection(): void {
  const positions = (
    Object.entries(namePositions.value) as Array<[DefinedNameLabelPosition, boolean]>
  )
    .filter(([, selected]) => selected)
    .map(([position]) => position);
  if (!positions.length) return;
  nameMenuOpen.value = false;
  emit("createNamesFromSelection", positions);
}
function toggleCalculationMenu(): void {
  if (!props.disabled && props.calculationSettings)
    calculationMenuOpen.value = !calculationMenuOpen.value;
}
function updateCalculationSettings(patch: Partial<WorkbookCalculationSettings>): void {
  if (!props.calculationSettings) return;
  emit("updateCalculationSettings", { ...props.calculationSettings, ...patch });
}
function updateNumericCalculationSetting(
  key: "maxIterations" | "maxChange",
  value: InputNumberValue,
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
  if (key === "maxIterations" && (!Number.isInteger(value) || value > 10000)) return;
  updateCalculationSettings({ [key]: value });
}
function updateCalculationMode(value: RadioValue): void {
  if (value === "automatic" || value === "manual") updateCalculationSettings({ mode: value });
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
        <RibbonSplitButton
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
        /></RibbonSplitButton>
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
        <RibbonButton
          variant="tall"
          :label="t('formulaTools.nameManager')"
          :text="t('formulaTools.nameManager')"
          :disabled="disabled"
          @activate="emit('openNames')"
          ><Tags :size="18"
        /></RibbonButton>
        <RibbonMenuButton
          ref="nameQuickCreateRef"
          variant="tall"
          :label="t('formulaTools.quickCreateNames')"
          :text="t('formulaTools.quickCreateNames')"
          :disabled="disabled || !nameCreationEnabled"
          :expanded="nameMenuOpen"
          :menu-id="nameMenuId"
          popup-role="dialog"
          @activate="openNameMenu"
          ><Plus :size="18"
        /></RibbonMenuButton>
        <Teleport to="body"
          ><section
            v-if="nameMenuOpen"
            :id="nameMenuId"
            ref="namePanelRef"
            class="formula-toolbar__name-menu"
            role="dialog"
            :aria-label="t('formulaTools.createNamesFromSelection')"
            tabindex="-1"
            :style="nameMenuStyles"
            :data-cell-edit-session="editSessionId"
          >
            <p>{{ t("formulaTools.createNamesFromSelection") }}</p>
            <TCheckbox v-model="namePositions.top" data-formula-name-position="top">{{
              t("formulaTools.nameFromTopRow")
            }}</TCheckbox>
            <TCheckbox v-model="namePositions.left" data-formula-name-position="left">{{
              t("formulaTools.nameFromLeftColumn")
            }}</TCheckbox>
            <TCheckbox v-model="namePositions.bottom" data-formula-name-position="bottom">{{
              t("formulaTools.nameFromBottomRow")
            }}</TCheckbox>
            <TCheckbox v-model="namePositions.right" data-formula-name-position="right">{{
              t("formulaTools.nameFromRightColumn")
            }}</TCheckbox>
            <div class="formula-toolbar__name-menu-actions">
              <TButton variant="outline" theme="default" @click="nameMenuOpen = false">{{
                t("formulaTools.cancel")
              }}</TButton>
              <TButton
                theme="primary"
                data-formula-name-confirm
                :disabled="!Object.values(namePositions).some(Boolean)"
                @click="createNamesFromSelection"
                >{{ t("formulaTools.createNamesFromSelection") }}</TButton
              >
            </div>
          </section></Teleport
        >
        <RibbonSplitButton
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
        /></RibbonSplitButton>
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
            <div
              class="formula-toolbar__calculation-mode"
              role="group"
              :aria-label="t('formulaTools.calculation')"
            >
              <span>{{ t("formulaTools.calculation") }}</span>
              <TRadioGroup
                :value="calculationSettings.mode"
                direction="vertical"
                @change="updateCalculationMode"
              >
                <TRadio value="automatic">{{ t("formulaTools.automaticCalculation") }}</TRadio>
                <TRadio value="manual">{{ t("formulaTools.manualCalculation") }}</TRadio>
              </TRadioGroup>
            </div>
            <TCheckbox
              :checked="calculationSettings.iterative"
              @change="updateCalculationSettings({ iterative: $event })"
              >{{ t("formulaTools.iterativeCalculation") }}</TCheckbox
            >
            <div
              class="formula-toolbar__number-field"
              role="group"
              :aria-label="t('formulaTools.maximumIterations')"
            >
              <span>{{ t("formulaTools.maximumIterations") }}</span>
              <TInputNumber
                class="idea-input-number--persistent-controls"
                theme="column"
                :value="calculationSettings.maxIterations"
                :min="1"
                :max="10000"
                :decimal-places="0"
                :allow-input-over-limit="false"
                :disabled="!calculationSettings.iterative"
                :input-props="{ name: 'maxIterations' }"
                @change="updateNumericCalculationSetting('maxIterations', $event)"
              />
            </div>
            <div
              class="formula-toolbar__number-field"
              role="group"
              :aria-label="t('formulaTools.maximumChange')"
            >
              <span>{{ t("formulaTools.maximumChange") }}</span>
              <TInputNumber
                class="idea-input-number--persistent-controls"
                theme="column"
                :value="calculationSettings.maxChange"
                :min="0.000000001"
                :step="0.001"
                :allow-input-over-limit="false"
                :disabled="!calculationSettings.iterative"
                :input-props="{ name: 'maxChange' }"
                @change="updateNumericCalculationSetting('maxChange', $event)"
              />
            </div></section
        ></Teleport>
        <RibbonButton
          variant="tall"
          :label="t('formulaTools.insertFunction')"
          :text="t('formulaTools.insertFunction')"
          :disabled="disabled"
          @activate="browserOpen = true"
          ><FunctionSquare :size="18"
        /></RibbonButton>
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
  &__name-menu {
    display: grid;
    gap: 7px;
    min-width: 210px;
    padding: var(--idea-tool-panel-padding);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    box-shadow: var(--idea-shadow-floating);
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    p {
      margin: 0 0 2px;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
  }
  &__name-menu-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 4px;
  }
  &__calculation-menu {
    display: grid;
    gap: 10px;
    width: 280px;
    padding: var(--idea-tool-panel-padding);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    box-shadow: var(--idea-shadow-floating);
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
  }
  &__calculation-mode {
    display: grid;
    gap: 8px;
    > span {
      color: var(--idea-text-secondary);
    }
  }
  &__number-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    align-items: center;
    gap: 8px;
  }
}
</style>
