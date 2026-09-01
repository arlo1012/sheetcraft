<script setup lang="ts">
import { computed } from "vue";
import type { CellBorderAction } from "@idea10/core/style";

const props = defineProps<{ preset: CellBorderAction["preset"] }>();

const hasOuter = computed(() => props.preset === "all" || props.preset === "outer");
const hasInnerHorizontal = computed(() =>
  ["all", "inner", "innerHorizontal"].includes(props.preset),
);
const hasInnerVertical = computed(() => ["all", "inner", "innerVertical"].includes(props.preset));
</script>

<template>
  <span class="cell-border-preset-icon" :data-border-preset-icon="preset" aria-hidden="true">
    <span class="cell-border-preset-icon__guide is-top" />
    <span class="cell-border-preset-icon__guide is-right" />
    <span class="cell-border-preset-icon__guide is-bottom" />
    <span class="cell-border-preset-icon__guide is-left" />
    <span class="cell-border-preset-icon__guide is-horizontal" />
    <span class="cell-border-preset-icon__guide is-vertical" />

    <span v-if="hasOuter || preset === 'top'" class="cell-border-preset-icon__line is-top" />
    <span v-if="hasOuter || preset === 'right'" class="cell-border-preset-icon__line is-right" />
    <span v-if="hasOuter || preset === 'bottom'" class="cell-border-preset-icon__line is-bottom" />
    <span v-if="hasOuter || preset === 'left'" class="cell-border-preset-icon__line is-left" />

    <template v-if="hasInnerHorizontal">
      <span class="cell-border-preset-icon__line is-horizontal" />
    </template>
    <template v-if="hasInnerVertical">
      <span class="cell-border-preset-icon__line is-vertical" />
    </template>
    <span v-if="preset === 'diagonalUp'" class="cell-border-preset-icon__diagonal is-up" />
    <span v-if="preset === 'diagonalDown'" class="cell-border-preset-icon__diagonal is-down" />
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
  &__diagonal {
    position: absolute;
    display: block;
    pointer-events: none;
  }

  &__guide {
    background: var(--td-border-level-1-color);

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

    &.is-horizontal {
      top: 9px;
    }

    &.is-vertical {
      left: 9px;
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

    &.is-horizontal {
      top: 9px;
    }

    &.is-vertical {
      left: 9px;
    }
  }

  &__diagonal {
    z-index: 2;
    top: 50%;
    left: 50%;
    width: 22.6274px;
    height: 1px;
    background: currentcolor;
    transform-origin: center;

    &.is-up {
      transform: translate(-50%, -50%) rotate(-45deg);
    }

    &.is-down {
      transform: translate(-50%, -50%) rotate(45deg);
    }
  }
}
</style>
