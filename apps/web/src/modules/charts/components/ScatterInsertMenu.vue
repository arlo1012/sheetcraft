<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ChartScatter, ChevronRight, LayoutTemplate } from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  rotateChartPalette,
  DEFAULT_CHART_PALETTE,
  type ScatterStyle,
} from "@sheetcraft/core/chart-presentation";
import type { ChartInsertIntent } from "../chart-design-intents";
import { useAppI18n } from "../../../shared/i18n";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import ScatterThumbnail from "./ScatterThumbnail.vue";

const props = defineProps<{
  disabled: boolean;
  themeColors?: readonly string[];
  fullWidth?: boolean;
}>();
const emit = defineEmits<{ insert: [intent: ChartInsertIntent]; more: [] }>();
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

function openMore() {
  if (props.disabled) return;
  dismiss("programmatic", false);
  emit("more");
}
</script>

<template>
  <RibbonSplitButton
    ref="trigger"
    :full-width="fullWidth"
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
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surface"
      class="scatter-gallery"
      :style="floatingStyles"
      :label="t('chart.scatter')"
    >
      <template #body>
        <GallerySection :title="t('chart.scatter')">
          <template #actions>
            <button type="button" class="scatter-gallery__more-link" @click="openMore">
              {{ t("chart.xy.more") }}<ChevronRight :size="14" aria-hidden="true" />
            </button>
          </template>
          <div class="scatter-gallery__families" role="group" :aria-label="t('chart.subtypes')">
            <button
              v-for="tab in ['marker', 'smooth', 'line'] as const"
              :key="tab"
              type="button"
              class="scatter-gallery__family"
              :aria-pressed="family === tab"
              :data-scatter-family="tab"
              @click="family = tab"
            >
              <ScatterThumbnail :variant="tab" :colors="palette" />
              <span>{{ t(`chart.xy.family.${tab}`) }}</span>
            </button>
          </div>
          <Checkbox v-model="followTheme" class="scatter-gallery__theme">{{
            t("chart.xy.followTheme")
          }}</Checkbox>
          <section v-for="style in styles[family]" :key="style" class="scatter-gallery__group">
            <h3>{{ t(`chart.xy.variant.${style}`) }}</h3>
            <div class="scatter-gallery__cards">
              <button
                v-for="accent in [0, 1, 2]"
                :key="accent"
                type="button"
                role="menuitem"
                class="scatter-gallery__card"
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
          </section>
        </GallerySection>
      </template>
      <template #footer>
        <MenuSeparator />
        <MenuItem @select="openMore">
          <template #icon><LayoutTemplate /></template>
          {{ t("chart.allChartTemplates") }}
        </MenuItem>
      </template>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;

.scatter-gallery {
  width: min(420px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);

  &__more-link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--sheetcraft-radius-default);
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    font: inherit;
    font-size: var(--sheetcraft-font-size-body-small);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: var(--sheetcraft-surface-hover);
      color: var(--sheetcraft-text-primary);
      outline: none;
    }
  }

  &__families,
  &__cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  &__family {
    @include gallery.choice(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: var(--sheetcraft-font-size-body-small);

    svg {
      width: 30px;
      height: 22px;
      flex: none;
    }

    &[aria-pressed="true"] {
      background: var(--sheetcraft-action-primary-subtle);
      border-color: var(--sheetcraft-action-primary);
    }
  }

  &__theme {
    margin: 10px 0 4px;
  }

  &__group {
    h3 {
      margin: 8px 0 6px;
      color: var(--sheetcraft-text-secondary);
      font-size: var(--sheetcraft-font-size-body-small);
      font-weight: var(--sheetcraft-font-weight-medium);
    }
  }

  &__card {
    @include gallery.choice(4px);
    display: block;
    width: 100%;
    min-width: 0;
    border-color: var(--sheetcraft-border-subtle);
    background: var(--sheetcraft-surface-panel);

    svg {
      display: block;
      margin: auto;
      width: 100%;
      max-height: 62px;
    }

    &:hover,
    &:focus-visible {
      border-color: var(--sheetcraft-action-primary);
    }
  }
}
</style>
