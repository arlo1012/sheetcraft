<script setup lang="ts">
import { computed } from "vue";
import { Check } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { SheetFilterCondition } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

type ColorCondition = Extract<SheetFilterCondition, { kind: "color" | "color-set" }>;

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
const emit = defineEmits<{ "update:modelValue": [condition: ColorCondition | undefined] }>();
const { t } = useAppI18n();

const cellColors = computed(() => [...new Set(props.colors.cellColors)]);
const fontColors = computed(() => [...new Set(props.colors.fontColors)]);

function label(color: string | null): string {
  return color === null ? t("dataTools.filter.noFillColor") : color.toUpperCase();
}

function selected(target: ColorCondition["target"], color: string | null): boolean {
  const condition = props.modelValue;
  return (
    condition?.target === target &&
    (condition.kind === "color" ? condition.color === color : condition.colors.includes(color))
  );
}

function choose(target: ColorCondition["target"], color: string | null): void {
  if (props.disabled) return;
  const condition = props.modelValue;
  const current =
    condition?.target === target
      ? condition.kind === "color"
        ? [condition.color]
        : condition.colors
      : [];
  const colors = current.includes(color)
    ? current.filter((value) => value !== color)
    : [...current, color];
  emit(
    "update:modelValue",
    colors.length === 0
      ? undefined
      : colors.length === 1
        ? { kind: "color", target, color: colors[0]! }
        : { kind: "color-set", target, colors },
  );
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
        <span
          v-for="color in cellColors"
          :key="color ?? 'no-fill'"
          class="filter-color-options__choice"
        >
          <TButton
            class="filter-color-options__button"
            shape="circle"
            variant="text"
            theme="default"
            size="medium"
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
          <span
            v-if="selected('fill', color)"
            class="filter-color-options__check"
            aria-hidden="true"
          >
            <Check />
          </span>
        </span>
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
        <span v-for="color in fontColors" :key="color" class="filter-color-options__choice">
          <TButton
            class="filter-color-options__button"
            shape="circle"
            variant="text"
            theme="default"
            size="medium"
            :disabled="disabled"
            :aria-pressed="selected('text', color)"
            :aria-label="t('dataTools.filter.chooseFontColor', { color: label(color) })"
            :title="t('dataTools.filter.chooseFontColor', { color: label(color) })"
            @click="choose('text', color)"
          >
            <span class="filter-color-options__font" :style="{ color }" aria-hidden="true">A</span>
          </TButton>
          <span
            v-if="selected('text', color)"
            class="filter-color-options__check"
            aria-hidden="true"
          >
            <Check />
          </span>
        </span>
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
  gap: var(--sheetcraft-space-5);

  &__group {
    display: grid;
    gap: var(--sheetcraft-space-3);
  }

  &__label {
    color: var(--sheetcraft-text-primary);
  }

  &__choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sheetcraft-space-4);
    padding: 0 var(--sheetcraft-space-2) var(--sheetcraft-space-2);
  }

  &__choice {
    position: relative;
    width: 24px;
    height: 24px;
    flex: none;
  }

  &__button {
    width: 24px;
    height: 24px;
  }

  &__swatch,
  &__font {
    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: 50%;
  }

  &__swatch {
    display: block;

    &.is-no-fill {
      background: linear-gradient(
        135deg,
        transparent 46%,
        var(--sheetcraft-border-control) 48%,
        var(--sheetcraft-border-control) 52%,
        transparent 54%
      );
    }
  }

  &__font {
    display: grid;
    place-items: center;
    background: var(--sheetcraft-surface-panel);
    font-size: 18px;
    font-weight: var(--sheetcraft-font-weight-semibold);
    line-height: 1;
  }

  &__check {
    position: absolute;
    right: -2px;
    bottom: -2px;
    z-index: 1;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 1px solid var(--sheetcraft-surface-panel);
    border-radius: 50%;
    color: var(--sheetcraft-text-inverse);
    background: var(--sheetcraft-status-success);
    pointer-events: none;

    svg {
      width: 10px;
      height: 10px;
      stroke-width: 3;
    }
  }

  &__empty {
    align-self: center;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
