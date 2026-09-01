import { computed, reactive, ref, watch, type CSSProperties, type WatchStopHandle } from "vue";
import {
  createGridExtent,
  expandGridExtentForAddress,
  expandGridExtentForViewport,
  type GridExtent,
  type GridExtentPolicy,
} from "@idea10/sheet-engine/extent";
import {
  createSheetGeometry,
  type Point,
  type Rect,
  type Size,
} from "@idea10/sheet-engine/geometry";
import { getSelectionMode, type CellSelection } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import type { CellAddress, CellRange } from "@idea10/core/workbook";

const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };

export function useSheetViewport(options: {
  initialExtent: GridExtent;
  getGridExtentPolicy: () => GridExtentPolicy;
  getColumnWidths: () => ReadonlyMap<number, number>;
  getRowHeights: () => ReadonlyMap<number, number>;
  getSelection: () => CellSelection;
  onScrollStart: () => void;
  onViewStateChange: (viewState: SheetGridViewState) => void;
}) {
  const scrollerRef = ref<HTMLDivElement | null>(null);
  const scrollPosition = reactive<Point>({ x: 0, y: 0 });
  const viewportSize = reactive<Size>({ ...DEFAULT_VIEWPORT_SIZE });
  const gridExtent = reactive<GridExtent>(createGridExtent(options.initialExtent));
  let resizeObserver: ResizeObserver | null = null;
  let stopGeometryWatch: WatchStopHandle | undefined;

  const geometry = computed(() =>
    createSheetGeometry({
      rowCount: gridExtent.rowCount,
      columnCount: gridExtent.columnCount,
      rowHeights: options.getRowHeights(),
      columnWidths: options.getColumnWidths(),
    }),
  );
  const totalSize = computed(() => geometry.value.getTotalSize());
  const visibleRange = computed(() =>
    geometry.value.getVisibleRange(scrollPosition, viewportSize, 2),
  );
  const gridCanvasStyle = computed<CSSProperties>(() => ({
    width: `${totalSize.value.width}px`,
    height: `${totalSize.value.height}px`,
  }));
  const gridViewportStyle = computed<CSSProperties>(() => ({
    width: `${viewportSize.width}px`,
    height: `${viewportSize.height}px`,
  }));

  function applyGridExtent(nextExtent: GridExtent): void {
    gridExtent.rowCount = nextExtent.rowCount;
    gridExtent.columnCount = nextExtent.columnCount;
  }

  function getCurrentViewState(): SheetGridViewState {
    return createSheetGridViewState({
      selection: options.getSelection(),
      scrollPosition,
      gridExtent,
    });
  }

  function emitViewState(): void {
    options.onViewStateChange(getCurrentViewState());
  }

  function ensureGridExtentContains(address: CellAddress): void {
    applyGridExtent(
      expandGridExtentForAddress(gridExtent, address, options.getGridExtentPolicy().growth),
    );
  }

  function ensureGridExtentCoversViewport(): void {
    applyGridExtent(
      expandGridExtentForViewport(
        gridExtent,
        scrollPosition,
        viewportSize,
        geometry.value,
        options.getGridExtentPolicy(),
      ),
    );
  }

  function updateViewportSize(): void {
    const scroller = scrollerRef.value;
    if (!scroller) {
      return;
    }
    viewportSize.width = scroller.clientWidth || DEFAULT_VIEWPORT_SIZE.width;
    viewportSize.height = scroller.clientHeight || DEFAULT_VIEWPORT_SIZE.height;
    ensureGridExtentCoversViewport();
  }

  function ensureSelectionVisible(
    address: CellAddress,
    mode = getSelectionMode(options.getSelection()),
  ): void {
    const scroller = scrollerRef.value;
    if (!scroller) {
      return;
    }
    const nextScrollPosition = geometry.value.getScrollPositionForCell(
      address,
      scrollPosition,
      viewportSize,
    );
    if (mode !== "rows" && mode !== "all" && nextScrollPosition.x !== scrollPosition.x) {
      scroller.scrollLeft = nextScrollPosition.x;
      scrollPosition.x = nextScrollPosition.x;
    }
    if (mode !== "columns" && mode !== "all" && nextScrollPosition.y !== scrollPosition.y) {
      scroller.scrollTop = nextScrollPosition.y;
      scrollPosition.y = nextScrollPosition.y;
    }
  }

  function getCellAtClientPoint(clientX: number, clientY: number): CellAddress | null {
    const scroller = scrollerRef.value;
    if (!scroller) {
      return null;
    }
    const bounds = scroller.getBoundingClientRect();
    const width = bounds.width || viewportSize.width;
    const height = bounds.height || viewportSize.height;
    const x = Math.min(Math.max(clientX - bounds.left, 0), Math.max(0, width - 1));
    const y = Math.min(Math.max(clientY - bounds.top, 0), Math.max(0, height - 1));
    return geometry.value.getCellAtPoint({ x: x + scrollPosition.x, y: y + scrollPosition.y });
  }

  function getRangeViewportRect(range: CellRange, alignToGridlines = false): Rect {
    const startRect = geometry.value.getCellViewportRect(range.start, scrollPosition);
    const endRect = geometry.value.getCellViewportRect(range.end, scrollPosition);
    const left = Math.max(0, startRect.x - (alignToGridlines && range.start.column > 0 ? 1 : 0));
    const top = Math.max(0, startRect.y - (alignToGridlines && range.start.row > 0 ? 1 : 0));
    const right = Math.min(viewportSize.width, endRect.x + endRect.width);
    const bottom = Math.min(viewportSize.height, endRect.y + endRect.height);
    return {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function onScroll(event: Event): void {
    const scroller = event.currentTarget as HTMLDivElement;
    options.onScrollStart();
    scrollPosition.x = scroller.scrollLeft;
    scrollPosition.y = scroller.scrollTop;
    ensureGridExtentCoversViewport();
    emitViewState();
  }

  function restore(viewState?: SheetGridViewState): SheetGridViewState {
    const nextViewState = viewState
      ? createSheetGridViewState(viewState)
      : createSheetGridViewState({ gridExtent: options.initialExtent });
    applyGridExtent(nextViewState.gridExtent);
    ensureGridExtentContains(nextViewState.selection.focus);
    const scroller = scrollerRef.value;
    if (scroller) {
      scroller.scrollLeft = nextViewState.scrollPosition.x;
      scroller.scrollTop = nextViewState.scrollPosition.y;
    }
    scrollPosition.x = nextViewState.scrollPosition.x;
    scrollPosition.y = nextViewState.scrollPosition.y;
    ensureGridExtentCoversViewport();
    return nextViewState;
  }

  function observe(): void {
    const scroller = scrollerRef.value;
    if (scroller && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateViewportSize);
      resizeObserver.observe(scroller);
    }
  }

  function stopObserving(): void {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  function startGeometryWatch(): void {
    stopGeometryWatch?.();
    stopGeometryWatch = watch(
      geometry,
      (nextGeometry, previousGeometry) => {
        const scroller = scrollerRef.value;
        if (!scroller || scrollPosition.y <= 0) {
          return;
        }
        const anchor = previousGeometry.getCellAtPoint({ x: 0, y: scrollPosition.y });
        if (!anchor || anchor.row >= nextGeometry.rowCount) {
          return;
        }
        const offsetWithinRow = scrollPosition.y - previousGeometry.getRowOffset(anchor.row);
        const nextScrollTop =
          nextGeometry.getRowOffset(anchor.row) +
          Math.min(offsetWithinRow, nextGeometry.getRowHeight(anchor.row) - 1);
        if (nextScrollTop !== scrollPosition.y) {
          scroller.scrollTop = nextScrollTop;
          scrollPosition.y = nextScrollTop;
          emitViewState();
        }
      },
      { flush: "sync" },
    );
  }

  function stopGeometryWatching(): void {
    stopGeometryWatch?.();
    stopGeometryWatch = undefined;
  }

  return {
    geometry,
    getCellAtClientPoint,
    getCurrentViewState,
    getRangeViewportRect,
    gridCanvasStyle,
    gridExtent,
    gridViewportStyle,
    ensureGridExtentContains,
    ensureGridExtentCoversViewport,
    ensureSelectionVisible,
    emitViewState,
    observe,
    onScroll,
    restore,
    scrollPosition,
    scrollerRef,
    startGeometryWatch,
    stopGeometryWatching,
    stopObserving,
    updateViewportSize,
    viewportSize,
    visibleRange,
  };
}
