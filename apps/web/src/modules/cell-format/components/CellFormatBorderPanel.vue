<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  CellBorder,
  CellBorderAction,
  CellBorderFormatPatch,
  CellBorderLineStyle,
} from "@idea10/core/style";
import type { SelectionBorderState } from "@idea10/core/style-state";
import BorderLinePreview from "../../../shared/borders/BorderLinePreview.vue";
import BorderLineStylePanel from "../../../shared/borders/BorderLineStylePanel.vue";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import { vIconAction } from "../../../shared/focus/icon-action";
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
  lineStyle.value = border.value.style;
  const current = effectiveBorder(side);
  const shouldClear = !isMixed(side) && isActive(side) && matchesBrush(current);
  append({ preset: side, border: shouldClear ? null : { ...border.value } });
}

function selectPreset(preset: "none" | "all" | "outer" | "inner"): void {
  if (preset === "inner" && !isAvailable("innerHorizontal") && !isAvailable("innerVertical"))
    return;
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
</script>

<template>
  <section class="cell-format-border-panel">
    <div class="cell-format-border-panel__layout">
      <div class="cell-format-border-panel__lines">
        <h3>{{ t("cellFormat.borderLines") }}</h3>
        <div class="cell-format-border-panel__field">
          <span>{{ t("format.borderLineStyle") }}</span>
          <div class="cell-format-border-panel__style-list">
            <BorderLineStylePanel
              :model-value="lineStyle"
              :color="color"
              @select="selectLineStyle"
            />
          </div>
        </div>
        <div class="cell-format-border-panel__field">
          <span>{{ t("format.borderColor") }}</span>
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
              :width="120"
            />
            <span v-else>{{ t("format.borderLineNone") }}</span>
          </div>
        </div>
      </div>

      <div class="cell-format-border-panel__borders">
        <div class="cell-format-border-panel__section">
          <h3>{{ t("format.borderPresets") }}</h3>
          <div class="cell-format-border-panel__presets">
            <span
              v-icon-action
              data-border-preset="none"
              :aria-label="t('format.borderNone')"
              @click="selectPreset('none')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="none"
              /></span>
              <span>{{ t("format.borderNone") }}</span>
            </span>
            <span
              v-icon-action
              data-border-preset="outer"
              :aria-label="t('format.borderOuter')"
              @click="selectPreset('outer')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="outer"
              /></span>
              <span>{{ t("format.borderOuter") }}</span>
            </span>
            <span
              v-icon-action="!isAvailable('innerHorizontal') && !isAvailable('innerVertical')"
              data-border-preset="inner"
              :aria-label="t('format.borderInner')"
              @click="selectPreset('inner')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="inner"
              /></span>
              <span>{{ t("format.borderInner") }}</span>
            </span>
            <span
              v-icon-action
              data-border-preset="all"
              :aria-label="t('format.borderAll')"
              @click="selectPreset('all')"
            >
              <span class="cell-format-border-panel__preset-icon"
                ><CellBorderPresetIcon preset="all"
              /></span>
              <span>{{ t("format.borderAll") }}</span>
            </span>
          </div>
        </div>
        <div class="cell-format-border-panel__section">
          <h3>{{ t("cellFormat.border") }}</h3>
          <CellFormatBorderPreview
            :state="previewState"
            :capabilities="capabilities"
            @toggle="toggleSide"
          />
        </div>
      </div>
    </div>
    <p class="cell-format-border-panel__hint">{{ t("cellFormat.borderHint") }}</p>
  </section>
</template>

<style scoped lang="scss">
.cell-format-border-panel {
  display: grid;
  gap: 20px;
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
    grid-template-columns: 192px minmax(0, 1fr);
    gap: 16px;
  }
  &__lines {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
    padding-right: 16px;
    border-right: 1px solid var(--idea-border-subtle);
  }
  &__field,
  &__section {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
  }
  &__field + &__field {
    margin-top: 4px;
  }
  &__style-list {
    padding: var(--idea-tool-panel-padding);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
  }
  &__line-sample {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    overflow: hidden;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
    color: inherit;
    font: inherit;
  }
  &__borders {
    display: grid;
    align-content: start;
    gap: 16px;
    min-width: 0;
  }
  &__presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    > span {
      display: grid;
      justify-items: center;
      align-content: start;
      gap: 4px;
      min-width: 0;
      padding: 0;
      border: 0;
      border-radius: var(--idea-radius-default);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: center;
      cursor: pointer;

      &:hover:not([aria-disabled="true"]) .cell-format-border-panel__preset-icon {
        background: var(--idea-icon-button-hover-bg);
      }

      &[aria-disabled="true"] {
        color: var(--idea-text-muted);
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  }
  &__preset-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);
  }
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
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
      border-bottom: 1px solid var(--idea-border-subtle);

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
