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
} from "@sheetcraft/sheet-engine/extent";
import { createSheetGeometry, type Point, type Size } from "@sheetcraft/sheet-engine/geometry";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
  createSheetPagination,
  getPageLayoutRange,
  type SheetViewMode,
} from "@sheetcraft/sheet-engine/page-layout";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import {
  createRowVisibilityIndex,
  type HiddenRowInterval,
} from "@sheetcraft/sheet-engine/visibility";
import { getSelectionMode, type CellSelection } from "@sheetcraft/sheet-engine/selection";
import {
  createSheetGridViewState,
  type SheetGridViewState,
} from "@sheetcraft/sheet-engine/view-state";
import { MergedCellRangeResolver } from "@sheetcraft/core";
import {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COLUMN_WIDTH,
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
  type CellAddress,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { clientPointToElementSurface } from "../../../shared/sheet-input/surface-coordinates";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";

const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };

export function useSheetViewport(options: {
  getViewMode?: () => SheetViewMode;
  getPageSetup?: () => SheetPageSetup;
  getPrintRange?: () => CellRange;
  getShowPageBreaks?: () => boolean;
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
  let stopPageLayoutWatch: WatchStopHandle | undefined;
  let nativeScrollVersion = 0;

  function applyGridExtent(nextExtent: GridExtent): void {
    gridExtent.rowCount = nextExtent.rowCount;
    gridExtent.columnCount = nextExtent.columnCount;
  }

  function ensureGridExtentContains(address: CellAddress): void {
    if (viewMode.value === "page-layout") {
      ensurePageLayoutContains(address);
      return;
    }
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

  // Full-sheet metrics stay sparse; they let a paper extend past the normal
  // grid allocation without creating blank workbook cells.
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
  const viewMode = computed(() => options.getViewMode?.() ?? "normal");

  function getSelectionExtent(): GridExtent {
    const selection = options.getSelection();
    const mode = getSelectionMode(selection);
    return {
      rowCount:
        Math.max(
          selection.active.row,
          mode === "cells" || mode === "rows" ? selection.anchor.row : 0,
          mode === "cells" || mode === "rows" ? selection.focus.row : 0,
        ) + 1,
      columnCount:
        Math.max(
          selection.active.column,
          mode === "cells" || mode === "columns" ? selection.anchor.column : 0,
          mode === "cells" || mode === "columns" ? selection.focus.column : 0,
        ) + 1,
    };
  }
  const pageLayoutExtent = reactive<GridExtent>(getSelectionExtent());
  const pageLayoutRange = computed(() => {
    const setup = options.getPageSetup?.() ?? DEFAULT_SHEET_PAGE_SETUP;
    const extent = options.getContentExtent();
    const contentRange = {
      start: { row: 0, column: 0 },
      end: {
        row: Math.max(1, extent.rowCount, pageLayoutExtent.rowCount) - 1,
        column: Math.max(1, extent.columnCount, pageLayoutExtent.columnCount) - 1,
      },
    };
    return getPageLayoutRange({
      geometry: extentGeometry.value,
      rows: extentRows.value,
      setup,
      printRange: options.getPrintRange?.() ??
        setup.printArea ?? {
          start: { row: 0, column: 0 },
          end: {
            row: Math.max(0, extent.rowCount - 1),
            column: Math.max(0, extent.columnCount - 1),
          },
        },
      contentRange,
      mergedCells: options.getMergedCells(),
    });
  });
  const renderExtent = computed<GridExtent>(() =>
    viewMode.value === "page-layout"
      ? {
          rowCount: pageLayoutRange.value.end.row + 1,
          columnCount: pageLayoutRange.value.end.column + 1,
        }
      : gridExtent,
  );
  const baseExtent = computed<GridExtent>(() => ({
    rowCount: Math.max(gridExtent.rowCount, renderExtent.value.rowCount),
    columnCount: Math.max(gridExtent.columnCount, renderExtent.value.columnCount),
  }));

  function ensurePageLayoutContains(address: CellAddress): void {
    if (address.row >= renderExtent.value.rowCount)
      pageLayoutExtent.rowCount = Math.max(pageLayoutExtent.rowCount, address.row + 1);
    if (address.column >= renderExtent.value.columnCount)
      pageLayoutExtent.columnCount = Math.max(pageLayoutExtent.columnCount, address.column + 1);
  }

  const baseGeometry = computed(() =>
    createSheetGeometry({
      rowCount: baseExtent.value.rowCount,
      columnCount: baseExtent.value.columnCount,
      rowHeights: options.getRowHeights(),
      columnWidths: options.getColumnWidths(),
      columnWidth: options.getDefaultColumnWidth?.() ?? DEFAULT_COLUMN_WIDTH,
      hiddenRows: options.getHiddenRows?.(),
      hiddenColumns: options.getHiddenColumns?.(),
    }),
  );
  const baseRows = computed(() =>
    createRowVisibilityIndex({
      rowCount: baseExtent.value.rowCount,
      defaultRowHeight: DEFAULT_ROW_HEIGHT,
      rowHeights: options.getRowHeights(),
      hiddenIntervals: options.getHiddenRowIntervals(),
      hiddenRows: options.getHiddenRows?.(),
    }),
  );
  const pagination = computed(() => {
    if (viewMode.value === "normal" && !options.getShowPageBreaks?.()) return undefined;
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
      layoutRange:
        viewMode.value === "page-layout"
          ? pageLayoutRange.value
          : {
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
    if (viewMode.value === "page-layout") {
      const pages =
        pageProjection.value?.getVisiblePages({ ...scrollPosition, ...viewportSize }) ?? [];
      return {
        rowCount: Math.max(1, ...pages.map((page) => page.range.end.row + 1)),
        columnCount: Math.max(1, ...pages.map((page) => page.range.end.column + 1)),
      };
    }
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
    if (viewMode.value === "page-layout") return;
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
    if (viewMode.value === "page-layout") {
      const selected = getSelectionExtent();
      if (axes.y)
        pageLayoutExtent.rowCount = Math.min(
          pageLayoutExtent.rowCount,
          Math.max(viewport.rowCount, content.rowCount, selected.rowCount),
        );
      if (axes.x)
        pageLayoutExtent.columnCount = Math.min(
          pageLayoutExtent.columnCount,
          Math.max(viewport.columnCount, content.columnCount, selected.columnCount),
        );
      return;
    }
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
      if (viewMode.value === "page-layout") {
        Object.assign(pageLayoutExtent, getSelectionExtent());
      } else {
        const selection = options.getSelection();
        ensureGridExtentContains(selection.active);
        ensureGridExtentContains(selection.anchor);
        ensureGridExtentContains(selection.focus);
        ensureGridExtentCoversViewport(false);
      }
      setNativeScrollPosition({ x: 0, y: 0 });
      ensureSelectionVisible(options.getSelection().active, "cells");
      emitViewState();
    },
    { flush: "sync" },
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
    if (viewMode.value === "page-layout") ensurePageLayoutContains(address);
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
    if (viewMode.value === "page-layout") {
      const pages = pagination.value!;
      if (vertical && delta.y > 0 && scrollPosition.y >= maximum.y - 1)
        pageLayoutExtent.rowCount = Math.max(
          pageLayoutExtent.rowCount,
          Math.min(MAX_SHEET_ROWS, pages.pageRows.at(-1)!.end + 2),
        );
      if (horizontal && delta.x > 0 && scrollPosition.x >= maximum.x - 1)
        pageLayoutExtent.columnCount = Math.max(
          pageLayoutExtent.columnCount,
          Math.min(MAX_SHEET_COLUMNS, pages.pageColumns.at(-1)!.end + 2),
        );
      return;
    }
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
    Object.assign(pageLayoutExtent, getSelectionExtent());
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
    // A smaller paper band must still contain the current blank-cell selection.
    // Track geometry changes rather than every click inside an already full page.
    stopPageLayoutWatch?.();
    stopPageLayoutWatch = watch(
      [() => options.getPageSetup?.() ?? DEFAULT_SHEET_PAGE_SETUP, extentGeometry, extentRows],
      () => {
        if (viewMode.value !== "page-layout") return;
        const selected = getSelectionExtent();
        pageLayoutExtent.rowCount = Math.max(pageLayoutExtent.rowCount, selected.rowCount);
        pageLayoutExtent.columnCount = Math.max(pageLayoutExtent.columnCount, selected.columnCount);
      },
      { deep: true, flush: "sync" },
    );
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
    stopPageLayoutWatch?.();
    stopPageLayoutWatch = undefined;
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
    renderExtent,
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
