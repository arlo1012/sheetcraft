<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  ChartColumn,
  ChartLine,
  ChartPie,
  ChartScatter,
  ChartNetwork,
  LayoutDashboard,
} from "lucide-vue-next";
import type { ChartType } from "@idea10/core/sheet-charts";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insert: [type: ChartType | "dashboard"] }>();
const { t } = useAppI18n();
const triggerComponent = ref<InstanceType<typeof RibbonMenuButton>>();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `chart-types-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => triggerComponent.value?.rootElement ?? null),
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function insert(type: ChartType) {
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
      <RibbonButton
        :label="t('chart.column')"
        :text="t('chart.column')"
        :disabled="disabled"
        @activate="emit('insert', 'column')"
        ><ChartColumn
      /></RibbonButton>
      <RibbonButton
        :label="t('chart.line')"
        :text="t('chart.line')"
        :disabled="disabled"
        @activate="emit('insert', 'line')"
        ><ChartLine
      /></RibbonButton>
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
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        :label="t('chart.more')"
      >
        <MenuItem @select="insert('bar')">{{ t("chart.bar") }}</MenuItem
        ><MenuItem @select="insert('area')">{{ t("chart.area") }}</MenuItem
        ><MenuItem @select="insert('doughnut')">{{ t("chart.doughnut") }}</MenuItem
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
    grid-template-columns: repeat(2, auto);
    column-gap: 4px;
  }
}
</style>
