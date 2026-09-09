<script setup lang="ts">
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { Bold, Italic, Underline } from "lucide-vue-next";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@idea10/core/style-state";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
function value<Key extends "fontFamily" | "fontSize" | "textColor">(key: Key) {
  return Object.hasOwn(props.patch, key)
    ? props.patch[key]
    : props.state[key].mixed
      ? undefined
      : (props.state[key].value ??
        (key === "fontFamily" ? "Inter" : key === "fontSize" ? 13 : undefined));
}
const fontFamilies = [
  "Inter",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Microsoft YaHei",
  "SimSun",
];
function fontOptions() {
  const current = value("fontFamily");
  return [
    ...new Set(current && typeof current === "string" ? [...fontFamilies, current] : fontFamilies),
  ].map((value) => ({ label: value, value }));
}
function toggled(key: "bold" | "italic" | "underline"): boolean {
  const current = Object.hasOwn(props.patch, key)
    ? props.patch[key]
    : props.state[key] === "on"
      ? true
      : null;
  return current === true;
}
function setFamily(value: SelectValue): void {
  if (typeof value === "string" && value) emit("update:patch", { fontFamily: value });
}
function setSize(value: InputNumberValue): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  emit("update:patch", { fontSize: Math.max(8, Math.min(72, Math.round(value))) });
}
function toggle(key: "bold" | "italic" | "underline"): void {
  emit("update:patch", { [key]: toggled(key) ? null : true });
}
function setColor(color: string | null): void {
  emit("update:patch", { textColor: color ?? null });
}
function pressed(key: "bold" | "italic" | "underline", state: ToggleStyleState): boolean | "mixed" {
  return Object.hasOwn(props.patch, key)
    ? toggled(key)
    : state === "mixed"
      ? "mixed"
      : state === "on";
}
</script>
<template>
  <section class="cell-format-font" :aria-label="t('cellFormat.font')">
    <label
      ><span>{{ t("format.fontFamily") }}</span
      ><TSelect
        :model-value="value('fontFamily') as string | undefined"
        :options="fontOptions()"
        :placeholder="state.fontFamily.mixed ? t('format.mixed') : undefined"
        data-cell-format-font-family
        @change="setFamily"
    /></label>
    <div class="cell-format-font__field" role="group" :aria-label="t('format.fontSize')">
      <span>{{ t("format.fontSize") }}</span
      ><TInputNumber
        :model-value="value('fontSize') as number | undefined"
        :min="8"
        :max="72"
        :decimal-places="0"
        :placeholder="state.fontSize.mixed ? t('format.mixed') : t('format.fontSize')"
        theme="column"
        class="idea-input-number--persistent-controls"
        data-cell-format-font-size
        @change="setSize"
      />
    </div>
    <div class="cell-format-font__emphasis" role="group" :aria-label="t('format.emphasis')">
      <button
        type="button"
        :aria-pressed="pressed('bold', state.bold)"
        :title="t('format.bold')"
        data-cell-format-bold
        @click="toggle('bold')"
      >
        <Bold :size="17" /></button
      ><button
        type="button"
        :aria-pressed="pressed('italic', state.italic)"
        :title="t('format.italic')"
        data-cell-format-italic
        @click="toggle('italic')"
      >
        <Italic :size="17" /></button
      ><button
        type="button"
        :aria-pressed="pressed('underline', state.underline)"
        :title="t('format.underline')"
        data-cell-format-underline
        @click="toggle('underline')"
      >
        <Underline :size="17" />
      </button>
    </div>
    <div class="cell-format-font__color">
      <span>{{ t("format.textColor") }}</span
      ><ColorPalette
        :model-value="value('textColor') as string | null"
        :default-color="'#20242c'"
        :default-label="t('cellFormat.automatic')"
        :mixed="!Object.hasOwn(patch, 'textColor') && state.textColor.mixed"
        @select="setColor"
      />
    </div>
    <p
      class="cell-format-font__preview"
      :style="{
        fontFamily: (value('fontFamily') as string | undefined) ?? 'Inter',
        fontSize: `${(value('fontSize') as number | undefined) ?? 13}px`,
        color: (value('textColor') as string | undefined) ?? '#20242c',
        fontWeight: toggled('bold') ? 700 : 400,
        fontStyle: toggled('italic') ? 'italic' : 'normal',
        textDecoration: toggled('underline') ? 'underline' : 'none',
      }"
      data-cell-format-font-preview
    >
      {{ sampleValue ?? t("cellFormat.previewText") }}
    </p>
  </section>
</template>
<style scoped lang="scss">
.cell-format-font {
  display: grid;
  gap: 16px;
  padding: 8px 4px;
  > label,
  &__field {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
  &__emphasis {
    display: flex;
    gap: 8px;
    padding-left: 128px;
    button {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--idea-text-primary);
      background: var(--idea-surface-panel);
      border: 1px solid var(--idea-border-control);
      border-radius: var(--idea-radius-default);
      cursor: pointer;
      &[aria-pressed="true"] {
        color: var(--idea-action-primary);
        background: var(--idea-action-primary-subtle);
      }
    }
  }
  &__color {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
  &__preview {
    min-height: 56px;
    margin: 0;
    padding: 12px;
    background: var(--idea-surface-secondary);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
  }
}
@media (max-width: 480px) {
  .cell-format-font {
    > label,
    &__field,
    &__color,
    &__palette,
    &__preview {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    &__emphasis {
      padding-left: 0;
    }
  }
}
</style>
