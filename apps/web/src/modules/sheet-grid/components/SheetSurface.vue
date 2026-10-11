<script setup lang="ts">
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { Button } from "tdesign-vue-next";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";
import { getAttributedDomCells } from "../canvas/attributed-dom-overlay";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
  retryCellFontResource,
  useCellFontResources,
} from "../../../shared/cell-text/font-resources";
import { findLocalSymbolFont } from "../../../shared/cell-text/local-font-source";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { SheetPageDecoration } from "@sheetcraft/core/page-decoration";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import type { Rect, SheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import type { RowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
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
import { paintSheetCellIndicators, paintSheetScene } from "../canvas/scene-painter";
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
import type { SheetPagination } from "@sheetcraft/sheet-engine/page-layout";
import {
  clipPageBreakPreviewOutside,
  clipPageBreakPreviewPrintArea,
  clipPageContents,
  paintPageBreakPreviewBackground,
  paintPageLayoutBackground,
  PAGE_LAYOUT_DESKTOP_COLOR,
  paintPageBreakPreview,
} from "../../page-layout/rendering/page-view-painter";
import {
  paintSheetBackground,
  paintSheetWatermark,
} from "../../page-decorations/page-decoration-painter";
import { paintPageBreakGuides } from "../../page-layout/rendering/page-break-guides";

const props = withDefaults(
  defineProps<{
    display: SheetDisplaySnapshot;
    geometry: SheetGeometry;
    rows: RowVisibilityIndex;
    frame: SheetRenderFrame;
    environment: SheetRenderEnvironment;
    pageView?: PageViewPaintState;
    pageBreakGuides?: Pick<SheetPagination, "rowBreaks" | "columnBreaks">;
    headers: Omit<HeaderPaintState, "frame" | "palette">;
    overlays: SheetOverlayState;
    activeCell: CellAddress;
    editing: boolean;
    errorCells?: ReadonlySet<string>;
    errorIndicatorColor?: string | null;
    label: string;
    title?: string;
    cursor?: string;
    showGridLines?: boolean;
    locale?: string;
    dateSystem?: ExcelDateSystem;
    imageAssetUrls?: ReadonlyMap<string, string>;
    imageTheme?: WorkbookTheme;
    loadingImageAssetIds?: ReadonlySet<string>;
    paintImages?: (context: CanvasRenderingContext2D) => void;
    pageDecoration?: SheetPageDecoration;
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
const foregroundCanvas = ref<HTMLCanvasElement>();
const foregroundAvailable = ref(false);
const activeEditorId = `sheet-cell-editor-${useId().replaceAll(":", "")}`;
const viewportKey = computed(() => getCanvasViewportKey(props.frame.layout));
const presentationCache = createCellPresentationCache(browserCellTextMeasurer);
let scene: SheetCanvasScene | undefined;
const sceneRevision = ref(0);
const fontResources = useCellFontResources();
const visibleFontFamilies = ref<readonly string[]>([]);
const hasFontProjectionWarning = ref(false);
const attributedDomCells = computed(() => {
  void sceneRevision.value;
  return getAttributedDomCells({
    scene,
    frame: props.frame,
    editingCell: props.editing ? props.activeCell : undefined,
    pageView: props.pageView,
  });
});
const renderedAttributedDomCells = computed(() =>
  foregroundAvailable.value ? attributedDomCells.value : [],
);
const failedFontFamilies = computed(() =>
  visibleFontFamilies.value.filter(
    (family) => fontResources.resources.value.get(family)?.state === "error",
  ),
);
const failedFontLabels = computed(() =>
  failedFontFamilies.value
    .map((family) => findLocalSymbolFont(family)?.displayFamily ?? family)
    .join(", "),
);
function retryVisibleFonts(): void {
  for (const family of failedFontFamilies.value)
    void retryCellFontResource(family).catch(() => undefined);
}
let borderPlan: SheetBorderPaintPlan | undefined;
let context: CanvasRenderingContext2D | null = null;
let foregroundContext: CanvasRenderingContext2D | null = null;
let scheduler: ReturnType<typeof createSheetRenderScheduler> | undefined;
const images = createCanvasImageCache(() => invalidate());
const backgroundImages = createCanvasImageCache(() => invalidate());
const watermarkImages = createCanvasImageCache(() => invalidate());
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
  sceneRevision.value++;
  const families = new Set<string>();
  hasFontProjectionWarning.value = false;
  for (const pane of scene.panes)
    for (const cell of pane.cells) {
      if (!cell.content.text) continue;
      hasFontProjectionWarning.value ||= Boolean(cell.content.fontProjectionUnavailable);
      for (const family of getCellFontResourceFamilies(cell.content.style?.fontFamily ?? ""))
        families.add(family);
      for (const run of cell.content.fontRuns ?? [])
        for (const family of getCellFontResourceFamilies(run.fontFamily)) families.add(family);
    }
  visibleFontFamilies.value = [...families];
  for (const family of families) void ensureCellFontResource(family).catch(() => undefined);
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
  if (foregroundContext && foregroundCanvas.value) {
    resize(foregroundCanvas.value, foregroundContext);
    // Clear the entire backing store, including fractional-density edge pixels.
    // This layer must remain transparent between changed selections and objects.
    foregroundContext.save();
    foregroundContext.setTransform(1, 0, 0, 1, 0, 0);
    foregroundContext.clearRect(0, 0, foregroundCanvas.value.width, foregroundCanvas.value.height);
    foregroundContext.restore();
  }
  const splitTextLayer = renderedAttributedDomCells.value.length > 0;
  const overlayContext = splitTextLayer ? foregroundContext! : context;
  context.fillStyle = props.environment.cells.background;
  context.fillRect(0, 0, frame.size.width, frame.size.height);
  context.save();
  context.translate(frame.body.x, frame.body.y);
  const backgroundUrl = props.pageDecoration?.backgroundAssetId
    ? props.imageAssetUrls?.get(props.pageDecoration.backgroundAssetId)
    : undefined;
  const watermarkUrl = props.pageDecoration?.watermark?.image?.assetId
    ? props.imageAssetUrls?.get(props.pageDecoration.watermark.image.assetId)
    : undefined;
  const watermarkImage = watermarkUrl ? watermarkImages.get(watermarkUrl) : undefined;
  const paintBackground = () =>
    paintSheetBackground(
      context!,
      backgroundUrl,
      backgroundUrl ? backgroundImages.get(backgroundUrl) : undefined,
      frame,
    );
  const pageBreakPreview =
    props.pageView?.mode === "page-break-preview" ? props.pageView : undefined;
  let printed: Rect | undefined;
  const paintScene = (showGridLines: boolean) =>
    paintSheetScene(context!, scene!, frame.layout, {
      palette: {
        ...props.environment.cells,
        errorIndicator: props.errorIndicatorColor ?? props.environment.cells.errorIndicator,
      },
      showGridLines,
      screenScale: frame.scale,
      skipBackground: Boolean(props.pageView) || Boolean(backgroundUrl),
      editingCell: props.editing ? props.activeCell : undefined,
      errorCells: props.errorCells,
      imageUrls: props.imageAssetUrls,
      imageTheme: props.imageTheme,
      images,
      imagePlaceholder: (id) =>
        t(props.loadingImageAssetIds?.has(id) ? "image.loading" : "image.assetUnavailable"),
      attributedBidiMode: splitTextLayer ? "dom" : "plain",
      skipCellIndicators: splitTextLayer,
    });
  if (props.pageView?.mode === "page-layout") {
    paintPageLayoutBackground(
      context,
      props.pageView,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
      props.environment.cells.background,
      frame.scale,
    );
    // Cells stay inside the printable content. Restore this clip before painting
    // the watermark so its page-paper overlay remains visible in the margins.
    context.save();
    clipPageContents(context, props.pageView, frame.layout.bodyScrollPosition);
    // Background images tile on-screen only; a page-layout view still represents the sheet surface.
    paintBackground();
    paintScene(props.showGridLines);
    context.restore();
  } else if (pageBreakPreview) {
    printed = paintPageBreakPreviewBackground(
      context,
      pageBreakPreview,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
      props.environment.cells.background,
    );
    paintBackground();
    context.save();
    if (clipPageBreakPreviewPrintArea(context, printed)) paintScene(props.showGridLines);
    context.restore();
    context.save();
    clipPageBreakPreviewOutside(context, printed, frame.layout.viewportSize);
    paintScene(false);
    context.restore();
  } else {
    paintBackground();
    paintScene(props.showGridLines);
  }
  context.restore();
  overlayContext.save();
  overlayContext.translate(frame.body.x, frame.body.y);
  if (splitTextLayer) {
    const paintIndicators = () =>
      paintSheetCellIndicators(overlayContext, scene!, frame.layout, {
        errorIndicator: props.errorIndicatorColor ?? props.environment.cells.errorIndicator,
        editingCell: props.editing ? props.activeCell : undefined,
        errorCells: props.errorCells,
      });
    if (props.pageView?.mode === "page-layout") {
      overlayContext.save();
      clipPageContents(overlayContext, props.pageView, frame.layout.bodyScrollPosition);
      paintIndicators();
      overlayContext.restore();
    } else if (pageBreakPreview) {
      overlayContext.save();
      if (clipPageBreakPreviewPrintArea(overlayContext, printed)) paintIndicators();
      overlayContext.restore();
      overlayContext.save();
      clipPageBreakPreviewOutside(overlayContext, printed, frame.layout.viewportSize);
      paintIndicators();
      overlayContext.restore();
    } else paintIndicators();
  }
  paintSheetWatermark(overlayContext, props.pageDecoration, frame, props.pageView, watermarkImage);
  overlayContext.restore();
  paintSheetUnderlay(overlayContext, frame, props.overlays, props.environment.overlays);
  overlayContext.save();
  overlayContext.translate(frame.body.x, frame.body.y);
  if (props.pageView?.mode === "page-layout")
    clipPageContents(overlayContext, props.pageView, frame.layout.bodyScrollPosition);
  paintSheetBorders(overlayContext, borderPlan, frame.layout);
  if (props.pageBreakGuides) paintPageBreakGuides(overlayContext, frame, props.pageBreakGuides);
  if (props.pageView?.mode === "page-break-preview")
    paintPageBreakPreview(
      overlayContext,
      props.pageView,
      frame.layout.bodyScrollPosition,
      frame.layout.viewportSize,
      frame.scale,
    );
  overlayContext.restore();
  paintSheetForeground(overlayContext, frame, props.overlays, props.environment.overlays, 0);
  overlayContext.save();
  overlayContext.translate(frame.body.x, frame.body.y);
  if (props.pageView?.mode === "page-layout")
    clipPageContents(overlayContext, props.pageView, frame.layout.bodyScrollPosition);
  props.paintImages?.(overlayContext);
  overlayContext.restore();
  if (frame.headerSize.width || frame.headerSize.height)
    paintSheetHeaders(overlayContext, {
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
  paintSheetChrome(overlayContext, frame, props.overlays, props.environment.overlays);
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
    fontResources.revision,
  ],
  rebuildScene,
  { immediate: true, flush: "post" },
);
watch([() => props.frame, () => props.environment], () => invalidate(), { flush: "post" });
watch([() => props.pageView, () => props.pageBreakGuides], () => invalidate(), { flush: "post" });
watch(
  [
    () => props.showGridLines,
    () => props.errorCells,
    () => props.errorIndicatorColor,
    () => props.imageAssetUrls,
    () => props.pageDecoration,
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
watch(
  foregroundCanvas,
  (element) => {
    foregroundContext = element?.getContext("2d", { alpha: true }) ?? null;
    foregroundAvailable.value = Boolean(foregroundContext);
    invalidate();
  },
  { flush: "post" },
);
onMounted(() => {
  context = surfaceCanvas.value!.getContext("2d", { alpha: false });
  scheduler = createSheetRenderScheduler(paint);
  invalidate();
});
onBeforeUnmount(() => {
  scheduler?.dispose();
  context = null;
  foregroundContext = null;
  images.dispose();
  backgroundImages.dispose();
  watermarkImages.dispose();
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
      :title="title"
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
      v-for="item in renderedAttributedDomCells"
      :key="item.key"
      class="sheet-surface__attributed-clip"
      :data-attributed-pane="item.paneId"
      aria-hidden="true"
      :style="{
        left: `${item.clip.x}px`,
        top: `${item.clip.y}px`,
        width: `${item.clip.width}px`,
        height: `${item.clip.height}px`,
      }"
    >
      <div
        class="sheet-surface__attributed-cell"
        :style="{
          left: `${item.placement.x}px`,
          top: `${item.placement.y}px`,
          width: `${item.placement.width}px`,
          height: `${item.placement.height}px`,
          color: item.cell.content.style?.textColor ?? environment.cells.text,
        }"
      >
        <CellTextContent
          :text="item.cell.content.text"
          :text-layout="item.cell.content.textLayout"
          :cell-style="item.cell.content.style"
          :width="item.placement.width"
          :height="item.placement.height"
        />
      </div>
    </div>
    <canvas
      v-if="attributedDomCells.length"
      ref="foregroundCanvas"
      class="sheet-surface__canvas sheet-surface__canvas--foreground"
      data-sheet-foreground-canvas
      aria-hidden="true"
    />
    <div
      v-if="failedFontFamilies.length || hasFontProjectionWarning"
      class="sheet-surface__font-warning"
      role="status"
    >
      <span v-if="failedFontFamilies.length">{{
        t("symbolTools.cellFontUnavailable", { family: failedFontLabels })
      }}</span>
      <span v-else>{{ t("symbolTools.fontProjectionUnavailable") }}</span>
      <Button
        v-if="failedFontFamilies.length"
        size="small"
        variant="text"
        @click="retryVisibleFonts"
      >
        {{ t("symbolTools.fontRetry") }}
      </Button>
    </div>
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
    z-index: 0;
    width: 100%;
    height: 100%;
    outline: none;
    user-select: none;
    touch-action: none;
  }
  &__canvas--foreground {
    z-index: 2;
    pointer-events: none;
  }
  &__editor-pane {
    position: absolute;
    z-index: 5;
    pointer-events: none;
  }
  &__attributed-clip {
    position: absolute;
    z-index: 1;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
  }
  &__attributed-cell {
    position: absolute;
    pointer-events: none;
  }
  &__font-warning {
    position: absolute;
    right: 8px;
    top: 8px;
    z-index: 4;
    max-width: min(420px, calc(100% - 16px));
    padding: 8px 12px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: 6px;
    background: var(--sheetcraft-surface-panel);
    color: var(--sheetcraft-text-primary);
    font-size: 12px;
    line-height: 1.5;
  }
  &__editor-anchor {
    position: absolute;
  }
}
</style>
