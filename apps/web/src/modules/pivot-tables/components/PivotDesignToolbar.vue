<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { ListTree, Sigma, PanelsTopLeft, Rows3 } from "lucide-vue-next";
import {
  getPivotPresentation,
  type PivotPresentation,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import { useAppI18n } from "../../../shared/i18n";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
const props = defineProps<{ table: SheetPivotTable; disabled: boolean }>();
const emit = defineEmits<{ update: [table: SheetPivotTable] }>();
defineSlots<{ styles: () => unknown }>();
const { t } = useAppI18n();
const presentation = computed(() => getPivotPresentation(props.table));
type Mode = "subtotals" | "totals" | "layout" | "blankRows";
const mode = ref<Mode>("subtotals");
const subtotalButton = ref<InstanceType<typeof RibbonMenuButton>>();
const totalButton = ref<InstanceType<typeof RibbonMenuButton>>();
const layoutButton = ref<InstanceType<typeof RibbonMenuButton>>();
const blankButton = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(
  () =>
    (mode.value === "subtotals"
      ? subtotalButton.value
      : mode.value === "totals"
        ? totalButton.value
        : mode.value === "layout"
          ? layoutButton.value
          : blankButton.value
    )?.rootElement ?? null,
);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `pivot-design-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
async function toggle(value: Mode): Promise<void> {
  if (mode.value !== value) {
    dismiss("programmatic", false);
    mode.value = value;
    await nextTick();
  }
  toggleMenu();
}
function key(value: Mode, event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    mode.value = value;
    onTriggerKeydown(event);
  }
}
function change(patch: Partial<PivotPresentation>): void {
  if (!props.disabled)
    emit("update", { ...props.table, presentation: { ...presentation.value, ...patch } });
}
function choose(patch: Partial<PivotPresentation>): void {
  change(patch);
  dismiss("programmatic", true);
}
function totals(rows: boolean, columns: boolean): void {
  if (!props.disabled) emit("update", { ...props.table, rowTotals: rows, columnTotals: columns });
  dismiss("programmatic", true);
}
</script>
<template>
  <RibbonToolbar :label="t('pivot.design')">
    <section class="pivot-design__group">
      <RibbonMenuButton
        ref="subtotalButton"
        variant="tall"
        :label="t('pivot.subtotals')"
        :text="t('pivot.subtotals')"
        :disabled="disabled"
        :expanded="open && mode === 'subtotals'"
        :menu-id="menuId"
        @activate="toggle('subtotals')"
        @keydown="key('subtotals', $event)"
        ><ListTree
      /></RibbonMenuButton>
      <RibbonMenuButton
        ref="totalButton"
        variant="tall"
        :label="t('pivot.totals')"
        :text="t('pivot.totals')"
        :disabled="disabled"
        :expanded="open && mode === 'totals'"
        :menu-id="menuId"
        @activate="toggle('totals')"
        @keydown="key('totals', $event)"
        ><Sigma
      /></RibbonMenuButton>
      <RibbonMenuButton
        ref="layoutButton"
        variant="tall"
        :label="t('pivot.layout')"
        :text="t('pivot.layout')"
        :disabled="disabled"
        :expanded="open && mode === 'layout'"
        :menu-id="menuId"
        @activate="toggle('layout')"
        @keydown="key('layout', $event)"
        ><PanelsTopLeft
      /></RibbonMenuButton>
      <RibbonMenuButton
        ref="blankButton"
        variant="tall"
        :label="t('pivot.blankRows')"
        :text="t('pivot.blankRows')"
        :disabled="disabled"
        :expanded="open && mode === 'blankRows'"
        :menu-id="menuId"
        @activate="toggle('blankRows')"
        @keydown="key('blankRows', $event)"
        ><Rows3
      /></RibbonMenuButton>
    </section>
    <section class="pivot-design__group">
      <div class="pivot-design__stack">
        <Checkbox
          :checked="presentation.rowHeaders"
          :disabled="disabled"
          @change="change({ rowHeaders: Boolean($event) })"
          >{{ t("pivot.rowHeaders") }}</Checkbox
        >
        <Checkbox
          :checked="presentation.columnHeaders"
          :disabled="disabled"
          @change="change({ columnHeaders: Boolean($event) })"
          >{{ t("pivot.columnHeaders") }}</Checkbox
        >
      </div>
      <div class="pivot-design__stack">
        <Checkbox
          :checked="presentation.bandedRows"
          :disabled="disabled"
          @change="change({ bandedRows: Boolean($event) })"
          >{{ t("pivot.bandedRows") }}</Checkbox
        >
        <Checkbox
          :checked="presentation.bandedColumns"
          :disabled="disabled"
          @change="change({ bandedColumns: Boolean($event) })"
          >{{ t("pivot.bandedColumns") }}</Checkbox
        >
      </div>
    </section>
    <section class="pivot-design__styles"><slot name="styles" /></section>
    <template #overlays>
      <Teleport to="body"
        ><MenuSurface
          v-if="open"
          :id="menuId"
          ref="menuSurfaceRef"
          class="pivot-design__menu"
          :style="floatingStyles"
          :label="t(`pivot.${mode}`)"
        >
          <template v-if="mode === 'subtotals'">
            <MenuRadioItem
              :checked="presentation.subtotals === 'off'"
              @select="choose({ subtotals: 'off' })"
              >{{ t("pivot.subtotalsOff") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="presentation.subtotals === 'top'"
              @select="choose({ subtotals: 'top' })"
              >{{ t("pivot.subtotalsTop") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="presentation.subtotals === 'bottom'"
              @select="choose({ subtotals: 'bottom' })"
              >{{ t("pivot.subtotalsBottom") }}</MenuRadioItem
            >
          </template>
          <template v-else-if="mode === 'totals'">
            <MenuRadioItem
              :checked="table.rowTotals && table.columnTotals"
              @select="totals(true, true)"
              >{{ t("pivot.totalsBoth") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="!table.rowTotals && !table.columnTotals"
              @select="totals(false, false)"
              >{{ t("pivot.totalsOff") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="!table.rowTotals && table.columnTotals"
              @select="totals(false, true)"
              >{{ t("pivot.totalsRows") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="table.rowTotals && !table.columnTotals"
              @select="totals(true, false)"
              >{{ t("pivot.totalsColumns") }}</MenuRadioItem
            >
          </template>
          <template v-else-if="mode === 'layout'">
            <MenuRadioItem
              :checked="presentation.layout === 'compact'"
              @select="choose({ layout: 'compact' })"
              >{{ t("pivot.compact") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="presentation.layout === 'outline'"
              @select="choose({ layout: 'outline' })"
              >{{ t("pivot.outline") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="presentation.layout === 'tabular'"
              @select="choose({ layout: 'tabular' })"
              >{{ t("pivot.tabular") }}</MenuRadioItem
            >
            <MenuItem
              :disabled="presentation.layout === 'compact'"
              @select="choose({ repeatLabels: !presentation.repeatLabels })"
              >{{
                t(presentation.repeatLabels ? "pivot.noRepeatLabels" : "pivot.repeatLabels")
              }}</MenuItem
            >
          </template>
          <template v-else>
            <MenuRadioItem
              :checked="presentation.blankRows"
              @select="choose({ blankRows: true })"
              >{{ t("pivot.insertBlankRows") }}</MenuRadioItem
            >
            <MenuRadioItem
              :checked="!presentation.blankRows"
              @select="choose({ blankRows: false })"
              >{{ t("pivot.removeBlankRows") }}</MenuRadioItem
            >
          </template>
        </MenuSurface></Teleport
      >
    </template>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.pivot-design {
  &__group {
    @include ribbon.columns;
  }
  &__stack {
    @include ribbon.stack;
  }
  &__styles {
    min-width: 280px;
    max-width: 600px;
  }
  &__menu {
    z-index: var(--idea-layer-menu);
    min-width: 220px;
  }
}
</style>
