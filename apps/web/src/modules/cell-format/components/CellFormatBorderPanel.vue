<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  CellBorder,
  CellBorderAction,
  CellBorderFormatPatch,
  CellBorderLineStyle,
} from "@sheetcraft/core/style";
import type { SelectionBorderState } from "@sheetcraft/core/style-state";
import BorderLinePreview from "../../../shared/borders/BorderLinePreview.vue";
import BorderLineStylePanel from "../../../shared/borders/BorderLineStylePanel.vue";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import CellFormatBorderPreview from "./CellFormatBorderPreview.vue";
import CellFormatColorControl from "./CellFormatColorControl.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { CellFormatBorderCapabilities } from "../border-capabilities";

type BorderSide = keyof SelectionBorderState;

const DEFAULT_BORDER: CellBorder = { style: "thin", color: "#20242c" };

const props = defineProps<{
  state: SelectionBorderState;
  actions: CellBorderAction[];
  format?: CellBorderFormatPatch;
  capabilities?: CellFormatBorderCapabilities;
}>();

const emit = defineEmits<{
  "update:actions": [actions: CellBorderAction[]];
  "update:format": [format: CellBorderFormatPatch];
}>();

const { t } = useAppI18n();
const lineStyle = ref<CellBorderLineStyle | null>(DEFAULT_BORDER.style);
const color = ref(DEFAULT_BORDER.color);
const lastPreset = ref<"none" | "outer" | "inner" | "all" | null>(null);

const border = computed<CellBorder>(() => ({
  style: lineStyle.value ?? props.format?.style ?? DEFAULT_BORDER.style,
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
  if (!isAvailable(side)) return undefined;
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
  return isAvailable(side) && !hasDraftAction(side) && stateFor(side).mixed;
}

function isAvailable(side: BorderSide): boolean {
  if (side === "innerHorizontal" || side === "innerVertical") {
    return props.capabilities?.[side] !== false;
  }
  return true;
}

function matchesBrush(value: CellBorder | undefined): boolean {
  return value?.style === border.value.style && value.color.toLowerCase() === color.value;
}

function append(action: CellBorderAction): void {
  emit("update:actions", [...props.actions, action]);
}

function toggleSide(side: BorderSide): void {
  if (!isAvailable(side)) return;
  lastPreset.value = null;
  lineStyle.value = border.value.style;
  const current = effectiveBorder(side);
  const shouldClear = !isMixed(side) && isActive(side) && matchesBrush(current);
  append({ preset: side, border: shouldClear ? null : { ...border.value } });
}

function selectPreset(preset: "none" | "all" | "outer" | "inner"): void {
  if (preset === "inner" && !isAvailable("innerHorizontal") && !isAvailable("innerVertical"))
    return;
  lastPreset.value = preset;
  if (preset !== "none") lineStyle.value = border.value.style;
  append(preset === "none" ? { preset } : { preset, border: { ...border.value } });
}

function selectLineStyle(style: CellBorderLineStyle | null): void {
  lineStyle.value = style;
  if (style === null) selectPreset("none");
  else emit("update:format", { style });
}

function selectColor(value: string | null): void {
  const selected = value ?? DEFAULT_BORDER.color;
  color.value = selected;
  emit("update:format", { color: selected });
}

watch(
  () => props.state,
  (state) => {
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
  },
  { immediate: true },
);

watch(
  () => props.format?.style,
  (style) => {
    if (style) lineStyle.value = style;
  },
  { immediate: true },
);
watch(
  () => props.format?.color,
  (value) => {
    if (value) color.value = value.toLowerCase();
  },
  { immediate: true },
);

watch(
  () => props.actions.length,
  (length) => {
    if (length === 0) lastPreset.value = null;
  },
);

function previewSide(side: BorderSide) {
  return { value: effectiveBorder(side), mixed: isMixed(side) };
}
const previewState = computed<SelectionBorderState>(() => ({
  top: previewSide("top"),
  right: previewSide("right"),
  bottom: previewSide("bottom"),
  left: previewSide("left"),
  innerHorizontal: previewSide("innerHorizontal"),
  innerVertical: previewSide("innerVertical"),
  diagonalUp: previewSide("diagonalUp"),
  diagonalDown: previewSide("diagonalDown"),
}));

const activePreset = computed<"none" | "outer" | "inner" | "all" | null>(() => {
  const outerSides: BorderSide[] = ["top", "right", "bottom", "left"];
  const innerSides = (["innerHorizontal", "innerVertical"] as const).filter((side) =>
    isAvailable(side),
  );
  const allVisible: BorderSide[] = [...outerSides, ...innerSides, "diagonalUp", "diagonalDown"];
  if (allVisible.every((side) => !isActive(side) && !isMixed(side))) return "none";
  const outerOn = outerSides.every((side) => isActive(side) && !isMixed(side));
  const innerOn =
    innerSides.length > 0 && innerSides.every((side) => isActive(side) && !isMixed(side));
  const innerOff = innerSides.every((side) => !isActive(side) && !isMixed(side));
  const outerOff = outerSides.every((side) => !isActive(side) && !isMixed(side));
  if (outerOn && innerSides.length === 0) return lastPreset.value === "all" ? "all" : "outer";
  if (outerOn && innerOn) return "all";
  if (outerOn && innerOff) return "outer";
  if (outerOff && innerOn) return "inner";
  return null;
});
</script>

<template>
  <section class="cell-format-border-panel">
    <div class="cell-format-border-panel__layout">
      <div class="cell-format-border-panel__lines">
        <div class="cell-format-border-panel__field">
          <h3>{{ t("format.borderLineStyle") }}</h3>
          <div class="cell-format-border-panel__style-list">
            <BorderLineStylePanel
              :model-value="lineStyle"
              :color="color"
              @select="selectLineStyle"
            />
          </div>
        </div>
        <div class="cell-format-border-panel__field">
          <h3>{{ t("format.borderColor") }}</h3>
          <CellFormatColorControl
            :model-value="color"
            :label="t('format.borderColor')"
            :default-color="DEFAULT_BORDER.color"
            show-value
            data-border-color-trigger
            @select="selectColor"
          />
          <div class="cell-format-border-panel__line-sample" aria-hidden="true">
            <BorderLinePreview
              v-if="lineStyle"
              :line-style="lineStyle"
              :color="color"
              :width="136"
            />
            <span v-else>{{ t("format.borderLineNone") }}</span>
          </div>
        </div>
      </div>

      <div class="cell-format-border-panel__borders">
        <div class="cell-format-border-panel__section">
          <h3>{{ t("format.borderPresets") }}</h3>
          <div class="cell-format-border-panel__presets">
            <button
              type="button"
              :class="{ 'is-active': activePreset === 'none' }"
              data-border-preset="none"
              :aria-label="t('format.borderNone')"
              @click="selectPreset('none')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="none"
              /></span>
              <span>{{ t("format.borderNone") }}</span>
            </button>
            <button
              type="button"
              :class="{ 'is-active': activePreset === 'outer' }"
              data-border-preset="outer"
              :aria-label="t('format.borderOuter')"
              @click="selectPreset('outer')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="outer"
              /></span>
              <span>{{ t("format.borderOuter") }}</span>
            </button>
            <button
              type="button"
              :class="{ 'is-active': activePreset === 'inner' }"
              data-border-preset="inner"
              :disabled="!isAvailable('innerHorizontal') && !isAvailable('innerVertical')"
              :aria-label="t('format.borderInner')"
              @click="selectPreset('inner')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="inner"
              /></span>
              <span>{{ t("format.borderInner") }}</span>
            </button>
            <button
              type="button"
              :class="{ 'is-active': activePreset === 'all' }"
              data-border-preset="all"
              :aria-label="t('format.borderAll')"
              @click="selectPreset('all')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="all"
              /></span>
              <span>{{ t("format.borderAll") }}</span>
            </button>
          </div>
        </div>
        <div class="cell-format-border-panel__section cell-format-border-panel__section--preview">
          <h3>{{ t("cellFormat.border") }}</h3>
          <CellFormatBorderPreview
            class="cell-format-border-panel__preview"
            :state="previewState"
            :capabilities="capabilities"
            @toggle="toggleSide"
          />
          <p class="cell-format-border-panel__hint">{{ t("cellFormat.borderHint") }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-border-panel {
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
    grid-template-columns: 204px minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
  }
  &__lines {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding-right: 16px;
    border-right: 1px solid var(--sheetcraft-border-divider);
  }
  &__field,
  &__section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 6px;
    min-width: 0;
  }
  &__section--preview {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  &__preview {
    flex: 1;
    min-height: 0;
  }
  &__style-list {
    padding: 6px;
    border: 0;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__line-sample {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    overflow: hidden;
    border: 0;
    border-radius: var(--sheetcraft-radius-floating-item);
    background: var(--sheetcraft-surface-dialog-card);
    color: inherit;
    font: inherit;
  }
  &__borders {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }
  &__presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    > button {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 3px;
      min-width: 0;
      padding: 7px 4px 6px;
      border: 0;
      border-radius: var(--sheetcraft-radius-dialog-card);
      background: var(--sheetcraft-surface-dialog-card);
      color: var(--sheetcraft-text-secondary);
      font: inherit;
      text-align: center;
      cursor: pointer;
      transition:
        background-color 0.14s ease,
        color 0.14s ease;

      &:hover:not(:disabled):not(.is-active) {
        background: var(--sheetcraft-surface-button-secondary);
        color: var(--sheetcraft-text-primary);
      }

      &.is-active:not(:disabled) {
        background: var(--sheetcraft-action-primary-subtle);
        color: var(--sheetcraft-action-primary);

        .cell-format-border-panel__preset-icon {
          color: var(--sheetcraft-action-primary);
        }
      }

      &:active:not(:disabled):not(.is-active) {
        background: var(--sheetcraft-surface-button-secondary-hover);
      }

      &:disabled {
        color: var(--sheetcraft-text-muted);
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  }
  &__preset-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--sheetcraft-text-primary);
    transition: color 0.14s ease;
  }
  &__hint {
    margin: 2px 0 0;
    color: var(--sheetcraft-text-muted);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
@media (max-width: 560px) {
  .cell-format-border-panel {
    &__layout {
      grid-template-columns: minmax(0, 1fr);
    }
    &__lines {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 12px;
      padding: 0 0 16px;
      border-right: 0;
      border-bottom: 1px solid var(--sheetcraft-border-subtle);

      > h3 {
        grid-column: 1 / -1;
      }
    }
    &__field + &__field {
      margin-top: 0;
    }
  }
}
</style>
