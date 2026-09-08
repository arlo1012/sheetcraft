<script setup lang="ts">
import { ref, nextTick } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { NUMBER_FORMAT_CATEGORY_ORDER, type NumberFormatCategory } from "../number-format/catalog";

const props = defineProps<{ modelValue: NumberFormatCategory | undefined }>();
const emit = defineEmits<{ select: [category: NumberFormatCategory] }>();
const { t } = useAppI18n();
const listRef = ref<HTMLElement>();
function onKeydown(event: KeyboardEvent): void {
  const index = NUMBER_FORMAT_CATEGORY_ORDER.indexOf(props.modelValue ?? "general");
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? NUMBER_FORMAT_CATEGORY_ORDER.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % NUMBER_FORMAT_CATEGORY_ORDER.length
          : event.key === "ArrowUp"
            ? (index - 1 + NUMBER_FORMAT_CATEGORY_ORDER.length) %
              NUMBER_FORMAT_CATEGORY_ORDER.length
            : -1;
  if (next < 0) return;
  event.preventDefault();
  const category = NUMBER_FORMAT_CATEGORY_ORDER[next]!;
  emit("select", category);
  void nextTick(() =>
    listRef.value
      ?.querySelector<HTMLButtonElement>(`[data-cell-format-number-category="${category}"]`)
      ?.focus(),
  );
}
</script>

<template>
  <div class="number-format-categories">
    <span class="number-format-categories__label">{{ t("cellFormat.category") }}</span>
    <div
      ref="listRef"
      role="listbox"
      :aria-label="t('cellFormat.category')"
      class="number-format-categories__list"
      data-cell-format-number-kind
      @keydown="onKeydown"
    >
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'general'"
        :tabindex="modelValue === 'general' || !modelValue ? 0 : -1"
        data-cell-format-number-category="general"
        @click="emit('select', 'general')"
      >
        {{ t("cellFormat.general") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'number'"
        :tabindex="modelValue === 'number' ? 0 : -1"
        data-cell-format-number-category="number"
        @click="emit('select', 'number')"
      >
        {{ t("cellFormat.numeric") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'currency'"
        :tabindex="modelValue === 'currency' ? 0 : -1"
        data-cell-format-number-category="currency"
        @click="emit('select', 'currency')"
      >
        {{ t("cellFormat.currency") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'accounting'"
        :tabindex="modelValue === 'accounting' ? 0 : -1"
        data-cell-format-number-category="accounting"
        @click="emit('select', 'accounting')"
      >
        {{ t("cellFormat.accounting") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'date'"
        :tabindex="modelValue === 'date' ? 0 : -1"
        data-cell-format-number-category="date"
        @click="emit('select', 'date')"
      >
        {{ t("cellFormat.date") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'time'"
        :tabindex="modelValue === 'time' ? 0 : -1"
        data-cell-format-number-category="time"
        @click="emit('select', 'time')"
      >
        {{ t("cellFormat.time") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'percent'"
        :tabindex="modelValue === 'percent' ? 0 : -1"
        data-cell-format-number-category="percent"
        @click="emit('select', 'percent')"
      >
        {{ t("cellFormat.percent") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'fraction'"
        :tabindex="modelValue === 'fraction' ? 0 : -1"
        data-cell-format-number-category="fraction"
        @click="emit('select', 'fraction')"
      >
        {{ t("cellFormat.fraction") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'scientific'"
        :tabindex="modelValue === 'scientific' ? 0 : -1"
        data-cell-format-number-category="scientific"
        @click="emit('select', 'scientific')"
      >
        {{ t("cellFormat.scientific") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'text'"
        :tabindex="modelValue === 'text' ? 0 : -1"
        data-cell-format-number-category="text"
        @click="emit('select', 'text')"
      >
        {{ t("cellFormat.text") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'special'"
        :tabindex="modelValue === 'special' ? 0 : -1"
        data-cell-format-number-category="special"
        @click="emit('select', 'special')"
      >
        {{ t("cellFormat.special") }}
      </button>
      <button
        type="button"
        role="option"
        :aria-selected="modelValue === 'custom'"
        :tabindex="modelValue === 'custom' ? 0 : -1"
        data-cell-format-number-category="custom"
        @click="emit('select', 'custom')"
      >
        {{ t("cellFormat.custom") }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.number-format-categories {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  font-size: 13px;

  &__label {
    color: var(--idea-text-primary);
    font-weight: 500;
    line-height: 20px;
  }
  &__list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);

    button {
      display: block;
      width: 100%;
      min-height: 28px;
      padding: 4px 8px;
      color: var(--idea-text-primary);
      background: transparent;
      border: 0;
      border-radius: var(--idea-radius-small);
      font: inherit;
      line-height: 20px;
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--idea-surface-hover);
      }
      &[aria-selected="true"] {
        background: var(--idea-surface-active);
        font-weight: 500;
      }
      &:focus-visible {
        outline: 2px solid var(--idea-action-primary);
        outline-offset: -2px;
      }
    }
  }
}
@media (max-width: 480px) {
  .number-format-categories__list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: none;
  }
}
</style>
