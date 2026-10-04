<script setup lang="ts">
import type { VNode } from "vue";

defineProps<{ title?: string; inline?: boolean }>();
defineSlots<{ default(): VNode[] }>();
</script>

<template>
  <slot v-if="inline" />
  <section v-else class="idea-gallery-section" :aria-label="title">
    <h3 v-if="title" class="idea-gallery-section__title">{{ title }}</h3>
    <div class="idea-gallery-section__content"><slot /></div>
  </section>
</template>

<style scoped lang="scss">
.idea-gallery-section {
  min-width: 0;

  &__title {
    margin: 0;
    padding: var(--idea-space-1) var(--idea-space-5);
    background: var(--idea-surface-secondary);
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
  }

  &__content {
    padding: var(--idea-space-3) var(--idea-tool-panel-padding);
  }
}
</style>
