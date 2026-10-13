<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { SheetLegacyDrawing as SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import StandardShapeContent from "./StandardShapeContent.vue";
import type { ShapeDetailedPresentation } from "../shape-detailed-presentation";
const FormControlContent = defineAsyncComponent(
  () => import("../../form-controls/components/FormControlContent.vue"),
);
const AttachmentContent = defineAsyncComponent(
  () => import("../../attachments/components/AttachmentContent.vue"),
);
const CameraContent = defineAsyncComponent(
  () => import("../../camera/components/CameraContent.vue"),
);
const ChartContent = defineAsyncComponent(() => import("../../charts/components/ChartContent.vue"));
const EquationContent = defineAsyncComponent(() => import("./EquationContent.vue"));
const props = defineProps<{
  drawing: SheetDrawing;
  connectorRoute?: ReadyShapeConnectorRoute;
  sheet?: Sheet;
  evaluator?: SheetEvaluator;
  revision?: number;
  theme?: WorkbookTheme;
  imageAssetUrls?: ReadonlyMap<string, string>;
  locale?: string;
  dateSystem?: "1900" | "1904";
  density?: number;
  legacyHitSurface?: boolean;
}>();
const emit = defineEmits<{
  controlChange: [value: unknown];
  detailedPaint: [presentation: ShapeDetailedPresentation | undefined];
}>();
const textStyle = computed(() => ({
  color: props.drawing.color,
  fontSize: `${props.drawing.fontSize}px`,
  fontWeight: props.drawing.bold ? "700" : "400",
  fontStyle: props.drawing.italic ? "italic" : "normal",
}));
</script>
<template>
  <div class="drawing-content" :style="{ transform: `rotate(${drawing.rotation}deg)` }">
    <StandardShapeContent
      v-if="
        (drawing.kind === 'shape' &&
          (connectorRoute ||
            drawing.shapeConnector ||
            drawing.shapeGeometry ||
            drawing.shapePath ||
            drawing.shapeStyle ||
            drawing.shapeText)) ||
        (drawing.kind === 'textBox' && drawing.shapeText)
      "
      :drawing="drawing"
      :connector-route="connectorRoute"
      :theme="theme"
      :asset-urls="imageAssetUrls"
      :density="density"
      @paint="emit('detailedPaint', $event)"
    />
    <svg
      v-else-if="drawing.kind === 'shape' || drawing.kind === 'icon'"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      :style="{ pointerEvents: legacyHitSurface ? 'visiblePainted' : undefined }"
    >
      <g
        :fill="drawing.fill"
        :stroke="drawing.stroke"
        :stroke-width="drawing.strokeWidth"
        stroke-linejoin="round"
      >
        <rect
          v-if="drawing.shape === 'rectangle' || drawing.shape === 'roundedRectangle'"
          x="2"
          y="2"
          width="96"
          height="96"
          :rx="drawing.shape === 'roundedRectangle' ? 12 : 0"
          vector-effect="non-scaling-stroke"
        />
        <ellipse
          v-else-if="drawing.shape === 'ellipse'"
          cx="50"
          cy="50"
          rx="48"
          ry="48"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'triangle'"
          d="M50 2 L98 98 H2 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'diamond'"
          d="M50 2 L98 50 L50 98 L2 50 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'arrow'"
          d="M2 32 H60 V2 L98 50 L60 98 V68 H2 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'line'"
          d="M2 98 L98 2"
          fill="none"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'star'"
          d="M50 2 L62 35 L98 37 L70 60 L80 96 L50 75 L20 96 L30 60 L2 37 L38 35 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="drawing.shape === 'heart'"
          d="M50 94 C-30 40 8 -20 50 20 C92 -20 130 40 50 94 Z"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>
    <ChartContent
      v-if="drawing.kind === 'chart' && sheet && evaluator"
      :drawing="drawing"
      :sheet="sheet"
      :evaluator="evaluator"
      :revision="revision ?? 0"
    />
    <FormControlContent
      v-else-if="drawing.kind === 'control' && sheet && evaluator"
      :drawing="drawing"
      :sheet="sheet"
      :evaluator="evaluator"
      :revision="revision ?? 0"
      @change="emit('controlChange', $event)"
    />
    <AttachmentContent v-else-if="drawing.kind === 'attachment'" :drawing="drawing" />
    <CameraContent
      v-else-if="drawing.kind === 'camera' && sheet && evaluator"
      :drawing="drawing"
      :sheet="sheet"
      :evaluator="evaluator"
      :revision="revision ?? 0"
      :theme="theme"
      :image-asset-urls="imageAssetUrls"
      :locale="locale"
      :date-system="dateSystem"
    />
    <EquationContent
      v-else-if="drawing.kind === 'equation'"
      :source="drawing.text"
      :style="textStyle"
    />
    <div
      v-else
      v-show="
        !(
          (drawing.kind === 'shape' &&
            (connectorRoute ||
              drawing.shapeConnector ||
              drawing.shapeGeometry ||
              drawing.shapePath ||
              drawing.shapeStyle ||
              drawing.shapeText)) ||
          (drawing.kind === 'textBox' && drawing.shapeText)
        )
      "
      class="drawing-content__text"
      :class="{ 'is-word-art': drawing.kind === 'wordArt' }"
      :style="[
        textStyle,
        { pointerEvents: legacyHitSurface ? 'auto' : undefined },
        drawing.kind === 'textBox' && drawing.textDirection === 'vertical'
          ? { writingMode: 'vertical-rl', textOrientation: 'mixed' }
          : {},
        drawing.kind === 'textBox' || drawing.kind === 'wordArt' ? { lineHeight: 'normal' } : {},
        drawing.kind === 'textBox'
          ? {
              background: drawing.fill,
              border: `${drawing.strokeWidth}px solid ${drawing.stroke}`,
            }
          : {},
      ]"
    >
      {{ drawing.text }}
    </div>
  </div>
</template>
<style scoped lang="scss">
.drawing-content {
  position: relative;
  width: 100%;
  height: 100%;
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  &__text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    box-sizing: border-box;
    white-space: pre-wrap;
    overflow: hidden;
    overflow-wrap: anywhere;
    text-align: center;
    &.is-word-art {
      font-weight: 800;
      text-shadow: 2px 3px 0 #dbeafe;
      -webkit-text-stroke: 0.5px currentColor;
    }
  }
}
</style>
