<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Sheet } from "../../workbook/workbook";
import {
  resolveBorderJunctions,
  resolveVisibleBorderSegments,
  type SheetBorderJunction,
  type SheetBorderSegment,
} from "../border-presentation";
import type { Point, SheetGeometry, VisibleCellRange } from "../geometry";

const props = defineProps<{
  sheet: Sheet;
  geometry: SheetGeometry;
  visibleRange: VisibleCellRange;
  scrollPosition: Point;
}>();

const segments = computed(() =>
  resolveVisibleBorderSegments(
    props.sheet,
    props.geometry,
    props.visibleRange,
    props.scrollPosition,
  ),
);
const junctions = computed(() => resolveBorderJunctions(segments.value));

function getSegmentStyle(segment: SheetBorderSegment): CSSProperties {
  if (segment.orientation === "horizontal") {
    return {
      left: `${segment.x}px`,
      top: `${segment.y}px`,
      width: `${segment.length}px`,
      borderTop: segment.css,
      zIndex: segment.thickness,
    };
  }
  return {
    left: `${segment.x}px`,
    top: `${segment.y}px`,
    height: `${segment.length}px`,
    borderLeft: segment.css,
    zIndex: segment.thickness,
  };
}

function getJunctionStyle(junction: SheetBorderJunction): CSSProperties {
  return {
    left: `${junction.x}px`,
    top: `${junction.y}px`,
    backgroundColor: junction.color,
  };
}
</script>

<template>
  <div class="sheet-border-layer" data-sheet-border-layer aria-hidden="true">
    <span
      v-for="segment in segments"
      :key="segment.key"
      class="sheet-border-layer__segment"
      :class="`is-${segment.orientation}`"
      :style="getSegmentStyle(segment)"
      data-sheet-border-segment
      :data-border-orientation="segment.orientation"
      :data-border-placement="segment.placement"
      :data-border-edge="segment.edge"
      :data-border-start="segment.start"
      :data-border-end="segment.end"
    />
    <span
      v-for="junction in junctions"
      :key="junction.key"
      class="sheet-border-layer__junction"
      :style="getJunctionStyle(junction)"
      data-sheet-border-junction
      :data-border-row-edge="junction.rowEdge"
      :data-border-column-edge="junction.columnEdge"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-border-layer {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;

  &__segment {
    position: absolute;
    display: block;
    box-sizing: content-box;
    width: 0;
    height: 0;
  }

  &__junction {
    position: absolute;
    z-index: 4;
    width: 1px;
    height: 1px;
  }
}
</style>
