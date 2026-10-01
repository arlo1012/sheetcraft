<script lang="ts">
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPaintState } from "../page-view-types";

export const PAGE_LAYOUT_RULER_SIZE = 26;

export type PageLayoutRulerUnit = "mm" | "cm" | "in";

type RulerAxis = "horizontal" | "vertical";

type RulerBand = { start: number; end: number };
type RulerTick = { key: string; position: number; label?: string; major: boolean };
type PageLayoutRulerModel = {
  horizontal: { bands: RulerBand[]; ticks: RulerTick[] };
  vertical: { bands: RulerBand[]; ticks: RulerTick[] };
};

const MILLIMETRES_PER_UNIT: Record<PageLayoutRulerUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function uniquePages(pages: readonly PageViewPaintState["pages"][number][], axis: RulerAxis) {
  const seen = new Set<number>();
  return pages.filter((page) => {
    const coordinate = axis === "horizontal" ? page.paperRect.x : page.paperRect.y;
    if (seen.has(coordinate)) return false;
    seen.add(coordinate);
    return true;
  });
}

function chooseStep(pixelsPerUnit: number): number {
  const candidates: number[] = [];
  for (let exponent = -3; exponent <= 4; exponent += 1)
    for (const factor of [1, 2, 5]) candidates.push(factor * 10 ** exponent);
  return candidates.find((candidate) => candidate * pixelsPerUnit >= 32) ?? 100_000;
}

function formatLabel(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function axisModel(
  pages: readonly PageViewPaintState["pages"][number][],
  axis: RulerAxis,
  scroll: number,
  viewport: number,
  scale: number,
  millimetresPerUnit: number,
  unit: PageLayoutRulerUnit,
): { bands: RulerBand[]; ticks: RulerTick[] } {
  const millimetres = MILLIMETRES_PER_UNIT[unit];
  const pixelsPerDisplayUnit = (millimetres / millimetresPerUnit) * scale;
  const step = chooseStep(pixelsPerDisplayUnit);
  const bands: RulerBand[] = [];
  const ticks: RulerTick[] = [];
  for (const page of uniquePages(pages, axis)) {
    const paper = axis === "horizontal" ? page.paperRect.x : page.paperRect.y;
    const paperSize = axis === "horizontal" ? page.paperRect.width : page.paperRect.height;
    const content = axis === "horizontal" ? page.contentRect.x : page.contentRect.y;
    const contentSize = axis === "horizontal" ? page.contentRect.width : page.contentRect.height;
    const paperStart = paper - scroll;
    const contentStart = content - scroll;
    const contentEnd = content + contentSize - scroll;
    const paperEnd = paper + paperSize - scroll;
    if (paperEnd <= 0 || paperStart >= viewport) continue;
    bands.push(
      { start: clamp(paperStart, 0, viewport), end: clamp(contentStart, 0, viewport) },
      { start: clamp(contentEnd, 0, viewport), end: clamp(paperEnd, 0, viewport) },
    );
    const displayLength = (contentSize * millimetresPerUnit) / millimetres;
    const tickCount = Math.floor(displayLength / step + 0.000001);
    for (let index = 0; index <= tickCount; index += 1) {
      const value = index * step;
      const position = contentStart + (value * millimetres) / millimetresPerUnit;
      if (position < 0 || position > viewport) continue;
      ticks.push({
        key: `${axis}:${paper}:${value}`,
        position,
        label: formatLabel(value),
        major: true,
      });
      const minorStep = step / 5;
      for (let minor = 1; minor < 5; minor += 1) {
        const minorPosition = position + (minor * minorStep * millimetres) / millimetresPerUnit;
        if (minorPosition < 0 || minorPosition > viewport || minorPosition >= contentEnd) continue;
        ticks.push({
          key: `${axis}:${paper}:${value}:${minor}`,
          position: minorPosition,
          major: false,
        });
      }
    }
  }
  return { bands, ticks };
}

/** Builds screen-space ruler marks from the same page projection used by the sheet surface. */
export function createPageLayoutRulerModel(options: {
  state: PageViewPaintState;
  frame: SheetRenderFrame;
  unit: PageLayoutRulerUnit;
}): PageLayoutRulerModel {
  const { frame, state, unit } = options;
  const { bodyScrollPosition, viewportSize } = frame.layout;
  return {
    horizontal: axisModel(
      state.pages,
      "horizontal",
      bodyScrollPosition.x,
      viewportSize.width,
      frame.scale,
      state.millimetresPerUnit,
      unit,
    ),
    vertical: axisModel(
      state.pages,
      "vertical",
      bodyScrollPosition.y,
      viewportSize.height,
      frame.scale,
      state.millimetresPerUnit,
      unit,
    ),
  };
}
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    state: PageViewPaintState;
    frame: SheetRenderFrame;
    unit: PageLayoutRulerUnit;
    disabled?: boolean;
    label?: string;
    printScale?: number;
  }>(),
  { disabled: false, label: "Page layout rulers", printScale: 1 },
);

const model = computed(() =>
  createPageLayoutRulerModel({ state: props.state, frame: props.frame, unit: props.unit }),
);
const effectivePrintScale = computed(() => Math.max(props.printScale, 0.01));
const rulerSize = computed(() => PAGE_LAYOUT_RULER_SIZE / effectivePrintScale.value);
const majorTickSize = computed(() => 10 / effectivePrintScale.value);
const minorTickSize = computed(() => 6 / effectivePrintScale.value);
const labelStyle = computed(() => ({ fontSize: `${12 / effectivePrintScale.value}px` }));
const horizontalStyle = computed(() => ({
  left: `${props.frame.body.x}px`,
  top: `${props.frame.body.y - rulerSize.value}px`,
  width: `${props.frame.body.width}px`,
  height: `${rulerSize.value}px`,
}));
const verticalStyle = computed(() => ({
  left: `${props.frame.body.x - rulerSize.value}px`,
  top: `${props.frame.body.y}px`,
  width: `${rulerSize.value}px`,
  height: `${props.frame.body.height}px`,
}));
</script>

<template>
  <div
    class="page-layout-rulers"
    :class="{ 'page-layout-rulers--disabled': disabled }"
    :aria-label="label"
    role="img"
    data-page-layout-rulers
  >
    <svg
      class="page-layout-rulers__horizontal"
      :style="horizontalStyle"
      :viewBox="`0 0 ${frame.body.width} ${rulerSize}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-page-ruler="horizontal"
    >
      <rect
        v-for="(band, index) in model.horizontal.bands"
        :key="`horizontal-band-${index}`"
        class="page-layout-rulers__margin"
        :x="band.start"
        y="0"
        :width="Math.max(0, band.end - band.start)"
        :height="rulerSize"
      />
      <g v-for="tick in model.horizontal.ticks" :key="tick.key">
        <line
          class="page-layout-rulers__tick"
          :class="{ 'page-layout-rulers__tick--major': tick.major }"
          :x1="tick.position"
          :x2="tick.position"
          :y1="rulerSize - (tick.major ? majorTickSize : minorTickSize)"
          :y2="rulerSize"
        />
        <text
          v-if="tick.label"
          class="page-layout-rulers__label"
          :style="labelStyle"
          :x="tick.position + 2"
          :y="majorTickSize"
        >
          {{ tick.label }}
        </text>
      </g>
    </svg>
    <svg
      class="page-layout-rulers__vertical"
      :style="verticalStyle"
      :viewBox="`0 0 ${rulerSize} ${frame.body.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-page-ruler="vertical"
    >
      <rect
        v-for="(band, index) in model.vertical.bands"
        :key="`vertical-band-${index}`"
        class="page-layout-rulers__margin"
        x="0"
        :y="band.start"
        :width="rulerSize"
        :height="Math.max(0, band.end - band.start)"
      />
      <g v-for="tick in model.vertical.ticks" :key="tick.key">
        <line
          class="page-layout-rulers__tick"
          :class="{ 'page-layout-rulers__tick--major': tick.major }"
          :x1="rulerSize - (tick.major ? majorTickSize : minorTickSize)"
          :x2="rulerSize"
          :y1="tick.position"
          :y2="tick.position"
        />
        <text
          v-if="tick.label"
          class="page-layout-rulers__label"
          :style="labelStyle"
          :transform="`translate(${majorTickSize} ${tick.position - 2}) rotate(-90)`"
        >
          {{ tick.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped lang="scss">
.page-layout-rulers {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  color: var(--idea-text-secondary);
  &--disabled {
    opacity: 0.55;
  }
  &__horizontal,
  &__vertical {
    position: absolute;
    overflow: hidden;
    background: var(--idea-surface-secondary);
    border-color: var(--idea-border);
  }
  &__horizontal {
    border-bottom: 1px solid var(--idea-border);
  }
  &__vertical {
    border-right: 1px solid var(--idea-border);
  }
  &__margin {
    fill: color-mix(in srgb, var(--idea-text-secondary) 15%, transparent);
  }
  &__tick {
    stroke: currentcolor;
    stroke-opacity: 0.45;
    stroke-width: 1;
    &--major {
      stroke-opacity: 0.75;
    }
  }
  &__label {
    fill: currentcolor;
    font-family: sans-serif;
    opacity: 0.8;
  }
}
</style>
