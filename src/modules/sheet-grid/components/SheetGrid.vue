<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type CSSProperties,
} from "vue";
import { formatCellValueForDisplay, formatCellValueForInput } from "../../workbook/input";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getCellValue,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "../../workbook/workbook";
import {
  DEFAULT_GRID_EXTENT_POLICY,
  DEFAULT_INITIAL_GRID_EXTENT,
  createGridExtent,
  expandGridExtentForAddress,
  expandGridExtentForViewport,
  type GridExtent,
} from "../extent";
import { createSheetGeometry, getCellAddressLabel, type Point, type Size } from "../geometry";
import {
  areCellAddressesEqual,
  createAxisSelection,
  createCellSelection,
  extendAxisSelection,
  extendCellSelection,
  getSelectionAutoScrollDelta,
  getSelectionMode,
  getSelectionRange,
  isSingleCellSelection,
  moveActiveCellWithinSelection,
  moveCellSelection,
  type CellSelection,
} from "../selection";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
} from "../useGridClipboard";
import { createSheetGridViewState, type SheetGridViewState } from "../view-state";
import CellEditor from "./CellEditor.vue";
import SheetAxisContextMenu from "./SheetAxisContextMenu.vue";
import SheetCellLayer from "./SheetCellLayer.vue";
import SheetColumnHeaders from "./SheetColumnHeaders.vue";
import SheetRowHeaders from "./SheetRowHeaders.vue";
import SheetSelectionOverlay from "./SheetSelectionOverlay.vue";

type CellEditorHandle = {
  focus: (options?: { selectAll?: boolean; clientX?: number }) => void;
};

type AxisContextMenuState = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  position: Point;
};

const CLIPBOARD_MESSAGE_KEYS: Record<GridClipboardFeedback, MessageKey> = {
  unavailable: "clipboard.unavailable",
  axisCopyUnsupported: "clipboard.axisCopyUnsupported",
  readyToMove: "clipboard.readyToMove",
  copied: "clipboard.copied",
  axisPasteUnsupported: "clipboard.axisPasteUnsupported",
  missingText: "clipboard.missingText",
  rangeMismatch: "clipboard.rangeMismatch",
  moved: "clipboard.moved",
  pasted: "clipboard.pasted",
};

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    initialRowCount?: number;
    initialColumnCount?: number;
    rowExpansionStep?: number;
    columnExpansionStep?: number;
    rowExpansionTail?: number;
    columnExpansionTail?: number;
    viewState?: SheetGridViewState;
  }>(),
  {
    initialRowCount: DEFAULT_INITIAL_GRID_EXTENT.rowCount,
    initialColumnCount: DEFAULT_INITIAL_GRID_EXTENT.columnCount,
    rowExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.rowCount,
    columnExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.columnCount,
    rowExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.rowCount,
    columnExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.columnCount,
  },
);

const emit = defineEmits<{
  commitCell: [payload: { address: CellAddress; input: string }];
  clearCells: [range: CellRange];
  pasteCells: [payload: GridPastePayload];
  resizeDimension: [payload: { axis: SheetDimensionAxis; index: number; size: number }];
  insertAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  deleteAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  undo: [];
  redo: [];
  selectionChange: [payload: { active: CellAddress; range: CellRange }];
  viewStateChange: [viewState: SheetGridViewState];
}>();

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 28;
const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };
const AXIS_MENU_WIDTH = 272;
const AXIS_MENU_HEIGHT = 220;

const { t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const scrollerRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<CellEditorHandle | null>(null);
const selection = ref<CellSelection>(createCellSelection({ row: 0, column: 0 }));
const editingValue = ref("");
const isEditing = ref(false);
const isComposing = ref(false);
const clipboardFeedbackKey = ref<GridClipboardFeedback>();
const axisContextMenu = ref<AxisContextMenuState>();
const scrollPosition = reactive<Point>({ x: 0, y: 0 });
const viewportSize = reactive<Size>({ ...DEFAULT_VIEWPORT_SIZE });
const gridExtent = reactive<GridExtent>(
  createGridExtent({
    rowCount: props.initialRowCount,
    columnCount: props.initialColumnCount,
  }),
);
let resizeObserver: ResizeObserver | null = null;
let compositionStartValue = "";
let wasEditingBeforeComposition = false;
let shouldFinishAfterComposition = false;
let pendingSelectionAfterComposition: CellSelection | undefined;
let dragSelection:
  | {
      start: CellAddress;
      baseSelection: CellSelection;
      startX: number;
      startY: number;
      pointerX: number;
      pointerY: number;
      moved: boolean;
    }
  | undefined;
let autoScrollFrame: number | undefined;
const dimensionResize = ref<
  | {
      axis: SheetDimensionAxis;
      index: number;
      pointerId: number;
      captureTarget: HTMLElement | null;
      startClientPosition: number;
      startSize: number;
      previewSize: number;
    }
  | undefined
>();

const geometry = computed(() => {
  const rowHeights = new Map(props.sheet.rowHeights);
  const columnWidths = new Map(props.sheet.columnWidths);
  const resize = dimensionResize.value;
  if (resize?.axis === "row") {
    rowHeights.set(resize.index, resize.previewSize);
  } else if (resize?.axis === "column") {
    columnWidths.set(resize.index, resize.previewSize);
  }

  return createSheetGeometry({
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
    rowHeights,
    columnWidths,
  });
});
const totalSize = computed(() => geometry.value.getTotalSize());
const visibleRange = computed(() =>
  geometry.value.getVisibleRange(scrollPosition, viewportSize, 2),
);
const activeCell = computed(() => selection.value.active);
const selectedRange = computed(() =>
  getSelectionRange(selection.value, {
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
  }),
);
const activeCellRect = computed(() =>
  geometry.value.getCellViewportRect(activeCell.value, scrollPosition),
);
function getRangeViewportRect(range: CellRange) {
  const startRect = geometry.value.getCellViewportRect(range.start, scrollPosition);
  const endRect = geometry.value.getCellViewportRect(range.end, scrollPosition);
  const left = Math.max(0, startRect.x);
  const top = Math.max(0, startRect.y);
  const right = Math.min(viewportSize.width, endRect.x + endRect.width);
  const bottom = Math.min(viewportSize.height, endRect.y + endRect.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
const selectedRangeRect = computed(() => getRangeViewportRect(selectedRange.value));
const activeCellLabel = computed(() => getCellAddressLabel(activeCell.value));
const activeCellDisplayValue = computed(() =>
  formatCellValueForDisplay(getCellValue(props.sheet, activeCell.value)),
);
const clipboardFeedback = computed(() =>
  clipboardFeedbackKey.value ? t(CLIPBOARD_MESSAGE_KEYS[clipboardFeedbackKey.value]) : "",
);
const gridCanvasStyle = computed<CSSProperties>(() => ({
  width: `${totalSize.value.width}px`,
  height: `${totalSize.value.height}px`,
}));
const gridViewportStyle = computed<CSSProperties>(() => ({
  width: `${viewportSize.width}px`,
  height: `${viewportSize.height}px`,
}));
const { clipboardMode, clipboardRange, clearPendingClipboard, onCopy, onCut, onPaste } =
  useGridClipboard({
    getSheet: () => props.sheet,
    getSelection: () => selection.value,
    isEditing: () => isEditing.value,
    isComposing: () => isComposing.value,
    onPaste: (payload) => {
      emit("pasteCells", payload);
      ensureGridExtentContains(payload.plan.range.end);
      setSelection(
        {
          active: { ...payload.plan.anchor },
          anchor: { ...payload.plan.range.start },
          focus: { ...payload.plan.range.end },
          mode: "cells",
        },
        payload.plan.range.end,
      );
    },
    onFeedback: (message) => {
      clipboardFeedbackKey.value = message;
    },
  });
const clipboardRangeRect = computed(() =>
  clipboardRange.value ? getRangeViewportRect(clipboardRange.value) : null,
);

function applyGridExtent(nextExtent: GridExtent): void {
  gridExtent.rowCount = nextExtent.rowCount;
  gridExtent.columnCount = nextExtent.columnCount;
}

function getCurrentViewState(): SheetGridViewState {
  return createSheetGridViewState({
    selection: selection.value,
    scrollPosition,
    gridExtent,
  });
}

function emitViewState(): void {
  emit("viewStateChange", getCurrentViewState());
}

function getGridExtentPolicy() {
  return {
    growth: {
      rowCount: props.rowExpansionStep,
      columnCount: props.columnExpansionStep,
    },
    tail: {
      rowCount: props.rowExpansionTail,
      columnCount: props.columnExpansionTail,
    },
  };
}

function ensureGridExtentContains(address: CellAddress): void {
  applyGridExtent(expandGridExtentForAddress(gridExtent, address, getGridExtentPolicy().growth));
}

function ensureGridExtentCoversViewport(): void {
  applyGridExtent(
    expandGridExtentForViewport(
      gridExtent,
      scrollPosition,
      viewportSize,
      geometry.value,
      getGridExtentPolicy(),
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

function focusEditor(selectAll = false, clientX?: number): void {
  void nextTick(() => editorRef.value?.focus({ selectAll, clientX }));
}

function ensureSelectionVisible(
  address: CellAddress,
  mode = getSelectionMode(selection.value),
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

function setSelection(
  nextSelection: CellSelection,
  visibleAddress: CellAddress = nextSelection.active,
  restoreFocus = true,
): void {
  axisContextMenu.value = undefined;
  selection.value = {
    active: { ...nextSelection.active },
    anchor: { ...nextSelection.anchor },
    focus: { ...nextSelection.focus },
    mode: nextSelection.mode,
  };
  ensureGridExtentContains(visibleAddress);
  emit("selectionChange", {
    active: { ...nextSelection.active },
    range: getSelectionRange(nextSelection),
  });
  ensureSelectionVisible(visibleAddress, nextSelection.mode);
  emitViewState();
  if (restoreFocus) {
    focusEditor();
  }
}

function setActiveCell(address: CellAddress, restoreFocus = true): void {
  setSelection(createCellSelection(address), address, restoreFocus);
}

function navigateToCell(address: CellAddress): void {
  const nextSelection = createCellSelection(address);
  if (isComposing.value) {
    pendingSelectionAfterComposition = nextSelection;
    shouldFinishAfterComposition = true;
    return;
  }

  if (isEditing.value) {
    finishEdit(nextSelection);
  } else {
    setSelection(nextSelection, address);
  }
}

function beginEdit(mode: "append" | "replace", initialValue = "", clientX?: number): void {
  editingValue.value =
    mode === "append"
      ? formatCellValueForInput(getCellValue(props.sheet, activeCell.value))
      : initialValue;
  isEditing.value = true;
  focusEditor(false, clientX);
}

function finishEdit(destination?: CellSelection, restoreFocus = true): void {
  if (isEditing.value) {
    clearPendingClipboard();
    emit("commitCell", {
      address: { ...activeCell.value },
      input: editingValue.value,
    });
  }

  isEditing.value = false;
  isComposing.value = false;
  wasEditingBeforeComposition = false;
  shouldFinishAfterComposition = false;
  pendingSelectionAfterComposition = undefined;
  editingValue.value = "";
  if (destination) {
    setSelection(destination);
  } else if (restoreFocus) {
    focusEditor();
  }
}

function cancelEdit(restoreFocus = true): void {
  isEditing.value = false;
  isComposing.value = false;
  wasEditingBeforeComposition = false;
  shouldFinishAfterComposition = false;
  pendingSelectionAfterComposition = undefined;
  editingValue.value = "";
  if (restoreFocus) {
    focusEditor();
  }
}

function moveSelection(
  delta: { rows?: number; columns?: number },
  commitEdit: boolean,
  extend = false,
): void {
  const destination = moveCellSelection(
    selection.value,
    delta,
    {
      rowCount: MAX_SHEET_ROWS,
      columnCount: MAX_SHEET_COLUMNS,
    },
    extend,
  );
  const visibleAddress = extend ? destination.focus : destination.active;
  ensureGridExtentContains(visibleAddress);

  if (commitEdit) {
    finishEdit(destination);
  } else {
    setSelection(destination, visibleAddress);
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

function cancelAutoScroll(): void {
  if (autoScrollFrame === undefined) {
    return;
  }
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(autoScrollFrame);
  } else {
    window.clearTimeout(autoScrollFrame);
  }
  autoScrollFrame = undefined;
}

function stopDragSelection(): void {
  cancelAutoScroll();
  dragSelection = undefined;
  window.removeEventListener("mousemove", onDragMouseMove);
  window.removeEventListener("mouseup", onDragMouseUp);
}

function stopDimensionResize(): void {
  const resize = dimensionResize.value;
  const target = resize?.captureTarget;
  target?.removeEventListener("lostpointercapture", onDimensionResizeLostCapture);
  if (resize && target?.hasPointerCapture?.(resize.pointerId)) {
    target.releasePointerCapture(resize.pointerId);
  }
  dimensionResize.value = undefined;
  window.removeEventListener("pointermove", onDimensionResizeMove);
  window.removeEventListener("pointerup", onDimensionResizeEnd);
  window.removeEventListener("pointercancel", onDimensionResizeCancel);
  window.removeEventListener("blur", onDimensionResizeBlur);
}

function clampDimensionSize(axis: SheetDimensionAxis, size: number): number {
  const minimum = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
  const maximum = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
  return Math.min(Math.max(Math.round(size), minimum), maximum);
}

function onDimensionResizeRequest(
  axis: SheetDimensionAxis,
  payload: { index: number; size: number },
): void {
  emit("resizeDimension", { axis, ...payload });
}

function onDimensionResizeStart(
  axis: SheetDimensionAxis,
  payload: { index: number; event: PointerEvent },
): void {
  stopDragSelection();
  stopDimensionResize();
  const startSize =
    axis === "row"
      ? geometry.value.getRowHeight(payload.index)
      : geometry.value.getColumnWidth(payload.index);
  const target = payload.event.currentTarget as HTMLElement | null;
  dimensionResize.value = {
    axis,
    index: payload.index,
    pointerId: payload.event.pointerId,
    captureTarget: target,
    startClientPosition: axis === "row" ? payload.event.clientY : payload.event.clientX,
    startSize,
    previewSize: startSize,
  };

  target?.setPointerCapture?.(payload.event.pointerId);
  target?.addEventListener("lostpointercapture", onDimensionResizeLostCapture);
  window.addEventListener("pointermove", onDimensionResizeMove);
  window.addEventListener("pointerup", onDimensionResizeEnd);
  window.addEventListener("pointercancel", onDimensionResizeCancel);
  window.addEventListener("blur", onDimensionResizeBlur);
}

function onDimensionResizeMove(event: PointerEvent): void {
  const resize = dimensionResize.value;
  if (!resize || event.pointerId !== resize.pointerId) {
    return;
  }
  event.preventDefault();
  const clientPosition = resize.axis === "row" ? event.clientY : event.clientX;
  resize.previewSize = clampDimensionSize(
    resize.axis,
    resize.startSize + clientPosition - resize.startClientPosition,
  );
}

function onDimensionResizeEnd(event: PointerEvent): void {
  const resize = dimensionResize.value;
  if (!resize || event.pointerId !== resize.pointerId) {
    return;
  }
  const payload = {
    axis: resize.axis,
    index: resize.index,
    size: resize.previewSize,
  };
  const changed = resize.previewSize !== resize.startSize;
  stopDimensionResize();
  if (changed) {
    emit("resizeDimension", payload);
  }
}

function onDimensionResizeCancel(event: PointerEvent): void {
  if (event.pointerId !== dimensionResize.value?.pointerId) {
    return;
  }
  stopDimensionResize();
}

function onDimensionResizeLostCapture(event: PointerEvent): void {
  if (event.pointerId !== dimensionResize.value?.pointerId) {
    return;
  }
  stopDimensionResize();
}

function onDimensionResizeBlur(): void {
  stopDimensionResize();
}

function onGridKeydown(event: KeyboardEvent): void {
  if (!dimensionResize.value || event.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  stopDimensionResize();
}

function updateDragSelectionAddress(): void {
  if (!dragSelection) {
    return;
  }
  const address = getCellAtClientPoint(dragSelection.pointerX, dragSelection.pointerY);
  if (!address) {
    return;
  }
  ensureGridExtentContains(address);
  setSelection(extendCellSelection(dragSelection.baseSelection, address), address, false);
}

function requestAutoScrollFrame(callback: FrameRequestCallback): number {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
}

function runSelectionAutoScroll(): void {
  autoScrollFrame = undefined;
  const scroller = scrollerRef.value;
  if (!dragSelection || !scroller) {
    return;
  }

  const bounds = scroller.getBoundingClientRect();
  const delta = getSelectionAutoScrollDelta(
    { x: dragSelection.pointerX, y: dragSelection.pointerY },
    {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right || bounds.left + viewportSize.width,
      bottom: bounds.bottom || bounds.top + viewportSize.height,
    },
  );
  if (delta.x === 0 && delta.y === 0) {
    return;
  }

  scroller.scrollLeft = Math.max(0, scroller.scrollLeft + delta.x);
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta.y);
  scrollPosition.x = scroller.scrollLeft;
  scrollPosition.y = scroller.scrollTop;
  ensureGridExtentCoversViewport();
  updateDragSelectionAddress();
  autoScrollFrame = requestAutoScrollFrame(runSelectionAutoScroll);
}

function scheduleSelectionAutoScroll(): void {
  cancelAutoScroll();
  if (!dragSelection) {
    return;
  }
  autoScrollFrame = requestAutoScrollFrame(runSelectionAutoScroll);
}

function onDragMouseMove(event: MouseEvent): void {
  if (!dragSelection) {
    return;
  }
  dragSelection.pointerX = event.clientX;
  dragSelection.pointerY = event.clientY;
  if (
    !dragSelection.moved &&
    Math.hypot(event.clientX - dragSelection.startX, event.clientY - dragSelection.startY) >= 3
  ) {
    dragSelection.moved = true;
  }
  if (!dragSelection.moved) {
    return;
  }
  updateDragSelectionAddress();
  scheduleSelectionAutoScroll();
}

function onDragMouseUp(): void {
  const moved = dragSelection?.moved ?? false;
  stopDragSelection();
  if (moved) {
    focusEditor();
  }
}

function onCellMouseDown(address: CellAddress, event: MouseEvent): void {
  const previousSelection = selection.value;
  const nextSelection = event.shiftKey
    ? extendCellSelection(previousSelection, address)
    : createCellSelection(address);

  if (isComposing.value) {
    pendingSelectionAfterComposition = nextSelection;
    shouldFinishAfterComposition = true;
    return;
  }

  if (isEditing.value) {
    finishEdit(nextSelection);
  } else {
    setSelection(nextSelection, address);
  }

  if (event.buttons === 1) {
    stopDragSelection();
    dragSelection = {
      start: { ...address },
      baseSelection: nextSelection,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
    };
    window.addEventListener("mousemove", onDragMouseMove);
    window.addEventListener("mouseup", onDragMouseUp);
  }
}

function selectAxis(
  mode: "rows" | "columns" | "all",
  address: CellAddress,
  shiftKey: boolean,
  restoreFocus = true,
): void {
  const nextSelection =
    shiftKey && mode !== "all"
      ? extendAxisSelection(selection.value, mode, address)
      : createAxisSelection(mode, address);
  if (isComposing.value) {
    pendingSelectionAfterComposition = nextSelection;
    shouldFinishAfterComposition = true;
    return;
  }
  if (isEditing.value) {
    finishEdit(nextSelection, restoreFocus);
  } else {
    setSelection(nextSelection, address, restoreFocus);
  }
}

function onColumnHeaderSelect(payload: { column: number; shiftKey: boolean }): void {
  selectAxis("columns", { row: 0, column: payload.column }, payload.shiftKey);
}

function onRowHeaderSelect(payload: { row: number; shiftKey: boolean }): void {
  selectAxis("rows", { row: payload.row, column: 0 }, payload.shiftKey);
}

function isAxisIndexSelected(axis: SheetDimensionAxis, index: number): boolean {
  const expectedMode = axis === "row" ? "rows" : "columns";
  if (getSelectionMode(selection.value) !== expectedMode) {
    return false;
  }
  const range = selectedRange.value;
  return axis === "row"
    ? index >= range.start.row && index <= range.end.row
    : index >= range.start.column && index <= range.end.column;
}

function openAxisContextMenu(
  axis: SheetDimensionAxis,
  index: number,
  clientX: number,
  clientY: number,
): void {
  if (isComposing.value) {
    return;
  }
  if (!isAxisIndexSelected(axis, index)) {
    const address = axis === "row" ? { row: index, column: 0 } : { row: 0, column: index };
    selectAxis(axis === "row" ? "rows" : "columns", address, false, false);
  }

  const range = selectedRange.value;
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  const bounds = rootRef.value?.getBoundingClientRect();
  const localX = clientX - (bounds?.left ?? 0);
  const localY = clientY - (bounds?.top ?? 0);
  const width = bounds?.width || viewportSize.width + ROW_HEADER_WIDTH;
  const height = bounds?.height || viewportSize.height + COLUMN_HEADER_HEIGHT;
  axisContextMenu.value = {
    axis,
    index: start,
    count: end - start + 1,
    position: {
      x: Math.max(0, Math.min(localX, width - AXIS_MENU_WIDTH)),
      y: Math.max(0, Math.min(localY, height - AXIS_MENU_HEIGHT)),
    },
  };
}

function getAxisMaximum(axis: SheetDimensionAxis): number {
  return axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
}

function requestAxisInsert(payload: { direction: "before" | "after"; count: number }): void {
  const menu = axisContextMenu.value;
  if (!menu) {
    return;
  }
  const index = payload.direction === "before" ? menu.index : menu.index + menu.count;
  if (payload.count > getAxisMaximum(menu.axis) - index) {
    return;
  }
  clearPendingClipboard();
  emit("insertAxis", {
    axis: menu.axis,
    index,
    count: payload.count,
  });
  axisContextMenu.value = undefined;
  focusEditor();
}

function requestAxisDelete(): void {
  const menu = axisContextMenu.value;
  if (!menu) {
    return;
  }
  clearPendingClipboard();
  emit("deleteAxis", { axis: menu.axis, index: menu.index, count: menu.count });
  axisContextMenu.value = undefined;
  focusEditor();
}

function requestAxisResize(size: number): void {
  const menu = axisContextMenu.value;
  if (!menu || menu.count !== 1) {
    return;
  }
  emit("resizeDimension", { axis: menu.axis, index: menu.index, size });
}

function requestAxisClear(): void {
  if (!axisContextMenu.value) {
    return;
  }
  clearPendingClipboard();
  emit("clearCells", getSelectionRange(selection.value));
  axisContextMenu.value = undefined;
  focusEditor();
}

function closeAxisContextMenu(restoreFocus: boolean): void {
  axisContextMenu.value = undefined;
  if (restoreFocus) {
    focusEditor();
  }
}

function onCornerClick(): void {
  selectAxis("all", { row: 0, column: 0 }, false, false);
}

function onCellDoubleClick(address: CellAddress, event: MouseEvent): void {
  if (isComposing.value) {
    return;
  }
  if (!areCellAddressesEqual(activeCell.value, address)) {
    setActiveCell(address, false);
  }
  beginEdit("append", "", event.clientX);
}

function handleHistoryShortcut(event: KeyboardEvent): boolean {
  if (isEditing.value || (!event.ctrlKey && !event.metaKey)) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    clearPendingClipboard();
    if (event.shiftKey) {
      emit("redo");
    } else {
      emit("undo");
    }
    return true;
  }
  if (key === "y") {
    event.preventDefault();
    clearPendingClipboard();
    emit("redo");
    return true;
  }

  return false;
}

function traverseSelection(key: "Enter" | "Tab", reverse: boolean, commitEdit: boolean): void {
  if (!isSingleCellSelection(selection.value)) {
    const direction =
      key === "Tab"
        ? reverse
          ? "backward-row"
          : "forward-row"
        : reverse
          ? "backward-column"
          : "forward-column";
    const destination = moveActiveCellWithinSelection(selection.value, direction);
    if (commitEdit) {
      finishEdit(destination);
    } else {
      setSelection(destination);
    }
    return;
  }

  moveSelection(
    key === "Tab" ? { columns: reverse ? -1 : 1 } : { rows: reverse ? -1 : 1 },
    commitEdit,
  );
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (isComposing.value || event.isComposing) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
    return;
  }

  if (handleHistoryShortcut(event)) {
    return;
  }

  if (isEditing.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      traverseSelection("Enter", event.shiftKey, true);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      traverseSelection("Tab", event.shiftKey, true);
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAxis("all", { row: 0, column: 0 }, false);
    return;
  }

  if (event.key === " " || event.key === "Spacebar") {
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      selectAxis("rows", activeCell.value, false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault();
      selectAxis("columns", activeCell.value, false);
      return;
    }
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    clearPendingClipboard();
    clipboardFeedbackKey.value = undefined;
    emit("clearCells", getSelectionRange(selection.value));
    return;
  }

  const navigation: Record<string, { rows?: number; columns?: number }> = {
    ArrowUp: { rows: -1 },
    ArrowDown: { rows: 1 },
    ArrowLeft: { columns: -1 },
    ArrowRight: { columns: 1 },
  };
  const delta = navigation[event.key];
  if (delta) {
    event.preventDefault();
    moveSelection(delta, false, event.shiftKey);
    return;
  }

  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    traverseSelection(event.key, event.shiftKey, false);
    return;
  }

  if (event.key === "F2") {
    event.preventDefault();
    beginEdit("append");
    return;
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    beginEdit("replace", event.key);
  }
}

function onEditorInput(value: string): void {
  if (!isEditing.value) {
    isEditing.value = true;
  }
  editingValue.value = value;
}

function onCompositionStart(): void {
  compositionStartValue = editingValue.value;
  wasEditingBeforeComposition = isEditing.value;
  shouldFinishAfterComposition = false;
  pendingSelectionAfterComposition = undefined;
  if (!isEditing.value) {
    editingValue.value = "";
    isEditing.value = true;
  }
  isComposing.value = true;
}

function onCompositionEnd(value: string, event: CompositionEvent): void {
  isComposing.value = false;
  const shouldPreserveExistingEdit = wasEditingBeforeComposition;
  wasEditingBeforeComposition = false;
  if (event.data === "" && value === compositionStartValue) {
    if (shouldPreserveExistingEdit) {
      editingValue.value = compositionStartValue;
      if (shouldFinishAfterComposition) {
        finishEdit(pendingSelectionAfterComposition, !pendingSelectionAfterComposition);
      } else {
        shouldFinishAfterComposition = false;
        pendingSelectionAfterComposition = undefined;
      }
      return;
    }
    const destination = pendingSelectionAfterComposition;
    const restoreFocus = !shouldFinishAfterComposition;
    cancelEdit(restoreFocus);
    if (destination) {
      setSelection(destination);
    }
    return;
  }
  if (isEditing.value) {
    editingValue.value = value;
  }
  if (shouldFinishAfterComposition) {
    finishEdit(pendingSelectionAfterComposition, !pendingSelectionAfterComposition);
  }
}

function onEditorBlur(): void {
  if (!isEditing.value) {
    return;
  }
  if (isComposing.value) {
    shouldFinishAfterComposition = true;
    return;
  }

  finishEdit(undefined, false);
}

function onScroll(event: Event): void {
  const scroller = event.currentTarget as HTMLDivElement;
  scrollPosition.x = scroller.scrollLeft;
  scrollPosition.y = scroller.scrollTop;
  ensureGridExtentCoversViewport();
  emitViewState();
}

function restoreViewState(viewState?: SheetGridViewState): void {
  const nextViewState = viewState
    ? createSheetGridViewState(viewState)
    : createSheetGridViewState({
        gridExtent: createGridExtent({
          rowCount: props.initialRowCount,
          columnCount: props.initialColumnCount,
        }),
      });
  stopDragSelection();
  stopDimensionResize();
  axisContextMenu.value = undefined;
  clearPendingClipboard();
  selection.value = nextViewState.selection;
  editingValue.value = "";
  isEditing.value = false;
  isComposing.value = false;
  shouldFinishAfterComposition = false;
  pendingSelectionAfterComposition = undefined;
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
}

watch(
  () => props.sheet.id,
  () => {
    restoreViewState(props.viewState);
    focusEditor();
  },
);

onMounted(() => {
  updateViewportSize();
  restoreViewState(props.viewState);
  const scroller = scrollerRef.value;
  if (scroller && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(scroller);
  }
  focusEditor();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  stopDragSelection();
  stopDimensionResize();
});

defineExpose({ navigateToCell });
</script>

<template>
  <section
    ref="rootRef"
    class="sheet-grid"
    :class="{
      'is-resizing-column': dimensionResize?.axis === 'column',
      'is-resizing-row': dimensionResize?.axis === 'row',
    }"
    :style="{
      '--sheet-row-header-width': `${ROW_HEADER_WIDTH}px`,
      '--sheet-column-header-height': `${COLUMN_HEADER_HEIGHT}px`,
    }"
    :aria-label="t('grid.worksheet', { name: sheet.name })"
    @keydown.capture="onGridKeydown"
  >
    <button
      type="button"
      class="sheet-grid__corner"
      :class="{ 'is-active': getSelectionMode(selection) === 'all' }"
      :aria-label="t('grid.selectAll')"
      @click="onCornerClick"
    />
    <SheetColumnHeaders
      :start-column="visibleRange.startColumn"
      :end-column="visibleRange.endColumn"
      :geometry="geometry"
      :scroll-left="scrollPosition.x"
      :selected-start-column="selectedRange.start.column"
      :selected-end-column="selectedRange.end.column"
      :selected="getSelectionMode(selection) === 'columns' || getSelectionMode(selection) === 'all'"
      @resize="onDimensionResizeRequest('column', $event)"
      @resize-start="onDimensionResizeStart('column', $event)"
      @select="onColumnHeaderSelect"
      @open-context-menu="
        openAxisContextMenu('column', $event.column, $event.clientX, $event.clientY)
      "
    />
    <SheetRowHeaders
      :start-row="visibleRange.startRow"
      :end-row="visibleRange.endRow"
      :geometry="geometry"
      :scroll-top="scrollPosition.y"
      :selected-start-row="selectedRange.start.row"
      :selected-end-row="selectedRange.end.row"
      :selected="getSelectionMode(selection) === 'rows' || getSelectionMode(selection) === 'all'"
      @resize="onDimensionResizeRequest('row', $event)"
      @resize-start="onDimensionResizeStart('row', $event)"
      @select="onRowHeaderSelect"
      @open-context-menu="openAxisContextMenu('row', $event.row, $event.clientX, $event.clientY)"
    />

    <div
      ref="scrollerRef"
      class="sheet-grid__scroller"
      role="grid"
      :aria-label="sheet.name"
      :aria-rowcount="gridExtent.rowCount"
      :aria-colcount="gridExtent.columnCount"
      aria-multiselectable="true"
      @scroll="onScroll"
    >
      <div class="sheet-grid__canvas" :style="gridCanvasStyle">
        <div class="sheet-grid__viewport" :style="gridViewportStyle">
          <SheetCellLayer
            :sheet="sheet"
            :geometry="geometry"
            :visible-range="visibleRange"
            :active-cell="activeCell"
            :selection="selection"
            :scroll-position="scrollPosition"
            @cell-mousedown="onCellMouseDown"
            @cell-double-click="onCellDoubleClick"
          >
            <template #active-cell>
              <CellEditor
                ref="editorRef"
                :model-value="editingValue"
                :address-label="activeCellLabel"
                :display-value="activeCellDisplayValue"
                :editing="isEditing"
                @keydown="onEditorKeydown"
                @blur="onEditorBlur"
                @composition-start="onCompositionStart"
                @composition-end="onCompositionEnd"
                @copy="onCopy"
                @cut="onCut"
                @paste="onPaste"
                @update:model-value="onEditorInput"
              />
            </template>
          </SheetCellLayer>
          <SheetSelectionOverlay
            :active-rect="activeCellRect"
            :range-rect="selectedRangeRect"
            :address-label="activeCellLabel"
            :editing="isEditing"
            :clipboard-rect="clipboardRangeRect"
            :clipboard-mode="clipboardMode"
          />
        </div>
      </div>
    </div>
    <SheetAxisContextMenu
      v-if="axisContextMenu"
      :axis="axisContextMenu.axis"
      :selection-count="axisContextMenu.count"
      :max-before-count="getAxisMaximum(axisContextMenu.axis) - axisContextMenu.index"
      :max-after-count="
        getAxisMaximum(axisContextMenu.axis) - axisContextMenu.index - axisContextMenu.count
      "
      :current-size="
        axisContextMenu.count === 1
          ? axisContextMenu.axis === 'row'
            ? geometry.getRowHeight(axisContextMenu.index)
            : geometry.getColumnWidth(axisContextMenu.index)
          : undefined
      "
      :minimum-size="axisContextMenu.axis === 'row' ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH"
      :maximum-size="axisContextMenu.axis === 'row' ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH"
      :position="axisContextMenu.position"
      @insert="requestAxisInsert"
      @resize="requestAxisResize"
      @delete="requestAxisDelete"
      @clear="requestAxisClear"
      @close="closeAxisContextMenu"
    />
    <span class="sheet-grid__assistive-status" aria-live="polite">{{ clipboardFeedback }}</span>
  </section>
</template>

<style scoped lang="scss">
.sheet-grid {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface-primary);

  &.is-resizing-column {
    cursor: col-resize;
  }

  &.is-resizing-row {
    cursor: row-resize;
  }

  &__corner {
    position: absolute;
    inset: 0 auto auto 0;
    z-index: 5;
    width: var(--sheet-row-header-width);
    height: var(--sheet-column-header-height);
    background: var(--ui-surface-muted);
    border-right: 1px solid var(--ui-border-strong);
    border-bottom: 1px solid var(--ui-border-strong);
    padding: 0;
    appearance: none;
    cursor: pointer;

    &.is-active {
      background: var(--ui-brand-soft);
    }

    &:focus-visible {
      z-index: 6;
      outline: 2px solid var(--ui-brand-primary);
      outline-offset: -2px;
    }
  }

  &__scroller {
    position: absolute;
    inset: var(--sheet-column-header-height) 0 0 var(--sheet-row-header-width);
    overflow: auto;
    background: var(--ui-surface-primary);
    outline: none;
    scrollbar-color: var(--ui-border-strong) var(--ui-surface-muted);
    scrollbar-width: thin;
  }

  &__canvas {
    position: relative;
  }

  &__viewport {
    position: sticky;
    top: 0;
    left: 0;
    overflow: hidden;
    background: var(--ui-surface-primary);
  }

  &__assistive-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
