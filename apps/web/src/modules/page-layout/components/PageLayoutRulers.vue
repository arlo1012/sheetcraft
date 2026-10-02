<script lang="ts">
import type { CellRange } from "@idea10/core/workbook";
import { getPagePaperSize, type SheetPageSetup } from "@idea10/core/page-setup";
import type { SheetPageMargin } from "@idea10/sheet-engine/page-layout";
import type { Point } from "@idea10/sheet-engine/geometry";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import type { PageMarginDragStart } from "../usePageMarginDrag";
import type { PageViewPage, PageViewPaintState } from "../page-view-types";

export const PAGE_LAYOUT_RULER_SIZE = 18;
export type PageLayoutRulerUnit = "mm" | "cm" | "in";
type Axis = "horizontal" | "vertical";
type Band = { start: number; end: number; key: string };
type Tick = { key: string; position: number; label?: string; major: boolean };

const MM: Record<PageLayoutRulerUnit, number> = { mm: 1, cm: 10, in: 25.4 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
function uniquePages(pages: readonly PageViewPage[], axis: Axis): PageViewPage[] {
  const seen = new Set<number>();
  return pages.filter((page) => {
    const value = axis === "horizontal" ? page.paperRect.x : page.paperRect.y;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
function chooseStep(pixels: number): number {
  for (let exponent = -3; exponent <= 4; exponent += 1)
    for (const factor of [1, 2, 5])
      if (factor * 10 ** exponent * pixels >= 32) return factor * 10 ** exponent;
  return 100_000;
}
function tickLabel(value: number): string {
  return Number(Math.abs(value).toFixed(3)).toString();
}
function axisMarks(options: {
  pages: readonly PageViewPage[];
  axis: Axis;
  scroll: number;
  viewport: number;
  scale: number;
  millimetresPerUnit: number;
  unit: PageLayoutRulerUnit;
}): { bands: Band[]; ticks: Tick[] } {
  const { pages, axis, scroll, viewport, scale, millimetresPerUnit, unit } = options;
  const millimetres = MM[unit];
  const step = chooseStep((millimetres / millimetresPerUnit) * scale);
  const bands: Band[] = [];
  const ticks: Tick[] = [];
  for (const page of uniquePages(pages, axis)) {
    const paper = axis === "horizontal" ? page.paperRect.x : page.paperRect.y;
    const paperSize = axis === "horizontal" ? page.paperRect.width : page.paperRect.height;
    const content = axis === "horizontal" ? page.contentRect.x : page.contentRect.y;
    const contentSize = axis === "horizontal" ? page.contentRect.width : page.contentRect.height;
    const paperStart = paper - scroll;
    const contentStart = content - scroll;
    const contentEnd = contentStart + contentSize;
    const paperEnd = paperStart + paperSize;
    if (paperEnd <= 0 || paperStart >= viewport) continue;
    bands.push(
      {
        start: clamp(paperStart, 0, viewport),
        end: clamp(contentStart, 0, viewport),
        key: `${axis}:${paper}:before`,
      },
      {
        start: clamp(contentEnd, 0, viewport),
        end: clamp(paperEnd, 0, viewport),
        key: `${axis}:${paper}:after`,
      },
    );
    const before = Math.ceil(((content - paper) * millimetresPerUnit) / millimetres / step);
    const after = Math.ceil(
      ((paper + paperSize - content) * millimetresPerUnit) / millimetres / step,
    );
    for (let index = -before; index <= after; index += 1) {
      const value = index * step;
      const position = contentStart + (value * millimetres) / millimetresPerUnit;
      if (position < Math.max(0, paperStart) || position > Math.min(viewport, paperEnd)) continue;
      ticks.push({
        key: `${axis}:${paper}:${value}`,
        position,
        label: tickLabel(value),
        major: true,
      });
      for (let minor = 1; minor < 5; minor += 1) {
        const minorPosition = position + (minor * step * millimetres) / (5 * millimetresPerUnit);
        if (minorPosition < Math.max(0, paperStart) || minorPosition > Math.min(viewport, paperEnd))
          continue;
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

export function createPageLayoutRulerModel(options: {
  state: PageViewPaintState;
  frame: SheetRenderFrame;
  unit: PageLayoutRulerUnit;
}) {
  const { bodyScrollPosition, viewportSize } = options.frame.layout;
  return {
    horizontal: axisMarks({
      pages: options.state.pages,
      axis: "horizontal",
      scroll: bodyScrollPosition.x,
      viewport: viewportSize.width,
      scale: options.frame.scale,
      millimetresPerUnit: options.state.millimetresPerUnit,
      unit: options.unit,
    }),
    vertical: axisMarks({
      pages: options.state.pages,
      axis: "vertical",
      scroll: bodyScrollPosition.y,
      viewport: viewportSize.height,
      scale: options.frame.scale,
      millimetresPerUnit: options.state.millimetresPerUnit,
      unit: options.unit,
    }),
  };
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    state: PageViewPaintState;
    frame: SheetRenderFrame;
    setup: SheetPageSetup;
    unit: PageLayoutRulerUnit;
    selection?: CellRange;
    activeMargin?: SheetPageMargin;
    dragPoint?: Point;
    disabled?: boolean;
    label?: string;
    printScale?: number;
  }>(),
  { disabled: false, label: "Page layout rulers", printScale: 1 },
);
const emit = defineEmits<{
  marginStart: [payload: PageMarginDragStart];
  marginAdjust: [payload: { margin: SheetPageMargin; valueMm: number }];
}>();
const { locale, t } = useAppI18n();
const printScale = computed(() => Math.max(props.printScale, 0.01));
const size = computed(() => PAGE_LAYOUT_RULER_SIZE / printScale.value);
const hitSize = computed(() => 10 / printScale.value);
const model = computed(() =>
  createPageLayoutRulerModel({ state: props.state, frame: props.frame, unit: props.unit }),
);
const scroll = computed(() => props.frame.layout.bodyScrollPosition);
const selected = computed(() =>
  props.selection
    ? props.frame.layout.getRangeFragments(props.selection).map(({ rect }) => rect)
    : [],
);
const horizontalPages = computed(() => uniquePages(props.state.pages, "horizontal"));
const verticalPages = computed(() => uniquePages(props.state.pages, "vertical"));
const activeVerticalPage = computed(() => {
  const fragments = selected.value;
  if (fragments.length === 0) return verticalPages.value[0];
  const scrollY = scroll.value.y;
  return (
    verticalPages.value.find((page) => {
      const start = page.contentRect.y - scrollY;
      const end = start + page.contentRect.height;
      return fragments.some((rect) => rect.y < end && rect.y + rect.height > start);
    }) ?? verticalPages.value[0]
  );
});
function markerPosition(page: PageViewPage, margin: SheetPageMargin): number {
  const vertical = margin === "left" || margin === "right";
  const paper = page.paperRect;
  const value = props.setup.margins[margin] / props.state.millimetresPerUnit;
  return vertical
    ? (margin === "left" ? paper.x + value : paper.x + paper.width - value) - scroll.value.x
    : (margin === "top" || margin === "header" ? paper.y + value : paper.y + paper.height - value) -
        scroll.value.y;
}
function style(page: PageViewPage, margin: SheetPageMargin) {
  const position = markerPosition(page, margin);
  return margin === "left" || margin === "right"
    ? {
        left: `${props.frame.body.x + position - hitSize.value / 2}px`,
        top: "0px",
        width: `${hitSize.value}px`,
        height: `${size.value}px`,
      }
    : {
        left: "0px",
        top: `${props.frame.body.y + position - hitSize.value / 2}px`,
        width: `${size.value}px`,
        height: `${hitSize.value}px`,
      };
}
function markerVisible(page: PageViewPage, margin: SheetPageMargin): boolean {
  const position = markerPosition(page, margin);
  const viewport = margin === "left" || margin === "right" ? frameWidth.value : frameHeight.value;
  return position >= 0 && position <= viewport;
}
const frameWidth = computed(() => props.frame.body.width);
const frameHeight = computed(() => props.frame.body.height);
function marginName(margin: SheetPageMargin): string {
  return t(
    margin === "left"
      ? "pageLayout.marginLeft"
      : margin === "right"
        ? "pageLayout.marginRight"
        : margin === "top"
          ? "pageLayout.marginTop"
          : margin === "bottom"
            ? "pageLayout.marginBottom"
            : margin === "header"
              ? "pageLayout.marginHeader"
              : "pageLayout.marginFooter",
  );
}
function marginValue(margin: SheetPageMargin): string {
  return t("pageLayout.marginValue", {
    margin: marginName(margin),
    value: props.setup.margins[margin].toFixed(1),
  });
}
function maximum(margin: SheetPageMargin): number {
  const paper = getPagePaperSize(props.setup);
  const m = props.setup.margins;
  return margin === "left"
    ? paper.width - m.right - 1
    : margin === "right"
      ? paper.width - m.left - 1
      : margin === "top"
        ? paper.height - m.bottom - 1
        : margin === "bottom"
          ? paper.height - m.top - 1
          : margin === "header"
            ? m.top
            : m.bottom;
}
function keydown(margin: SheetPageMargin, event: KeyboardEvent): void {
  const direction =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  event.stopPropagation();
  emit("marginAdjust", {
    margin,
    valueMm:
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? maximum(margin)
          : Math.round(
              (props.setup.margins[margin] + direction * (event.shiftKey ? 1 : 0.1)) * 10,
            ) / 10,
  });
}
const tooltip = computed(() => {
  if (!props.activeMargin || !props.dragPoint) return undefined;
  const value = props.setup.margins[props.activeMargin] / MM[props.unit];
  const unit = t(
    props.unit === "cm"
      ? "pageLayout.unitCentimetres"
      : props.unit === "in"
        ? "pageLayout.unitInches"
        : "pageLayout.unitMillimetres",
  );
  return t("pageLayout.marginDragValue", {
    value: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value),
    unit,
  });
});
const tooltipStyle = computed(() => {
  if (!props.dragPoint) return undefined;
  const offset = 8 / printScale.value;
  const surface = props.frame.size ?? {
    width: props.frame.body.x + props.frame.body.width,
    height: props.frame.body.y + props.frame.body.height,
  };
  return {
    left: `${clamp(props.dragPoint.x + offset, 0, surface.width - 80 / printScale.value)}px`,
    top: `${clamp(props.dragPoint.y - 24 / printScale.value, 0, surface.height - 22 / printScale.value)}px`,
    fontSize: `${12 / printScale.value}px`,
  };
});
</script>

<template>
  <div
    class="page-layout-rulers"
    :class="{ 'page-layout-rulers--disabled': disabled }"
    :aria-label="label"
    role="group"
    data-page-layout-rulers
  >
    <svg
      class="page-layout-rulers__horizontal"
      :style="{
        left: `${frame.body.x}px`,
        top: '0px',
        width: `${frame.body.width}px`,
        height: `${size}px`,
      }"
      :viewBox="`0 0 ${frame.body.width} ${size}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-page-ruler="horizontal"
    >
      <rect
        v-for="band in model.horizontal.bands"
        :key="band.key"
        class="page-layout-rulers__margin"
        :x="band.start"
        y="0"
        :width="Math.max(0, band.end - band.start)"
        :height="size"
      />
      <rect
        v-for="(rect, index) in selected"
        :key="`horizontal-selection-${index}`"
        class="page-layout-rulers__selection"
        :x="rect.x"
        y="0"
        :width="rect.width"
        :height="size"
      />
      <g v-for="tick in model.horizontal.ticks" :key="tick.key">
        <line
          class="page-layout-rulers__tick"
          :class="{ 'page-layout-rulers__tick--major': tick.major }"
          :x1="tick.position"
          :x2="tick.position"
          :y1="tick.major ? 0 : size - 4 / printScale"
          :y2="size"
        />
        <text
          v-if="tick.label"
          class="page-layout-rulers__label"
          :style="{ fontSize: `${10 / printScale}px` }"
          :x="tick.position - 2 / printScale"
          :y="10 / printScale"
          text-anchor="end"
        >
          {{ tick.label }}
        </text>
      </g>
    </svg>
    <svg
      class="page-layout-rulers__vertical"
      :style="{
        left: '0px',
        top: `${frame.body.y}px`,
        width: `${size}px`,
        height: `${frame.body.height}px`,
      }"
      :viewBox="`0 0 ${size} ${frame.body.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-page-ruler="vertical"
    >
      <rect
        v-for="band in model.vertical.bands"
        :key="band.key"
        class="page-layout-rulers__margin"
        x="0"
        :y="band.start"
        :width="size"
        :height="Math.max(0, band.end - band.start)"
      />
      <rect
        v-for="(rect, index) in selected"
        :key="`vertical-selection-${index}`"
        class="page-layout-rulers__selection"
        x="0"
        :y="rect.y"
        :width="size"
        :height="rect.height"
      />
      <g v-for="tick in model.vertical.ticks" :key="tick.key">
        <line
          class="page-layout-rulers__tick"
          :class="{ 'page-layout-rulers__tick--major': tick.major }"
          :x1="tick.major ? 0 : size - 4 / printScale"
          :x2="size"
          :y1="tick.position"
          :y2="tick.position"
        />
        <text
          v-if="tick.label"
          class="page-layout-rulers__label"
          :style="{ fontSize: `${10 / printScale}px` }"
          :transform="`translate(${7 / printScale} ${tick.position - 2 / printScale}) rotate(-90)`"
        >
          {{ tick.label }}
        </text>
      </g>
    </svg>
    <template v-for="page in horizontalPages" :key="`horizontal-marker-${page.paperRect.x}`">
      <button
        v-if="markerVisible(page, 'left')"
        type="button"
        class="page-layout-rulers__marker page-layout-rulers__marker--horizontal"
        :class="{ 'is-active': activeMargin === 'left' }"
        :style="style(page, 'left')"
        :disabled="disabled"
        role="slider"
        :aria-label="marginName('left')"
        aria-orientation="horizontal"
        :aria-valuemin="0"
        :aria-valuemax="maximum('left')"
        :aria-valuenow="setup.margins.left"
        :aria-valuetext="marginValue('left')"
        data-page-ruler-margin="left"
        @pointerdown="emit('marginStart', { margin: 'left', page, event: $event })"
        @keydown="keydown('left', $event)"
      />
      <button
        v-if="markerVisible(page, 'right')"
        type="button"
        class="page-layout-rulers__marker page-layout-rulers__marker--horizontal"
        :class="{ 'is-active': activeMargin === 'right' }"
        :style="style(page, 'right')"
        :disabled="disabled"
        role="slider"
        :aria-label="marginName('right')"
        aria-orientation="horizontal"
        :aria-valuemin="0"
        :aria-valuemax="maximum('right')"
        :aria-valuenow="setup.margins.right"
        :aria-valuetext="marginValue('right')"
        data-page-ruler-margin="right"
        @pointerdown="emit('marginStart', { margin: 'right', page, event: $event })"
        @keydown="keydown('right', $event)"
      />
    </template>
    <template v-if="state.showWhiteSpace !== false && activeVerticalPage">
      <button
        v-if="markerVisible(activeVerticalPage, 'top')"
        type="button"
        class="page-layout-rulers__marker page-layout-rulers__marker--vertical"
        :class="{ 'is-active': activeMargin === 'top' }"
        :style="style(activeVerticalPage, 'top')"
        :disabled="disabled"
        role="slider"
        :aria-label="marginName('top')"
        aria-orientation="vertical"
        :aria-valuemin="setup.margins.header"
        :aria-valuemax="maximum('top')"
        :aria-valuenow="setup.margins.top"
        :aria-valuetext="marginValue('top')"
        data-page-ruler-margin="top"
        @pointerdown="
          emit('marginStart', { margin: 'top', page: activeVerticalPage, event: $event })
        "
        @keydown="keydown('top', $event)"
      />
      <button
        v-if="markerVisible(activeVerticalPage, 'bottom')"
        type="button"
        class="page-layout-rulers__marker page-layout-rulers__marker--vertical"
        :class="{ 'is-active': activeMargin === 'bottom' }"
        :style="style(activeVerticalPage, 'bottom')"
        :disabled="disabled"
        role="slider"
        :aria-label="marginName('bottom')"
        aria-orientation="vertical"
        :aria-valuemin="0"
        :aria-valuemax="maximum('bottom')"
        :aria-valuenow="setup.margins.bottom"
        :aria-valuetext="marginValue('bottom')"
        data-page-ruler-margin="bottom"
        @pointerdown="
          emit('marginStart', { margin: 'bottom', page: activeVerticalPage, event: $event })
        "
        @keydown="keydown('bottom', $event)"
      />
    </template>
    <output
      v-if="tooltip && dragPoint"
      class="page-layout-rulers__tooltip"
      :style="tooltipStyle"
      data-page-margin-value
      >{{ tooltip }}</output
    >
  </div>
</template>

<style scoped lang="scss">
.page-layout-rulers {
  position: absolute;
  inset: 0;
  z-index: 5;
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
  }
  &__margin {
    fill: color-mix(in srgb, var(--idea-text-secondary) 15%, transparent);
  }
  &__selection {
    fill: color-mix(in srgb, var(--idea-action-primary) 24%, transparent);
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
  &__marker {
    position: absolute;
    z-index: 1;
    pointer-events: auto;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    &::after {
      content: "";
      position: absolute;
      bottom: calc(1px / v-bind(printScale));
      left: 50%;
      width: calc(7px / v-bind(printScale));
      height: calc(5px / v-bind(printScale));
      background: var(--idea-text-muted);
      clip-path: polygon(50% 0, 100% 100%, 0 100%);
      transform: translateX(-50%);
    }
    &--vertical {
      cursor: row-resize;
      &::after {
        top: 50%;
        right: calc(1px / v-bind(printScale));
        bottom: auto;
        left: auto;
        width: calc(5px / v-bind(printScale));
        height: calc(7px / v-bind(printScale));
        clip-path: polygon(0 50%, 100% 0, 100% 100%);
        transform: translateY(-50%);
      }
    }
    &:hover,
    &:focus-visible,
    &.is-active {
      &::after {
        background: var(--idea-action-primary);
      }
    }
  }
  &__tooltip {
    position: absolute;
    z-index: 2;
    padding: 2px 5px;
    border-radius: 2px;
    border: 1px solid var(--idea-border-strong);
    background: var(--idea-surface-panel);
    color: var(--idea-text-primary);
    white-space: nowrap;
  }
}
</style>
