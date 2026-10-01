<script setup lang="ts">
import { Eye, Maximize2, Minimize2, Minus, Plus } from "lucide-vue-next";
import SheetHighlightControl from "../../../shared/sheet-view/SheetHighlightControl.vue";
import SheetZoomMenu from "../../../shared/sheet-view/SheetZoomMenu.vue";
import WorkbookDisplaySettings from "./WorkbookDisplaySettings.vue";
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import {
  MAX_SHEET_ZOOM,
  MIN_SHEET_ZOOM,
  normalizeSheetZoom,
  SHEET_ZOOM_STEP,
} from "../../../shared/sheet-view/zoom";

const props = withDefaults(
  defineProps<{
    zoom?: number;
    showHeaders?: boolean;
    showGridLines?: boolean;
    showAxisQuickTools?: boolean;
    eyeComfortEnabled?: boolean;
    highlightEnabled?: boolean;
    highlightColor?: string;
    fullscreen?: boolean;
    fullscreenAvailable?: boolean;
  }>(),
  {
    zoom: 100,
    showHeaders: true,
    showGridLines: true,
    showAxisQuickTools: false,
    eyeComfortEnabled: false,
    highlightEnabled: false,
    highlightColor: "#22a06b",
    fullscreen: false,
    fullscreenAvailable: false,
  },
);

const emit = defineEmits<{
  "update:zoom": [zoom: number];
  "update:showHeaders": [value: boolean];
  "update:showGridLines": [value: boolean];
  "update:showAxisQuickTools": [value: boolean];
  "update:eyeComfortEnabled": [enabled: boolean];
  "update:highlightEnabled": [enabled: boolean];
  "update:highlightColor": [color: string];
  toggleFullscreen: [];
  fitSelection: [];
}>();

const { t } = useAppI18n();
const zoomProgress = computed(
  () =>
    `${((normalizeSheetZoom(props.zoom) - MIN_SHEET_ZOOM) / (MAX_SHEET_ZOOM - MIN_SHEET_ZOOM)) * 100}%`,
);

function updateZoom(value: number): void {
  emit("update:zoom", normalizeSheetZoom(value));
}

function onNativeSliderInput(event: Event): void {
  if (event.currentTarget instanceof HTMLInputElement) {
    updateZoom(event.currentTarget.valueAsNumber);
  }
}
</script>

<template>
  <div
    class="workbook-view-controls"
    :aria-label="t('statusBar.viewAndZoom')"
    role="group"
  >
    <button
      type="button"
      class="workbook-view-controls__button workbook-view-controls__eye-comfort"
      :class="{ 'is-active': eyeComfortEnabled }"
      :aria-label="t('statusBar.eyeComfortMode')"
      :aria-pressed="eyeComfortEnabled"
      :title="t('statusBar.eyeComfortMode')"
      data-view-control="eye-comfort"
      @click="emit('update:eyeComfortEnabled', !eyeComfortEnabled)"
    >
      <Eye :size="15" aria-hidden="true" />
    </button>
    <WorkbookDisplaySettings
      :show-headers="showHeaders"
      :show-grid-lines="showGridLines"
      :show-axis-quick-tools="showAxisQuickTools"
      @update:show-headers="emit('update:showHeaders', $event)"
      @update:show-grid-lines="emit('update:showGridLines', $event)"
      @update:show-axis-quick-tools="emit('update:showAxisQuickTools', $event)"
    />
    <SheetHighlightControl
      :highlight-enabled="highlightEnabled"
      :highlight-color="highlightColor"
      @update:highlight-enabled="emit('update:highlightEnabled', $event)"
      @update:highlight-color="emit('update:highlightColor', $event)"
    />

    <button
      v-if="fullscreenAvailable"
      type="button"
      class="workbook-view-controls__button"
      :aria-label="
        t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')
      "
      :aria-pressed="fullscreen"
      :title="
        t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')
      "
      data-view-control="fullscreen"
      @click="emit('toggleFullscreen')"
    >
      <Minimize2 v-if="fullscreen" :size="15" aria-hidden="true" />
      <Maximize2 v-else :size="15" aria-hidden="true" />
    </button>

    <div
      class="workbook-view-controls__zoom"
      role="group"
      :aria-label="t('statusBar.zoomSlider')"
    >
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
      <div
        class="workbook-view-controls__slider"
        data-view-control="zoom-slider"
      >
        <input
          class="workbook-view-controls__slider-input"
          type="range"
          :value="normalizeSheetZoom(zoom)"
          :min="MIN_SHEET_ZOOM"
          :max="MAX_SHEET_ZOOM"
          :step="1"
          :aria-label="t('statusBar.zoomSlider')"
          :aria-valuetext="
            t('statusBar.zoomLevel', { value: normalizeSheetZoom(zoom) })
          "
          :style="{ '--zoom-progress': zoomProgress }"
          @input="onNativeSliderInput"
        />
      </div>
      <SheetZoomMenu
        :zoom="normalizeSheetZoom(zoom)"
        @select="updateZoom"
        @fit-selection="emit('fitSelection')"
      />
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
  </div>
</template>

<style scoped lang="scss">
.workbook-view-controls {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: 22px;
  color: var(--idea-text-secondary);

  &__zoom {
    display: inline-flex;
    align-items: center;
    height: 100%;
  }

  &__button {
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
      background: var(--idea-icon-button-hover-bg);
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

  &__eye-comfort {
    border-radius: 2px;

    &.is-active {
      background: var(--idea-action-focus);
      color: var(--idea-action-primary);
    }
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
      box-shadow: 0 0 0 1px
        color-mix(in srgb, var(--idea-action-primary), transparent 45%);
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
      box-shadow: 0 0 0 1px
        color-mix(in srgb, var(--idea-action-primary), transparent 45%);
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

  @media (max-width: 640px) {
    &__slider {
      width: 58px;
      min-width: 36px;
      margin: 0 1px;
    }
  }

  @media (max-width: 440px) {
    &__slider {
      width: 36px;
    }
  }
}
</style>
