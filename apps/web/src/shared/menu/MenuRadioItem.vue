<script setup lang="ts">
import { Radio as TRadio } from "tdesign-vue-next/es/radio";
import MenuItem from "./MenuItem.vue";

defineOptions({ inheritAttrs: false });
defineProps<{ checked: boolean; disabled?: boolean }>();
const emit = defineEmits<{ select: [event: MouseEvent | KeyboardEvent] }>();
defineSlots<{ default(): unknown; shortcut?(): unknown }>();
</script>

<template>
  <MenuItem
    v-bind="$attrs"
    role="menuitemradio"
    :aria-checked="checked"
    :disabled="disabled"
    @select="emit('select', $event)"
  >
    <template #icon>
      <!-- The menu row owns focus and activation; the radio supplies its visual state. -->
      <span class="idea-menu-radio" inert>
        <TRadio class="idea-menu-radio__control" :checked="checked" :disabled="disabled" readonly />
      </span>
    </template>
    <slot />
    <template v-if="$slots.shortcut" #shortcut><slot name="shortcut" /></template>
  </MenuItem>
</template>

<style scoped lang="scss">
.idea-menu-radio {
  display: flex;
  align-items: center;

  &__control {
    --td-comp-margin-s: 0px;
    display: inline-flex;
    align-items: center;
  }
}
</style>
