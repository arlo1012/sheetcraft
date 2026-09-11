<script setup lang="ts">
import { computed, ref } from "vue";
import {
  CELL_FILL_PATTERNS,
  mergeCellStyle,
  type CellFillGradient,
  type CellFillPatternStyle,
  type CellStyle,
  type CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatColorControl from "./CellFormatColorControl.vue";
import CellFormatFillEffectsDialog from "./CellFormatFillEffectsDialog.vue";
import CellFormatPatternControl from "./CellFormatPatternControl.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
const effectsOpen = ref(false);
type FillKey = "fillColor" | "fillPattern" | "fillPatternColor" | "fillGradient";
function isMixed(key: FillKey): boolean {
  return !Object.hasOwn(props.patch, key) && props.state[key].mixed;
}
const mixed = computed(
  () =>
    isMixed("fillColor") ||
    isMixed("fillPattern") ||
    isMixed("fillPatternColor") ||
    isMixed("fillGradient"),
);
const fill = computed(() => {
  const selected: CellStyle = {};
  for (const key of ["fillColor", "fillPattern", "fillPatternColor", "fillGradient"] as const) {
    const value = props.state[key].value;
    if (value !== undefined) Object.assign(selected, { [key]: value });
  }
  return mergeCellStyle(selected, props.patch);
});
const noFill = computed(
  () =>
    !mixed.value && !fill.value?.fillColor && !fill.value?.fillPattern && !fill.value?.fillGradient,
);
const pattern = computed<CellFillPatternStyle | "none" | undefined>(() =>
  isMixed("fillPattern") ? undefined : (fill.value?.fillPattern ?? "none"),
);
function isPattern(value: unknown): value is CellFillPatternStyle {
  return typeof value === "string" && CELL_FILL_PATTERNS.includes(value as CellFillPatternStyle);
}
function clearFill(): void {
  emit("update:patch", {
    fillColor: null,
    fillPattern: null,
    fillPatternColor: null,
    fillGradient: null,
  });
}
function setColor(color: string | null): void {
  if (color === null) return clearFill();
  emit("update:patch", { fillColor: color, fillGradient: null });
}
function setPattern(value: unknown): void {
  if (value === "none") emit("update:patch", { fillPattern: null, fillPatternColor: null });
  else if (isPattern(value))
    emit("update:patch", {
      fillPattern: value,
      fillPatternColor: fill.value?.fillPatternColor ?? "#000000",
      fillGradient: null,
    });
}
function setGradient(gradient: CellFillGradient): void {
  emit("update:patch", {
    fillColor: null,
    fillPattern: null,
    fillPatternColor: null,
    fillGradient: gradient,
  });
  effectsOpen.value = false;
}
</script>

<template>
  <section class="cell-format-fill" :aria-label="t('cellFormat.fill')">
    <div class="cell-format-fill__layout">
      <div class="cell-format-fill__background">
        <span>{{ t("format.fillColor") }}</span>
        <button
          type="button"
          class="cell-format-fill__no-fill"
          data-cell-format-no-fill
          :aria-pressed="noFill"
          @click="clearFill"
        >
          {{ t("cellFormat.noFill") }}
        </button>
        <div class="cell-format-fill__palette">
          <ColorPalette
            compact
            more-mode="popup"
            show-recent-heading
            :model-value="fill?.fillColor ?? null"
            :show-default="false"
            default-color="#ffffff"
            :mixed="isMixed('fillColor') || Boolean(fill?.fillGradient)"
            @select="setColor"
          />
        </div>
        <button
          type="button"
          class="cell-format-fill__effects"
          data-cell-format-fill-effects
          @click="effectsOpen = true"
        >
          {{ t("cellFormat.fillEffects") }}…
        </button>
      </div>
      <div class="cell-format-fill__pattern">
        <div
          class="cell-format-fill__field"
          role="group"
          :aria-label="t('cellFormat.patternStyle')"
        >
          <span>{{ t("cellFormat.patternStyle") }}</span>
          <CellFormatPatternControl
            :model-value="pattern"
            :background-color="fill?.fillColor"
            :pattern-color="fill?.fillPatternColor"
            data-cell-format-pattern-style
            @select="setPattern"
          />
        </div>
        <div
          class="cell-format-fill__field"
          role="group"
          :aria-label="t('cellFormat.patternColor')"
        >
          <span>{{ t("cellFormat.patternColor") }}</span>
          <CellFormatColorControl
            :model-value="fill?.fillPatternColor"
            :label="t('cellFormat.patternColor')"
            :disabled="!fill?.fillPattern && !isMixed('fillPattern')"
            :mixed="isMixed('fillPatternColor')"
            data-cell-format-pattern-color
            @select="emit('update:patch', { fillPatternColor: $event })"
          />
        </div>
        <div class="cell-format-fill__preview-group">
          <h3>{{ t("cellFormat.preview") }}</h3>
          <div
            class="cell-format-fill__preview"
            :style="mixed ? {} : getCellFillStyle(fill)"
            role="img"
            :aria-label="mixed ? t('format.mixed') : t('cellFormat.preview')"
            data-cell-format-fill-preview
          >
            <span v-if="mixed">{{ t("format.mixed") }}</span>
          </div>
        </div>
      </div>
    </div>
    <CellFormatFillEffectsDialog
      v-if="effectsOpen"
      :gradient="fill?.fillGradient"
      :default-color="fill?.fillColor"
      @confirm="setGradient"
      @cancel="effectsOpen = false"
    />
  </section>
</template>

<style scoped lang="scss">
.cell-format-fill {
  display: grid;
  gap: 4px;
  padding: 16px 0 4px;
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);
  h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }
  &__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }
  &__background {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 8px;
    min-width: 0;
    width: max-content;
    max-width: 100%;
  }
  &__no-fill,
  &__effects {
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--idea-border-strong);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
    color: inherit;
    font: inherit;
    cursor: pointer;
    &:hover {
      background: var(--idea-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-focus);
    }
  }
  &__no-fill {
    width: 100%;
    &[aria-pressed="true"] {
      background: var(--idea-surface-hover);
    }
  }
  &__palette {
    max-width: 100%;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    overflow: hidden;
  }
  &__pattern {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }
  &__field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  &__preview-group {
    display: grid;
    gap: 4px;
    min-width: 0;
    margin-top: 8px;
  }
  &__preview {
    display: grid;
    place-items: center;
    height: 96px;
    min-width: 0;
    overflow: hidden;
    color: var(--idea-text-muted);
    background-color: #fff;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
  }
}
@media (max-width: 560px) {
  .cell-format-fill {
    &__layout {
      grid-template-columns: minmax(0, 1fr);
    }
    &__palette {
      max-width: 100%;
    }
    &__no-fill {
      width: 245px;
      max-width: 100%;
    }
  }
}
</style>
