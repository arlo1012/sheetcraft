<script setup lang="ts">
import { Check, ChevronDown } from "lucide-vue-next";
import { Popup as TPopup } from "tdesign-vue-next/es/popup";
import { computed, nextTick, ref, watch } from "vue";
import type {
  CellBorder,
  CellBorderAction,
  CellBorderFormatPatch,
  CellBorderLineStyle,
} from "@idea10/core/style";
import type { SelectionBorderState } from "@idea10/core/style-state";
import BorderLinePreview from "../../../shared/borders/BorderLinePreview.vue";
import { getBorderLinePresentation } from "../../../shared/borders/borderPresentation";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";

type BorderSide =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "innerHorizontal"
  | "innerVertical"
  | "diagonalUp"
  | "diagonalDown";

const DEFAULT_BORDER: CellBorder = { style: "thin", color: "#20242c" };

const props = defineProps<{
  state: SelectionBorderState;
  actions: CellBorderAction[];
  format?: CellBorderFormatPatch;
}>();

const emit = defineEmits<{
  "update:actions": [actions: CellBorderAction[]];
  "update:format": [format: CellBorderFormatPatch];
}>();

const { t } = useAppI18n();
const lineStyle = ref<CellBorderLineStyle>(DEFAULT_BORDER.style);
const color = ref(DEFAULT_BORDER.color);
const lineStyleOpen = ref(false);
const colorPickerOpen = ref(false);
const lineStyleTriggerRef = ref<HTMLButtonElement | null>(null);
const colorTriggerRef = ref<HTMLButtonElement | null>(null);

const border = computed<CellBorder>(() => ({
  style: lineStyle.value,
  color: color.value,
}));

function stateFor(side: BorderSide) {
  return props.state[side];
}

function affectedSides(preset: CellBorderAction["preset"]): BorderSide[] {
  if (preset === "all") {
    return ["top", "right", "bottom", "left", "innerHorizontal", "innerVertical"];
  }
  if (preset === "none") {
    return [
      "top",
      "right",
      "bottom",
      "left",
      "innerHorizontal",
      "innerVertical",
      "diagonalUp",
      "diagonalDown",
    ];
  }
  if (preset === "outer") return ["top", "right", "bottom", "left"];
  if (preset === "inner") return ["innerHorizontal", "innerVertical"];
  return [preset];
}

function actionBorder(action: CellBorderAction): CellBorder | null {
  if (action.preset === "none" || action.border === null) return null;
  return action.border ?? DEFAULT_BORDER;
}

function effectiveBorder(side: BorderSide): CellBorder | undefined {
  let value = stateFor(side).value;
  for (const action of props.actions) {
    if (affectedSides(action.preset).includes(side)) {
      value = actionBorder(action) ?? undefined;
    }
  }
  return value ? { ...value, ...props.format } : undefined;
}

function hasDraftAction(side: BorderSide): boolean {
  return props.actions.some((action) => affectedSides(action.preset).includes(side));
}

function isActive(side: BorderSide): boolean {
  return Boolean(effectiveBorder(side));
}

function isMixed(side: BorderSide): boolean {
  return !hasDraftAction(side) && stateFor(side).mixed;
}

function matchesBrush(value: CellBorder | undefined): boolean {
  return value?.style === lineStyle.value && value.color.toLowerCase() === color.value;
}

function append(action: CellBorderAction): void {
  emit("update:actions", [...props.actions, action]);
}

function toggleSide(side: BorderSide): void {
  const current = effectiveBorder(side);
  const shouldClear = !isMixed(side) && isActive(side) && matchesBrush(current);
  append({ preset: side, border: shouldClear ? null : { ...border.value } });
}

function selectPreset(preset: "none" | "all" | "outer" | "inner"): void {
  append(preset === "none" ? { preset } : { preset, border: { ...border.value } });
}

function selectLineStyle(style: CellBorderLineStyle): void {
  lineStyle.value = style;
  closeLineStylePicker(true);
  emit("update:format", { style });
}

function selectColor(value: string | null): void {
  const selected = value ?? DEFAULT_BORDER.color;
  color.value = selected;
  emit("update:format", { color: selected });
  closeColorPicker(true);
}

function closePickers(): void {
  lineStyleOpen.value = false;
  colorPickerOpen.value = false;
}

function closeLineStylePicker(restoreFocus = false): void {
  lineStyleOpen.value = false;
  if (restoreFocus) void nextTick(() => lineStyleTriggerRef.value?.focus());
}

function closeColorPicker(restoreFocus = false): void {
  colorPickerOpen.value = false;
  if (restoreFocus) void nextTick(() => colorTriggerRef.value?.focus());
}

function onPickerKeydown(event: KeyboardEvent, picker: "style" | "color"): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  if (picker === "style") closeLineStylePicker(true);
  else closeColorPicker(true);
}

watch(
  () => [props.state, props.format] as const,
  ([state, format]) => {
    if (props.actions.length === 0) {
      const selected = [
        state.top,
        state.right,
        state.bottom,
        state.left,
        state.innerHorizontal,
        state.innerVertical,
        state.diagonalUp,
        state.diagonalDown,
      ].find((value) => value.value && !value.mixed)?.value;
      if (selected) {
        lineStyle.value = selected.style;
        color.value = selected.color.toLowerCase();
      }
    }
    if (format?.style) lineStyle.value = format.style;
    if (format?.color) color.value = format.color.toLowerCase();
  },
  { immediate: true },
);

function presentationFor(side: BorderSide) {
  return getBorderLinePresentation(effectiveBorder(side)?.style ?? lineStyle.value);
}

function colorFor(side: BorderSide): string {
  return effectiveBorder(side)?.color ?? "var(--idea-border-control)";
}
</script>

<template>
  <section class="cell-format-border-panel" @keydown.esc="closePickers">
    <div class="cell-format-border-panel__controls">
      <div class="cell-format-border-panel__field">
        <span class="cell-format-border-panel__label">{{ t("format.borderLineStyle") }}</span>
        <TPopup
          :visible="lineStyleOpen"
          trigger="click"
          placement="bottom-left"
          :overlay-inner-style="{ padding: '0' }"
          @visible-change="(visible) => (lineStyleOpen = visible)"
        >
          <button
            ref="lineStyleTriggerRef"
            type="button"
            class="cell-format-border-panel__select"
            data-border-style-trigger
            :aria-label="t('format.borderLineStyle')"
            :aria-expanded="lineStyleOpen"
            @click="colorPickerOpen = false"
          >
            <BorderLinePreview :line-style="lineStyle" :color="color" :width="116" />
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
          <template #content>
            <div
              v-if="lineStyleOpen"
              class="cell-format-border-panel__style-menu"
              role="listbox"
              :aria-label="t('format.borderLineStyle')"
              @keydown="onPickerKeydown($event, 'style')"
            >
              <button
                type="button"
                role="option"
                data-border-style="hair"
                :aria-label="t('format.borderLineHair')"
                :aria-selected="lineStyle === 'hair'"
                @click="selectLineStyle('hair')"
              >
                <BorderLinePreview line-style="hair" :color="color" /><Check
                  :aria-label="t('format.borderLineHair')"
                  :class="{ 'is-visible': lineStyle === 'hair' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="dashDot"
                :aria-label="t('format.borderLineDashDot')"
                :aria-selected="lineStyle === 'dashDot'"
                @click="selectLineStyle('dashDot')"
              >
                <BorderLinePreview line-style="dashDot" :color="color" /><Check
                  :aria-label="t('format.borderLineDashDot')"
                  :class="{ 'is-visible': lineStyle === 'dashDot' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="dashDotDot"
                :aria-label="t('format.borderLineDashDotDot')"
                :aria-selected="lineStyle === 'dashDotDot'"
                @click="selectLineStyle('dashDotDot')"
              >
                <BorderLinePreview line-style="dashDotDot" :color="color" /><Check
                  :aria-label="t('format.borderLineDashDotDot')"
                  :class="{ 'is-visible': lineStyle === 'dashDotDot' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="dotted"
                :aria-label="t('format.borderLineDotted')"
                :aria-selected="lineStyle === 'dotted'"
                @click="selectLineStyle('dotted')"
              >
                <BorderLinePreview line-style="dotted" :color="color" /><Check
                  :aria-label="t('format.borderLineDotted')"
                  :class="{ 'is-visible': lineStyle === 'dotted' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="dashed"
                :aria-label="t('format.borderLineDashed')"
                :aria-selected="lineStyle === 'dashed'"
                @click="selectLineStyle('dashed')"
              >
                <BorderLinePreview line-style="dashed" :color="color" /><Check
                  :aria-label="t('format.borderLineDashed')"
                  :class="{ 'is-visible': lineStyle === 'dashed' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="thin"
                :aria-label="t('format.borderLineThin')"
                :aria-selected="lineStyle === 'thin'"
                @click="selectLineStyle('thin')"
              >
                <BorderLinePreview line-style="thin" :color="color" /><Check
                  :aria-label="t('format.borderLineThin')"
                  :class="{ 'is-visible': lineStyle === 'thin' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="mediumDashDotDot"
                :aria-label="t('format.borderLineMediumDashDotDot')"
                :aria-selected="lineStyle === 'mediumDashDotDot'"
                @click="selectLineStyle('mediumDashDotDot')"
              >
                <BorderLinePreview line-style="mediumDashDotDot" :color="color" /><Check
                  :aria-label="t('format.borderLineMediumDashDotDot')"
                  :class="{ 'is-visible': lineStyle === 'mediumDashDotDot' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="mediumDashDot"
                :aria-label="t('format.borderLineMediumDashDot')"
                :aria-selected="lineStyle === 'mediumDashDot'"
                @click="selectLineStyle('mediumDashDot')"
              >
                <BorderLinePreview line-style="mediumDashDot" :color="color" /><Check
                  :aria-label="t('format.borderLineMediumDashDot')"
                  :class="{ 'is-visible': lineStyle === 'mediumDashDot' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="mediumDashed"
                :aria-label="t('format.borderLineMediumDashed')"
                :aria-selected="lineStyle === 'mediumDashed'"
                @click="selectLineStyle('mediumDashed')"
              >
                <BorderLinePreview line-style="mediumDashed" :color="color" /><Check
                  :aria-label="t('format.borderLineMediumDashed')"
                  :class="{ 'is-visible': lineStyle === 'mediumDashed' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="medium"
                :aria-label="t('format.borderLineMedium')"
                :aria-selected="lineStyle === 'medium'"
                @click="selectLineStyle('medium')"
              >
                <BorderLinePreview line-style="medium" :color="color" /><Check
                  :aria-label="t('format.borderLineMedium')"
                  :class="{ 'is-visible': lineStyle === 'medium' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="double"
                :aria-label="t('format.borderLineDouble')"
                :aria-selected="lineStyle === 'double'"
                @click="selectLineStyle('double')"
              >
                <BorderLinePreview line-style="double" :color="color" /><Check
                  :aria-label="t('format.borderLineDouble')"
                  :class="{ 'is-visible': lineStyle === 'double' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="thick"
                :aria-label="t('format.borderLineThick')"
                :aria-selected="lineStyle === 'thick'"
                @click="selectLineStyle('thick')"
              >
                <BorderLinePreview line-style="thick" :color="color" /><Check
                  :aria-label="t('format.borderLineThick')"
                  :class="{ 'is-visible': lineStyle === 'thick' }"
                  :size="14"
                />
              </button>
              <button
                type="button"
                role="option"
                data-border-style="slantDashDot"
                :aria-label="t('format.borderLineSlantDashDot')"
                :aria-selected="lineStyle === 'slantDashDot'"
                @click="selectLineStyle('slantDashDot')"
              >
                <BorderLinePreview line-style="slantDashDot" :color="color" /><Check
                  :aria-label="t('format.borderLineSlantDashDot')"
                  :class="{ 'is-visible': lineStyle === 'slantDashDot' }"
                  :size="14"
                />
              </button>
            </div>
          </template>
        </TPopup>
      </div>

      <div class="cell-format-border-panel__field">
        <span class="cell-format-border-panel__label">{{ t("format.borderColor") }}</span>
        <TPopup
          :visible="colorPickerOpen"
          trigger="click"
          placement="bottom-right"
          :overlay-inner-style="{ padding: '0' }"
          @visible-change="(visible) => (colorPickerOpen = visible)"
        >
          <button
            ref="colorTriggerRef"
            type="button"
            class="cell-format-border-panel__color"
            data-border-color-trigger
            :aria-label="t('format.borderColorValue', { value: color.toUpperCase() })"
            :aria-expanded="colorPickerOpen"
            @click="lineStyleOpen = false"
          >
            <span :style="{ backgroundColor: color }" aria-hidden="true" />
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
          <template #content>
            <ColorPalette
              v-if="colorPickerOpen"
              class="cell-format-border-panel__color-menu"
              :model-value="color"
              :default-color="DEFAULT_BORDER.color"
              :default-label="t('cellFormat.automatic')"
              @keydown="onPickerKeydown($event, 'color')"
              @select="selectColor"
            />
          </template>
        </TPopup>
      </div>
    </div>

    <div class="cell-format-border-panel__section">
      <p class="cell-format-border-panel__label">
        {{ t("format.borderPresets") }}
      </p>
      <div class="cell-format-border-panel__presets">
        <button
          type="button"
          data-border-preset="none"
          :aria-label="t('format.borderNone')"
          :title="t('format.borderNone')"
          @click="selectPreset('none')"
        >
          <span
            class="cell-format-border-panel__preset-icon cell-format-border-panel__preset-icon--none"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          data-border-preset="all"
          :aria-label="t('format.borderAll')"
          :title="t('format.borderAll')"
          @click="selectPreset('all')"
        >
          <span
            class="cell-format-border-panel__preset-icon cell-format-border-panel__preset-icon--all"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          data-border-preset="outer"
          :aria-label="t('format.borderOuter')"
          :title="t('format.borderOuter')"
          @click="selectPreset('outer')"
        >
          <span
            class="cell-format-border-panel__preset-icon cell-format-border-panel__preset-icon--outer"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          data-border-preset="inner"
          :aria-label="t('format.borderInner')"
          :title="t('format.borderInner')"
          @click="selectPreset('inner')"
        >
          <span
            class="cell-format-border-panel__preset-icon cell-format-border-panel__preset-icon--inner"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div class="cell-format-border-panel__section">
      <p class="cell-format-border-panel__label">
        {{ t("cellFormat.borderPreview") }}
      </p>
      <p class="cell-format-border-panel__hint">
        {{ t("cellFormat.borderHint") }}
      </p>
      <div class="cell-format-border-panel__preview">
        <button
          type="button"
          data-border-side="top"
          :class="{ 'is-mixed': isMixed('top') }"
          :aria-label="t('format.borderTop')"
          :aria-pressed="isActive('top')"
          @click="toggleSide('top')"
        >
          <svg viewBox="0 0 128 12" aria-hidden="true">
            <line
              v-for="offset in presentationFor('top').offsets"
              :key="offset"
              x1="0"
              :y1="6 + offset"
              x2="128"
              :y2="6 + offset"
              :stroke="colorFor('top')"
              :stroke-width="presentationFor('top').strokeWidth"
              :stroke-dasharray="presentationFor('top').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="right"
          :class="{
            'is-mixed': isMixed('right'),
          }"
          :aria-label="t('format.borderRight')"
          :aria-pressed="isActive('right')"
          @click="toggleSide('right')"
        >
          <svg viewBox="0 0 12 80" aria-hidden="true">
            <line
              v-for="offset in presentationFor('right').offsets"
              :key="offset"
              :x1="6 + offset"
              y1="0"
              :x2="6 + offset"
              y2="80"
              :stroke="colorFor('right')"
              :stroke-width="presentationFor('right').strokeWidth"
              :stroke-dasharray="presentationFor('right').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="bottom"
          :class="{
            'is-mixed': isMixed('bottom'),
          }"
          :aria-label="t('format.borderBottom')"
          :aria-pressed="isActive('bottom')"
          @click="toggleSide('bottom')"
        >
          <svg viewBox="0 0 128 12" aria-hidden="true">
            <line
              v-for="offset in presentationFor('bottom').offsets"
              :key="offset"
              x1="0"
              :y1="6 + offset"
              x2="128"
              :y2="6 + offset"
              :stroke="colorFor('bottom')"
              :stroke-width="presentationFor('bottom').strokeWidth"
              :stroke-dasharray="presentationFor('bottom').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="left"
          :class="{
            'is-mixed': isMixed('left'),
          }"
          :aria-label="t('format.borderLeft')"
          :aria-pressed="isActive('left')"
          @click="toggleSide('left')"
        >
          <svg viewBox="0 0 12 80" aria-hidden="true">
            <line
              v-for="offset in presentationFor('left').offsets"
              :key="offset"
              :x1="6 + offset"
              y1="0"
              :x2="6 + offset"
              y2="80"
              :stroke="colorFor('left')"
              :stroke-width="presentationFor('left').strokeWidth"
              :stroke-dasharray="presentationFor('left').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="innerHorizontal"
          :class="{
            'is-mixed': isMixed('innerHorizontal'),
          }"
          :aria-label="t('format.borderInnerHorizontal')"
          :aria-pressed="isActive('innerHorizontal')"
          @click="toggleSide('innerHorizontal')"
        >
          <svg viewBox="0 0 112 12" aria-hidden="true">
            <line
              v-for="offset in presentationFor('innerHorizontal').offsets"
              :key="offset"
              x1="0"
              :y1="6 + offset"
              x2="112"
              :y2="6 + offset"
              :stroke="colorFor('innerHorizontal')"
              :stroke-width="presentationFor('innerHorizontal').strokeWidth"
              :stroke-dasharray="presentationFor('innerHorizontal').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="innerVertical"
          :class="{
            'is-mixed': isMixed('innerVertical'),
          }"
          :aria-label="t('format.borderInnerVertical')"
          :aria-pressed="isActive('innerVertical')"
          @click="toggleSide('innerVertical')"
        >
          <svg viewBox="0 0 12 64" aria-hidden="true">
            <line
              v-for="offset in presentationFor('innerVertical').offsets"
              :key="offset"
              :x1="6 + offset"
              y1="0"
              :x2="6 + offset"
              y2="64"
              :stroke="colorFor('innerVertical')"
              :stroke-width="presentationFor('innerVertical').strokeWidth"
              :stroke-dasharray="presentationFor('innerVertical').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="diagonalUp"
          :class="{
            'is-mixed': isMixed('diagonalUp'),
          }"
          :aria-label="t('format.borderDiagonalUp')"
          :aria-pressed="isActive('diagonalUp')"
          @click="toggleSide('diagonalUp')"
        >
          <svg viewBox="0 0 112 66" aria-hidden="true">
            <line
              v-for="offset in presentationFor('diagonalUp').offsets"
              :key="offset"
              x1="0"
              :y1="66 + offset"
              x2="112"
              :y2="offset"
              :stroke="colorFor('diagonalUp')"
              :stroke-width="presentationFor('diagonalUp').strokeWidth"
              :stroke-dasharray="presentationFor('diagonalUp').dashArray"
            />
          </svg>
        </button>
        <button
          type="button"
          data-border-side="diagonalDown"
          :class="{
            'is-mixed': isMixed('diagonalDown'),
          }"
          :aria-label="t('format.borderDiagonalDown')"
          :aria-pressed="isActive('diagonalDown')"
          @click="toggleSide('diagonalDown')"
        >
          <svg viewBox="0 0 112 66" aria-hidden="true">
            <line
              v-for="offset in presentationFor('diagonalDown').offsets"
              :key="offset"
              x1="0"
              :y1="offset"
              x2="112"
              :y2="66 + offset"
              :stroke="colorFor('diagonalDown')"
              :stroke-width="presentationFor('diagonalDown').strokeWidth"
              :stroke-dasharray="presentationFor('diagonalDown').dashArray"
            />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-border-panel {
  color: var(--idea-text-primary);

  &__controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--idea-space-4);
  }
  &__field,
  &__picker {
    position: relative;
    min-width: 0;
  }
  &__label {
    display: block;
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
  }
  &__select,
  &__color {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-small);
    background: var(--idea-surface-panel);
    color: inherit;
    cursor: pointer;
  }
  &__color > span {
    display: block;
    width: calc(100% - 20px);
    height: 18px;
    border-radius: 1px;
  }
  &__style-menu {
    width: 170px;
    max-height: 260px;
    overflow: auto;
    padding: var(--idea-menu-padding);
  }
  &__style-menu > button {
    display: grid;
    grid-template-columns: 1fr 16px;
    align-items: center;
    width: 100%;
    height: 26px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--idea-text-primary);
    cursor: pointer;
  }
  &__style-menu > button:hover,
  &__style-menu > button:focus-visible {
    background: var(--idea-surface-hover);
    outline: none;
  }
  &__style-menu > button > svg:last-child {
    opacity: 0;
    color: var(--idea-action-primary);
  }
  &__style-menu > button > svg.is-visible {
    opacity: 1;
  }
  &__color-menu {
    z-index: 3;
  }
  &__section {
    margin-top: var(--idea-space-6);
    padding-top: var(--idea-space-5);
    border-top: 1px solid var(--idea-border-control);
  }
  &__hint {
    margin: -3px 0 10px;
    color: var(--idea-text-secondary);
    font-size: 12px;
  }
  &__presets {
    display: flex;
    gap: 8px;
  }
  &__presets > button {
    display: grid;
    width: 34px;
    height: 30px;
    padding: 0;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--idea-radius-small);
    background: transparent;
    cursor: pointer;
  }
  &__presets > button:hover,
  &__presets > button:focus-visible {
    border-color: var(--idea-action-primary);
    background: var(--idea-surface-hover);
    outline: none;
  }
  &__preset-icon {
    position: relative;
    display: block;
    width: 17px;
    height: 17px;
    border: 1px solid var(--idea-text-secondary);
  }
  &__preset-icon--none::after {
    position: absolute;
    inset: 7px -2px;
    height: 1px;
    background: var(--idea-text-secondary);
    content: "";
    transform: rotate(45deg);
  }
  &__preset-icon--all {
    background:
      linear-gradient(var(--idea-text-secondary), var(--idea-text-secondary)) center / 1px 100%
        no-repeat,
      linear-gradient(var(--idea-text-secondary), var(--idea-text-secondary)) center / 100% 1px
        no-repeat;
  }
  &__preset-icon--outer {
    border: 2px solid var(--idea-text-secondary);
  }
  &__preset-icon--inner {
    border-style: dashed;
    background:
      linear-gradient(var(--idea-text-secondary), var(--idea-text-secondary)) center / 1px 100%
        no-repeat,
      linear-gradient(var(--idea-text-secondary), var(--idea-text-secondary)) center / 100% 1px
        no-repeat;
  }
  &__preview {
    position: relative;
    width: 172px;
    height: 116px;
    margin: 2px auto 0;
    background:
      linear-gradient(
        to right,
        transparent 49.5%,
        var(--idea-border-control) 49.5%,
        var(--idea-border-control) 50.5%,
        transparent 50.5%
      ),
      linear-gradient(
        to bottom,
        transparent 49.5%,
        var(--idea-border-control) 49.5%,
        var(--idea-border-control) 50.5%,
        transparent 50.5%
      );
  }
  &__preview::before {
    position: absolute;
    inset: 18px 30px;
    border: 1px solid var(--idea-border-control);
    content: "";
  }
  &__preview > button {
    position: absolute;
    z-index: 1;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;

    > svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  }
  &__preview > button.is-mixed {
    opacity: 0.55;
  }
  &__preview > button[data-border-side="top"] {
    top: 11px;
    left: 22px;
    width: 128px;
    height: 15px;
  }
  &__preview > button[data-border-side="right"] {
    top: 18px;
    right: 15px;
    width: 15px;
    height: 80px;
  }
  &__preview > button[data-border-side="bottom"] {
    bottom: 11px;
    left: 22px;
    width: 128px;
    height: 15px;
  }
  &__preview > button[data-border-side="left"] {
    top: 18px;
    left: 15px;
    width: 15px;
    height: 80px;
  }
  &__preview > button[data-border-side="innerHorizontal"] {
    top: 49px;
    left: 30px;
    width: 112px;
    height: 18px;
  }
  &__preview > button[data-border-side="innerVertical"] {
    top: 26px;
    left: 77px;
    width: 18px;
    height: 64px;
  }
  &__preview > button[data-border-side="diagonalUp"],
  &__preview > button[data-border-side="diagonalDown"] {
    top: 25px;
    left: 30px;
    width: 112px;
    height: 66px;
  }
}
</style>
