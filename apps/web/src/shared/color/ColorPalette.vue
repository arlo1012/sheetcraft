<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { Popup as TPopup } from "tdesign-vue-next/es/popup";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useAppI18n } from "../i18n";
import CustomColorPanel from "./CustomColorPanel.vue";
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
    moreMode?: "inline" | "popup";
    showRecentHeading?: boolean;
  }>(),
  {
    defaultColor: "#20242c",
    showDefault: true,
    mixed: false,
    compact: false,
    columns: 10,
    clearable: false,
    moreMode: "inline",
    showRecentHeading: false,
  },
);

const emit = defineEmits<{ select: [color: string | null] }>();
const { t } = useAppI18n();
const recentColors = ref<string[]>([]);
const showingMore = ref(false);
const showingInlineMore = computed(() => showingMore.value && props.moreMode === "inline");
const focusedSwatch = ref(0);
const swatchButtons = new Map<number, HTMLButtonElement>();
const paletteRef = ref<HTMLElement | null>(null);
const moreButtonRef = ref<HTMLButtonElement | null>(null);
const morePopupOptions = {
  modifiers: [
    { name: "flip", enabled: false },
    {
      name: "offset",
      options: {
        offset: (): [number, number] => {
          const palette = paletteRef.value?.getBoundingClientRect();
          const trigger = moreButtonRef.value?.getBoundingClientRect();
          return palette && trigger
            ? [palette.left - trigger.left, palette.top - trigger.bottom]
            : [0, 0];
        },
      },
    },
  ],
};
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
  showingMore.value = true;
}

function onPopupVisibleChange(visible: boolean): void {
  if (visible) openMore();
  else showingMore.value = false;
}

function backToPalette(): void {
  showingMore.value = false;
  void nextTick(() => moreButtonRef.value?.focus());
}

function applyCustomColor(color: string): void {
  chooseColor(color);
  backToPalette();
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
</script>

<template>
  <section
    ref="paletteRef"
    class="color-palette"
    :class="{
      'is-more': showingInlineMore,
      'is-compact': compact,
      'is-popup-open': showingMore && moreMode === 'popup',
    }"
    :style="{ '--color-palette-columns': gridColumns }"
    :aria-label="t('colorPalette.label')"
  >
    <template v-if="!showingInlineMore">
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

      <TPopup
        v-if="!isRestricted && moreMode === 'popup'"
        :visible="showingMore"
        trigger="click"
        placement="bottom-left"
        :popper-options="morePopupOptions"
        :overlay-inner-style="{ padding: '0', margin: '0' }"
        @visible-change="onPopupVisibleChange"
      >
        <button
          ref="moreButtonRef"
          type="button"
          class="color-palette__more"
          data-color-action="more"
          aria-haspopup="dialog"
          :aria-expanded="showingMore"
        >
          <span>{{ t("colorPalette.more") }}</span>
          <ChevronRight :size="14" aria-hidden="true" />
        </button>
        <template #content>
          <div v-if="showingMore" role="dialog" :aria-label="t('colorPalette.more')">
            <CustomColorPanel
              :model-value="selectedColor ?? normalizedDefaultColor ?? '#20242c'"
              @back="backToPalette"
              @apply="applyCustomColor"
            />
          </div>
        </template>
      </TPopup>
      <button
        v-else-if="!isRestricted"
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
    </template>

    <CustomColorPanel
      v-else
      :model-value="selectedColor ?? normalizedDefaultColor ?? '#20242c'"
      @back="backToPalette"
      @apply="applyCustomColor"
    />
  </section>
</template>

<style scoped lang="scss">
.color-palette {
  --color-palette-swatch-size: 16px;

  width: 208px;
  padding: var(--idea-tool-panel-padding);
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);

  &.is-popup-open {
    visibility: hidden;
  }

  &__default,
  &__more,
  &__clear {
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
  &.is-more {
    width: max-content;
    max-width: min(360px, calc(100vw - 32px));
    padding: 0;
  }
}
</style>
