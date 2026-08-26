<script setup lang="ts">
import SpreadsheetWorkspace from "./SpreadsheetWorkspace.vue";
</script>

<template>
  <main data-app-root aria-label="idea10 workspace" class="app-workspace">
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
