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
    gap: var(--idea-space-2);
    padding: var(--idea-space-1) var(--idea-space-5);
    background: var(--idea-surface-secondary);
    color: var(--idea-text-secondary);
  }

  &__title {
    margin: 0;
    font-size: var(--idea-font-size-body-small);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
  }

  &--content-inset &__content {
    padding: var(--idea-space-3) var(--idea-tool-panel-padding);
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
