<script setup lang="ts">
import { computed } from "vue";
import type { CellBorder } from "@sheetcraft/core/style";
import type { SelectionBorderState } from "@sheetcraft/core/style-state";
import { getBorderLinePresentation } from "../../../shared/borders/borderPresentation";

const props = defineProps<{
  side: keyof SelectionBorderState;
  border: CellBorder | undefined;
  mixed: boolean;
  label: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();
function toggle(): void {
  if (!props.disabled) emit("toggle");
}

const coordinates: Record<keyof SelectionBorderState, [number, number, number, number]> = {
  top: [18, 18, 282, 18],
  right: [282, 18, 282, 182],
  bottom: [18, 182, 282, 182],
  left: [18, 18, 18, 182],
  innerHorizontal: [18, 100, 282, 100],
  innerVertical: [150, 18, 150, 182],
  diagonalUp: [18, 182, 282, 18],
  diagonalDown: [18, 18, 282, 182],
};
const points = computed(() => coordinates[props.side]);
const presentation = computed(() => getBorderLinePresentation(props.border?.style ?? "dotted"));
const normal = computed(() => {
  const [x1, y1, x2, y2] = points.value;
  const length = Math.hypot(x2 - x1, y2 - y1);
  return { x: -(y2 - y1) / length, y: (x2 - x1) / length };
});
</script>

<template>
  <g
    class="cell-format-border-preview-edge"
    :class="{ 'is-mixed': mixed }"
    :data-border-preview-edge="side"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    :aria-label="label"
    :aria-pressed="mixed ? 'mixed' : Boolean(border)"
    @click="toggle"
    @keydown.enter.prevent.stop="toggle"
    @keydown.space.prevent.stop="toggle"
  >
    <line
      v-if="!disabled"
      class="cell-format-border-preview-edge__hit"
      :x1="points[0]"
      :y1="points[1]"
      :x2="points[2]"
      :y2="points[3]"
      stroke="transparent"
      stroke-width="14"
      vector-effect="non-scaling-stroke"
    />
    <template v-if="!disabled && (border || mixed)">
      <line
        v-for="offset in presentation.offsets"
        :key="offset"
        class="cell-format-border-preview-edge__line"
        :x1="points[0] + normal.x * offset"
        :y1="points[1] + normal.y * offset"
        :x2="points[2] + normal.x * offset"
        :y2="points[3] + normal.y * offset"
        :stroke="border?.color ?? 'var(--sheetcraft-text-muted)'"
        :stroke-width="presentation.strokeWidth"
        :stroke-dasharray="presentation.dashArray"
        :stroke-linecap="presentation.lineCap"
        vector-effect="non-scaling-stroke"
      />
    </template>
  </g>
</template>

<style scoped lang="scss">
.cell-format-border-preview-edge {
  cursor: pointer;
  outline: none;

  &__hit {
    pointer-events: stroke;
  }
  &__line {
    pointer-events: none;
  }
  &.is-mixed &__line {
    opacity: 0.55;
  }
  &:hover &__hit,
  &:focus-visible &__hit {
    stroke: var(--sheetcraft-surface-hover);
  }
  &:focus-visible &__hit {
    stroke: var(--sheetcraft-action-focus);
  }
}
</style>
