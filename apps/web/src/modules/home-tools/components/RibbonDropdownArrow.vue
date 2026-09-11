<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
</script>

<template>
  <ChevronDown class="ribbon-dropdown-arrow" :size="9" :stroke-width="1.5" aria-hidden="true" />
</template>

<style scoped lang="scss">
.ribbon-dropdown-arrow {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  pointer-events: none;
}
</style>
