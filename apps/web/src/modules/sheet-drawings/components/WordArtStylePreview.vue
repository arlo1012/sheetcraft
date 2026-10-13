<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import ShapeTextContent from "./ShapeTextContent.vue";
import { INHERITED_SHAPE_FONT_FAMILY } from "../shape-text-options";
import type { ShapeDetailedPresentation } from "../shape-detailed-presentation";
import { materializeWordArtStylePreset, type WordArtStylePreset } from "../wordart-style-presets";

const props = defineProps<{
  choice: WordArtStylePreset;
  label: string;
  theme?: WorkbookTheme;
}>();
const ready = ref(false);
/** A tiny transient native-glyph sample, never a document object or image asset.
 * All real preset parameters are passed unchanged to the existing text painter.
 * Font/geometry are uniform sample settings, independent of insertion defaults.
 * Density 1 and 60×64 logical frames bound all 25 consumers well below full-sheet
 * paint sizes; no CSS imitation of glyph fill, outline or effects is involved. */
const drawing = computed<SheetGraphicDrawing>(() => ({
  id: `wordart-preview-${props.choice.id}`,
  name: "WordArt style sample",
  kind: "textBox",
  anchor: { row: 0, column: 0 },
  offsetX: 0,
  offsetY: 0,
  width: 60,
  height: 64,
  text: "A",
  shape: "rectangle",
  fill: "transparent",
  stroke: "transparent",
  strokeWidth: 0,
  color: "#000000",
  fontSize: 44,
  bold: true,
  italic: false,
  rotation: 0,
  shapeText: {
    fontFamily: INHERITED_SHAPE_FONT_FAMILY,
    layout: {
      blockAlignment: "center",
      direction: "horizontal",
      lineOrder: "ltr",
      marginsPt: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
      wrap: false,
      overflow: true,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "center",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: { kind: "normal" },
    },
    style: materializeWordArtStylePreset(props.choice),
  },
}));
function painted(presentation: ShapeDetailedPresentation | undefined): void {
  ready.value = !!presentation && presentation.drawing === drawing.value;
}
watch(
  () => [props.choice, props.theme],
  () => {
    ready.value = false;
  },
  { flush: "sync" },
);
</script>

<template>
  <span class="wordart-style-preview" aria-hidden="true" :data-preview-ready="ready">
    <span v-show="ready" class="wordart-style-preview__native">
      <ShapeTextContent :drawing="drawing" :theme="theme" :density="1" @paint="painted" />
    </span>
    <span v-if="!ready" class="wordart-style-preview__fallback">{{ label }}</span>
  </span>
</template>

<style scoped lang="scss">
.wordart-style-preview {
  display: block;
  position: relative;
  width: 44px;
  max-width: 100%;
  height: 48px;
  overflow: hidden;
  pointer-events: none;

  &__native {
    position: absolute;
    width: 60px;
    height: 64px;
    left: 50%;
    top: 50%;
    margin-left: -21px;
    margin-top: -22.4px;
    transform: scale(0.7);
    transform-origin: 0 0;
  }

  &__fallback {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    text-align: center;
    overflow-wrap: anywhere;
  }
}
</style>
