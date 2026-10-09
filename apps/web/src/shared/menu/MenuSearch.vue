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
  <li class="sheetcraft-menu-search" role="presentation">
    <div class="sheetcraft-menu-search__field">
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
.sheetcraft-menu-search {
  position: sticky;
  z-index: 1;
  top: 0;
  flex: 0 0 auto;
  background: var(--sheetcraft-surface-panel);
  list-style: none;

  // Cover the menu's top inset while options scroll behind the sticky search.
  &::before {
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: var(--sheetcraft-space-4);
    background: var(--sheetcraft-surface-panel);
    content: "";
    pointer-events: none;
  }

  &__field {
    padding: 0 8px 6px;

    input {
      box-sizing: border-box;
      width: 100%;
      height: 26px;
      padding: 0 8px;
      background: var(--sheetcraft-surface-canvas);
      border: 1px solid var(--sheetcraft-border-control);
      border-radius: 3px;
      color: var(--sheetcraft-text-primary);
      font: inherit;
      font-size: var(--sheetcraft-font-size-body-medium);
      line-height: var(--sheetcraft-line-height-body-medium);

      &:focus-visible {
        border-color: var(--sheetcraft-action-primary);
        box-shadow: 0 0 0 2px var(--sheetcraft-action-focus);
        outline: none;
      }
    }
  }
}
</style>
