<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type {
  SheetGraphicDrawing,
  SheetLegacyDrawing as SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import { useAppI18n } from "../../../shared/i18n";
import ShapeLeafPixelContent from "./ShapeLeafPixelContent.vue";
import StandardShapeContent from "./StandardShapeContent.vue";
import type { ShapeDetailedPresentation } from "../shape-detailed-presentation";
import { standardShapeSvgTransform } from "../shape-geometry";
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
  /** Disposable glyph projection; drawing remains the actual editable carrier. */
  paintDrawing?: SheetGraphicDrawing;
  textReferenceUnavailable?: boolean;
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
  hideText?: boolean;
}>();
const emit = defineEmits<{
  controlChange: [value: unknown];
  detailedPaint: [presentation: ShapeDetailedPresentation | undefined];
}>();
const { t } = useAppI18n();
const paintSource = computed(() => props.paintDrawing ?? props.drawing);
const referenceUnavailable = computed(
  () =>
    props.drawing.kind === "textBox" &&
    Boolean(props.drawing.textReference) &&
    (props.textReferenceUnavailable || !props.paintDrawing),
);
const projectedLegacyTextBox = computed<SheetGraphicDrawing | undefined>(() => {
  const drawing = paintSource.value;
  return drawing.kind === "textBox" &&
    !drawing.shapeText &&
    (drawing.shapeStyle?.rotation3d?.kind === "value" ||
      drawing.shapeStyle?.format3d?.kind === "value")
    ? drawing
    : undefined;
});
const textStyle = computed(() => ({
  color: paintSource.value.color,
  fontSize: `${paintSource.value.fontSize}px`,
  fontWeight: paintSource.value.bold ? "700" : "400",
  fontStyle: paintSource.value.italic ? "italic" : "normal",
  ...((paintSource.value.kind === "shape" || paintSource.value.kind === "textBox") &&
  paintSource.value.shapeFlipY
    ? { transform: "rotate(180deg)", transformOrigin: "50% 50%" }
    : {}),
}));
const legacyBodyTransform = computed(() =>
  paintSource.value.kind === "shape"
    ? standardShapeSvgTransform({
        width: 100,
        height: 100,
        shapeFlipX: paintSource.value.shapeFlipX,
        shapeFlipY: paintSource.value.shapeFlipY,
      })
    : undefined,
);
</script>
<template>
  <div class="drawing-content" :style="{ transform: `rotate(${paintSource.rotation}deg)` }">
    <span v-if="referenceUnavailable" class="drawing-content__unavailable" role="status">
      {{ t("drawing.textBoxReferenceUnavailable") }}
    </span>
    <ShapeLeafPixelContent
      v-else-if="projectedLegacyTextBox"
      :drawing="projectedLegacyTextBox"
      :theme="theme"
      :density="density"
      :hide-text="hideText"
      @paint="emit('detailedPaint', $event)"
    />
    <StandardShapeContent
      v-else-if="
        (paintSource.kind === 'shape' &&
          (connectorRoute ||
            paintSource.shapeConnector ||
            paintSource.shapeGeometry ||
            paintSource.shapePath ||
            paintSource.shapeStyle ||
            paintSource.shapeText)) ||
        (paintSource.kind === 'textBox' && paintSource.shapeText)
      "
      :drawing="paintSource"
      :connector-route="connectorRoute"
      :theme="theme"
      :asset-urls="imageAssetUrls"
      :density="density"
      :hide-text="hideText"
      @paint="emit('detailedPaint', $event)"
    />
    <svg
      v-else-if="paintSource.kind === 'shape' || paintSource.kind === 'icon'"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      :style="{ pointerEvents: legacyHitSurface ? 'visiblePainted' : undefined }"
    >
      <g
        :transform="legacyBodyTransform"
        :fill="paintSource.fill"
        :stroke="paintSource.stroke"
        :stroke-width="paintSource.strokeWidth"
        stroke-linejoin="round"
      >
        <rect
          v-if="paintSource.shape === 'rectangle' || paintSource.shape === 'roundedRectangle'"
          x="2"
          y="2"
          width="96"
          height="96"
          :rx="paintSource.shape === 'roundedRectangle' ? 12 : 0"
          vector-effect="non-scaling-stroke"
        />
        <ellipse
          v-else-if="paintSource.shape === 'ellipse'"
          cx="50"
          cy="50"
          rx="48"
          ry="48"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'triangle'"
          d="M50 2 L98 98 H2 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'diamond'"
          d="M50 2 L98 50 L50 98 L2 50 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'arrow'"
          d="M2 32 H60 V2 L98 50 L60 98 V68 H2 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'line'"
          d="M2 98 L98 2"
          fill="none"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'star'"
          d="M50 2 L62 35 L98 37 L70 60 L80 96 L50 75 L20 96 L30 60 L2 37 L38 35 Z"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-else-if="paintSource.shape === 'heart'"
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
        !referenceUnavailable &&
        !projectedLegacyTextBox &&
        !hideText &&
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
      {{ paintSource.text }}
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
  &__unavailable {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: var(--color-text-secondary, #666);
    font-size: 12px;
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
