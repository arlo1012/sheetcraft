<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ChartPie, LayoutTemplate } from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { pieFamilies, type PieFamily } from "@sheetcraft/core/chart-presentation";
import type { ChartInsertIntent } from "../chart-design-intents";
import { pieCardsByFamily } from "../chart-pie-cards";
import { useAppI18n } from "../../../shared/i18n";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import PieThumbnail from "./PieThumbnail.vue";
import PieCardPreview from "./PieCardPreview.vue";

const props = defineProps<{
  disabled: boolean;
  themeColors?: readonly string[];
  fullWidth?: boolean;
}>();
const emit = defineEmits<{ insert: [intent: ChartInsertIntent]; more: [] }>();
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

function choose(index?: number) {
  if (props.disabled || (index !== undefined && !open.value)) return;
  const choice = family.value;
  dismiss("programmatic", false);
  if (index === undefined) {
    emit("insert", "pie");
    return;
  }
  emit("insert", {
    type: choice === "doughnut" ? "doughnut" : "pie",
    pieFamily: choice,
    card: index,
    followTheme: followTheme.value,
  });
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
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      ref="surface"
      :id="menuId"
      :style="floatingStyles"
      class="pie-gallery"
      :label="t('chart.pie')"
    >
      <template #body>
        <GallerySection :title="t(`chart.pieMenu.${family}`)">
          <div class="pie-gallery__controls">
            <div role="group" :aria-label="t('chart.subtypes')" class="pie-gallery__families">
              <button
                v-for="tab in pieFamilies"
                :key="tab"
                type="button"
                class="pie-gallery__family"
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
              class="pie-gallery__card"
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
          </div>
        </GallerySection>
      </template>
      <template #footer>
        <MenuSeparator />
        <MenuItem data-pie-more @select="openMore">
          <template #icon><LayoutTemplate /></template>
          {{ t("chart.allChartTemplates") }}
        </MenuItem>
      </template>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
@use "../../../shared/option-list/option-list" as option-list;

.pie-gallery {
  width: min(560px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);

  &__controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sheetcraft-space-3);
    margin-bottom: var(--sheetcraft-space-3);
  }

  &__families {
    display: flex;
    gap: 4px;
  }

  &__family {
    @include gallery.choice(2px);
    width: 44px;
    height: 30px;

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    &[aria-pressed="true"] {
      background: var(--sheetcraft-action-primary-subtle);
      border-color: var(--sheetcraft-action-primary);
    }
  }

  &__cards {
    @include option-list.scrollbar;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-height: min(360px, calc(100dvh - 220px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }

  &__card {
    @include gallery.choice(4px);
    display: block;
    width: 100%;
    min-width: 0;
    aspect-ratio: 180 / 100;
    border-color: var(--sheetcraft-border-subtle);
    background: var(--sheetcraft-surface-panel);

    &:hover,
    &:focus-visible {
      border-color: var(--sheetcraft-action-primary);
    }
  }
}
</style>
