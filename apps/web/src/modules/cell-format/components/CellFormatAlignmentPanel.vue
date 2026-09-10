<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import { formatCellNumberValue } from "@idea10/core/number-format";
import type {
  CellStyle,
  CellStylePatch,
  CellTextDirection,
  CellTextRotation,
  HorizontalCellAlignment,
  VerticalCellAlignment,
} from "@idea10/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@idea10/core/style-state";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatTextOrientationControl from "./CellFormatTextOrientationControl.vue";

type MergeState = "on" | "off" | "mixed";

const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue?: string | number | boolean | null;
  mergeState?: MergeState;
  mergeEnabled?: boolean;
  dateSystem?: "1900" | "1904";
}>();
const emit = defineEmits<{
  "update:patch": [patch: CellStylePatch];
  "update:merge": [merge: boolean];
}>();
const { locale, t } = useAppI18n();

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
const multilineText = computed(() => /[\r\n]/u.test(previewText.value));
const shrinkDisabled = computed(() => wrapped.value || multilineText.value);
const rotationMixed = computed(() => !hasPatch("textRotation") && props.state.textRotation.mixed);
const mergeMixed = computed(() => props.mergeState === "mixed");
const merged = computed(() => props.mergeState === "on");
const previewText = computed(() =>
  props.sampleValue === null || props.sampleValue === undefined
    ? t("cellFormat.alignmentPreviewText")
    : formatComputedValueForDisplay(props.sampleValue),
);
function previewStringField(key: "fontFamily" | "textColor"): string | undefined {
  const current = hasPatch(key)
    ? props.patch[key]
    : props.state[key].mixed
      ? undefined
      : props.state[key].value;
  return typeof current === "string" ? current : undefined;
}
function previewNumberField(key: "fontSize"): number | undefined {
  const current = hasPatch(key)
    ? props.patch[key]
    : props.state[key].mixed
      ? undefined
      : props.state[key].value;
  return typeof current === "number" ? current : undefined;
}
function previewToggle(key: "bold" | "italic" | "underline"): boolean {
  return hasPatch(key) ? props.patch[key] === true : props.state[key] === "on";
}
const previewNumberFormat = computed(() => {
  const current = hasPatch("numberFormat")
    ? props.patch.numberFormat
    : props.state.numberFormat.mixed
      ? undefined
      : props.state.numberFormat.value;
  return current && typeof current === "object" ? current : undefined;
});
const previewStyle = computed<Readonly<CellStyle>>(() => ({
  ...(previewStringField("fontFamily") ? { fontFamily: previewStringField("fontFamily") } : {}),
  ...(previewNumberField("fontSize") ? { fontSize: previewNumberField("fontSize") } : {}),
  ...(previewToggle("bold") ? { bold: true } : {}),
  ...(previewToggle("italic") ? { italic: true } : {}),
  ...(previewToggle("underline") ? { underline: true } : {}),
  ...(previewStringField("textColor") ? { textColor: previewStringField("textColor") } : {}),
  ...(horizontal.value && horizontal.value !== "general"
    ? { horizontalAlign: horizontal.value }
    : {}),
  ...(vertical.value && vertical.value !== "bottom" ? { verticalAlign: vertical.value } : {}),
  ...(canIndent.value && indent.value ? { indent: indent.value } : {}),
  ...(wrapped.value ? { wrapText: true } : {}),
  ...(shrinkToFit.value ? { shrinkToFit: true } : {}),
  ...(direction.value && direction.value !== "context" ? { textDirection: direction.value } : {}),
  ...(rotation.value && rotation.value !== 0 ? { textRotation: rotation.value } : {}),
  ...(previewNumberFormat.value ? { numberFormat: previewNumberFormat.value } : {}),
}));
const previewPresentation = computed(() =>
  props.sampleValue === null || props.sampleValue === undefined
    ? { text: previewText.value }
    : formatCellNumberValue(props.sampleValue, previewNumberFormat.value, {
        locale: locale.value,
        dateSystem: props.dateSystem ?? "1900",
      }),
);

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
</script>

<template>
  <section class="cell-format-alignment" :aria-label="t('cellFormat.alignment')">
    <div class="cell-format-alignment__layout">
      <div class="cell-format-alignment__content">
        <h3>{{ t("cellFormat.textAlignment") }}</h3>
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
        <div class="cell-format-alignment__field" role="group" :aria-label="t('cellFormat.indent')">
          <span>{{ t("cellFormat.indent") }}</span
          ><TInputNumber
            :model-value="indent"
            :min="0"
            :max="250"
            :decimal-places="0"
            :disabled="!canIndent"
            theme="column"
            class="idea-input-number--persistent-controls"
            :placeholder="state.indent.mixed ? t('format.mixed') : undefined"
            data-cell-format-indent
            @change="setIndent"
          />
        </div>
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
        <h3>{{ t("cellFormat.rightToLeft") }}</h3>
        <label class="cell-format-alignment__field"
          ><span>{{ t("cellFormat.textDirection") }}</span
          ><TSelect
            :model-value="direction"
            :options="directionOptions"
            :placeholder="state.textDirection.mixed ? t('format.mixed') : undefined"
            data-cell-format-text-direction
            @change="setDirection"
        /></label>
      </div>
      <CellFormatTextOrientationControl
        :model-value="rotation"
        :mixed="rotationMixed"
        @update:model-value="setTextRotation"
      />
    </div>
    <div class="cell-format-alignment__preview-group">
      <span>{{ t("cellFormat.preview") }}</span>
      <div class="cell-format-alignment__preview" data-cell-format-alignment-preview>
        <CellTextContent
          :text="previewPresentation.text"
          :value="sampleValue ?? previewText"
          :cell-style="previewStyle"
          :fill="previewPresentation.fill"
          fit-rotation
        />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cell-format-alignment {
  display: grid;
  gap: 18px;
  padding: 12px 2px 4px;
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-medium);
  &__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 156px;
    gap: 18px;
  }
  &__content {
    display: grid;
    gap: 10px;
    align-content: start;
  }
  h3 {
    margin: 0 0 -2px;
    font-size: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }
  &__field {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  &__checks {
    display: grid;
    gap: 7px;
    padding-top: 1px;
  }
  &__preview-group {
    display: grid;
    gap: 8px;
  }
  &__preview {
    height: 76px;
    overflow: hidden;
    padding: 0;
    background: var(--idea-surface-secondary);
    border: 1px solid var(--idea-border-control);
  }
}
@media (max-width: 520px) {
  .cell-format-alignment__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
