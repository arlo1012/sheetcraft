<script setup lang="ts">
import type { CellBorderLineStyle } from "@idea10/core/style";
import BorderLinePreview from "./BorderLinePreview.vue";
import { useAppI18n } from "../i18n";

withDefaults(
  defineProps<{
    modelValue: CellBorderLineStyle | null;
    color?: string;
  }>(),
  { color: "currentColor" },
);

const emit = defineEmits<{
  select: [style: CellBorderLineStyle | null];
}>();

const { t } = useAppI18n();
</script>

<template>
  <div class="border-line-style-panel" role="menu" :aria-label="t('format.borderLineStyle')">
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="none"
      :aria-label="t('format.borderNone')"
      :aria-checked="modelValue === null"
      @click="emit('select', null)"
    >
      {{ t("format.borderLineNone") }}
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="hair"
      :aria-label="t('format.borderLineHair')"
      :aria-checked="modelValue === 'hair'"
      @click="emit('select', 'hair')"
    >
      <BorderLinePreview line-style="hair" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dotted"
      :aria-label="t('format.borderLineDotted')"
      :aria-checked="modelValue === 'dotted'"
      @click="emit('select', 'dotted')"
    >
      <BorderLinePreview line-style="dotted" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDot"
      :aria-label="t('format.borderLineDashDot')"
      :aria-checked="modelValue === 'dashDot'"
      @click="emit('select', 'dashDot')"
    >
      <BorderLinePreview line-style="dashDot" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDotDot"
      :aria-label="t('format.borderLineDashDotDot')"
      :aria-checked="modelValue === 'dashDotDot'"
      @click="emit('select', 'dashDotDot')"
    >
      <BorderLinePreview line-style="dashDotDot" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashed"
      :aria-label="t('format.borderLineDashed')"
      :aria-checked="modelValue === 'dashed'"
      @click="emit('select', 'dashed')"
    >
      <BorderLinePreview line-style="dashed" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thin"
      :aria-label="t('format.borderLineThin')"
      :aria-checked="modelValue === 'thin'"
      @click="emit('select', 'thin')"
    >
      <BorderLinePreview line-style="thin" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="slantDashDot"
      :aria-label="t('format.borderLineSlantDashDot')"
      :aria-checked="modelValue === 'slantDashDot'"
      @click="emit('select', 'slantDashDot')"
    >
      <BorderLinePreview line-style="slantDashDot" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDotDot"
      :aria-label="t('format.borderLineMediumDashDotDot')"
      :aria-checked="modelValue === 'mediumDashDotDot'"
      @click="emit('select', 'mediumDashDotDot')"
    >
      <BorderLinePreview line-style="mediumDashDotDot" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDot"
      :aria-label="t('format.borderLineMediumDashDot')"
      :aria-checked="modelValue === 'mediumDashDot'"
      @click="emit('select', 'mediumDashDot')"
    >
      <BorderLinePreview line-style="mediumDashDot" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashed"
      :aria-label="t('format.borderLineMediumDashed')"
      :aria-checked="modelValue === 'mediumDashed'"
      @click="emit('select', 'mediumDashed')"
    >
      <BorderLinePreview line-style="mediumDashed" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="medium"
      :aria-label="t('format.borderLineMedium')"
      :aria-checked="modelValue === 'medium'"
      @click="emit('select', 'medium')"
    >
      <BorderLinePreview line-style="medium" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thick"
      :aria-label="t('format.borderLineThick')"
      :aria-checked="modelValue === 'thick'"
      @click="emit('select', 'thick')"
    >
      <BorderLinePreview line-style="thick" :color="color" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="double"
      :aria-label="t('format.borderLineDouble')"
      :aria-checked="modelValue === 'double'"
      @click="emit('select', 'double')"
    >
      <BorderLinePreview line-style="double" :color="color" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.border-line-style-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(7, 29px);
  grid-auto-flow: column;
  gap: 4px;

  > button {
    display: grid;
    place-items: center;
    width: 100%;
    height: 29px;
    padding: 0 12px;
    background: transparent;
    color: var(--idea-text-primary);
    border: 0;
    border-radius: 3px;
    cursor: pointer;
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);

    &:hover,
    &:focus-visible,
    &[aria-checked="true"] {
      background: var(--idea-surface-hover);
      outline: none;
    }
  }
}
</style>
