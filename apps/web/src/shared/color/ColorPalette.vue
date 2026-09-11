<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useAppI18n } from "../i18n";
import { createColorPickerSelectInputProps } from "../tdesign/colorPickerPopup";
import {
  PRESET_COLORS,
  STANDARD_COLORS,
  normalizeColor,
  readRecentColors,
  recordRecentColor,
} from "./palette";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    defaultColor?: string;
    defaultLabel?: string;
    showDefault?: boolean;
    mixed?: boolean;
    allowedColors?: readonly string[];
    compact?: boolean;
    columns?: number;
    clearable?: boolean;
    stableSize?: boolean;
    showRecentHeading?: boolean;
  }>(),
  {
    defaultColor: "#20242c",
    showDefault: true,
    mixed: false,
    compact: false,
    columns: 10,
    clearable: false,
    stableSize: false,
    showRecentHeading: false,
  },
);

const emit = defineEmits<{ select: [color: string | null] }>();
const { t } = useAppI18n();
const recentColors = ref<string[]>([]);
const showingMore = ref(false);
const draftColor = ref(
  normalizeColor(props.modelValue) ?? normalizeColor(props.defaultColor) ?? "#20242c",
);
const focusedSwatch = ref(0);
const swatchButtons = new Map<number, HTMLButtonElement>();
const disabledRecentColors = null as unknown as string[];
const rootRef = ref<HTMLElement | null>(null);
const moreButtonRef = ref<HTMLButtonElement | null>(null);
const selectInputProps = createColorPickerSelectInputProps(getPanelAttach);
const allowedColorSet = computed(() => {
  if (props.allowedColors === undefined) return undefined;
  return new Set(
    props.allowedColors
      .map((color) => normalizeColor(color))
      .filter((color): color is string => Boolean(color)),
  );
});
const allowedColors = computed(() => [...(allowedColorSet.value ?? [])]);
const isRestricted = computed(() => allowedColorSet.value !== undefined);
const themeColors = computed(() => (isRestricted.value ? allowedColors.value : PRESET_COLORS));
const standardColors = computed(() => (isRestricted.value ? [] : STANDARD_COLORS));
const paletteRecentColors = computed(() => (isRestricted.value ? [] : recentColors.value));
const allSwatches = computed(() => [
  ...themeColors.value,
  ...standardColors.value,
  ...paletteRecentColors.value,
]);
const selectedColor = computed(() => normalizeColor(props.modelValue));
const normalizedDefaultColor = computed(() => normalizeColor(props.defaultColor));
const showDefaultAction = computed(
  () => props.showDefault && canChooseColor(normalizedDefaultColor.value),
);
const isDefaultSelected = computed(
  () =>
    !props.mixed && (!selectedColor.value || selectedColor.value === normalizedDefaultColor.value),
);
const defaultLabel = computed(() => props.defaultLabel ?? t("colorPalette.default"));
const gridColumns = computed(() => Math.max(1, Math.min(10, Math.trunc(props.columns) || 10)));

onMounted(() => {
  recentColors.value = readRecentColors();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!showingMore.value) {
      draftColor.value = normalizeColor(value) ?? normalizeColor(props.defaultColor) ?? "#20242c";
    }
  },
);

watch(
  () => allSwatches.value.length,
  (length) => {
    if (focusedSwatch.value >= length) focusedSwatch.value = 0;
  },
);

watch(isRestricted, (restricted) => {
  if (restricted) showingMore.value = false;
});

function canChooseColor(color: string | undefined): color is string {
  return (
    color !== undefined && (allowedColorSet.value === undefined || allowedColorSet.value.has(color))
  );
}

function chooseColor(color: string): void {
  const normalized = normalizeColor(color);
  if (!canChooseColor(normalized)) return;
  recentColors.value = recordRecentColor(normalized);
  emit("select", normalized);
}

function isColorSelected(color: string): boolean {
  return !props.mixed && selectedColor.value === color;
}

function selectDefault(): void {
  if (!canChooseColor(normalizedDefaultColor.value)) return;
  emit("select", null);
}

function openMore(): void {
  if (isRestricted.value) return;
  draftColor.value = selectedColor.value ?? normalizeColor(props.defaultColor) ?? "#20242c";
  showingMore.value = true;
  void nextTick(() =>
    rootRef.value
      ?.querySelector<HTMLElement>(
        ".color-palette__view.is-active [role='slider'], .color-palette__view.is-active input, .color-palette__view.is-active button",
      )
      ?.focus(),
  );
}

function backToPalette(): void {
  showingMore.value = false;
  void nextTick(() => moreButtonRef.value?.focus());
}

function applyDraft(): void {
  chooseColor(draftColor.value);
  showingMore.value = false;
}

function updateDraft(value: string, context?: { color?: { hex?: string } }): void {
  const normalized = normalizeColor(context?.color?.hex ?? value);
  if (normalized) draftColor.value = normalized;
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && showingMore.value) {
    event.preventDefault();
    event.stopPropagation();
    backToPalette();
  }
}

function onSwatchKeydown(event: KeyboardEvent, index: number, columns: number): void {
  const rowOffset = event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : 0;
  const columnOffset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  const offset = rowOffset || columnOffset;
  if (!offset) return;
  event.preventDefault();
  event.stopPropagation();
  const next = Math.max(0, Math.min(allSwatches.value.length - 1, index + offset));
  focusedSwatch.value = next;
  void nextTick(() => swatchButtons.get(next)?.focus());
}

function setSwatchRef(index: number) {
  return (element: unknown): void => {
    if (element instanceof HTMLButtonElement) {
      swatchButtons.set(index, element);
    } else {
      swatchButtons.delete(index);
    }
  };
}

function getPanelAttach(): HTMLElement {
  return rootRef.value ?? document.body;
}
</script>

<template>
  <section
    ref="rootRef"
    class="color-palette"
    :class="{
      'is-more': showingMore,
      'is-compact': compact,
      'is-stable': stableSize,
    }"
    :style="{ '--color-palette-columns': gridColumns }"
    :aria-label="t('colorPalette.label')"
    @keydown="onPanelKeydown"
  >
    <div
      v-if="!showingMore || stableSize"
      class="color-palette__view color-palette__view--palette"
      :class="{ 'is-active': !showingMore }"
    >
      <button
        v-if="showDefaultAction"
        type="button"
        class="color-palette__default"
        data-color-action="default"
        :aria-pressed="isDefaultSelected"
        @click="selectDefault"
      >
        {{ defaultLabel }}
      </button>

      <div v-if="themeColors.length" class="color-palette__section">
        <p v-if="!compact" class="color-palette__heading">
          {{ t("colorPalette.theme") }}
        </p>
        <div class="color-palette__grid" role="radiogroup" :aria-label="t('colorPalette.theme')">
          <button
            v-for="(color, index) in themeColors"
            :key="color + index"
            :ref="setSwatchRef(index)"
            type="button"
            class="color-palette__swatch"
            :class="{ 'is-selected': isColorSelected(color) }"
            :style="{ backgroundColor: color }"
            :data-color-swatch="color"
            role="radio"
            :aria-checked="isColorSelected(color)"
            :aria-label="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :title="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :tabindex="focusedSwatch === index ? 0 : -1"
            @click="chooseColor(color)"
            @keydown="onSwatchKeydown($event, index, gridColumns)"
          />
        </div>
      </div>

      <div v-if="standardColors.length" class="color-palette__section">
        <p v-if="!compact" class="color-palette__heading">
          {{ t("colorPalette.standard") }}
        </p>
        <div
          class="color-palette__grid color-palette__grid--single"
          role="radiogroup"
          :aria-label="t('colorPalette.standard')"
        >
          <button
            v-for="(color, index) in standardColors"
            :key="color"
            :ref="setSwatchRef(themeColors.length + index)"
            type="button"
            class="color-palette__swatch"
            :class="{ 'is-selected': isColorSelected(color) }"
            :style="{ backgroundColor: color }"
            :data-color-swatch="color"
            role="radio"
            :aria-checked="isColorSelected(color)"
            :aria-label="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :title="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :tabindex="focusedSwatch === themeColors.length + index ? 0 : -1"
            @click="chooseColor(color)"
            @keydown="onSwatchKeydown($event, themeColors.length + index, gridColumns)"
          />
        </div>
      </div>

      <div v-if="!isRestricted || paletteRecentColors.length" class="color-palette__section">
        <p v-if="!compact || showRecentHeading" class="color-palette__heading">
          {{ t("colorPalette.recent") }}
        </p>
        <div
          class="color-palette__grid color-palette__grid--single"
          role="radiogroup"
          :aria-label="t('colorPalette.recent')"
        >
          <button
            v-for="(color, index) in paletteRecentColors"
            :key="color"
            :ref="setSwatchRef(themeColors.length + standardColors.length + index)"
            type="button"
            class="color-palette__swatch"
            :class="{ 'is-selected': isColorSelected(color) }"
            :style="{ backgroundColor: color }"
            :data-color-swatch="color"
            role="radio"
            :aria-checked="isColorSelected(color)"
            :aria-label="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :title="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :tabindex="
              focusedSwatch === themeColors.length + standardColors.length + index ? 0 : -1
            "
            @click="chooseColor(color)"
            @keydown="
              onSwatchKeydown(
                $event,
                themeColors.length + standardColors.length + index,
                gridColumns,
              )
            "
          />
          <span
            v-for="index in 10 - paletteRecentColors.length"
            :key="`empty-${index}`"
            class="color-palette__swatch color-palette__swatch--empty"
            aria-hidden="true"
          />
        </div>
      </div>

      <button
        v-if="!isRestricted"
        ref="moreButtonRef"
        type="button"
        class="color-palette__more"
        data-color-action="more"
        @click="openMore"
      >
        <span>{{ t("colorPalette.more") }}</span>
        <ChevronRight :size="14" aria-hidden="true" />
      </button>
      <button
        v-if="clearable"
        type="button"
        class="color-palette__clear"
        data-color-action="clear"
        @click="emit('select', null)"
      >
        {{ t("colorPalette.clear") }}
      </button>
    </div>

    <div
      v-if="showingMore || stableSize"
      class="color-palette__view color-palette__view--more"
      :class="{ 'is-active': showingMore }"
    >
      <ColorPickerPanel
        class="idea-color-palette-panel"
        :style="stableSize ? { width: '100%' } : undefined"
        :model-value="draftColor"
        :color-modes="['monochrome']"
        format="HEX"
        :enable-alpha="false"
        :recent-colors="disabledRecentColors"
        :swatch-colors="[]"
        :show-primary-color-preview="false"
        :select-input-props="selectInputProps"
        @change="updateDraft"
      />
      <div class="color-palette__actions">
        <button type="button" data-color-action="back" @click="backToPalette">
          {{ t("colorPalette.back") }}
        </button>
        <button
          type="button"
          class="color-palette__apply"
          data-color-action="apply"
          @click="applyDraft"
        >
          {{ t("format.applyColor") }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.color-palette {
  --color-palette-swatch-size: 16px;

  width: 208px;
  padding: var(--idea-tool-panel-padding);
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);

  &__default,
  &__more,
  &__clear,
  &__actions button {
    width: 100%;
    min-height: 25px;
    border: 1px solid var(--idea-border-control);
    border-radius: 2px;
    background: var(--idea-surface-panel);
    color: inherit;
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    cursor: pointer;

    &:hover {
      background: var(--idea-surface-hover);
    }
    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: 1px;
    }
  }

  &__section {
    margin-top: 7px;
  }
  &__heading {
    margin: 0 0 3px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-medium);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--color-palette-columns), var(--color-palette-swatch-size));
    gap: 3px;
  }
  &__grid--single {
    min-height: 16px;
  }
  &__swatch {
    width: var(--color-palette-swatch-size);
    height: var(--color-palette-swatch-size);
    box-sizing: border-box;
    border: 1px solid rgb(0 0 0 / 12%);
    border-radius: 1px;
    cursor: pointer;

    &:hover {
      border-color: rgb(0 0 0 / 32%);
    }
    &.is-selected {
      outline: 1px solid var(--idea-text-primary);
      outline-offset: 1px;
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: 1px;
    }
  }
  &__swatch--empty {
    border-color: var(--idea-border-control);
    background: var(--idea-surface-panel);
  }
  &__more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 9px;
    border-width: 0;
    text-align: left;
    color: var(--idea-text-primary);
  }
  &__clear {
    margin-top: 8px;
  }
  &.is-compact {
    --color-palette-swatch-size: 20px;

    width: max-content;

    .color-palette__section:first-of-type {
      margin-top: 0;
    }
  }
  &__actions {
    display: flex;
    gap: 6px;
    padding: var(--idea-space-2) var(--idea-tool-panel-padding) var(--idea-tool-panel-padding);
  }
  &__actions button {
    width: auto;
    flex: 1;
  }
  &.is-more {
    width: max-content;
    max-width: min(360px, calc(100vw - 32px));
    padding: 0;

    .color-palette__apply {
      border-color: var(--idea-action-primary);
      background: var(--idea-action-primary);
      color: #fff;
    }
  }
  &.is-stable {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    width: calc(
      var(--color-palette-columns) * var(--color-palette-swatch-size) +
        (var(--color-palette-columns) - 1) * 3px + 2 * var(--idea-tool-panel-padding)
    );
    max-width: min(360px, 100%, calc(100vw - 32px));

    .color-palette__view {
      grid-area: 1 / 1;
      min-width: 0;
    }
    .color-palette__view--palette {
      display: flex;
      flex-direction: column;
      padding: var(--idea-tool-panel-padding);

      .color-palette__section:last-of-type {
        margin-bottom: 9px;
      }
      .color-palette__more {
        margin-top: auto;
      }
    }
    .color-palette__view:not(.is-active) {
      visibility: hidden;
      pointer-events: none;
    }
  }
}
</style>
