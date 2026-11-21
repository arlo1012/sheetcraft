<script setup lang="ts">
import { defineAsyncComponent, computed, ref, useId } from "vue";
import { ChartPie, ChevronRight } from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { pieFamilies, type PieFamily } from "@sheetcraft/core/chart-presentation";
import type { ChartInsertIntent } from "../chart-design-intents";
import { pieCardsByFamily } from "../chart-pie-cards";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import PieThumbnail from "./PieThumbnail.vue";
const PieCardPreview = defineAsyncComponent(() => import("./PieCardPreview.vue"));
const props = defineProps<{ disabled: boolean; themeColors?: readonly string[] }>();
const emit = defineEmits<{ insert: [intent: ChartInsertIntent] }>();
const { t } = useAppI18n(),
  trigger = ref<InstanceType<typeof RibbonSplitButton>>(),
  surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = useId(),
  family = ref<PieFamily>("pie"),
  followTheme = ref(false);
const palette = computed(() => props.themeColors ?? DEFAULT_WORKBOOK_THEME.accentColors);
const { open, floatingStyles, toggleMenu, onTriggerKeydown, dismiss } = useMenu({
  triggerRef: computed(() => trigger.value?.menuElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
  onOpen: () => {
    family.value = "pie";
  },
});
function choose(index?: number, more = false) {
  if (props.disabled || ((more || index !== undefined) && !open.value)) return;
  const choice = family.value;
  dismiss("programmatic", false);
  if (index === undefined && !more) {
    emit("insert", "pie");
    return;
  }
  emit("insert", {
    type: choice === "doughnut" ? "doughnut" : "pie",
    pieFamily: choice,
    card: index ?? 0,
    followTheme: followTheme.value,
  });
}
</script>
<template>
  <RibbonSplitButton
    ref="trigger"
    :label="t('chart.pie')"
    :text="t('chart.pie')"
    :menu-label="t('chart.variantMenu', { type: t('chart.pie') })"
    :disabled="disabled"
    :menu-disabled="disabled"
    :expanded="open"
    :menu-id="menuId"
    data-pie-trigger
    @activate="choose()"
    @toggle-menu="toggleMenu()"
    @menu-keydown="onTriggerKeydown"
    ><ChartPie
  /></RibbonSplitButton>
  <Teleport to="body"
    ><MenuSurface
      v-if="open"
      ref="surface"
      :id="menuId"
      :style="floatingStyles"
      class="pie-gallery"
      :label="t('chart.pie')"
    >
      <template #header
        ><div class="pie-gallery__head">
          <strong>{{ t(`chart.pieMenu.${family}`) }}</strong
          ><button type="button" @click="choose(undefined, true)">
            {{ t("chart.xy.more") }}<ChevronRight :size="14" />
          </button></div
      ></template>
      <template #body
        ><div class="pie-gallery__body">
          <div class="pie-gallery__controls">
            <div role="group" :aria-label="t('chart.subtypes')" class="pie-gallery__families">
              <button
                v-for="tab in pieFamilies"
                :key="tab"
                type="button"
                :title="t(`chart.pieMenu.${tab}`)"
                :aria-label="t(`chart.pieMenu.${tab}`)"
                :aria-pressed="family === tab"
                :data-pie-family="tab"
                @click="family = tab"
              >
                <PieThumbnail :family="tab" :colors="palette" />
              </button>
            </div>
            <Checkbox v-model="followTheme">{{ t("chart.xy.followTheme") }}</Checkbox>
          </div>
          <div :key="family" class="pie-gallery__cards">
            <button
              v-for="(card, index) in pieCardsByFamily[family]"
              :key="index"
              type="button"
              role="menuitem"
              :data-pie-card="index"
              :title="
                t('chart.pieMenu.card', { family: t(`chart.pieMenu.${family}`), index: index + 1 })
              "
              :aria-label="
                t('chart.pieMenu.card', { family: t(`chart.pieMenu.${family}`), index: index + 1 })
              "
              @click="choose(index)"
            >
              <PieCardPreview
                :family="family"
                :card="card"
                :index="index"
                :theme-colors="palette"
                :follow-theme="followTheme"
              />
            </button>
            <button
              data-pie-more
              type="button"
              role="menuitem"
              class="pie-gallery__more"
              @click="choose(undefined, true)"
            >
              {{ t("chart.pieMenu.moreStyles") }}<ChevronRight :size="14" />
            </button>
          </div></div
      ></template> </MenuSurface
  ></Teleport>
</template>
<style scoped lang="scss">
.pie-gallery {
  width: min(596px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
}
.pie-gallery__head,
.pie-gallery__body {
  padding: 6px 12px;
}
.pie-gallery__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pie-gallery button {
  font: inherit;
  color: inherit;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.pie-gallery button:hover,
.pie-gallery button:focus-visible {
  background: var(--td-bg-color-container-hover);
}
.pie-gallery__head button {
  display: flex;
  align-items: center;
  color: var(--sheetcraft-text-secondary);
}
.pie-gallery__families {
  display: flex;
  gap: 5px;
  margin-bottom: 8px;
}
.pie-gallery__families button {
  width: 43px;
  padding: 1px;
}
.pie-gallery__families button[aria-pressed="true"] {
  border-bottom: 2px solid var(--td-brand-color);
}
.pie-gallery__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0 4px;
  max-height: min(422px, calc(100dvh - 200px));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.pie-gallery__cards button {
  padding: 4px;
  border-color: var(--td-component-border);
}
.pie-gallery__cards .pie-gallery__more {
  grid-column: 1/-1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: transparent;
  color: var(--sheetcraft-text-secondary);
}
.pie-gallery__cards .pie-gallery__more svg {
  width: 14px;
}
.pie-gallery__cards button:hover {
  border-color: var(--td-brand-color);
}
.pie-gallery svg {
  display: block;
  width: 100%;
}
.pie-gallery__head svg {
  width: 14px;
}
</style>
