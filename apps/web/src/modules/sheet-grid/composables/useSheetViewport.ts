import {
  computed,
  nextTick,
  reactive,
  ref,
  watch,
  type CSSProperties,
  type WatchStopHandle,
} from "vue";
import {
  createGridExtent,
  expandGridExtent,
  expandGridExtentForAddress,
  type GridExtent,
  type GridExtentPolicy,
} from "@idea10/sheet-engine/extent";
import { createSheetGeometry, type Point, type Size } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import {
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
  createSheetPagination,
  type SheetViewMode,
} from "@idea10/sheet-engine/page-layout";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@idea10/core/page-setup";
import { createRowVisibilityIndex, type HiddenRowInterval } from "@idea10/sheet-engine/visibility";
import { getSelectionMode, type CellSelection } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import { MergedCellRangeResolver } from "@idea10/core";
import {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COLUMN_WIDTH,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
} from "@idea10/core/workbook";
import { clientPointToElementSurface } from "../../../shared/sheet-input/surface-coordinates";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";

const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };

export function useSheetViewport(options: {
  getViewMode?: () => SheetViewMode;
  getPageSetup?: () => SheetPageSetup;
  getPrintRange?: () => CellRange;
  getShowPageWhiteSpace?: () => boolean;
  getPagePadding?: () => number;
  getScale?: () => number;
  initialExtent: GridExtent;
  getGridExtentPolicy: () => GridExtentPolicy;
  getColumnWidths: () => ReadonlyMap<number, number>;
  getDefaultColumnWidth?: () => number;
  getHiddenRows?: () => ReadonlySet<number> | undefined;
  getHiddenColumns?: () => ReadonlySet<number> | undefined;
  getContentExtent: () => GridExtent;
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
  let nativeScrollVersion = 0;

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
    applyGridExtent(
      expandGridExtent(
        gridExtent,
        options.getContentExtent(),
        options.getGridExtentPolicy().growth,
      ),
    );
  }

  // Metadata may reference cells beyond the initial blank-grid allocation.
  ensureGridExtentContainsMetadata();

  const baseGeometry = computed(() =>
    createSheetGeometry({
      rowCount: gridExtent.rowCount,
      columnCount: gridExtent.columnCount,
      rowHeights: options.getRowHeights(),
      columnWidths: options.getColumnWidths(),
      columnWidth: options.getDefaultColumnWidth?.() ?? DEFAULT_COLUMN_WIDTH,
      hiddenRows: options.getHiddenRows?.(),
      hiddenColumns: options.getHiddenColumns?.(),
    }),
  );
  const baseRows = computed(() =>
    createRowVisibilityIndex({
      rowCount: gridExtent.rowCount,
      defaultRowHeight: DEFAULT_ROW_HEIGHT,
      rowHeights: options.getRowHeights(),
      hiddenIntervals: options.getHiddenRowIntervals(),
      hiddenRows: options.getHiddenRows?.(),
    }),
  );
  const viewMode = computed(() => options.getViewMode?.() ?? "normal");
  const pagination = computed(() => {
    if (viewMode.value === "normal") return undefined;
    const setup = options.getPageSetup?.() ?? DEFAULT_SHEET_PAGE_SETUP;
    const extent = options.getContentExtent();
    return createSheetPagination({
      geometry: baseGeometry.value,
      rows: baseRows.value,
      setup,
      printRange: options.getPrintRange?.() ??
        setup.printArea ?? {
          start: { row: 0, column: 0 },
          end: {
            row: Math.max(0, extent.rowCount - 1),
            column: Math.max(0, extent.columnCount - 1),
          },
        },
      layoutRange: {
        start: { row: 0, column: 0 },
        end: { row: gridExtent.rowCount - 1, column: gridExtent.columnCount - 1 },
      },
      mergedCells: options.getMergedCells(),
    });
  });
  const pageProjection = computed(() =>
    viewMode.value === "page-layout" && pagination.value
      ? createPageLayoutProjection({
          geometry: baseGeometry.value,
          rows: baseRows.value,
          pagination: pagination.value,
          showWhiteSpace: options.getShowPageWhiteSpace?.() ?? true,
          pagePadding: options.getPagePadding?.() ?? 0,
        })
      : undefined,
  );
  const geometry = computed(() => pageProjection.value?.geometry ?? baseGeometry.value);
  const rowVisibility = computed(() => pageProjection.value?.rows ?? baseRows.value);
  // Sparse full-sheet metrics resolve a viewport past the current allocation without
  // adding a render tail or materializing the intervening empty rows and columns.
  const extentGeometry = computed(() =>
    createSheetGeometry({
      rowHeights: options.getRowHeights(),
      columnWidths: options.getColumnWidths(),
      columnWidth: options.getDefaultColumnWidth?.() ?? DEFAULT_COLUMN_WIDTH,
      hiddenRows: options.getHiddenRows?.(),
      hiddenColumns: options.getHiddenColumns?.(),
    }),
  );
  const extentRows = computed(() =>
    createRowVisibilityIndex({
      rowCount: MAX_SHEET_ROWS,
      defaultRowHeight: DEFAULT_ROW_HEIGHT,
      rowHeights: options.getRowHeights(),
      hiddenIntervals: options.getHiddenRowIntervals(),
      hiddenRows: options.getHiddenRows?.(),
    }),
  );
  const mergeResolver = computed(() => {
    const ranges = options.getMergedCells();
    return ranges.length > 0 ? new MergedCellRangeResolver(ranges) : undefined;
  });
  const layout = computed(() => {
    const resolver = mergeResolver.value;
    if (viewMode.value === "page-layout" && pagination.value) {
      return createPageLayoutViewportLayout({
        geometry: baseGeometry.value,
        rows: baseRows.value,
        pagination: pagination.value,
        showWhiteSpace: options.getShowPageWhiteSpace?.() ?? true,
        pagePadding: options.getPagePadding?.() ?? 0,
        bodyScrollPosition: scrollPosition,
        viewportSize,
        overscan: 2,
        mergeResolver: resolver
          ? { getRangeAt: (address) => resolver.getRangeAtAddress(address) }
          : undefined,
      });
    }
    return createSheetViewportLayout({
      geometry: geometry.value,
      rows: rowVisibility.value,
      freeze: options.getFreezePanes(),
      bodyScrollPosition: scrollPosition,
      viewportSize,
      overscan: 2,
      mergeResolver: resolver
        ? { getRangeAt: (address) => resolver.getRangeAtAddress(address) }
        : undefined,
    });
  });
  const gridCanvasStyle = computed<CSSProperties>(() => ({
    width: `${layout.value.nativeScrollSize.width}px`,
    height: `${layout.value.nativeScrollSize.height}px`,
  }));
  const horizontalScrollState = computed<SheetHorizontalScrollState>(() => ({
    position: layout.value.bodyScrollPosition.x,
    viewportSize: layout.value.panes.body.clip.width,
    contentSize: Math.max(0, layout.value.getTotalSize().width - layout.value.frozenSize.width),
  }));
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

  function getViewportExtent(): GridExtent {
    if (viewMode.value === "page-layout") return { ...gridExtent };
    const metrics = extentGeometry.value;
    const rows = extentRows.value;
    const freeze = options.getFreezePanes();
    const frozenWidth =
      freeze.columns === metrics.columnCount
        ? metrics.getTotalSize().width
        : metrics.getColumnOffset(freeze.columns);
    const frozenHeight = rows.getBoundaryOffset(freeze.rows) ?? 0;
    const right = frozenWidth + scrollPosition.x + Math.max(0, viewportSize.width - frozenWidth);
    const bottom =
      frozenHeight + scrollPosition.y + Math.max(0, viewportSize.height - frozenHeight);
    const range = metrics.getVisibleRange(
      { x: Math.max(0, right - 1), y: 0 },
      { width: 1, height: 1 },
      0,
    );
    const lastRow = rows.getLogicalRowAtOffset(
      Math.max(0, Math.min(bottom - 1, rows.getTotalHeight() - 1)),
    );
    return {
      rowCount: Math.max(freeze.rows, (lastRow ?? 0) + 1),
      columnCount: Math.max(freeze.columns, range.endColumn + 1),
    };
  }

  function ensureGridExtentCoversViewport(includeTail = true): void {
    const minimum = getViewportExtent();
    const policy = options.getGridExtentPolicy();
    if (includeTail) {
      minimum.rowCount += policy.tail.rowCount;
      minimum.columnCount += policy.tail.columnCount;
    }
    applyGridExtent(expandGridExtent(gridExtent, minimum, policy.growth));
  }

  function compactUnusedExtent(axes = { x: true, y: true }): void {
    if (!axes.x && !axes.y) return;
    const viewport = getViewportExtent();
    const content = options.getContentExtent();
    const selection = options.getSelection();
    const required = expandGridExtent(
      options.initialExtent,
      {
        rowCount: Math.max(
          viewport.rowCount,
          content.rowCount,
          selection.active.row + 1,
          selection.anchor.row + 1,
          selection.focus.row + 1,
        ),
        columnCount: Math.max(
          viewport.columnCount,
          content.columnCount,
          selection.active.column + 1,
          selection.anchor.column + 1,
          selection.focus.column + 1,
        ),
      },
      options.getGridExtentPolicy().growth,
    );
    applyGridExtent({
      rowCount: axes.y ? Math.min(gridExtent.rowCount, required.rowCount) : gridExtent.rowCount,
      columnCount: axes.x
        ? Math.min(gridExtent.columnCount, required.columnCount)
        : gridExtent.columnCount,
    });
  }

  function updateViewportSize(): void {
    const scroller = scrollerRef.value;
    if (!scroller) return;
    viewportSize.width = scroller.clientWidth || DEFAULT_VIEWPORT_SIZE.width;
    viewportSize.height = scroller.clientHeight || DEFAULT_VIEWPORT_SIZE.height;
    ensureGridExtentCoversViewport(false);
    compactUnusedExtent();
  }

  function setNativeScrollPosition(position: Point): void {
    const scroller = scrollerRef.value;
    const version = ++nativeScrollVersion;
    if (scroller) {
      scroller.scrollLeft = position.x;
      scroller.scrollTop = position.y;
    }
    scrollPosition.x = position.x;
    scrollPosition.y = position.y;
    // An extent change reaches the DOM on the next Vue flush. Reapply then so a
    // native scrollbar cannot clamp a newly revealed cell to the old edge.
    void nextTick(() => {
      if (version !== nativeScrollVersion || scroller !== scrollerRef.value || !scroller) return;
      scroller.scrollLeft = scrollPosition.x;
      scroller.scrollTop = scrollPosition.y;
    });
  }

  watch(
    [options.getFreezePanes, options.getMergedCells, options.getContentExtent],
    () => {
      ensureGridExtentContainsMetadata();
      ensureGridExtentCoversViewport(false);
      compactUnusedExtent();
      setNativeScrollPosition(layout.value.bodyScrollPosition);
    },
    { deep: true },
  );
  watch(
    viewMode,
    () => {
      setNativeScrollPosition({ x: 0, y: 0 });
      ensureSelectionVisible(options.getSelection().active, "cells");
      emitViewState();
    },
    { flush: "post" },
  );

  watch(
    () => options.getShowPageWhiteSpace?.() ?? true,
    () => {
      if (viewMode.value !== "page-layout") return;
      ensureSelectionVisible(options.getSelection().active, "cells");
      emitViewState();
    },
    { flush: "post" },
  );

  function ensureSelectionVisible(
    address: CellAddress,
    mode = getSelectionMode(options.getSelection()),
  ): void {
    const next = layout.value.getScrollPositionForAddress(address);
    const position = { ...scrollPosition };
    if (mode !== "rows" && mode !== "all") position.x = next.x;
    if (mode !== "columns" && mode !== "all") position.y = next.y;
    const returning = { x: position.x < scrollPosition.x, y: position.y < scrollPosition.y };
    setNativeScrollPosition(position);
    compactUnusedExtent(returning);
  }

  function getCellAtClientPoint(clientX: number, clientY: number): CellAddress | null {
    const scroller = scrollerRef.value;
    if (!scroller) return null;
    const point = clientPointToElementSurface(
      { x: clientX, y: clientY },
      scroller,
      options.getScale?.() ?? 1,
    );
    return layout.value.getCellAtViewportPoint({
      x: Math.min(Math.max(point.x, 0), Math.max(0, viewportSize.width - 1)),
      y: Math.min(Math.max(point.y, 0), Math.max(0, viewportSize.height - 1)),
    });
  }

  function onScroll(event: Event): void {
    const scroller = event.currentTarget as HTMLDivElement;
    options.onScrollStart();
    const returning = {
      x: scroller.scrollLeft < scrollPosition.x,
      y: scroller.scrollTop < scrollPosition.y,
    };
    scrollPosition.x = scroller.scrollLeft;
    scrollPosition.y = scroller.scrollTop;
    compactUnusedExtent(returning);
    emitViewState();
  }

  function getScrollMaximum(): Point {
    const current = layout.value;
    return {
      x: Math.max(0, current.nativeScrollSize.width - viewportSize.width),
      y: Math.max(0, current.nativeScrollSize.height - viewportSize.height),
    };
  }

  function expandAtWheelEdge(delta: Point, horizontal: boolean, vertical: boolean): void {
    const maximum = getScrollMaximum();
    const growth = options.getGridExtentPolicy().growth;
    applyGridExtent(
      expandGridExtent(
        gridExtent,
        {
          rowCount:
            gridExtent.rowCount +
            (vertical && delta.y > 0 && scrollPosition.y >= maximum.y - 1 ? growth.rowCount : 0),
          columnCount:
            gridExtent.columnCount +
            (horizontal && delta.x > 0 && scrollPosition.x >= maximum.x - 1
              ? growth.columnCount
              : 0),
        },
        growth,
      ),
    );
  }

  function scrollHorizontally(position: number, allowExpansion = false): void {
    if (!Number.isFinite(position)) return;
    if (allowExpansion) expandAtWheelEdge({ x: position - scrollPosition.x, y: 0 }, true, false);
    const maximum = getScrollMaximum().x;
    const returning = position < scrollPosition.x;
    options.onScrollStart();
    setNativeScrollPosition({ x: Math.min(maximum, Math.max(0, position)), y: scrollPosition.y });
    compactUnusedExtent({ x: returning, y: false });
    emitViewState();
  }

  function onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) return;
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    const verticalDelta = event.shiftKey ? 0 : event.deltaY;
    if (!horizontalDelta && !verticalDelta) return;
    event.preventDefault();
    const horizontalUnit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? viewportSize.width
          : 1 / (options.getScale?.() ?? 1);
    const verticalUnit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? viewportSize.height
          : 1 / (options.getScale?.() ?? 1);
    const delta = { x: horizontalDelta * horizontalUnit, y: verticalDelta * verticalUnit };
    // Shift is the explicit horizontal extension gesture; plain deltaX remains bounded.
    expandAtWheelEdge(delta, event.shiftKey, !event.shiftKey);
    const maximum = getScrollMaximum();
    options.onScrollStart();
    setNativeScrollPosition({
      x: Math.min(maximum.x, Math.max(0, scrollPosition.x + delta.x)),
      y: Math.min(maximum.y, Math.max(0, scrollPosition.y + delta.y)),
    });
    compactUnusedExtent({ x: delta.x < 0, y: delta.y < 0 });
    emitViewState();
  }

  function restore(viewState?: SheetGridViewState): SheetGridViewState {
    const next = viewState
      ? createSheetGridViewState(viewState)
      : createSheetGridViewState({ gridExtent: options.initialExtent });
    applyGridExtent(next.gridExtent);
    ensureGridExtentContains(next.selection.focus);
    ensureGridExtentContains(next.selection.anchor);
    ensureGridExtentContains(next.selection.active);
    ensureGridExtentContainsMetadata();
    setNativeScrollPosition(next.scrollPosition);
    setNativeScrollPosition(layout.value.bodyScrollPosition);
    ensureGridExtentCoversViewport(false);
    compactUnusedExtent();
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
    baseGeometry,
    baseRows,
    pagination,
    pageProjection,
    geometry,
    getCellAtClientPoint,
    getCurrentViewState,
    gridCanvasStyle,
    gridExtent,
    horizontalScrollState,
    ensureGridExtentContains,
    ensureGridExtentCoversViewport,
    ensureSelectionVisible,
    emitViewState,
    layout,
    observe,
    onScroll,
    onWheel,
    restore,
    rowVisibility,
    navigationRows: extentRows,
    scrollPosition,
    scrollHorizontally,
    scrollerRef,
    startGeometryWatch,
    stopGeometryWatching,
    stopObserving,
    updateViewportSize,
    viewportSize,
  };
}
