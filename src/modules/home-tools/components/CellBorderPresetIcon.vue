<script setup lang="ts">
import { computed } from "vue";
import type { CellBorderAction } from "../../workbook/cell-style";

const props = defineProps<{ preset: CellBorderAction["preset"] }>();

const hasOuter = computed(() => props.preset === "all" || props.preset === "outer");
const hasInnerHorizontal = computed(() =>
  ["all", "inner", "innerHorizontal"].includes(props.preset),
);
const hasInnerVertical = computed(() => ["all", "inner", "innerVertical"].includes(props.preset));
</script>

<template>
  <span class="cell-border-preset-icon" :data-border-preset-icon="preset" aria-hidden="true">
    <span class="cell-border-preset-icon__guide is-horizontal is-first" />
    <span class="cell-border-preset-icon__guide is-horizontal is-second" />
    <span class="cell-border-preset-icon__guide is-vertical is-first" />
    <span class="cell-border-preset-icon__guide is-vertical is-second" />

    <span v-if="hasOuter || preset === 'top'" class="cell-border-preset-icon__line is-top" />
    <span v-if="hasOuter || preset === 'right'" class="cell-border-preset-icon__line is-right" />
    <span v-if="hasOuter || preset === 'bottom'" class="cell-border-preset-icon__line is-bottom" />
    <span v-if="hasOuter || preset === 'left'" class="cell-border-preset-icon__line is-left" />

    <template v-if="hasInnerHorizontal">
      <span class="cell-border-preset-icon__line is-horizontal is-first" />
      <span class="cell-border-preset-icon__line is-horizontal is-second" />
    </template>
    <template v-if="hasInnerVertical">
      <span class="cell-border-preset-icon__line is-vertical is-first" />
      <span class="cell-border-preset-icon__line is-vertical is-second" />
    </template>
    <span v-if="preset === 'none'" class="cell-border-preset-icon__slash" />
  </span>
</template>

<style scoped lang="scss">
.cell-border-preset-icon {
  position: relative;
  display: block;
  width: 18px;
  height: 18px;

  &__guide,
  &__line,
  &__slash {
    position: absolute;
    display: block;
    pointer-events: none;
  }

  &__guide {
    background: var(--td-border-level-1-color);

    &.is-horizontal {
      right: 0;
      left: 0;
      height: 1px;
    }

    &.is-vertical {
      top: 0;
      bottom: 0;
      width: 1px;
    }

    &.is-first.is-horizontal {
      top: 6px;
    }

    &.is-second.is-horizontal {
      top: 12px;
    }

    &.is-first.is-vertical {
      left: 6px;
    }

    &.is-second.is-vertical {
      left: 12px;
    }
  }

  &__line {
    z-index: 1;
    background: currentcolor;

    &.is-top,
    &.is-bottom,
    &.is-horizontal {
      right: 0;
      left: 0;
      height: 1px;
    }

    &.is-left,
    &.is-right,
    &.is-vertical {
      top: 0;
      bottom: 0;
      width: 1px;
    }

    &.is-top {
      top: 0;
    }

    &.is-right {
      right: 0;
    }

    &.is-bottom {
      bottom: 0;
    }

    &.is-left {
      left: 0;
    }

    &.is-first.is-horizontal {
      top: 6px;
    }

    &.is-second.is-horizontal {
      top: 12px;
    }

    &.is-first.is-vertical {
      left: 6px;
    }

    &.is-second.is-vertical {
      left: 12px;
    }
  }

  &__slash {
    z-index: 2;
    top: 8px;
    left: -2px;
    width: 22px;
    height: 1px;
    background: var(--td-text-color-placeholder);
    transform: rotate(-45deg);
    transform-origin: center;
  }
}
</style>
