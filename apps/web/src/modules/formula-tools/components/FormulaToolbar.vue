<script setup lang="ts">
import { Calculator, FunctionSquare, Sigma, Tags } from "lucide-vue-next";
import { nextTick, ref } from "vue";
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
  }>(),
  { disabled: false, editSessionId: undefined, recentFunctions: () => [] },
);
const emit = defineEmits<{
  insertFunction: [name: string];
  aggregate: [name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN"];
  openNames: [];
  recalculate: [];
  interactionEnd: [];
}>();
const { t } = useAppI18n();
const sumTriggerRef = ref<HTMLElement | null>(null);
const sumPanelRef = ref<HTMLElement | null>(null);
const sumMenuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const sumMenuOpen = ref(false);
const browserOpen = ref(false);
const sumMenuId = `formula-sum-${Math.random().toString(36).slice(2)}`;
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
const { floatingStyles } = useDismissibleFloatingPanel(
  sumTriggerRef,
  sumPanelRef,
  sumMenuOpen,
  {
    placement: "bottom-start",
    offset: 4,
    onDismiss: () => {
      sumMenuOpen.value = false;
    },
  },
);
function toggleSumMenu(): void {
  if (!props.disabled) sumMenuOpen.value = !sumMenuOpen.value;
}
function chooseAggregate(
  name: "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN",
): void {
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
          ref="sumTriggerRef"
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
            category="Math"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          /><FormulaCategoryMenu
            category="Logical"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          />
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Statistical"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          /><FormulaCategoryMenu
            category="Text"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          />
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Date"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          /><FormulaCategoryMenu
            category="Financial"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          />
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Information"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          /><FormulaCategoryMenu
            category="Lookup"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          />
        </div>
        <div class="formula-toolbar__category-column">
          <FormulaCategoryMenu
            category="Engineering"
            :disabled="disabled"
            :edit-session-id="editSessionId"
            @insert-function="emit('insertFunction', $event)"
          />
        </div>
      </section>
      <section
        class="formula-toolbar__group formula-toolbar__group--actions"
        data-ribbon-group="formula-actions"
        role="group"
        :aria-label="t('formulaTools.toolbar')"
      >
        <RibbonIconAction
          variant="tall"
          :label="t('formulaTools.insertFunction')"
          :text="t('formulaTools.insertFunction')"
          :disabled="disabled"
          @activate="browserOpen = true"
          ><FunctionSquare :size="18"
        /></RibbonIconAction>
        <RibbonIconAction
          variant="tall"
          :label="t('formulaTools.nameManager')"
          :text="t('formulaTools.nameManager')"
          :disabled="disabled"
          @activate="emit('openNames')"
          ><Tags :size="18"
        /></RibbonIconAction>
        <RibbonIconAction
          variant="tall"
          :label="t('formulaTools.recalculate')"
          :text="t('formulaTools.recalculate')"
          :disabled="disabled"
          @activate="emit('recalculate')"
          ><Calculator :size="18"
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
    display: flex;
    flex-direction: column;
    justify-content: center;
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
}
</style>
