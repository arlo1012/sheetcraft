<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  markRaw,
  ref,
  shallowRef,
  watch,
} from "vue";
import { formatCellContentForInput } from "@idea10/core/input";
import type { ExcelDateSystem } from "@idea10/core/formula";
import { columnIndexToLabel, getCellAddressLabel } from "@idea10/core/coordinates";
import { DEFAULT_CELL_FONT_FAMILY } from "@idea10/core/style";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { normalizeSheetZoom } from "../../../shared/sheet-view/zoom";
import { getSelectionFitZoom } from "../selection-zoom";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import { completeFormulaForCommit } from "../../../shared/formula-editing/formula-commit";
import type { FormulaReferenceToken } from "../../../shared/formula-editing/formula-reference-tokens";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  createSheetEvaluator,
  getCellContent,
  getCellStyle,
  type FloatingImage,
  type CellAddress,
  type ImageTransform,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import { expandSelectionToMergedCellRanges } from "@idea10/core";
import { createSheetFilterHiddenRowIntervals } from "@idea10/core/commands";
import {
  DEFAULT_GRID_EXTENT_POLICY,
  DEFAULT_INITIAL_GRID_EXTENT,
  getSheetContentExtent,
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
  type GridPasteResult,
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
import { useAxisMoveDrag, type AxisMovePayload } from "../composables/useAxisMoveDrag";
import { getViewportAxisBoundaryOffset } from "@idea10/sheet-engine/axis-interactions";
import { useCellEditing } from "../composables/useCellEditing";
import { useFormulaReferenceNavigation } from "../composables/useFormulaReferenceNavigation";
import { useDragSelection } from "../composables/useDragSelection";
import { useSheetViewport } from "../composables/useSheetViewport";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";
import type { ImageInsertMode } from "../../sheet-images/useSheetImageActions";
import SheetFloatingImageLayer from "../../sheet-images/components/SheetFloatingImageLayer.vue";
import SheetImagePreview from "../../sheet-images/components/SheetImagePreview.vue";
import { useFloatingImageClipboard } from "../../sheet-images/useFloatingImageClipboard";
import { areGridClipboardTextsEqual, createBrowserGridClipboardPort } from "../gridClipboardPort";
import { readFloatingImageClipboard } from "../../sheet-images/imageClipboard";
import CellEditor from "./CellEditor.vue";
import SheetAxisContextMenu from "./SheetAxisContextMenu.vue";
import SheetAxisOperationPreview from "./SheetAxisOperationPreview.vue";
import SheetFreezeHandles from "./SheetFreezeHandles.vue";
import SheetFreezeLines from "./SheetFreezeLines.vue";
import SheetCellLayer from "./SheetCellLayer.vue";
import SheetCellContextMenu from "./SheetCellContextMenu.vue";
import SheetBorderLayer from "./SheetBorderLayer.vue";
import SheetColumnHeaders from "./SheetColumnHeaders.vue";
import SheetRowHeaders from "./SheetRowHeaders.vue";
import SheetSelectionOverlay from "./SheetSelectionOverlay.vue";
import SheetReadingHighlight from "./SheetReadingHighlight.vue";
import type { FormulaReferenceOverlayGroup } from "./SheetSelectionOverlay.vue";
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
  imageAddress?: CellAddress;
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
  filteredCutUnsupported: "clipboard.filteredCutUnsupported",
  mergedRangeUnsupported: "clipboard.mergedRangeUnsupported",
  noVisibleCells: "clipboard.noVisibleCells",
  rangeTooLarge: "clipboard.rangeTooLarge",
  pasteRejected: "clipboard.pasteRejected",
  documentChanged: "clipboard.documentChanged",
};

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    workbookRevision?: number;
    applyPaste?: (payload: GridPastePayload) => GridPasteResult;
    applyAxisMove?: (payload: AxisMovePayload) => boolean;
    initialRowCount?: number;
    initialColumnCount?: number;
    rowExpansionStep?: number;
    columnExpansionStep?: number;
    rowExpansionTail?: number;
    columnExpansionTail?: number;
    viewState?: SheetGridViewState;
    formatPainterActive?: boolean;
    referenceEditor?: FormulaReferenceEditor | null;
    editSession?: CellEditSession;
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
    missingImageAssetIds?: ReadonlySet<string>;
    readOnly?: boolean;
    gridId?: string;
    externalHorizontalScrollbar?: boolean;
    zoom?: number;
    highlightEnabled?: boolean;
    highlightColor?: string;
    showHeaders?: boolean;
    showGridLines?: boolean;
    showAxisQuickTools?: boolean;
    dateSystem?: ExcelDateSystem;
  }>(),
  {
    initialRowCount: DEFAULT_INITIAL_GRID_EXTENT.rowCount,
    initialColumnCount: DEFAULT_INITIAL_GRID_EXTENT.columnCount,
    rowExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.rowCount,
    columnExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.columnCount,
    rowExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.rowCount,
    columnExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.columnCount,
    readOnly: false,
    externalHorizontalScrollbar: false,
    zoom: 100,
    highlightEnabled: false,
    highlightColor: "#22a06b",
    showHeaders: true,
    showGridLines: true,
    showAxisQuickTools: false,
    dateSystem: "1900",
  },
);

const emit = defineEmits<{
  updateFloatingImage: [image: FloatingImage];
  deleteFloatingImage: [id: string];
  convertFloatingImageToCell: [id: string];
  convertCellImageToFloating: [address: CellAddress];
  imageFeedback: [key: MessageKey];
  pasteImageFile: [file: File, mode: ImageInsertMode, address?: CellAddress];
  pasteFloatingImage: [image: FloatingImage, mode: ImageInsertMode, address?: CellAddress];
  commitCell: [payload: { address: CellAddress; input: string }];
  clearCells: [range: CellRange];
  clipboardFeedback: [feedback: GridClipboardFeedback];
  resizeDimension: [payload: { axis: SheetDimensionAxis; index: number; size: number }];
  insertAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  deleteAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  freezeChange: [freezePanes: { rows: number; columns: number }];
  formatPainterTarget: [range: CellRange];
  cancelFormatPainter: [];
  undo: [];
  redo: [];
  viewStateChange: [viewState: SheetGridViewState];
  horizontalScrollChange: [state: SheetHorizontalScrollState];
  "update:zoom": [zoom: number];
}>();

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 28;
const AXIS_TOOL_GUTTER = 20;
const quickToolsGutter = computed(() =>
  props.showHeaders && props.showAxisQuickTools ? AXIS_TOOL_GUTTER : 0,
);

const headerSize = computed(() => ({
  width: props.showHeaders ? ROW_HEADER_WIDTH + quickToolsGutter.value : 0,
  height: props.showHeaders ? COLUMN_HEADER_HEIGHT + quickToolsGutter.value : 0,
}));

const { locale, t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const scale = computed(() => normalizeSheetZoom(props.zoom) / 100);
const selectedImageId = ref<string | null>(null);
const selection = shallowRef<CellSelection>(createCellSelection({ row: 0, column: 0 }));
const imagePreview = shallowRef<{
  assetId: string;
  altText: string;
  transform?: ImageTransform;
  trigger?: HTMLElement;
}>();
const previewUrl = computed(
  () => imagePreview.value && props.imageAssetUrls?.get(imagePreview.value.assetId),
);

function openImagePreview(
  image: { assetId: string; altText: string; transform?: ImageTransform },
  trigger?: HTMLElement,
): void {
  if (!props.imageAssetUrls?.has(image.assetId)) return;
  imagePreview.value = { ...image, trigger };
}

function closeImagePreview(): void {
  const trigger = imagePreview.value?.trigger;
  imagePreview.value = undefined;
  void nextTick(() =>
    trigger?.isConnected ? trigger.focus({ preventScroll: true }) : focusEditor(),
  );
}

watch(() => props.sheet.id, closeImagePreview);
watch(previewUrl, (url) => {
  if (!url && imagePreview.value) closeImagePreview();
});
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
const contentExtent = computed(() => getSheetContentExtent(props.sheet));
const {
  dimensionResize,
  request: requestDimensionResize,
  start: startDimensionResize,
  stop: stopDimensionResize,
} = useDimensionResize({
  getScale: () => scale.value,
  onBeforeStart: () => stopDragSelection(),
  onCommit: (payload) => emit("resizeDimension", payload),
});
const {
  columnHeaderPanes,
  geometry,
  getCellAtClientPoint,
  gridCanvasStyle,
  gridExtent,
  gridViewportStyle,
  horizontalScrollState,
  ensureGridExtentContains,
  ensureGridExtentCoversViewport,
  ensureSelectionVisible,
  emitViewState,
  layout,
  observe: observeViewport,
  onScroll,
  onWheel,
  restore: restoreViewport,
  rowHeaderPanes,
  rowVisibility,
  scrollPosition,
  scrollHorizontally,
  scrollerRef,
  startGeometryWatch,
  stopObserving: stopObservingViewport,
  stopGeometryWatching,
  updateViewportSize,
  viewportSize,
} = useSheetViewport({
  getScale: () => scale.value,
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
  getContentExtent: () => contentExtent.value,
  getRowHeights: () => effectiveRowHeights.value,
  getFreezePanes: () => props.sheet.freezePanes,
  getMergedCells: () => props.sheet.mergedCells,
  getHiddenRowIntervals: () =>
    createSheetFilterHiddenRowIntervals(props.sheet, sheetEvaluator.value),
  getSelection: () => selection.value,
  onScrollStart: () => {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
    quickInsertHover.value = undefined;
  },
  onViewStateChange: (viewState) => emit("viewStateChange", viewState),
});
const { start: startDragSelection, stop: stopDragSelection } = useDragSelection({
  getScale: () => scale.value,
  getCellAtClientPoint,
  getScroller: () => scrollerRef.value,
  getViewportSize: () => viewportSize,
  onComplete: () => {
    if (props.formatPainterActive && !props.readOnly) {
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
const formulaReferenceRange = ref<CellRange>();
let formulaReferenceDragEditor: FormulaReferenceEditor | undefined;
const { start: startFormulaReferenceDrag, stop: stopFormulaReferenceDragInternal } =
  useDragSelection({
    getScale: () => scale.value,
    getCellAtClientPoint,
    getScroller: () => scrollerRef.value,
    getViewportSize: () => viewportSize,
    onComplete: () => {
      const editor = formulaReferenceDragEditor;
      const range = formulaReferenceRange.value;
      formulaReferenceDragEditor = undefined;
      if (editor?.canPickReference() && range) {
        editor.pickReference(range, "end");
      }
    },
    onEnsureGridExtentContains: ensureGridExtentContains,
    onEnsureGridExtentCoversViewport: ensureGridExtentCoversViewport,
    onScrollPositionChange: (position) => {
      scrollPosition.x = position.x;
      scrollPosition.y = position.y;
    },
    onSelectionChange: (nextSelection) => {
      const editor = formulaReferenceDragEditor;
      if (!editor?.canPickReference()) {
        stopFormulaReferenceDrag();
        return;
      }
      const range = getSelectionRange(nextSelection);
      formulaReferenceRange.value = range;
      editor.pickReference(range, "update");
    },
  });

const effectiveColumnWidths = computed(() => {
  const columnWidths = new Map(props.sheet.columnWidths);
  const resize = dimensionResize.value;
  if (resize?.axis === "column") {
    columnWidths.set(resize.index, resize.previewSize);
  }
  return columnWidths;
});

const sheetEvaluator = computed<SheetEvaluator>(() => {
  // Value iteration also invalidates an existing sparse cell whose content changes in place.
  for (const cell of props.sheet.cells.values()) {
    void cell;
  }
  return createSheetEvaluator(props.sheet);
});

const automaticRowHeights = computed(() => {
  return autoRowHeightCalculator.reconcile({
    cells: props.sheet.cells,
    getComputedValue: sheetEvaluator.value.getComputedValue,
    formatValue: (_address, cell, value) =>
      formatCellValueForGrid(value, cell.style, locale.value, props.dateSystem),
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
  cancelEdit: cancelCellEdit,
  deferSelectionWhileComposing,
  editSession,
  editingValue,
  editorRef,
  finishEdit: finishCellEdit,
  focusEditor,
  isComposing,
  isEditing,
  onBlur: onCellEditorBlur,
  onCompositionEnd,
  onCompositionStart,
  onInput: onEditorInput,
} = useCellEditing({
  session: props.editSession,
  getSheetId: () => props.sheet.id,
  getActiveCell: () => activeCell.value,
  getInputValue: () => formatCellContentForInput(getCellContent(props.sheet, activeCell.value)),
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
const quickToolsAvailable = computed(
  () =>
    props.showAxisQuickTools &&
    props.showHeaders &&
    !props.readOnly &&
    !isEditing.value &&
    !isComposing.value &&
    !dimensionResize.value,
);
const freezeDragging = ref(false);
const quickInsertHover = shallowRef<{ axis: SheetDimensionAxis; index: number }>();
const {
  drag: axisMoveDrag,
  start: startAxisMoveDrag,
  stop: stopAxisMoveDrag,
} = useAxisMoveDrag({
  getRoot: () => rootRef.value,
  getLayout: () => layout.value,
  getHeaderSize: () => headerSize.value,
  getScroller: () => scrollerRef.value,
  onScroll: (position) => {
    scrollPosition.x = position.x;
    scrollPosition.y = position.y;
    emitViewState();
  },
  onBeforeStart: () => {
    stopDragSelection();
    stopFormulaReferenceDrag();
    quickInsertHover.value = undefined;
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  },
  onCommit: (payload) => {
    if (!quickToolsAvailable.value || !props.applyAxisMove?.(payload)) return;
    clearPendingClipboard();
    const address =
      payload.axis === "row"
        ? { row: payload.toIndex, column: 0 }
        : { row: 0, column: payload.toIndex };
    const last =
      payload.axis === "row"
        ? { row: payload.toIndex + payload.count - 1, column: 0 }
        : { row: 0, column: payload.toIndex + payload.count - 1 };
    const next = extendAxisSelection(
      createAxisSelection(payload.axis === "row" ? "rows" : "columns", address),
      payload.axis === "row" ? "rows" : "columns",
      last,
    );
    setSelection(next, address);
  },
});
const headerQuickToolsEnabled = computed(
  () => quickToolsAvailable.value && !freezeDragging.value && !axisMoveDrag.value?.active,
);

function getQuickInsertCount(axis: SheetDimensionAxis, boundary: number): number {
  const expectedMode = axis === "row" ? "rows" : "columns";
  const range = selectedRange.value;
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  return getSelectionMode(selection.value) === expectedMode &&
    (boundary === start || boundary === end + 1)
    ? end - start + 1
    : 1;
}

const axisOperationPreview = computed(() => {
  if (!quickToolsAvailable.value || freezeDragging.value) return undefined;
  const drag = axisMoveDrag.value;
  if (drag?.active) {
    return {
      axis: drag.axis,
      offset: drag.offset,
      label: t(drag.axis === "row" ? "grid.moveToRow" : "grid.moveToColumn", {
        count: drag.count,
        row: drag.boundary + 1,
        column: columnIndexToLabel(drag.boundary),
      }),
    };
  }
  const hover = quickInsertHover.value;
  if (!hover) return undefined;
  const offset = getViewportAxisBoundaryOffset(layout.value, hover.axis, hover.index);
  if (offset === null) return undefined;
  return {
    axis: hover.axis,
    offset,
    label: t(hover.axis === "row" ? "grid.insertAtRow" : "grid.insertAtColumn", {
      count: getQuickInsertCount(hover.axis, hover.index),
      row: hover.index + 1,
      column: columnIndexToLabel(hover.index),
    }),
  };
});

function onQuickInsertHover(axis: SheetDimensionAxis, payload: { index: number } | null): void {
  quickInsertHover.value = payload ? { axis, index: payload.index } : undefined;
}

function onQuickInsert(axis: SheetDimensionAxis, payload: { index: number }): void {
  if (!headerQuickToolsEnabled.value) return;
  requestAxisInsertion(axis, payload.index, getQuickInsertCount(axis, payload.index), "before");
  quickInsertHover.value = undefined;
  focusEditor();
}

function onAxisDragStart(
  axis: SheetDimensionAxis,
  payload: { index: number; event: PointerEvent },
): void {
  if (!headerQuickToolsEnabled.value || !isAxisIndexSelected(axis, payload.index)) return;
  const range = selectedRange.value;
  const start = axis === "row" ? range.start.row : range.start.column;
  const end = axis === "row" ? range.end.row : range.end.column;
  startAxisMoveDrag(axis, start, end - start + 1, payload.event);
}

watch(quickToolsAvailable, (available) => {
  if (!available) {
    stopAxisMoveDrag();
    quickInsertHover.value = undefined;
  }
});

const activeCellRect = computed(
  () => layout.value.getCellViewportRect(activeCell.value) ?? { x: 0, y: 0, width: 0, height: 0 },
);
const selectedRangeRects = computed(() => layout.value.getRangeFragments(selectedRange.value));

function fitSelectionToViewport(): void {
  const range = selectedRange.value;
  const rect = layout.value.getRangeRect(range);
  if (!rect) return;
  const nextZoom = getSelectionFitZoom({
    selectionRect: rect,
    viewportSize: {
      width: (viewportSize.width + headerSize.value.width) * scale.value,
      height: (viewportSize.height + headerSize.value.height) * scale.value,
    },
    frozenSize: layout.value.frozenSize,
    headerSize: headerSize.value,
  });
  if (nextZoom === undefined) return;
  const sheetId = props.sheet.id;
  emit("update:zoom", nextZoom);
  void nextTick(() => {
    if (props.sheet.id !== sheetId) return;
    updateViewportSize();
    const rows = rowVisibility.value;
    const firstRow = rows.isRowVisible(range.start.row)
      ? range.start.row
      : rows.getNextVisibleRow(range.start.row);
    const lastRow = rows.isRowVisible(range.end.row)
      ? range.end.row
      : rows.getPreviousVisibleRow(range.end.row);
    if (firstRow === null || lastRow === null || firstRow > lastRow) return;
    ensureSelectionVisible({ row: lastRow, column: range.end.column }, "cells");
    ensureSelectionVisible({ row: firstRow, column: range.start.column }, "cells");
    emitViewState();
  });
}
const referenceEditor = computed<FormulaReferenceEditor | null>(() => {
  if (props.referenceEditor?.editingFormula) return props.referenceEditor;
  return editorRef.value?.formulaReferenceEditor ?? null;
});
const formulaReferenceGroups = computed<readonly FormulaReferenceOverlayGroup[]>(() => {
  const editor = referenceEditor.value;
  if (!editor?.editingFormula) return [];
  const groups = new Map<string, { token: FormulaReferenceToken; active: boolean }>();
  for (const token of editor.references) {
    const existing = groups.get(token.key);
    if (existing) continue;
    groups.set(token.key, { token, active: isActiveFormulaReference(editor, token) });
  }
  return [...groups.values()].map(({ token, active }) => ({
    key: token.key,
    colorIndex: token.colorIndex,
    rects: layout.value.getRangeFragments(token.range),
    active,
  }));
});

function isActiveFormulaReference(
  editor: FormulaReferenceEditor,
  token: FormulaReferenceToken,
): boolean {
  const range = editor.referenceRange;
  if (!editor.referenceActive || !range) return false;
  return (
    Math.min(range.start.row, range.end.row) ===
      Math.min(token.range.start.row, token.range.end.row) &&
    Math.max(range.start.row, range.end.row) ===
      Math.max(token.range.start.row, token.range.end.row) &&
    Math.min(range.start.column, range.end.column) ===
      Math.min(token.range.start.column, token.range.end.column) &&
    Math.max(range.start.column, range.end.column) ===
      Math.max(token.range.start.column, token.range.end.column)
  );
}
const activeCellOutlineRects = computed(() =>
  layout.value.getRangeFragments(
    layout.value.getMergedRangeAt(activeCell.value) ?? {
      start: activeCell.value,
      end: activeCell.value,
    },
  ),
);
const activeCellLabel = computed(() => getCellAddressLabel(activeCell.value));
const activeCellDisplayValue = computed(() =>
  getCellContent(props.sheet, activeCell.value)?.kind === "image"
    ? t("image.cellAlt")
    : formatCellValueForGrid(
        sheetEvaluator.value.getComputedValue(activeCell.value),
        getCellStyle(props.sheet, activeCell.value),
        locale.value,
        props.dateSystem,
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
const browserClipboard = createBrowserGridClipboardPort();
const {
  canPasteFormats,
  clipboardMode,
  clipboardRange,
  cutDisabledReason,
  clearPendingClipboard,
  copySelection,
  cutSelection,
  onCopy,
  onCut,
  onPaste,
  pasteSelection,
  pasteCapturedText,
  pasteFormatsSelection,
  pasteValuesSelection,
} = useGridClipboard({
  clipboardPort: browserClipboard,
  onReadTransfer: (transfer) => floatingClipboard.observeTransfer(transfer),
  onPasteImage: (transfer, targetSelection) => {
    floatingClipboard.observeTransfer(transfer);
    const address = targetSelection.active;
    const mode = getCellContent(props.sheet, address)?.kind === "image" ? "cell" : "floating";
    if (transfer.floatingImage) floatingClipboard.paste(transfer.floatingImage, mode, address);
    else if (transfer.imageFile) emit("pasteImageFile", transfer.imageFile, mode, address);
  },
  onReadUnavailable: (targetSelection) => floatingClipboard.pastePending(targetSelection.active),
  getSheet: () => props.sheet,
  getSelection: () => selection.value,
  getRevision: () => props.workbookRevision ?? 0,
  isEditing: () => isEditing.value,
  isComposing: () => isComposing.value,
  onPaste: (payload) => {
    const result = props.applyPaste?.(payload) ?? { ok: false, reason: "pasteRejected" as const };
    if (!result.ok) return result;
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
    return result;
  },
  onFeedback: (message) => {
    emit("clipboardFeedback", message);
  },
});
const floatingClipboard = useFloatingImageClipboard({
  getSheet: () => props.sheet,
  getRevision: () => props.workbookRevision ?? 0,
  clipboardPort: browserClipboard,
  onCopy: clearPendingClipboard,
  onFeedback: (key) => emit("imageFeedback", key),
  onPaste: (image, mode, address) => emit("pasteFloatingImage", image, mode, address),
  onMove: (image) => emit("updateFloatingImage", image),
});
const clipboardRangeRects = computed(() =>
  clipboardRange.value ? layout.value.getRangeFragments(clipboardRange.value) : [],
);

function selectFloatingImage(id: string | null): void {
  if (isComposing.value) return;
  if (isEditing.value) finishEdit(undefined, false);
  stopDragSelection();
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  selectedImageId.value = id;
  if (!id) focusEditor();
}

function deleteSelectedFloatingImage(id: string): void {
  if (props.readOnly) return;
  emit("deleteFloatingImage", id);
  selectedImageId.value = null;
  focusEditor();
}

function convertSelectedFloatingImageToCell(id: string): void {
  if (props.readOnly) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (!image) return;
  emit("convertFloatingImageToCell", id);
  if (!props.sheet.floatingImages.some((entry) => entry.id === id)) {
    setActiveCell(layout.value.getAnchorForAddress(image.anchor));
  }
}

function onImageCopy(event: ClipboardEvent): void {
  const image = props.sheet.floatingImages.find((entry) => entry.id === selectedImageId.value);
  if (isEditing.value || !image) {
    floatingClipboard.clear();
    return;
  }
  event.stopPropagation();
  void floatingClipboard.copy(image, "copy", event);
}

function onImageCut(event: ClipboardEvent): void {
  const image = props.sheet.floatingImages.find((entry) => entry.id === selectedImageId.value);
  if (isEditing.value || !image) {
    floatingClipboard.clear();
    return;
  }
  if (props.readOnly) {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
  void floatingClipboard.copy(image, "cut", event);
}

function requestFloatingImageCopy(id: string, mode: "copy" | "cut"): void {
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (image) void floatingClipboard.copy(image, mode);
}

async function requestFloatingImagePaste(id: string): Promise<void> {
  if (props.readOnly) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (!image) return;
  setActiveCell(image.anchor);
  await pasteSelection();
  focusEditor();
}

function onImagePaste(event: ClipboardEvent): void {
  if (props.readOnly) {
    event.preventDefault();
    return;
  }
  if (isComposing.value || !event.clipboardData) return;
  const image = readFloatingImageClipboard(event.clipboardData);
  const file =
    Array.from(event.clipboardData.files ?? []).find((entry) => entry.type.startsWith("image/")) ??
    Array.from(event.clipboardData.items ?? [])
      .find((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
      ?.getAsFile();
  if (!image && !file) {
    // Chromium exposes Async Clipboard custom formats only through read(), not paste events.
    if (floatingClipboard.hasPending() && navigator.clipboard)
      void pasteDeferredFloatingImage(event);
    else floatingClipboard.clear();
    return;
  }
  floatingClipboard.observeTransfer({ floatingImage: image });
  event.preventDefault();
  event.stopPropagation();
  const mode: ImageInsertMode =
    isEditing.value ||
    (!selectedImageId.value && getCellContent(props.sheet, activeCell.value)?.kind === "image")
      ? "cell"
      : "floating";
  // Commit any typed draft before the exclusive image content replaces this cell.
  if (isEditing.value) finishEdit(undefined, false);
  clearPendingClipboard();
  if (image) floatingClipboard.paste(image, mode, activeCell.value);
  else if (file) emit("pasteImageFile", file, mode);
}

async function pasteDeferredFloatingImage(event: ClipboardEvent): Promise<void> {
  if (props.readOnly) return;
  event.preventDefault();
  event.stopPropagation();
  const sheet = props.sheet;
  const revision = props.workbookRevision;
  const address = { ...activeCell.value };
  const editing = isEditing.value;
  const draft = editingValue.value;
  const input = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
  const start = input?.selectionStart ?? null;
  const end = input?.selectionEnd ?? null;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  let image: FloatingImage | undefined;
  try {
    const transfer = await browserClipboard.read({ preferAsync: true });
    if (areGridClipboardTextsEqual(text, transfer.text)) image = transfer.floatingImage;
  } catch {
    // Keep the captured native text when the browser denies the optional rich read.
  }
  if (
    props.readOnly ||
    props.sheet !== sheet ||
    props.workbookRevision !== revision ||
    !areCellAddressesEqual(activeCell.value, address) ||
    isEditing.value !== editing ||
    (editing && editingValue.value !== draft)
  ) {
    emit("clipboardFeedback", "documentChanged");
    return;
  }
  if (image) {
    if (editing) finishEdit(undefined, false);
    clearPendingClipboard();
    floatingClipboard.observeTransfer({ floatingImage: image });
    floatingClipboard.paste(
      image,
      editing || getCellContent(sheet, address)?.kind === "image" ? "cell" : "floating",
      address,
    );
  } else {
    floatingClipboard.clear();
    if (editing && input) {
      const insertion = insertTextAtSelection(draft, start, end, text);
      onEditorInput(insertion.value);
      void nextTick(() => input.setSelectionRange(insertion.caret, insertion.caret));
    } else pasteCapturedText(text);
  }
}

watch(
  () => [props.sheet.id, ...props.sheet.floatingImages.map((image) => image.id)],
  (current, previous) => {
    if (
      current[0] !== previous[0] ||
      !props.sheet.floatingImages.some((image) => image.id === selectedImageId.value)
    )
      selectedImageId.value = null;
  },
);

function normalizeSelectionForSheet(nextSelection: CellSelection): CellSelection {
  if (nextSelection.mode !== "cells") {
    return {
      active: { ...nextSelection.active },
      anchor: { ...nextSelection.anchor },
      focus: { ...nextSelection.focus },
      mode: nextSelection.mode,
    };
  }
  const range = expandSelectionToMergedCellRanges(
    { start: nextSelection.anchor, end: nextSelection.focus },
    props.sheet.mergedCells,
  );
  return {
    active: layout.value.getAnchorForAddress(nextSelection.active),
    anchor: { ...range.start },
    focus: { ...range.end },
    mode: "cells",
  };
}

function areSelectionsEqual(left: CellSelection, right: CellSelection): boolean {
  return (
    left.mode === right.mode &&
    areCellAddressesEqual(left.active, right.active) &&
    areCellAddressesEqual(left.anchor, right.anchor) &&
    areCellAddressesEqual(left.focus, right.focus)
  );
}

function setSelection(
  nextSelection: CellSelection,
  visibleAddress: CellAddress = nextSelection.active,
  restoreFocus = true,
): void {
  selectedImageId.value = null;
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  const normalized = normalizeSelectionForSheet(nextSelection);
  if (!areSelectionsEqual(selection.value, normalized)) {
    // Extending a range does not change its active cell or the cell content layer.
    if (areCellAddressesEqual(selection.value.active, normalized.active)) {
      normalized.active = selection.value.active;
    }
    selection.value = normalized;
  }
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

function getReferenceEditor(): FormulaReferenceEditor | null {
  return referenceEditor.value?.canPickReference() ? referenceEditor.value : null;
}

function stopFormulaReferenceDrag(): void {
  stopFormulaReferenceDragInternal();
  formulaReferenceDragEditor = undefined;
}

function finishEdit(destination?: CellSelection, restoreFocus = true): void {
  stopFormulaReferenceDrag();
  finishCellEdit(destination, restoreFocus);
}

function cancelEdit(restoreFocus = true): void {
  stopFormulaReferenceDrag();
  cancelCellEdit(restoreFocus);
}

function onEditorBlur(event: FocusEvent): void {
  stopFormulaReferenceDrag();
  onCellEditorBlur(event);
}

const { handleReferenceKeydown } = useFormulaReferenceNavigation({
  session: editSession,
  getEditor: getReferenceEditor,
  getActiveAddress: () => activeCell.value,
  getVisibleRow: (row, direction) =>
    direction > 0
      ? rowVisibility.value.getNextVisibleRow(row)
      : rowVisibility.value.getPreviousVisibleRow(row),
  ensureVisible: (address) => {
    ensureGridExtentContains(address);
    ensureSelectionVisible(address, "cells");
  },
});

function startReferencePick(address: CellAddress, event: MouseEvent): boolean {
  const editor = getReferenceEditor();
  if (!editor || isComposing.value) return false;
  const range = { start: { ...address }, end: { ...address } };
  if (!editor.pickReference(range, "start")) return false;
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  formulaReferenceRange.value = range;
  stopDragSelection();
  stopFormulaReferenceDrag();
  formulaReferenceDragEditor = editor;
  startFormulaReferenceDrag(createCellSelection(address), event);
  return true;
}

watch(rowVisibility, () => {
  if (rowVisibility.value.isRowVisible(selection.value.active.row)) return;
  const column = selection.value.active.column;
  const replacement =
    rowVisibility.value.getNextVisibleRow(selection.value.active.row) ??
    rowVisibility.value.getPreviousVisibleRow(selection.value.active.row) ??
    props.sheet.filter?.range.start.row ??
    0;
  setSelection(createCellSelection({ row: replacement, column }));
});

watch(
  () => props.sheet.mergedCells,
  () => {
    const normalized = normalizeSelectionForSheet(selection.value);
    if (areSelectionsEqual(normalized, selection.value)) return;
    selection.value = normalized;
    emitViewState();
  },
  { deep: true },
);

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
  if (delta.rows) {
    const source = extend ? selection.value.focus : selection.value.active;
    const row =
      delta.rows > 0
        ? rowVisibility.value.getNextVisibleRow(source.row)
        : rowVisibility.value.getPreviousVisibleRow(source.row);
    if (row !== null) {
      if (!extend) destination.active.row = row;
      destination.focus.row = row;
    }
  }
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
  if (props.readOnly) return;
  requestDimensionResize(axis, payload);
}

function onDimensionResizeStart(
  axis: SheetDimensionAxis,
  payload: { index: number; event: PointerEvent },
): void {
  if (props.readOnly) return;
  const startSize =
    axis === "row"
      ? geometry.value.getRowHeight(payload.index)
      : geometry.value.getColumnWidth(payload.index);
  startDimensionResize(axis, { ...payload, startSize });
}

function onGridKeydown(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest("[data-floating-image-id]")) {
    handleHistoryShortcut(event);
    return;
  }
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
  }
}

function onCellMouseDown(address: CellAddress, event: MouseEvent): void {
  if (startReferencePick(address, event)) {
    return;
  }
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
  if (props.readOnly) return;
  const menu = axisContextMenu.value;
  if (!menu) {
    return;
  }
  if (!requestAxisInsertion(menu.axis, menu.index, menu.count, payload.direction, payload.count))
    return;
  axisContextMenu.value = undefined;
  focusEditor();
}

function requestAxisInsertion(
  axis: SheetDimensionAxis,
  index: number,
  selectionCount: number,
  direction: "before" | "after",
  count = selectionCount,
): boolean {
  if (props.readOnly) return false;
  const insertIndex = direction === "before" ? index : index + selectionCount;
  if (count > getAxisMaximum(axis) - insertIndex) return false;
  clearPendingClipboard();
  emit("insertAxis", { axis, index: insertIndex, count });
  return true;
}

function requestAxisDelete(): void {
  if (props.readOnly) return;
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
  if (props.readOnly) return;
  const menu = axisContextMenu.value;
  if (!menu || menu.count !== 1) {
    return;
  }
  emit("resizeDimension", { axis: menu.axis, index: menu.index, size });
}

function requestAxisClear(): void {
  if (props.readOnly) return;
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
    imageAddress:
      getCellContent(props.sheet, layout.value.getAnchorForAddress(address))?.kind === "image"
        ? layout.value.getAnchorForAddress(address)
        : undefined,
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
  if (!rect) return;
  const x = bounds.left + (rect.x + Math.min(16, rect.width / 2)) * scale.value;
  const y = bounds.top + (rect.y + rect.height) * scale.value;
  axisContextMenu.value = undefined;
  cellContextMenu.value = {
    imageAddress:
      getCellContent(props.sheet, activeCell.value)?.kind === "image"
        ? { ...activeCell.value }
        : undefined,
    anchor: markRaw({
      contextElement: scroller,
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    }),
  };
}

async function requestCellClipboard(
  action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
): Promise<void> {
  if (props.readOnly && action !== "copy") return;
  if (!cellContextMenu.value) {
    return;
  }
  cellContextMenu.value = undefined;
  if (action === "cut") {
    floatingClipboard.clear();
    await cutSelection();
  } else if (action === "copy") {
    floatingClipboard.clear();
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

function requestCellImageAction(action: "preview" | "float"): void {
  if (props.readOnly && action === "float") return;
  const address = cellContextMenu.value?.imageAddress;
  cellContextMenu.value = undefined;
  if (!address) return;
  setActiveCell(address);
  if (action === "float") emit("convertCellImageToFloating", address);
  else {
    const content = getCellContent(props.sheet, address);
    if (content?.kind === "image") openImagePreview(content.image);
  }
}

function requestCellClear(): void {
  if (props.readOnly) return;
  if (!cellContextMenu.value) {
    return;
  }
  clearPendingClipboard();
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
  // Formula reference picking owns grid gestures while a formula editor is active.
  if (getReferenceEditor()) return;
  const content = getCellContent(props.sheet, address);
  if (content?.kind === "image") {
    event.preventDefault();
    openImagePreview(content.image);
    return;
  }
  if (props.readOnly) return;
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

  if (props.formatPainterActive && !props.readOnly && event.key === "Enter") {
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

  if (props.readOnly) {
    if (
      event.key === "Delete" ||
      event.key === "Backspace" ||
      event.key === "F2" ||
      event.key.length === 1
    ) {
      event.preventDefault();
      return;
    }
  }

  if (isEditing.value) {
    if (handleReferenceKeydown(event)) return;
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
      editingValue.value = completeFormulaForCommit(editingValue.value);
      traverseSelection("Enter", event.shiftKey, true);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      editingValue.value = completeFormulaForCommit(editingValue.value);
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
    if (getCellContent(props.sheet, activeCell.value)?.kind !== "image") beginEdit("append");
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
  stopFormulaReferenceDrag();
  stopDimensionResize();
  stopAxisMoveDrag();
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  clearPendingClipboard();
  cancelEdit(false);
  const normalized = normalizeSelectionForSheet(nextViewState.selection);
  selection.value = normalized;
  restoreViewport({ ...nextViewState, selection: normalized });
  if (!areSelectionsEqual(normalized, nextViewState.selection)) emitViewState();
}

function clearClipboard(): void {
  clearPendingClipboard();
}

function flushPendingEdit(): boolean {
  if (isComposing.value) {
    return false;
  }
  if (isEditing.value) {
    finishEdit(undefined, false);
  }
  return true;
}

function hasPendingEdit(): boolean {
  return isComposing.value || isEditing.value;
}

watch(
  () => props.sheet.id,
  () => {
    autoRowHeightCalculator.clear();
    restoreViewState(props.viewState);
    focusEditor();
  },
);

watch(
  () => props.readOnly,
  (readOnly) => {
    if (!readOnly) return;
    stopDimensionResize();
    cancelCellEdit(false);
    clearPendingClipboard();
  },
);

watch(
  scale,
  () => {
    stopDragSelection();
    stopFormulaReferenceDrag();
    stopDimensionResize();
    stopAxisMoveDrag();
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
    updateViewportSize();
    ensureSelectionVisible(activeCell.value);
    emitViewState();
  },
  { flush: "post" },
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

watch(horizontalScrollState, (state) => emit("horizontalScrollChange", state), {
  immediate: true,
  flush: "post",
});

onBeforeUnmount(() => {
  if (fontFaceSet && fontLoadingDoneListener) {
    fontFaceSet.removeEventListener("loadingdone", fontLoadingDoneListener);
  }
  stopObservingViewport();
  stopGeometryWatching();
  stopDragSelection();
  stopFormulaReferenceDrag();
  stopDimensionResize();
  clearPendingClipboard();
});

defineExpose({
  clearClipboard,
  flushPendingEdit,
  focusGrid: focusEditor,
  handleReferenceKeydown,
  hasPendingEdit,
  navigateToCell,
  scrollHorizontally,
  fitSelectionToViewport,
});
</script>

<template>
  <section
    ref="rootRef"
    class="sheet-grid"
    :class="{
      'is-resizing-column': dimensionResize?.axis === 'column',
      'is-resizing-row': dimensionResize?.axis === 'row',
      'is-moving-axis': axisMoveDrag?.active,
    }"
    :style="{
      zoom: scale,
      '--sheet-scale': scale,
      '--sheet-row-header-width': `${headerSize.width}px`,
      '--sheet-column-header-height': `${headerSize.height}px`,
      '--sheet-axis-tools-size': `${quickToolsGutter}px`,
    }"
    :aria-label="t('grid.worksheet', { name: sheet.name })"
    @keydown.capture="onGridKeydown"
    @copy.capture="onImageCopy"
    @cut.capture="onImageCut"
    @paste.capture="onImagePaste"
  >
    <button
      v-if="showHeaders"
      type="button"
      class="sheet-grid__corner"
      :class="{ 'is-active': getSelectionMode(selection) === 'all' }"
      :aria-label="t('grid.selectAll')"
      @click="onCornerClick"
    />
    <SheetColumnHeaders
      v-if="showHeaders"
      :panes="columnHeaderPanes"
      :geometry="geometry"
      :selected-start-column="selectedRange.start.column"
      :selected-end-column="selectedRange.end.column"
      :selected="getSelectionMode(selection) === 'columns' || getSelectionMode(selection) === 'all'"
      :axis-selected="getSelectionMode(selection) === 'columns'"
      :quick-tools-enabled="headerQuickToolsEnabled"
      :quick-tools-gutter="quickToolsGutter"
      @quick-insert="onQuickInsert('column', $event)"
      @quick-insert-hover="onQuickInsertHover('column', $event)"
      @axis-drag-start="onAxisDragStart('column', $event)"
      @resize="onDimensionResizeRequest('column', $event)"
      @resize-start="onDimensionResizeStart('column', $event)"
      @select="onColumnHeaderSelect"
      @open-context-menu="
        openAxisContextMenu('column', $event.column, $event.clientX, $event.clientY, $event.trigger)
      "
    />
    <SheetRowHeaders
      v-if="showHeaders"
      :panes="rowHeaderPanes"
      :geometry="geometry"
      :selected-start-row="selectedRange.start.row"
      :selected-end-row="selectedRange.end.row"
      :selected="getSelectionMode(selection) === 'rows' || getSelectionMode(selection) === 'all'"
      :axis-selected="getSelectionMode(selection) === 'rows'"
      :quick-tools-enabled="headerQuickToolsEnabled"
      :quick-tools-gutter="quickToolsGutter"
      @quick-insert="onQuickInsert('row', $event)"
      @quick-insert-hover="onQuickInsertHover('row', $event)"
      @axis-drag-start="onAxisDragStart('row', $event)"
      @resize="onDimensionResizeRequest('row', $event)"
      @resize-start="onDimensionResizeStart('row', $event)"
      @select="onRowHeaderSelect"
      @open-context-menu="
        openAxisContextMenu('row', $event.row, $event.clientX, $event.clientY, $event.trigger)
      "
    />
    <SheetFreezeLines :layout="layout" :header-size="headerSize" />
    <SheetFreezeHandles
      v-if="quickToolsAvailable"
      :key="`${sheet.id}:${scale}`"
      :layout="layout"
      :header-size="headerSize"
      :root-element="rootRef"
      :disabled="Boolean(axisMoveDrag)"
      @freeze-change="emit('freezeChange', $event)"
      @drag-change="freezeDragging = $event"
    />
    <SheetAxisOperationPreview
      v-if="axisOperationPreview"
      :axis="axisOperationPreview.axis"
      :offset="axisOperationPreview.offset"
      :label="axisOperationPreview.label"
      :header-size="headerSize"
      :viewport-size="viewportSize"
      :data-axis-operation="axisMoveDrag?.active ? 'move' : 'insert'"
    />

    <div
      ref="scrollerRef"
      :id="gridId"
      class="sheet-grid__scroller"
      :class="{ 'has-external-horizontal-scrollbar': externalHorizontalScrollbar }"
      role="grid"
      :aria-label="sheet.name"
      :aria-readonly="readOnly"
      :aria-rowcount="gridExtent.rowCount"
      :aria-colcount="gridExtent.columnCount"
      aria-multiselectable="true"
      @scroll="onScroll"
      @wheel="onWheel"
    >
      <div class="sheet-grid__canvas" :style="gridCanvasStyle">
        <div class="sheet-grid__viewport" :style="gridViewportStyle">
          <SheetCellLayer
            :sheet="sheet"
            :image-asset-urls="imageAssetUrls"
            :loading-image-asset-ids="loadingImageAssetIds"
            :evaluator="sheetEvaluator"
            :layout="layout"
            :active-cell="activeCell"
            :selection="selection"
            :editing="isEditing"
            :show-grid-lines="showGridLines"
            :locale="locale"
            :date-system="props.dateSystem"
            @cell-mousedown="onCellMouseDown"
            @cell-double-click="onCellDoubleClick"
            @cell-contextmenu="openCellContextMenu"
          >
            <template #active-cell="{ cellRect }">
              <CellEditor
                :scale="scale"
                ref="editorRef"
                :model-value="editingValue"
                :edit-session="editSession"
                :address-label="activeCellLabel"
                :display-value="activeCellDisplayValue"
                :editing="isEditing"
                :composing="isComposing"
                :wrap-text="activeCellWrapText"
                :cell-rect="cellRect"
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
          <SheetReadingHighlight
            v-if="highlightEnabled"
            :layout="layout"
            :extent="gridExtent"
            :range="selectedRange"
            :mode="selection.mode"
            :color="highlightColor"
          />
          <SheetSelectionOverlay
            :active-rects="activeCellOutlineRects"
            :range-rects="selectedRangeRects"
            :address-label="activeCellLabel"
            :editing="isEditing"
            :reference-groups="formulaReferenceGroups"
            :clipboard-rects="clipboardRangeRects"
            :clipboard-mode="clipboardMode"
          />
          <SheetFloatingImageLayer
            :scale="scale"
            :images="sheet.floatingImages"
            :layout="layout"
            :asset-urls="imageAssetUrls ?? new Map()"
            :loading-asset-ids="loadingImageAssetIds"
            :missing-asset-ids="missingImageAssetIds"
            :selected-image-id="selectedImageId"
            :read-only="readOnly"
            @select="selectFloatingImage"
            @update="emit('updateFloatingImage', $event)"
            @delete="deleteSelectedFloatingImage"
            @convert-to-cell="convertSelectedFloatingImageToCell"
            @preview="openImagePreview"
            @copy="requestFloatingImageCopy($event, 'copy')"
            @cut="requestFloatingImageCopy($event, 'cut')"
            @paste="requestFloatingImagePaste"
          />
          <SheetBorderLayer
            :sheet="sheet"
            :geometry="geometry"
            :layout="layout"
            :rows="rowVisibility"
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
      :read-only="readOnly"
      @insert="requestAxisInsert"
      @resize="requestAxisResize"
      @delete="requestAxisDelete"
      @clear="requestAxisClear"
      @close="closeAxisContextMenu"
    />
    <SheetCellContextMenu
      v-if="cellContextMenu"
      :anchor="cellContextMenu.anchor"
      :has-image="Boolean(cellContextMenu.imageAddress)"
      :read-only="readOnly"
      :paste-special-disabled="clipboardMode === 'cut'"
      :paste-formats-disabled="!canPasteFormats"
      :cut-disabled-reason="
        cutDisabledReason ? t(CLIPBOARD_MESSAGE_KEYS[cutDisabledReason]) : undefined
      "
      @cut="requestCellClipboard('cut')"
      @copy="requestCellClipboard('copy')"
      @paste="requestCellClipboard('paste')"
      @paste-values="requestCellClipboard('paste-values')"
      @paste-formats="requestCellClipboard('paste-formats')"
      @convert-image-to-floating="requestCellImageAction('float')"
      @preview-image="requestCellImageAction('preview')"
      @clear="requestCellClear"
      @close="closeCellContextMenu"
    />
    <SheetImagePreview
      v-if="imagePreview && previewUrl"
      :src="previewUrl"
      :alt-text="imagePreview.altText"
      :transform="imagePreview.transform"
      @close="closeImagePreview"
    />
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

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    z-index: 4;
    width: var(--sheet-row-header-width);
    height: var(--sheet-column-header-height);
    background: var(--idea-surface-secondary);
    pointer-events: none;
  }

  &.is-resizing-column {
    cursor: col-resize;
  }

  &.is-resizing-row {
    cursor: row-resize;
  }

  &.is-moving-axis,
  &.is-moving-axis :deep(.sheet-row-headers__select-button),
  &.is-moving-axis :deep(.sheet-column-headers__select-button) {
    cursor: grabbing;
  }

  &__corner {
    position: absolute;
    inset: var(--sheet-axis-tools-size) auto auto var(--sheet-axis-tools-size);
    z-index: 5;
    display: grid;
    place-items: end;
    width: calc(var(--sheet-row-header-width) - var(--sheet-axis-tools-size));
    height: calc(var(--sheet-column-header-height) - var(--sheet-axis-tools-size));
    background: var(--idea-surface-secondary);
    border: 0;
    border-right: 1px solid var(--idea-border-control);
    border-bottom: 1px solid var(--idea-border-control);
    color: var(--idea-text-muted);
    padding: 6px;
    appearance: none;
    cursor: pointer;

    &::after {
      width: 8px;
      height: 8px;
      background: currentColor;
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
      content: "";
    }

    &:hover {
      background: var(--idea-surface-hover);
    }

    &.is-active {
      background: var(--idea-action-focus);
      color: var(--idea-action-primary);
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
    scrollbar-color: var(--idea-border-control) var(--idea-sheet-bar-surface);
    scrollbar-width: auto;

    @supports selector(::-webkit-scrollbar) {
      scrollbar-color: auto;
    }

    &::-webkit-scrollbar {
      width: calc(16px / var(--sheet-scale, 1));
      height: calc(16px / var(--sheet-scale, 1));
    }

    &::-webkit-scrollbar-track {
      background: var(--idea-sheet-bar-surface);
    }

    &::-webkit-scrollbar-thumb {
      border: calc(4px / var(--sheet-scale, 1)) solid var(--idea-sheet-bar-surface);
      border-radius: 999px;
      background: var(--idea-sheet-bar-thumb);

      &:hover {
        background: var(--idea-sheet-bar-thumb-hover);
      }
    }

    &.has-external-horizontal-scrollbar {
      overflow-x: hidden;
    }
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
}
</style>
