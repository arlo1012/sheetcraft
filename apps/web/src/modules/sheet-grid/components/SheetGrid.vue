<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, markRaw, ref, watch } from "vue";
import { formatCellValueForInput } from "@idea10/core/input";
import { getCellAddressLabel } from "@idea10/core/coordinates";
import { DEFAULT_CELL_FONT_FAMILY } from "@idea10/core/style";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getCellStyle,
  getCellValue,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import {
  DEFAULT_GRID_EXTENT_POLICY,
  DEFAULT_INITIAL_GRID_EXTENT,
} from "@idea10/sheet-engine/extent";
import {
  areCellAddressesEqual,
  createAxisSelection,
  createCellSelection,
  extendAxisSelection,
  extendCellSelection,
  getSelectionMode,
  getSelectionRange,
  isCellSelected,
  isSingleCellSelection,
  moveActiveCellWithinSelection,
  moveCellSelection,
  type CellSelection,
} from "@idea10/sheet-engine/selection";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
} from "../useGridClipboard";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import {
  createApproximateTextMeasurer,
  createAutoRowHeightCalculator,
  mergeRowHeightOverrides,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@idea10/sheet-engine/row-height";
import { useDimensionResize } from "../composables/useDimensionResize";
import { useCellEditing } from "../composables/useCellEditing";
import { useDragSelection } from "../composables/useDragSelection";
import { useSheetViewport } from "../composables/useSheetViewport";
import CellEditor from "./CellEditor.vue";
import SheetAxisContextMenu from "./SheetAxisContextMenu.vue";
import SheetCellLayer from "./SheetCellLayer.vue";
import SheetCellContextMenu from "./SheetCellContextMenu.vue";
import SheetBorderLayer from "./SheetBorderLayer.vue";
import SheetColumnHeaders from "./SheetColumnHeaders.vue";
import SheetRowHeaders from "./SheetRowHeaders.vue";
import SheetSelectionOverlay from "./SheetSelectionOverlay.vue";
import { getCellEditorFrameStyle, getCellEditorStyle } from "../cell-presentation";
import { formatCellValueForGrid } from "../cell-value-presentation";

type AxisContextMenuState = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  anchor: FloatingReference;
  trigger: HTMLButtonElement;
};

type CellContextMenuState = {
  anchor: FloatingReference;
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
  valuesPasted: "clipboard.valuesPasted",
  formatsPasted: "clipboard.formatsPasted",
  formatsUnavailable: "clipboard.formatsUnavailable",
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
    formatPainterActive?: boolean;
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
  formatPainterTarget: [range: CellRange];
  cancelFormatPainter: [];
  undo: [];
  redo: [];
  viewStateChange: [viewState: SheetGridViewState];
}>();

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 28;

const { locale, t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const selection = ref<CellSelection>(createCellSelection({ row: 0, column: 0 }));
const clipboardFeedbackKey = ref<GridClipboardFeedback>();
const axisContextMenu = ref<AxisContextMenuState>();
const cellContextMenu = ref<CellContextMenuState>();
let fontFaceSet: FontFaceSet | undefined;
let fontLoadingDoneListener: (() => void) | undefined;

const approximateTextMeasurer = createApproximateTextMeasurer();
let canvasContext: CanvasRenderingContext2D | null | undefined;
const textMeasurer = markRaw<TextMeasurer>({
  measure(text: string, font: AutoRowHeightFont): number {
    if (canvasContext === undefined) {
      canvasContext =
        typeof document !== "undefined" && typeof CanvasRenderingContext2D !== "undefined"
          ? document.createElement("canvas").getContext("2d")
          : null;
    }
    if (!canvasContext) {
      return approximateTextMeasurer.measure(text, font);
    }
    const family = font.family.includes(",") ? font.family : JSON.stringify(font.family);
    canvasContext.font = `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${family}`;
    return canvasContext.measureText(text).width;
  },
});
const autoRowHeightCalculator = markRaw(createAutoRowHeightCalculator(textMeasurer));
const defaultFontFamily = ref(DEFAULT_CELL_FONT_FAMILY);
const fontMetricsVersion = ref(0);
const {
  dimensionResize,
  request: requestDimensionResize,
  start: startDimensionResize,
  stop: stopDimensionResize,
} = useDimensionResize({
  onBeforeStart: () => stopDragSelection(),
  onCommit: (payload) => emit("resizeDimension", payload),
});
const {
  geometry,
  getCellAtClientPoint,
  getRangeViewportRect,
  gridCanvasStyle,
  gridExtent,
  gridViewportStyle,
  ensureGridExtentContains,
  ensureGridExtentCoversViewport,
  ensureSelectionVisible,
  emitViewState,
  observe: observeViewport,
  onScroll,
  restore: restoreViewport,
  scrollPosition,
  scrollerRef,
  startGeometryWatch,
  stopObserving: stopObservingViewport,
  stopGeometryWatching,
  updateViewportSize,
  viewportSize,
  visibleRange,
} = useSheetViewport({
  initialExtent: {
    rowCount: props.initialRowCount,
    columnCount: props.initialColumnCount,
  },
  getGridExtentPolicy: () => ({
    growth: {
      rowCount: props.rowExpansionStep,
      columnCount: props.columnExpansionStep,
    },
    tail: {
      rowCount: props.rowExpansionTail,
      columnCount: props.columnExpansionTail,
    },
  }),
  getColumnWidths: () => effectiveColumnWidths.value,
  getRowHeights: () => effectiveRowHeights.value,
  getSelection: () => selection.value,
  onScrollStart: () => {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  },
  onViewStateChange: (viewState) => emit("viewStateChange", viewState),
});
const { start: startDragSelection, stop: stopDragSelection } = useDragSelection({
  getCellAtClientPoint,
  getScroller: () => scrollerRef.value,
  getViewportSize: () => viewportSize,
  onComplete: () => {
    if (props.formatPainterActive) {
      emit("formatPainterTarget", getSelectionRange(selection.value));
      return;
    }
    focusEditor();
  },
  onEnsureGridExtentContains: ensureGridExtentContains,
  onEnsureGridExtentCoversViewport: ensureGridExtentCoversViewport,
  onScrollPositionChange: (position) => {
    scrollPosition.x = position.x;
    scrollPosition.y = position.y;
  },
  onSelectionChange: (nextSelection, visibleAddress) =>
    setSelection(nextSelection, visibleAddress, false),
});

const effectiveColumnWidths = computed(() => {
  const columnWidths = new Map(props.sheet.columnWidths);
  const resize = dimensionResize.value;
  if (resize?.axis === "column") {
    columnWidths.set(resize.index, resize.previewSize);
  }
  return columnWidths;
});

const automaticRowHeights = computed(() => {
  return autoRowHeightCalculator.reconcile({
    cells: props.sheet.cells,
    columnWidths: effectiveColumnWidths.value,
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
    defaultFontFamily: defaultFontFamily.value,
    measurementVersion: fontMetricsVersion.value,
  });
});

const effectiveRowHeights = computed(() => {
  const rowHeights = mergeRowHeightOverrides(automaticRowHeights.value, props.sheet.rowHeights);
  const resize = dimensionResize.value;
  if (resize?.axis === "row") {
    rowHeights.set(resize.index, resize.previewSize);
  }
  return rowHeights;
});
startGeometryWatch();

const activeCell = computed(() => selection.value.active);
const {
  beginEdit,
  cancelEdit,
  deferSelectionWhileComposing,
  editingValue,
  editorRef,
  finishEdit,
  focusEditor,
  isComposing,
  isEditing,
  onBlur: onEditorBlur,
  onCompositionEnd,
  onCompositionStart,
  onInput: onEditorInput,
} = useCellEditing({
  getActiveCell: () => activeCell.value,
  getInputValue: () => formatCellValueForInput(getCellValue(props.sheet, activeCell.value)),
  onClearClipboard: () => clearPendingClipboard(),
  onCommit: (payload) => emit("commitCell", payload),
  onSelectionChange: (nextSelection) => setSelection(nextSelection),
});
const selectedRange = computed(() =>
  getSelectionRange(selection.value, {
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
  }),
);
const activeCellRect = computed(() =>
  geometry.value.getCellViewportRect(activeCell.value, scrollPosition),
);
const selectedRangeRect = computed(() => getRangeViewportRect(selectedRange.value));
const selectedRangeOutlineRect = computed(() => getRangeViewportRect(selectedRange.value, true));
const activeCellOutlineRect = computed(() =>
  getRangeViewportRect({ start: activeCell.value, end: activeCell.value }, true),
);
const activeCellLabel = computed(() => getCellAddressLabel(activeCell.value));
const activeCellDisplayValue = computed(() =>
  formatCellValueForGrid(
    getCellValue(props.sheet, activeCell.value),
    getCellStyle(props.sheet, activeCell.value),
    locale.value,
  ),
);
const activeCellEditorStyle = computed(() =>
  getCellEditorStyle(getCellStyle(props.sheet, activeCell.value)),
);
const activeCellEditorFrameStyle = computed(() =>
  getCellEditorFrameStyle(getCellStyle(props.sheet, activeCell.value)),
);
const activeCellWrapText = computed(() =>
  Boolean(getCellStyle(props.sheet, activeCell.value)?.wrapText),
);
const clipboardFeedback = computed(() =>
  clipboardFeedbackKey.value ? t(CLIPBOARD_MESSAGE_KEYS[clipboardFeedbackKey.value]) : "",
);
const {
  canPasteFormats,
  clipboardMode,
  clipboardRange,
  clearPendingClipboard,
  copySelection,
  cutSelection,
  onCopy,
  onCut,
  onPaste,
  pasteSelection,
  pasteFormatsSelection,
  pasteValuesSelection,
} = useGridClipboard({
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
  clipboardRange.value ? getRangeViewportRect(clipboardRange.value, true) : null,
);

function setSelection(
  nextSelection: CellSelection,
  visibleAddress: CellAddress = nextSelection.active,
  restoreFocus = true,
): void {
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  selection.value = {
    active: { ...nextSelection.active },
    anchor: { ...nextSelection.anchor },
    focus: { ...nextSelection.focus },
    mode: nextSelection.mode,
  };
  ensureGridExtentContains(visibleAddress);
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
  if (deferSelectionWhileComposing(nextSelection)) {
    return;
  }

  if (isEditing.value) {
    finishEdit(nextSelection);
  } else {
    setSelection(nextSelection, address);
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

function onDimensionResizeRequest(
  axis: SheetDimensionAxis,
  payload: { index: number; size: number },
): void {
  requestDimensionResize(axis, payload);
}

function onDimensionResizeStart(
  axis: SheetDimensionAxis,
  payload: { index: number; event: PointerEvent },
): void {
  const startSize =
    axis === "row"
      ? geometry.value.getRowHeight(payload.index)
      : geometry.value.getColumnWidth(payload.index);
  startDimensionResize(axis, { ...payload, startSize });
}

function onGridKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }
  if (dimensionResize.value) {
    event.preventDefault();
    event.stopPropagation();
    stopDimensionResize();
    return;
  }
  if (props.formatPainterActive) {
    event.preventDefault();
    event.stopPropagation();
    emit("cancelFormatPainter");
    return;
  }
  if (!isEditing.value && clipboardRange.value) {
    event.preventDefault();
    event.stopPropagation();
    clearPendingClipboard();
    clipboardFeedbackKey.value = undefined;
  }
}

function onCellMouseDown(address: CellAddress, event: MouseEvent): void {
  const previousSelection = selection.value;
  const nextSelection = event.shiftKey
    ? extendCellSelection(previousSelection, address)
    : createCellSelection(address);

  if (deferSelectionWhileComposing(nextSelection)) {
    return;
  }

  if (isEditing.value) {
    finishEdit(nextSelection);
  } else {
    setSelection(nextSelection, address);
  }

  startDragSelection(nextSelection, event);
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
  if (deferSelectionWhileComposing(nextSelection)) {
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
  trigger: HTMLButtonElement,
): void {
  if (isComposing.value) {
    return;
  }
  cellContextMenu.value = undefined;
  if (!isAxisIndexSelected(axis, index)) {
    const address = axis === "row" ? { row: index, column: 0 } : { row: 0, column: index };
    selectAxis(axis === "row" ? "rows" : "columns", address, false, false);
  }

  const range = selectedRange.value;
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  axisContextMenu.value = {
    axis,
    index: start,
    count: end - start + 1,
    anchor: markRaw({
      contextElement: rootRef.value ?? trigger,
      getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0),
    }),
    trigger,
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
  const trigger = axisContextMenu.value?.trigger;
  axisContextMenu.value = undefined;
  if (restoreFocus) {
    void nextTick(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        focusEditor();
      }
    });
  }
}

function openCellContextMenu(address: CellAddress, event: MouseEvent): void {
  if (isEditing.value || isComposing.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  const retainsSelection =
    getSelectionMode(selection.value) === "cells" && isCellSelected(address, selection.value);
  if (!retainsSelection) {
    setActiveCell(address, false);
  }

  axisContextMenu.value = undefined;
  const contextElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  cellContextMenu.value = {
    anchor: markRaw({
      contextElement: rootRef.value ?? contextElement ?? undefined,
      getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0),
    }),
  };
}

function openActiveCellContextMenu(): void {
  if (getSelectionMode(selection.value) !== "cells") {
    return;
  }
  const scroller = scrollerRef.value;
  if (!scroller) {
    return;
  }
  const bounds = scroller.getBoundingClientRect();
  const rect = activeCellRect.value;
  const x = bounds.left + rect.x + Math.min(16, rect.width / 2);
  const y = bounds.top + rect.y + rect.height;
  axisContextMenu.value = undefined;
  cellContextMenu.value = {
    anchor: markRaw({
      contextElement: scroller,
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    }),
  };
}

async function requestCellClipboard(
  action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
): Promise<void> {
  if (!cellContextMenu.value) {
    return;
  }
  cellContextMenu.value = undefined;
  if (action === "cut") {
    await cutSelection();
  } else if (action === "copy") {
    await copySelection();
  } else if (action === "paste-values") {
    await pasteValuesSelection();
  } else if (action === "paste-formats") {
    await pasteFormatsSelection();
  } else {
    await pasteSelection();
  }
  focusEditor();
}

function requestCellClear(): void {
  if (!cellContextMenu.value) {
    return;
  }
  clearPendingClipboard();
  clipboardFeedbackKey.value = undefined;
  emit("clearCells", getSelectionRange(selection.value));
  cellContextMenu.value = undefined;
  focusEditor();
}

function closeCellContextMenu(restoreFocus: boolean): void {
  cellContextMenu.value = undefined;
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
  if (isEditing.value) {
    return false;
  }
  const action = getWorkbookHistoryShortcut(event, { allowEditableTarget: true });
  if (!action) return false;
  event.preventDefault();
  clearPendingClipboard();
  if (action === "undo") emit("undo");
  else emit("redo");
  return true;
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

  if (props.formatPainterActive && event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    emit("formatPainterTarget", getSelectionRange(selection.value));
    return;
  }

  if (
    !isEditing.value &&
    getSelectionMode(selection.value) === "cells" &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    event.preventDefault();
    event.stopPropagation();
    openActiveCellContextMenu();
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
      if (event.altKey) {
        editorRef.value?.insertLineBreak();
        return;
      }
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

function restoreViewState(viewState?: SheetGridViewState): void {
  const nextViewState = viewState
    ? createSheetGridViewState(viewState)
    : createSheetGridViewState({
        gridExtent: {
          rowCount: props.initialRowCount,
          columnCount: props.initialColumnCount,
        },
      });
  stopDragSelection();
  stopDimensionResize();
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  clearPendingClipboard();
  selection.value = nextViewState.selection;
  cancelEdit(false);
  restoreViewport(nextViewState);
}

watch(
  () => props.sheet.id,
  () => {
    autoRowHeightCalculator.clear();
    restoreViewState(props.viewState);
    focusEditor();
  },
);

onMounted(() => {
  const root = rootRef.value;
  const resolvedFontFamily = root ? getComputedStyle(root).fontFamily.trim() : "";
  if (resolvedFontFamily) {
    defaultFontFamily.value = resolvedFontFamily;
  }
  if (typeof document !== "undefined" && "fonts" in document) {
    fontFaceSet = document.fonts;
    const refreshFontMetrics = () => {
      autoRowHeightCalculator.clear();
      fontMetricsVersion.value += 1;
    };
    fontFaceSet.addEventListener("loadingdone", refreshFontMetrics);
    void fontFaceSet.ready.then(() => {
      if (rootRef.value) {
        refreshFontMetrics();
      }
    });
    fontLoadingDoneListener = refreshFontMetrics;
  }
  updateViewportSize();
  restoreViewState(props.viewState);
  observeViewport();
  focusEditor();
});

onBeforeUnmount(() => {
  if (fontFaceSet && fontLoadingDoneListener) {
    fontFaceSet.removeEventListener("loadingdone", fontLoadingDoneListener);
  }
  stopObservingViewport();
  stopGeometryWatching();
  stopDragSelection();
  stopDimensionResize();
  clearPendingClipboard();
});

defineExpose({ focusGrid: focusEditor, navigateToCell });
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
        openAxisContextMenu('column', $event.column, $event.clientX, $event.clientY, $event.trigger)
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
      @open-context-menu="
        openAxisContextMenu('row', $event.row, $event.clientX, $event.clientY, $event.trigger)
      "
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
            :editing="isEditing"
            :locale="locale"
            @cell-mousedown="onCellMouseDown"
            @cell-double-click="onCellDoubleClick"
            @cell-contextmenu="openCellContextMenu"
          >
            <template #active-cell>
              <CellEditor
                ref="editorRef"
                :model-value="editingValue"
                :address-label="activeCellLabel"
                :display-value="activeCellDisplayValue"
                :editing="isEditing"
                :wrap-text="activeCellWrapText"
                :cell-rect="activeCellRect"
                :viewport-size="viewportSize"
                :style="activeCellEditorStyle"
                :frame-style="activeCellEditorFrameStyle"
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
            :active-rect="activeCellOutlineRect"
            :range-rect="selectedRangeRect"
            :range-outline-rect="selectedRangeOutlineRect"
            :address-label="activeCellLabel"
            :editing="isEditing"
            :clipboard-rect="clipboardRangeRect"
            :clipboard-mode="clipboardMode"
          />
          <SheetBorderLayer
            :sheet="sheet"
            :geometry="geometry"
            :visible-range="visibleRange"
            :scroll-position="scrollPosition"
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
      :anchor="axisContextMenu.anchor"
      @insert="requestAxisInsert"
      @resize="requestAxisResize"
      @delete="requestAxisDelete"
      @clear="requestAxisClear"
      @close="closeAxisContextMenu"
    />
    <SheetCellContextMenu
      v-if="cellContextMenu"
      :anchor="cellContextMenu.anchor"
      :paste-special-disabled="clipboardMode === 'cut'"
      :paste-formats-disabled="!canPasteFormats"
      @cut="requestCellClipboard('cut')"
      @copy="requestCellClipboard('copy')"
      @paste="requestCellClipboard('paste')"
      @paste-values="requestCellClipboard('paste-values')"
      @paste-formats="requestCellClipboard('paste-formats')"
      @clear="requestCellClear"
      @close="closeCellContextMenu"
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
  background: var(--idea-surface-panel);

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
    background: var(--idea-surface-secondary);
    border-right: 1px solid var(--idea-border-control);
    border-bottom: 1px solid var(--idea-border-control);
    padding: 0;
    appearance: none;
    cursor: pointer;

    &.is-active {
      background: var(--idea-action-focus);
    }

    &:focus-visible {
      z-index: 6;
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }

  &__scroller {
    position: absolute;
    inset: var(--sheet-column-header-height) 0 0 var(--sheet-row-header-width);
    overflow: auto;
    background: var(--idea-surface-panel);
    outline: none;
    scrollbar-color: var(--idea-border-control) var(--idea-surface-secondary);
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
    background: var(--idea-surface-panel);
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
