<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Rect } from "../geometry";

const props = defineProps<{
  rect: Rect;
  addressLabel: string;
  editing: boolean;
}>();

const selectionStyle = computed<CSSProperties>(() => ({
  left: `${props.rect.x}px`,
  top: `${props.rect.y}px`,
  width: `${props.rect.width}px`,
  height: `${props.rect.height}px`,
}));
</script>

<template>
  <div
    class="sheet-selection-overlay"
    :class="{ 'is-editing': editing }"
    :style="selectionStyle"
    :data-active-cell="addressLabel"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.sheet-selection-overlay {
  position: absolute;
  z-index: 2;
  border: 2px solid var(--ui-brand-primary);
  pointer-events: none;

  &.is-editing {
    border-color: transparent;
  }
}
</style>
