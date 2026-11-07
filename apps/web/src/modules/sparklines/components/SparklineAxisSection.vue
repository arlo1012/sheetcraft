<script setup lang="ts">
defineProps<{ label: string }>();
</script>
<template>
  <li class="axis-section" role="none">
    <div class="axis-section__label" aria-hidden="true">{{ label }}</div>
    <ul role="group" :aria-label="label">
      <slot />
    </ul>
  </li>
</template>
<style scoped lang="scss">
.axis-section {
  &__label {
    padding: 6px var(--sheetcraft-tool-panel-padding);
    color: var(--sheetcraft-text-secondary);
    font-weight: var(--sheetcraft-font-weight-medium);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
}
</style>
