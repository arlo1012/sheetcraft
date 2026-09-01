<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { Sheet } from "../../workbook/workbook";
import {
  resolveBorderJunctions,
  resolveVisibleBorderSegments,
  resolveVisibleDiagonalBorderSegments,
  type SheetDiagonalBorderSegment,
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
const diagonalSegments = computed(() =>
  resolveVisibleDiagonalBorderSegments(
    props.sheet,
    props.geometry,
    props.visibleRange,
    props.scrollPosition,
  ),
);

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

function getDiagonalCellStyle(segment: SheetDiagonalBorderSegment): CSSProperties {
  return {
    left: `${segment.x}px`,
    top: `${segment.y}px`,
    width: `${segment.width}px`,
    height: `${segment.height}px`,
    zIndex: segment.thickness,
  };
}

function getDiagonalLineStyle(segment: SheetDiagonalBorderSegment): CSSProperties {
  return {
    left: `${(segment.width - segment.length) / 2}px`,
    top: `${(segment.height - segment.thickness) / 2}px`,
    width: `${segment.length}px`,
    borderTop: segment.css,
    transform: `rotate(${segment.angle}deg)`,
    transformOrigin: "center",
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
      v-for="segment in diagonalSegments"
      :key="segment.key"
      class="sheet-border-layer__diagonal-cell"
      :style="getDiagonalCellStyle(segment)"
      data-sheet-diagonal-border-segment
      :data-border-direction="segment.direction"
      :data-border-row="segment.row"
      :data-border-column="segment.column"
    >
      <span class="sheet-border-layer__diagonal-line" :style="getDiagonalLineStyle(segment)" />
    </span>
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

  &__diagonal-cell {
    position: absolute;
    display: block;
    overflow: hidden;
  }

  &__diagonal-line {
    position: absolute;
    display: block;
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
