<script setup lang="ts">
import { ref } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";

defineOptions({ inheritAttrs: false });
defineProps<{ label: string }>();
const query = defineModel<string>({ default: "" });
const emit = defineEmits<{ keydown: [event: KeyboardEvent] }>();
const inputRef = ref<InstanceType<typeof TInput> | null>(null);
defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <li class="sheetcraft-menu-search" role="presentation">
    <div class="sheetcraft-menu-search__field">
      <TInput
        v-bind="$attrs"
        ref="inputRef"
        v-model="query"
        type="search"
        clearable
        :aria-label="label"
        :placeholder="label"
        @keydown="(_value, { e }) => emit('keydown', e)"
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
  }
}
</style>
