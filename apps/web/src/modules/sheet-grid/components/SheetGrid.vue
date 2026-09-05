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
import { getCellAddressLabel } from "@idea10/core/coordinates";
import { DEFAULT_CELL_FONT_FAMILY } from "@idea10/core/style";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
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
import { useCellEditing } from "../composables/useCellEditing";
import { useDragSelection } from "../composables/useDragSelection";
import { useSheetViewport } from "../composables/useSheetViewport";
import type { ImageInsertMode } from "../../sheet-images/useSheetImageActions";
import SheetFloatingImageLayer from "../../sheet-images/components/SheetFloatingImageLayer.vue";
import SheetImagePreview from "../../sheet-images/components/SheetImagePreview.vue";
import { useFloatingImageClipboard } from "../../sheet-images/useFloatingImageClipboard";
import { areGridClipboardTextsEqual, createBrowserGridClipboardPort } from "../gridClipboardPort";
import { readFloatingImageClipboard } from "../../sheet-images/imageClipboard";
import CellEditor from "./CellEditor.vue";
import SheetAxisContextMenu from "./SheetAxisContextMenu.vue";
import SheetCellLayer from "./SheetCellLayer.vue";
import SheetCellContextMenu from "./SheetCellContextMenu.vue";
import SheetBorderLayer from "./SheetBorderLayer.vue";
import SheetColumnHeaders from "./SheetColumnHeaders.vue";
import SheetRowHeaders from "./SheetRowHeaders.vue";
import SheetSelectionOverlay from "./SheetSelectionOverlay.vue";
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
    initialRowCount?: number;
    initialColumnCount?: number;
    rowExpansionStep?: number;
    columnExpansionStep?: number;
    rowExpansionTail?: number;
    columnExpansionTail?: number;
    viewState?: SheetGridViewState;
    formatPainterActive?: boolean;
    referenceEditor?: FormulaReferenceEditor | null;
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
    missingImageAssetIds?: ReadonlySet<string>;
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
const selectedImageId = ref<string | null>(null);
const selection = ref<CellSelection>(createCellSelection({ row: 0, column: 0 }));
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
  columnHeaderPanes,
  geometry,
  getCellAtClientPoint,
  gridCanvasStyle,
  gridExtent,
  gridViewportStyle,
  ensureGridExtentContains,
  ensureGridExtentCoversViewport,
  ensureSelectionVisible,
  emitViewState,
  layout,
  observe: observeViewport,
  onScroll,
  restore: restoreViewport,
  rowHeaderPanes,
  rowVisibility,
  scrollPosition,
  scrollerRef,
  startGeometryWatch,
  stopObserving: stopObservingViewport,
  stopGeometryWatching,
  updateViewportSize,
  viewportSize,
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
  getFreezePanes: () => props.sheet.freezePanes,
  getMergedCells: () => props.sheet.mergedCells,
  getHiddenRowIntervals: () =>
    createSheetFilterHiddenRowIntervals(props.sheet, sheetEvaluator.value),
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
const formulaReferenceRange = ref<CellRange>();
let formulaReferenceDragEditor: FormulaReferenceEditor | undefined;
const { start: startFormulaReferenceDrag, stop: stopFormulaReferenceDragInternal } =
  useDragSelection({
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
const activeCellRect = computed(
  () => layout.value.getCellViewportRect(activeCell.value) ?? { x: 0, y: 0, width: 0, height: 0 },
);
const selectedRangeRects = computed(() => layout.value.getRangeFragments(selectedRange.value));
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
  emit("deleteFloatingImage", id);
  selectedImageId.value = null;
  focusEditor();
}

function convertSelectedFloatingImageToCell(id: string): void {
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
  event.stopPropagation();
  void floatingClipboard.copy(image, "cut", event);
}

function requestFloatingImageCopy(id: string, mode: "copy" | "cut"): void {
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (image) void floatingClipboard.copy(image, mode);
}

async function requestFloatingImagePaste(id: string): Promise<void> {
  const image = props.sheet.floatingImages.find((entry) => entry.id === id);
  if (!image) return;
  setActiveCell(image.anchor);
  await pasteSelection();
  focusEditor();
}

function onImagePaste(event: ClipboardEvent): void {
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
  selection.value = normalizeSelectionForSheet(nextSelection);
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

function onEditorBlur(): void {
  stopFormulaReferenceDrag();
  onCellEditorBlur();
}

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
  const x = bounds.left + rect.x + Math.min(16, rect.width / 2);
  const y = bounds.top + rect.y + rect.height;
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
  axisContextMenu.value = undefined;
  cellContextMenu.value = undefined;
  clearPendingClipboard();
  cancelEdit(false);
  restoreViewport(nextViewState);
  const normalized = normalizeSelectionForSheet(nextViewState.selection);
  selection.value = normalized;
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
  stopFormulaReferenceDrag();
  stopDimensionResize();
  clearPendingClipboard();
});

defineExpose({
  clearClipboard,
  flushPendingEdit,
  focusGrid: focusEditor,
  hasPendingEdit,
  navigateToCell,
});
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
    @copy.capture="onImageCopy"
    @cut.capture="onImageCut"
    @paste.capture="onImagePaste"
  >
    <button
      type="button"
      class="sheet-grid__corner"
      :class="{ 'is-active': getSelectionMode(selection) === 'all' }"
      :aria-label="t('grid.selectAll')"
      @click="onCornerClick"
    />
    <SheetColumnHeaders
      :panes="columnHeaderPanes"
      :geometry="geometry"
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
      :panes="rowHeaderPanes"
      :geometry="geometry"
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
            :image-asset-urls="imageAssetUrls"
            :loading-image-asset-ids="loadingImageAssetIds"
            :evaluator="sheetEvaluator"
            :layout="layout"
            :active-cell="activeCell"
            :selection="selection"
            :editing="isEditing"
            :locale="locale"
            @cell-mousedown="onCellMouseDown"
            @cell-double-click="onCellDoubleClick"
            @cell-contextmenu="openCellContextMenu"
          >
            <template #active-cell="{ cellRect }">
              <CellEditor
                ref="editorRef"
                :model-value="editingValue"
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
            :images="sheet.floatingImages"
            :layout="layout"
            :asset-urls="imageAssetUrls ?? new Map()"
            :loading-asset-ids="loadingImageAssetIds"
            :missing-asset-ids="missingImageAssetIds"
            :selected-image-id="selectedImageId"
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
}
</style>
