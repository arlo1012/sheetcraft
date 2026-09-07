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
  }>(),
  { defaultColor: "#20242c", showDefault: true, mixed: false },
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
const allSwatches = computed(() => [...PRESET_COLORS, ...STANDARD_COLORS, ...recentColors.value]);
const selectedColor = computed(() => normalizeColor(props.modelValue));
const isDefaultSelected = computed(
  () =>
    !props.mixed &&
    (!selectedColor.value || selectedColor.value === normalizeColor(props.defaultColor)),
);
const defaultLabel = computed(() => props.defaultLabel ?? t("colorPalette.default"));

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

function chooseColor(color: string): void {
  const normalized = normalizeColor(color);
  if (!normalized) return;
  recentColors.value = recordRecentColor(normalized);
  emit("select", normalized);
}

function isColorSelected(color: string): boolean {
  return !props.mixed && selectedColor.value === color;
}

function selectDefault(): void {
  emit("select", null);
}

function openMore(): void {
  draftColor.value = selectedColor.value ?? normalizeColor(props.defaultColor) ?? "#20242c";
  showingMore.value = true;
  void nextTick(() =>
    rootRef.value?.querySelector<HTMLElement>("[role='slider'], input, button")?.focus(),
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
    :class="{ 'is-more': showingMore }"
    :aria-label="t('colorPalette.label')"
    @keydown="onPanelKeydown"
  >
    <template v-if="!showingMore">
      <button
        v-if="showDefault"
        type="button"
        class="color-palette__default"
        data-color-action="default"
        :aria-pressed="isDefaultSelected"
        @click="selectDefault"
      >
        {{ defaultLabel }}
      </button>

      <div class="color-palette__section">
        <p class="color-palette__heading">{{ t("colorPalette.theme") }}</p>
        <div class="color-palette__grid" role="radiogroup" :aria-label="t('colorPalette.theme')">
          <button
            v-for="(color, index) in PRESET_COLORS"
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
            @keydown="onSwatchKeydown($event, index, 10)"
          />
        </div>
      </div>

      <div class="color-palette__section">
        <p class="color-palette__heading">{{ t("colorPalette.standard") }}</p>
        <div
          class="color-palette__grid color-palette__grid--single"
          role="radiogroup"
          :aria-label="t('colorPalette.standard')"
        >
          <button
            v-for="(color, index) in STANDARD_COLORS"
            :key="color"
            :ref="setSwatchRef(PRESET_COLORS.length + index)"
            type="button"
            class="color-palette__swatch"
            :class="{ 'is-selected': isColorSelected(color) }"
            :style="{ backgroundColor: color }"
            :data-color-swatch="color"
            role="radio"
            :aria-checked="isColorSelected(color)"
            :aria-label="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :title="t('colorPalette.colorValue', { value: color.toUpperCase() })"
            :tabindex="focusedSwatch === PRESET_COLORS.length + index ? 0 : -1"
            @click="chooseColor(color)"
            @keydown="onSwatchKeydown($event, PRESET_COLORS.length + index, 10)"
          />
        </div>
      </div>

      <div class="color-palette__section">
        <p class="color-palette__heading">{{ t("colorPalette.recent") }}</p>
        <div
          class="color-palette__grid color-palette__grid--single"
          role="radiogroup"
          :aria-label="t('colorPalette.recent')"
        >
          <button
            v-for="(color, index) in recentColors"
            :key="color"
            :ref="setSwatchRef(PRESET_COLORS.length + STANDARD_COLORS.length + index)"
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
              focusedSwatch === PRESET_COLORS.length + STANDARD_COLORS.length + index ? 0 : -1
            "
            @click="chooseColor(color)"
            @keydown="
              onSwatchKeydown($event, PRESET_COLORS.length + STANDARD_COLORS.length + index, 10)
            "
          />
          <span
            v-for="index in 10 - recentColors.length"
            :key="`empty-${index}`"
            class="color-palette__swatch color-palette__swatch--empty"
            aria-hidden="true"
          />
        </div>
      </div>

      <button
        ref="moreButtonRef"
        type="button"
        class="color-palette__more"
        data-color-action="more"
        @click="openMore"
      >
        <span>{{ t("colorPalette.more") }}</span>
        <ChevronRight :size="14" aria-hidden="true" />
      </button>
    </template>

    <template v-else>
      <ColorPickerPanel
        class="idea-color-palette-panel"
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
    </template>
  </section>
</template>

<style scoped lang="scss">
.color-palette {
  width: 208px;
  padding: 8px;
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);

  &__default,
  &__more,
  &__actions button {
    width: 100%;
    min-height: 25px;
    border: 1px solid var(--idea-border-control);
    border-radius: 2px;
    background: var(--idea-surface-panel);
    color: inherit;
    font: inherit;
    font-size: 12px;
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
    font-size: 12px;
    line-height: 16px;
  }
  &__grid {
    display: grid;
    grid-template-columns: repeat(10, 16px);
    gap: 3px;
  }
  &__grid--single {
    min-height: 16px;
  }
  &__swatch {
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border: 1px solid rgb(0 0 0 / 12%);
    border-radius: 1px;
    cursor: pointer;

    &:hover {
      border-color: rgb(0 0 0 / 32%);
    }
    &.is-selected {
      outline: 2px solid var(--idea-text-primary);
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
  &__actions {
    display: flex;
    gap: 6px;
    padding: 0 var(--idea-space-5) var(--idea-space-5);
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
}
</style>
