<script setup lang="ts">
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../i18n";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ cancel: []; apply: [] }>();
const { t } = useAppI18n();
</script>
<template>
  <footer class="filter-panel-actions">
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
}
</style>
