<script setup lang="ts">
import { ref } from "vue";

defineOptions({ inheritAttrs: false });
defineProps<{ label: string }>();
const query = defineModel<string>({ default: "" });
const emit = defineEmits<{ keydown: [event: KeyboardEvent] }>();
const inputRef = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <li class="idea-menu-search" role="presentation">
    <div class="idea-menu-search__field">
      <input
        v-bind="$attrs"
        ref="inputRef"
        v-model="query"
        type="search"
        :aria-label="label"
        :placeholder="label"
        @keydown="emit('keydown', $event)"
      />
    </div>
  </li>
</template>

<style scoped lang="scss">
.idea-menu-search {
  position: sticky;
  z-index: 1;
  top: 0;
  flex: 0 0 auto;
  background: var(--idea-surface-panel);
  list-style: none;

  &__field {
    padding: 0 8px 6px;

    input {
      box-sizing: border-box;
      width: 100%;
      height: 26px;
      padding: 0 8px;
      background: var(--idea-surface-canvas);
      border: 1px solid var(--idea-border-control);
      border-radius: 3px;
      color: var(--idea-text-primary);
      font: inherit;
      font-size: var(--idea-font-size-body-medium);
      line-height: var(--idea-line-height-body-medium);

      &:focus-visible {
        border-color: var(--idea-action-primary);
        box-shadow: 0 0 0 2px var(--idea-action-focus);
        outline: none;
      }
    }
  }
}
</style>
