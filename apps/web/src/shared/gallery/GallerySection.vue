<script setup lang="ts">
import type { VNode } from "vue";

withDefaults(
  defineProps<{
    title?: string;
    inline?: boolean;
    scrollable?: boolean;
    /** Keep group titles when the child gallery already owns its content inset. */
    contentInset?: boolean;
  }>(),
  { contentInset: true },
);
defineSlots<{ default(): VNode[]; actions?(): VNode[] }>();
</script>

<template>
  <slot v-if="inline" />
  <section
    v-else
    class="idea-gallery-section"
    :class="{
      'idea-gallery-section--scrollable': scrollable,
      'idea-gallery-section--content-inset': contentInset,
    }"
    :aria-label="title"
  >
    <div v-if="title || $slots.actions" class="idea-gallery-section__header">
      <h3 v-if="title" class="idea-gallery-section__title">{{ title }}</h3>
      <slot name="actions" />
    </div>
    <div class="idea-gallery-section__content"><slot /></div>
  </section>
</template>

<style scoped lang="scss">
@use "../option-list/option-list";

.idea-gallery-section {
  min-width: 0;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sheetcraft-space-2);
    padding: var(--sheetcraft-space-1) var(--sheetcraft-space-5);
    background: var(--sheetcraft-surface-secondary);
    color: var(--sheetcraft-text-secondary);
  }

  &__title {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-small);
    font-weight: var(--sheetcraft-font-weight-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }

  &--content-inset &__content {
    padding: var(--sheetcraft-space-3) var(--sheetcraft-tool-panel-padding);
  }

  &--scrollable {
    display: flex;
    min-height: 0;
    flex-direction: column;

    .idea-gallery-section__header {
      flex: none;
    }

    .idea-gallery-section__content {
      @include option-list.scrollbar;

      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
}
</style>
