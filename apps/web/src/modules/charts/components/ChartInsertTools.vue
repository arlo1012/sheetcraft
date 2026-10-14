<script setup lang="ts">
import { computed, ref, shallowRef, useId } from "vue";
import {
  ChartColumn,
  ChartLine,
  ChartBar,
  ChartArea,
  ChartPie,
  ChartScatter,
  ChartNetwork,
  LayoutDashboard,
} from "lucide-vue-next";
import type { ChartType } from "@sheetcraft/core/sheet-charts";
import type {
  ChartDesignIntent,
  ChartInsertIntent,
  CommonChartType,
} from "../chart-design-intents";
import ChartSubtypeControls from "./ChartSubtypeControls.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insert: [intent: ChartInsertIntent] }>();
const { t } = useAppI18n();
const triggerComponent = ref<InstanceType<typeof RibbonMenuButton>>();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `chart-types-${useId()}`;
const columnTrigger = ref<InstanceType<typeof RibbonSplitButton>>();
const barTrigger = ref<InstanceType<typeof RibbonSplitButton>>();
const lineTrigger = ref<InstanceType<typeof RibbonSplitButton>>();
const areaTrigger = ref<InstanceType<typeof RibbonSplitButton>>();
const commonType = ref<CommonChartType>("column");
const commonSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const commonMenuId = `chart-insert-subtypes-${useId()}`;
const commonSession = shallowRef<{
  type: CommonChartType;
  apply: (intent: ChartDesignIntent) => boolean;
}>();
const commonTrigger = computed(() => {
  if (commonType.value === "column") return columnTrigger.value?.menuElement ?? null;
  if (commonType.value === "bar") return barTrigger.value?.menuElement ?? null;
  if (commonType.value === "line") return lineTrigger.value?.menuElement ?? null;
  return areaTrigger.value?.menuElement ?? null;
});
const commonMenu = useMenu({
  triggerRef: commonTrigger,
  menuSurfaceRef: commonSurface,
  disabled: computed(() => props.disabled),
  onOpen() {
    const type = commonType.value;
    const current = {
      type,
      apply: (intent: ChartDesignIntent): boolean => {
        if (
          !commonMenu.open.value ||
          commonSession.value !== current ||
          props.disabled ||
          commonType.value !== type ||
          intent.kind !== "variant"
        )
          return false;
        emit("insert", { type, variant: intent.variant });
        commonMenu.dismiss("programmatic", true);
        return true;
      },
    };
    commonSession.value = current;
  },
  onDismiss() {
    commonSession.value = undefined;
  },
});
function toggleCommon(type: CommonChartType): void {
  if (props.disabled) return;
  dismiss("programmatic", false);
  if (commonMenu.open.value && commonType.value !== type) commonMenu.dismiss("programmatic", false);
  commonType.value = type;
  commonMenu.toggleMenu();
}
function commonKeydown(type: CommonChartType, event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  dismiss("programmatic", false);
  if (commonMenu.open.value) commonMenu.dismiss("programmatic", false);
  commonType.value = type;
  commonMenu.onTriggerKeydown(event);
}
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => triggerComponent.value?.rootElement ?? null),
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function insert(type: ChartType) {
  if (props.disabled) return;
  emit("insert", type);
  dismiss("programmatic", true);
}
</script>
<template>
  <section class="chart-insert-tools" role="group" :aria-label="t('chart.tools')">
    <RibbonButton
      variant="tall"
      :label="t('chart.dashboard')"
      :text="t('chart.dashboard')"
      :disabled="disabled"
      @activate="emit('insert', 'dashboard')"
      ><LayoutDashboard
    /></RibbonButton>
    <div class="chart-insert-tools__columns">
      <RibbonSplitButton
        ref="columnTrigger"
        :label="t('chart.column')"
        :menu-label="t('chart.variantMenu', { type: t('chart.column') })"
        :text="t('chart.column')"
        :disabled="disabled"
        :menu-disabled="disabled"
        :expanded="commonMenu.open.value && commonType === 'column'"
        :menu-id="commonMenuId"
        @activate="emit('insert', 'column')"
        @toggle-menu="toggleCommon('column')"
        @menu-keydown="commonKeydown('column', $event)"
        ><ChartColumn
      /></RibbonSplitButton>
      <RibbonSplitButton
        ref="lineTrigger"
        :label="t('chart.line')"
        :menu-label="t('chart.variantMenu', { type: t('chart.line') })"
        :text="t('chart.line')"
        :disabled="disabled"
        :menu-disabled="disabled"
        :expanded="commonMenu.open.value && commonType === 'line'"
        :menu-id="commonMenuId"
        @activate="emit('insert', 'line')"
        @toggle-menu="toggleCommon('line')"
        @menu-keydown="commonKeydown('line', $event)"
        ><ChartLine
      /></RibbonSplitButton>
      <RibbonSplitButton
        ref="barTrigger"
        :label="t('chart.bar')"
        :menu-label="t('chart.variantMenu', { type: t('chart.bar') })"
        :text="t('chart.bar')"
        :disabled="disabled"
        :menu-disabled="disabled"
        :expanded="commonMenu.open.value && commonType === 'bar'"
        :menu-id="commonMenuId"
        @activate="emit('insert', 'bar')"
        @toggle-menu="toggleCommon('bar')"
        @menu-keydown="commonKeydown('bar', $event)"
        ><ChartBar
      /></RibbonSplitButton>
      <RibbonSplitButton
        ref="areaTrigger"
        :label="t('chart.area')"
        :menu-label="t('chart.variantMenu', { type: t('chart.area') })"
        :text="t('chart.area')"
        :disabled="disabled"
        :menu-disabled="disabled"
        :expanded="commonMenu.open.value && commonType === 'area'"
        :menu-id="commonMenuId"
        @activate="emit('insert', 'area')"
        @toggle-menu="toggleCommon('area')"
        @menu-keydown="commonKeydown('area', $event)"
        ><ChartArea
      /></RibbonSplitButton>
      <RibbonButton
        :label="t('chart.pie')"
        :text="t('chart.pie')"
        :disabled="disabled"
        @activate="emit('insert', 'pie')"
        ><ChartPie
      /></RibbonButton>
      <RibbonButton
        :label="t('chart.scatter')"
        :text="t('chart.scatter')"
        :disabled="disabled"
        @activate="emit('insert', 'scatter')"
        ><ChartScatter
      /></RibbonButton>
    </div>
    <RibbonMenuButton
      ref="triggerComponent"
      variant="tall"
      :label="t('chart.more')"
      :text="t('chart.more')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      popup-role="menu"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><ChartNetwork
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="commonMenu.open.value && commonSession"
        :id="commonMenuId"
        ref="commonSurface"
        :style="commonMenu.floatingStyles.value"
        :label="t('chart.variantMenu', { type: t(`chart.${commonType}`) })"
      >
        <template #body
          ><GallerySection :title="t('chart.variantMenu', { type: t(`chart.${commonType}`) })"
            ><ChartSubtypeControls
              :type="commonSession.type"
              :disabled="disabled"
              :apply="commonSession.apply" /></GallerySection
        ></template>
      </MenuSurface>
    </Teleport>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        :label="t('chart.more')"
      >
        <MenuItem data-chart-combo-recipe @select="insert('combo')">{{
          t("chart.combo")
        }}</MenuItem>
        <MenuItem @select="insert('doughnut')">{{ t("chart.doughnut") }}</MenuItem
        ><MenuItem @select="insert('radar')">{{ t("chart.radar") }}</MenuItem>
        <MenuItem @select="insert('treemap')">{{ t("chart.treemap") }}</MenuItem
        ><MenuItem @select="insert('sankey')">{{ t("chart.sankey") }}</MenuItem
        ><MenuItem @select="insert('river')">{{ t("chart.river") }}</MenuItem
        ><MenuItem @select="insert('wordCloud')">{{ t("chart.wordCloud") }}</MenuItem>
      </MenuSurface></Teleport
    >
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.chart-insert-tools {
  @include ribbon.columns;
  &__columns {
    @include ribbon.two-rows;
    grid-template-columns: repeat(3, auto);
    column-gap: 4px;
  }
}
</style>
