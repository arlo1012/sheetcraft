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
const diagonalLayers = computed(() => {
  const layers = new Map<number, SheetDiagonalBorderSegment[]>();
  for (const segment of diagonalSegments.value) {
    const layer = layers.get(segment.thickness) ?? [];
    layer.push(segment);
    layers.set(segment.thickness, layer);
  }
  return [...layers]
    .sort(([leftThickness], [rightThickness]) => leftThickness - rightThickness)
    .map(([thickness, segments]) => ({ thickness, segments }));
});

type DiagonalLinePart = {
  key: string;
  offset: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const DIAGONAL_STROKE_DASH_ARRAY: Partial<Record<SheetDiagonalBorderSegment["style"], string>> = {
  dashed: "6 3",
  dotted: "0 2",
};
const DIAGONAL_PIXEL_ALIGNMENT_OFFSET = -0.5;

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

function getDiagonalLineParts(segment: SheetDiagonalBorderSegment): DiagonalLinePart[] {
  const x1 = segment.x + DIAGONAL_PIXEL_ALIGNMENT_OFFSET;
  const x2 = segment.x + segment.width + DIAGONAL_PIXEL_ALIGNMENT_OFFSET;
  const y1 =
    (segment.direction === "up" ? segment.y + segment.height : segment.y) +
    DIAGONAL_PIXEL_ALIGNMENT_OFFSET;
  const y2 =
    (segment.direction === "up" ? segment.y : segment.y + segment.height) +
    DIAGONAL_PIXEL_ALIGNMENT_OFFSET;
  const normalX = -(y2 - y1) / segment.length;
  const normalY = (x2 - x1) / segment.length;
  const offsets = segment.style === "double" ? [-1, 1] : [0];

  return offsets.map((offset) => ({
    key: `${segment.key}:${offset}`,
    offset,
    x1: x1 + normalX * offset,
    y1: y1 + normalY * offset,
    x2: x2 + normalX * offset,
    y2: y2 + normalY * offset,
  }));
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
    <svg
      v-for="layer in diagonalLayers"
      :key="`diagonal-layer:${layer.thickness}`"
      class="sheet-border-layer__diagonals"
      :style="{ zIndex: layer.thickness }"
      focusable="false"
      data-sheet-diagonal-border-layer
      :data-border-thickness="layer.thickness"
    >
      <g
        v-for="segment in layer.segments"
        :key="segment.key"
        data-sheet-diagonal-border-segment
        :data-border-direction="segment.direction"
        :data-border-row="segment.row"
        :data-border-column="segment.column"
        :data-border-style="segment.style"
      >
        <line
          v-for="part in getDiagonalLineParts(segment)"
          :key="part.key"
          class="sheet-border-layer__diagonal-line"
          :x1="part.x1"
          :y1="part.y1"
          :x2="part.x2"
          :y2="part.y2"
          :stroke="segment.color"
          :stroke-width="segment.style === 'double' ? 1 : segment.thickness"
          :stroke-dasharray="DIAGONAL_STROKE_DASH_ARRAY[segment.style]"
          :stroke-linecap="segment.style === 'dotted' ? 'round' : 'butt'"
          :data-diagonal-line-offset="part.offset"
        />
      </g>
    </svg>
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

  &__diagonals {
    position: absolute;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    inset: 0;
  }

  &__diagonal-line {
    fill: none;
  }

  &__junction {
    position: absolute;
    z-index: 4;
    width: 1px;
    height: 1px;
  }
}
</style>
