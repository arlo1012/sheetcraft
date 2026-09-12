<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from "vue";
import type { CellAddress, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { Rect, SheetGeometry } from "@idea10/sheet-engine/geometry";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
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
import { paintSheetScene, type SheetCanvasPalette } from "../canvas/scene-painter";

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    evaluator: SheetEvaluator;
    geometry: SheetGeometry;
    rows: RowVisibilityIndex;
    layout: SheetViewportLayout;
    activeCell: CellAddress;
    editing: boolean;
    workbookRevision?: number;
    scale?: number;
    showGridLines?: boolean;
    locale?: string;
    dateSystem?: ExcelDateSystem;
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
  }>(),
  { scale: 1, showGridLines: true, locale: "en-US", dateSystem: "1900" },
);

const emit = defineEmits<{
  cellMousedown: [address: CellAddress, event: MouseEvent];
  cellDoubleClick: [address: CellAddress, event: MouseEvent];
  cellContextmenu: [address: CellAddress, event: MouseEvent];
}>();
defineSlots<{ "active-cell"?: (props: { cellRect: Rect }) => unknown }>();

const { t } = useAppI18n();
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const borderCanvas = ref<HTMLCanvasElement>();
const scene = shallowRef<SheetCanvasScene>();
const borderPlan = shallowRef<SheetBorderPaintPlan>();
const presentationCache = createCellPresentationCache(browserCellTextMeasurer);
const images = createCanvasImageCache(schedulePaint);
const activeEditorId = `sheet-cell-editor-${useId().replaceAll(":", "")}`;
const viewportKey = computed(() => getCanvasViewportKey(props.layout));
let context: CanvasRenderingContext2D | null = null;
let borderContext: CanvasRenderingContext2D | null = null;
let frame: number | undefined;
let palette: SheetCanvasPalette;
let densityQuery: MediaQueryList | undefined;
let themeObserver: MutationObserver | undefined;

const activeEditor = computed(() => {
  const layout = props.layout;
  const address = layout.getAnchorForAddress(props.activeCell);
  const merged = layout.getMergedRangeAt(address);
  const fragments = merged ? layout.getRangePaneRects(merged) : undefined;
  const paneId = fragments?.[0]?.paneId ?? layout.getPaneForAddress(address);
  const rect = fragments?.[0]?.rect ?? layout.getCellViewportRect(address);
  if (!rect) return undefined;
  const clip = layout.panes[paneId].clip;
  const leftInset = props.editing && rect.x === clip.x ? -1 : 0;
  const topInset = props.editing && rect.y === clip.y ? -1 : 0;
  return {
    paneId,
    cellRect: rect,
    paneStyle: {
      left: `${clip.x}px`,
      top: `${clip.y}px`,
      width: `${clip.width}px`,
      height: `${clip.height}px`,
      clipPath: `inset(${topInset}px 0px 0px ${leftInset}px)`,
    },
    anchorStyle: { left: `${rect.x - clip.x}px`, top: `${rect.y - clip.y}px` },
  };
});

function schedulePaint(): void {
  if (!context || frame !== undefined) return;
  frame = requestAnimationFrame(paint);
}

function resizeCanvas(element: HTMLCanvasElement, target: CanvasRenderingContext2D): void {
  const density = window.devicePixelRatio * props.scale;
  const width = Math.ceil(props.layout.viewportSize.width * density);
  const height = Math.ceil(props.layout.viewportSize.height * density);
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  target.setTransform(density, 0, 0, density, 0, 0);
}

function paint(): void {
  frame = undefined;
  if (!context || !borderContext || !scene.value || !borderPlan.value) return;
  resizeCanvas(canvas.value!, context);
  resizeCanvas(borderCanvas.value!, borderContext);
  paintSheetScene(context, scene.value, props.layout, {
    palette,
    showGridLines: props.showGridLines,
    editingCell: props.editing ? props.activeCell : undefined,
    imageUrls: props.imageAssetUrls,
    images,
    imagePlaceholder: (assetId) =>
      t(props.loadingImageAssetIds?.has(assetId) ? "image.loading" : "image.assetUnavailable"),
  });
  borderContext.clearRect(0, 0, props.layout.viewportSize.width, props.layout.viewportSize.height);
  paintSheetBorders(borderContext, borderPlan.value, props.layout);
}

watch(
  [
    () => props.sheet,
    () => props.evaluator,
    () => props.geometry,
    () => props.rows,
    () => props.sheet.mergedCells,
    () => props.workbookRevision,
    () => props.layout.freeze.rows,
    () => props.layout.freeze.columns,
    viewportKey,
    () => props.locale,
    () => props.dateSystem,
    cellTextFontRevision,
  ],
  () => {
    scene.value = createSheetCanvasScene({
      sheet: props.sheet,
      evaluator: props.evaluator,
      layout: props.layout,
      columnCount: props.geometry.columnCount,
      locale: props.locale,
      dateSystem: props.dateSystem,
      fontRevision: cellTextFontRevision.value,
      cache: presentationCache,
    });
    borderPlan.value = createBorderPaintPlan(props.sheet, props.geometry, props.layout, props.rows);
    schedulePaint();
  },
  { immediate: true, flush: "post" },
);

watch(
  [
    () => props.layout,
    () => props.scale,
    () => props.showGridLines,
    () => props.imageAssetUrls,
    () => props.editing,
    () => (props.editing ? `${props.activeCell.row}:${props.activeCell.column}` : ""),
  ],
  schedulePaint,
  { flush: "post" },
);

watch(cellTextFontRevision, clearCanvasTextMetrics, { flush: "sync" });
watch(() => props.loadingImageAssetIds, schedulePaint, { flush: "post" });

function getAddress(event: MouseEvent): CellAddress | null {
  const bounds = canvas.value!.getBoundingClientRect();
  return props.layout.getCellAtViewportPoint({
    x: (event.clientX - bounds.left) / props.scale,
    y: (event.clientY - bounds.top) / props.scale,
  });
}

function onMousedown(event: MouseEvent): void {
  const address = getAddress(event);
  if (address) emit("cellMousedown", address, event);
}
function onDoubleClick(event: MouseEvent): void {
  const address = getAddress(event);
  if (address) emit("cellDoubleClick", address, event);
}
function onContextmenu(event: MouseEvent): void {
  const address = getAddress(event);
  if (address) emit("cellContextmenu", address, event);
}

function observePixelDensity(): void {
  densityQuery?.removeEventListener("change", observePixelDensity);
  densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  densityQuery.addEventListener("change", observePixelDensity);
  schedulePaint();
}

function refreshPalette(): void {
  const styles = getComputedStyle(root.value!);
  palette = {
    background: styles.getPropertyValue("--idea-surface-panel").trim() || "#ffffff",
    text: styles.getPropertyValue("--idea-text-primary").trim() || "#202124",
    gridLine: styles.getPropertyValue("--idea-border-subtle").trim() || "#e5e7eb",
    mutedText: styles.getPropertyValue("--idea-text-secondary").trim() || "#666666",
  };
  schedulePaint();
}

onMounted(() => {
  refreshPalette();
  context = canvas.value!.getContext("2d", { alpha: false });
  borderContext = borderCanvas.value!.getContext("2d");
  themeObserver = new MutationObserver(refreshPalette);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "theme-mode"],
  });
  observePixelDensity();
});
onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame);
  densityQuery?.removeEventListener("change", observePixelDensity);
  themeObserver?.disconnect();
  images.dispose();
});
</script>

<template>
  <div ref="root" class="sheet-canvas-layer">
    <canvas
      ref="canvas"
      class="sheet-canvas-layer__content"
      data-sheet-canvas
      aria-hidden="true"
      @mousedown.left.prevent="onMousedown"
      @dblclick.left.prevent="onDoubleClick"
      @contextmenu="onContextmenu"
    />
    <canvas
      ref="borderCanvas"
      class="sheet-canvas-layer__borders"
      data-sheet-border-canvas
      aria-hidden="true"
    />
    <div
      v-if="activeEditor"
      class="sheet-canvas-layer__editor-pane"
      :style="activeEditor.paneStyle"
      :data-editor-pane="activeEditor.paneId"
    >
      <div
        :id="activeEditorId"
        class="sheet-canvas-layer__editor-anchor"
        :style="activeEditor.anchorStyle"
        data-cell-editor-anchor
      >
        <slot name="active-cell" :cell-rect="activeEditor.cellRect" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-canvas-layer {
  position: absolute;
  inset: 0;
  &__content,
  &__borders {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
  &__content {
    user-select: none;
  }
  &__borders {
    z-index: 2;
    pointer-events: none;
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
