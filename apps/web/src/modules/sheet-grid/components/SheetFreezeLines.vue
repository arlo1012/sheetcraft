<script setup lang="ts">
import type { Size } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";

defineProps<{
  layout: SheetViewportLayout;
  headerSize: Size;
}>();
</script>

<template>
  <div class="sheet-freeze-lines" aria-hidden="true">
    <div
      v-if="layout.freeze.rows > 0"
      class="sheet-freeze-lines__line sheet-freeze-lines__line--row"
      :style="{ top: `${headerSize.height + layout.frozenSize.height}px` }"
      data-freeze-line="row"
    />
    <div
      v-if="layout.freeze.columns > 0"
      class="sheet-freeze-lines__line sheet-freeze-lines__line--column"
      :style="{ left: `${headerSize.width + layout.frozenSize.width}px` }"
      data-freeze-line="column"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-freeze-lines {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;

  &__line {
    position: absolute;
    background: var(--idea-text-muted);
    opacity: 0.72;
  }

  &__line--row {
    left: 0;
    right: 0;
    height: 1px;
    transform: translateY(-0.5px);
  }

  &__line--column {
    top: 0;
    bottom: 0;
    width: 1px;
    transform: translateX(-0.5px);
  }
}
</style>
