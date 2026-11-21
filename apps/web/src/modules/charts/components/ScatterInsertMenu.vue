<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ChartScatter, ChevronRight } from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  rotateChartPalette,
  DEFAULT_CHART_PALETTE,
  type ScatterStyle,
} from "@sheetcraft/core/chart-presentation";
import type { ChartInsertIntent } from "../chart-design-intents";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import ScatterThumbnail from "./ScatterThumbnail.vue";
const props = defineProps<{ disabled: boolean; themeColors?: readonly string[] }>();
const emit = defineEmits<{ insert: [intent: ChartInsertIntent] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonSplitButton>>(),
  surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = useId();
const family = ref<"marker" | "smooth" | "line">("marker"),
  followTheme = ref(true);
const styles: Record<typeof family.value, readonly ScatterStyle[]> = {
  marker: ["marker"],
  smooth: ["smoothMarker", "smooth"],
  line: ["lineMarker", "line"],
};
const palette = computed(() =>
  followTheme.value
    ? (props.themeColors ?? DEFAULT_WORKBOOK_THEME.accentColors)
    : DEFAULT_CHART_PALETTE,
);
const { open, floatingStyles, toggleMenu, onTriggerKeydown, dismiss } = useMenu({
  triggerRef: computed(() => trigger.value?.menuElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
  onOpen: () => {
    family.value = "marker";
  },
});
function choose(style?: ScatterStyle, accent = 0) {
  if (props.disabled || (style && !open.value)) return;
  const intent: ChartInsertIntent = style
    ? { type: "scatter", scatterStyle: style, accent, followTheme: followTheme.value }
    : "scatter";
  dismiss("programmatic", false);
  emit("insert", intent);
}
</script>
<template>
  <RibbonSplitButton
    ref="trigger"
    :label="t('chart.scatter')"
    :text="t('chart.scatter')"
    :menu-label="t('chart.variantMenu', { type: t('chart.scatter') })"
    :disabled="disabled"
    :menu-disabled="disabled"
    :expanded="open"
    :menu-id="menuId"
    data-scatter-trigger
    @activate="choose()"
    @toggle-menu="toggleMenu()"
    @menu-keydown="onTriggerKeydown"
    ><ChartScatter
  /></RibbonSplitButton>
  <Teleport to="body"
    ><MenuSurface
      v-if="open"
      :id="menuId"
      ref="surface"
      class="scatter-gallery"
      :style="floatingStyles"
      :label="t('chart.scatter')"
    >
      <template #header
        ><div class="scatter-gallery__heading">
          <strong>{{ t("chart.scatter") }}</strong
          ><button type="button" @click="choose()">
            {{ t("chart.xy.more") }}<ChevronRight :size="13" />
          </button></div
      ></template>
      <template #body
        ><div class="scatter-gallery__content">
          <div class="scatter-gallery__families" role="group" :aria-label="t('chart.subtypes')">
            <button
              v-for="tab in ['marker', 'smooth', 'line'] as const"
              :key="tab"
              type="button"
              :aria-pressed="family === tab"
              :data-scatter-family="tab"
              @click="family = tab"
            >
              <ScatterThumbnail :variant="tab" :colors="palette" />{{ t(`chart.xy.family.${tab}`) }}
            </button>
          </div>
          <Checkbox v-model="followTheme" class="scatter-gallery__theme">{{
            t("chart.xy.followTheme")
          }}</Checkbox>
          <section v-for="style in styles[family]" :key="style">
            <h3>{{ t(`chart.xy.variant.${style}`) }}</h3>
            <div class="scatter-gallery__cards">
              <button
                v-for="accent in [0, 1, 2]"
                :key="accent"
                type="button"
                role="menuitem"
                :data-scatter-style="style"
                :data-scatter-accent="accent"
                :aria-label="
                  t('chart.xy.card', {
                    style: t(`chart.xy.variant.${style}`),
                    index: accent + 1,
                  })
                "
                :title="
                  t('chart.xy.card', {
                    style: t(`chart.xy.variant.${style}`),
                    index: accent + 1,
                  })
                "
                @click="choose(style, accent)"
              >
                <ScatterThumbnail :variant="style" :colors="rotateChartPalette(palette, accent)" />
              </button>
            </div>
          </section></div
      ></template> </MenuSurface
  ></Teleport>
</template>
<style scoped lang="scss">
.scatter-gallery {
  width: min(438px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
}
.scatter-gallery__heading,
.scatter-gallery__content {
  padding: 6px 12px;
}
.scatter-gallery__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.scatter-gallery button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}
.scatter-gallery button:hover,
.scatter-gallery button:focus-visible {
  background: var(--sheetcraft-surface-hover);
}
.scatter-gallery__heading button {
  display: flex;
  align-items: center;
  color: var(--sheetcraft-text-secondary);
}
.scatter-gallery__families,
.scatter-gallery__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.scatter-gallery__families button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.scatter-gallery__families button[aria-pressed="true"],
.scatter-gallery__cards button:hover {
  background: var(--sheetcraft-action-primary-subtle);
  border-color: var(--sheetcraft-action-primary);
}
.scatter-gallery__families svg {
  width: 34px;
  height: 26px;
}
.scatter-gallery__theme {
  margin: 12px 0 2px;
}
.scatter-gallery h3 {
  font-size: inherit;
  font-weight: 500;
  margin: 8px 0 4px;
}
.scatter-gallery__cards button {
  padding: 4px;
  border-color: var(--sheetcraft-border-subtle);
}
.scatter-gallery__cards svg {
  display: block;
  margin: auto;
  width: 100%;
  max-height: 65px;
}
</style>
