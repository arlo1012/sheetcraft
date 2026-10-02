<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

type ColorCondition = Extract<SheetFilterCondition, { kind: "color" }>;

const props = withDefaults(
  defineProps<{
    colors: {
      cellColors: readonly (string | null)[];
      fontColors: readonly string[];
    };
    modelValue?: ColorCondition;
    disabled?: boolean;
  }>(),
  { modelValue: undefined, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [condition: ColorCondition] }>();
const { t } = useAppI18n();

const cellColors = computed(() => [...new Set(props.colors.cellColors)]);
const fontColors = computed(() => [...new Set(props.colors.fontColors)]);

function label(color: string | null): string {
  return color === null ? t("dataTools.filter.noFillColor") : color.toUpperCase();
}

function selected(target: ColorCondition["target"], color: string | null): boolean {
  return props.modelValue?.target === target && props.modelValue.color === color;
}

function choose(target: ColorCondition["target"], color: string | null): void {
  if (props.disabled) return;
  emit("update:modelValue", { kind: "color", target, color });
}
</script>

<template>
  <section class="filter-color-options" :aria-label="t('dataTools.filter.byColor')">
    <div class="filter-color-options__group">
      <span class="filter-color-options__label">{{ t("dataTools.filter.fillColors") }}</span>
      <div
        class="filter-color-options__choices"
        role="group"
        :aria-label="t('dataTools.filter.fillColors')"
      >
        <TButton
          v-for="color in cellColors"
          :key="color ?? 'no-fill'"
          shape="circle"
          variant="outline"
          :theme="selected('fill', color) ? 'primary' : 'default'"
          size="small"
          :disabled="disabled"
          :aria-pressed="selected('fill', color)"
          :aria-label="t('dataTools.filter.chooseFillColor', { color: label(color) })"
          :title="t('dataTools.filter.chooseFillColor', { color: label(color) })"
          @click="choose('fill', color)"
        >
          <span
            class="filter-color-options__swatch"
            :class="{ 'is-no-fill': color === null }"
            :style="color === null ? undefined : { backgroundColor: color }"
            aria-hidden="true"
          />
        </TButton>
        <span v-if="!cellColors.length" class="filter-color-options__empty">{{
          t("dataTools.filter.noColors")
        }}</span>
      </div>
    </div>
    <div class="filter-color-options__group">
      <span class="filter-color-options__label">{{ t("dataTools.filter.fontColors") }}</span>
      <div
        class="filter-color-options__choices"
        role="group"
        :aria-label="t('dataTools.filter.fontColors')"
      >
        <TButton
          v-for="color in fontColors"
          :key="color"
          shape="circle"
          variant="outline"
          :theme="selected('text', color) ? 'primary' : 'default'"
          size="small"
          :disabled="disabled"
          :aria-pressed="selected('text', color)"
          :aria-label="t('dataTools.filter.chooseFontColor', { color: label(color) })"
          :title="t('dataTools.filter.chooseFontColor', { color: label(color) })"
          @click="choose('text', color)"
        >
          <span class="filter-color-options__font" :style="{ color }" aria-hidden="true">A</span>
        </TButton>
        <span v-if="!fontColors.length" class="filter-color-options__empty">{{
          t("dataTools.filter.noColors")
        }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.filter-color-options {
  display: grid;
  align-content: start;
  gap: var(--idea-space-6);

  &__group {
    display: grid;
    gap: var(--idea-space-3);
  }

  &__label {
    color: var(--idea-text-primary);
  }

  &__choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--idea-space-3);
  }

  &__swatch {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;

    &.is-no-fill {
      border: 1px solid var(--idea-border-control);
      background: linear-gradient(
        135deg,
        transparent 46%,
        var(--idea-status-error) 48%,
        var(--idea-status-error) 52%,
        transparent 54%
      );
    }
  }

  &__font {
    font-size: 18px;
    font-weight: var(--idea-font-weight-semibold);
    line-height: 1;
  }

  &__empty {
    align-self: center;
    color: var(--idea-text-secondary);
  }
}
</style>
