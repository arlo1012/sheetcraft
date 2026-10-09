<script setup lang="ts">
import { ChevronDown, Icon as LucideIcon } from "lucide-vue-next";
import type { IconNode } from "lucide-vue-next";
import { computed, nextTick, ref, useId } from "vue";
import ColorPalette from "../color/ColorPalette.vue";
import { getContrastingForeground, mixHexColors } from "../color/contrast";
import { normalizeColor } from "../color/palette";
import { useDismissibleFloatingPanel } from "../floating/useDismissibleFloatingPanel";
import FloatingPanelSurface from "../floating/FloatingPanelSurface.vue";
import { vIconAction } from "../focus/icon-action";
import { useAppI18n } from "../i18n";
import RibbonSplitButton from "../ribbon/RibbonSplitButton.vue";

const HIGHLIGHT_ICON_NODE: IconNode = [
  ["rect", { x: "9", y: "3", width: "6", height: "18", rx: "1" }],
  ["rect", { x: "3", y: "9", width: "18", height: "6", rx: "1" }],
];
const PALE_HIGHLIGHT_COLORS = [
  "#f3f5f7",
  "#d6e5ff",
  "#d6f1ff",
  "#d3f3e2",
  "#ffdcdb",
  "#ffecdb",
  "#fff5cc",
  "#fbdbff",
  "#ffdbea",
  "#c5cad3",
  "#adcbff",
  "#ade4ff",
  "#ace2c5",
  "#ffb5b2",
  "#ffcea3",
  "#ffea99",
  "#e7b4ff",
  "#ffb2dc",
];
const props = withDefaults(
  defineProps<{
    highlightEnabled: boolean;
    highlightColor: string;
    variant?: "status" | "ribbon";
  }>(),
  { variant: "status" },
);
const emit = defineEmits<{
  "update:highlightEnabled": [value: boolean];
  "update:highlightColor": [value: string];
}>();
const { t } = useAppI18n();
const statusColorTriggerRef = ref<HTMLElement | null>(null);
const ribbonRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const colorTriggerRef = computed(() =>
  props.variant === "ribbon" ? (ribbonRef.value?.menuElement ?? null) : statusColorTriggerRef.value,
);
const colorPanelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const colorPanelRef = computed(() => colorPanelSurfaceRef.value?.rootElement ?? null);
const colorPickerOpen = ref(false);
const colorPanelId = `sheet-highlight-color-${useId().replaceAll(":", "")}`;
const colorTriggerRefValue = computed(() => colorTriggerRef.value);
const selectedColor = computed(() => normalizeColor(props.highlightColor) ?? "#22a06b");
const highlightStyles = computed(() => {
  const background = PALE_HIGHLIGHT_COLORS.includes(selectedColor.value)
    ? selectedColor.value
    : mixHexColors(selectedColor.value, "#FFFFFF", 0.2);
  return {
    "--highlight-background": background,
    "--highlight-foreground": getContrastingForeground(background),
  };
});
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(
  colorTriggerRefValue,
  colorPanelRef,
  colorPickerOpen,
  {
    offset: 6,
    placement: props.variant === "ribbon" ? "bottom-start" : "top-end",
    onDismiss: () => {
      colorPickerOpen.value = false;
    },
  },
);
function toggleHighlight(): void {
  emit("update:highlightEnabled", !props.highlightEnabled);
}
function openColorPicker(): void {
  colorPickerOpen.value = true;
  void nextTick(() => colorPanelRef.value?.focus());
}
function toggleColorPicker(): void {
  if (colorPickerOpen.value) dismiss("programmatic", true);
  else openColorPicker();
}
function onColorTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openColorPicker();
}
function selectHighlightColor(value: string | null): void {
  if (value === null) emit("update:highlightEnabled", false);
  else {
    const color = normalizeColor(value);
    if (color) {
      emit("update:highlightColor", color);
      emit("update:highlightEnabled", true);
    }
  }
  dismiss("programmatic", true);
}
</script>

<template>
  <div
    class="sheet-highlight-control"
    :class="[`is-${variant}`, { 'is-active': highlightEnabled }]"
    :style="highlightStyles"
  >
    <RibbonSplitButton
      ref="ribbonRef"
      v-if="variant === 'ribbon'"
      variant="tall"
      :label="t('statusBar.highlightRowColumn')"
      :text="t('viewTools.highlight')"
      :pressed="highlightEnabled"
      :menu-label="t('statusBar.highlightColor')"
      :expanded="colorPickerOpen"
      :menu-id="colorPanelId"
      popup-role="dialog"
      @toggle-menu="toggleColorPicker"
      @menu-keydown="onColorTriggerKeydown"
      @activate="toggleHighlight"
      ><LucideIcon name="HighlightRowColumn" :iconNode="HIGHLIGHT_ICON_NODE" aria-hidden="true"
    /></RibbonSplitButton>
    <span
      v-icon-action
      v-else
      class="sheet-highlight-control__status-button"
      :aria-label="t('statusBar.highlightRowColumn')"
      :aria-pressed="highlightEnabled"
      :title="t('statusBar.highlightRowColumnDescription')"
      data-view-control="highlight-toggle"
      @click="toggleHighlight"
    >
      <LucideIcon
        name="HighlightRowColumn"
        :iconNode="HIGHLIGHT_ICON_NODE"
        :size="15"
        :stroke-width="1.8"
        aria-hidden="true"
      />
    </span>
    <span
      v-icon-action
      v-if="variant === 'status'"
      ref="statusColorTriggerRef"
      class="sheet-highlight-control__color-trigger"
      :aria-label="t('statusBar.highlightColor')"
      :aria-controls="colorPickerOpen ? colorPanelId : undefined"
      :aria-expanded="colorPickerOpen"
      aria-haspopup="dialog"
      :title="t('statusBar.highlightColor')"
      data-view-control="highlight-color"
      @click="toggleColorPicker"
      @keydown="onColorTriggerKeydown"
    >
      <ChevronDown :size="12" aria-hidden="true" />
    </span>
  </div>
  <Teleport to="body"
    ><FloatingPanelSurface
      v-if="colorPickerOpen"
      :id="colorPanelId"
      ref="colorPanelSurfaceRef"
      class="sheet-highlight-control__color-panel"
      :style="floatingStyles"
      :label="t('statusBar.highlightColor')"
      layer="toolbar"
      :data-cell-edit-session="
        colorTriggerRef?.closest('[data-cell-edit-session]')?.getAttribute('data-cell-edit-session')
      "
    >
      <ColorPalette
        :model-value="highlightEnabled ? selectedColor : null"
        :allowed-colors="PALE_HIGHLIGHT_COLORS"
        :show-default="false"
        :columns="9"
        compact
        clearable
        @select="selectHighlightColor" /></FloatingPanelSurface
  ></Teleport>
</template>

<style scoped lang="scss">
.sheet-highlight-control {
  display: inline-flex;
  align-items: center;
  height: 100%;
  &.is-status {
    border-radius: var(--sheetcraft-radius-small);
    &.is-active {
      background: var(--highlight-background);
      color: var(--highlight-foreground);
    }
  }
  &.is-ribbon {
    align-self: stretch;
    height: var(--sheetcraft-ribbon-content-height, 54px);
  }
  &__status-button,
  &__color-trigger {
    display: grid;
    place-items: center;
    width: 24px;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}
</style>
