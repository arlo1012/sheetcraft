import type { CellFillMode } from "@idea10/core/cell-autofill";
import { formatCellAddress } from "@idea10/core/coordinates";
import {
  getCellContent,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import {
  getDoubleClickFillRange,
  getFillHandlePoint,
  type FillRange,
  type FillDirection,
} from "@idea10/sheet-engine/fill-selection";
import type { Point, Size } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type {
  GridFillFeedback,
  GridFillRequest,
  GridFillResult,
  GridFillSession,
} from "../auto-fill-contracts";
import { useFillDrag } from "./useFillDrag";
import { createSheetHiddenRowIntervals } from "../data-visibility";

function sameRange(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row === right.start.row &&
    left.start.column === right.start.column &&
    left.end.row === right.end.row &&
    left.end.column === right.end.column
  );
}

/** Connects a temporary fill gesture and its options to the grid's existing geometry. */
export function useSheetAutoFill(options: {
  getSheet: () => Sheet;
  getEvaluator?: () => SheetEvaluator;
  getRevision: () => number;
  getRange: () => CellRange;
  getCanFill: () => boolean;
  getLayout: () => SheetViewportLayout;
  getHeaderSize: () => Size;
  getRoot: () => HTMLElement | null;
  getScroller: () => HTMLDivElement | null;
  getViewportSize: () => Size;
  getScale: () => number;
  getContentRowCount: () => number;
  getCellAtClientPoint: (x: number, y: number) => CellAddress | null;
  apply: (request: GridFillRequest) => GridFillResult;
  onBeforeStart: () => void;
  onResult: (range: CellRange, source: CellRange, visibleAddress: CellAddress) => void;
  onFeedback: (feedback: GridFillFeedback) => void;
  onEndSession: () => void;
  onEnsureGridExtentContains: (address: CellAddress) => void;
  onEnsureGridExtentCoversViewport: () => void;
  onScrollPositionChange: (position: Point) => void;
  focusGrid: () => void;
}) {
  const { t } = useAppI18n();
  const state = shallowRef<GridFillSession>();
  const dragging = ref(false);
  const copyPreview = ref(false);
  let gestureRevision = 0;

  function clear(): void {
    if (state.value) {
      state.value = undefined;
      options.onEndSession();
    }
  }

  const drag = useFillDrag({
    getBounds: () => ({
      rowCount: MAX_SHEET_ROWS,
      columnCount: MAX_SHEET_COLUMNS,
    }),
    getCaptureTarget: options.getRoot,
    getCellAtClientPoint: options.getCellAtClientPoint,
    getSourceRange: () => (options.getCanFill() ? options.getRange() : null),
    getScroller: options.getScroller,
    getViewportSize: options.getViewportSize,
    getScale: options.getScale,
    onDragStart: () => {
      clear();
      dragging.value = true;
    },
    onPreviewChange: (fill, { copy }) => {
      copyPreview.value = copy;
      if (!fill) dragging.value = false;
    },
    onCommit: (fill, { copy }) => {
      dragging.value = false;
      complete(fill, copy, gestureRevision);
    },
    onEnsureGridExtentContains: options.onEnsureGridExtentContains,
    onEnsureGridExtentCoversViewport: options.onEnsureGridExtentCoversViewport,
    onScrollPositionChange: options.onScrollPositionChange,
  });

  function stop(): void {
    drag.stop();
    dragging.value = false;
  }

  function start(event: PointerEvent): void {
    if (!options.getCanFill() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    options.onBeforeStart();
    gestureRevision = options.getRevision();
    drag.start(event);
  }

  function complete(fill: FillRange, copy: boolean, revision: number): void {
    if (!options.getCanFill()) return;
    const result = options.apply({
      type: "fill",
      sheetId: options.getSheet().id,
      source: fill.source,
      range: fill.range,
      revision,
      copy,
    });
    if (!result.ok) {
      clear();
      options.onFeedback(result.reason);
      options.focusGrid();
      return;
    }
    state.value = result.session;
    options.onResult(
      fill.range,
      fill.source,
      fill.direction === "up" || fill.direction === "left" ? fill.target.start : fill.target.end,
    );
  }

  function doubleClick(event: MouseEvent): void {
    if (!options.getCanFill()) return;
    event.preventDefault();
    event.stopPropagation();
    stop();
    options.onBeforeStart();
    const sheet = options.getSheet();
    const source = options.getRange();
    const hiddenRows = createSheetHiddenRowIntervals(sheet, options.getEvaluator?.());
    const fill = getDoubleClickFillRange(source, {
      rowCount: Math.min(MAX_SHEET_ROWS, options.getContentRowCount()),
      columnCount: MAX_SHEET_COLUMNS,
      hasValue: (address) => {
        const content = getCellContent(sheet, address);
        return Boolean(content && (content.kind !== "literal" || content.value !== ""));
      },
      // A double click must stop before an area that a normal fill cannot cross.
      // This avoids computing a distant end only for Core to reject it afterwards.
      isRowFillable: (row) =>
        !sheet.hiddenRows?.has(row) &&
        !hiddenRows.some((interval) => row >= interval.start && row <= interval.end) &&
        !sheet.mergedCells.some(
          (merge) =>
            row >= merge.start.row &&
            row <= merge.end.row &&
            merge.start.column <= source.end.column &&
            merge.end.column >= source.start.column,
        ),
    });
    if (!fill) {
      options.onFeedback("noAdjacentData");
      return;
    }
    clear();
    complete(fill, event.ctrlKey, options.getRevision());
  }

  /** Fills from the selection edge, shared by the ribbon and Ctrl/Cmd+D/R. */
  function fillSelection(direction: FillDirection): boolean {
    if (!options.getCanFill()) return false;
    const range = options.getRange();
    const vertical = direction === "down" || direction === "up";
    if (vertical ? range.start.row === range.end.row : range.start.column === range.end.column)
      return false;
    const source: CellRange = { start: { ...range.start }, end: { ...range.end } };
    const target: CellRange = { start: { ...range.start }, end: { ...range.end } };
    switch (direction) {
      case "down":
        source.end.row = range.start.row;
        target.start.row++;
        break;
      case "up":
        source.start.row = range.end.row;
        target.end.row--;
        break;
      case "right":
        source.end.column = range.start.column;
        target.start.column++;
        break;
      case "left":
        source.start.column = range.end.column;
        target.end.column--;
        break;
    }
    options.onBeforeStart();
    clear();
    complete({ direction, source, target, range }, true, options.getRevision());
    return true;
  }

  function selectMode(mode: CellFillMode): void {
    const current = state.value;
    if (!current || !options.getCanFill()) return;
    const result = options.apply({ type: "mode", sessionId: current.id, mode });
    if (result.ok) state.value = result.session;
    else {
      clear();
      options.onFeedback(result.reason);
    }
    options.focusGrid();
  }

  const handlePoint = computed(() => {
    if (!options.getCanFill()) return null;
    const point = getFillHandlePoint(options.getLayout(), options.getRange());
    const header = options.getHeaderSize();
    return point ? { x: point.x + header.width, y: point.y + header.height } : null;
  });
  const handleStyle = computed(() => ({
    left: `${(handlePoint.value?.x ?? 0) - 6 / options.getScale()}px`,
    top: `${(handlePoint.value?.y ?? 0) - 6 / options.getScale()}px`,
  }));
  const optionsPosition = computed(() => {
    if (!state.value?.availableModes.length || !options.getCanFill() || !handlePoint.value)
      return null;
    const viewport = options.getViewportSize();
    const header = options.getHeaderSize();
    const point = handlePoint.value;
    const scale = options.getScale();
    return {
      x: Math.max(
        header.width,
        Math.min(point.x + 5 / scale, header.width + viewport.width - 38 / scale),
      ),
      y: Math.max(
        header.height,
        Math.min(point.y + 5 / scale, header.height + viewport.height - 26 / scale),
      ),
    };
  });
  const previewRects = computed(() =>
    drag.preview.value ? options.getLayout().getRangeFragments(drag.preview.value.range) : [],
  );
  const previewLabel = computed(() => {
    const fill = drag.preview.value;
    if (!fill) return "";
    const range = `${formatCellAddress(fill.target.start)}:${formatCellAddress(fill.target.end)}`;
    const label = t("autoFill.preview", { range });
    return copyPreview.value ? `${label} · ${t("autoFill.copy")}` : label;
  });

  watch(
    () => [options.getSheet().id, options.getRevision()],
    () => {
      if (
        state.value?.revision === options.getRevision() &&
        state.value.sheetId === options.getSheet().id
      )
        return;
      stop();
      clear();
    },
  );
  watch(options.getRange, (range) => {
    if (!state.value || sameRange(range, state.value.range)) return;
    clear();
  });
  watch(options.getCanFill, (available) => {
    if (available) return;
    stop();
    clear();
  });
  watch(options.getScale, stop);

  function isFillControl(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          "[data-sheet-fill-handle], [data-sheet-auto-fill-options-trigger], .sheet-auto-fill-options__menu",
        ),
      )
    );
  }
  function onOutsidePointerDown(event: PointerEvent): void {
    if (!isFillControl(event.target)) clear();
  }
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (dragging.value || isFillControl(event.target)) return;
    if (
      event.key === "Shift" ||
      event.key === "Control" ||
      event.key === "Alt" ||
      event.key === "Meta"
    )
      return;
    clear();
  }
  onMounted(() => {
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("keydown", onDocumentKeydown, true);
  });
  onScopeDispose(() => {
    window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("keydown", onDocumentKeydown, true);
    clear();
  });

  return {
    state,
    dragging,
    handlePoint,
    handleStyle,
    optionsPosition,
    previewRects,
    previewLabel,
    start,
    stop,
    clear,
    doubleClick,
    fillSelection,
    selectMode,
  };
}
