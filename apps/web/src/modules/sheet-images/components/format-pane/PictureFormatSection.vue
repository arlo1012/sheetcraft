<script setup lang="ts">
import { ref, useId } from "vue";
import { ChevronRight } from "lucide-vue-next";
const props = withDefaults(defineProps<{ title: string; initiallyOpen?: boolean }>(), {
  initiallyOpen: false,
});
const open = ref(props.initiallyOpen);
defineExpose({
  expand: () => {
    open.value = true;
  },
});
const contentId = `picture-format-section-${useId()}`;
</script>
<template>
  <section class="picture-format-section">
    <button
      type="button"
      class="picture-format-section__heading"
      :aria-expanded="open"
      :aria-controls="contentId"
      @click="open = !open"
    >
      <ChevronRight :size="16" :class="{ 'is-open': open }" aria-hidden="true" />
      <span :title="title">{{ title }}</span>
    </button>
    <div :id="contentId" v-show="open" class="picture-format-section__body"><slot /></div>
  </section>
</template>
<style scoped lang="scss">
.picture-format-section {
  border-bottom: 1px solid var(--sheetcraft-border-subtle);
  &__heading {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 38px;
    border: 0;
    padding: 8px 0;
    background: transparent;
    color: var(--sheetcraft-text-primary);
    text-align: left;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  &__heading:hover {
    background: var(--sheetcraft-surface-hover);
  }
  &__heading span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  &__heading svg {
    flex: none;
    transition: transform 120ms ease;
  }
  &__heading .is-open {
    transform: rotate(90deg);
  }
  &__body {
    display: grid;
    gap: 10px;
    padding: 4px 0 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .picture-format-section__heading svg {
    transition: none;
  }
}
</style>
