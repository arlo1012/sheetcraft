<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Rect } from "@idea10/sheet-engine/geometry";

const props = defineProps<{
  activeRect: Rect;
  rangeRect: Rect;
  rangeOutlineRect: Rect;
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

function getOutlineStyle(rect: Rect): CSSProperties {
  return { ...getRectStyle(rect), borderWidth: "1px" };
}

const rangeStyle = computed<CSSProperties>(() => getRectStyle(props.rangeRect));
const rangeOutlineStyle = computed<CSSProperties>(() => getOutlineStyle(props.rangeOutlineRect));
const activeStyle = computed<CSSProperties>(() => getOutlineStyle(props.activeRect));
const clipboardStyle = computed<CSSProperties | undefined>(() =>
  props.clipboardRect ? { ...getRectStyle(props.clipboardRect), borderWidth: "2px" } : undefined,
);
</script>

<template>
  <div
    class="sheet-selection-overlay__range-fill"
    :class="{ 'is-editing': editing }"
    :style="rangeStyle"
    data-selection-range
    aria-hidden="true"
  />
  <div
    class="sheet-selection-overlay__range-outline"
    :class="{ 'is-editing': editing }"
    :style="rangeOutlineStyle"
    data-selection-outline
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
  &__range-fill,
  &__range-outline,
  &__active,
  &__clipboard {
    position: absolute;
    pointer-events: none;
  }

  &__range-fill {
    z-index: 1;
    background: color-mix(in srgb, var(--idea-action-primary) 8%, transparent);

    &.is-editing {
      background: transparent;
    }
  }

  &__range-outline {
    z-index: 4;
    border-style: solid;
    border-color: var(--idea-action-primary);

    &.is-editing {
      border-color: transparent;
    }
  }

  &__active {
    z-index: 4;
    border-style: solid;
    border-color: var(--idea-action-primary);

    &.is-editing {
      border-color: transparent;
    }
  }

  &__clipboard {
    z-index: 6;
    border-style: dashed;
    border-color: var(--idea-action-primary);
  }
}
</style>
