<script setup lang="ts">
import { Check } from "lucide-vue-next";
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
      <BorderLinePreview line-style="hair" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'hair' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDot"
      :aria-label="t('format.borderLineDashDot')"
      :aria-checked="modelValue === 'dashDot'"
      @click="emit('select', 'dashDot')"
    >
      <BorderLinePreview line-style="dashDot" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'dashDot' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashDotDot"
      :aria-label="t('format.borderLineDashDotDot')"
      :aria-checked="modelValue === 'dashDotDot'"
      @click="emit('select', 'dashDotDot')"
    >
      <BorderLinePreview line-style="dashDotDot" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'dashDotDot' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dotted"
      :aria-label="t('format.borderLineDotted')"
      :aria-checked="modelValue === 'dotted'"
      @click="emit('select', 'dotted')"
    >
      <BorderLinePreview line-style="dotted" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'dotted' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashed"
      :aria-label="t('format.borderLineDashed')"
      :aria-checked="modelValue === 'dashed'"
      @click="emit('select', 'dashed')"
    >
      <BorderLinePreview line-style="dashed" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'dashed' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thin"
      :aria-label="t('format.borderLineThin')"
      :aria-checked="modelValue === 'thin'"
      @click="emit('select', 'thin')"
    >
      <BorderLinePreview line-style="thin" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'thin' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDotDot"
      :aria-label="t('format.borderLineMediumDashDotDot')"
      :aria-checked="modelValue === 'mediumDashDotDot'"
      @click="emit('select', 'mediumDashDotDot')"
    >
      <BorderLinePreview line-style="mediumDashDotDot" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'mediumDashDotDot' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashDot"
      :aria-label="t('format.borderLineMediumDashDot')"
      :aria-checked="modelValue === 'mediumDashDot'"
      @click="emit('select', 'mediumDashDot')"
    >
      <BorderLinePreview line-style="mediumDashDot" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'mediumDashDot' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="mediumDashed"
      :aria-label="t('format.borderLineMediumDashed')"
      :aria-checked="modelValue === 'mediumDashed'"
      @click="emit('select', 'mediumDashed')"
    >
      <BorderLinePreview line-style="mediumDashed" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'mediumDashed' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="medium"
      :aria-label="t('format.borderLineMedium')"
      :aria-checked="modelValue === 'medium'"
      @click="emit('select', 'medium')"
    >
      <BorderLinePreview line-style="medium" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'medium' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="double"
      :aria-label="t('format.borderLineDouble')"
      :aria-checked="modelValue === 'double'"
      @click="emit('select', 'double')"
    >
      <BorderLinePreview line-style="double" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'double' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thick"
      :aria-label="t('format.borderLineThick')"
      :aria-checked="modelValue === 'thick'"
      @click="emit('select', 'thick')"
    >
      <BorderLinePreview line-style="thick" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'thick' }"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="slantDashDot"
      :aria-label="t('format.borderLineSlantDashDot')"
      :aria-checked="modelValue === 'slantDashDot'"
      @click="emit('select', 'slantDashDot')"
    >
      <BorderLinePreview line-style="slantDashDot" /><Check
        :size="15"
        :class="{ 'is-visible': modelValue === 'slantDashDot' }"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped lang="scss">
.border-line-style-panel {
  display: grid;
  gap: 2px;

  > button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px;
    align-items: center;
    width: 100%;
    height: 29px;
    padding: 0 15px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: var(--idea-surface-hover);
      border-color: var(--idea-action-primary);
      outline: none;
    }

    > svg {
      opacity: 0;
      color: var(--idea-action-primary);

      &.is-visible {
        opacity: 1;
      }
    }
  }
}
</style>
