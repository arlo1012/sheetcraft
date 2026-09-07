<script setup lang="ts">
import type { CellBorderLineStyle } from "@idea10/core/style";
import BorderLinePreview from "../../../shared/borders/BorderLinePreview.vue";
import { useAppI18n } from "../../../shared/i18n";

defineProps<{
  modelValue: CellBorderLineStyle;
}>();

const emit = defineEmits<{
  select: [style: CellBorderLineStyle];
}>();

const { t } = useAppI18n();
</script>

<template>
  <div class="border-line-style-panel" role="menu" :aria-label="t('format.borderLineStyle')">
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="hair"
      :aria-label="t('format.borderLineHair')"
      :aria-checked="modelValue === 'hair'"
      @click="emit('select', 'hair')"
    >
      <BorderLinePreview line-style="hair" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDot"
      :aria-label="t('format.borderLineDashDot')"
      :aria-checked="modelValue === 'dashDot'"
      @click="emit('select', 'dashDot')"
    >
      <BorderLinePreview line-style="dashDot" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDotDot"
      :aria-label="t('format.borderLineDashDotDot')"
      :aria-checked="modelValue === 'dashDotDot'"
      @click="emit('select', 'dashDotDot')"
    >
      <BorderLinePreview line-style="dashDotDot" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dotted"
      :aria-label="t('format.borderLineDotted')"
      :aria-checked="modelValue === 'dotted'"
      @click="emit('select', 'dotted')"
    >
      <BorderLinePreview line-style="dotted" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashed"
      :aria-label="t('format.borderLineDashed')"
      :aria-checked="modelValue === 'dashed'"
      @click="emit('select', 'dashed')"
    >
      <BorderLinePreview line-style="dashed" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thin"
      :aria-label="t('format.borderLineThin')"
      :aria-checked="modelValue === 'thin'"
      @click="emit('select', 'thin')"
    >
      <BorderLinePreview line-style="thin" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDotDot"
      :aria-label="t('format.borderLineMediumDashDotDot')"
      :aria-checked="modelValue === 'mediumDashDotDot'"
      @click="emit('select', 'mediumDashDotDot')"
    >
      <BorderLinePreview line-style="mediumDashDotDot" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDot"
      :aria-label="t('format.borderLineMediumDashDot')"
      :aria-checked="modelValue === 'mediumDashDot'"
      @click="emit('select', 'mediumDashDot')"
    >
      <BorderLinePreview line-style="mediumDashDot" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashed"
      :aria-label="t('format.borderLineMediumDashed')"
      :aria-checked="modelValue === 'mediumDashed'"
      @click="emit('select', 'mediumDashed')"
    >
      <BorderLinePreview line-style="mediumDashed" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="medium"
      :aria-label="t('format.borderLineMedium')"
      :aria-checked="modelValue === 'medium'"
      @click="emit('select', 'medium')"
    >
      <BorderLinePreview line-style="medium" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="double"
      :aria-label="t('format.borderLineDouble')"
      :aria-checked="modelValue === 'double'"
      @click="emit('select', 'double')"
    >
      <BorderLinePreview line-style="double" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thick"
      :aria-label="t('format.borderLineThick')"
      :aria-checked="modelValue === 'thick'"
      @click="emit('select', 'thick')"
    >
      <BorderLinePreview line-style="thick" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="slantDashDot"
      :aria-label="t('format.borderLineSlantDashDot')"
      :aria-checked="modelValue === 'slantDashDot'"
      @click="emit('select', 'slantDashDot')"
    >
      <BorderLinePreview line-style="slantDashDot" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.border-line-style-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;

  > button {
    display: grid;
    place-items: center;
    width: 100%;
    height: 29px;
    padding: 0 12px;
    background: transparent;
    color: var(--idea-text-primary);
    border: 0;
    border-radius: 2px;
    cursor: pointer;

    &:hover,
    &:focus-visible,
    &[aria-checked="true"] {
      background: var(--idea-surface-hover);
      outline: none;
    }
  }
}
</style>
