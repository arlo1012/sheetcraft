<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Palette } from "lucide-vue-next";
import type { WorkbookTheme } from "@idea10/core/workbook-theme";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { PAGE_THEME_PRESETS } from "../page-theme-presets";

const props = withDefaults(defineProps<{ theme: WorkbookTheme; disabled?: boolean }>(), {
  disabled: false,
});
const emit = defineEmits<{ apply: [theme: WorkbookTheme] }>();
const { t } = useAppI18n();
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const panelId = `page-theme-menu-${useId().replaceAll(":", "")}`;
const presetButtons = new Map<string, HTMLButtonElement>();
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => props.disabled),
  placement: "bottom-start",
});
function select(theme: WorkbookTheme): void {
  dismiss("programmatic", true);
  emit("apply", theme);
}
function setPresetRef(theme: WorkbookTheme) {
  return (element: unknown): void => {
    if (element instanceof HTMLButtonElement) presetButtons.set(theme.id, element);
    else presetButtons.delete(theme.id);
  };
}
function moveFocus(event: KeyboardEvent, theme: WorkbookTheme): void {
  const current = PAGE_THEME_PRESETS.findIndex((preset) => preset.id === theme.id);
  const offset =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? PAGE_THEME_PRESETS.length - 1
        : current + offset;
  if (!offset && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  const target = PAGE_THEME_PRESETS[Math.max(0, Math.min(PAGE_THEME_PRESETS.length - 1, next))];
  if (target) void nextTick(() => presetButtons.get(target.id)?.focus());
}
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
        class="page-theme-menu__surface"
        :style="floatingStyles"
        :label="t('pageTools.theme')"
      >
        <p class="page-theme-menu__description">{{ t("pageTools.themeDescription") }}</p>
        <div class="page-theme-menu__grid" role="radiogroup" :aria-label="t('pageTools.theme')">
          <button
            v-for="preset in PAGE_THEME_PRESETS"
            :key="preset.id"
            :ref="setPresetRef(preset)"
            type="button"
            class="page-theme-menu__preset"
            :class="{ 'is-selected': preset.id === theme.id }"
            role="radio"
            :aria-checked="preset.id === theme.id"
            @click="select(preset)"
            @keydown="moveFocus($event, preset)"
          >
            <span class="page-theme-menu__swatches" aria-hidden="true"
              ><i
                v-for="color in preset.accentColors"
                :key="color"
                :style="{ backgroundColor: color }"
            /></span>
            <span>{{ preset.name }}</span>
          </button>
        </div>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.page-theme-menu {
  min-width: 0;
}
.page-theme-menu__surface {
  z-index: 50;
  width: min(336px, calc(100vw - 24px));
}
.page-theme-menu__description {
  margin: 0 0 8px;
  color: var(--idea-text-secondary);
  font-size: 12px;
}
.page-theme-menu__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.page-theme-menu__preset {
  display: grid;
  gap: 5px;
  padding: 7px;
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-small);
  background: var(--idea-surface-panel);
  color: inherit;
  text-align: left;
  cursor: pointer;
  &:hover {
    background: var(--idea-surface-secondary);
  }
  &.is-selected {
    border-color: var(--idea-border-control);
    background: var(--idea-surface-active);
  }
}
.page-theme-menu__swatches {
  display: flex;
  height: 16px;
  overflow: hidden;
  border-radius: 2px;
  i {
    flex: 1;
  }
}
</style>
