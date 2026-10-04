<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { ChevronRight, Palette, Sparkles, Type } from "lucide-vue-next";
import type {
  WorkbookCustomColor,
  WorkbookCustomFont,
  WorkbookTheme,
} from "@idea10/core/workbook-theme";
import { useAppI18n } from "../../../shared/i18n";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import {
  PAGE_THEME_COLOR_PRESETS,
  PAGE_THEME_EFFECT_PRESETS,
  PAGE_THEME_FONT_PRESETS,
  PAGE_THEME_PRESETS,
} from "../page-theme-presets";
import CustomThemeColorsDialog, { type ThemeColorScheme } from "./CustomThemeColorsDialog.vue";
import CustomThemeFontsDialog, { type ThemeFontScheme } from "./CustomThemeFontsDialog.vue";
import ThemeEffectPreview from "./ThemeEffectPreview.vue";

type Category = "theme" | "colors" | "fonts" | "effects";
const props = withDefaults(
  defineProps<{ theme: WorkbookTheme; disabled?: boolean; contextKey: string }>(),
  { disabled: false },
);
const emit = defineEmits<{
  apply: [theme: WorkbookTheme];
  "update:dialogVisible": [value: boolean];
}>();
const { t } = useAppI18n();
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const menuElement = computed(() => surfaceRef.value?.rootElement ?? null);
const panelId = `page-theme-menu-${useId().replaceAll(":", "")}`;
const submenuId = `${panelId}-submenu`;
const colorsDialogVisible = ref(false);
const fontsDialogVisible = ref(false);
const recommendationOffset = ref(0);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => props.disabled),
  placement: "bottom-start",
  additionalInside: () => [submenuElement.value],
});
const {
  activeSubmenu: activeCategory,
  submenuElement,
  submenuStyles,
  openSubmenu: setCategory,
  openSubmenuOnHover: setCategoryOnHover,
  onParentKeydown,
  onParentFocusin,
  onSubmenuKeydown,
} = useSubmenu<Category>({
  parentOpen: open,
  submenuSurfaceRef,
  getAnchor: (category) =>
    menuElement.value?.querySelector<HTMLElement>(`[data-theme-category="${category}"]`) ?? null,
  offset: 4,
  padding: 8,
  focus: (surface) =>
    surface.rootElement?.querySelector<HTMLElement>("[data-theme-choice]")?.focus(),
});
const defaultColors = computed<ThemeColorScheme>(() => {
  const colors = props.theme.colors;
  return {
    name: colors?.name ?? props.theme.name,
    dark1: colors?.dark1 ?? "#000000",
    light1: colors?.light1 ?? "#ffffff",
    dark2: colors?.dark2 ?? "#44546a",
    light2: colors?.light2 ?? "#e7e6e6",
    accentColors: [...props.theme.accentColors],
    hyperlink: colors?.hyperlink ?? "#0563c1",
    followedHyperlink: colors?.followedHyperlink ?? "#954f72",
  };
});
const defaultFonts = computed<ThemeFontScheme>(() => {
  const fonts = props.theme.fonts;
  return {
    name: fonts?.name ?? props.theme.name,
    headingFont: props.theme.headingFont,
    bodyFont: props.theme.bodyFont,
    headingEastAsia: fonts?.headingEastAsia ?? "等线",
    bodyEastAsia: fonts?.bodyEastAsia ?? "等线",
  };
});
const customColors = computed<WorkbookCustomColor[]>(() => props.theme.customColors ?? []);
const customFonts = computed<WorkbookCustomFont[]>(() => props.theme.customFonts ?? []);
const recommendedColors = computed(() =>
  Array.from(
    { length: Math.min(8, PAGE_THEME_COLOR_PRESETS.length) },
    (_, index) =>
      PAGE_THEME_COLOR_PRESETS[
        (recommendationOffset.value + index) % PAGE_THEME_COLOR_PRESETS.length
      ]!,
  ),
);
function closeMenu(): void {
  activeCategory.value = null;
  dismiss("programmatic", true);
}
function themeWith(patch: Partial<WorkbookTheme>): WorkbookTheme {
  return { ...props.theme, ...patch };
}
function applyTheme(theme: WorkbookTheme): void {
  emit(
    "apply",
    themeWith({ ...theme, customColors: customColors.value, customFonts: customFonts.value }),
  );
  closeMenu();
}
function applyColors(colors: ThemeColorScheme): void {
  emit("apply", themeWith({ colors, accentColors: [...colors.accentColors] }));
  closeMenu();
}
function applyFonts(fonts: ThemeFontScheme): void {
  emit(
    "apply",
    themeWith({
      fonts: {
        name: fonts.name,
        headingEastAsia: fonts.headingEastAsia,
        bodyEastAsia: fonts.bodyEastAsia,
      },
      headingFont: fonts.headingFont,
      bodyFont: fonts.bodyFont,
    }),
  );
  closeMenu();
}
function applyEffect(effect: (typeof PAGE_THEME_EFFECT_PRESETS)[number]): void {
  emit("apply", themeWith({ effects: effect }));
  closeMenu();
}
function saveCustomColors(colors: ThemeColorScheme): void {
  const entry: WorkbookCustomColor = { ...colors, id: `custom-colors-${Date.now()}` };
  emit(
    "apply",
    themeWith({
      colors: entry,
      accentColors: [...entry.accentColors],
      customColors: [...customColors.value, entry],
    }),
  );
}
function saveCustomFonts(fonts: ThemeFontScheme): void {
  const entry: WorkbookCustomFont = { ...fonts, id: `custom-fonts-${Date.now()}` };
  emit(
    "apply",
    themeWith({
      fonts: {
        name: entry.name,
        headingEastAsia: entry.headingEastAsia,
        bodyEastAsia: entry.bodyEastAsia,
      },
      headingFont: entry.headingFont,
      bodyFont: entry.bodyFont,
      customFonts: [...customFonts.value, entry],
    }),
  );
}
function refreshRecommendations(): void {
  recommendationOffset.value = (recommendationOffset.value + 8) % PAGE_THEME_COLOR_PRESETS.length;
}
function moveGridFocus(event: KeyboardEvent, index: number, total: number): void {
  const columns = 4;
  const delta =
    event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown"
          ? columns
          : event.key === "ArrowUp"
            ? -columns
            : 0;
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  const next = Math.max(0, Math.min(total - 1, index + delta));
  submenuElement.value?.querySelectorAll<HTMLElement>("[data-theme-grid]")[next]?.focus();
}
function onRootKeydown(event: KeyboardEvent): void {
  const category =
    event.target instanceof HTMLElement
      ? (event.target.closest<HTMLElement>("[data-theme-category]")?.dataset.themeCategory as
          | Category
          | undefined)
      : undefined;
  onParentKeydown(event, category);
}
function onRootFocusin(event: FocusEvent): void {
  const category =
    event.target instanceof HTMLElement
      ? (event.target.closest<HTMLElement>("[data-theme-category]")?.dataset.themeCategory as
          | Category
          | undefined)
      : undefined;
  onParentFocusin(category);
}
watch([colorsDialogVisible, fontsDialogVisible], ([colorsOpen, fontsOpen]) =>
  emit("update:dialogVisible", colorsOpen || fontsOpen),
);
watch(open, (visible) => {
  if (!visible) activeCategory.value = null;
});
watch(
  () => props.contextKey,
  () => {
    colorsDialogVisible.value = false;
    fontsDialogVisible.value = false;
    closeMenu();
  },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      colorsDialogVisible.value = false;
      fontsDialogVisible.value = false;
    }
  },
);
</script>

<template>
  <div class="page-theme-menu">
    <RibbonMenuButton
      ref="triggerRef"
      variant="tall"
      data-ribbon-action="page-theme"
      :label="t('pageTools.theme')"
      :text="t('pageTools.theme')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      full-width
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Palette
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="panelId"
        ref="surfaceRef"
        class="page-theme-menu__root"
        :style="floatingStyles"
        :label="t('pageTools.theme')"
        @focusin="onRootFocusin"
        @keydown="onRootKeydown"
      >
        <MenuItem
          data-theme-category="theme"
          :aria-controls="activeCategory === 'theme' ? submenuId : undefined"
          :aria-expanded="activeCategory === 'theme'"
          @mouseenter="setCategoryOnHover('theme')"
          @select="setCategory('theme', true)"
          ><template #icon><Palette /></template>{{ t("pageTools.theme")
          }}<template #shortcut><ChevronRight /></template
        ></MenuItem>
        <MenuItem
          data-theme-category="colors"
          :aria-controls="activeCategory === 'colors' ? submenuId : undefined"
          :aria-expanded="activeCategory === 'colors'"
          @mouseenter="setCategoryOnHover('colors')"
          @select="setCategory('colors', true)"
          ><template #icon><Palette /></template>{{ t("pageTools.themeColors")
          }}<template #shortcut><ChevronRight /></template
        ></MenuItem>
        <MenuItem
          data-theme-category="fonts"
          :aria-controls="activeCategory === 'fonts' ? submenuId : undefined"
          :aria-expanded="activeCategory === 'fonts'"
          @mouseenter="setCategoryOnHover('fonts')"
          @select="setCategory('fonts', true)"
          ><template #icon><Type /></template>{{ t("pageTools.themeFonts")
          }}<template #shortcut><ChevronRight /></template
        ></MenuItem>
        <MenuItem
          data-theme-category="effects"
          :aria-controls="activeCategory === 'effects' ? submenuId : undefined"
          :aria-expanded="activeCategory === 'effects'"
          @mouseenter="setCategoryOnHover('effects')"
          @select="setCategory('effects', true)"
          ><template #icon><Sparkles /></template>{{ t("pageTools.themeEffects")
          }}<template #shortcut><ChevronRight /></template
        ></MenuItem>
      </MenuSurface>
      <MenuSurface
        v-if="activeCategory"
        :id="submenuId"
        ref="submenuSurfaceRef"
        class="page-theme-menu__submenu"
        :body-scrollable="activeCategory !== 'colors'"
        :class="{
          'page-theme-menu__submenu--colors': activeCategory === 'colors',
        }"
        :style="submenuStyles"
        :label="
          activeCategory === 'theme'
            ? t('pageTools.theme')
            : activeCategory === 'colors'
              ? t('pageTools.themeColors')
              : activeCategory === 'fonts'
                ? t('pageTools.themeFonts')
                : t('pageTools.themeEffects')
        "
        @keydown="onSubmenuKeydown"
      >
        <template #body>
          <GallerySection v-if="activeCategory === 'theme'">
            <div
              class="page-theme-menu__gallery"
              role="radiogroup"
              :aria-label="t('pageTools.theme')"
            >
              <button
                v-for="(preset, index) in PAGE_THEME_PRESETS"
                :key="preset.id"
                data-theme-choice
                data-theme-grid
                type="button"
                class="page-theme-menu__theme-preview"
                :class="{ 'is-selected': preset.id === theme.id }"
                role="radio"
                :aria-checked="preset.id === theme.id"
                @click="applyTheme(preset)"
                @keydown="moveGridFocus($event, index, PAGE_THEME_PRESETS.length)"
              >
                <span :style="{ fontFamily: preset.fonts.headingEastAsia || preset.headingFont }"
                  >文文</span
                ><i
                  v-for="(color, colorIndex) in preset.accentColors"
                  :key="colorIndex"
                  :style="{ backgroundColor: color }"
                /><em>{{ preset.name }}</em>
              </button>
            </div>
          </GallerySection>
          <div
            v-else-if="activeCategory === 'colors'"
            class="page-theme-menu__content page-theme-menu__colors-panel"
            role="none"
          >
            <GallerySection :title="t('pageTools.themeColors')" scrollable>
              <div class="page-theme-menu__color-list">
                <button
                  v-for="preset in [...PAGE_THEME_COLOR_PRESETS, ...customColors]"
                  :key="preset.id"
                  data-theme-choice
                  type="button"
                  class="page-theme-menu__color-row"
                  :class="{ 'is-selected': preset.name === defaultColors.name }"
                  :aria-pressed="preset.name === defaultColors.name"
                  @click="applyColors(preset)"
                >
                  <span class="page-theme-menu__color-swatches"
                    ><i :style="{ backgroundColor: preset.dark1 }" /><i
                      :style="{ backgroundColor: preset.light1 }" /><i
                      v-for="(color, colorIndex) in preset.accentColors"
                      :key="colorIndex"
                      :style="{ backgroundColor: color }" /></span
                  ><span>{{ preset.name }}</span>
                </button>
              </div>
            </GallerySection>
            <GallerySection :title="t('pageTools.themeColorRecommendation')" scrollable>
              <template #actions>
                <button
                  class="page-theme-menu__refresh"
                  type="button"
                  @click="refreshRecommendations"
                >
                  {{ t("pageTools.themeRefreshRecommendations") }}
                </button>
              </template>
              <div class="page-theme-menu__color-list">
                <button
                  v-for="preset in recommendedColors"
                  :key="`recommended-${preset.id}`"
                  data-theme-choice
                  type="button"
                  class="page-theme-menu__color-row"
                  :aria-pressed="preset.name === defaultColors.name"
                  @click="applyColors(preset)"
                >
                  <span class="page-theme-menu__color-swatches"
                    ><i :style="{ backgroundColor: preset.dark1 }" /><i
                      :style="{ backgroundColor: preset.light1 }" /><i
                      v-for="(color, colorIndex) in preset.accentColors"
                      :key="colorIndex"
                      :style="{ backgroundColor: color }" /></span
                  ><span>{{ preset.name }}</span>
                </button>
              </div>
            </GallerySection>
          </div>
          <GallerySection v-else-if="activeCategory === 'fonts'" :title="t('pageTools.themeFonts')">
            <section class="page-theme-menu__fonts-panel">
              <button
                v-for="preset in [...PAGE_THEME_FONT_PRESETS, ...customFonts]"
                :key="preset.id"
                data-theme-choice
                type="button"
                class="page-theme-menu__font-row"
                :class="{ 'is-selected': preset.name === defaultFonts.name }"
                :aria-pressed="preset.name === defaultFonts.name"
                @click="applyFonts(preset)"
              >
                <span
                  class="page-theme-menu__font-sample"
                  :style="{ fontFamily: preset.headingEastAsia || preset.headingFont }"
                  >文文</span
                ><span
                  ><strong :style="{ fontFamily: preset.headingEastAsia || preset.headingFont }">{{
                    preset.name
                  }}</strong
                  ><em :style="{ fontFamily: preset.headingEastAsia || preset.headingFont }">{{
                    preset.headingEastAsia || preset.headingFont
                  }}</em
                  ><em :style="{ fontFamily: preset.bodyEastAsia || preset.bodyFont }">{{
                    preset.bodyEastAsia || preset.bodyFont
                  }}</em></span
                >
              </button>
            </section>
          </GallerySection>
          <GallerySection v-else>
            <div
              class="page-theme-menu__gallery"
              role="radiogroup"
              :aria-label="t('pageTools.themeEffects')"
            >
              <button
                v-for="(effect, index) in PAGE_THEME_EFFECT_PRESETS"
                :key="effect.id"
                data-theme-choice
                data-theme-grid
                type="button"
                class="page-theme-menu__effect-preview"
                :class="{ 'is-selected': effect.id === theme.effects?.id }"
                role="radio"
                :aria-checked="effect.id === theme.effects?.id"
                @click="applyEffect(effect)"
                @keydown="moveGridFocus($event, index, PAGE_THEME_EFFECT_PRESETS.length)"
              >
                <ThemeEffectPreview v-bind="effect" /><em>{{ effect.name }}</em>
              </button>
            </div>
          </GallerySection>
        </template>
        <template v-if="activeCategory === 'colors' || activeCategory === 'fonts'" #footer>
          <MenuSeparator v-if="activeCategory === 'colors' || activeCategory === 'fonts'" />
          <MenuItem
            v-if="activeCategory === 'colors'"
            @select="
              closeMenu();
              colorsDialogVisible = true;
            "
          >
            {{ t("pageTools.customizeColors") }}
          </MenuItem>
          <MenuItem
            v-if="activeCategory === 'fonts'"
            class="page-theme-menu__custom-action"
            @select="
              closeMenu();
              fontsDialogVisible = true;
            "
          >
            {{ t("pageTools.customizeFonts") }}
          </MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
    <CustomThemeColorsDialog
      v-model:visible="colorsDialogVisible"
      :colors="defaultColors"
      @save="saveCustomColors"
    />
    <CustomThemeFontsDialog
      v-model:visible="fontsDialogVisible"
      :fonts="defaultFonts"
      @save="saveCustomFonts"
    />
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;

.page-theme-menu {
  min-width: 0;
}
.page-theme-menu__root {
  width: 132px;
}
.page-theme-menu__submenu {
  z-index: var(--idea-layer-submenu);
  width: min(480px, calc(100vw - 24px));
  max-height: min(700px, calc(100vh - 16px));
}
.page-theme-menu__submenu--colors {
  height: min(700px, calc(100vh - 16px));
}
.page-theme-menu__colors-panel {
  display: grid;
  grid-template-rows: minmax(0, 3fr) minmax(0, 2fr);
  min-height: 0;
}
.page-theme-menu__content {
  list-style: none;
}
.page-theme-menu__gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.page-theme-menu__theme-preview,
.page-theme-menu__effect-preview {
  @include gallery.choice(var(--idea-space-2));

  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  border: 1px solid var(--idea-border-subtle);
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);
  text-align: center;
}
.page-theme-menu__theme-preview > span {
  grid-column: 1 / -1;
  min-height: 31px;
  font-size: 16px;
  line-height: 31px;
}
.page-theme-menu__theme-preview i {
  height: 7px;
}
.page-theme-menu__theme-preview em,
.page-theme-menu__effect-preview em {
  grid-column: 1 / -1;
  overflow: hidden;
  font-size: 12px;
  font-style: normal;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-theme-menu__color-list,
.page-theme-menu__fonts-panel {
  display: grid;
  gap: 2px;
}
.page-theme-menu__refresh {
  border: 0;
  background: transparent;
  color: var(--idea-text-link);
  font: inherit;
  cursor: pointer;
}
.page-theme-menu__color-row,
.page-theme-menu__font-row {
  @include gallery.choice(var(--idea-space-2));

  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  align-items: center;
  min-height: 30px;
  gap: var(--idea-space-4);
  color: var(--idea-text-primary);
  text-align: left;
  font: inherit;
}
.page-theme-menu__color-swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}
.page-theme-menu__color-swatches i {
  height: 16px;
}
.page-theme-menu__font-row {
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  padding: 6px 4px;
}
.page-theme-menu__font-sample {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--idea-border-control);
  font-size: 15px;
}
.page-theme-menu__font-row > span:last-child {
  display: grid;
  gap: 1px;
}
.page-theme-menu__font-row strong {
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.page-theme-menu__font-row em {
  font-size: 12px;
  font-style: normal;
  line-height: 18px;
}
.page-theme-menu__effect-preview {
  grid-template-columns: 1fr;
}
</style>
