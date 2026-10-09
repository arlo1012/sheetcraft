<script setup lang="ts">
import { computed } from "vue";
import type { CellBorderAction } from "@sheetcraft/core/style";

const props = defineProps<{ preset: CellBorderAction["preset"] }>();

const hasOuter = computed(() => props.preset === "all" || props.preset === "outer");
const hasInnerHorizontal = computed(() =>
  ["all", "inner", "innerHorizontal"].includes(props.preset),
);
const hasInnerVertical = computed(() => ["all", "inner", "innerVertical"].includes(props.preset));
</script>

<template>
  <svg
    class="cell-border-preset-icon"
    :data-border-preset-icon="preset"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path class="cell-border-preset-icon__guide is-top" d="M3 3h18" />
    <path class="cell-border-preset-icon__guide is-right" d="M21 3v18" />
    <path class="cell-border-preset-icon__guide is-bottom" d="M3 21h18" />
    <path class="cell-border-preset-icon__guide is-left" d="M3 3v18" />
    <path class="cell-border-preset-icon__guide is-horizontal" d="M3 12h18" />
    <path class="cell-border-preset-icon__guide is-vertical" d="M12 3v18" />
    <path
      v-if="hasOuter || preset === 'top'"
      class="cell-border-preset-icon__line is-top"
      d="M3 3h18"
    />
    <path
      v-if="hasOuter || preset === 'right'"
      class="cell-border-preset-icon__line is-right"
      d="M21 3v18"
    />
    <path
      v-if="hasOuter || preset === 'bottom'"
      class="cell-border-preset-icon__line is-bottom"
      d="M3 21h18"
    />
    <path
      v-if="hasOuter || preset === 'left'"
      class="cell-border-preset-icon__line is-left"
      d="M3 3v18"
    />
    <path
      v-if="hasInnerHorizontal"
      class="cell-border-preset-icon__line is-horizontal"
      d="M3 12h18"
    />
    <path v-if="hasInnerVertical" class="cell-border-preset-icon__line is-vertical" d="M12 3v18" />
    <path
      v-if="preset === 'diagonalUp'"
      class="cell-border-preset-icon__diagonal is-up"
      d="m3 21 18-18"
    />
    <path
      v-if="preset === 'diagonalDown'"
      class="cell-border-preset-icon__diagonal is-down"
      d="m3 3 18 18"
    />
  </svg>
</template>

<style scoped lang="scss">
.cell-border-preset-icon {
  display: block;
  width: var(--sheetcraft-icon-size, 18px);
  height: var(--sheetcraft-icon-size, 18px);
  stroke-width: var(--sheetcraft-icon-stroke-width);
  stroke-linecap: square;

  &__guide {
    stroke-width: 1;
    stroke-dasharray: 2 2;
    opacity: 0.45;
  }
}
</style>
