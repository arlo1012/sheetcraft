<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Search } from "lucide-vue-next";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { CELL_FILL_PATTERNS, type CellFillPatternStyle } from "@idea10/core/style";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatPanelSelect from "./CellFormatPanelSelect.vue";

type PatternValue = CellFillPatternStyle | "none";
const props = defineProps<{
  modelValue?: PatternValue;
  backgroundColor?: string;
  patternColor?: string;
}>();
const emit = defineEmits<{ select: [value: PatternValue] }>();
const { t } = useAppI18n();
const query = ref("");
const panel = ref<HTMLElement>();
const listId = useId();
const options = computed(() => [
  { value: "none" as const, label: t("cellFormat.patternNone") },
  ...CELL_FILL_PATTERNS.map((value) => ({ value, label: t(`cellFormat.fillPatterns.${value}`) })),
]);
const filteredOptions = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return options.value.filter((option) => option.label.toLocaleLowerCase().includes(term));
});
const selectedLabel = computed(
  () =>
    options.value.find((option) => option.value === props.modelValue)?.label ?? t("format.mixed"),
);

function preview(value: PatternValue) {
  return getCellFillStyle({
    fillColor: props.backgroundColor ?? "#ffffff",
    ...(value === "none"
      ? {}
      : { fillPattern: value, fillPatternColor: props.patternColor ?? "#000000" }),
  });
}
function select(value: PatternValue, close: () => void): void {
  emit("select", value);
  close();
}
function onKeydown(event: KeyboardEvent): void {
  const buttons = [
    ...(panel.value?.querySelectorAll<HTMLButtonElement>("[data-fill-pattern]") ?? []),
  ];
  if (!buttons.length) return;
  const current = buttons.indexOf(event.target as HTMLButtonElement);
  if (current < 0 && event.key !== "ArrowDown") return;
  let next = current;
  switch (event.key) {
    case "ArrowDown":
      next = current < 0 ? 0 : current + 3;
      break;
    case "ArrowUp":
      next = current - 3;
      break;
    case "ArrowLeft":
      next = current - 1;
      break;
    case "ArrowRight":
      next = current + 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = buttons.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
  buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
}
</script>

<template>
  <CellFormatPanelSelect
    class="cell-format-pattern-control"
    :model-value="modelValue"
    :label="t('cellFormat.patternStyle')"
    :value-label="selectedLabel"
    @open-change="query = ''"
  >
    <template #value>
      <span
        v-if="modelValue && modelValue !== 'none'"
        class="cell-format-pattern-control__selected-swatch"
        :style="preview(modelValue)"
        aria-hidden="true"
      />
      <span class="cell-format-pattern-control__label">{{ selectedLabel }}</span>
    </template>
    <template #panel="{ close }">
      <div ref="panel" class="cell-format-pattern-control__panel" @keydown="onKeydown">
        <TInput
          v-model="query"
          clearable
          :aria-label="t('cellFormat.patternSearch')"
          :aria-controls="listId"
          :placeholder="t('cellFormat.patternSearch')"
        >
          <template #prefix-icon><Search :size="14" aria-hidden="true" /></template>
        </TInput>
        <div
          :id="listId"
          class="cell-format-pattern-control__options narrow-scrollbar"
          role="group"
          :aria-label="t('cellFormat.patternStyle')"
        >
          <button
            v-for="option in filteredOptions"
            :key="option.value"
            type="button"
            class="cell-format-pattern-control__option"
            :data-fill-pattern="option.value"
            :aria-label="option.label"
            :aria-pressed="modelValue === option.value"
            :title="option.label"
            @click="select(option.value, close)"
          >
            <span
              class="cell-format-pattern-control__swatch"
              :style="preview(option.value)"
              aria-hidden="true"
            />
            <span class="cell-format-pattern-control__option-label">{{ option.label }}</span>
          </button>
        </div>
        <p v-if="!filteredOptions.length" class="cell-format-pattern-control__empty" role="status">
          {{ t("cellFormat.patternNoResults") }}
        </p>
      </div>
    </template>
  </CellFormatPanelSelect>
</template>

<style scoped lang="scss">
.cell-format-pattern-control {
  min-width: 0;
  &__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__selected-swatch {
    flex: none;
    width: 40px;
    height: 18px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
  }
  &__panel {
    width: 100%;
    padding: var(--idea-tool-panel-padding);
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  &__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    max-height: 324px;
    margin-top: 8px;
    overflow-y: auto;
  }
  &__option {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: var(--idea-radius-default);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    &:hover {
      background: var(--idea-surface-hover);
    }
    &[aria-pressed="true"] {
      border-color: var(--idea-action-primary);
      background: var(--idea-surface-selected);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-focus);
      outline-offset: -2px;
    }
  }
  &__swatch {
    height: 28px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
  }
  &__option-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__empty {
    margin: 0;
    padding: 16px 0;
    text-align: center;
    color: var(--idea-text-muted);
  }
}
</style>
