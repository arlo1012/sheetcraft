<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { NUMBER_FORMAT_CATEGORY_ORDER, type NumberFormatCategory } from "../number-format/catalog";
import CellFormatOptionList from "./CellFormatOptionList.vue";

defineProps<{ modelValue: NumberFormatCategory | undefined }>();
const emit = defineEmits<{ select: [category: NumberFormatCategory] }>();
const { t } = useAppI18n();
const categoryLabels: Record<NumberFormatCategory, MessageKey> = {
  general: "cellFormat.general",
  number: "cellFormat.numeric",
  currency: "cellFormat.currency",
  accounting: "cellFormat.accounting",
  date: "cellFormat.date",
  time: "cellFormat.time",
  percent: "cellFormat.percent",
  fraction: "cellFormat.fraction",
  scientific: "cellFormat.scientific",
  text: "cellFormat.text",
  special: "cellFormat.special",
  custom: "cellFormat.custom",
};
const options = computed(() =>
  NUMBER_FORMAT_CATEGORY_ORDER.map((code) => ({ code, label: t(categoryLabels[code]) })),
);
</script>

<template>
  <div class="number-format-categories">
    <h3 class="number-format-categories__label">{{ t("cellFormat.category") }}</h3>
    <CellFormatOptionList
      class="number-format-categories__list"
      :model-value="modelValue"
      :options="options"
      :label="t('cellFormat.category')"
      variant="navigation"
      item-data-attribute="data-cell-format-number-category"
      data-cell-format-number-kind
      @select="emit('select', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.number-format-categories {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

  &__label {
    margin: 0;
    color: var(--idea-text-primary);
    font-size: inherit;
    font-weight: var(--idea-font-weight-semibold);
    line-height: var(--idea-line-height-body-medium);
  }
  &__list {
    flex: 1;
    min-height: 0;
  }
}
@media (max-width: 480px) {
  .number-format-categories__list {
    flex: none;
  }
}
</style>
