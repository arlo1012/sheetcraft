<script setup lang="ts">
import {
  ChevronDown,
  Icon as LucideIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
} from "lucide-vue-next";
import type { IconNode } from "lucide-vue-next";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { computed, nextTick, ref, useId } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import {
  MAX_SHEET_ZOOM,
  MIN_SHEET_ZOOM,
  normalizeSheetZoom,
  SHEET_ZOOM_STEP,
} from "../../../shared/sheet-view/zoom";

const HIGHLIGHT_COLORS = [
  "#22a06b",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
] as const;
const DISABLED_RECENT_COLORS = null as unknown as string[];
const HIGHLIGHT_ICON_NODE: IconNode = [
  ["rect", { x: "9", y: "3", width: "6", height: "18", rx: "1" }],
  ["rect", { x: "3", y: "9", width: "18", height: "6", rx: "1" }],
];

const props = withDefaults(
  defineProps<{
    zoom?: number;
    highlightEnabled?: boolean;
    highlightColor?: string;
    fullscreen?: boolean;
    fullscreenAvailable?: boolean;
  }>(),
  {
    zoom: 100,
    highlightEnabled: false,
    highlightColor: "#22a06b",
    fullscreen: false,
    fullscreenAvailable: false,
  },
);

const emit = defineEmits<{
  "update:zoom": [zoom: number];
  "update:highlightEnabled": [enabled: boolean];
  "update:highlightColor": [color: string];
  toggleFullscreen: [];
}>();

const { t } = useAppI18n();
const colorTriggerRef = ref<HTMLButtonElement | null>(null);
const colorPanelRef = ref<HTMLDivElement | null>(null);
const colorPickerOpen = ref(false);
const colorPanelId = `workbook-highlight-color-${useId().replaceAll(":", "")}`;
const colorTriggerRefValue = computed(() => colorTriggerRef.value);
const selectedColor = computed(() => normalizeColor(props.highlightColor) ?? "#22a06b");
const zoomProgress = computed(
  () =>
    `${((normalizeSheetZoom(props.zoom) - MIN_SHEET_ZOOM) / (MAX_SHEET_ZOOM - MIN_SHEET_ZOOM)) * 100}%`,
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(
  colorTriggerRefValue,
  colorPanelRef,
  colorPickerOpen,
  {
    offset: 6,
    placement: "top-end",
    onDismiss: () => {
      colorPickerOpen.value = false;
    },
  },
);

function normalizeColor(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

function updateZoom(value: number): void {
  emit("update:zoom", normalizeSheetZoom(value));
}

function onNativeSliderInput(event: Event): void {
  if (event.currentTarget instanceof HTMLInputElement) {
    updateZoom(event.currentTarget.valueAsNumber);
  }
}

function toggleHighlight(): void {
  emit("update:highlightEnabled", !props.highlightEnabled);
}

function openColorPicker(): void {
  colorPickerOpen.value = true;
  void nextTick(() => colorPanelRef.value?.focus());
}

function toggleColorPicker(): void {
  if (colorPickerOpen.value) {
    dismiss("programmatic", true);
  } else {
    openColorPicker();
  }
}

function onColorTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  openColorPicker();
}

function selectHighlightColor(value: string): void {
  const color = normalizeColor(value);
  if (color) {
    emit("update:highlightColor", color);
    emit("update:highlightEnabled", true);
  }
  dismiss("programmatic", true);
}
</script>

<template>
  <div class="workbook-view-controls" :aria-label="t('statusBar.viewAndZoom')" role="group">
    <div class="workbook-view-controls__highlight" :class="{ 'is-active': highlightEnabled }">
      <button
        type="button"
        class="workbook-view-controls__button workbook-view-controls__highlight-toggle"
        :aria-label="t('statusBar.highlightRowColumn')"
        :aria-pressed="highlightEnabled"
        :title="t('statusBar.highlightRowColumnDescription')"
        data-view-control="highlight-toggle"
        @click="toggleHighlight"
      >
        <LucideIcon
          :iconNode="HIGHLIGHT_ICON_NODE"
          :size="15"
          :stroke-width="1.8"
          aria-hidden="true"
        />
      </button>
      <button
        ref="colorTriggerRef"
        type="button"
        class="workbook-view-controls__button workbook-view-controls__color-trigger"
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
      </button>
    </div>

    <button
      v-if="fullscreenAvailable"
      type="button"
      class="workbook-view-controls__button"
      :aria-label="t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')"
      :aria-pressed="fullscreen"
      :title="t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')"
      data-view-control="fullscreen"
      @click="emit('toggleFullscreen')"
    >
      <Minimize2 v-if="fullscreen" :size="15" aria-hidden="true" />
      <Maximize2 v-else :size="15" aria-hidden="true" />
    </button>

    <div class="workbook-view-controls__zoom" role="group" :aria-label="t('statusBar.zoomSlider')">
      <button
        type="button"
        class="workbook-view-controls__button"
        :disabled="normalizeSheetZoom(zoom) <= MIN_SHEET_ZOOM"
        :aria-label="t('statusBar.zoomOut')"
        :title="t('statusBar.zoomOut')"
        data-view-control="zoom-out"
        @click="updateZoom(zoom - SHEET_ZOOM_STEP)"
      >
        <Minus :size="15" aria-hidden="true" />
      </button>
      <div class="workbook-view-controls__slider" data-view-control="zoom-slider">
        <input
          class="workbook-view-controls__slider-input"
          type="range"
          :value="normalizeSheetZoom(zoom)"
          :min="MIN_SHEET_ZOOM"
          :max="MAX_SHEET_ZOOM"
          :step="SHEET_ZOOM_STEP"
          :aria-label="t('statusBar.zoomSlider')"
          :aria-valuetext="t('statusBar.zoomLevel', { value: normalizeSheetZoom(zoom) })"
          :style="{ '--zoom-progress': zoomProgress }"
          @input="onNativeSliderInput"
        />
      </div>
      <button
        type="button"
        class="workbook-view-controls__zoom-value"
        :aria-label="t('statusBar.zoomLevel', { value: normalizeSheetZoom(zoom) })"
        :title="t('statusBar.zoomReset')"
        data-view-control="zoom-reset"
        @click="updateZoom(100)"
      >
        {{ normalizeSheetZoom(zoom) }}%
      </button>
      <button
        type="button"
        class="workbook-view-controls__button"
        :disabled="normalizeSheetZoom(zoom) >= MAX_SHEET_ZOOM"
        :aria-label="t('statusBar.zoomIn')"
        :title="t('statusBar.zoomIn')"
        data-view-control="zoom-in"
        @click="updateZoom(zoom + SHEET_ZOOM_STEP)"
      >
        <Plus :size="15" aria-hidden="true" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="colorPickerOpen"
        :id="colorPanelId"
        ref="colorPanelRef"
        class="workbook-view-controls__color-panel"
        :style="floatingStyles"
        role="dialog"
        :aria-label="t('statusBar.highlightColor')"
        tabindex="-1"
      >
        <ColorPickerPanel
          :model-value="selectedColor"
          :color-modes="['monochrome']"
          format="HEX"
          :enable-alpha="false"
          :recent-colors="DISABLED_RECENT_COLORS"
          :show-primary-color-preview="false"
          :swatch-colors="[...HIGHLIGHT_COLORS]"
          @change="selectHighlightColor"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.workbook-view-controls {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: 22px;
  color: var(--idea-text-secondary);

  &__highlight,
  &__zoom {
    display: inline-flex;
    align-items: center;
    height: 100%;
  }

  &__highlight {
    margin-right: 4px;
    border-right: 1px solid var(--idea-sheet-bar-border);
    border-radius: 2px;

    &.is-active {
      background: var(--idea-action-primary-subtle);
      color: var(--idea-action-primary);

      .workbook-view-controls__button:hover,
      .workbook-view-controls__button[aria-expanded="true"] {
        background: transparent;
        color: inherit;
      }
    }
  }

  &__button,
  &__zoom-value {
    display: inline-grid;
    flex: 0 0 auto;
    width: 24px;
    height: 22px;
    padding: 0;
    place-items: center;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover:not(:disabled),
    &[aria-expanded="true"] {
      background: var(--idea-surface-hover);
      color: var(--idea-text-primary);
    }

    &:focus-visible {
      z-index: 1;
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }

    &:disabled {
      color: var(--idea-text-disabled);
      cursor: default;
    }
  }

  &__highlight-toggle {
    border-radius: 2px 0 0 2px;
  }

  &__color-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    border-radius: 0 2px 2px 0;
  }

  &__zoom {
    margin-left: 2px;
  }

  &__slider {
    flex: 0 0 auto;
    width: 104px;
    height: 22px;
    margin: 0 3px;
  }

  &__slider-input {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    appearance: none;
    outline: none;
    background: transparent;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--idea-action-primary) 0 var(--zoom-progress),
        var(--idea-sheet-bar-thumb) var(--zoom-progress) 100%
      );
    }

    &::-webkit-slider-thumb {
      width: 10px;
      height: 10px;
      margin-top: -4px;
      appearance: none;
      border: 1px solid var(--idea-surface-panel);
      border-radius: 50%;
      background: var(--idea-action-primary);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--idea-action-primary), transparent 45%);
    }

    &::-moz-range-track {
      height: 3px;
      border-radius: 999px;
      background: var(--idea-sheet-bar-thumb);
    }

    &::-moz-range-progress {
      height: 3px;
      border-radius: 999px;
      background: var(--idea-action-primary);
    }

    &::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border: 1px solid var(--idea-surface-panel);
      border-radius: 50%;
      background: var(--idea-action-primary);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--idea-action-primary), transparent 45%);
    }

    &:focus-visible::-webkit-slider-thumb {
      width: 12px;
      height: 12px;
      margin-top: -5px;
    }

    &:focus-visible::-moz-range-thumb {
      width: 12px;
      height: 12px;
    }
  }

  &__zoom-value {
    width: 42px;
    border-radius: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  &__color-panel {
    z-index: 90;
    max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
    max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
    overflow: auto;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-medium);
    box-shadow: var(--idea-shadow-floating);

    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: 2px;
    }
  }

  @media (max-width: 640px) {
    &__highlight {
      margin-right: 2px;
    }

    &__slider {
      width: 58px;
      min-width: 36px;
      margin: 0 1px;
    }

    &__zoom-value {
      width: 38px;
    }
  }

  @media (max-width: 440px) {
    &__slider {
      width: 36px;
    }
  }
}
</style>
