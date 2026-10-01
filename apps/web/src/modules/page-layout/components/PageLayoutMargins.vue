<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { getPagePaperSize, type SheetPageSetup } from "@idea10/core/page-setup";
import type { SheetPageMargin } from "@idea10/sheet-engine/page-layout";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";
import type { PageViewPage, PageViewPaintState } from "../page-view-types";
import type { PageMarginDragStart } from "../usePageMarginDrag";
import { useAppI18n } from "../../../shared/i18n";

type MarginUnit = "mm" | "cm" | "in";
const MILLIMETRES_PER_UNIT: Record<MarginUnit, number> = { mm: 1, cm: 10, in: 25.4 };

const props = withDefaults(
  defineProps<{
    state: PageViewPaintState;
    frame: SheetRenderFrame;
    setup: SheetPageSetup;
    disabled: boolean;
    activeMargin?: SheetPageMargin;
    dragPoint?: { x: number; y: number };
    showHandles?: boolean;
    showDragValue?: boolean;
    unit?: MarginUnit;
  }>(),
  { showHandles: true, showDragValue: true, unit: "mm" },
);
const emit = defineEmits<{
  start: [payload: PageMarginDragStart];
  adjust: [payload: { margin: SheetPageMargin; valueMm: number }];
}>();
const { locale, t } = useAppI18n();
const unitLabel = computed(() =>
  t(
    props.unit === "cm"
      ? "pageLayout.unitCentimetres"
      : props.unit === "in"
        ? "pageLayout.unitInches"
        : "pageLayout.unitMillimetres",
  ),
);
const dragValue = computed(() => {
  if (!props.activeMargin) return undefined;
  const value = props.setup.margins[props.activeMargin] / MILLIMETRES_PER_UNIT[props.unit];
  return t("pageLayout.marginDragValue", {
    value: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value),
    unit: unitLabel.value,
  });
});
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
function label(margin: SheetPageMargin): string {
  return t("pageLayout.marginValue", {
    margin: marginName(margin),
    value: props.setup.margins[margin].toFixed(1),
  });
}
function position(page: PageViewPage, margin: SheetPageMargin): CSSProperties {
  const paper = page.paperRect;
  const { bodyScrollPosition: scroll } = props.frame.layout;
  const thickness = 8 * (props.state.uiScale ?? 1);
  const vertical = margin === "left" || margin === "right";
  const distance = props.setup.margins[margin] / props.state.millimetresPerUnit;
  const offset = vertical
    ? margin === "left"
      ? paper.x + distance
      : paper.x + paper.width - distance
    : margin === "top" || margin === "header"
      ? paper.y + distance
      : paper.y + paper.height - distance;
  return {
    left: `${(vertical ? offset - thickness / 2 : paper.x) - scroll.x}px`,
    top: `${(vertical ? paper.y : offset - thickness / 2) - scroll.y}px`,
    width: `${vertical ? thickness : paper.width}px`,
    height: `${vertical ? paper.height : thickness}px`,
  };
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
  const value = props.setup.margins[margin];
  const amount = event.shiftKey ? 1 : 0.1;
  const direction =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  event.stopPropagation();
  emit("adjust", {
    margin,
    valueMm:
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? maximum(margin)
          : Math.round((value + direction * amount) * 10) / 10,
  });
}
</script>

<template>
  <div
    class="page-layout-margins"
    :style="{
      left: `${frame.body.x}px`,
      top: `${frame.body.y}px`,
      width: `${frame.body.width}px`,
      height: `${frame.body.height}px`,
    }"
    data-page-layout-margins
  >
    <template v-for="page in state.pages" :key="`${page.paperRect.x}:${page.paperRect.y}`">
      <div
        v-if="activeMargin"
        class="page-layout-margins__guide"
        :class="{ 'is-vertical': activeMargin === 'left' || activeMargin === 'right' }"
        :style="position(page, activeMargin)"
        aria-hidden="true"
        data-page-margin-guide
      />
      <template v-if="showHandles">
        <button
          type="button"
          role="slider"
          class="page-layout-margins__handle is-vertical"
          :class="{ 'is-active': activeMargin === 'left' }"
          :style="position(page, 'left')"
          :disabled="disabled"
          :aria-label="marginName('left')"
          aria-orientation="horizontal"
          :aria-valuemin="0"
          :aria-valuemax="maximum('left')"
          :aria-valuenow="setup.margins.left"
          :aria-valuetext="label('left')"
          :title="`${label('left')} — ${t('pageLayout.marginDragHint')}`"
          data-page-margin="left"
          @pointerdown="emit('start', { margin: 'left', page, event: $event })"
          @keydown="keydown('left', $event)"
        />
        <button
          type="button"
          role="slider"
          class="page-layout-margins__handle is-vertical"
          :class="{ 'is-active': activeMargin === 'right' }"
          :style="position(page, 'right')"
          :disabled="disabled"
          :aria-label="marginName('right')"
          aria-orientation="horizontal"
          :aria-valuemin="0"
          :aria-valuemax="maximum('right')"
          :aria-valuenow="setup.margins.right"
          :aria-valuetext="label('right')"
          :title="`${label('right')} — ${t('pageLayout.marginDragHint')}`"
          data-page-margin="right"
          @pointerdown="emit('start', { margin: 'right', page, event: $event })"
          @keydown="keydown('right', $event)"
        />
        <template v-if="state.showWhiteSpace !== false">
          <button
            type="button"
            role="slider"
            class="page-layout-margins__handle"
            :class="{ 'is-active': activeMargin === 'top' }"
            :style="position(page, 'top')"
            :disabled="disabled"
            :aria-label="marginName('top')"
            aria-orientation="vertical"
            :aria-valuemin="setup.margins.header"
            :aria-valuemax="maximum('top')"
            :aria-valuenow="setup.margins.top"
            :aria-valuetext="label('top')"
            :title="`${label('top')} — ${t('pageLayout.marginDragHint')}`"
            data-page-margin="top"
            @pointerdown="emit('start', { margin: 'top', page, event: $event })"
            @keydown="keydown('top', $event)"
          />
          <button
            type="button"
            role="slider"
            class="page-layout-margins__handle"
            :class="{ 'is-active': activeMargin === 'bottom' }"
            :style="position(page, 'bottom')"
            :disabled="disabled"
            :aria-label="marginName('bottom')"
            aria-orientation="vertical"
            :aria-valuemin="setup.margins.footer"
            :aria-valuemax="maximum('bottom')"
            :aria-valuenow="setup.margins.bottom"
            :aria-valuetext="label('bottom')"
            :title="`${label('bottom')} — ${t('pageLayout.marginDragHint')}`"
            data-page-margin="bottom"
            @pointerdown="emit('start', { margin: 'bottom', page, event: $event })"
            @keydown="keydown('bottom', $event)"
          />
          <button
            type="button"
            role="slider"
            class="page-layout-margins__handle is-header-footer"
            :class="{ 'is-active': activeMargin === 'header' }"
            :style="position(page, 'header')"
            :disabled="disabled"
            :aria-label="marginName('header')"
            aria-orientation="vertical"
            :aria-valuemin="0"
            :aria-valuemax="maximum('header')"
            :aria-valuenow="setup.margins.header"
            :aria-valuetext="label('header')"
            :title="`${label('header')} — ${t('pageLayout.marginDragHint')}`"
            data-page-margin="header"
            @pointerdown="emit('start', { margin: 'header', page, event: $event })"
            @keydown="keydown('header', $event)"
          />
          <button
            type="button"
            role="slider"
            class="page-layout-margins__handle is-header-footer"
            :class="{ 'is-active': activeMargin === 'footer' }"
            :style="position(page, 'footer')"
            :disabled="disabled"
            :aria-label="marginName('footer')"
            aria-orientation="vertical"
            :aria-valuemin="0"
            :aria-valuemax="maximum('footer')"
            :aria-valuenow="setup.margins.footer"
            :aria-valuetext="label('footer')"
            :title="`${label('footer')} — ${t('pageLayout.marginDragHint')}`"
            data-page-margin="footer"
            @pointerdown="emit('start', { margin: 'footer', page, event: $event })"
            @keydown="keydown('footer', $event)"
          />
        </template>
      </template>
    </template>
    <output
      v-if="showDragValue && dragPoint && dragValue"
      class="page-layout-margins__drag-value"
      :style="{
        left: `${dragPoint.x - frame.body.x + 8 / (state.uiScale ?? 1)}px`,
        top: `${dragPoint.y - frame.body.y - 24 / (state.uiScale ?? 1)}px`,
        fontSize: `${12 / (state.uiScale ?? 1)}px`,
      }"
      data-page-margin-drag-value
      >{{ dragValue }}</output
    >
  </div>
</template>

<style scoped lang="scss">
.page-layout-margins {
  position: absolute;
  z-index: 4;
  overflow: hidden;
  pointer-events: none;
  &__handle {
    position: absolute;
    border: 0;
    padding: 0;
    outline-offset: -1px;
    background: transparent;
    pointer-events: auto;
    cursor: row-resize;
    &::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 1px dashed var(--idea-text-muted);
    }
    &.is-vertical {
      cursor: col-resize;
      &::after {
        top: 0;
        bottom: 0;
        left: 50%;
        right: auto;
        border-top: 0;
        border-left: 1px dashed var(--idea-text-muted);
      }
    }
    &.is-header-footer::after {
      opacity: 0.6;
    }
    &:hover,
    &:focus-visible,
    &.is-active {
      background: color-mix(in srgb, var(--idea-action-primary) 12%, transparent);
      &::after {
        border-color: var(--idea-action-primary);
        opacity: 1;
      }
    }
    &:disabled {
      pointer-events: none;
    }
  }
  &__guide {
    position: absolute;
    z-index: 1;
    pointer-events: none;
    background: color-mix(in srgb, var(--idea-action-primary) 12%, transparent);
    &::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 1px solid var(--idea-action-primary);
    }
    &.is-vertical::after {
      left: 50%;
      right: auto;
      top: 0;
      bottom: 0;
      border-top: 0;
      border-left: 1px solid var(--idea-action-primary);
    }
  }
  &__drag-value {
    position: absolute;
    z-index: 2;
    pointer-events: none;
    padding: 2px 5px;
    border-radius: 2px;
    border: 1px solid var(--idea-border-strong);
    background: var(--idea-surface-panel);
    color: var(--idea-text-primary);
    white-space: nowrap;
  }
}
</style>
