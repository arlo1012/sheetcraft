<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ } from "lucide-vue-next";
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../i18n";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ sort: [direction: "ascending" | "descending"] }>();
const { t } = useAppI18n();
</script>
<template>
  <header class="filter-sort-bar" role="group" :aria-label="t('dataTools.sort.title')">
    <Button variant="text" size="small" :disabled="disabled" @click="emit('sort', 'ascending')">
      <template #icon><ArrowUpAZ class="idea-action-icon" /></template>
      {{ t("dataTools.sort.ascending") }}
    </Button>
    <Button variant="text" size="small" :disabled="disabled" @click="emit('sort', 'descending')">
      <template #icon><ArrowDownAZ class="idea-action-icon" /></template>
      {{ t("dataTools.sort.descending") }}
    </Button>
    <slot />
  </header>
</template>
<style scoped lang="scss">
.filter-sort-bar {
  display: flex;
  align-items: center;
  min-height: 32px;
  gap: var(--idea-space-4);
  border-bottom: 1px solid var(--idea-border-subtle);
}
</style>
