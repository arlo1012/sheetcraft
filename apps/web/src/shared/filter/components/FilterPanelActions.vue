<script setup lang="ts">
import { computed } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../i18n";

const props = defineProps<{
  disabled: boolean;
  summary?: { selected: number; total: number; search?: boolean; records?: boolean };
}>();
const emit = defineEmits<{ cancel: []; apply: [] }>();
const { t } = useAppI18n();
const summaryLabel = computed(() =>
  props.summary
    ? t(
        props.summary.records
          ? "dataTools.filter.recordSummary"
          : props.summary.search
            ? "dataTools.filter.searchSelectionSummary"
            : "dataTools.filter.selectionSummary",
        { selected: props.summary.selected, total: props.summary.total },
      )
    : "",
);
</script>
<template>
  <footer class="filter-panel-actions">
    <span v-if="summaryLabel" class="filter-panel-actions__summary" role="status">{{
      summaryLabel
    }}</span>
    <slot />
    <Button theme="default" variant="base" size="small" @click="emit('cancel')">{{
      t("dataTools.filter.cancel")
    }}</Button>
    <Button theme="primary" size="small" :disabled="disabled" @click="emit('apply')">{{
      t("dataTools.filter.apply")
    }}</Button>
  </footer>
</template>
<style scoped lang="scss">
.filter-panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--idea-space-4);
  &__summary {
    min-width: 0;
    margin-right: auto;
    color: var(--idea-text-secondary);
    font-variant-numeric: tabular-nums;
  }
}
</style>
