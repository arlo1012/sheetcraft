<script setup lang="ts">
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import {
  createPictureViewMetrics,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import { getPictureObjectOriginCell } from "@sheetcraft/core/picture-object-sheet";
import { getPivotActiveField } from "../../pivot-tables/pivot-active-field";
import PivotReportFilters from "../../pivot-tables/components/PivotReportFilters.vue";
import { isPivotValueCell, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import PivotEmptyReports from "../../pivot-tables/components/PivotEmptyReports.vue";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import SheetDrawingLayer from "../../sheet-drawings/components/SheetDrawingLayer.vue";
import { canEditCell, canEditRange, canSelectCell, canUseSheetPermission } from "@sheetcraft/core";
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
import type {
  SheetContextAction,
  SheetContextMenuState,
  SheetContextRequest,
} from "../context-menu-contracts";
import { formatCellContentForInput } from "@sheetcraft/core/input";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import type { SheetViewMode } from "@sheetcraft/sheet-engine/page-layout";
import type { PageViewPaintState } from "../../page-layout/page-view-types";
import PageHeaderFooterOverlay from "../../page-layout/components/PageHeaderFooterOverlay.vue";
import { usePageBreakDrag } from "../../page-layout/usePageBreakDrag";
import { usePageMarginDrag } from "../../page-layout/usePageMarginDrag";
import { adjustSheetPageMargin } from "@sheetcraft/sheet-engine/page-layout";
import PageLayoutRulers, {
  PAGE_LAYOUT_RULER_SIZE,
  type PageLayoutRulerUnit,
} from "../../page-layout/components/PageLayoutRulers.vue";
import PageLayoutMargins from "../../page-layout/components/PageLayoutMargins.vue";
import PageWhiteSpaceControls from "../../page-layout/components/PageWhiteSpaceControls.vue";
import type { HeaderFooterEditTarget } from "../../page-layout/header-footer-editor";
import { columnIndexToLabel, getCellAddressLabel } from "@sheetcraft/core/coordinates";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { normalizeSheetZoom } from "../../../shared/sheet-view/zoom";
import { getSelectionFitZoom } from "../selection-zoom";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import {
  isExplicitWarningConfirmationKey,
  type CellEditFinishOptions,
  type CellEditSession,
  type CellEditCommit,
} from "../../../shared/cell-editing/useCellEditSession";
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
  getCellHyperlink,
  getDefaultColumnWidth,
  type FloatingImage,
  type CellAddress,
  type CellNoteBox,
  type ImageTransform,
  type CellRange,
  type Sheet,
  type Workbook,
  type SheetEvaluator,
  type SheetDimensionAxis,
} from "@sheetcraft/core/workbook";
import { expandSelectionToMergedCellRanges } from "@sheetcraft/core";
import {
  DEFAULT_GRID_EXTENT_POLICY,
  DEFAULT_INITIAL_GRID_EXTENT,
} from "@sheetcraft/sheet-engine/extent";
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
} from "@sheetcraft/sheet-engine/selection";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
  type GridPasteResult,
} from "../useGridClipboard";
import {
  createSheetGridViewState,
  type SheetGridViewState,
} from "@sheetcraft/sheet-engine/view-state";
import {
  createAutoRowHeightCalculator,
  mergeRowHeightOverrides,
} from "@sheetcraft/sheet-engine/row-height";
import { useDimensionResize } from "../composables/useDimensionResize";
import { useAxisMoveDrag, type AxisMovePayload } from "../composables/useAxisMoveDrag";
import { getViewportAxisBoundaryOffset } from "@sheetcraft/sheet-engine/axis-interactions";
import { useCellEditing } from "../composables/useCellEditing";
import { getCellStyle } from "@sheetcraft/core/workbook";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import { useFormulaReferenceNavigation } from "../composables/useFormulaReferenceNavigation";
import { useDragSelection } from "../composables/useDragSelection";
import { useSheetAutoFill } from "../composables/useSheetAutoFill";
import type { GridFillFeedback, GridFillRequest, GridFillResult } from "../auto-fill-contracts";
import { useSheetViewport } from "../composables/useSheetViewport";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";
import type { ImageInsertMode } from "../../sheet-images/useSheetImageActions";
import SheetFloatingImageLayer from "../../sheet-images/components/SheetFloatingImageLayer.vue";
import SheetImagePreview from "../../sheet-images/components/SheetImagePreview.vue";
import SheetNotePreview from "./SheetNotePreview.vue";
import { useFloatingImageClipboard } from "../../sheet-images/useFloatingImageClipboard";
import {
  areGridClipboardTextsEqual,
  createBrowserGridClipboardPort,
  readGridClipboardLocalToken,
} from "../gridClipboardPort";
import { captureFloatingImageGroup } from "@sheetcraft/sheet-engine/floating-image-group";
import { readFloatingImageTransfer } from "../../sheet-images/imageClipboard";
import CellEditor from "./CellEditor.vue";
import SheetAxisContextMenu from "./SheetAxisContextMenu.vue";
import SheetFreezeHandles from "./SheetFreezeHandles.vue";
import SheetCellContextMenu from "./SheetCellContextMenu.vue";
import SheetCellErrorMenu, { type CellErrorDescription } from "./SheetCellErrorMenu.vue";
import SheetCellNotice from "./SheetCellNotice.vue";
import SheetSurface from "./SheetSurface.vue";
import SheetAutoFillOptions from "./SheetAutoFillOptions.vue";
import SheetDataControls, {
  type ActiveCellValidationInfo,
  type SheetFilterControl,
} from "./SheetDataControls.vue";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../data-visibility";
import {
  createFloatingImageCanvasCache,
  paintFloatingImages,
  type FloatingImagePaintState,
} from "../../sheet-images/floating-image-painter";
import { getDrawingThemeEffects } from "../../sheet-images/drawing-theme-effects";
import { useSheetDisplaySnapshot } from "../canvas/sheet-display-snapshot";
import { createSheetRenderFrame, getSurfaceCell } from "../rendering/sheet-render-frame";
import { useSheetRenderEnvironment } from "../rendering/useSheetRenderEnvironment";
import {
  clientPointToElementSurface,
  surfacePointToBody,
} from "../../../shared/sheet-input/surface-coordinates";
import { useHeaderInteraction } from "../input/useHeaderInteraction";
import type { HeaderInteractionState } from "../input/useHeaderInteraction";
import { getOutlineGutterSize } from "../outline-layout";
import type {
  FormulaReferenceOverlay as FormulaReferenceOverlayGroup,
  SheetOverlayState,
  SheetFreezeDragOverlay,
  SheetFreezeHandlesOverlay,
} from "../rendering/overlay-types";
import { getCellEditorFrameStyle, getCellEditorStyle } from "../cell-presentation";
import {
  formatCellValueForGrid,
  getCellValuePresentationForGrid,
} from "../cell-value-presentation";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
} from "../../../shared/cell-text/font-resources";
import { isCellTextWrapped } from "../../../shared/cell-text/text-presentation";
import { browserCellTextMeasurer } from "../../../shared/cell-text/text-metrics";

type AxisContextMenuState = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  anchor: FloatingReference;
  trigger: HTMLElement;
};

type CellContextMenuState = {
  anchor: FloatingReference;
  imageAddress?: CellAddress;
  noteAddress: CellAddress;
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
    contextMenuState?: SheetContextMenuState;
    sheet: Sheet;
    workbook?: Workbook;
    /** Workbook-level effects for drawable sheet objects. */
    theme?: WorkbookTheme;
    evaluator?: SheetEvaluator;
    workbookRevision?: number;
    applyPaste?: (payload: GridPastePayload) => GridPasteResult;
    applyAxisMove?: (payload: AxisMovePayload) => boolean;
    applyFloatingImageMove?: (images: readonly FloatingImage[]) => boolean;
    applyFill?: (request: GridFillRequest) => GridFillResult;
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
    imagePreviewOnDoubleClick?: boolean;
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
    viewMode?: SheetViewMode;
    pageSetup?: SheetPageSetup;
    showPageRulers?: boolean;
    showPageMargins?: boolean;
    showPageBreaks?: boolean;
    showPageWhiteSpace?: boolean;
    pageRulerUnit?: PageLayoutRulerUnit;
    fileName?: string;
    dateSystem?: ExcelDateSystem;
    /** Resolved for the active cell by the Web data-tools adapter. */
    validationInfo?: ActiveCellValidationInfo;
    errorCells?: ReadonlySet<string>;
    activeCellError?: CellErrorDescription;
    inputError?: { address: CellAddress; title: string; message: string };
    errorIndicatorColor?: string | null;
    noteDraft?: { address: CellAddress; text: string; author: string; box?: CellNoteBox };
    noteError?: string;
    /** Whether selecting a noted cell shows its classic note preview. */
    showActiveNote?: boolean;
    showAllNotes?: boolean;
    hiddenNoteKeys?: readonly string[];
    /** Suppresses the selected-cell note preview while a workspace interaction owns focus. */
    notePreviewDisabled?: boolean;
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
    viewMode: "normal",
    showPageRulers: true,
    showPageMargins: false,
    showPageBreaks: false,
    showPageWhiteSpace: true,
    pageRulerUnit: "cm",
    dateSystem: "1900",
    showActiveNote: true,
    showAllNotes: false,
    hiddenNoteKeys: () => [],
    notePreviewDisabled: false,
  },
);

const emit = defineEmits<{
  updateDrawing: [drawing: SheetDrawing];
  deleteDrawing: [id: string];
  editDrawing: [drawing: SheetDrawing];
  configurePivot: [id: string];
  updatePivot: [table: SheetPivotTable];
  configurePivotFilter: [id: string, index: number];
  showPivotDetails: [id: string, address: CellAddress];
  groupPivotField: [id: string];
  ungroupPivotField: [id: string];
  changeControl: [id: string, value: unknown];
  unlockRange: [range: CellRange];
  contextAction: [request: SheetContextRequest];
  pageSetupChange: [setup: SheetPageSetup];
  openHeaderFooter: [target: HeaderFooterEditTarget];
  "update:showPageWhiteSpace": [value: boolean];
  updateFloatingImage: [image: FloatingImage];
  selectedFloatingImageChange: [id: string | null, ids: string[]];
  updateFloatingImages: [images: FloatingImage[]];
  groupFloatingImages: [ids: string[]];
  deleteFloatingImages: [ids: string[]];
  deleteFloatingImage: [id: string];
  convertFloatingImageToCell: [id: string];
  convertCellImageToFloating: [address: CellAddress];
  editNote: [address: CellAddress];
  deleteNote: [address: CellAddress];
  saveNote: [payload: { text: string; author: string; restoreFocus?: boolean }];
  cancelNote: [];
  updateNoteBox: [payload: { address: CellAddress; box: CellNoteBox }];
  imageFeedback: [key: MessageKey];
  pasteImageFile: [file: File, mode: ImageInsertMode, address?: CellAddress];
  pasteFloatingImage: [image: FloatingImage, mode: ImageInsertMode, address?: CellAddress];
  pasteFloatingImages: [images: readonly FloatingImage[], address: CellAddress];
  commitCell: [payload: CellEditCommit];
  clearCells: [range: CellRange];
  clipboardFeedback: [feedback: GridClipboardFeedback];
  resizeDimension: [payload: { axis: SheetDimensionAxis; index: number; size: number }];
  insertAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  deleteAxis: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  freezeChange: [freezePanes: { rows: number; columns: number }];
  formatPainterTarget: [range: CellRange];
  cancelFormatPainter: [];
  flashFill: [];
  undo: [];
  redo: [];
  viewStateChange: [viewState: SheetGridViewState];
  selectionDraggingChange: [dragging: boolean];
  fillFeedback: [feedback: GridFillFeedback];
  endFill: [];
  horizontalScrollChange: [state: SheetHorizontalScrollState];
  filterColumnRequest: [
    payload: {
      column: number;
      range: CellRange;
      tableId?: string;
      anchor: DOMRect;
    },
  ];
  tableExpandRequest: [payload: { tableId: string; range: CellRange; next: CellAddress }];
  validationChoose: [
    payload: {
      address: CellAddress;
      value: string | number | boolean;
    },
  ];
  outlineToggle: [payload: { id: string; collapsed: boolean }];
  outlineLevel: [payload: { axis: SheetDimensionAxis; level: number }];
  convertCellToNumber: [];
  convertSelectionToNumber: [];
  correctSheetErrors: [];
  ignoreSelectedCellErrors: [];
  dismissInputError: [];
  ignoreAllCellErrors: [];
  editErrorInFormulaBar: [];
  errorCheckOptions: [];
  openHyperlink: [address: CellAddress];
  "update:zoom": [zoom: number];
}>();

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 28;
const PAGE_LAYOUT_ROW_HEADER_WIDTH = 36;
const PAGE_LAYOUT_COLUMN_HEADER_HEIGHT = 22;
const PAGE_LAYOUT_RULER_GAP = 10;
const AXIS_TOOL_GUTTER = 20;
const quickToolsGutter = computed(() =>
  props.viewMode === "normal" && props.showHeaders && props.showAxisQuickTools
    ? AXIS_TOOL_GUTTER
    : 0,
);
function getOutlineDepth(axis: SheetDimensionAxis): number {
  const groups = props.sheet.outlineGroups ?? [];
  return groups.reduce((max, group) => {
    if (group.axis !== axis) return max;
    const depth = groups.filter(
      (candidate) =>
        candidate.axis === axis && candidate.start <= group.start && candidate.end >= group.end,
    ).length;
    return Math.max(max, depth);
  }, 0);
}
const rowOutlineDepth = computed(() => getOutlineDepth("row"));
const columnOutlineDepth = computed(() => getOutlineDepth("column"));
const rowOutlineGutter = computed(() => getOutlineGutterSize(rowOutlineDepth.value));
const columnOutlineHeaderHeight = computed(() => getOutlineGutterSize(columnOutlineDepth.value));

const rulerInset = computed(() =>
  props.viewMode === "page-layout" && props.showPageRulers
    ? (PAGE_LAYOUT_RULER_SIZE + PAGE_LAYOUT_RULER_GAP) / pageUiScale.value
    : 0,
);
const headingSize = computed(() => ({
  width: props.showHeaders
    ? ((props.viewMode === "page-layout" ? PAGE_LAYOUT_ROW_HEADER_WIDTH : ROW_HEADER_WIDTH) +
        quickToolsGutter.value +
        rowOutlineGutter.value) /
      pageUiScale.value
    : 0,
  height: props.showHeaders
    ? ((props.viewMode === "page-layout"
        ? PAGE_LAYOUT_COLUMN_HEADER_HEIGHT
        : COLUMN_HEADER_HEIGHT) +
        quickToolsGutter.value +
        columnOutlineHeaderHeight.value) /
      pageUiScale.value
    : 0,
}));
const headingOrigin = computed(() => ({ x: rulerInset.value, y: rulerInset.value }));
const headerSize = computed(() => ({
  width: headingSize.value.width + rulerInset.value,
  height: headingSize.value.height + rulerInset.value,
}));

const subtotalSummaryBelow = computed(() =>
  Object.fromEntries(
    (props.sheet.subtotalMetadata ?? []).map((metadata) => [
      metadata.id,
      metadata.summaryBelow !== false,
    ]),
  ),
);
const tableFilters = computed<SheetFilterControl[]>(() =>
  (props.sheet.tables ?? [])
    .filter((table) => table.headerRow && table.filterButton)
    .map((table) => ({
      tableId: table.id,
      range: {
        start: table.range.start,
        end: {
          ...table.range.end,
          row: table.range.end.row - (table.totalRow ? 1 : 0),
        },
      },
      filteredColumns: table.filter?.columns.map((entry) => entry.column),
    })),
);

const outlineHiddenRows = computed(() =>
  createSheetHiddenRowIntervals(props.sheet, sheetEvaluator.value),
);
const outlineHiddenColumns = computed(() => createSheetHiddenColumnIntervals(props.sheet));
const outlineHiddenColumnSet = computed(() => {
  const hidden = new Set(props.sheet.hiddenColumns ?? []);
  for (const interval of outlineHiddenColumns.value) {
    for (let column = interval.start; column <= interval.end; column += 1) hidden.add(column);
  }
  return hidden;
});

const { locale, t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const pageSetupDraft = shallowRef<SheetPageSetup>();
const pageBoundaryPreview = shallowRef<PageViewPaintState["dragBoundary"]>();
const pageCornerPreview = shallowRef<PageViewPaintState["dragCorner"]>();
const pageSetup = computed(() => {
  if (pageSetupDraft.value) return pageSetupDraft.value;
  const setup = props.pageSetup ?? props.sheet.pageSetup ?? DEFAULT_SHEET_PAGE_SETUP;
  const subtotalBreaks = (props.sheet.subtotalMetadata ?? []).flatMap(
    (entry) => entry.pageBreakRows ?? [],
  );
  return subtotalBreaks.length
    ? {
        ...setup,
        rowBreaks: [...new Set([...setup.rowBreaks, ...subtotalBreaks])].sort(
          (left, right) => left - right,
        ),
      }
    : setup;
});
const scale = computed(
  () =>
    (normalizeSheetZoom(props.zoom) / 100) *
    (props.viewMode === "page-layout" ? pageUiScale.value : 1),
);
const effectiveFreeze = computed(() =>
  props.viewMode === "normal" ? props.sheet.freezePanes : { rows: 0, columns: 0 },
);
const selectedImageId = ref<string | null>(null);
const selectedImageIds = ref<string[]>([]);
watch(selectedImageId, (id) => {
  if (!id) selectedImageIds.value = [];
});
watch([selectedImageId, selectedImageIds], ([id, ids]) =>
  emit("selectedFloatingImageChange", id, [...ids]),
);
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
  if (!imagePreview.value) return;
  const trigger = imagePreview.value?.trigger;
  imagePreview.value = undefined;
  void nextTick(() => {
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
      if (document.activeElement === trigger) return;
    }
    focusEditor();
  });
}

watch(() => props.sheet.id, closeImagePreview);
watch(previewUrl, (url) => {
  if (!url && imagePreview.value) closeImagePreview();
});
const axisContextMenu = ref<AxisContextMenuState>();
const cellContextMenu = ref<CellContextMenuState>();
const { environment, fontRevision: fontMetricsVersion } = useSheetRenderEnvironment(
  () => rootRef.value,
);
const defaultFontFamily = computed(() => environment.value.fontFamily);
const autoRowHeightCalculator = markRaw(createAutoRowHeightCalculator(browserCellTextMeasurer));
const sheetEvaluator = computed<SheetEvaluator>(() => {
  if (props.evaluator) return props.evaluator;
  // Value iteration also invalidates an existing sparse cell whose content changes in place.
  for (const cell of props.sheet.cells.values()) {
    void cell;
  }
  return createSheetEvaluator(props.sheet);
});

const display = useSheetDisplaySnapshot({
  getSheet: () => props.sheet,
  getEvaluator: () => sheetEvaluator.value,
  getRevision: () => props.workbookRevision,
  getDateSystem: () => props.dateSystem,
  getTheme: () => props.theme,
});
watch(
  display,
  (snapshot) => {
    const families = new Set<string>();
    for (const family of getCellFontResourceFamilies(
      snapshot.sheet.pageDecoration?.watermark?.fontFamily ?? "",
    ))
      families.add(family);
    for (const [key, cell] of snapshot.sheet.cells) {
      const [row, column] = key.split(":").map(Number);
      const style = snapshot.getCellStyle({ row: row!, column: column! });
      for (const family of getCellFontResourceFamilies(style?.fontFamily ?? ""))
        families.add(family);
      if (cell.content?.kind === "literal" && typeof cell.content.value === "string")
        for (const run of cell.content.fontRuns ?? [])
          for (const family of getCellFontResourceFamilies(run.fontFamily)) families.add(family);
    }
    // Only actual workbook faces are prepared. Loading completion invalidates the
    // shared metric cache, including automatic heights of rows outside the viewport.
    for (const family of families) void ensureCellFontResource(family).catch(() => undefined);
  },
  { immediate: true },
);
const contentExtent = computed(() => display.value.contentExtent);
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
  baseGeometry,
  baseRows,
  pagination,
  pageProjection,
  geometry,
  getCellAtClientPoint,
  gridCanvasStyle,
  gridExtent,
  renderExtent,
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
  rowVisibility,
  navigationRows,
  scrollPosition,
  scrollHorizontally,
  scrollerRef,
  startGeometryWatch,
  stopObserving: stopObservingViewport,
  stopGeometryWatching,
  updateViewportSize,
  viewportSize,
} = useSheetViewport({
  getViewMode: () => props.viewMode,
  getShowPageBreaks: () => props.showPageBreaks,
  getShowPageWhiteSpace: () => props.showPageWhiteSpace,
  getPagePadding: () => 20 / pageUiScale.value,
  getPageSetup: () => pageSetup.value,
  getPrintRange: () =>
    pageSetup.value.printArea ?? {
      start: { row: 0, column: 0 },
      end: {
        row: Math.max(0, contentExtent.value.rowCount - 1),
        column: Math.max(0, contentExtent.value.columnCount - 1),
      },
    },
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
  getDefaultColumnWidth: () => getDefaultColumnWidth(props.sheet),
  getHiddenRows: () => props.sheet.hiddenRows,
  getHiddenColumns: () => outlineHiddenColumnSet.value,
  getContentExtent: () => ({
    rowCount: Math.max(contentExtent.value.rowCount, (pageSetup.value.printArea?.end.row ?? 0) + 1),
    columnCount: Math.max(
      contentExtent.value.columnCount,
      (pageSetup.value.printArea?.end.column ?? 0) + 1,
    ),
  }),
  getRowHeights: () => effectiveRowHeights.value,
  getFreezePanes: () => effectiveFreeze.value,
  getMergedCells: () => props.sheet.mergedCells,
  getHiddenRowIntervals: () => outlineHiddenRows.value,
  getSelection: () => selection.value,
  onScrollStart: () => {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
    quickInsertHover.value = undefined;
  },
  onViewStateChange: (viewState) => emit("viewStateChange", viewState),
});
const pageUiScale = computed(() =>
  props.viewMode === "page-layout"
    ? (pagination.value?.printScale ?? pageSetup.value.scale / 100)
    : 1,
);
const selectionDragging = ref(false);
const { start: startDragSelection, stop: stopDragSelection } = useDragSelection({
  getScale: () => scale.value,
  getCellAtClientPoint,
  getScroller: () => scrollerRef.value,
  getViewportSize: () => viewportSize,
  onDraggingChange: (dragging) => {
    selectionDragging.value = dragging;
    emit("selectionDraggingChange", dragging);
  },
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

const automaticRowHeights = computed(() => {
  return autoRowHeightCalculator.reconcile({
    cells: props.sheet.cells,
    getComputedValue: sheetEvaluator.value.getComputedValue,
    formatPresentation: (address, cell, value) =>
      getCellValuePresentationForGrid(
        value,
        display.value.getCellStyle(address),
        locale.value,
        props.dateSystem,
        cell.content,
      ),
    getCellStyle: (address) => display.value.getCellStyle(address),
    columnWidths: effectiveColumnWidths.value,
    defaultColumnWidth: props.sheet.defaultColumnWidth,
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
  getContent: () => getCellContent(props.sheet, activeCell.value),
  getAsText: () =>
    isTextCellNumberFormat(getCellStyle(props.sheet, activeCell.value)?.numberFormat),
  onClearClipboard: () => clearPendingClipboard(),
  onCommit: (payload) => emit("commitCell", payload),
  onSelectionChange: (nextSelection) => setSelection(nextSelection),
});
const selectedRange = computed(() =>
  getSelectionRange(selection.value, {
    rowCount: renderExtent.value.rowCount,
    columnCount: renderExtent.value.columnCount,
  }),
);
const objectsReadOnly = computed(
  () =>
    props.readOnly &&
    (!props.sheet.properties.protected || !canUseSheetPermission(props.sheet, "editObjects")),
);
const filterReadOnly = computed(
  () =>
    props.readOnly &&
    (!props.sheet.properties.protected || !canUseSheetPermission(props.sheet, "autoFilter")),
);
const cellReadOnly = computed(() => {
  void props.workbookRevision;
  return (
    props.readOnly &&
    (!props.sheet.properties.protected || !canEditCell(props.sheet, activeCell.value))
  );
});
const selectionReadOnly = computed(() => {
  void props.workbookRevision;
  return (
    props.readOnly &&
    (!props.sheet.properties.protected || !canEditRange(props.sheet, selectedRange.value))
  );
});
function axisOperationReadOnly(axis: SheetDimensionAxis, operation: "insert" | "delete"): boolean {
  const permission =
    operation === "insert"
      ? axis === "row"
        ? "insertRows"
        : "insertColumns"
      : axis === "row"
        ? "deleteRows"
        : "deleteColumns";
  return (
    props.readOnly &&
    (!props.sheet.properties.protected || !canUseSheetPermission(props.sheet, permission))
  );
}
function dimensionReadOnly(axis: SheetDimensionAxis): boolean {
  return (
    props.readOnly &&
    (!props.sheet.properties.protected ||
      !(axis === "row"
        ? props.sheet.protection?.formatRows
        : props.sheet.protection?.formatColumns))
  );
}
const quickToolsAvailable = computed(
  () =>
    props.viewMode === "normal" &&
    props.showAxisQuickTools &&
    props.showHeaders &&
    !props.readOnly &&
    !isEditing.value &&
    !isComposing.value &&
    !dimensionResize.value,
);
const freezeDragging = ref(false);
const quickInsertHover = shallowRef<{
  axis: SheetDimensionAxis;
  index: number;
}>();
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

const renderFrame = computed(() =>
  createSheetRenderFrame(
    layout.value,
    headerSize.value,
    scale.value,
    headingSize.value,
    headingOrigin.value,
  ),
);
const pageBreakGuides = computed(() => {
  if (props.viewMode !== "normal" || !props.showPageBreaks) return undefined;
  const pages = pagination.value;
  if (!pages) return undefined;
  return { rowBreaks: pages.layoutRowBreaks, columnBreaks: pages.layoutColumnBreaks };
});
const pageView = computed<PageViewPaintState | undefined>(() => {
  if (props.viewMode === "normal") return undefined;
  const pages = pagination.value;
  if (!pages) return undefined;
  const range = pages.printRange;
  const x = baseGeometry.value.getColumnOffset(range.start.column);
  const y = baseRows.value.getBoundaryOffset(range.start.row) ?? 0;
  const right =
    baseGeometry.value.getColumnOffset(range.end.column) +
    baseGeometry.value.getColumnWidth(range.end.column);
  const bottom = baseRows.value.getBoundaryOffset(range.end.row + 1) ?? y;
  const scroll = layout.value.bodyScrollPosition;
  return {
    mode: props.viewMode,
    showWhiteSpace: props.showPageWhiteSpace,
    rulerSize: rulerInset.value,
    uiScale: 1 / pageUiScale.value,
    pages:
      pageProjection.value?.getVisiblePages({ x: scroll.x, y: scroll.y, ...viewportSize }) ??
      pages.getVisiblePages({ x: scroll.x, y: scroll.y, ...viewportSize }, props.viewMode),
    printRect: { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) },
    rowBreaks: pages.rowBreaks,
    columnBreaks: pages.columnBreaks,
    dragBoundary: pageBoundaryPreview.value,
    dragCorner: pageCornerPreview.value,
    pageLabel: (page) => t("pageLayout.pageNumber", { page }),
    millimetresPerUnit: (pages.printScale * 25.4) / 96,
  };
});
const pageBreakDrag = usePageBreakDrag({
  getState: () => pageView.value,
  getFrame: () => renderFrame.value,
  getSetup: () => pageSetup.value,
  getPagination: () => pagination.value,
  getMergedCells: () => props.sheet.mergedCells,
  getGeometry: () => baseGeometry.value,
  getRows: () => baseRows.value,
  getSurfacePoint: surfacePoint,
  isDisabled: () => props.readOnly || isEditing.value || Boolean(getReferenceEditor()),
  onBeforeStart: () => {
    stopDragSelection();
    stopFormulaReferenceDrag();
    stopDimensionResize();
    stopAxisMoveDrag();
  },
  onPreview: (setup, boundary, corner) => {
    pageSetupDraft.value = setup;
    pageBoundaryPreview.value = boundary;
    pageCornerPreview.value = corner;
  },
  onChange: (setup) => emit("pageSetupChange", setup),
});
const pageMarginDrag = usePageMarginDrag({
  getState: () => pageView.value,
  getFrame: () => renderFrame.value,
  getSetup: () => pageSetup.value,
  getSurfacePoint: surfacePoint,
  isDisabled: () =>
    props.readOnly ||
    (!props.showPageMargins && !props.showPageRulers) ||
    isEditing.value ||
    Boolean(getReferenceEditor()),
  onBeforeStart: () => {
    pageBreakDrag.stop();
    pageMarginDrag.stop();
    stopDragSelection();
    stopFormulaReferenceDrag();
    stopDimensionResize();
    stopAxisMoveDrag();
    return true;
  },
  onPreview: (setup) => {
    pageSetupDraft.value = setup;
  },
  onChange: (setup) => emit("pageSetupChange", setup),
});
function adjustPageMargin(payload: {
  margin: Parameters<typeof adjustSheetPageMargin>[0]["margin"];
  valueMm: number;
}): void {
  if (props.readOnly) return;
  const setup = adjustSheetPageMargin({ setup: pageSetup.value, ...payload });
  if (setup) emit("pageSetupChange", setup);
}
watch(
  () => [
    props.sheet.id,
    props.readOnly,
    props.pageSetup,
    props.sheet.pageSetup,
    props.showPageMargins,
    props.showPageRulers,
    props.showPageWhiteSpace,
  ],
  () => {
    pageBreakDrag.stop();
    pageMarginDrag.stop();
  },
);
watch(
  () => props.viewMode,
  () => {
    pageBreakDrag.stop();
    pageMarginDrag.stop();
    stopDragSelection();
    stopFormulaReferenceDrag();
    stopDimensionResize();
    stopAxisMoveDrag();
  },
  { flush: "sync" },
);
const surfaceRef = ref<InstanceType<typeof SheetSurface>>();
const emptyImageUrls: ReadonlyMap<string, string> = new Map();
const resolvedImageUrls = computed(() => props.imageAssetUrls ?? emptyImageUrls);
const imageLayerRef = ref<InstanceType<typeof SheetFloatingImageLayer>>();
const imagePaintState = shallowRef<FloatingImagePaintState>({
  images: [],
  revision: 0,
});
const floatingImageCache = createFloatingImageCanvasCache(() => surfaceRef.value?.invalidate());
const drawingThemeEffects = computed(() => getDrawingThemeEffects(props.theme));
const hasFramedPictures = computed(() => props.sheet.floatingImages.some(isFramedPictureObject));
const pictureFrameContext = computed<PictureFrameLayoutContext | undefined>(() => {
  if (!hasFramedPictures.value) return undefined;
  // Paper gaps require a distinct projection; never feed them into continuous metrics.
  if (props.viewMode === "page-layout") return undefined;
  return {
    layout: layout.value,
    metrics: createPictureViewMetrics(props.sheet, baseGeometry.value, baseRows.value, {
      effectiveRowHeights: effectiveRowHeights.value,
    }),
  };
});
const paintSurfaceImages = computed(() => {
  const state = imagePaintState.value;
  const currentLayout = layout.value;
  const frameContext = pictureFrameContext.value;
  const assetUrls = resolvedImageUrls.value;
  const loadingAssetIds = props.loadingImageAssetIds;
  const palette = environment.value;
  const loadingLabel = t("image.loading");
  const unavailableLabel = t("image.assetUnavailable");
  return (context: CanvasRenderingContext2D) =>
    paintFloatingImages(context, {
      state,
      layout: currentLayout,
      frameContext,
      assetUrls,
      loadingAssetIds,
      cache: floatingImageCache,
      palette: {
        placeholderBackground: palette.cells.background,
        placeholderStripe: palette.headers.background,
        placeholderBorder: palette.headers.border,
        placeholderText: palette.cells.mutedText,
      },
      loadingLabel,
      unavailableLabel,
    });
});
onBeforeUnmount(() => floatingImageCache.dispose());
function imagePoint(event: MouseEvent) {
  const point = surfacePoint(event);
  return surfacePointToBody(point, renderFrame.value.headerSize);
}
const headerState = shallowRef<HeaderInteractionState>({});
const headerSelection = computed(() => ({
  startRow: selectedRange.value.start.row,
  endRow: selectedRange.value.end.row,
  startColumn: selectedRange.value.start.column,
  endColumn: selectedRange.value.end.column,
  mode: getSelectionMode(selection.value),
  activeRow: activeCell.value.row,
  activeColumn: activeCell.value.column,
}));
const headerQuickTools = computed(() => ({
  enabled: headerQuickToolsEnabled.value,
  gutter: quickToolsGutter.value,
  rowOutlineGutter: props.showHeaders ? rowOutlineGutter.value : 0,
  columnOutlineGutter: props.showHeaders ? columnOutlineHeaderHeight.value : 0,
}));
const headerInput = useHeaderInteraction({
  canFocus: () => !getReferenceEditor() && !isComposing.value,
  getFrame: () => renderFrame.value,
  getSelection: () => headerSelection.value,
  getQuickTools: () => headerQuickTools.value,
  getGeometry: () => geometry.value,
  onInvalidate: () => {
    headerState.value = headerInput.state;
  },
  callbacks: {
    selectAxis: (axis, index, shiftKey) =>
      axis === "row"
        ? onRowHeaderSelect({ row: index, shiftKey })
        : onColumnHeaderSelect({ column: index, shiftKey }),
    selectAll: onCornerClick,
    resizeStart: (axis, index, event) => onDimensionResizeStart(axis, { index, event }),
    resize: (axis, index, size) => onDimensionResizeRequest(axis, { index, size }),
    quickInsert: (axis, index) => onQuickInsert(axis, { index }),
    quickInsertHover: (axis, index) => onQuickInsertHover(axis, index === null ? null : { index }),
    axisDragStart: (axis, index, event) => onAxisDragStart(axis, { index, event }),
    openContextMenu: openAxisContextMenu,
  },
});
const headerLabel = computed(() => {
  const focused = headerState.value.focused;
  if (!focused) return t("grid.worksheet", { name: props.sheet.name });
  if (focused.axis === "corner") return t("grid.selectAll");
  return focused.axis === "row"
    ? t("grid.selectRow", { row: (focused.index ?? 0) + 1 })
    : t("grid.selectColumn", {
        column: columnIndexToLabel(focused.index ?? 0),
      });
});
const headerPaintState = computed(() => ({
  selection: headerSelection.value,
  quickTools: headerQuickTools.value,
  ...headerState.value,
}));
const freezePreview = shallowRef<SheetFreezeDragOverlay>();
const freezeHandleState = shallowRef<SheetFreezeHandlesOverlay>();
const overlayState = computed<SheetOverlayState>(() => {
  const range = selectedRange.value;
  const readingRects = !props.highlightEnabled
    ? []
    : getSelectionMode(selection.value) !== "cells"
      ? layout.value.getRangeFragments(range)
      : [
          ...layout.value.getRangeFragments({
            start: { row: range.start.row, column: 0 },
            end: { row: range.end.row, column: renderExtent.value.columnCount - 1 },
          }),
          ...layout.value.getRangeFragments({
            start: { row: 0, column: range.start.column },
            end: { row: renderExtent.value.rowCount - 1, column: range.end.column },
          }),
        ];
  return {
    activeRects: activeCellOutlineRects.value,
    rangeRects: selectedRangeRects.value,
    editing: isEditing.value,
    referenceGroups: formulaReferenceGroups.value,
    clipboardRects: clipboardRangeRects.value,
    clipboardMode: clipboardMode.value,
    fillPreviewRects: fillPreviewRects.value,
    readingRects,
    readingColor: props.highlightColor,
    axisOperationPreview: axisOperationPreview.value,
    freezeDrag: freezePreview.value,
    freezeHandles: {
      ...freezeHandleState.value,
      visible: quickToolsAvailable.value,
      disabled: Boolean(axisMoveDrag.value),
    },
  };
});
const imageHoverCursor = ref<string>();
const hoveredHyperlink = shallowRef<{ address: CellAddress; title: string }>();
const hoveredNoteAddress = shallowRef<CellAddress>();
let notePreviewLeaveTimer: number | undefined;

function cancelNotePreviewLeave(): void {
  if (notePreviewLeaveTimer === undefined) return;
  window.clearTimeout(notePreviewLeaveTimer);
  notePreviewLeaveTimer = undefined;
}

function scheduleNotePreviewLeave(): void {
  cancelNotePreviewLeave();
  notePreviewLeaveTimer = window.setTimeout(() => {
    hoveredNoteAddress.value = undefined;
    notePreviewLeaveTimer = undefined;
  }, 120);
}

const hyperlinkPointerGesture = shallowRef<{
  address: CellAddress;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}>();
const surfaceCursor = computed(() => {
  if (pageMarginDrag.cursor.value) return pageMarginDrag.cursor.value;
  if (pageBreakDrag.cursor.value) return pageBreakDrag.cursor.value;
  const hit = headerState.value.hovered;
  if (dimensionResize.value)
    return dimensionResize.value.axis === "row" ? "row-resize" : "col-resize";
  if (axisMoveDrag.value?.active) return "grabbing";
  if (hit?.action === "resize") return hit.axis === "row" ? "row-resize" : "col-resize";
  if (hit?.action === "grip") return "grab";
  return hit
    ? "pointer"
    : (imageHoverCursor.value ?? (hoveredHyperlink.value ? "pointer" : "cell"));
});
function surfacePoint(event: MouseEvent) {
  return clientPointToElementSurface(
    { x: event.clientX, y: event.clientY },
    rootRef.value!,
    scale.value,
  );
}
function isRulerPoint(point: { x: number; y: number }): boolean {
  const inset = rulerInset.value;
  return inset > 0 && (point.x < inset || point.y < inset);
}
function onSurfacePointerDown(event: PointerEvent): void {
  if (pageBreakDrag.start(event)) return;
  const point = surfacePoint(event);
  if (isRulerPoint(point)) return;
  if (headerInput.onPointerDown(point, event, event.currentTarget as HTMLElement)) return;
  if (imageLayerRef.value?.handleSurfacePointerDown(event, imagePoint(event))) return;
  if (event.button !== 0) return;
  const address = getSurfaceCell(renderFrame.value, point);
  if (address) {
    headerInput.focus(undefined);
    event.preventDefault();
    const hyperlink = getCellHyperlink(props.sheet, address);
    if (hyperlink && !event.shiftKey && !props.formatPainterActive && !getReferenceEditor()) {
      hyperlinkPointerGesture.value = {
        address,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      window.addEventListener("pointermove", onHyperlinkPointerMove);
      window.addEventListener("pointerup", onHyperlinkPointerUp);
      window.addEventListener("pointercancel", cancelHyperlinkPointerGesture);
    }
    onCellMouseDown(address, event);
  }
}
function onSurfacePointerMove(event: PointerEvent): void {
  cancelNotePreviewLeave();
  pageBreakDrag.hover(event);
  if (isRulerPoint(surfacePoint(event))) {
    headerInput.onPointerLeave();
    return;
  }
  headerInput.onPointerMove(surfacePoint(event));
  imageHoverCursor.value = imageLayerRef.value?.getSurfaceCursor(imagePoint(event));
  const address = getSurfaceCell(renderFrame.value, surfacePoint(event));
  const hyperlink = address && getCellHyperlink(props.sheet, address);
  hoveredHyperlink.value = hyperlink
    ? { address, title: hyperlink.tooltip || hyperlink.target }
    : undefined;
  const noteAddress = address && layout.value.getAnchorForAddress(address);
  hoveredNoteAddress.value =
    noteAddress && props.sheet.cells.get(`${noteAddress.row}:${noteAddress.column}`)?.note
      ? noteAddress
      : undefined;
}
function onSurfacePointerLeave(): void {
  pageBreakDrag.clearHover();
  headerInput.onPointerLeave();
  imageHoverCursor.value = undefined;
  hoveredHyperlink.value = undefined;
  scheduleNotePreviewLeave();
}
function clearHyperlinkPointerGesture(): void {
  hyperlinkPointerGesture.value = undefined;
  window.removeEventListener("pointermove", onHyperlinkPointerMove);
  window.removeEventListener("pointerup", onHyperlinkPointerUp);
  window.removeEventListener("pointercancel", cancelHyperlinkPointerGesture);
}
function cancelHyperlinkPointerGesture(event?: PointerEvent): void {
  if (
    event &&
    hyperlinkPointerGesture.value &&
    event.pointerId !== hyperlinkPointerGesture.value.pointerId
  )
    return;
  clearHyperlinkPointerGesture();
}
function onHyperlinkPointerMove(event: PointerEvent): void {
  const gesture = hyperlinkPointerGesture.value;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 3)
    gesture.moved = true;
}
function onHyperlinkPointerUp(event: PointerEvent): void {
  const gesture = hyperlinkPointerGesture.value;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  clearHyperlinkPointerGesture();
  const completedAddress = getSurfaceCell(renderFrame.value, surfacePoint(event));
  if (
    !gesture.moved &&
    completedAddress &&
    areCellAddressesEqual(gesture.address, completedAddress)
  ) {
    emit("openHyperlink", gesture.address);
  }
}
function onSurfaceContextMenu(event: MouseEvent): void {
  const point = surfacePoint(event);
  if (isRulerPoint(point)) return;
  if (headerInput.onContextMenu(point, event, event.currentTarget as HTMLElement)) return;
  if (imageLayerRef.value?.handleSurfaceContextMenu(event, imagePoint(event))) return;
  const address = getSurfaceCell(renderFrame.value, point);
  if (address) openCellContextMenu(address, event);
}
function onSurfaceDoubleClick(event: MouseEvent): void {
  if (imageLayerRef.value?.handleSurfaceDoubleClick(event, imagePoint(event))) return;
  const address = getSurfaceCell(renderFrame.value, surfacePoint(event));
  if (address) {
    event.preventDefault();
    onCellDoubleClick(address, event);
  }
}
function onSurfaceKeydown(event: KeyboardEvent): void {
  if (!headerInput.onKeyDown(event, event.currentTarget as HTMLElement)) onEditorKeydown(event);
}

const activeCellRect = computed(
  () =>
    layout.value.getCellViewportRect(activeCell.value) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
);
const notePreviewsSuppressed = computed(
  () =>
    props.notePreviewDisabled ||
    isEditing.value ||
    selectionDragging.value ||
    freezeDragging.value ||
    dimensionResize.value ||
    axisMoveDrag.value?.active ||
    cellContextMenu.value ||
    axisContextMenu.value,
);
function noteOrigin(address: CellAddress): { x: number; y: number } | undefined {
  const rect = layout.value.getCellViewportRect(address);
  const root = rootRef.value;
  if (!root || !rect || rect.width === 0 || rect.height === 0) return;
  const { row, column } = address;
  const pane =
    row < effectiveFreeze.value.rows
      ? column < effectiveFreeze.value.columns
        ? renderFrame.value.panes.topLeft
        : renderFrame.value.panes.top
      : column < effectiveFreeze.value.columns
        ? renderFrame.value.panes.left
        : renderFrame.value.panes.body;
  const left = Math.max(rect.x, pane.clip.x);
  const top = Math.max(rect.y, pane.clip.y);
  const right = Math.min(rect.x + rect.width, pane.clip.x + pane.clip.width);
  const bottom = Math.min(rect.y + rect.height, pane.clip.y + pane.clip.height);
  if (right <= left || bottom <= top) return;
  const bounds = root.getBoundingClientRect();
  return {
    x: bounds.left + (renderFrame.value.body.x + right) * scale.value,
    y: bounds.top + (renderFrame.value.body.y + top) * scale.value,
  };
}
const allNoteAddresses = computed(() => {
  void props.workbookRevision;
  if (!props.showAllNotes) return [];
  const addresses: CellAddress[] = [];
  for (const [key, cell] of props.sheet.cells) {
    if (!cell.note || props.hiddenNoteKeys.includes(key)) continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    addresses.push({ row, column });
  }
  return addresses;
});
const visibleNotes = computed(() => {
  void props.workbookRevision;
  if (notePreviewsSuppressed.value) return [];
  const addresses = new Map<string, CellAddress>();
  for (const address of allNoteAddresses.value)
    addresses.set(`${address.row}:${address.column}`, address);
  const current =
    props.noteDraft?.address ??
    hoveredNoteAddress.value ??
    (props.showActiveNote ? layout.value.getAnchorForAddress(activeCell.value) : undefined);
  if (current) addresses.set(`${current.row}:${current.column}`, current);
  return [...addresses].flatMap(([key, address]) => {
    const note = props.sheet.cells.get(key)?.note;
    const draft =
      props.noteDraft?.address.row === address.row &&
      props.noteDraft.address.column === address.column
        ? props.noteDraft
        : undefined;
    if (!note && !draft) return [];
    const origin = noteOrigin(address);
    return origin ? [{ key: `${props.sheet.id}:${key}`, address, origin, note, draft }] : [];
  });
});
const notePreviewRefs = ref<InstanceType<typeof SheetNotePreview>[]>([]);
function onDocumentPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return;
  for (const preview of notePreviewRefs.value) preview.outsidePointerDown(event.target);
}
watch(
  () => `${props.sheet.id}:${activeCell.value.row}:${activeCell.value.column}`,
  () => {
    hoveredNoteAddress.value = undefined;
    for (const preview of notePreviewRefs.value) preview.deselect();
  },
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
    if (token.sheetName && token.sheetName.toLowerCase() !== props.sheet.name.toLowerCase())
      continue;
    const existing = groups.get(token.key);
    if (existing) continue;
    groups.set(token.key, {
      token,
      active: isActiveFormulaReference(editor, token),
    });
  }
  return [...groups.values()].map(({ token, active }) => ({
    key: token.key,
    colorIndex: token.colorIndex,
    rects: layout.value.getRangeFragments({
      start: token.range.start,
      end: {
        row: Math.min(token.range.end.row, geometry.value.rowCount - 1),
        column: Math.min(token.range.end.column, geometry.value.columnCount - 1),
      },
    }),
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
        display.value.getCellStyle(activeCell.value),
        locale.value,
        props.dateSystem,
      ),
);
const activeCellEditorStyle = computed(() =>
  getCellEditorStyle(
    display.value.getCellStyle(activeCell.value),
    sheetEvaluator.value.getComputedValue(activeCell.value),
    isEditing.value ? editingValue.value : activeCellDisplayValue.value,
  ),
);
const activeCellEditorFrameStyle = computed(() =>
  getCellEditorFrameStyle(display.value.getCellStyle(activeCell.value)),
);
const activeCellWrapText = computed(() =>
  isCellTextWrapped(display.value.getCellStyle(activeCell.value)),
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
    if (transfer.floatingImage)
      floatingClipboard.paste(
        transfer.floatingImage,
        mode,
        address,
        transfer.floatingImages,
        transfer.localToken,
      );
    else if (transfer.imageFile) emit("pasteImageFile", transfer.imageFile, mode, address);
  },
  onReadUnavailable: (targetSelection) => floatingClipboard.pastePending(targetSelection.active),
  getSheet: () => props.sheet,
  getEvaluator: () => sheetEvaluator.value,
  getSelection: () => selection.value,
  getRevision: () => props.workbookRevision ?? 0,
  isEditing: () => isEditing.value,
  isComposing: () => isComposing.value,
  onPaste: (payload) => {
    const result = props.applyPaste?.(payload) ?? {
      ok: false,
      reason: "pasteRejected" as const,
    };
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
  getSelectedImages: () => {
    if (!selectedImageIds.value.length) return undefined;
    const members = props.sheet.floatingImages.filter((image) =>
      selectedImageIds.value.includes(image.id),
    );
    if (members.length !== selectedImageIds.value.length) return null;
    return captureFloatingImageGroup(members, layout.value);
  },
  onPasteMany: (images, address) => emit("pasteFloatingImages", images, address),
  onMoveMany: (images) => props.applyFloatingImageMove?.(images) === true,
  getSheet: () => props.sheet,
  getRevision: () => props.workbookRevision ?? 0,
  clipboardPort: browserClipboard,
  onCopy: clearPendingClipboard,
  onFeedback: (key) => emit("imageFeedback", key),
  onPaste: (image, mode, address) => emit("pasteFloatingImage", image, mode, address),
  onMove: (image) => props.applyFloatingImageMove?.([image]) === true,
});
watch(
  () => props.sheet,
  () => floatingClipboard.clearCut(),
  { flush: "sync" },
);
const clipboardRangeRects = computed(() =>
  clipboardRange.value ? layout.value.getRangeFragments(clipboardRange.value) : [],
);

const {
  state: fillSession,
  handlePoint: fillHandlePoint,
  handleStyle: fillHandleStyle,
  optionsPosition: fillOptionsPosition,
  previewRects: fillPreviewRects,
  previewLabel: fillPreviewLabel,
  start: startFillDrag,
  doubleClick: doubleClickFill,
  selectMode: selectFillMode,
  fillSelection,
} = useSheetAutoFill({
  getSheet: () => props.sheet,
  getEvaluator: () => sheetEvaluator.value,
  getRevision: () => props.workbookRevision ?? 0,
  getRange: () => selectedRange.value,
  getCanFill: () =>
    Boolean(props.applyFill) &&
    !selectionReadOnly.value &&
    !isEditing.value &&
    !isComposing.value &&
    !props.formatPainterActive &&
    !getReferenceEditor() &&
    !selectedImageId.value &&
    !dimensionResize.value &&
    !freezeDragging.value &&
    !axisMoveDrag.value &&
    getSelectionMode(selection.value) === "cells",
  getLayout: () => layout.value,
  getHeaderSize: () => headerSize.value,
  getRoot: () => rootRef.value,
  getScroller: () => scrollerRef.value,
  getViewportSize: () => viewportSize,
  getScale: () => scale.value,
  getContentRowCount: () => contentExtent.value.rowCount,
  getCellAtClientPoint,
  apply: (request) => props.applyFill?.(request) ?? { ok: false, reason: "failed" },
  onBeforeStart: () => {
    stopDragSelection();
    stopFormulaReferenceDrag();
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  },
  onResult: (range, _source, visibleAddress) => {
    clearPendingClipboard();
    ensureGridExtentContains(range.end);
    setSelection(
      {
        active: selection.value.active,
        anchor: range.start,
        focus: range.end,
        mode: "cells",
      },
      visibleAddress,
    );
  },
  onFeedback: (feedback) => emit("fillFeedback", feedback),
  onEndSession: () => emit("endFill"),
  onEnsureGridExtentContains: ensureGridExtentContains,
  onEnsureGridExtentCoversViewport: ensureGridExtentCoversViewport,
  onScrollPositionChange: (position) => {
    scrollPosition.x = position.x;
    scrollPosition.y = position.y;
    emitViewState();
  },
  focusGrid: focusEditor,
});

function expandFloatingImageSelection(ids: readonly string[]): string[] {
  const result = new Set<string>();
  for (const id of ids) {
    const image = props.sheet.floatingImages.find((entry) => entry.id === id);
    if (!image) continue;
    if (image.groupId)
      for (const member of props.sheet.floatingImages) {
        if (member.groupId === image.groupId) result.add(member.id);
      }
    else result.add(id);
  }
  return [...result];
}
function selectFloatingImage(id: string | null, additive = false): void {
  if (isComposing.value) return;
  if (isEditing.value) finishEdit(undefined, false);
  stopDragSelection();
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  const group = image?.groupId
    ? props.sheet.floatingImages
        .filter((entry) => entry.groupId === image.groupId)
        .map((entry) => entry.id)
    : id
      ? [id]
      : [];
  if (additive && id) {
    selectedImageIds.value = selectedImageIds.value.includes(id)
      ? selectedImageIds.value.filter((entry) => !group.includes(entry))
      : [...new Set([...selectedImageIds.value, ...group])];
    selectedImageId.value = selectedImageIds.value.at(-1) ?? null;
  } else {
    if (!id || !selectedImageIds.value.includes(id)) selectedImageIds.value = group;
    selectedImageId.value = id;
  }
  if (!id) focusEditor();
}

function deleteSelectedFloatingImage(id: string): void {
  if (objectsReadOnly.value) return;
  if (selectedImageIds.value.includes(id) && selectedImageIds.value.length > 1)
    emit("deleteFloatingImages", selectedImageIds.value);
  else emit("deleteFloatingImage", id);
  selectedImageId.value = null;
  focusEditor();
}

function convertSelectedFloatingImageToCell(id: string): void {
  if (props.readOnly) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (!image) return;
  emit("convertFloatingImageToCell", id);
  if (!props.sheet.floatingImages.some((entry) => entry.id === id)) {
    setActiveCell(layout.value.getAnchorForAddress(getPictureObjectOriginCell(image, props.sheet)));
  }
}

function onImageCopy(event: ClipboardEvent): void {
  if (event.target instanceof Element && event.target.closest("[data-page-header-footer]")) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === selectedImageId.value);
  if (isEditing.value || !image) {
    floatingClipboard.clear();
    return;
  }
  event.stopPropagation();
  void floatingClipboard.copy(image, "copy", event);
}

function onImageCut(event: ClipboardEvent): void {
  if (event.target instanceof Element && event.target.closest("[data-page-header-footer]")) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === selectedImageId.value);
  if (isEditing.value || !image) {
    floatingClipboard.clear();
    return;
  }
  if (objectsReadOnly.value) {
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
  if (objectsReadOnly.value) return;
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (!image) return;
  setActiveCell(getPictureObjectOriginCell(image, props.sheet));
  await pasteSelection();
  focusEditor();
}

function onImagePaste(event: ClipboardEvent): void {
  if (event.target instanceof Element && event.target.closest("[data-page-header-footer]")) return;
  if (isComposing.value || !event.clipboardData) return;
  const transfer = readFloatingImageTransfer(event.clipboardData);
  const image = transfer.floatingImage;
  if (transfer.invalidFloatingImage) {
    floatingClipboard.observeTransfer(transfer);
    event.preventDefault();
    event.stopPropagation();
    emit("imageFeedback", "clipboard.pasteRejected");
    return;
  }
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
  const localToken = readGridClipboardLocalToken(event.clipboardData);
  floatingClipboard.observeTransfer({ ...transfer, localToken });
  if (objectsReadOnly.value) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
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
  if (image)
    floatingClipboard.paste(image, mode, activeCell.value, transfer.floatingImages, localToken);
  else if (file) emit("pasteImageFile", file, mode);
}

async function pasteDeferredFloatingImage(event: ClipboardEvent): Promise<void> {
  if (objectsReadOnly.value) return;
  event.preventDefault();
  event.stopPropagation();
  const sheet = props.sheet;
  const revision = props.workbookRevision;
  const clipboardOperation = floatingClipboard.getOperation();
  const address = { ...activeCell.value };
  const editing = isEditing.value;
  const draft = editingValue.value;
  const input = event.target instanceof HTMLTextAreaElement ? event.target : undefined;
  const start = input?.selectionStart ?? null;
  const end = input?.selectionEnd ?? null;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  let image: FloatingImage | undefined;
  let images: readonly FloatingImage[] | undefined;
  let localToken: string | undefined;
  let invalidFloatingImage = false;
  let unsupportedFloatingImage = false;
  try {
    const transfer = await browserClipboard.read({ preferAsync: true });
    if (areGridClipboardTextsEqual(text, transfer.text)) {
      image = transfer.floatingImage;
      images = transfer.floatingImages;
      localToken = transfer.localToken;
      invalidFloatingImage = transfer.invalidFloatingImage === true;
      unsupportedFloatingImage = transfer.unsupportedFloatingImage === true;
    }
  } catch {
    // Keep the captured native text when the browser denies the optional rich read.
  }
  if (floatingClipboard.getOperation() !== clipboardOperation) return;
  if (
    props.sheet !== sheet ||
    props.workbookRevision !== revision ||
    !areCellAddressesEqual(activeCell.value, address) ||
    isEditing.value !== editing ||
    (editing && editingValue.value !== draft)
  ) {
    emit("clipboardFeedback", "documentChanged");
    return;
  }
  floatingClipboard.observeTransfer({
    floatingImage: image,
    localToken,
    invalidFloatingImage,
    unsupportedFloatingImage,
  });
  if (objectsReadOnly.value) {
    emit("clipboardFeedback", "documentChanged");
    return;
  }
  if (invalidFloatingImage) {
    emit("imageFeedback", "clipboard.pasteRejected");
    return;
  }
  if (image) {
    if (editing) finishEdit(undefined, false);
    clearPendingClipboard();
    floatingClipboard.paste(
      image,
      editing || getCellContent(sheet, address)?.kind === "image" ? "cell" : "floating",
      address,
      images,
      localToken,
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
  () => ({
    sheet: props.sheet,
    signature: JSON.stringify(props.sheet.floatingImages.map((image) => [image.id, image.groupId])),
  }),
  (current, previous) => {
    if (current.sheet !== previous.sheet) {
      selectedImageIds.value = [];
      selectedImageId.value = null;
      return;
    }
    selectedImageIds.value = expandFloatingImageSelection(selectedImageIds.value);
    if (!props.sheet.floatingImages.some((image) => image.id === selectedImageId.value))
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
  if (
    !canSelectCell(props.sheet, nextSelection.active) ||
    !canSelectCell(props.sheet, nextSelection.focus)
  )
    return;
  selectedImageId.value = null;
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  ensureGridExtentContains(visibleAddress);
  ensureGridExtentContains(nextSelection.active);
  ensureGridExtentContains(nextSelection.anchor);
  ensureGridExtentContains(nextSelection.focus);
  const normalized = normalizeSelectionForSheet(nextSelection);
  if (!areSelectionsEqual(selection.value, normalized)) {
    // Extending a range does not change its active cell or the cell content layer.
    if (areCellAddressesEqual(selection.value.active, normalized.active)) {
      normalized.active = selection.value.active;
    }
    selection.value = normalized;
  }
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

function finishEdit(
  destination?: CellSelection,
  restoreFocus = true,
  finishOptions: CellEditFinishOptions = {},
): boolean {
  stopFormulaReferenceDrag();
  return finishCellEdit(destination, restoreFocus, finishOptions);
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
      ? navigationRows.value.getNextVisibleRow(row)
      : navigationRows.value.getPreviousVisibleRow(row),
  getVisibleColumn: getNextVisibleColumn,
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

function getNextVisibleColumn(column: number, direction: -1 | 1): number | null {
  let next = column + direction;
  while (next >= 0 && next < MAX_SHEET_COLUMNS) {
    if (!outlineHiddenColumnSet.value.has(next)) return next;
    next += direction;
  }
  return null;
}

watch(
  [navigationRows, outlineHiddenColumnSet],
  () => {
    const current = selection.value.active;
    const rows = navigationRows.value;
    const row = rows.isRowVisible(current.row)
      ? current.row
      : (rows.getNextVisibleRow(current.row) ?? rows.getPreviousVisibleRow(current.row));
    const column = !outlineHiddenColumnSet.value.has(current.column)
      ? current.column
      : (getNextVisibleColumn(current.column, 1) ?? getNextVisibleColumn(current.column, -1));
    if (row === null || column === null || (row === current.row && column === current.column))
      return;
    ensureGridExtentContains({ row, column });
    setSelection(createCellSelection({ row, column }));
  },
  { deep: true },
);

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
    if (!finishEdit(nextSelection)) return;
  } else {
    setSelection(nextSelection, address);
  }
}

function navigateToRange(range: CellRange): void {
  const nextSelection: CellSelection = {
    active: { ...range.start },
    anchor: { ...range.start },
    focus: { ...range.end },
    mode: "cells",
  };
  if (deferSelectionWhileComposing(nextSelection)) return;
  if (isEditing.value && !finishEdit(nextSelection)) return;
  ensureGridExtentContains(range.end);
  setSelection(nextSelection, range.start);
}

function moveSelection(
  delta: { rows?: number; columns?: number },
  commitEdit: boolean,
  extend = false,
  finishOptions: CellEditFinishOptions = {},
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
        ? navigationRows.value.getNextVisibleRow(source.row)
        : navigationRows.value.getPreviousVisibleRow(source.row);
    if (row === null) return;
    if (!extend) {
      destination.active.row = row;
      destination.anchor.row = row;
    }
    destination.focus.row = row;
  }
  if (delta.columns) {
    const source = extend ? selection.value.focus : selection.value.active;
    const column = getNextVisibleColumn(source.column, delta.columns > 0 ? 1 : -1);
    if (column === null) return;
    if (!extend) {
      destination.active.column = column;
      destination.anchor.column = column;
    }
    destination.focus.column = column;
  }
  const visibleAddress = extend ? destination.focus : destination.active;
  ensureGridExtentContains(visibleAddress);

  if (commitEdit) {
    if (!finishEdit(destination, true, finishOptions)) return;
  } else {
    setSelection(destination, visibleAddress);
  }
}

function onDimensionResizeRequest(
  axis: SheetDimensionAxis,
  payload: { index: number; size: number },
): void {
  if (dimensionReadOnly(axis)) return;
  requestDimensionResize(axis, payload);
}

function onDimensionResizeStart(
  axis: SheetDimensionAxis,
  payload: { index: number; event: PointerEvent },
): void {
  if (dimensionReadOnly(axis)) return;
  const startSize =
    axis === "row"
      ? geometry.value.getRowHeight(payload.index)
      : geometry.value.getColumnWidth(payload.index);
  startDimensionResize(axis, { ...payload, startSize });
}

function onGridKeydown(event: KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest("[data-page-header-footer]")) return;
  if (
    event.target instanceof Element &&
    event.target.closest("[data-floating-image-id], [data-sheet-drawing-id]")
  ) {
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
    if (!finishEdit(nextSelection)) return;
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
    if (!finishEdit(nextSelection, restoreFocus)) return;
  } else {
    setSelection(nextSelection, address, restoreFocus);
  }
}

function onColumnHeaderSelect(payload: { column: number; shiftKey: boolean }): void {
  if (pickAxisReference("columns", { row: 0, column: payload.column }, payload.shiftKey)) return;
  selectAxis("columns", { row: 0, column: payload.column }, payload.shiftKey);
}

function onRowHeaderSelect(payload: { row: number; shiftKey: boolean }): void {
  if (pickAxisReference("rows", { row: payload.row, column: 0 }, payload.shiftKey)) return;
  selectAxis("rows", { row: payload.row, column: 0 }, payload.shiftKey);
}

function pickAxisReference(
  mode: "rows" | "columns",
  address: CellAddress,
  shiftKey: boolean,
): boolean {
  const editor = getReferenceEditor();
  if (!editor || isComposing.value) return false;
  const previous = editor.referenceActive ? editor.referenceRange : null;
  const next =
    shiftKey && previous
      ? extendAxisSelection(
          createAxisSelection(mode, {
            row: previous.start.row,
            column: previous.start.column,
          }),
          mode,
          address,
        )
      : createAxisSelection(mode, address);
  const range = getSelectionRange(next);
  const rangeKind = mode === "rows" ? "row-axis" : "column-axis";
  if (!editor.pickReference(range, "start", rangeKind)) return false;
  formulaReferenceRange.value = range;
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  stopDragSelection();
  stopFormulaReferenceDrag();
  return true;
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
  trigger: HTMLElement,
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
    anchor: markRaw(createContextMenuPoint({ clientX, clientY }, rootRef.value ?? trigger)),
    trigger,
  };
}

function getAxisMaximum(axis: SheetDimensionAxis): number {
  return axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
}

function requestAxisInsert(payload: { direction: "before" | "after"; count: number }): void {
  if (!axisContextMenu.value || axisOperationReadOnly(axisContextMenu.value.axis, "insert")) return;
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
  if (axisOperationReadOnly(axis, "insert")) return false;
  const insertIndex = direction === "before" ? index : index + selectionCount;
  if (count > getAxisMaximum(axis) - insertIndex) return false;
  clearPendingClipboard();
  emit("insertAxis", { axis, index: insertIndex, count });
  return true;
}

function requestAxisDelete(): void {
  if (!axisContextMenu.value || axisOperationReadOnly(axisContextMenu.value.axis, "delete")) return;
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
  if (!axisContextMenu.value || dimensionReadOnly(axisContextMenu.value.axis)) return;
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
  const noteAddress = layout.value.getAnchorForAddress(address);
  const contextElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  cellContextMenu.value = {
    imageAddress:
      getCellContent(props.sheet, layout.value.getAnchorForAddress(address))?.kind === "image"
        ? layout.value.getAnchorForAddress(address)
        : undefined,
    noteAddress,
    anchor: markRaw(createContextMenuPoint(event, rootRef.value ?? contextElement ?? undefined)),
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
  const noteAddress = layout.value.getAnchorForAddress(activeCell.value);
  cellContextMenu.value = {
    imageAddress:
      getCellContent(props.sheet, activeCell.value)?.kind === "image"
        ? { ...activeCell.value }
        : undefined,
    noteAddress,
    anchor: markRaw(createContextMenuPoint({ clientX: x, clientY: y }, scroller)),
  };
}

async function requestCellClipboard(
  action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
): Promise<void> {
  if (
    props.readOnly &&
    action !== "copy" &&
    (selectionReadOnly.value || action === "cut" || action === "paste-formats")
  )
    return;
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

async function requestAxisClipboard(
  action: "cut" | "copy" | "paste" | "paste-values" | "paste-formats",
): Promise<void> {
  if (!axisContextMenu.value || (props.readOnly && action !== "copy")) return;
  axisContextMenu.value = undefined;
  floatingClipboard.clear();
  if (action === "cut") await cutSelection();
  else if (action === "copy") await copySelection();
  else if (action === "paste-values") await pasteValuesSelection();
  else if (action === "paste-formats") await pasteFormatsSelection();
  else await pasteSelection();
  focusEditor();
}

function requestContextAction(action: SheetContextAction): void {
  if (!axisContextMenu.value && !cellContextMenu.value) return;
  const allowedAxisFormatting =
    (action.type === "resize" || action.type === "autoFit" || action.type === "visibility") &&
    !dimensionReadOnly(action.axis);
  const allowedAxisOperation =
    (action.type === "insert" || action.type === "delete") &&
    !axisOperationReadOnly(action.axis, action.type);
  if (
    props.readOnly &&
    action.type !== "columnStatistics" &&
    !allowedAxisFormatting &&
    !allowedAxisOperation
  )
    return;
  const range = getSelectionRange(selection.value);
  const keepOpen =
    action.type === "applyStyle" ||
    action.type === "applyBorders" ||
    action.type === "updateBorderFormat" ||
    action.type === "merge" ||
    action.type === "unmerge";
  if (!keepOpen) {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  }
  if (
    action.type !== "columnStatistics" &&
    action.type !== "chooseFromColumn" &&
    action.type !== "filter" &&
    action.type !== "formatCells" &&
    action.type !== "formatPainter"
  )
    clearPendingClipboard();
  emit("contextAction", {
    action,
    range: { start: { ...range.start }, end: { ...range.end } },
  });
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

function requestCellNote(action: "edit" | "delete"): void {
  if (objectsReadOnly.value) return;
  const address = cellContextMenu.value?.noteAddress;
  cellContextMenu.value = undefined;
  if (!address) return;
  if (action === "edit") emit("editNote", address);
  else emit("deleteNote", address);
  focusEditor();
}

function requestCellClear(): void {
  if (selectionReadOnly.value) return;
  if (!cellContextMenu.value) {
    return;
  }
  clearPendingClipboard();
  emit("clearCells", getSelectionRange(selection.value));
  cellContextMenu.value = undefined;
  focusEditor();
}

const contextPivotDetails = computed(() =>
  props.sheet.pivotTables?.find((table) =>
    isPivotValueCell(table, cellContextMenu.value?.noteAddress ?? activeCell.value),
  ),
);
const contextPivotGroup = computed(() => {
  const address = cellContextMenu.value?.noteAddress ?? activeCell.value;
  for (const table of props.sheet.pivotTables ?? []) {
    const active = getPivotActiveField(table, [], address);
    if (active?.area === "rows" || active?.area === "columns") {
      const field = (active.area === "rows" ? table.rowFields : table.columnFields)[active.index]!;
      return { table, field };
    }
  }
  return undefined;
});
function requestPivotGroup(ungroup = false): void {
  const table = contextPivotGroup.value?.table;
  if (table) {
    if (ungroup) emit("ungroupPivotField", table.id);
    else emit("groupPivotField", table.id);
  }
  closeCellContextMenu(false);
}
function requestPivotDetails(): void {
  const table = contextPivotDetails.value;
  const address = cellContextMenu.value?.noteAddress;
  if (table && address) emit("showPivotDetails", table.id, address);
  closeCellContextMenu(false);
}

function closeCellContextMenu(restoreFocus: boolean): void {
  cellContextMenu.value = undefined;
  if (restoreFocus) {
    focusEditor();
  }
}

function onCornerClick(): void {
  selectAxis("all", { row: 0, column: 0 }, false);
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
  if (isComposing.value) return;
  const pivot = props.sheet.pivotTables?.find((table) => isPivotValueCell(table, address));
  if (pivot) {
    event.preventDefault();
    emit("showPivotDetails", pivot.id, address);
    return;
  }
  if (props.readOnly && (!props.sheet.properties.protected || !canEditCell(props.sheet, address))) {
    emit("unlockRange", { start: address, end: address });
    return;
  }
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
  const action = getWorkbookHistoryShortcut(event, {
    allowEditableTarget: true,
  });
  if (!action) return false;
  event.preventDefault();
  clearPendingClipboard();
  if (action === "undo") emit("undo");
  else emit("redo");
  return true;
}

function traverseSelection(
  key: "Enter" | "Tab",
  reverse: boolean,
  commitEdit: boolean,
  finishOptions: CellEditFinishOptions = {},
): void {
  if (!isSingleCellSelection(selection.value)) {
    const direction =
      key === "Tab"
        ? reverse
          ? "backward-row"
          : "forward-row"
        : reverse
          ? "backward-column"
          : "forward-column";
    const destination = moveActiveCellWithinSelection(selection.value, direction, {
      isRowVisible: (row) => navigationRows.value.isRowVisible(row),
      getNextVisibleRow: (row) => navigationRows.value.getNextVisibleRow(row),
      getPreviousVisibleRow: (row) => navigationRows.value.getPreviousVisibleRow(row),
      isColumnVisible: (column) => !outlineHiddenColumnSet.value.has(column),
      getNextVisibleColumn: (column) => getNextVisibleColumn(column, 1),
      getPreviousVisibleColumn: (column) => getNextVisibleColumn(column, -1),
    });
    if (commitEdit) {
      finishEdit(destination, true, finishOptions);
    } else {
      setSelection(destination);
    }
    return;
  }

  if (key === "Tab" && !reverse && requestTableExpansion(commitEdit, finishOptions)) return;

  moveSelection(
    key === "Tab" ? { columns: reverse ? -1 : 1 } : { rows: reverse ? -1 : 1 },
    commitEdit,
    false,
    finishOptions,
  );
}

function requestTableExpansion(commitEdit: boolean, finishOptions: CellEditFinishOptions): boolean {
  const address = activeCell.value;
  const table = (props.sheet.tables ?? []).find(
    (entry) =>
      address.row >= entry.range.start.row &&
      address.row <= entry.range.end.row &&
      address.column >= entry.range.start.column &&
      address.column <= entry.range.end.column,
  );
  if (!table) return false;
  const lastDataRow = table.range.end.row - (table.totalRow ? 1 : 0);
  if (address.row !== lastDataRow || address.column !== table.range.end.column) return false;
  if (commitEdit && !finishEdit(undefined, true, finishOptions)) return true;
  const range = {
    start: { ...table.range.start },
    end: { ...table.range.end, row: table.range.end.row + 1 },
  };
  const next = { row: lastDataRow + 1, column: table.range.start.column };
  emit("tableExpandRequest", { tableId: table.id, range, next });
  const expanded = (props.sheet.tables ?? []).some(
    (entry) => entry.id === table.id && entry.range.end.row >= range.end.row,
  );
  if (expanded) setActiveCell(next);
  return true;
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (isComposing.value || event.isComposing) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
    return;
  }

  if (
    !isEditing.value &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key === "Enter" &&
    getSelectionMode(selection.value) === "cells" &&
    getCellHyperlink(props.sheet, activeCell.value)
  ) {
    event.preventDefault();
    emit("openHyperlink", activeCell.value);
    return;
  }

  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key === "ArrowDown" &&
    !isEditing.value &&
    !props.readOnly &&
    getSelectionMode(selection.value) === "cells"
  ) {
    event.preventDefault();
    emit("contextAction", {
      action: { type: "chooseFromColumn" },
      range: getSelectionRange(selection.value),
    });
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
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    const mode = getSelectionMode(selection.value);
    if (mode === "cells") openActiveCellContextMenu();
    else if (mode === "rows" || mode === "columns") {
      const axis = mode === "rows" ? "row" : "column";
      const index = axis === "row" ? activeCell.value.row : activeCell.value.column;
      const frame = renderFrame.value;
      const item = (axis === "row" ? frame.rowHeaders : frame.columnHeaders)
        .flatMap((pane) => pane.items)
        .find((item) => item.index === index);
      const bounds = rootRef.value!.getBoundingClientRect();
      const x =
        axis === "row"
          ? frame.headerSize.width - ROW_HEADER_WIDTH / 2
          : (item?.offset ?? frame.body.x) + (item?.size ?? 0) / 2;
      const y =
        axis === "column"
          ? frame.headerSize.height / 2
          : (item?.offset ?? frame.body.y) + (item?.size ?? 0) / 2;
      openAxisContextMenu(
        axis,
        index,
        bounds.left + x * scale.value,
        bounds.top + y * scale.value,
        event.currentTarget as HTMLElement,
      );
    } else return;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (handleHistoryShortcut(event)) {
    return;
  }

  if (cellReadOnly.value) {
    if (
      event.key === "F2" ||
      event.key === "Delete" ||
      event.key === "Backspace" ||
      (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
    )
      emit("unlockRange", selectedRange.value);
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
      if (!editSession.state.asText)
        editingValue.value = completeFormulaForCommit(editingValue.value);
      traverseSelection("Enter", event.shiftKey, true, {
        confirmPendingWarning: isExplicitWarningConfirmationKey(event),
      });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (!editSession.state.asText)
        editingValue.value = completeFormulaForCommit(editingValue.value);
      traverseSelection("Tab", event.shiftKey, true);
    }
    return;
  }

  if (
    !selectionReadOnly.value &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "e" &&
    !props.formatPainterActive &&
    !getReferenceEditor() &&
    !selectedImageId.value &&
    !dimensionResize.value &&
    !freezeDragging.value &&
    !axisMoveDrag.value &&
    getSelectionMode(selection.value) === "cells"
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit("flashFill");
    return;
  }

  if (
    !selectionReadOnly.value &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "d" || event.key.toLowerCase() === "r")
  ) {
    event.preventDefault();
    fillSelection(event.key.toLowerCase() === "d" ? "down" : "right");
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
    if (!selectionReadOnly.value) emit("clearCells", getSelectionRange(selection.value));
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

  if (
    event.key === "F2" &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    getSelectionMode(selection.value) === "cells"
  ) {
    event.preventDefault();
    emit("editNote", layout.value.getAnchorForAddress(activeCell.value));
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
  ensureGridExtentContains(nextViewState.selection.active);
  ensureGridExtentContains(nextViewState.selection.anchor);
  ensureGridExtentContains(nextViewState.selection.focus);
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
    return finishEdit(undefined, false);
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
    if (!(editSession.state.active && editSession.state.surface === "formula-bar")) {
      focusEditor();
    }
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
  updateViewportSize();
  restoreViewState(props.viewState);
  observeViewport();
  focusEditor();
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
});

watch(horizontalScrollState, (state) => emit("horizontalScrollChange", state), {
  immediate: true,
  flush: "post",
});

onBeforeUnmount(() => {
  floatingClipboard.clear();
  stopObservingViewport();
  stopGeometryWatching();
  stopDragSelection();
  stopFormulaReferenceDrag();
  stopDimensionResize();
  clearHyperlinkPointerGesture();
  cancelNotePreviewLeave();
  clearPendingClipboard();
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
});

defineExpose({
  getPictureFrameContext: (sheet: Sheet) =>
    props.sheet === sheet ? pictureFrameContext.value : undefined,
  previewSelectedPicture: () => {
    const image = props.sheet.floatingImages.find((entry) => entry.id === selectedImageId.value);
    if (image) openImagePreview(image);
  },
  selectFloatingImages: (ids: string[]) => {
    selectedImageIds.value = expandFloatingImageSelection(ids);
    selectedImageId.value =
      [...ids].reverse().find((id) => selectedImageIds.value.includes(id)) ?? null;
  },
  arrangePictures: (
    ids: string[],
    action: Parameters<NonNullable<typeof imageLayerRef.value>["arrangeImages"]>[1],
  ) => imageLayerRef.value?.arrangeImages(ids, action),
  cropImage: () => imageLayerRef.value?.startCrop(),
  rotateImage: (turns: -1 | 1 | 2) => imageLayerRef.value?.rotateImage(turns),
  flipImage: (axis: "horizontal" | "vertical") => imageLayerRef.value?.flipImage(axis),
  restoreImage: () => imageLayerRef.value?.restoreImage(),
  fillSelection,
  clearClipboard,
  flushPendingEdit,
  focusGrid: focusEditor,
  handleReferenceKeydown,
  hasPendingEdit,
  navigateToCell,
  navigateToRange,
  selectFloatingImage,
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
    role="grid"
    :aria-label="t('grid.worksheet', { name: sheet.name })"
    :aria-readonly="cellReadOnly"
    :data-sheet-view="viewMode"
    :data-page-count="pagination?.pageCount"
    :aria-rowcount="renderExtent.rowCount"
    :aria-colcount="renderExtent.columnCount"
    aria-multiselectable="true"
    @wheel="onWheel"
    @keydown.capture="onGridKeydown"
    @copy.capture="onImageCopy"
    @cut.capture="onImageCut"
    @paste.capture="onImagePaste"
  >
    <SheetFreezeHandles
      v-if="quickToolsAvailable"
      :key="`${sheet.id}:${scale}`"
      :layout="layout"
      :header-size="headerSize"
      :root-element="rootRef"
      :disabled="Boolean(axisMoveDrag)"
      @freeze-change="emit('freezeChange', $event)"
      @drag-change="freezeDragging = $event"
      @preview-change="freezePreview = $event"
      @visual-state-change="freezeHandleState = $event"
    />
    <div
      ref="scrollerRef"
      :id="gridId"
      class="sheet-grid__scroller"
      :class="{
        'has-external-horizontal-scrollbar': externalHorizontalScrollbar,
      }"
      @scroll="onScroll"
    >
      <div class="sheet-grid__canvas" :style="gridCanvasStyle" />
    </div>
    <SheetSurface
      ref="surfaceRef"
      :display="display"
      :geometry="geometry"
      :rows="rowVisibility"
      :frame="renderFrame"
      :environment="environment"
      :page-view="pageView"
      :page-break-guides="pageBreakGuides"
      :headers="headerPaintState"
      :overlays="overlayState"
      :paint-images="paintSurfaceImages"
      :active-cell="activeCell"
      :editing="isEditing"
      :error-cells="errorCells"
      :error-indicator-color="errorIndicatorColor"
      :label="headerLabel"
      :cursor="surfaceCursor"
      :title="hoveredHyperlink?.title"
      :show-grid-lines="showGridLines"
      :locale="locale"
      :date-system="dateSystem"
      :image-asset-urls="imageAssetUrls"
      :loading-image-asset-ids="loadingImageAssetIds"
      :page-decoration="sheet.pageDecoration"
      @pointerdown="onSurfacePointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerleave="onSurfacePointerLeave"
      @double-click="onSurfaceDoubleClick"
      @contextmenu="onSurfaceContextMenu"
      @keydown="onSurfaceKeydown"
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
    </SheetSurface>
    <PageHeaderFooterOverlay
      v-if="viewMode === 'page-layout' && pageView && showPageWhiteSpace"
      :state="pageView"
      :frame="renderFrame"
      :setup="pageSetup"
      :sheet-name="sheet.name"
      :disabled="readOnly"
      :page-count="pagination?.pageCount ?? 0"
      :file-name="fileName ?? t('pageLayout.unnamedWorkbook')"
      @open="emit('openHeaderFooter', $event)"
    />
    <PageLayoutRulers
      v-if="viewMode === 'page-layout' && pageView && showPageRulers"
      :state="pageView"
      :frame="renderFrame"
      :unit="pageRulerUnit"
      :setup="pageSetup"
      :selection="selectedRange"
      :active-margin="pageMarginDrag.activeMargin.value"
      :drag-point="pageMarginDrag.pointerPosition.value"
      :disabled="readOnly"
      :print-scale="pageUiScale"
      :label="t('pageLayout.rulers')"
      @margin-start="pageMarginDrag.start"
      @margin-adjust="adjustPageMargin"
    />
    <PageLayoutMargins
      v-if="
        viewMode === 'page-layout' &&
        pageView &&
        (showPageMargins || pageMarginDrag.activeMargin.value)
      "
      :state="pageView"
      :frame="renderFrame"
      :setup="pageSetup"
      :disabled="readOnly"
      :active-margin="pageMarginDrag.activeMargin.value"
      :drag-point="pageMarginDrag.pointerPosition.value"
      :unit="pageRulerUnit"
      :show-handles="showPageMargins"
      :show-drag-value="!showPageRulers"
      @start="pageMarginDrag.start"
      @adjust="adjustPageMargin"
    />
    <PageWhiteSpaceControls
      v-if="viewMode === 'page-layout' && pageView"
      :state="pageView"
      :frame="renderFrame"
      @toggle="emit('update:showPageWhiteSpace', !showPageWhiteSpace)"
    />
    <PivotReportFilters
      v-if="workbook"
      :tables="sheet.pivotTables ?? []"
      :workbook="workbook"
      :revision="workbookRevision ?? 0"
      :layout="layout"
      :body="renderFrame.body"
      :disabled="
        readOnly && (!sheet.properties.protected || !canUseSheetPermission(sheet, 'pivotTables'))
      "
      @update="emit('updatePivot', $event)"
      @settings="
        (id, index) => {
          const table = sheet.pivotTables?.find((table) => table.id === id);
          if (table) navigateToCell(table.anchor);
          emit('configurePivotFilter', id, index);
        }
      "
    />
    <PivotEmptyReports
      :tables="sheet.pivotTables ?? []"
      :layout="layout"
      :body="renderFrame.body"
      :active-address="activeCell"
      @select="
        (id) => {
          const table = sheet.pivotTables?.find((table) => table.id === id);
          if (table) {
            navigateToCell(table.anchor);
            emit('configurePivot', id);
          }
        }
      "
    />
    <SheetCellNotice
      v-if="inputError"
      tone="warning"
      data-sheet-input-error-notice
      :frame="renderFrame"
      :address="inputError.address"
      :title="inputError.title"
      :message="inputError.message"
      :close-label="t('dataTools.duplicates.closeRejection')"
      @close="emit('dismissInputError')"
    />
    <SheetCellErrorMenu
      :frame="renderFrame"
      :description="activeCellError"
      :active-cell="activeCell"
      :visible="
        !isEditing &&
        !referenceEditor?.editingFormula &&
        !!errorCells?.has(`${activeCell.row}:${activeCell.column}`)
      "
      :read-only="readOnly"
      @convert-number="emit('convertCellToNumber')"
      @convert-number-batch="emit('convertSelectionToNumber')"
      @correct-sheet="emit('correctSheetErrors')"
      @ignore="emit('ignoreSelectedCellErrors')"
      @ignore-all="emit('ignoreAllCellErrors')"
      @edit-formula-bar="emit('editErrorInFormulaBar')"
      @options="emit('errorCheckOptions')"
    />
    <SheetDataControls
      :frame="renderFrame"
      :filter-range="sheet.filter?.advanced ? undefined : sheet.filter?.range"
      :filtered-columns="sheet.filter?.columns.map((entry) => entry.column)"
      :table-filters="tableFilters"
      :active-cell="activeCell"
      :validation-info="validationInfo"
      :suppress-validation-prompt="!!inputError"
      :outline-groups="sheet.outlineGroups ?? []"
      :subtotal-summary-below="subtotalSummaryBelow"
      :outline-control-offset="quickToolsGutter"
      :show-outline="showHeaders"
      :read-only="readOnly"
      :content-read-only="cellReadOnly"
      :filter-read-only="filterReadOnly"
      @filter-column-request="emit('filterColumnRequest', $event)"
      @validation-choose="emit('validationChoose', $event)"
      @outline-toggle="emit('outlineToggle', $event)"
      @outline-level="emit('outlineLevel', $event)"
    />
    <button
      v-if="fillHandlePoint"
      type="button"
      class="sheet-grid__fill-handle"
      :style="fillHandleStyle"
      :aria-label="t('autoFill.handle')"
      :title="t('autoFill.handle')"
      tabindex="-1"
      data-sheet-fill-handle
      @pointerdown="startFillDrag"
      @dblclick="doubleClickFill"
      @contextmenu.prevent.stop
    />
    <SheetAutoFillOptions
      v-if="fillSession && fillOptionsPosition"
      :position="fillOptionsPosition"
      :visible="true"
      :current-mode="fillSession.mode"
      :available-modes="fillSession.availableModes"
      :scale="scale"
      @select="selectFillMode"
    />
    <span v-if="fillPreviewLabel" class="ui-visually-hidden" role="status">{{
      fillPreviewLabel
    }}</span>
    <div
      class="sheet-grid__image-controls"
      :style="{
        left: `${headerSize.width}px`,
        top: `${headerSize.height}px`,
        width: `${viewportSize.width}px`,
        height: `${viewportSize.height}px`,
      }"
    >
      <SheetDrawingLayer
        @control-change="(id, value) => emit('changeControl', id, value)"
        :key="sheet.id"
        :drawings="sheet.drawings ?? []"
        :theme="theme"
        :image-asset-urls="imageAssetUrls"
        :locale="locale"
        :date-system="dateSystem"
        :sheet="sheet"
        :evaluator="sheetEvaluator"
        :revision="workbookRevision"
        :layout="layout"
        :scale="scale"
        :read-only="objectsReadOnly"
        @select="selectFloatingImage(null)"
        @update="emit('updateDrawing', $event)"
        @delete="emit('deleteDrawing', $event)"
        @edit="emit('editDrawing', $event)"
      />
      <SheetFloatingImageLayer
        :preview-on-double-click="imagePreviewOnDoubleClick ?? true"
        ref="imageLayerRef"
        @paint-state-change="imagePaintState = $event"
        :scale="scale"
        :images="sheet.floatingImages"
        :owner="sheet"
        :apply-update-many="applyFloatingImageMove"
        :effects="drawingThemeEffects"
        :layout="layout"
        :frame-context="pictureFrameContext"
        :asset-urls="resolvedImageUrls"
        :loading-asset-ids="loadingImageAssetIds"
        :missing-asset-ids="missingImageAssetIds"
        :selected-image-id="selectedImageId"
        :selected-image-ids="selectedImageIds"
        @update-many="emit('updateFloatingImages', $event)"
        @group="emit('groupFloatingImages', $event)"
        @feedback="emit('imageFeedback', $event)"
        :read-only="objectsReadOnly"
        @select="selectFloatingImage"
        @update="emit('updateFloatingImage', $event)"
        @delete="deleteSelectedFloatingImage"
        @convert-to-cell="convertSelectedFloatingImageToCell"
        @preview="openImagePreview"
        @copy="requestFloatingImageCopy($event, 'copy')"
        @cut="requestFloatingImageCopy($event, 'cut')"
        @paste="requestFloatingImagePaste"
      />
    </div>
    <SheetAxisContextMenu
      v-if="axisContextMenu"
      :axis="axisContextMenu.axis"
      :state="contextMenuState"
      :sheet="sheet"
      :range="selectedRange"
      :paste-special-disabled="clipboardMode === 'cut'"
      :paste-formats-disabled="!canPasteFormats"
      :cut-disabled-reason="
        cutDisabledReason ? t(CLIPBOARD_MESSAGE_KEYS[cutDisabledReason]) : undefined
      "
      @action="requestContextAction"
      @cut="requestAxisClipboard('cut')"
      @copy="requestAxisClipboard('copy')"
      @paste="requestAxisClipboard('paste')"
      @paste-values="requestAxisClipboard('paste-values')"
      @paste-formats="requestAxisClipboard('paste-formats')"
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
      :dimension-read-only="dimensionReadOnly(axisContextMenu.axis)"
      :insert-read-only="axisOperationReadOnly(axisContextMenu.axis, 'insert')"
      :delete-read-only="axisOperationReadOnly(axisContextMenu.axis, 'delete')"
      @insert="requestAxisInsert"
      @resize="requestAxisResize"
      @delete="requestAxisDelete"
      @clear="requestAxisClear"
      @close="closeAxisContextMenu"
    />
    <SheetCellContextMenu
      v-if="cellContextMenu"
      :anchor="cellContextMenu.anchor"
      :state="contextMenuState"
      :sheet="sheet"
      :range="selectedRange"
      @action="requestContextAction"
      :group-pivot-field="Boolean(contextPivotGroup)"
      :ungroup-pivot-field="
        Boolean(
          contextPivotGroup?.table.groups?.some(
            (group) => group.field === contextPivotGroup?.field,
          ),
        )
      "
      @group-pivot-field="requestPivotGroup(false)"
      @ungroup-pivot-field="requestPivotGroup(true)"
      :show-pivot-details="Boolean(contextPivotDetails)"
      @show-pivot-details="requestPivotDetails"
      :has-image="Boolean(cellContextMenu.imageAddress)"
      :has-note="
        Boolean(
          sheet.cells.get(
            `${cellContextMenu.noteAddress.row}:${cellContextMenu.noteAddress.column}`,
          )?.note,
        )
      "
      :read-only="readOnly"
      :content-read-only="selectionReadOnly"
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
      @edit-note="requestCellNote('edit')"
      @delete-note="requestCellNote('delete')"
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
    <SheetNotePreview
      v-for="preview in visibleNotes"
      :key="preview.key"
      ref="notePreviewRefs"
      :address="preview.address"
      :origin="preview.origin"
      :scale="scale"
      :note="preview.note"
      :draft="preview.draft"
      :error="preview.draft ? noteError : undefined"
      :read-only="objectsReadOnly"
      @enter="cancelNotePreviewLeave"
      @leave="scheduleNotePreviewLeave"
      @edit="emit('editNote', $event)"
      @save="emit('saveNote', $event)"
      @cancel="emit('cancelNote')"
      @update-box="emit('updateNoteBox', $event)"
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
  background: var(--sheetcraft-surface-panel);

  &.is-resizing-column {
    cursor: col-resize;
  }

  &.is-resizing-row {
    cursor: row-resize;
  }

  &.is-moving-axis {
    cursor: grabbing;
  }

  &__scroller {
    position: absolute;
    inset: var(--sheet-column-header-height) 0 0 var(--sheet-row-header-width);
    overflow: auto;
    background: var(--sheetcraft-surface-panel);
    outline: none;
    scrollbar-color: var(--sheetcraft-border-control) var(--sheetcraft-sheet-bar-surface);
    scrollbar-width: auto;

    @supports selector(::-webkit-scrollbar) {
      scrollbar-color: auto;
    }

    &::-webkit-scrollbar {
      width: calc(16px / var(--sheet-scale, 1));
      height: calc(16px / var(--sheet-scale, 1));
    }

    &::-webkit-scrollbar-track {
      background: var(--sheetcraft-sheet-bar-surface);
    }

    &::-webkit-scrollbar-thumb {
      border: calc(4px / var(--sheet-scale, 1)) solid var(--sheetcraft-sheet-bar-surface);
      border-radius: 999px;
      background: var(--sheetcraft-sheet-bar-thumb);

      &:hover {
        background: var(--sheetcraft-sheet-bar-thumb-hover);
      }
    }

    &.has-external-horizontal-scrollbar {
      overflow-x: hidden;
    }
  }

  &__canvas {
    position: relative;
  }

  &__image-controls {
    position: absolute;
    z-index: 6;
    pointer-events: none;
  }

  &__fill-handle {
    position: absolute;
    z-index: 8;
    display: grid;
    place-items: center;
    width: calc(12px / var(--sheet-scale, 1));
    height: calc(12px / var(--sheet-scale, 1));
    padding: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
    touch-action: none;

    &::after {
      width: calc(6px / var(--sheet-scale, 1));
      height: calc(6px / var(--sheet-scale, 1));
      border: calc(1px / var(--sheet-scale, 1)) solid var(--sheetcraft-surface-panel);
      background: var(--sheetcraft-action-primary);
      content: "";
    }
  }
}
</style>
