<script setup lang="ts">
import { computed, ref } from "vue";
import type { ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import {
  CELL_FILL_PATTERNS,
  mergeCellStyle,
  type CellFillGradient,
  type CellFillPatternStyle,
  type CellStyle,
  type CellStylePatch,
} from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
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
    ...(props.patch.fillColorTheme ? { fillColorTheme: null } : {}),
    fillPattern: null,
    fillPatternColor: null,
    fillGradient: null,
  });
}
function setColor(color: string | null, reference?: ThemeColorReference): void {
  if (color === null) return clearFill();
  emit("update:patch", {
    fillColor: color,
    fillGradient: null,
    ...(reference
      ? { fillColorTheme: reference }
      : props.patch.fillColorTheme
        ? { fillColorTheme: null }
        : {}),
  });
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
        <div class="cell-format-fill__header">
          <h3>{{ t("format.fillColor") }}</h3>
          <button
            type="button"
            class="cell-format-fill__no-fill"
            data-cell-format-no-fill
            :aria-pressed="noFill"
            @click="clearFill"
          >
            {{ t("cellFormat.noFill") }}
          </button>
        </div>
        <div class="cell-format-fill__palette">
          <ColorPalette
            compact
            stable-size
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
        <div class="cell-format-fill__controls-card">
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
              @select="emit('update:patch', { fillPatternColor: $event ?? '#000000' })"
            />
          </div>
        </div>
        <div class="cell-format-fill__preview-group">
          <h3>{{ t("cellFormat.preview") }}</h3>
          <div class="cell-format-fill__preview-stage">
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--sheetcraft-text-primary);
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);

  h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__layout {
    display: grid;
    flex: 1;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
  }
  &__background {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    width: max-content;
    max-width: 100%;
  }
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }
  &__no-fill,
  &__effects {
    height: 26px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--sheetcraft-radius-floating-item);
    background: var(--sheetcraft-surface-button-secondary);
    color: inherit;
    font: inherit;
    font-weight: var(--sheetcraft-font-weight-medium);
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      color 0.12s ease;

    &:hover {
      background: var(--sheetcraft-surface-button-secondary-hover);
    }
  }
  &__no-fill {
    &[aria-pressed="true"] {
      background: var(--sheetcraft-action-primary-subtle);
      color: var(--sheetcraft-action-primary);
    }
  }
  &__effects {
    width: 100%;
    height: 28px;
  }
  &__palette {
    max-width: 100%;
    border: 1px solid var(--sheetcraft-border-divider);
    border-radius: var(--sheetcraft-radius-dialog-card);
    overflow: hidden;
  }
  &__pattern {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  &__controls-card {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__field {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-width: 0;

    > span {
      color: var(--sheetcraft-text-secondary);
      text-align: right;
    }
  }
  &__preview-group {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    min-height: 0;
  }
  &__preview-stage {
    flex: 1;
    min-height: 120px;
    padding: 10px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__preview {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--sheetcraft-text-muted);
    background-color: var(--sheetcraft-surface-panel);
    border: 1px solid var(--sheetcraft-border-divider);
    border-radius: var(--sheetcraft-radius-floating-item);
  }
}
@media (max-width: 560px) {
  .cell-format-fill {
    height: auto;
    &__layout {
      grid-template-columns: minmax(0, 1fr);
    }
    &__palette {
      max-width: 100%;
    }
  }
}
</style>
