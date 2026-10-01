<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { Rect, SheetGeometry } from "@idea10/sheet-engine/geometry";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { useAppI18n } from "../../../shared/i18n";
import {
  browserCellTextMeasurer,
  cellTextFontRevision,
} from "../../../shared/cell-text/text-metrics";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
  getCanvasViewportKey,
  type SheetCanvasScene,
} from "../canvas/cell-scene";
import {
  createBorderPaintPlan,
  paintSheetBorders,
  type SheetBorderPaintPlan,
} from "../canvas/border-painter";
import { createCanvasImageCache } from "../canvas/image-painter";
import { clearCanvasTextMetrics } from "../canvas/cell-text-painter";
import { paintSheetScene } from "../canvas/scene-painter";
import type { SheetDisplaySnapshot } from "../canvas/sheet-display-snapshot";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";
import type { SheetRenderEnvironment } from "../rendering/useSheetRenderEnvironment";
import { createSheetRenderScheduler } from "../rendering/render-scheduler";
import { paintSheetHeaders, type HeaderPaintState } from "../rendering/header-painter";
import type { SheetOverlayState } from "../rendering/overlay-types";
import {
  paintSheetUnderlay,
  paintSheetForeground,
  paintSheetChrome,
} from "../rendering/overlay-painter";
import type { PageViewPaintState } from "../../page-layout/page-view-types";
import {
  clipPageBreakPreviewOutside,
  clipPageBreakPreviewPrintArea,
  clipPageContents,
  paintPageBreakPreviewBackground,
  paintPageLayoutBackground,
  PAGE_LAYOUT_DESKTOP_COLOR,
  paintPageBreakPreview,
} from "../../page-layout/rendering/page-view-painter";

const props = withDefaults(
  defineProps<{
    display: SheetDisplaySnapshot;
    geometry: SheetGeometry;
    rows: RowVisibilityIndex;
    frame: SheetRenderFrame;
    environment: SheetRenderEnvironment;
    pageView?: PageViewPaintState;
    headers: Omit<HeaderPaintState, "frame" | "palette">;
    overlays: SheetOverlayState;
    activeCell: CellAddress;
    editing: boolean;
    errorCells?: ReadonlySet<string>;
    errorIndicatorColor?: string | null;
    label: string;
    cursor?: string;
    showGridLines?: boolean;
    locale?: string;
    dateSystem?: ExcelDateSystem;
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
    paintImages?: (context: CanvasRenderingContext2D) => void;
  }>(),
  { showGridLines: true, locale: "en-US", dateSystem: "1900" },
);
const emit = defineEmits<{
  pointerdown: [event: PointerEvent];
  pointermove: [event: PointerEvent];
  pointerleave: [event: PointerEvent];
  doubleClick: [event: MouseEvent];
  contextmenu: [event: MouseEvent];
  keydown: [event: KeyboardEvent];
  blur: [];
}>();
defineSlots<{ "active-cell"?: (props: { cellRect: Rect }) => unknown }>();
const { t } = useAppI18n();
const surfaceCanvas = ref<HTMLCanvasElement>();
const activeEditorId = `sheet-cell-editor-${useId().replaceAll(":", "")}`;
const viewportKey = computed(() => getCanvasViewportKey(props.frame.layout));
const presentationCache = createCellPresentationCache(browserCellTextMeasurer);
let scene: SheetCanvasScene | undefined;
let borderPlan: SheetBorderPaintPlan | undefined;
let context: CanvasRenderingContext2D | null = null;
let scheduler: ReturnType<typeof createSheetRenderScheduler> | undefined;
const images = createCanvasImageCache(() => invalidate());
const sizeStyle = computed(() => ({
  width: `${props.frame.size.width}px`,
  height: `${props.frame.size.height}px`,
}));

const activeEditor = computed(() => {
  const { layout, body } = props.frame;
  const address = layout.getAnchorForAddress(props.activeCell);
  const merged = layout.getMergedRangeAt(address);
  const fragments = merged ? layout.getRangePaneRects(merged) : undefined;
  const paneId = fragments?.[0]?.paneId ?? layout.getPaneForAddress(address);
  const rect = fragments?.[0]?.rect ?? layout.getCellViewportRect(address);
  if (!rect) return undefined;
  const clip = props.frame.panes[paneId].clip;
  return {
    paneId,
    cellRect: rect,
    paneStyle: {
      left: `${body.x + clip.x}px`,
      top: `${body.y + clip.y}px`,
      width: `${clip.width}px`,
      height: `${clip.height}px`,
      clipPath: `inset(${props.editing && rect.y === clip.y ? -1 : 0}px 0px 0px ${props.editing && rect.x === clip.x ? -1 : 0}px)`,
    },
    anchorStyle: { left: `${rect.x - clip.x}px`, top: `${rect.y - clip.y}px` },
  };
});
function invalidate(): void {
  scheduler?.invalidate();
}
function rebuildScene(): void {
  scene = createSheetCanvasScene({
    display: props.display,
    layout: props.frame.layout,
    columnCount: props.geometry.columnCount,
    locale: props.locale,
    dateSystem: props.dateSystem,
    fontRevision: cellTextFontRevision.value,
    cache: presentationCache,
  });
  borderPlan = createBorderPaintPlan(
    props.display.sheet,
    props.geometry,
    props.frame.layout,
    props.rows,
    props.display.getCellStyle,
  );
  invalidate();
}
function resize(element: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  const density = props.environment.density * props.frame.scale;
  const width = Math.ceil(props.frame.size.width * density);
  const height = Math.ceil(props.frame.size.height * density);
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  context.setTransform(density, 0, 0, density, 0, 0);
}
function paint(): void {
  if (!context || !scene || !borderPlan) return;
  const frame = props.frame;
  resize(surfaceCanvas.value!, context);
  context.fillStyle = props.environment.cells.background;
  context.fillRect(0, 0, frame.size.width, frame.size.height);
  context.save();
  context.translate(frame.body.x, frame.body.y);
  const pageBreakPreview =
    props.pageView?.mode === "page-break-preview" ? props.pageView : undefined;
  const paintScene = (showGridLines: boolean) =>
    paintSheetScene(context!, scene!, frame.layout, {
      palette: {
        ...props.environment.cells,
        errorIndicator: props.errorIndicatorColor ?? props.environment.cells.errorIndicator,
      },
      showGridLines,
      skipBackground: Boolean(props.pageView),
      editingCell: props.editing ? props.activeCell : undefined,
      errorCells: props.errorCells,
      imageUrls: props.imageAssetUrls,
      images,
      imagePlaceholder: (id) =>
        t(props.loadingImageAssetIds?.has(id) ? "image.loading" : "image.assetUnavailable"),
    });
  if (props.pageView?.mode === "page-layout") {
    paintPageLayoutBackground(
      context,
      props.pageView,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
      props.environment.cells.background,
    );
    clipPageContents(context, props.pageView, frame.layout.bodyScrollPosition);
    paintScene(props.showGridLines);
  } else if (pageBreakPreview) {
    const printed = paintPageBreakPreviewBackground(
      context,
      pageBreakPreview,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
      props.environment.cells.background,
    );
    context.save();
    if (clipPageBreakPreviewPrintArea(context, printed)) paintScene(props.showGridLines);
    context.restore();
    context.save();
    clipPageBreakPreviewOutside(context, printed, frame.layout.viewportSize);
    paintScene(false);
    context.restore();
  } else {
    paintScene(props.showGridLines);
  }
  context.restore();
  paintSheetUnderlay(context, frame, props.overlays, props.environment.overlays);
  context.save();
  context.translate(frame.body.x, frame.body.y);
  if (props.pageView?.mode === "page-layout")
    clipPageContents(context, props.pageView, frame.layout.bodyScrollPosition);
  paintSheetBorders(context, borderPlan, frame.layout);
  if (props.pageView?.mode === "page-break-preview")
    paintPageBreakPreview(
      context,
      props.pageView,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
    );
  context.restore();
  paintSheetForeground(context, frame, props.overlays, props.environment.overlays, 0);
  context.save();
  context.translate(frame.body.x, frame.body.y);
  if (props.pageView?.mode === "page-layout")
    clipPageContents(context, props.pageView, frame.layout.bodyScrollPosition);
  props.paintImages?.(context);
  context.restore();
  if (frame.headerSize.width || frame.headerSize.height)
    paintSheetHeaders(context, {
      ...props.headers,
      frame,
      backdrop: props.pageView?.mode === "page-layout" ? PAGE_LAYOUT_DESKTOP_COLOR : undefined,
      palette: {
        ...props.environment.headers,
        font: props.environment.headers.font.replace(
          /([\d.]+)px/,
          (_match, size) =>
            `${(props.pageView?.mode === "page-layout" ? 10 : Number(size)) * (props.pageView?.uiScale ?? 1)}px`,
        ),
      },
    });
  paintSheetChrome(context, frame, props.overlays, props.environment.overlays);
}
watch(
  [
    () => props.display,
    () => props.geometry,
    () => props.rows,
    viewportKey,
    () => props.frame.layout.freeze.rows,
    () => props.frame.layout.freeze.columns,
    () => props.locale,
    () => props.dateSystem,
    cellTextFontRevision,
  ],
  rebuildScene,
  { immediate: true, flush: "post" },
);
watch([() => props.frame, () => props.environment], () => invalidate(), { flush: "post" });
watch(
  () => props.pageView,
  () => invalidate(),
  { flush: "post" },
);
watch(
  [
    () => props.showGridLines,
    () => props.errorCells,
    () => props.errorIndicatorColor,
    () => props.imageAssetUrls,
    () => props.loadingImageAssetIds,
    () => props.editing,
    () => (props.editing ? `${props.activeCell.row}:${props.activeCell.column}` : ""),
  ],
  () => invalidate(),
  { flush: "post" },
);
watch([() => props.headers, () => props.overlays, () => props.paintImages], () => invalidate(), {
  flush: "post",
});
watch(cellTextFontRevision, clearCanvasTextMetrics, { flush: "sync" });
onMounted(() => {
  context = surfaceCanvas.value!.getContext("2d", { alpha: false });
  scheduler = createSheetRenderScheduler(paint);
  invalidate();
});
onBeforeUnmount(() => {
  scheduler?.dispose();
  images.dispose();
});
defineExpose({ invalidate });
</script>
<template>
  <div class="sheet-surface" :style="sizeStyle">
    <canvas
      ref="surfaceCanvas"
      class="sheet-surface__canvas"
      data-sheet-canvas
      data-sheet-surface
      tabindex="0"
      :aria-label="label"
      :style="{ cursor }"
      @pointerdown="emit('pointerdown', $event)"
      @pointermove="emit('pointermove', $event)"
      @pointerleave="emit('pointerleave', $event)"
      @dblclick="emit('doubleClick', $event)"
      @contextmenu="emit('contextmenu', $event)"
      @keydown="emit('keydown', $event)"
      @blur="emit('blur')"
    />
    <div
      v-if="activeEditor"
      class="sheet-surface__editor-pane"
      :style="activeEditor.paneStyle"
      :data-editor-pane="activeEditor.paneId"
    >
      <div
        :id="activeEditorId"
        class="sheet-surface__editor-anchor"
        :style="activeEditor.anchorStyle"
        data-cell-editor-anchor
      >
        <slot name="active-cell" :cell-rect="activeEditor.cellRect" />
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.sheet-surface {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  &__canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    user-select: none;
    touch-action: none;
  }
  &__editor-pane {
    position: absolute;
    z-index: 5;
    pointer-events: none;
  }
  &__editor-anchor {
    position: absolute;
  }
}
</style>
