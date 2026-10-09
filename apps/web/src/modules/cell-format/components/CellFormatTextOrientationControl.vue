<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { CellTextRotation } from "@sheetcraft/core/style";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  modelValue: CellTextRotation | undefined;
  mixed: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: CellTextRotation | null];
}>();
const { t } = useAppI18n();
const degrees = computed(() => (typeof props.modelValue === "number" ? props.modelValue : 0));
let activePointer: number | undefined;

function setDegrees(next: InputNumberValue): void {
  if (typeof next !== "number" || !Number.isFinite(next)) return;
  const value = Math.max(-90, Math.min(90, Math.round(next)));
  emit("update:modelValue", value || null);
}
function setVertical(next: boolean): void {
  emit("update:modelValue", next ? "vertical" : null);
}
function toggleVertical(): void {
  setVertical(props.modelValue !== "vertical");
}
function updatePointerAngle(event: PointerEvent): void {
  const target = event.currentTarget as HTMLInputElement;
  const rect = target.getBoundingClientRect();
  if (props.modelValue === "vertical" || !rect.width || !rect.height) return;
  const x = Math.max(0, ((event.clientX - rect.left) / rect.width) * 100 - 12);
  const y = 72 - ((event.clientY - rect.top) / rect.height) * 144;
  setDegrees((Math.atan2(y, x) * 180) / Math.PI);
}
function startDialDrag(event: PointerEvent): void {
  if (event.button !== 0 || props.modelValue === "vertical") return;
  event.preventDefault();
  const target = event.currentTarget as HTMLInputElement;
  target.focus({ preventScroll: true });
  activePointer = event.pointerId;
  target.setPointerCapture?.(event.pointerId);
  updatePointerAngle(event);
}
function moveDialDrag(event: PointerEvent): void {
  if (activePointer === event.pointerId) updatePointerAngle(event);
}
function endDialDrag(event: PointerEvent): void {
  if (activePointer !== event.pointerId) return;
  activePointer = undefined;
  const target = event.currentTarget as HTMLInputElement;
  if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
}
</script>

<template>
  <section class="cell-format-text-orientation" :aria-label="t('cellFormat.orientation')">
    <h3>{{ t("cellFormat.orientation") }}</h3>
    <div class="cell-format-text-orientation__controls">
      <button
        type="button"
        class="cell-format-text-orientation__vertical"
        :class="{ 'is-selected': modelValue === 'vertical' }"
        :aria-label="t('cellFormat.verticalText')"
        :aria-pressed="mixed ? 'mixed' : modelValue === 'vertical'"
        data-cell-format-vertical-text
        @click="toggleVertical"
      >
        {{ t("cellFormat.orientationText") }}
      </button>
      <div
        class="cell-format-text-orientation__dial idea-focus-container"
        :class="{ 'is-disabled': modelValue === 'vertical' }"
      >
        <svg viewBox="0 0 100 144" preserveAspectRatio="none" aria-hidden="true">
          <g v-for="tick in 13" :key="tick" :transform="`rotate(${(tick - 7) * 15} 12 72)`">
            <rect
              v-if="(tick - 1) % 3 === 0"
              x="70"
              y="70"
              width="4"
              height="4"
              transform="rotate(45 72 72)"
            />
            <circle v-else cx="72" cy="72" r="1" />
          </g>
          <g
            v-if="!mixed && modelValue !== 'vertical'"
            :transform="`rotate(${-degrees} 12 72)`"
            class="cell-format-text-orientation__pointer"
          >
            <text x="18" y="72" dominant-baseline="central">
              {{ t("cellFormat.orientationText") }}
            </text>
            <line x1="48" y1="72" x2="72" y2="72" />
            <rect x="70" y="70" width="4" height="4" transform="rotate(45 72 72)" />
          </g>
        </svg>
        <input
          type="range"
          min="-90"
          max="90"
          step="1"
          :value="degrees"
          :disabled="modelValue === 'vertical'"
          :aria-label="t('cellFormat.rotationDegrees')"
          :aria-valuetext="mixed ? t('format.mixed') : `${degrees} ${t('cellFormat.degrees')}`"
          data-cell-format-rotation-dial
          @input="setDegrees(Number(($event.target as HTMLInputElement).value))"
          @pointerdown="startDialDrag"
          @pointermove="moveDialDrag"
          @pointerup="endDialDrag"
          @pointercancel="endDialDrag"
          @lostpointercapture="endDialDrag"
        />
      </div>
    </div>
    <div
      class="cell-format-text-orientation__input"
      role="group"
      :aria-label="t('cellFormat.rotationDegrees')"
    >
      <TInputNumber
        :model-value="typeof modelValue === 'number' ? modelValue : undefined"
        :min="-90"
        :max="90"
        :decimal-places="0"
        :disabled="modelValue === 'vertical'"
        theme="column"
        class="idea-input-number--persistent-controls cell-format-text-orientation__degrees"
        :placeholder="mixed ? t('format.mixed') : undefined"
        data-cell-format-rotation
        @change="setDegrees"
      />
      <span>{{ t("cellFormat.degrees") }}</span>
    </div>
    <TCheckbox
      :model-value="modelValue === 'vertical'"
      :indeterminate="mixed"
      data-cell-format-vertical-text-checkbox
      @change="setVertical"
      >{{ t("cellFormat.verticalText") }}</TCheckbox
    >
  </section>
</template>

<style scoped lang="scss">
.cell-format-text-orientation {
  display: grid;
  align-self: start;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;

  > h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--sheetcraft-font-weight-semibold);
  }

  &__controls {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 8px;
    height: 144px;
  }

  &__vertical {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--sheetcraft-border-strong);
    border-radius: var(--sheetcraft-radius-default);
    background: var(--sheetcraft-surface-panel);
    color: var(--sheetcraft-text-primary);
    font: inherit;
    writing-mode: vertical-rl;
    text-orientation: upright;
    cursor: pointer;

    &:hover {
      background: var(--sheetcraft-icon-button-hover-bg);
    }
    &.is-selected {
      color: var(--sheetcraft-action-primary);
      background: var(--sheetcraft-surface-secondary);
    }
  }

  &__dial {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-strong);
    border-radius: var(--sheetcraft-radius-default);
    background: var(--sheetcraft-surface-panel);

    svg {
      display: block;
      width: 100%;
      height: 100%;
      fill: var(--sheetcraft-text-primary);
    }
    input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: crosshair;
      touch-action: none;
    }
    &.is-disabled {
      opacity: 0.45;
    }
  }

  &__pointer {
    text {
      font: inherit;
    }
    line {
      stroke: var(--sheetcraft-text-primary);
      stroke-width: 1;
    }
    rect {
      fill: var(--sheetcraft-action-primary);
    }
  }

  &__input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;

    > .cell-format-text-orientation__degrees {
      width: 100%;
      min-width: 0;
    }
  }
}
</style>
