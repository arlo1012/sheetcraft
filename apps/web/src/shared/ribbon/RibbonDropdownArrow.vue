<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false });
</script>

<template>
  <ChevronDown
    class="ribbon-dropdown-arrow"
    :class="{ 'is-expanded': expanded }"
    :size="9"
    :stroke-width="1.5"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.ribbon-dropdown-arrow {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  pointer-events: none;
  transition: transform 120ms ease;

  &.is-expanded {
    transform: rotate(180deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ribbon-dropdown-arrow {
    transition: none;
  }
}
</style>
