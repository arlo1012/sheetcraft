<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { Radio as TRadio } from "tdesign-vue-next/es/radio";
import MenuItem from "./MenuItem.vue";

defineOptions({ inheritAttrs: false });
defineProps<{ checked: boolean; disabled?: boolean; indicator?: "radio" | "check" | "none" }>();
const emit = defineEmits<{ select: [event: MouseEvent | KeyboardEvent] }>();
defineSlots<{ default(): unknown; shortcut?(): unknown }>();
</script>

<template>
  <MenuItem
    v-bind="$attrs"
    role="menuitemradio"
    :class="{ 'idea-menu-radio-text-selected': indicator === 'none' && checked }"
    :aria-checked="checked"
    :disabled="disabled"
    @select="emit('select', $event)"
  >
    <template v-if="indicator !== 'none'" #icon>
      <!-- The menu row owns focus and activation; the radio supplies its visual state. -->
      <Check v-if="indicator === 'check' && checked" />
      <span v-else-if="indicator !== 'check'" class="idea-menu-radio" inert>
        <TRadio class="idea-menu-radio__control" :checked="checked" :disabled="disabled" readonly />
      </span>
    </template>
    <slot />
    <template v-if="$slots.shortcut" #shortcut><slot name="shortcut" /></template>
  </MenuItem>
</template>

<style scoped lang="scss">
.idea-menu-radio-text-selected {
  color: var(--idea-action-primary);
}

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
