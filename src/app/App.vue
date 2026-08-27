<script setup lang="ts">
import { useAppI18n } from "../shared/i18n";
import SpreadsheetWorkspace from "./SpreadsheetWorkspace.vue";

const { t } = useAppI18n();
</script>

<template>
  <main data-app-root :aria-label="t('app.workspace')" class="app-workspace">
    <SpreadsheetWorkspace />
  </main>
</template>

<style scoped lang="scss">
.app-workspace {
  width: 100%;
  min-height: 100dvh;
  background: var(--ui-surface-canvas);
  color: var(--ui-text-primary);
  isolation: isolate;
}
</style>
