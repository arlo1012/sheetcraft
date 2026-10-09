<script setup lang="ts">
import { ref } from "vue";

defineOptions({ inheritAttrs: false });

type FloatingPanelLayer =
  | "menu"
  | "submenu"
  | "context-menu"
  | "context-submenu"
  | "popover"
  | "toolbar"
  | "sheet-menu";
type FloatingPanelPadding = "none" | "compact" | "menu" | "tool";
type FloatingPanelRole = "dialog" | "presentation" | "toolbar" | "group";

const props = withDefaults(
  defineProps<{
    label: string;
    role?: FloatingPanelRole;
    padding?: FloatingPanelPadding;
    scrollable?: boolean;
    constrainToViewport?: boolean;
    viewportInset?: string;
    layer?: FloatingPanelLayer;
    appearance?: "default" | "note";
    tabindex?: number | string;
  }>(),
  {
    role: "dialog",
    padding: "none",
    scrollable: true,
    constrainToViewport: true,
    viewportInset: "var(--sheetcraft-space-4)",
    layer: "menu",
    appearance: "default",
    tabindex: -1,
  },
);

const rootElement = ref<HTMLElement | null>(null);

defineExpose({ rootElement });
</script>

<template>
  <div
    ref="rootElement"
    v-bind="$attrs"
    :class="[
      'idea-floating-panel-surface',
      `idea-floating-panel-surface--padding-${padding}`,
      `idea-floating-panel-surface--layer-${layer}`,
      { 'idea-floating-panel-surface--note': appearance === 'note' },
      {
        'idea-floating-panel-surface--scrollable': scrollable,
        'idea-floating-panel-surface--constrained': constrainToViewport,
      },
      $attrs.class,
    ]"
    :style="[{ '--sheetcraft-floating-panel-inset': viewportInset }, $attrs.style]"
    :role="role"
    :aria-label="label"
    :tabindex="tabindex"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
@use "./floating-panel" as panel;

.idea-floating-panel-surface {
  @include panel.surface;

  outline: none;

  &--note {
    color: var(--sheetcraft-note-text);
    background: var(--sheetcraft-note-background);
    border: 1px solid var(--sheetcraft-note-border);
    border-radius: 0;
    box-shadow: none;
  }

  &--padding-compact {
    padding: var(--sheetcraft-space-2);
  }

  &--padding-menu {
    padding: var(--sheetcraft-menu-padding);
  }

  &--padding-tool {
    padding: var(--sheetcraft-tool-panel-padding);
  }

  &--layer-submenu {
    z-index: var(--sheetcraft-layer-submenu);
  }

  &--layer-context-menu {
    z-index: var(--sheetcraft-layer-context-menu);
  }

  &--layer-context-submenu {
    z-index: var(--sheetcraft-layer-context-submenu);
  }

  &--layer-popover {
    z-index: var(--sheetcraft-layer-popover);
  }

  &--layer-toolbar {
    z-index: var(--sheetcraft-layer-toolbar);
  }

  &--layer-sheet-menu {
    z-index: var(--sheetcraft-layer-sheet-menu);
  }

  &:not(.idea-floating-panel-surface--scrollable) {
    overflow: visible;
  }

  &:not(.idea-floating-panel-surface--constrained) {
    max-width: none;
    max-height: none;
  }
}
</style>
