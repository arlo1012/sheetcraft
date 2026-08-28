<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Rect } from "../geometry";

const props = defineProps<{
  activeRect: Rect;
  rangeRect: Rect;
  addressLabel: string;
  editing: boolean;
  clipboardRect?: Rect | null;
  clipboardMode?: "copy" | "cut" | null;
}>();

function getRectStyle(rect: Rect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

const rangeStyle = computed<CSSProperties>(() => getRectStyle(props.rangeRect));
const activeStyle = computed<CSSProperties>(() => getRectStyle(props.activeRect));
const clipboardStyle = computed<CSSProperties | undefined>(() =>
  props.clipboardRect ? getRectStyle(props.clipboardRect) : undefined,
);
</script>

<template>
  <div
    class="sheet-selection-overlay__range"
    :class="{ 'is-editing': editing }"
    :style="rangeStyle"
    data-selection-range
    aria-hidden="true"
  />
  <div
    class="sheet-selection-overlay__active"
    :class="{ 'is-editing': editing }"
    :style="activeStyle"
    :data-active-cell="addressLabel"
    aria-hidden="true"
  />
  <div
    v-if="clipboardRect"
    class="sheet-selection-overlay__clipboard"
    :class="`is-${clipboardMode}`"
    :style="clipboardStyle"
    data-clipboard-range
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.sheet-selection-overlay {
  &__range,
  &__active,
  &__clipboard {
    position: absolute;
    pointer-events: none;
  }

  &__range {
    z-index: 2;
    background: color-mix(in srgb, var(--td-brand-color) 8%, transparent);
    border: 2px solid var(--td-brand-color);

    &.is-editing {
      background: transparent;
      border-color: transparent;
    }
  }

  &__active {
    z-index: 3;
    border: 2px solid var(--td-brand-color);

    &.is-editing {
      border-color: transparent;
    }
  }

  &__clipboard {
    z-index: 4;
    border: 1px dashed var(--td-brand-color);

    &.is-cut {
      border-width: 2px;
    }
  }
}
</style>
