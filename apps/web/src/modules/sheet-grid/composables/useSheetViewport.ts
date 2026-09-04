import { computed, reactive, ref, watch, type CSSProperties, type WatchStopHandle } from "vue";
import {
  createGridExtent,
  expandGridExtentForAddress,
  expandGridExtentForViewport,
  type GridExtent,
  type GridExtentPolicy,
} from "@idea10/sheet-engine/extent";
import { createSheetGeometry, type Point, type Size } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex, type HiddenRowInterval } from "@idea10/sheet-engine/visibility";
import { getSelectionMode, type CellSelection } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import { MergedCellRangeResolver } from "@idea10/core";
import { DEFAULT_ROW_HEIGHT, type CellAddress, type CellRange } from "@idea10/core/workbook";

const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };

export function useSheetViewport(options: {
  initialExtent: GridExtent;
  getGridExtentPolicy: () => GridExtentPolicy;
  getColumnWidths: () => ReadonlyMap<number, number>;
  getRowHeights: () => ReadonlyMap<number, number>;
  getFreezePanes: () => { rows: number; columns: number };
  getMergedCells: () => readonly CellRange[];
  getHiddenRowIntervals: () => readonly HiddenRowInterval[];
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

  function applyGridExtent(nextExtent: GridExtent): void {
    gridExtent.rowCount = nextExtent.rowCount;
    gridExtent.columnCount = nextExtent.columnCount;
  }

  function ensureGridExtentContains(address: CellAddress): void {
    applyGridExtent(
      expandGridExtentForAddress(gridExtent, address, options.getGridExtentPolicy().growth),
    );
  }

  function ensureGridExtentContainsMetadata(): void {
    const freeze = options.getFreezePanes();
    if (freeze.rows > 0) ensureGridExtentContains({ row: freeze.rows - 1, column: 0 });
    if (freeze.columns > 0) ensureGridExtentContains({ row: 0, column: freeze.columns - 1 });
    for (const range of options.getMergedCells()) {
      ensureGridExtentContains(range.start);
      ensureGridExtentContains(range.end);
    }
  }

  // Metadata may reference cells beyond the initial blank-grid allocation.
  ensureGridExtentContainsMetadata();

  const geometry = computed(() =>
    createSheetGeometry({
      rowCount: gridExtent.rowCount,
      columnCount: gridExtent.columnCount,
      rowHeights: options.getRowHeights(),
      columnWidths: options.getColumnWidths(),
    }),
  );
  const rowVisibility = computed(() =>
    createRowVisibilityIndex({
      rowCount: gridExtent.rowCount,
      defaultRowHeight: DEFAULT_ROW_HEIGHT,
      rowHeights: options.getRowHeights(),
      hiddenIntervals: options.getHiddenRowIntervals(),
    }),
  );
  const mergeResolver = computed(() => new MergedCellRangeResolver(options.getMergedCells()));
  const layout = computed(() => {
    return createSheetViewportLayout({
      geometry: geometry.value,
      rows: rowVisibility.value,
      freeze: options.getFreezePanes(),
      bodyScrollPosition: scrollPosition,
      viewportSize,
      overscan: 2,
      mergeResolver: {
        getRangeAt: (address) => mergeResolver.value.getRangeAtAddress(address),
      },
    });
  });
  const gridCanvasStyle = computed<CSSProperties>(() => ({
    width: `${layout.value.nativeScrollSize.width}px`,
    height: `${layout.value.nativeScrollSize.height}px`,
  }));
  const gridViewportStyle = computed<CSSProperties>(() => ({
    width: `${viewportSize.width}px`,
    height: `${viewportSize.height}px`,
  }));
  const rowHeaderPanes = computed(() =>
    (
      [
        { id: "frozen", pane: layout.value.panes.topLeft },
        { id: "body", pane: layout.value.panes.left },
      ] as const
    ).map(({ id, pane }) => ({
      id,
      offset: pane.clip.y,
      size: pane.clip.height,
      items: pane.rows.flatMap((row) => {
        const rect = layout.value.getCellViewportRect({ row: row.index, column: 0 });
        return rect ? [{ index: row.index, offset: rect.y, size: row.size }] : [];
      }),
    })),
  );
  const columnHeaderPanes = computed(() =>
    (
      [
        { id: "frozen", pane: layout.value.panes.topLeft },
        { id: "body", pane: layout.value.panes.top },
      ] as const
    ).map(({ id, pane }) => ({
      id,
      offset: pane.clip.x,
      size: pane.clip.width,
      items: pane.columns.flatMap((column) => {
        const rect = layout.value.getCellViewportRect({ row: 0, column: column.index });
        return rect ? [{ index: column.index, offset: rect.x, size: column.size }] : [];
      }),
    })),
  );

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

  function ensureGridExtentCoversViewport(): void {
    ensureGridExtentContainsMetadata();
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
    if (!scroller) return;
    viewportSize.width = scroller.clientWidth || DEFAULT_VIEWPORT_SIZE.width;
    viewportSize.height = scroller.clientHeight || DEFAULT_VIEWPORT_SIZE.height;
    ensureGridExtentCoversViewport();
  }

  function setNativeScrollPosition(position: Point): void {
    const scroller = scrollerRef.value;
    if (scroller) {
      scroller.scrollLeft = position.x;
      scroller.scrollTop = position.y;
    }
    scrollPosition.x = position.x;
    scrollPosition.y = position.y;
  }

  watch(
    [options.getFreezePanes, options.getMergedCells],
    () => {
      ensureGridExtentCoversViewport();
      setNativeScrollPosition(layout.value.bodyScrollPosition);
    },
    { deep: true },
  );

  function ensureSelectionVisible(
    address: CellAddress,
    mode = getSelectionMode(options.getSelection()),
  ): void {
    const next = layout.value.getScrollPositionForAddress(address);
    const position = { ...scrollPosition };
    if (mode !== "rows" && mode !== "all") position.x = next.x;
    if (mode !== "columns" && mode !== "all") position.y = next.y;
    setNativeScrollPosition(position);
  }

  function getCellAtClientPoint(clientX: number, clientY: number): CellAddress | null {
    const scroller = scrollerRef.value;
    if (!scroller) return null;
    const bounds = scroller.getBoundingClientRect();
    const width = bounds.width || viewportSize.width;
    const height = bounds.height || viewportSize.height;
    return layout.value.getCellAtViewportPoint({
      x: Math.min(Math.max(clientX - bounds.left, 0), Math.max(0, width - 1)),
      y: Math.min(Math.max(clientY - bounds.top, 0), Math.max(0, height - 1)),
    });
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
    const next = viewState
      ? createSheetGridViewState(viewState)
      : createSheetGridViewState({ gridExtent: options.initialExtent });
    applyGridExtent(next.gridExtent);
    ensureGridExtentContains(next.selection.focus);
    ensureGridExtentContainsMetadata();
    const restored = createSheetViewportLayout({
      geometry: geometry.value,
      rows: rowVisibility.value,
      freeze: options.getFreezePanes(),
      bodyScrollPosition: next.scrollPosition,
      viewportSize,
    }).bodyScrollPosition;
    setNativeScrollPosition(restored);
    ensureGridExtentCoversViewport();
    return next;
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
      [geometry, rowVisibility],
      ([nextGeometry, nextRows], [previousGeometry, previousRows]) => {
        const scroller = scrollerRef.value;
        if (!scroller || scrollPosition.y <= 0) return;
        const oldFreezeHeight = previousRows.getBoundaryOffset(options.getFreezePanes().rows) ?? 0;
        const anchor = previousRows.getLogicalRowAtOffset(oldFreezeHeight + scrollPosition.y);
        const nextRow = anchor === null ? null : nextRows.getVisibleRow(anchor);
        const previousRow = anchor === null ? null : previousRows.getVisibleRow(anchor);
        if (!nextRow || !previousRow) return;
        const offsetWithinRow = scrollPosition.y + oldFreezeHeight - previousRow.offset;
        const nextFreezeHeight = nextRows.getBoundaryOffset(options.getFreezePanes().rows) ?? 0;
        const nextScrollTop = Math.max(
          0,
          nextRow.offset + Math.min(offsetWithinRow, nextRow.height - 1) - nextFreezeHeight,
        );
        if (nextScrollTop !== scrollPosition.y) {
          void nextGeometry;
          void previousGeometry;
          setNativeScrollPosition({ x: scrollPosition.x, y: nextScrollTop });
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
    columnHeaderPanes,
    geometry,
    getCellAtClientPoint,
    getCurrentViewState,
    gridCanvasStyle,
    gridExtent,
    gridViewportStyle,
    ensureGridExtentContains,
    ensureGridExtentCoversViewport,
    ensureSelectionVisible,
    emitViewState,
    layout,
    observe,
    onScroll,
    restore,
    rowHeaderPanes,
    rowVisibility,
    scrollPosition,
    scrollerRef,
    startGeometryWatch,
    stopGeometryWatching,
    stopObserving,
    updateViewportSize,
    viewportSize,
  };
}
