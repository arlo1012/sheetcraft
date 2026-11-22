<script setup lang="ts">
import type {
  EquationEditSnapshot,
  EquationEditCallbacks,
} from "../../sheet-drawings/equation/useEquationEditSession";
import type { PictureContextSourceAction } from "../../sheet-images/picture-context-source-action";
import { captureCellPictureSourcePresentation } from "../../sheet-images/cell-picture-presentation";
import { isFramedCellImage } from "@sheetcraft/core/cell-picture-frame";
import { canEditPictureRoot, canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { arePictureObjectsEqual, isFramedPictureObject } from "@sheetcraft/core/picture-object";
import {
  createPictureViewMetrics,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
const PivotReportFilters = defineAsyncComponent(
  () => import("../../pivot-tables/components/PivotReportFilters.vue"),
);
import { isPivotValueCell, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
const PivotEmptyReports = defineAsyncComponent(
  () => import("../../pivot-tables/components/PivotEmptyReports.vue"),
);
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartElementSelection } from "../../charts/chart-format-selection";
import type { ChartFormatTarget } from "../../charts/chart-format-pane";
import type { ChartLayoutPreview } from "../../charts/chart-layout-preview";
import type { TextBoxReferenceResolver } from "../../sheet-drawings/textbox-reference-display";
import SheetDrawingLayer from "../../sheet-drawings/components/SheetDrawingLayer.vue";
const SheetFreeShapeCreationLayer = defineAsyncComponent(
  () => import("../../sheet-drawings/components/SheetFreeShapeCreationLayer.vue"),
);
const SheetShapeCreationLayer = defineAsyncComponent(
  () => import("../../sheet-drawings/components/SheetShapeCreationLayer.vue"),
);
import type { ShapeCreationRequest } from "../../sheet-drawings/useShapeCreation";
import type { ShapeCanvasTextEditRequest } from "../../sheet-drawings/shape-canvas-text-edit-contract";
import type {
  ShapeTextEditSnapshot,
  ShapeTextEditCallbacks,
} from "../../sheet-drawings/useShapeTextEditSession";
import type {
  SheetGraphicDrawing,
  SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { canEditCell, canEditRange, canSelectCell, canUseSheetPermission } from "@sheetcraft/core";
import {
  computed,
  defineAsyncComponent,
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
const PageHeaderFooterOverlay = defineAsyncComponent(
  () => import("../../page-layout/components/PageHeaderFooterOverlay.vue"),
);
import { usePageBreakDrag } from "../../page-layout/usePageBreakDrag";
import { usePageMarginDrag } from "../../page-layout/usePageMarginDrag";
import { adjustSheetPageMargin } from "@sheetcraft/sheet-engine/page-layout";
import {
  PAGE_LAYOUT_RULER_SIZE,
  type PageLayoutRulerUnit,
} from "../../page-layout/page-layout-ruler";
const PageLayoutRulers = defineAsyncComponent(
  () => import("../../page-layout/components/PageLayoutRulers.vue"),
);
const PageLayoutMargins = defineAsyncComponent(
  () => import("../../page-layout/components/PageLayoutMargins.vue"),
);
const PageWhiteSpaceControls = defineAsyncComponent(
  () => import("../../page-layout/components/PageWhiteSpaceControls.vue"),
);
import type { HeaderFooterEditTarget } from "../../page-layout/header-footer-editor";
import { columnIndexToLabel, getCellAddressLabel } from "@sheetcraft/core/coordinates";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { normalizeSheetZoom } from "../../../shared/sheet-view/zoom";
import { getSelectionFitZoom } from "../selection-zoom";
import { createSheetGridEditorKeydownHandler } from "../useSheetGridEditorKeydown";
import { useSheetGridPictureClipboard } from "../useSheetGridPictureClipboard";
import { useSheetGridPictureSelection } from "../useSheetGridPictureSelection";
import { useSheetGridPictureEditing } from "../composables/useSheetGridPictureEditing";
import { useSheetGridImagePreview } from "../composables/useSheetGridImagePreview";
import { useSheetGridSurfaceInteraction } from "../composables/useSheetGridSurfaceInteraction";
import {
  useSheetGridContextMenus,
  type AxisContextMenuState,
  type CellContextMenuState,
} from "../composables/useSheetGridContextMenus";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import type {
  CellEditFinishOptions,
  CellEditSession,
  CellEditCommit,
} from "../../../shared/cell-editing/useCellEditSession";
import type { FormulaReferenceToken } from "../../../shared/formula-editing/formula-reference-tokens";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import { restoreFocusAfterRemount } from "../../../shared/floating/useDismissibleFloatingPanel";
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
  getDefaultRowHeight,
  type FloatingImage,
  type CellAddress,
  type CellNoteBox,
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
const PictureColorPickLayer = defineAsyncComponent(
  () => import("../../sheet-images/components/PictureColorPickLayer.vue"),
);
import SheetOwnedPictureGroupLayer from "../../sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import type { PictureAlignmentReference } from "../../sheet-images/usePictureTools";
const SheetPictureAdjustmentHandles = defineAsyncComponent(
  () => import("../../sheet-images/components/SheetPictureAdjustmentHandles.vue"),
);
import type SheetPictureCropOverlayType from "../../sheet-images/components/SheetPictureCropOverlay.vue";
const SheetPictureCropOverlay = defineAsyncComponent(
  () => import("../../sheet-images/components/SheetPictureCropOverlay.vue"),
);
import type PictureCropToolbarType from "../../sheet-images/components/PictureCropToolbar.vue";
const PictureCropToolbar = defineAsyncComponent(
  () => import("../../sheet-images/components/PictureCropToolbar.vue"),
);
import { resolveOwnedPictureNode } from "../../sheet-images/picture-group-interaction";
const SheetImagePreview = defineAsyncComponent(
  () => import("../../sheet-images/components/SheetImagePreview.vue"),
);
import type SheetNotePreviewType from "./SheetNotePreview.vue";
const SheetNotePreview = defineAsyncComponent(() => import("./SheetNotePreview.vue"));
import { useFloatingImageClipboard } from "../../sheet-images/useFloatingImageClipboard";
import { useOwnedPictureClipboard } from "../../sheet-images/useOwnedPictureClipboard";
import { createBrowserGridClipboardPort } from "../gridClipboardPort";
import { captureFloatingImageGroup } from "@sheetcraft/sheet-engine/floating-image-group";
import CellEditor from "./CellEditor.vue";
const SheetAxisContextMenu = defineAsyncComponent(() => import("./SheetAxisContextMenu.vue"));
import SheetFreezeHandles from "./SheetFreezeHandles.vue";
const SheetCellContextMenu = defineAsyncComponent(() => import("./SheetCellContextMenu.vue"));
import SheetCellErrorMenu, { type CellErrorDescription } from "./SheetCellErrorMenu.vue";
import SheetCellNotice from "./SheetCellNotice.vue";
import SheetSurface from "./SheetSurface.vue";
const SheetAutoFillOptions = defineAsyncComponent(() => import("./SheetAutoFillOptions.vue"));
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
import { createSheetRenderFrame } from "../rendering/sheet-render-frame";
import { useSheetRenderEnvironment } from "../rendering/useSheetRenderEnvironment";
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
    applyPictureCollectionChange?: (images: readonly FloatingImage[]) => boolean;
    pictureOwnerGeneration?: number;
    canConvertPictureToCell?: (id: string, path?: PictureGroupPath) => boolean;
    applyPictureToCell?: (id: string, path?: PictureGroupPath) => boolean;
    applyOwnedPictureDelete?: (paths: readonly PictureGroupPath[], owner: Sheet) => boolean;
    applyPictureUngroup?: (ids: readonly string[], owner: Sheet) => boolean;
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
    pictureAlignmentReference?: PictureAlignmentReference;
    pictureSourceBusy?: boolean;
    restorePictureOriginal?: () => boolean;
    canRestorePictureOriginal?: boolean;
    loadingImageAssetIds?: ReadonlySet<string>;
    missingImageAssetIds?: ReadonlySet<string>;
    readOnly?: boolean;
    shapeCreationRequest?: ShapeCreationRequest;
    applyDrawingUpdate?: (drawing: SheetDrawing, expected: SheetDrawing) => boolean;
    applyDrawingCollection?: (
      drawings: readonly SheetDrawing[],
      expected: readonly SheetDrawing[],
      metrics?: import("@sheetcraft/core/picture-axis-metrics").PictureSheetMetrics,
      guard?: () => boolean,
    ) => boolean;
    shapeCreationCommit?: (
      request: ShapeCreationRequest,
      drawing: import("../../sheet-drawings/useShapeCreation").ShapeCreationDraft,
    ) => boolean;
    shapeCreationCancel?: (request: ShapeCreationRequest) => void;
    copyShapeObjects?: (
      paths: readonly import("@sheetcraft/core/shape-group").ShapeGroupPath[],
    ) => boolean;
    cutShapeObjects?: (
      paths: readonly import("@sheetcraft/core/shape-group").ShapeGroupPath[],
    ) => boolean;
    pasteShapeObjects?: () => boolean;
    canPasteShapeObjects?: boolean;
    captureClipboardCopy?: () => () => void;
    equationPlaceholdersHidden?: boolean;
    equationEditSnapshot?: EquationEditSnapshot;
    chartLayoutPreview?: ChartLayoutPreview;
    chartElementSelection?: ChartElementSelection;
    equationEditCallbacks?: EquationEditCallbacks;
    ownsSelectedShapeFieldTarget?: (target: EventTarget | null) => boolean;
    shapeTextEditSnapshot?: ShapeTextEditSnapshot | null;
    shapeTextEditCallbacks?: ShapeTextEditCallbacks;
    shapeTextEditStart?: (request: ShapeCanvasTextEditRequest) => boolean;
    shapeTextEditSelection?: { start: number; end: number };
    textBoxReferenceResolver?: TextBoxReferenceResolver;
    openTextBoxReference?: (
      root: SheetDrawing,
      path?: import("@sheetcraft/core/shape-group").ShapeGroupPath,
    ) => boolean;
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
    noteDraft?: {
      address: CellAddress;
      text: string;
      author: string;
      box?: CellNoteBox;
    };
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

// Keep chart data dependencies stable across selection/focus renders. The resolver
// still reads the current workbook so replacement and sheet edits cannot go stale.
function resolveChartSheet(sheetId: string): Sheet | undefined {
  return props.workbook?.sheets.get(sheetId);
}
const emit = defineEmits<{
  updateDrawing: [drawing: SheetDrawing];
  deleteDrawing: [id: string];
  editDrawing: [drawing: SheetDrawing];
  editOwnedShape: [
    root: import("@sheetcraft/core/shape-group").ShapeGroupDrawing,
    path: import("@sheetcraft/core/shape-group").ShapeGroupPath,
  ];
  formatDrawing: [drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing];
  formatShapeGroup: [
    root: import("@sheetcraft/core/shape-group").ShapeGroupDrawing,
    path: import("@sheetcraft/core/shape-group").ShapeGroupPath,
  ];
  selectedShapeGroupChange: [
    rootId: string | null,
    path: import("@sheetcraft/core/shape-group").ShapeGroupPath | null,
  ];
  selectedDrawingChange: [id: string | null];
  selectChartElement: [drawing: SheetChartDrawing, target: ChartFormatTarget, openPane: boolean];
  selectedShapeObjectsChange: [
    paths: readonly import("@sheetcraft/core/shape-group").ShapeGroupPath[],
    owner: Sheet,
  ];
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
  selectedOwnedPicturePathChange: [path: PictureGroupPath | null, owner: Sheet];
  formatOwnedPicture: [path: PictureGroupPath, owner: Sheet, paint?: "fill" | "line"];
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
  pictureAlignmentReference: [reference: PictureAlignmentReference];
  pictureSourceAction: [action: PictureContextSourceAction, path: PictureGroupPath, owner: Sheet];
  pasteImageFile: [file: File, mode: ImageInsertMode, address?: CellAddress];
  pasteFloatingImage: [image: FloatingImage, mode: ImageInsertMode, address?: CellAddress];
  pasteFloatingImages: [images: readonly FloatingImage[], address: CellAddress];
  commitCell: [payload: CellEditCommit];
  clearCells: [range: CellRange];
  clipboardFeedback: [feedback: GridClipboardFeedback];
  clipboardCopy: [];
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
  editHyperlink: [];
  removeHyperlink: [address: CellAddress];
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
const headingOrigin = computed(() => ({
  x: rulerInset.value,
  y: rulerInset.value,
}));
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

const outlineHiddenRowSnapshot = computed<{
  sheet: Sheet;
  generation: number | undefined;
  intervals: ReturnType<typeof createSheetHiddenRowIntervals>;
}>((previous) => {
  const sheet = props.sheet;
  const generation = props.pictureOwnerGeneration;
  const intervals = createSheetHiddenRowIntervals(sheet, sheetEvaluator.value);
  // Evaluator refreshes must not invalidate immutable geometry leases when the
  // normalized visible-row union has not changed.
  if (
    previous?.sheet === sheet &&
    previous.generation === generation &&
    previous.intervals.length === intervals.length &&
    intervals.every(
      (interval, index) =>
        interval.start === previous.intervals[index]!.start &&
        interval.end === previous.intervals[index]!.end,
    )
  )
    return previous;
  return { sheet, generation, intervals };
});
const outlineHiddenRows = computed(() => outlineHiddenRowSnapshot.value.intervals);
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
const selectedOwnedPicturePath = shallowRef<PictureGroupPath | null>(null);
watch(selectedOwnedPicturePath, (path) =>
  emit("selectedOwnedPicturePathChange", path ? [...path] : null, props.sheet),
);
watch(selectedImageId, (id) => {
  if (!id) {
    selectedImageIds.value = [];
    selectedOwnedPicturePath.value = null;
  }
});
watch([selectedImageId, selectedImageIds], ([id, ids]) =>
  emit("selectedFloatingImageChange", id, [...ids]),
);
const selection = shallowRef<CellSelection>(createCellSelection({ row: 0, column: 0 }));
const {
  imagePreview,
  previewUrl,
  openImagePreview,
  openFloatingImagePreview,
  canPreviewPicture,
  previewSelectedPicture,
  imagePreviewClose,
} = useSheetGridImagePreview({
  getSheet: () => props.sheet,
  getPictureOwnerGeneration: () => props.pictureOwnerGeneration,
  getWorkbookRevision: () => props.workbookRevision,
  getImageAssetUrls: () => props.imageAssetUrls,
  selectedImageId,
  selectedImageIds,
  selectedOwnedPicturePath,
  isPictureCropActive: () => pictureCrop.active.value,
  getPictureFrameContext: () => pictureFrameContext.value,
  focusEditor: () => focusEditor(),
  onImageFeedback: (key) => emit("imageFeedback", key),
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
  getDefaultRowHeight: () => getDefaultRowHeight(props.sheet),
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
    defaultRowHeight: getDefaultRowHeight(props.sheet),
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
    defaultFontFamily: defaultFontFamily.value,
    measurementVersion: fontMetricsVersion.value,
  });
});

const effectiveRowHeightSnapshot = computed<{
  sheet: Sheet;
  generation: number | undefined;
  heights: Map<number, number>;
}>((previous) => {
  const sheet = props.sheet;
  const generation = props.pictureOwnerGeneration;
  const rowHeights = mergeRowHeightOverrides(automaticRowHeights.value, props.sheet.rowHeights);
  const resize = dimensionResize.value;
  if (resize?.axis === "row") {
    rowHeights.set(resize.index, resize.previewSize);
  }
  // Reconciliation can allocate an equal Map after a drawing-only revision.
  // Retain the immutable effective geometry, not the document/evaluator lease.
  if (
    previous?.sheet === sheet &&
    previous.generation === generation &&
    previous.heights.size === rowHeights.size &&
    [...rowHeights].every(([row, height]) => previous.heights.get(row) === height)
  )
    return previous;
  return { sheet, generation, heights: rowHeights };
});
const effectiveRowHeights = computed(() => effectiveRowHeightSnapshot.value.heights);
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
const shapeDrawingLayerRef = ref<InstanceType<typeof SheetDrawingLayer>>();
const selectedShapeDrawingId = ref<string | null>(null);
watch(selectedShapeDrawingId, (id) => emit("selectedDrawingChange", id), { flush: "sync" });
watch(
  () => props.sheet,
  () => {
    // Drawing IDs are sheet-local; a same-ID drawing on another sheet is a new owner.
    selectedShapeDrawingId.value = null;
  },
  { flush: "sync" },
);
watch(
  () => props.shapeCreationRequest,
  (next, previous) => {
    const focused = document.activeElement;
    if (
      !previous ||
      next ||
      !(focused instanceof Element) ||
      !focused.closest("[data-shape-creation-layer]")
    )
      return;
    void nextTick(() => {
      if (
        !props.shapeCreationRequest &&
        (document.activeElement === document.body || document.activeElement === focused)
      )
        editorRef.value?.focus();
    });
  },
);

const objectsReadOnly = computed(
  () =>
    props.readOnly &&
    (!props.sheet.properties.protected || !canUseSheetPermission(props.sheet, "editObjects")),
);
const pictureLayerReadOnly = computed(() => props.readOnly && !props.sheet.properties.protected);
function pictureRootAvailable(root: FloatingImage): boolean {
  void props.workbookRevision;
  const live = props.sheet.floatingImages.find((image) => image.id === root.id);
  return !!live && canEditPictureRoot(props.sheet, live);
}
const pictureSelectionReadOnly = computed(
  () => pictureLayerReadOnly.value || !canEditPictureSelection(props.sheet, selectedImageIds.value),
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
  return {
    rowBreaks: pages.layoutRowBreaks,
    columnBreaks: pages.layoutColumnBreaks,
  };
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
      pageProjection.value?.getVisiblePages({
        x: scroll.x,
        y: scroll.y,
        ...viewportSize,
      }) ?? pages.getVisiblePages({ x: scroll.x, y: scroll.y, ...viewportSize }, props.viewMode),
    printRect: {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    },
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
  getSurfacePoint: (event) => surfacePoint(event),
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
  getSurfacePoint: (event) => surfacePoint(event),
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
const ownedImageLayerRef = ref<InstanceType<typeof SheetOwnedPictureGroupLayer>>();
const imagePaintStates = shallowRef<{
  standalone?: FloatingImagePaintState;
  owned?: FloatingImagePaintState;
}>({});
const imagePaintRevision = ref(0);
function acceptPicturePaintState(
  layer: "standalone" | "owned",
  state: FloatingImagePaintState,
): void {
  imagePaintStates.value = { ...imagePaintStates.value, [layer]: state };
  imagePaintRevision.value++;
}
const standalonePictures = computed(() =>
  props.sheet.floatingImages.filter((image) => !isPictureGroup(image)),
);
const floatingImageCache = createFloatingImageCanvasCache(() => surfaceRef.value?.invalidate());
const drawingThemeEffects = computed(() => getDrawingThemeEffects(props.theme));
const pictureViewMetrics = computed(() =>
  createPictureViewMetrics(props.sheet, baseGeometry.value, baseRows.value, {
    effectiveRowHeights: effectiveRowHeights.value,
  }),
);
const pictureFrameContext = computed<PictureFrameLayoutContext | undefined>(() => {
  // Paper gaps require a distinct projection; never feed them into continuous metrics.
  if (props.viewMode === "page-layout") return undefined;
  return {
    layout: layout.value,
    metrics: pictureViewMetrics.value,
  };
});
const cropOverlayRef = ref<InstanceType<typeof SheetPictureCropOverlayType>>();
const cropToolbarRef = ref<InstanceType<typeof PictureCropToolbarType>>();
const {
  pictureCrop,
  stopCropPointer,
  finishPictureCrop,
  startPictureCrop,
  openCropContextMenu,
  startPictureCropGesture,
  startPictureShapeAdjustment,
  nudgePictureShapeAdjustment,
  pictureAdjustmentView,
  onPictureCropKeydown,
  cropControls,
  cropToolbarAnchor,
  pictureTransparentColor,
} = useSheetGridPictureEditing({
  getSheet: () => props.sheet,
  getTheme: () => props.theme,
  getGeneration: () => props.pictureOwnerGeneration ?? 0,
  getRevision: () => props.workbookRevision ?? 0,
  isPictureSourceBusy: () => Boolean(props.pictureSourceBusy),
  pictureFrameContext,
  selectedImageIds,
  selectedOwnedPicturePath,
  pictureSelectionReadOnly,
  drawingThemeEffects,
  layout,
  scale,
  headerSize,
  rootRef,
  cropOverlayRef,
  cropToolbarRef,
  resolvedImageUrls,
  floatingImageCache,
  getImageLayer: () => imageLayerRef.value,
  getOwnedImageLayer: () => ownedImageLayerRef.value,
  applyPictureCollectionChange: (roots) => props.applyPictureCollectionChange?.(roots) === true,
  flushPendingEdit,
  focusEditor,
  onImageFeedback: (key) => emit("imageFeedback", key),
});

watch(
  [() => props.sheet, () => props.sheet.floatingImages, pictureFrameContext],
  () => {
    imagePaintStates.value = {};
    imagePaintRevision.value++;
  },
  { flush: "sync" },
);
const imagePaintState = computed<FloatingImagePaintState>(() => {
  const states = imagePaintStates.value;
  const cropPreview = pictureCrop.previewRoots.value;
  if (cropPreview)
    return {
      images: cropPreview,
      revision: imagePaintRevision.value,
      effects: drawingThemeEffects.value,
    };
  const originals = props.sheet.floatingImages;
  const usable = (state: FloatingImagePaintState | undefined) =>
    state &&
    state.images.length === originals.length &&
    state.images.every((image, index) => image.id === originals[index]?.id)
      ? state
      : undefined;
  const owned = usable(states.owned),
    standalone = usable(states.standalone);
  return {
    images: originals.map((original, index) => {
      const ownedPreview = owned?.images[index];
      if (ownedPreview && !arePictureObjectsEqual(ownedPreview, original)) return ownedPreview;
      const standalonePreview = standalone?.images[index];
      return standalonePreview && !arePictureObjectsEqual(standalonePreview, original)
        ? standalonePreview
        : original;
    }),
    revision: imagePaintRevision.value,
    effects: drawingThemeEffects.value,
  };
});
const paintSurfaceImages = computed(() => {
  const state = imagePaintState.value;
  const currentLayout = layout.value;
  const frameContext = pictureFrameContext.value;
  const assetUrls = resolvedImageUrls.value;
  const imageTheme = props.theme;
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
      theme: imageTheme,
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
    openContextMenu: (axis, index, clientX, clientY, trigger) =>
      openAxisContextMenu(axis, index, clientX, clientY, trigger),
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
            end: {
              row: range.end.row,
              column: renderExtent.value.columnCount - 1,
            },
          }),
          ...layout.value.getRangeFragments({
            start: { row: 0, column: range.start.column },
            end: {
              row: renderExtent.value.rowCount - 1,
              column: range.end.column,
            },
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
const {
  hoveredHyperlink,
  surfaceCursor,
  surfacePoint,
  imagePoint,
  cancelNotePreviewLeave,
  scheduleNotePreviewLeave,
  clearHyperlinkPointerGesture,
  onSurfacePointerDown,
  onSurfacePointerMove,
  onSurfacePointerLeave,
  onSurfaceContextMenu,
  onSurfaceDoubleClick,
  onSurfaceKeydown,
  visibleNotes,
  notePreviewRefs,
  onDocumentPointerDown,
} = useSheetGridSurfaceInteraction({
  getSheet: () => props.sheet,
  getWorkbookRevision: () => props.workbookRevision,
  rootRef,
  scale,
  rulerInset,
  renderFrame,
  layout,
  effectiveFreeze,
  activeCell,
  headerState,
  headerInput,
  getPageMarginDragCursor: () => pageMarginDrag.cursor.value,
  getPageBreakDragCursor: () => pageBreakDrag.cursor.value,
  startPageBreakDrag: (event) => pageBreakDrag.start(event),
  hoverPageBreakDrag: (event) => pageBreakDrag.hover(event),
  clearPageBreakDragHover: () => pageBreakDrag.clearHover(),
  getDimensionResizeAxis: () => dimensionResize.value?.axis,
  isAxisMoveDragActive: () => Boolean(axisMoveDrag.value?.active),
  getOwnedImageLayer: () => ownedImageLayerRef.value,
  getImageLayer: () => imageLayerRef.value,
  isFormatPainterActive: () => Boolean(props.formatPainterActive),
  getReferenceEditor,
  hasActiveShapeTextEdit: () =>
    Boolean(props.shapeTextEditSnapshot && props.shapeTextEditCallbacks?.isActive()),
  commitShapeTextEdit: () => props.shapeTextEditCallbacks?.commit() ?? true,
  flushPendingEquationEdit,
  onCellMouseDown,
  onCellDoubleClick,
  openCellContextMenu: (address, event) => openCellContextMenu(address, event),
  onEditorKeydown: (event) => onEditorKeydown(event),
  onOpenHyperlink: (address) => emit("openHyperlink", address),
  isNotePreviewDisabled: () => Boolean(props.notePreviewDisabled),
  getShowActiveNote: () => Boolean(props.showActiveNote),
  getShowAllNotes: () => Boolean(props.showAllNotes),
  getHiddenNoteKeys: () => props.hiddenNoteKeys,
  getNoteDraft: () => props.noteDraft,
  isEditing: () => isEditing.value,
  isSelectionDragging: () => selectionDragging.value,
  isFreezeDragging: () => freezeDragging.value,
  hasContextMenuOpen: () => Boolean(cellContextMenu.value || axisContextMenu.value),
  isTransparentColorActive: () => Boolean(pictureTransparentColor.session.value),
  cancelTransparentColor: () => pictureTransparentColor.cancel(),
  isPictureCropActive: () => pictureCrop.active.value,
  finishPictureCrop: () => finishPictureCrop(),
});

const activeCellRect = computed(
  () =>
    layout.value.getCellViewportRect(activeCell.value) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
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
  onReadTransfer: (transfer) => {
    floatingClipboard.observeTransfer(transfer);
    ownedClipboard.observeTransfer(transfer, ownedClipboard.getIdentity());
  },
  capturePreparedSelection: () => props.captureClipboardCopy?.(),
  onPreparedSelection: () => {
    floatingClipboard.clear();
    ownedClipboard.clear();
  },
  onPasteTransfer: (transfer, target, kind) => {
    const identity = ownedClipboard.getIdentity();
    if (!identity || transfer.localToken !== identity.token) return false;
    if (kind !== "all") {
      emit("imageFeedback", "clipboard.pasteRejected");
      return true;
    }
    return ownedClipboard.paste(target.active, transfer);
  },
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
  onReadUnavailable: (targetSelection) =>
    ownedClipboard.paste(targetSelection.active) ||
    floatingClipboard.pastePending(targetSelection.active),
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
  onCopy: () => {
    emit("clipboardCopy");
    clearPendingClipboard();
    ownedClipboard.clear();
  },
  onFeedback: (key) => emit("imageFeedback", key),
  onPaste: (image, mode, address) => emit("pasteFloatingImage", image, mode, address),
  onMove: (image) => props.applyFloatingImageMove?.([image]) === true,
});
const ownedClipboard = useOwnedPictureClipboard({
  getSheet: () => props.sheet,
  getRevision: () => props.workbookRevision ?? 0,
  getOwnerGeneration: () => props.pictureOwnerGeneration ?? 0,
  getFrameContext: () => pictureFrameContext.value,
  clipboardPort: browserClipboard,
  execute: (roots) => props.applyPictureCollectionChange?.(roots) === true,
  onCopy: () => {
    emit("clipboardCopy");
    clearPendingClipboard();
    floatingClipboard.clear();
  },
  onFeedback: (key) => emit("imageFeedback", key),
});
watch(
  () => props.sheet,
  () => {
    floatingClipboard.clearCut();
    ownedClipboard.clearCut();
  },
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
    !props.shapeCreationRequest &&
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

const {
  expandFloatingImageSelection,
  selectFloatingImage,
  selectOwnedPicturePath,
  deleteOwnedPicture,
  ungroupOwnedPicture,
  formatOwnedPicture,
  requestPictureSourceAction,
  requestOwnedPictureCopy,
  requestOwnedPicturePaste,
  requiresOwnedClipboard,
  currentOwnedClipboardPaths,
  deleteSelectedFloatingImage,
  convertSelectedFloatingImageToCell,
} = useSheetGridPictureSelection({
  getSheet: () => props.sheet,
  getPictureFrameContext: () => pictureFrameContext.value,
  selectedImageId,
  selectedImageIds,
  selectedOwnedPicturePath,
  getActiveCell: () => activeCell.value,
  setActiveCell,
  isEditing: () => isEditing.value,
  isComposing: () => isComposing.value,
  isReadOnly: () => Boolean(props.readOnly),
  isPictureSourceBusy: () => Boolean(props.pictureSourceBusy),
  isPictureSelectionReadOnly: () => pictureSelectionReadOnly.value,
  isPictureLayerReadOnly: () => pictureLayerReadOnly.value,
  isPictureCropActive: () => pictureCrop.active.value,
  finishPictureCrop,
  finishEdit,
  stopDragSelection,
  clearContextMenus: () => {
    axisContextMenu.value = undefined;
    cellContextMenu.value = undefined;
  },
  focusEditor,
  floatingClipboard,
  ownedClipboard,
  pasteSelection,
  applyOwnedPictureDelete: () => props.applyOwnedPictureDelete,
  applyPictureUngroup: () => props.applyPictureUngroup,
  applyPictureToCell: () => props.applyPictureToCell,
  onDeleteFloatingImages: (ids) => emit("deleteFloatingImages", ids),
  onDeleteFloatingImage: (id) => emit("deleteFloatingImage", id),
  onConvertFloatingImageToCell: (id) => emit("convertFloatingImageToCell", id),
  onFormatOwnedPicture: (path, sheet, paint) => {
    if (paint) emit("formatOwnedPicture", path, sheet, paint);
    else emit("formatOwnedPicture", path, sheet);
  },
  onPictureSourceAction: (action, path, sheet) => emit("pictureSourceAction", action, path, sheet),
  onImageFeedback: (key) => emit("imageFeedback", key),
});

const {
  onImageCopy,
  onImageCut,
  requestFloatingImageCopy,
  requestFloatingImagePaste,
  onImagePaste,
} = useSheetGridPictureClipboard({
  getSheet: () => props.sheet,
  getWorkbookRevision: () => props.workbookRevision,
  getPictureOwnerGeneration: () => props.pictureOwnerGeneration,
  getPictureFrameContext: () => pictureFrameContext.value,
  getActiveCell: () => activeCell.value,
  getSelectedImageId: () => selectedImageId.value,
  isEditing: () => isEditing.value,
  isComposing: () => isComposing.value,
  getEditingValue: () => editingValue.value,
  isPictureCropActive: () => pictureCrop.active.value,
  finishPictureCrop,
  isPictureSelectionReadOnly: () => pictureSelectionReadOnly.value,
  isPictureLayerReadOnly: () => pictureLayerReadOnly.value,
  requiresOwnedClipboard,
  currentOwnedClipboardPaths,
  browserClipboard,
  floatingClipboard,
  ownedClipboard,
  clearPendingClipboard,
  setActiveCell,
  pasteSelection,
  pasteCapturedText,
  finishEdit,
  onEditorInput,
  focusEditor,
  onPasteImageFile: (file, mode, address) => emit("pasteImageFile", file, mode, address),
  onImageFeedback: (key) => emit("imageFeedback", key),
  onClipboardFeedback: (message) => emit("clipboardFeedback", message),
});

watch(
  [
    () => props.sheet,
    () => props.sheet.floatingImages,
    pictureFrameContext,
    () => props.workbookRevision,
  ],
  ([sheet], [previousSheet]) => {
    if (sheet !== previousSheet) {
      selectedImageIds.value = [];
      selectedImageId.value = null;
      selectedOwnedPicturePath.value = null;
      return;
    }
    const path = selectedOwnedPicturePath.value;
    if (path) {
      try {
        const context = pictureFrameContext.value;
        if (
          !context ||
          !resolveOwnedPictureNode(props.sheet.floatingImages, path, context)?.visible
        )
          selectedOwnedPicturePath.value = null;
      } catch {
        selectedOwnedPicturePath.value = null;
      }
    }
    selectedImageIds.value = expandFloatingImageSelection(selectedImageIds.value);
    if (!props.sheet.floatingImages.some((image) => image.id === selectedImageId.value))
      selectedImageId.value = null;
  },
  { flush: "sync" },
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
  if (pictureTransparentColor.session.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      pictureTransparentColor.cancel();
      focusEditor();
    } else if (event.key === "Tab") pictureTransparentColor.cancel();
    return;
  }
  if (
    event.target instanceof Element &&
    event.target.closest("[data-shape-canvas-text-editor], [data-equation-session]")
  )
    return;
  if (pictureCrop.active.value) {
    onPictureCropKeydown(event);
    return;
  }
  if (event.target instanceof Element && event.target.closest("[data-page-header-footer]")) return;
  if (
    event.target instanceof Element &&
    event.target.closest(
      "[data-floating-image-id], [data-owned-picture-selected], [data-sheet-drawing-id], [data-shape-creation-layer]",
    )
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

const {
  isAxisIndexSelected,
  openAxisContextMenu,
  getAxisMaximum,
  requestAxisInsert,
  requestAxisInsertion,
  requestAxisDelete,
  requestAxisResize,
  requestAxisClear,
  closeAxisContextMenu,
  openCellContextMenu,
  openActiveCellContextMenu,
  requestCellClipboard,
  requestAxisClipboard,
  requestContextAction,
  requestCellImageAction,
  hyperlinkEditDisabled,
  requestCellHyperlink,
  requestCellNote,
  requestCellClear,
  contextPivotDetails,
  contextPivotGroup,
  requestPivotGroup,
  requestPivotDetails,
  closeCellContextMenu,
} = useSheetGridContextMenus({
  axisContextMenu,
  cellContextMenu,
  getSheet: () => props.sheet,
  isReadOnly: () => Boolean(props.readOnly),
  selection,
  selectedRange,
  activeCell,
  activeCellRect,
  layout,
  scale,
  rootRef,
  scrollerRef,
  isEditing,
  isComposing,
  selectionReadOnly,
  objectsReadOnly,
  pictureLayerReadOnly,
  dimensionReadOnly,
  axisOperationReadOnly,
  selectAxis,
  setActiveCell,
  focusEditor,
  clearPendingClipboard,
  clearFloatingClipboard: () => floatingClipboard.clear(),
  cutSelection,
  copySelection,
  pasteSelection,
  pasteValuesSelection,
  pasteFormatsSelection,
  openImagePreview,
  onInsertAxis: (payload) => emit("insertAxis", payload),
  onDeleteAxis: (payload) => emit("deleteAxis", payload),
  onResizeDimension: (payload) => emit("resizeDimension", payload),
  onClearCells: (range) => emit("clearCells", range),
  onContextAction: (request) => emit("contextAction", request),
  onConvertCellImageToFloating: (address) => emit("convertCellImageToFloating", address),
  onOpenHyperlink: (address) => emit("openHyperlink", address),
  onEditHyperlink: () => emit("editHyperlink"),
  onRemoveHyperlink: (address) => emit("removeHyperlink", address),
  onEditNote: (address) => emit("editNote", address),
  onDeleteNote: (address) => emit("deleteNote", address),
  onGroupPivotField: (tableId) => emit("groupPivotField", tableId),
  onUngroupPivotField: (tableId) => emit("ungroupPivotField", tableId),
  onShowPivotDetails: (tableId, address) => emit("showPivotDetails", tableId, address),
});

function onCornerClick(): void {
  selectAxis("all", { row: 0, column: 0 }, false);
}

function onCellDoubleClick(address: CellAddress, event: MouseEvent): void {
  // Formula reference picking owns grid gestures while a formula editor is active.
  if (getReferenceEditor()) return;
  const content = getCellContent(props.sheet, address);
  if (content?.kind === "image") {
    event.preventDefault();
    openImagePreview({
      ...content.image,
      ...(isFramedCellImage(content.image)
        ? { frameSource: captureCellPictureSourcePresentation(content.image) }
        : {}),
    });
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

function getPictureSelectionFocusTarget(ids: readonly string[], owner: Sheet): HTMLElement | null {
  if (
    props.sheet !== owner ||
    isEditing.value ||
    isComposing.value ||
    pictureCrop.active.value ||
    pictureSelectionReadOnly.value ||
    selectedOwnedPicturePath.value ||
    !ids.length ||
    ids.length !== selectedImageIds.value.length ||
    !ids.every((id, index) => selectedImageIds.value[index] === id)
  )
    return null;
  // Resolve inside this Grid only. Both kinds already route Delete, arrows and
  // clipboard commands to the full picture selection, unlike the cell editor.
  const candidates = rootRef.value?.querySelectorAll<HTMLElement>(
    "[data-owned-picture-selected]:not([data-passive-outline]), [data-floating-image-selected]",
  );
  return (
    Array.from(candidates ?? []).find((target) =>
      ids.some(
        (id) =>
          target.dataset.floatingImageId === id ||
          target.dataset.ownedPicturePath === JSON.stringify([id]),
      ),
    ) ?? null
  );
}

function handleHistoryShortcut(event: KeyboardEvent): boolean {
  if (isEditing.value) {
    return false;
  }
  const action = getWorkbookHistoryShortcut(event, {
    allowEditableTarget: true,
  });
  if (!action) return false;
  const pictureTarget =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-owned-picture-selected], [data-floating-image-selected]",
        )
      : null;
  const focusedPicture = pictureTarget?.contains(document.activeElement) ? pictureTarget : null;
  const owner = props.sheet,
    generation = props.pictureOwnerGeneration;
  event.preventDefault();
  clearPendingClipboard();
  if (action === "undo") emit("undo");
  else emit("redo");
  if (focusedPicture) {
    const roots = owner.floatingImages;
    restoreFocusAfterRemount(
      focusedPicture,
      () =>
        selectedImageIds.value.length
          ? getPictureSelectionFocusTarget(selectedImageIds.value, owner)
          : rootRef.value?.querySelector<HTMLElement>("textarea.cell-editor"),
      // Undoing Group/Ungroup removes selected overlays. Keep the next shortcut in
      // Grid without stealing focus from a newer control or text editor.
      () =>
        props.sheet === owner &&
        props.pictureOwnerGeneration === generation &&
        owner.floatingImages === roots &&
        !isEditing.value &&
        !isComposing.value &&
        !pictureCrop.active.value &&
        !!rootRef.value?.isConnected,
    );
  }
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

const onEditorKeydown = createSheetGridEditorKeydownHandler({
  rowHeaderWidth: ROW_HEADER_WIDTH,
  getSheet: () => props.sheet,
  getSelection: () => selection.value,
  getSelectedRange: () => selectedRange.value,
  getActiveCell: () => activeCell.value,
  getLayout: () => layout.value,
  getRenderFrame: () => renderFrame.value,
  getRootElement: () => rootRef.value,
  getScale: () => scale.value,
  isEditing: () => isEditing.value,
  isComposing: () => isComposing.value,
  isReadOnly: () => Boolean(props.readOnly),
  isCellReadOnly: () => cellReadOnly.value,
  isSelectionReadOnly: () => selectionReadOnly.value,
  isFormatPainterActive: () => Boolean(props.formatPainterActive),
  isFlashFillBlocked: () =>
    Boolean(props.formatPainterActive) ||
    Boolean(getReferenceEditor()) ||
    Boolean(selectedImageId.value) ||
    Boolean(dimensionResize.value) ||
    Boolean(freezeDragging.value) ||
    Boolean(axisMoveDrag.value),
  editSession,
  getEditingValue: () => editingValue.value,
  setEditingValue: (value) => {
    editingValue.value = value;
  },
  insertEditorLineBreak: () => {
    editorRef.value?.insertLineBreak();
  },
  handleHistoryShortcut,
  handleReferenceKeydown,
  openActiveCellContextMenu,
  openAxisContextMenu,
  beginEdit,
  cancelEdit,
  traverseSelection,
  moveSelection,
  selectAxis,
  fillSelection,
  clearPendingClipboard,
  onOpenHyperlink: (address) => emit("openHyperlink", address),
  onChooseFromColumn: (range) =>
    emit("contextAction", { action: { type: "chooseFromColumn" }, range }),
  onFormatPainterTarget: (range) => emit("formatPainterTarget", range),
  onUnlockRange: (range) => emit("unlockRange", range),
  onFlashFill: () => emit("flashFill"),
  onClearCells: (range) => emit("clearCells", range),
  onEditNote: (address) => emit("editNote", address),
});

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
  floatingClipboard.clear();
  ownedClipboard.clear();
  clearPendingClipboard();
}

function flushPendingShapeTextEdit(): boolean {
  if (props.shapeTextEditSnapshot && props.shapeTextEditCallbacks?.isActive()) {
    if (!props.shapeTextEditCallbacks.commit()) return false;
  }
  return true;
}

function flushPendingEquationEdit(): boolean {
  if (props.equationEditSnapshot && props.equationEditCallbacks?.isActive())
    return props.equationEditCallbacks.commit();
  return true;
}
function flushPendingEdit(): boolean {
  return flushPendingEquationEdit() && flushPendingShapeTextEdit() && flushPendingCellEdit();
}

function flushPendingCellEdit(): boolean {
  if (pictureCrop.active.value && !finishPictureCrop()) return false;
  if (isComposing.value) {
    return false;
  }
  if (isEditing.value) {
    return finishEdit(undefined, false);
  }
  return true;
}

function hasPendingEdit(): boolean {
  return (
    !!props.equationEditSnapshot ||
    !!props.shapeTextEditSnapshot ||
    pictureCrop.active.value ||
    isComposing.value ||
    isEditing.value
  );
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
  window.addEventListener("keydown", onPictureCropKeydown, true);
});

watch(horizontalScrollState, (state) => emit("horizontalScrollChange", state), {
  immediate: true,
  flush: "post",
});

onBeforeUnmount(() => {
  floatingClipboard.clear();
  ownedClipboard.clear();
  stopObservingViewport();
  stopGeometryWatching();
  stopDragSelection();
  stopFormulaReferenceDrag();
  stopDimensionResize();
  clearHyperlinkPointerGesture();
  cancelNotePreviewLeave();
  clearPendingClipboard();
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  window.removeEventListener("keydown", onPictureCropKeydown, true);
  pictureCrop.cancel();
  stopCropPointer();
});

defineExpose({
  selectShapeObjects: (paths: readonly import("@sheetcraft/core/shape-group").ShapeGroupPath[]) =>
    shapeDrawingLayerRef.value?.selectObjectPaths(paths) ?? false,
  getSelectedShapeObjects: () => shapeDrawingLayerRef.value?.getObjectSelectionPaths() ?? [],
  getShapeObjectSelectionRevision: () =>
    shapeDrawingLayerRef.value?.getObjectSelectionRevision() ?? 0,
  getDrawingLayout: (sheet: Sheet) => (props.sheet === sheet ? layout.value : undefined),
  getShapeFrameContext: (sheet: Sheet) =>
    props.sheet === sheet ? { layout: layout.value, metrics: pictureViewMetrics.value } : undefined,
  getPictureFrameContext: (sheet: Sheet) =>
    props.sheet === sheet ? pictureFrameContext.value : undefined,
  previewSelectedPicture,
  canPreviewPicture,
  selectDrawing: (id: string | null) => {
    selectFloatingImage(null);
    selectedShapeDrawingId.value = id;
  },
  selectFloatingImages: (ids: string[]) => {
    if (ids.length && !canEditPictureSelection(props.sheet, expandFloatingImageSelection(ids)))
      return;
    selectedOwnedPicturePath.value = null;
    selectedImageIds.value = expandFloatingImageSelection(ids);
    selectedImageId.value =
      [...ids].reverse().find((id) => selectedImageIds.value.includes(id)) ?? null;
  },
  focusOwnedPictureSelection: (ids: readonly string[], owner: Sheet) => {
    if (
      props.sheet === owner &&
      !isEditing.value &&
      !isComposing.value &&
      ids.length === selectedImageIds.value.length &&
      ids.every((id, index) => selectedImageIds.value[index] === id)
    )
      ownedImageLayerRef.value?.focusSelected();
  },
  getPictureSelectionFocusTarget,
  arrangePictures: (
    ids: string[],
    action: Parameters<NonNullable<typeof imageLayerRef.value>["arrangeImages"]>[1],
    reference: PictureAlignmentReference = props.pictureAlignmentReference ?? "selection",
  ) => {
    const extended = props.sheet.floatingImages.some(
      (root) => ids.includes(root.id) && (isPictureGroup(root) || isFramedPictureObject(root)),
    );
    return extended
      ? ownedImageLayerRef.value?.arrangeSelection(ids, action, reference)
      : imageLayerRef.value?.arrangeImages(ids, action, reference);
  },
  hasActivePictureCrop: () => pictureCrop.active.value,
  applyPendingPictureCrop: () => !pictureCrop.active.value || finishPictureCrop(false, false),
  cropImage: startPictureCrop,
  startPictureTransparentColor: pictureTransparentColor.start,
  canPickTransparentColor: pictureTransparentColor.canStart,
  canCropPicture: () => pictureCrop.canStart.value,
  rotateImage: (turns: -1 | 1 | 2) =>
    requiresOwnedClipboard()
      ? ownedImageLayerRef.value?.rotateSelected(turns)
      : imageLayerRef.value?.rotateImage(turns),
  flipImage: (axis: "horizontal" | "vertical") =>
    requiresOwnedClipboard()
      ? ownedImageLayerRef.value?.flipSelected(axis)
      : imageLayerRef.value?.flipImage(axis),
  restoreImage: () => imageLayerRef.value?.restoreImage(),
  fillSelection,
  clearClipboard,
  flushPendingEdit,
  flushPendingCellEdit,
  flushPendingShapeTextEdit,
  flushPendingEquationEdit,
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
      :image-theme="theme"
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
          @clipboard-copy="emit('clipboardCopy')"
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
      v-if="workbook && (sheet.pivotTables?.length ?? 0) > 0"
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
      v-if="(sheet.pivotTables?.length ?? 0) > 0"
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
      v-if="
        fillHandlePoint &&
        !shapeCreationRequest &&
        !selectedShapeDrawingId &&
        !selectedImageIds.length
      "
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
      v-if="shapeCreationRequest && shapeCreationCommit && shapeCreationCancel"
      class="sheet-grid__shape-creation-controls"
      :style="{
        left: `${headerSize.width}px`,
        top: `${headerSize.height}px`,
        width: `${viewportSize.width}px`,
        height: `${viewportSize.height}px`,
      }"
    >
      <SheetFreeShapeCreationLayer
        v-if="shapeCreationRequest.choice.kind === 'drawingTool'"
        :request="shapeCreationRequest"
        :commit="shapeCreationCommit"
        :cancel="shapeCreationCancel"
        :layout="layout"
        :metrics="pictureViewMetrics"
        :page-projection="pageProjection"
        :scale="scale"
        :revision="workbookRevision"
        :read-only="objectsReadOnly"
        :locale="locale"
      />
      <SheetShapeCreationLayer
        v-else
        :request="shapeCreationRequest"
        :commit="shapeCreationCommit"
        :cancel="shapeCreationCancel"
        :layout="layout"
        :metrics="pictureViewMetrics"
        :page-projection="pageProjection"
        :scale="scale"
        :revision="workbookRevision"
        :read-only="objectsReadOnly"
        :locale="locale"
      />
    </div>
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
        ref="shapeDrawingLayerRef"
        @clipboard-copy="emit('clipboardCopy')"
        :copy-objects="copyShapeObjects"
        :cut-objects="cutShapeObjects"
        :paste-objects="pasteShapeObjects"
        :can-paste-objects="canPasteShapeObjects"
        :equation-placeholders-hidden="equationPlaceholdersHidden"
        :equation-edit-snapshot="equationEditSnapshot"
        :chart-layout-preview="chartLayoutPreview"
        :chart-element-selection="chartElementSelection"
        :equation-edit-callbacks="equationEditCallbacks"
        :owns-selected-shape-field-target="ownsSelectedShapeFieldTarget"
        :text-edit-snapshot="shapeTextEditSnapshot"
        :text-edit-callbacks="shapeTextEditCallbacks"
        :start-text-edit="shapeTextEditStart"
        :text-edit-selection="shapeTextEditSelection"
        :text-box-reference-resolver="textBoxReferenceResolver"
        :open-text-box-reference="openTextBoxReference"
        @selection-change="selectedShapeDrawingId = $event"
        @format="emit('formatDrawing', $event)"
        @background-pointer="onSurfacePointerDown"
        @control-change="(id, value) => emit('changeControl', id, value)"
        @chart-element-select="
          (drawing, target, openPane) => emit('selectChartElement', drawing, target, openPane)
        "
        :key="sheet.id"
        :drawings="sheet.drawings ?? []"
        :metrics="pictureViewMetrics"
        :page-projection="pageProjection"
        :selected-drawing-id="selectedShapeDrawingId"
        :theme="theme"
        :image-asset-urls="imageAssetUrls"
        :loading-image-asset-ids="loadingImageAssetIds"
        :missing-image-asset-ids="missingImageAssetIds"
        :locale="locale"
        :date-system="dateSystem"
        :sheet="sheet"
        :evaluator="sheetEvaluator"
        :resolve-sheet="resolveChartSheet"
        :revision="workbookRevision"
        :layout="layout"
        :scale="scale"
        :read-only="pictureLayerReadOnly"
        :apply-update="applyDrawingUpdate"
        :apply-collection="applyDrawingCollection"
        @select="selectFloatingImage(null)"
        @update="emit('updateDrawing', $event)"
        @delete="emit('deleteDrawing', $event)"
        @edit="emit('editDrawing', $event)"
        @edit-owned="(root, path) => emit('editOwnedShape', root, path)"
        @format-group="(root, path) => emit('formatShapeGroup', root, path)"
        @group-selection-change="(id, path) => emit('selectedShapeGroupChange', id, path)"
        @object-selection-change="(paths) => emit('selectedShapeObjectsChange', paths, sheet)"
      />
      <SheetFloatingImageLayer
        :source-tools-disabled="pictureSourceBusy"
        :restore-original-handler="restorePictureOriginal"
        :can-restore-original="canRestorePictureOriginal"
        :alignment-reference="pictureAlignmentReference"
        @reference="emit('pictureAlignmentReference', $event)"
        :preview-on-double-click="imagePreviewOnDoubleClick ?? true"
        :crop-handler="startPictureCrop"
        :cropping-externally="pictureCrop.active.value"
        ref="imageLayerRef"
        @paint-state-change="acceptPicturePaintState('standalone', $event)"
        :scale="scale"
        :images="standalonePictures"
        :selection-roots="sheet.floatingImages"
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
        :can-convert-to-cell="(id) => props.canConvertPictureToCell?.(id) ?? false"
        :read-only="pictureLayerReadOnly"
        :can-edit-root="pictureRootAvailable"
        :can-group="canUseSheetPermission(sheet, 'editObjects')"
        @select="selectFloatingImage"
        @update="emit('updateFloatingImage', $event)"
        @delete="deleteSelectedFloatingImage"
        @convert-to-cell="convertSelectedFloatingImageToCell"
        @preview="openFloatingImagePreview"
        @copy="requestFloatingImageCopy($event, 'copy')"
        @cut="requestFloatingImageCopy($event, 'cut')"
        @paste="requestFloatingImagePaste"
        @source-action="requestPictureSourceAction"
      />
      <SheetOwnedPictureGroupLayer
        :source-tools-disabled="pictureSourceBusy"
        :alignment-reference="pictureAlignmentReference"
        @reference="emit('pictureAlignmentReference', $event)"
        v-if="pictureFrameContext"
        ref="ownedImageLayerRef"
        :roots="sheet.floatingImages"
        :asset-urls="resolvedImageUrls"
        @source-action="requestPictureSourceAction"
        :cropping-externally="pictureCrop.active.value"
        :owner="sheet"
        :revision="workbookRevision ?? 0"
        :layout="layout"
        :frame-context="pictureFrameContext"
        :scale="scale"
        :selected-root-id="selectedImageId"
        :selected-root-ids="selectedImageIds"
        :selected-path="selectedOwnedPicturePath"
        :read-only="pictureLayerReadOnly"
        :can-convert-to-cell="(path) => props.canConvertPictureToCell?.(path[0]!, path) ?? false"
        :can-edit-root="pictureRootAvailable"
        :can-group="canUseSheetPermission(sheet, 'editObjects')"
        :apply-update-many="applyPictureCollectionChange"
        @paint-state-change="acceptPicturePaintState('owned', $event)"
        @select="selectFloatingImage"
        @select-path="selectOwnedPicturePath"
        @feedback="emit('imageFeedback', $event)"
        @ungroup="ungroupOwnedPicture"
        @group="emit('groupFloatingImages', $event)"
        @convert-to-cell="
          (path, owner) => {
            if (owner === props.sheet) convertSelectedFloatingImageToCell(path[0]!, path);
          }
        "
        @format="formatOwnedPicture"
        @delete="deleteOwnedPicture"
        @copy="(path, owner) => requestOwnedPictureCopy(path, 'copy', owner)"
        @cut="(path, owner) => requestOwnedPictureCopy(path, 'cut', owner)"
        @paste="requestOwnedPicturePaste"
      />
      <PictureColorPickLayer
        v-if="pictureTransparentColor.session.value"
        @pick="
          pictureTransparentColor.pick(imagePoint($event));
          if (!pictureTransparentColor.session.value) focusEditor();
        "
        @cancel="
          pictureTransparentColor.cancel();
          focusEditor();
        "
      />
      <SheetPictureCropOverlay
        v-if="pictureCrop.view.value"
        ref="cropOverlayRef"
        :key="pictureCrop.view.value.id"
        :picture="pictureCrop.view.value.picture"
        :geometry="pictureCrop.view.value.geometry"
        :layout="layout"
        :scale="scale"
        :asset-url="resolvedImageUrls.get(pictureCrop.view.value.picture.assetId)"
        @start="startPictureCropGesture"
        @keydown="onPictureCropKeydown"
        @contextmenu="openCropContextMenu"
      />
      <SheetPictureAdjustmentHandles
        v-if="pictureAdjustmentView?.picture.frame.cropShape"
        :shape="pictureAdjustmentView.picture.frame.cropShape"
        :geometry="pictureAdjustmentView.geometry"
        :layout="layout"
        :disabled="pictureSelectionReadOnly"
        @start="startPictureShapeAdjustment"
        @nudge="nudgePictureShapeAdjustment"
      />
      <PictureCropToolbar
        v-if="cropToolbarAnchor && cropControls"
        ref="cropToolbarRef"
        :key="cropControls.id"
        :anchor="cropToolbarAnchor"
        :owner-id="cropControls.id"
        :apply="cropControls.apply"
        :cancel="cropControls.cancel"
        :set-ratio="cropControls.setRatio"
        :set-shape="cropControls.setShape"
        :reset-shape-and-crop="cropControls.resetShapeAndCrop"
        :shape="pictureCrop.view.value?.picture.frame.cropShape"
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
      :has-hyperlink="!!getCellHyperlink(sheet, cellContextMenu.address)"
      :hyperlink-disabled="hyperlinkEditDisabled"
      @hyperlink="requestCellHyperlink"
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
      :image-conversion-disabled="
        pictureLayerReadOnly ||
        !cellContextMenu.imageAddress ||
        !canEditRange(
          sheet,
          expandSelectionToMergedCellRanges(
            {
              start: cellContextMenu.imageAddress,
              end: cellContextMenu.imageAddress,
            },
            sheet.mergedCells,
          ),
        )
      "
      :has-note="
        Boolean(
          sheet.cells.get(`${cellContextMenu.address.row}:${cellContextMenu.address.column}`)?.note,
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
      :key="imagePreview.ownerId"
      :src="previewUrl"
      :alt-text="imagePreview.altText"
      :transform="imagePreview.transform"
      :frame-source="imagePreview.frameSource"
      :theme="theme"
      :asset-urls="imageAssetUrls"
      @close="imagePreviewClose"
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

  &__shape-creation-controls {
    position: absolute;
    z-index: 20;
    pointer-events: none;
  }

  &__image-controls {
    position: absolute;
    z-index: 6;
    pointer-events: none;
  }

  &__fill-handle {
    position: absolute;
    z-index: 5;
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
