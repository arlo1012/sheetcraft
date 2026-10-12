<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getDrawingShapeGeometry,
  getStandardShapeSvgPaths,
  standardShapeFillColor,
  standardShapeSvgTransform,
  standardShapeFlipPoint,
} from "../shape-geometry";
import { standardShapeAppearance, getShapeEndPaint } from "../shape-line-paint";
import { useAppI18n } from "../../../shared/i18n";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { ShapeDetailedPresentation } from "../shape-detailed-presentation";
import ShapeDetailedContent from "./ShapeDetailedContent.vue";
import { hasUnsupportedShapeProjectedText } from "../shape-detailed-paint";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  theme?: WorkbookTheme;
  assetUrls?: ReadonlyMap<string, string>;
  density?: number;
}>();
const emit = defineEmits<{
  paint: [presentation: ShapeDetailedPresentation | undefined];
}>();
const { t } = useAppI18n();
const geometry = computed(() => getDrawingShapeGeometry(props.drawing));
const paths = computed(() => getStandardShapeSvgPaths(geometry.value));
const appearance = computed(() => standardShapeAppearance(props.drawing));
const ends = computed(() => getShapeEndPaint(props.drawing, geometry.value));
const textStyle = computed<CSSProperties | undefined>(() => {
  const rect = geometry.value?.textRect;
  if (!rect || rect.right <= rect.left || rect.bottom <= rect.top) return;
  const p = standardShapeFlipPoint(props.drawing, {
    x: props.drawing.shapeFlipX ? rect.right : rect.left,
    y: props.drawing.shapeFlipY ? rect.bottom : rect.top,
  });
  return {
    left: `${(p.x / props.drawing.width) * 100}%`,
    top: `${(p.y / props.drawing.height) * 100}%`,
    width: `${((rect.right - rect.left) / props.drawing.width) * 100}%`,
    height: `${((rect.bottom - rect.top) / props.drawing.height) * 100}%`,
    color: props.drawing.color,
    fontSize: `${props.drawing.fontSize}px`,
    fontWeight: props.drawing.bold ? "700" : "400",
    fontStyle: props.drawing.italic ? "italic" : "normal",
  };
});
</script>
<template>
  <div
    class="standard-shape-content"
    :class="{ 'has-detailed-style': !!drawing.shapeStyle }"
    data-standard-shape-content
  >
    <template v-if="geometry">
      <ShapeDetailedContent
        v-if="drawing.shapeStyle"
        :drawing="drawing"
        :theme="theme"
        :asset-urls="assetUrls"
        :density="density"
        @paint="emit('paint', $event)"
      />
      <svg
        v-else
        :viewBox="`0 0 ${drawing.width} ${drawing.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g :transform="standardShapeSvgTransform(drawing)">
          <path
            v-for="(path, index) in paths"
            :key="index"
            :d="path.d"
            :fill="
              path.filled && path.fillMode !== 'none' && appearance.fill !== 'transparent'
                ? standardShapeFillColor(appearance.fill, path.fillMode)
                : 'none'
            "
            :stroke="
              path.stroke && drawing.strokeWidth > 0 && drawing.stroke !== 'transparent'
                ? drawing.stroke
                : 'none'
            "
            :stroke-width="drawing.strokeWidth"
            fill-rule="nonzero"
            stroke-linecap="round"
            stroke-linejoin="round"
            :data-standard-shape-path="index"
          />
          <path
            v-for="(end, index) in ends"
            :key="`end-${index}`"
            :d="end.d"
            :fill="end.filled ? drawing.stroke : 'none'"
            :stroke="drawing.stroke"
            :stroke-width="drawing.strokeWidth"
            stroke-linecap="round"
            stroke-linejoin="round"
            :data-shape-line-end="index"
          />
        </g>
      </svg>
      <div
        v-if="
          drawing.text.trim() &&
          drawing.color !== 'transparent' &&
          textStyle &&
          !hasUnsupportedShapeProjectedText(drawing)
        "
        class="standard-shape-content__text"
        :style="textStyle"
        data-standard-shape-text
      >
        {{ drawing.text }}
      </div>
    </template>
    <span v-else class="standard-shape-content__unavailable" role="status">
      {{ t("drawing.geometryUnavailable") }}
    </span>
  </div>
</template>
<style scoped lang="scss">
.standard-shape-content {
  width: 100%;
  height: 100%;
  position: relative;
  pointer-events: none;
  &.has-detailed-style {
    pointer-events: auto;
  }
  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    pointer-events: visiblePainted;
  }
  &__text {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow: hidden;
    text-align: center;
    pointer-events: auto;
  }
  &__unavailable {
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    pointer-events: auto;
  }
}
</style>
