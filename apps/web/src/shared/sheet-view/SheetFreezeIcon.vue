<script setup lang="ts">
defineProps<{ area?: "panes" | "rows" | "columns" }>();
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    style="stroke-width: var(--sheetcraft-icon-stroke-width)"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-if="area === 'rows'"
      d="M3 3h18v6H3z"
      fill="var(--sheetcraft-action-primary-subtle)"
      stroke="var(--sheetcraft-action-primary)"
    />
    <path
      v-else-if="area === 'columns'"
      d="M3 3h6v18H3z"
      fill="var(--sheetcraft-action-primary-subtle)"
      stroke="var(--sheetcraft-action-primary)"
    />
    <path
      v-else
      d="M3 3h6v6H3z"
      fill="var(--sheetcraft-action-primary-subtle)"
      stroke="var(--sheetcraft-action-primary)"
    />
    <path d="M3 3h18v18H3zM9 3v18M3 9h18" />
  </svg>
</template>
<style scoped lang="scss">
svg {
  width: var(--sheetcraft-icon-size, 15px);
  height: var(--sheetcraft-icon-size, 15px);
}
</style>
