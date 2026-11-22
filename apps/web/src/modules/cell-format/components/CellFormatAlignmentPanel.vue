<script setup lang="ts">
import { computed } from "vue";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
} from "lucide-vue-next";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import type {
  CellStylePatch,
  CellTextDirection,
  CellTextRotation,
  HorizontalCellAlignment,
  VerticalCellAlignment,
} from "@sheetcraft/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatTextOrientationControl from "./CellFormatTextOrientationControl.vue";

type MergeState = "on" | "off" | "mixed";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue?: string | number | boolean | null;
  mergeState?: MergeState;
  mergeEnabled?: boolean;
}>();
const emit = defineEmits<{
  "update:patch": [patch: CellStylePatch];
  "update:merge": [merge: boolean];
}>();
const { t } = useAppI18n();

const horizontalOptions = computed(() => [
  { label: t("cellFormat.horizontalGeneral"), value: "general" },
  { label: t("cellFormat.horizontalLeft"), value: "left" },
  { label: t("cellFormat.horizontalCenter"), value: "center" },
  { label: t("cellFormat.horizontalRight"), value: "right" },
  { label: t("cellFormat.horizontalFill"), value: "fill" },
  { label: t("cellFormat.horizontalJustify"), value: "justify" },
  {
    label: t("cellFormat.horizontalCenterContinuous"),
    value: "centerContinuous",
  },
  { label: t("cellFormat.horizontalDistributed"), value: "distributed" },
]);
const verticalOptions = computed(() => [
  { label: t("cellFormat.verticalTop"), value: "top" },
  { label: t("cellFormat.verticalMiddle"), value: "middle" },
  { label: t("cellFormat.verticalBottom"), value: "bottom" },
  { label: t("cellFormat.verticalJustify"), value: "justify" },
  { label: t("cellFormat.verticalDistributed"), value: "distributed" },
]);
const directionOptions = computed(() => [
  { label: t("cellFormat.textDirectionContext"), value: "context" },
  { label: t("cellFormat.textDirectionLtr"), value: "ltr" },
  { label: t("cellFormat.textDirectionRtl"), value: "rtl" },
]);

function hasPatch(key: keyof CellStylePatch): boolean {
  return Object.hasOwn(props.patch, key);
}
function rawValue(
  key: "horizontalAlign" | "verticalAlign" | "indent" | "textDirection" | "textRotation",
) {
  if (hasPatch(key)) return props.patch[key];
  const source = props.state[key];
  return source.mixed ? undefined : source.value;
}
function toggleValue(key: "wrapText" | "shrinkToFit"): boolean {
  return hasPatch(key) ? props.patch[key] === true : props.state[key] === "on";
}
function toggleMixed(key: "wrapText" | "shrinkToFit"): boolean {
  return !hasPatch(key) && props.state[key] === "mixed";
}

const horizontal = computed<HorizontalCellAlignment | undefined>(() => {
  const current = rawValue("horizontalAlign");
  return typeof current === "string"
    ? (current as HorizontalCellAlignment)
    : hasPatch("horizontalAlign") || !props.state.horizontalAlign.mixed
      ? "general"
      : undefined;
});
const vertical = computed<VerticalCellAlignment | undefined>(() => {
  const current = rawValue("verticalAlign");
  return typeof current === "string"
    ? (current as VerticalCellAlignment)
    : hasPatch("verticalAlign") || !props.state.verticalAlign.mixed
      ? "bottom"
      : undefined;
});
const direction = computed<CellTextDirection | undefined>(() => {
  const current = rawValue("textDirection");
  return typeof current === "string"
    ? (current as CellTextDirection)
    : hasPatch("textDirection") || !props.state.textDirection.mixed
      ? "context"
      : undefined;
});
const indent = computed<number | undefined>(() => {
  const current = rawValue("indent");
  return typeof current === "number"
    ? current
    : hasPatch("indent") || !props.state.indent.mixed
      ? 0
      : undefined;
});
const rotation = computed<CellTextRotation | undefined>(() => {
  const current = rawValue("textRotation");
  return current === "vertical" || typeof current === "number"
    ? current
    : hasPatch("textRotation") || !props.state.textRotation.mixed
      ? 0
      : undefined;
});
const canIndent = computed(() => ["left", "right", "distributed"].includes(horizontal.value ?? ""));
const manuallyWrapped = computed(() => toggleValue("wrapText"));
const intrinsicWrap = computed(
  () => horizontal.value === "justify" || horizontal.value === "distributed",
);
const wrapped = computed(() => manuallyWrapped.value || intrinsicWrap.value);
const shrinkToFit = computed(() => toggleValue("shrinkToFit"));
const multilineText = computed(
  () => typeof props.sampleValue === "string" && /[\r\n]/u.test(props.sampleValue),
);
const shrinkDisabled = computed(() => wrapped.value || multilineText.value);
const rotationMixed = computed(() => !hasPatch("textRotation") && props.state.textRotation.mixed);
const mergeMixed = computed(() => props.mergeState === "mixed");
const merged = computed(() => props.mergeState === "on");
function setHorizontal(next: SelectValue): void {
  if (typeof next === "string")
    emit("update:patch", {
      horizontalAlign: next === "general" ? null : (next as HorizontalCellAlignment),
    });
}
function setVertical(next: SelectValue): void {
  if (typeof next === "string")
    emit("update:patch", {
      verticalAlign: next === "bottom" ? null : (next as VerticalCellAlignment),
    });
}
function setDirection(next: SelectValue): void {
  if (typeof next === "string")
    emit("update:patch", {
      textDirection: next === "context" ? null : (next as CellTextDirection),
    });
}
function setIndent(next: InputNumberValue): void {
  if (typeof next === "number" && Number.isFinite(next)) {
    const value = Math.max(0, Math.min(250, Math.round(next)));
    emit("update:patch", { indent: value || null });
  }
}
function setWrap(next: boolean): void {
  if (intrinsicWrap.value) return;
  emit(
    "update:patch",
    next && shrinkToFit.value
      ? { wrapText: true, shrinkToFit: null }
      : { wrapText: next ? true : null },
  );
}
function setShrink(next: boolean): void {
  emit("update:patch", next ? { shrinkToFit: true, wrapText: null } : { shrinkToFit: null });
}
function setTextRotation(next: CellTextRotation | null): void {
  emit("update:patch", { textRotation: next });
}
function checkboxPressed(
  key: "wrapText" | "shrinkToFit",
  state: ToggleStyleState,
): boolean | "mixed" {
  return hasPatch(key) ? toggleValue(key) : state === "mixed" ? "mixed" : state === "on";
}

const previewSampleText = computed(() => {
  if (props.sampleValue !== undefined && props.sampleValue !== null && props.sampleValue !== "") {
    return String(props.sampleValue);
  }
  return t("cellFormat.previewText");
});

const previewCellStyle = computed(() => {
  const h = horizontal.value ?? "general";
  const v = vertical.value ?? "bottom";
  const justifyContent =
    h === "center" || h === "centerContinuous"
      ? "center"
      : h === "right"
        ? "flex-end"
        : "flex-start";
  const alignItems = v === "top" ? "flex-start" : v === "middle" ? "center" : "flex-end";
  const indentPx = canIndent.value && indent.value ? Math.min(indent.value, 6) * 8 : 0;
  return {
    justifyContent,
    alignItems,
    paddingLeft: h === "right" ? "10px" : `${10 + indentPx}px`,
    paddingRight: h === "right" ? `${10 + indentPx}px` : "10px",
    direction: direction.value === "rtl" ? ("rtl" as const) : ("ltr" as const),
  };
});

const previewTextStyle = computed(() => {
  const rot = rotation.value;
  const base: Record<string, string> = {
    whiteSpace: wrapped.value ? "normal" : "nowrap",
    textAlign:
      horizontal.value === "center" || horizontal.value === "centerContinuous"
        ? "center"
        : horizontal.value === "right"
          ? "right"
          : "left",
  };
  if (rot === "vertical") {
    base.writingMode = "vertical-rl";
    base.textOrientation = "upright";
  } else if (typeof rot === "number" && rot !== 0) {
    base.transform = `rotate(${-rot}deg)`;
    base.transformOrigin = "center";
  }
  return base;
});
</script>

<template>
  <section class="cell-format-alignment" :aria-label="t('cellFormat.alignment')">
    <div class="cell-format-alignment__layout">
      <div class="cell-format-alignment__content">
        <section class="cell-format-alignment__group">
          <div class="cell-format-alignment__group-head">
            <h3>{{ t("cellFormat.textAlignment") }}</h3>
            <div
              class="cell-format-alignment__quick-bar"
              role="group"
              :aria-label="t('cellFormat.quickAlignment')"
            >
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': horizontal === 'left' }"
                :title="t('cellFormat.horizontalLeft')"
                :aria-label="t('cellFormat.horizontalLeft')"
                :aria-pressed="horizontal === 'left'"
                @click="setHorizontal('left')"
              >
                <AlignLeft :size="14" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': horizontal === 'center' }"
                :title="t('cellFormat.horizontalCenter')"
                :aria-label="t('cellFormat.horizontalCenter')"
                :aria-pressed="horizontal === 'center'"
                @click="setHorizontal('center')"
              >
                <AlignCenter :size="14" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': horizontal === 'right' }"
                :title="t('cellFormat.horizontalRight')"
                :aria-label="t('cellFormat.horizontalRight')"
                :aria-pressed="horizontal === 'right'"
                @click="setHorizontal('right')"
              >
                <AlignRight :size="14" aria-hidden="true" />
              </button>
              <span class="cell-format-alignment__quick-sep" aria-hidden="true" />
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': vertical === 'top' }"
                :title="t('cellFormat.verticalTop')"
                :aria-label="t('cellFormat.verticalTop')"
                :aria-pressed="vertical === 'top'"
                @click="setVertical('top')"
              >
                <AlignStartHorizontal :size="14" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': vertical === 'middle' }"
                :title="t('cellFormat.verticalMiddle')"
                :aria-label="t('cellFormat.verticalMiddle')"
                :aria-pressed="vertical === 'middle'"
                @click="setVertical('middle')"
              >
                <AlignCenterHorizontal :size="14" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="cell-format-alignment__quick-btn"
                :class="{ 'is-active': vertical === 'bottom' }"
                :title="t('cellFormat.verticalBottom')"
                :aria-label="t('cellFormat.verticalBottom')"
                :aria-pressed="vertical === 'bottom'"
                @click="setVertical('bottom')"
              >
                <AlignEndHorizontal :size="14" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div class="cell-format-alignment__fields">
            <label class="cell-format-alignment__field"
              ><span>{{ t("cellFormat.horizontal") }}</span
              ><TSelect
                :model-value="horizontal"
                :options="horizontalOptions"
                :placeholder="state.horizontalAlign.mixed ? t('format.mixed') : undefined"
                data-cell-format-horizontal
                @change="setHorizontal"
            /></label>
            <label class="cell-format-alignment__field"
              ><span>{{ t("cellFormat.vertical") }}</span
              ><TSelect
                :model-value="vertical"
                :options="verticalOptions"
                :placeholder="state.verticalAlign.mixed ? t('format.mixed') : undefined"
                data-cell-format-vertical
                @change="setVertical"
            /></label>
            <div
              class="cell-format-alignment__field"
              role="group"
              :aria-label="t('cellFormat.indent')"
            >
              <span>{{ t("cellFormat.indent") }}</span
              ><TInputNumber
                :model-value="indent"
                :min="0"
                :max="250"
                :decimal-places="0"
                :disabled="!canIndent"
                theme="column"
                class="sheetcraft-input-number--persistent-controls"
                :placeholder="state.indent.mixed ? t('format.mixed') : undefined"
                data-cell-format-indent
                @change="setIndent"
              />
            </div>
          </div>
        </section>

        <section class="cell-format-alignment__card">
          <h3>{{ t("cellFormat.textControl") }}</h3>
          <div
            class="cell-format-alignment__checks"
            role="group"
            :aria-label="t('cellFormat.textControl')"
          >
            <TCheckbox
              :model-value="wrapped"
              :indeterminate="!intrinsicWrap && toggleMixed('wrapText')"
              :disabled="intrinsicWrap"
              :aria-checked="intrinsicWrap || checkboxPressed('wrapText', state.wrapText)"
              data-cell-format-wrap
              @change="setWrap"
              >{{ t("cellFormat.wrapText") }}</TCheckbox
            >
            <TCheckbox
              :model-value="shrinkToFit"
              :indeterminate="toggleMixed('shrinkToFit')"
              :disabled="shrinkDisabled"
              :aria-checked="checkboxPressed('shrinkToFit', state.shrinkToFit)"
              data-cell-format-shrink
              @change="setShrink"
              >{{ t("cellFormat.shrinkToFit") }}</TCheckbox
            >
            <TCheckbox
              v-if="mergeState"
              :model-value="merged"
              :indeterminate="mergeMixed"
              :disabled="!mergeEnabled"
              data-cell-format-merge
              @change="emit('update:merge', $event)"
              >{{ t("cellFormat.mergeCells") }}</TCheckbox
            >
          </div>
          <label class="cell-format-alignment__direction-row">
            <span>{{ t("cellFormat.textDirection") }}</span>
            <TSelect
              :model-value="direction"
              :options="directionOptions"
              :placeholder="state.textDirection.mixed ? t('format.mixed') : undefined"
              data-cell-format-text-direction
              @change="setDirection"
            />
          </label>
        </section>

        <section class="cell-format-alignment__preview-card" :aria-label="t('cellFormat.preview')">
          <div class="cell-format-alignment__preview-cell" :style="previewCellStyle">
            <span class="cell-format-alignment__preview-text" :style="previewTextStyle">{{
              previewSampleText
            }}</span>
          </div>
        </section>
      </div>
      <CellFormatTextOrientationControl
        :model-value="rotation"
        :mixed="rotationMixed"
        @update:model-value="setTextRotation"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-alignment {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--sheetcraft-text-primary);
  font-size: var(--sheetcraft-font-size-body-medium);

  &__layout {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) 196px;
    gap: 16px;
    min-height: 0;
  }
  &__content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
  }
  &__group {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  &__group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  &__quick-bar {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__quick-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      color 0.12s ease;

    &:hover {
      background: var(--sheetcraft-surface-menu-hover);
      color: var(--sheetcraft-text-primary);
    }

    &.is-active {
      background: var(--sheetcraft-surface-panel);
      color: var(--sheetcraft-action-primary);
      box-shadow: var(--sheetcraft-shadow-segmented-active);
    }
  }
  &__quick-sep {
    width: 1px;
    height: 14px;
    margin-inline: 2px;
    background: var(--sheetcraft-border-divider);
  }
  h3 {
    margin: 0;
    font-size: inherit;
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) 88px;
    gap: 10px;
  }
  &__field {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 4px;

    > span {
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__card {
    display: grid;
    gap: 8px;
    padding: 9px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__checks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }
  &__direction-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;

    > span {
      color: var(--sheetcraft-text-secondary);
      white-space: nowrap;
    }
  }
  &__preview-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 76px;
    padding: 8px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__preview-cell {
    display: flex;
    flex: 1;
    min-height: 54px;
    padding-block: 6px;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-divider);
    border-radius: var(--sheetcraft-radius-floating-item);
    background: var(--sheetcraft-surface-panel);
  }
  &__preview-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--sheetcraft-text-primary);
    line-height: 1.35;
  }
}
@media (max-width: 560px) {
  .cell-format-alignment {
    height: auto;
    &__layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
