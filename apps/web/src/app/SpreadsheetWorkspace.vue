<script setup lang="ts">
import { routeRibbonHistoryShortcut } from "./ribbon-history-shortcuts";
import {
  isFormatPaneReadonlyHistoryControl,
  routeFormatPaneHistoryShortcut,
} from "./format-pane-history-shortcuts";
import type { PictureEffectEdit } from "../modules/sheet-images/picture-effect-edit";
import type { PictureContextSourceAction } from "../modules/sheet-images/picture-context-source-action";
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import { getCellContent, getCellStyle, createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import { useWordProofreading } from "../modules/text-proofreading/useWordProofreading";
import ProofreadingToolbar from "../modules/text-proofreading/components/ProofreadingToolbar.vue";
import WordReviewDialog from "../modules/text-proofreading/components/WordReviewDialog.vue";
import WordDictionaryDialog from "../modules/text-proofreading/components/WordDictionaryDialog.vue";
import DocumentPasswordDialog from "../modules/workbook-xlsx/components/DocumentPasswordDialog.vue";
import { useTextReviewController } from "../modules/review-tools/useTextReviewController";
import TextReviewDialog from "../modules/review-tools/components/TextReviewDialog.vue";
import {
  canEditCell,
  canUseSheetPermission,
  isPictureGroup,
  type PictureGroupPath,
} from "@sheetcraft/core";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { useProtectionController } from "../modules/review-tools/useProtectionController";
import UnlockRangeDialog from "../modules/review-tools/components/UnlockRangeDialog.vue";
import SheetProtectionDialog from "../modules/review-tools/components/SheetProtectionDialog.vue";
import EditableRangesDialog from "../modules/review-tools/components/EditableRangesDialog.vue";
import WorkbookProtectionDialog from "../modules/review-tools/components/WorkbookProtectionDialog.vue";
import ReviewToolbar from "../modules/review-tools/components/ReviewToolbar.vue";
import { useReviewController } from "../modules/review-tools/useReviewController";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { cloneConditionalFormatRule } from "@sheetcraft/core/conditional-formatting";
import type { SheetGoToOptions } from "@sheetcraft/core/go-to";
import {
  computed,
  nextTick,
  provide,
  ref,
  shallowRef,
  shallowReactive,
  useId,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  createSetSheetOutlineGroupCollapsedCommand,
  createSetSheetOutlineLevelCommand,
  createSetSheetPageSetupCommand,
  createSetSheetPageDecorationCommand,
  createSetSheetsWatermarkCommand,
  createSetWorkbookWatermarkPresetsCommand,
  type CellFormatChange,
} from "@sheetcraft/core/commands";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@sheetcraft/core/page-setup";
import type { SheetViewMode } from "@sheetcraft/sheet-engine/page-layout";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useWorkbookFullscreen } from "../modules/workbook/composables/useWorkbookFullscreen";
import { useEyeComfortMode } from "../modules/workbook/composables/useEyeComfortMode";
import { normalizeSheetZoom, SHEET_ZOOM_STEP } from "../shared/sheet-view/zoom";
import { useCellEditSession } from "../shared/cell-editing/useCellEditSession";
import { useFormulaToolsController } from "../modules/formula-tools/useFormulaToolsController";
import { useFormulaEditorController } from "../modules/formula-tools/useFormulaEditorController";
import FormulaFunctionBrowser from "../modules/formula-tools/components/FormulaFunctionBrowser.vue";
import FormulaEditorDialog from "../modules/formula-tools/components/FormulaEditorDialog.vue";
import { useDataToolsController } from "../modules/data-tools/useDataToolsController";
import { useDuplicateErrorChecks } from "../modules/data-tools/useDuplicateErrorChecks";
import type { ErrorCheckSettings } from "../modules/data-tools/duplicate-error-preferences";
import DuplicateErrorCheckOptionsDialog from "../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import DataTableDialog from "../modules/data-tools/components/DataTableDialog.vue";
import CreateTableDialog from "../modules/table-styles/components/CreateTableDialog.vue";
import TableSettingsDialog from "../modules/table-styles/components/TableSettingsDialog.vue";
import ResizeTableDialog from "../modules/table-styles/components/ResizeTableDialog.vue";
import CalculatedColumnDialog from "../modules/table-styles/components/CalculatedColumnDialog.vue";
import TableToolsToolbar from "../modules/table-styles/components/TableToolsToolbar.vue";
import NewTableStyleDialog from "../modules/table-styles/components/NewTableStyleDialog.vue";
import HyperlinkDialog from "../modules/hyperlinks/components/HyperlinkDialog.vue";
import { useHyperlinksController } from "../modules/hyperlinks/useHyperlinksController";
import NewCellStyleDialog from "../modules/cell-styles/components/NewCellStyleDialog.vue";
import MergeCellStylesDialog from "../modules/cell-styles/components/MergeCellStylesDialog.vue";
import { useCellStylesController } from "../modules/cell-styles/useCellStylesController";
import { useTableStylesController } from "../modules/table-styles/useTableStylesController";
import GoalSeekDialog from "../modules/data-tools/components/GoalSeekDialog.vue";
import PlanningSolverDialog from "../modules/data-tools/components/PlanningSolverDialog.vue";
import DataProofreadingDialog from "../modules/data-tools/components/DataProofreadingDialog.vue";
import DataToolbar from "../modules/data-tools/components/DataToolbar.vue";
import ViewToolbar from "../modules/view-tools/components/ViewToolbar.vue";
import PagePrintPreview from "../modules/page-layout/components/PagePrintPreview.vue";
import PageThemeMenu from "../modules/page-layout/components/PageThemeMenu.vue";
import { usePageThemeController } from "../modules/page-layout/usePageThemeController";
import { workbookThemeKey } from "../shared/color/workbook-theme-context";
import PageBackgroundMenu from "../modules/page-decorations/components/PageBackgroundMenu.vue";
import type { SheetWatermark, WatermarkPreset } from "@sheetcraft/core/page-decoration";
import { usePictureAssetTools } from "../modules/sheet-images/usePictureAssetTools";
import { usePictureCellConversion } from "../modules/sheet-images/usePictureCellConversion";
import PictureCellOverwriteDialog from "../modules/sheet-images/components/PictureCellOverwriteDialog.vue";
import type { PictureCellOverwriteConfirmation } from "../modules/sheet-images/picture-cell-overwrite-confirmation";
import PictureCompressDialog from "../modules/sheet-images/components/PictureCompressDialog.vue";
import PictureBatchSizeDialog from "../modules/sheet-images/components/PictureBatchSizeDialog.vue";
import {
  usePictureTools,
  type PictureAlignmentReference,
} from "../modules/sheet-images/usePictureTools";
import PictureSelectionPane from "../modules/sheet-images/components/PictureSelectionPane.vue";
import PictureAnnotationDialog from "../modules/sheet-images/components/PictureAnnotationDialog.vue";
import PictureToolbar from "../modules/sheet-images/components/PictureToolbar.vue";
import type { Sheet, FloatingImage, ImageAppearance } from "@sheetcraft/core/workbook";
import PictureGroupRibbon from "../modules/sheet-images/components/PictureGroupRibbon.vue";
import PictureOwnedLeafRibbon from "../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import { resolveOwnedPictureNode } from "../modules/sheet-images/picture-group-interaction";
import PictureFormatPane from "../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import { usePictureIntrinsicSize } from "../modules/sheet-images/usePictureIntrinsicSize";
import { useOwnedPictureFormatPane } from "../modules/sheet-images/useOwnedPictureFormatPane";
import { onBeforeUnmount } from "vue";
import { createPicturePaintAssetSource } from "../modules/sheet-images/picture-paint-asset-source";
import type { PictureFormatLabelKey } from "../modules/sheet-images/picture-format-pane-model";
import { restoreFocusAfterRemount } from "../shared/floating/useDismissibleFloatingPanel";
import { usePictureEffectsFocusReturn } from "../modules/sheet-images/usePictureEffectsFocusReturn";
import { usePictureToolbarOwner } from "../modules/sheet-images/usePictureToolbarOwner";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetChartDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { createCanvasImageCache } from "../modules/sheet-grid/canvas/image-painter";
import { useSparklineActions } from "../modules/sparklines/useSparklineActions";
import PivotGroupingDialog from "../modules/pivot-tables/components/PivotGroupingDialog.vue";
import { usePivotGrouping } from "../modules/pivot-tables/usePivotGrouping";
import { usePivotActions } from "../modules/pivot-tables/usePivotActions";
import { getPivotTableSource } from "@sheetcraft/core/pivot-tables";
import { createThemedTableStyles } from "@sheetcraft/core/table-styles";
import type { PivotArea } from "../modules/pivot-tables/pivot-field-edits";
import { getPivotActiveField } from "../modules/pivot-tables/pivot-active-field";
import PivotFieldsPane from "../modules/pivot-tables/components/PivotFieldsPane.vue";
import PivotAnalysisToolbar from "../modules/pivot-tables/components/PivotAnalysisToolbar.vue";
import PivotDesignToolbar from "../modules/pivot-tables/components/PivotDesignToolbar.vue";
import TableStyleGallery from "../modules/table-styles/components/TableStyleGallery.vue";
import PivotTableDialog from "../modules/pivot-tables/components/PivotTableDialog.vue";
import { useFormControlActions } from "../modules/form-controls/useFormControlActions";
import FormControlDialog from "../modules/form-controls/components/FormControlDialog.vue";
import { useAttachmentActions } from "../modules/attachments/useAttachmentActions";
import AttachmentDialog from "../modules/attachments/components/AttachmentDialog.vue";
import { useCameraActions } from "../modules/camera/useCameraActions";
import CameraEditorDialog from "../modules/camera/components/CameraEditorDialog.vue";
import SparklineDialog from "../modules/sparklines/components/SparklineDialog.vue";
import { useChartActions } from "../modules/charts/useChartActions";
import { useChartObjectControls } from "../modules/charts/useChartObjectControls";
import { useChartFormatControls } from "../modules/charts/useChartFormatControls";
import { getSheetChartData, getSheetChartSourceData } from "@sheetcraft/core/sheet-charts";
import {
  getChartFormatTargets,
  getChartFormatSeries,
  chartFormatTargetKey,
  type ChartFormatTarget,
} from "../modules/charts/chart-format-pane";
import ChartFormatPane from "../modules/charts/components/ChartFormatPane.vue";
import { useChartSourceActions } from "../modules/charts/useChartSourceActions";
import {
  getChartSourceApplicability,
  type ChartSourceReferenceRole,
} from "../modules/charts/chart-source-editor";
import ChartElementsToolbar from "../modules/charts/components/ChartElementsToolbar.vue";
import { defineAsyncComponent } from "vue";
const ChartEditorDialog = defineAsyncComponent(
  () => import("../modules/charts/components/ChartEditorDialog.vue"),
);
const ChartSourceDialog = defineAsyncComponent(
  () => import("../modules/charts/components/ChartSourceDialog.vue"),
);
import SymbolDialog from "../modules/insert-tools/components/SymbolDialog.vue";
import {
  resolveSymbolShortcut,
  useSymbolPreferences,
  validSymbolInsertion,
  withRecentSymbol,
  type SymbolInsertion,
} from "../modules/insert-tools/symbols/symbol-preferences";
import { ensureCellFontResource } from "../shared/cell-text/font-resources";
import { useSheetDisplaySnapshot } from "../modules/sheet-grid/canvas/sheet-display-snapshot";
import { DEFAULT_CELL_FONT_FAMILY } from "@sheetcraft/core/style";
import { captureScreen } from "../modules/insert-tools/captureScreen";
import { useShapeCreation } from "../modules/sheet-drawings/useShapeCreation";
import type { ShapeGalleryChoice } from "../modules/sheet-drawings/shape-gallery";
import { useDrawingActions } from "../modules/sheet-drawings/useDrawingActions";
import { prepareTextBoxReferenceUpdate } from "../modules/sheet-drawings/prepare-textbox-reference-update";
import { createTextBoxReferenceResolver } from "../modules/sheet-drawings/textbox-reference-display";
import { useTextBoxReference } from "../modules/sheet-drawings/useTextBoxReference";
import TextBoxReferenceDialog from "../modules/sheet-drawings/components/TextBoxReferenceDialog.vue";
import DrawingEditorDialog from "../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import {
  shapeFormatOwnerKey,
  type ShapeFormatTab,
} from "../modules/sheet-drawings/shape-format-pane-model";
import ShapeFormatPane from "../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeTextRibbonTools from "../modules/sheet-drawings/components/ShapeTextRibbonTools.vue";
import { useShapeRibbonFormat } from "../modules/sheet-drawings/useShapeRibbonFormat";
import ShapeToolsToolbar from "../modules/sheet-drawings/components/ShapeToolsToolbar.vue";
import ShapeSelectionPane from "../modules/sheet-drawings/components/ShapeSelectionPane.vue";
import { useShapeObjectControls } from "../modules/sheet-drawings/useShapeObjectControls";
import { useOwnedShapeGroupFormatPane } from "../modules/sheet-drawings/useOwnedShapeGroupFormatPane";
import { useOwnedShapeConnectorFormatPane } from "../modules/sheet-drawings/useOwnedShapeConnectorFormatPane";
import { ownsShapeTextEditTarget } from "../modules/sheet-drawings/shape-text-edit-ownership";
import {
  createShapeTextFieldDrafts,
  shapeTextFieldDraftsKey,
} from "../modules/sheet-drawings/shape-text-field-drafts";
import { useShapeTextEditSession } from "../modules/sheet-drawings/useShapeTextEditSession";
import type { ShapeCanvasTextEditRequest } from "../modules/sheet-drawings/shape-canvas-text-edit-contract";
import { preflightShapeConnectorPaint } from "../modules/sheet-drawings/shape-connector-paint-preflight";
import {
  isShapeGroupDrawing,
  findShapeGroupNode,
  isSheetGroupedEquationDrawing,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { useWordArtActions } from "../modules/sheet-drawings/useWordArtActions";
import {
  planChartClipboardSourceForTarget,
  ChartClipboardSourceError,
} from "../modules/charts/chart-clipboard-source";
import { ShapeClipboardError } from "../modules/sheet-drawings/shape-clipboard-planning";
import { useShapeClipboard } from "../modules/sheet-drawings/useShapeClipboard";
import { useShapeDrawingTransfer } from "../modules/sheet-drawings/useShapeDrawingTransfer";
import ShapeClipboardTransferDialog from "../modules/sheet-drawings/components/ShapeClipboardTransferDialog.vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ShapeTextPreparationMode } from "../modules/sheet-drawings/prepare-shape-text-update";
import type { ShapeClipboardFailure } from "../modules/sheet-drawings/shape-clipboard-planning";
import { useShapeTextCharacterFormatPane } from "../modules/sheet-drawings/useShapeTextCharacterFormatPane";
import { useOwnedShapeFormatPane } from "../modules/sheet-drawings/useOwnedShapeFormatPane";
import { createShapePaintAssetSource } from "../modules/sheet-drawings/shape-paint-asset-source";
import EquationTools from "../modules/sheet-drawings/equation/EquationTools.vue";
import {
  useEquationEditSession,
  type EquationRootEditSource,
} from "../modules/sheet-drawings/equation/useEquationEditSession";
import {
  createEquationPreset,
  createEquationTemplate,
  type EquationPresetId,
  type EquationSymbolInsertion,
} from "../modules/sheet-drawings/equation/equation-catalog";
import type { EquationDraftAction } from "../modules/sheet-drawings/equation/equation-draft";
import InsertToolbar from "../modules/insert-tools/components/InsertToolbar.vue";
import PageWatermarkMenu from "../modules/page-decorations/components/PageWatermarkMenu.vue";
import WatermarkDialog from "../modules/page-decorations/components/WatermarkDialog.vue";
import {
  usePageDecorationActions,
  type WatermarkScope,
} from "../modules/page-decorations/usePageDecorationActions";
import PageToolbar from "../modules/page-layout/components/PageToolbar.vue";
import {
  isPresetPageMargins,
  pageMarginsMatch,
  type PageMargins,
} from "../modules/page-layout/page-margin-presets";
import {
  readPageMarginHistory,
  recordPageMarginHistory,
} from "../modules/page-layout/page-margin-history";
import TableStylesMenu from "../modules/table-styles/components/TableStylesMenu.vue";
import {
  getPageBreakPatch,
  type PageBreakAction,
  type PageSetupTab,
} from "../modules/page-layout/page-toolbar-actions";
import PageSetupDialog from "../modules/page-layout/components/PageSetupDialog.vue";
import {
  formatPickedPageSetupReference,
  type PageSetupReferenceField,
} from "../modules/page-layout/page-setup-inputs";
import type { HeaderFooterEditTarget } from "../modules/page-layout/header-footer-editor";
import type { PageLayoutRulerUnit } from "../modules/page-layout/components/PageLayoutRulers.vue";
import DataToolsDialogs from "../modules/data-tools/components/DataToolsDialogs.vue";
import DuplicateValuesDialog from "../modules/data-tools/components/DuplicateValuesDialog.vue";
import ConsolidateDialog from "../modules/data-tools/components/ConsolidateDialog.vue";
import FillNumberSequenceDialog from "../modules/data-tools/components/FillNumberSequenceDialog.vue";
import FillRankDialog from "../modules/data-tools/components/FillRankDialog.vue";
import FillSeriesDialog from "../modules/data-tools/components/FillSeriesDialog.vue";
import FillBlanksDialog from "../modules/data-tools/components/FillBlanksDialog.vue";
import FillTextDialog from "../modules/data-tools/components/FillTextDialog.vue";
import FillCurrentDateDialog from "../modules/data-tools/components/FillCurrentDateDialog.vue";
import DropdownListDialog from "../modules/data-tools/components/DropdownListDialog.vue";
import LookupFillDialog from "../modules/data-tools/components/LookupFillDialog.vue";
import DataComparisonDialog from "../modules/data-tools/components/DataComparisonDialog.vue";
import AdvancedFilterDialog from "../modules/data-tools/components/AdvancedFilterDialog.vue";
import type { FillDirection } from "@sheetcraft/sheet-engine/fill-selection";
import type { AdvancedFilterDraft } from "../modules/data-tools/data-tools-types";
import FilterColumnPanel from "../modules/data-tools/components/FilterColumnPanel.vue";
import DataValidationFeedbackDialog from "../modules/data-tools/components/DataValidationFeedbackDialog.vue";
import RangeReferencePicker from "../shared/range-reference/RangeReferencePicker.vue";
import {
  useRangeReferencePicker,
  type RangeReferenceSelectionOptions,
} from "../shared/range-reference/useRangeReferencePicker";
import NamedRangesDialog from "../modules/formula-tools/components/NamedRangesDialog.vue";
import {
  createIndexedDbImageAssetStore,
  type ImageAssetStore,
} from "../modules/image-assets/imageAssetStore";
import { useImageAssetUrls } from "../modules/image-assets/useImageAssetUrls";
import { useSheetImageActions } from "../modules/sheet-images/useSheetImageActions";
import { SUPPORTED_IMAGE_FILE_ACCEPT } from "../modules/image-assets/supportedImageTypes";
import { usePictureDialogSessions } from "../modules/sheet-images/usePictureDialogSessions";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import { useSheetContextActions } from "./composables/useSheetContextActions";
import type { SheetContextMenuState } from "../modules/sheet-grid/context-menu-contracts";
import SheetColumnStatisticsDialog from "../modules/sheet-grid/components/SheetColumnStatisticsDialog.vue";
import SheetColumnChoiceDialog from "../modules/sheet-grid/components/SheetColumnChoiceDialog.vue";
import SheetContextFilterDialog from "../modules/sheet-grid/components/SheetContextFilterDialog.vue";
import { createAxisToolActions } from "../modules/sheet-grid/axis-tool-actions";
import { createCellFillActions } from "../modules/sheet-grid/cell-fill-actions";
import { createCellOperationActions } from "../modules/sheet-grid/cell-operation-actions";
import { browserCellTextMeasurer } from "../shared/cell-text/text-metrics";
import { useAppI18n, type MessageKey } from "../shared/i18n";
import RowColumnOperationsMenu from "../modules/sheet-grid/components/RowColumnOperationsMenu.vue";
import WorksheetOperationsMenu from "../modules/workbook/components/WorksheetOperationsMenu.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import SheetHorizontalScrollbar from "../modules/sheet-grid/components/SheetHorizontalScrollbar.vue";
import type { SheetHorizontalScrollState } from "../modules/sheet-grid/horizontal-scroll";
import WorkbookFormulaBar from "../modules/workbook/components/WorkbookFormulaBar.vue";
import {
  applyFindFormatChange,
  buildFindFormatFromCell,
  createFindFormatDraft,
} from "../modules/workbook/workbook-find-format";
import type {
  WorkbookFindFormatMode,
  WorkbookFindMode,
  WorkbookFindResult,
} from "../modules/workbook/workbook-find-types";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../shared/range-reference/formatRangeReference";
import WorkbookFindDialog from "../modules/workbook/components/WorkbookFindDialog.vue";
import { useWorkbookFindShortcuts } from "../modules/workbook/composables/useWorkbookFindShortcuts";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import {
  useSpreadsheetWorkspaceController,
  type CellFormatSelection,
  type ConditionalFormattingSelection,
} from "./composables/useSpreadsheetWorkspaceController";
import CellFormatDialog, {
  type CellFormatTab,
} from "../modules/cell-format/components/CellFormatDialog.vue";
import ConditionalFormatManagerDialog from "../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import type { ConditionalFormatQuickRule } from "../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import { getConditionalFormatPreset } from "../modules/conditional-formatting/conditional-format-presets";
import {
  createConditionalFormatRuleId,
  formatConditionalFormatRanges,
} from "../modules/conditional-formatting/conditional-formatting-ui";
import type {
  ConditionalFormatManagerSheet,
  ConditionalFormatSheetChange,
} from "../modules/conditional-formatting/conditional-format-manager-types";
import WorkbookFileActions from "../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import { createIndexedDbWorkbookStore } from "../modules/workbook-persistence/indexedDbWorkbookStore";
import { useWorkbookPersistence } from "../modules/workbook-persistence/useWorkbookPersistence";
import { useWorkbookFileActions } from "../modules/workbook-persistence/useWorkbookFileActions";
import type { WorkbookStore } from "../modules/workbook-persistence/workbookStore";
import XlsxFileActions from "../modules/workbook-xlsx/components/XlsxFileActions.vue";
import XlsxFileFeedback from "../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import { useWorkbookXlsxActions } from "../modules/workbook-xlsx/useWorkbookXlsxActions";
import type { CellAddress, SheetDimensionAxis, SheetProperties } from "@sheetcraft/core/workbook";

const props = defineProps<{
  workbookStore?: WorkbookStore;
  imageAssetStore?: ImageAssetStore;
}>();
const formulaBarRef = ref<InstanceType<typeof WorkbookFormulaBar> | null>(null);
const findDialogVisible = ref(false);
const findDialogRef = ref<InstanceType<typeof WorkbookFindDialog>>();
const findMode = ref<WorkbookFindMode>("find");

function restoreSearchFocus(): void {
  if (!findDialogVisible.value) {
    if (showFormulaBar.value) formulaBarRef.value?.focusSearch();
    else focusCellEditor();
  }
}
const gridId = `workbook-grid-${useId()}`;
const zoom = ref(100);
const showFormulaBar = ref(true);
const showHeaders = ref(true);
const showGridLines = ref(true);
const showAxisQuickTools = ref(false);
const eyeComfortEnabled = useEyeComfortMode();
const highlightEnabled = ref(false);
const highlightColor = ref("#22a06b");
const { fullscreen, fullscreenAvailable, toggleFullscreen } = useWorkbookFullscreen(() => {
  void MessagePlugin.warning(t("statusBar.fullscreenFailed"));
});
const horizontalScrollState = shallowReactive<SheetHorizontalScrollState>({
  position: 0,
  viewportSize: 0,
  contentSize: 0,
});

function updateHorizontalScrollState(state: SheetHorizontalScrollState): void {
  Object.assign(horizontalScrollState, state);
}

const {
  session,
  executeCommand,
  executeReplaceableCommand,
  recalculate,
  workbookRevision,
  workbookGeneration,
  replaceWorkbook,
  focusCellEditor,
  fitSelectionToViewport,
  handleFormulaReferenceKeydown,
  searchQuery,
  workbookFind,
  workbookGoTo,
  t,
  activeSheet,
  sheets,
  activeSheetViewState,
  activeAddress,
  activeAddressLabel,
  activeCellInput,
  activeSelectionRange,
  activeSelectionMode,
  fillSelection,
  activeSheetEvaluator,
  isFormattingSupported,
  activeSelectionStyle,
  formatPainterActive,
  activeSelectionSummary,
  setSelectionDragging,
  dataToolState,
  activeValidationInfo,
  validationFeedback,
  acceptValidationInput,
  dismissValidationInput,
  mergeState,
  commitCell,
  commitCellValue,
  setCellImage,
  setFloatingImage,
  deleteFloatingImage,
  convertFloatingImageToCell,
  convertCellImageToFloating,
  pasteCells,
  clearCells,
  sortSelection,
  applyFilter,
  clearFilter,
  freeze,
  unfreeze,
  setFreezePanes,
  mergeSelection,
  unmergeSelection,
  applyCellStyle,
  convertNumberType,
  applyCellBorders,
  captureCellFormatSelection,
  captureConditionalFormattingSelection,
  setConditionalFormats,
  setConditionalFormatsForSheets,
  clearConditionalFormats,
  applyCellFormat,
  updateBorderFormat,
  adjustNumberFormatDecimals,
  adjustIndent,
  activateFormatPainter,
  applyFormatPainterTarget,
  cancelFormatPainter,
  resizeDimension,
  insertAxis,
  deleteAxis,
  moveAxis,
  selectSheet,
  updateSheetProperties,
  restoreSheet,
  addSheet,
  duplicateSheet,
  renameSheet,
  deleteSheet,
  moveSheet,
  updateActiveSheetViewState,
  navigateToAddress,
  traverseFromFormulaBar,
  updateSearchQuery,
  undo,
  redo,
  setGridNavigator,
  clearGridClipboard,
  flushPendingGridEdit,
  hasPendingGridEdit,
  scrollGridHorizontally,
} = useSpreadsheetWorkspaceController();

const cellEditSession = useCellEditSession({ onCommit: commitCell });
const hyperlinkActions = useHyperlinksController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  getGeneration: () => workbookGeneration.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  navigate: (sheetId, address) => {
    selectSheet(sheetId);
    void nextTick(() => navigateToAddress(formatCellAddress(address)));
  },
  openExternal: (target) => {
    window.open(target, "_blank", "noopener,noreferrer");
  },
  focus: focusCellEditor,
});
const { dialog: hyperlinkDialog, draft: hyperlinkDraft, error: hyperlinkError } = hyperlinkActions;
const protectionActions = useProtectionController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  getRevision: () => workbookRevision.value,
  getGeneration: () => workbookGeneration.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
});
const {
  dialog: protectionDialog,
  configuration: protectionConfiguration,
  selection: protectionSelection,
  error: protectionError,
  canLockCells,
  lockedState,
  structureProtected,
} = protectionActions;
const protectedFormatting = computed(
  () => activeSheet.value.properties.protected && !activeSheet.value.protection?.formatCells,
);
const reviewActions = useReviewController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  getSelection: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  navigate: (address) => navigateToAddress(formatCellAddress(address)),
  focus: focusCellEditor,
});
const {
  draft: noteDraft,
  error: noteError,
  notes: reviewNotes,
  showActiveNote,
  showAllNotes,
  hiddenNoteKeys,
  hasNote,
  hasSelectedNotes,
} = reviewActions;
const textReview = useTextReviewController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getSelection: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
});
const wordProofreading = useWordProofreading({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getSelection: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  navigateToCell: (sheetId, address) => {
    if (activeSheet.value.id !== sheetId) selectSheet(sheetId);
    void nextTick(() => navigateToAddress(formatCellAddress(address)));
  },
});
const cellStyleActions = useCellStylesController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  getSelection: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () =>
    loading.value || fileBusy.value || xlsxBusy.value || activeSheet.value.properties.protected,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  focus: focusCellEditor,
});
const {
  customStyles: customCellStyles,
  styleDraft: cellStyleDraft,
  mergeOpen: cellStylesMergeOpen,
  modalOpen: cellStylesModalOpen,
  importedStyles: importedCellStyles,
  mergeLoading: cellStylesMergeLoading,
  error: cellStylesError,
} = cellStyleActions;
const tableActions = useTableStylesController({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  getSelection: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  focus: focusCellEditor,
});
const {
  activeTable,
  customStyles: customTableStyles,
  defaultStyleId: defaultTableStyleId,
  customPivotStyles: customPivotTableStyles,
  defaultPivotStyleId: defaultPivotTableStyleId,
  createTarget: createTableTarget,
  createInitial: createTableInitial,
  settingsTarget: tableSettingsTarget,
  resizeTarget: tableResizeTarget,
  calculatedColumnTarget: tableCalculatedColumnTarget,
  styleDraft: tableStyleDraft,
  pivotStyleDraft: pivotTableStyleDraft,
  error: tableError,
  modalOpen: tableModalOpen,
} = tableActions;
const tableRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingTableRange, reference: pickedTableReference } = tableRangePicker;
watch(tableModalOpen, (open) => {
  if (!open) tableRangePicker.cancel();
});
const pageViewModes = shallowReactive(new Map<string, SheetViewMode>());
const pageSetupVisible = ref(false);
const pageSetupRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingPageSetupRange, reference: pickedPageSetupReference } = pageSetupRangePicker;
const pageSetupRangeField = ref<PageSetupReferenceField>("printArea");
async function selectPageSetupReference(
  current: string,
  field: PageSetupReferenceField,
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  pageSetupRangeField.value = field;
  const selected = await pageSetupRangePicker.selectReference(current);
  if (
    selected === undefined ||
    !pageSetupVisible.value ||
    session.workbook !== workbook ||
    workbookGeneration.value !== generation
  )
    return undefined;
  const resolved = resolveRangeReference(workbook, selected, sheetId);
  if (!resolved || resolved.sheetId !== sheetId) return undefined;
  return formatPickedPageSetupReference(resolved.range, field);
}
watch(pageSetupVisible, (visible) => {
  if (!visible) pageSetupRangePicker.cancel();
});
const showPageBreaksBySheet = shallowReactive(new Map<string, boolean>());
const showPageBreaks = computed({
  get: () => showPageBreaksBySheet.get(activeSheet.value.id) ?? false,
  set: (show: boolean) => showPageBreaksBySheet.set(activeSheet.value.id, show),
});
const printPreviewVisible = ref(false);
const watermarkVisible = ref(false);
const backgroundConflictVisible = ref(false);
const editingWatermarkPreset = shallowRef<WatermarkPreset>();
const watermarkDialogValue = shallowRef<SheetWatermark>();
const showPageRulers = ref(true);
const showPageMargins = ref(false);
const showPageWhiteSpace = ref(true);
const pageRulerUnit = ref<PageLayoutRulerUnit>("cm");
const pageSetupTab = ref<"page" | "margins" | "header-footer" | "sheet">("page");
const headerFooterTarget = shallowRef<HeaderFooterEditTarget>();
const picturePreviewOnDoubleClick = ref(true);
const selectedPictureId = ref<string | null>(null);
const selectedPictureIds = ref<string[]>([]);
const pictureAlignmentReference = ref<PictureAlignmentReference>("selection");
const selectedOwnedPicturePath = shallowRef<PictureGroupPath | null>(null);
const selectedPicture = computed(() => {
  const image = activeSheet.value.floatingImages.find(
    (image) => image.id === selectedPictureId.value,
  );
  return image;
});
watch(
  () => activeSheet.value,
  () => {
    selectedPictureId.value = null;
    selectedPictureIds.value = [];
    selectedOwnedPicturePath.value = null;
  },
);
const sheetGridRef = shallowRef<InstanceType<typeof SheetGrid> | null>(null);
function setSheetGridRef(value: Element | ComponentPublicInstance | null): void {
  sheetGridRef.value = value as InstanceType<typeof SheetGrid> | null;
  setGridNavigator(value);
}
function setPageWhiteSpace(value: boolean): void {
  if (sheetGridRef.value?.flushPendingEdit() === false) return;
  showPageWhiteSpace.value = value;
}
function openHeaderFooter(target: HeaderFooterEditTarget): void {
  if (activeSheet.value.properties.protected || sheetGridRef.value?.flushPendingEdit() === false)
    return;
  pageSetupTab.value = "header-footer";
  headerFooterTarget.value = target;
  pageSetupVisible.value = true;
}
const activeViewMode = computed(() => pageViewModes.get(activeSheet.value.id) ?? "normal");
watch(
  [activeSheet, activeViewMode, () => activeSheet.value.floatingImages],
  () => {
    if (
      activeViewMode.value === "page-layout" &&
      activeSheet.value.floatingImages.some(
        (root) => isPictureGroup(root) || isFramedPictureObject(root),
      )
    ) {
      pageViewModes.set(activeSheet.value.id, "normal");
      showImageFeedback("picture.pageLayoutUnsupported");
    }
  },
  { flush: "sync", immediate: true },
);
const activePageSetup = computed(() => activeSheet.value.pageSetup ?? DEFAULT_SHEET_PAGE_SETUP);
const lastCustomMargins = ref<PageMargins | undefined>(readPageMarginHistory());
function setViewMode(mode: SheetViewMode): void {
  if (
    mode === "page-layout" &&
    activeSheet.value.floatingImages.some(
      (root) => isPictureGroup(root) || isFramedPictureObject(root),
    )
  ) {
    showImageFeedback("picture.pageLayoutUnsupported");
    return;
  }
  if (sheetGridRef.value?.flushPendingEdit() === false) return;
  pageViewModes.set(activeSheet.value.id, mode);
  void nextTick(focusCellEditor);
}
function applyPageSetup(setup: SheetPageSetup): void {
  const marginsChanged = !pageMarginsMatch(activePageSetup.value.margins, setup.margins);
  const changed = executeCommand(createSetSheetPageSetupCommand(activeSheet.value.id, setup));
  if (changed && marginsChanged && !isPresetPageMargins(setup.margins)) {
    lastCustomMargins.value = recordPageMarginHistory(setup.margins);
  }
}
function openPageSetup(tab: PageSetupTab): void {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    activeSheet.value.properties.protected ||
    sheetGridRef.value?.flushPendingEdit() === false
  )
    return;
  headerFooterTarget.value = undefined;
  pageSetupTab.value = tab;
  pageSetupVisible.value = true;
}
function changePageSetup(patch: Partial<SheetPageSetup>): void {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    activeSheet.value.properties.protected ||
    sheetGridRef.value?.flushPendingEdit() === false
  )
    return;
  applyPageSetup({ ...activePageSetup.value, ...patch });
}
function setPrintAreaFromSelection(): void {
  const { start, end } = activeSelectionRange.value;
  changePageSetup({ printArea: { start: { ...start }, end: { ...end } } });
}
function changePageBreak(action: PageBreakAction): void {
  changePageSetup(
    getPageBreakPatch(
      activePageSetup.value,
      activeAddress.value,
      activeSelectionMode.value,
      action,
    ),
  );
}
function applyWatermark(watermark: SheetWatermark): void {
  decorations.setWatermark(watermark);
}
async function saveCustomWatermark(
  watermark: SheetWatermark,
  scope: WatermarkScope,
  imageFile?: File,
): Promise<void> {
  if (loading.value || fileBusy.value || xlsxBusy.value) return;
  if (
    await decorations.applyWatermark(watermark, scope, imageFile, {
      id: editingWatermarkPreset.value?.id,
      name:
        watermark.text.trim() ||
        imageFile?.name ||
        editingWatermarkPreset.value?.name ||
        t("pageDecoration.imageWatermark"),
    })
  ) {
    watermarkVisible.value = false;
  }
}
function openWatermark(preset?: WatermarkPreset, watermark?: SheetWatermark): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || activeSheet.value.properties.protected)
    return;
  if (sheetGridRef.value?.flushPendingEdit() === false) return;
  editingWatermarkPreset.value = preset;
  watermarkDialogValue.value = preset?.watermark ?? watermark;
  watermarkVisible.value = true;
}
function applyWatermarkPreset(preset: WatermarkPreset, scope: WatermarkScope): void {
  if (loading.value || fileBusy.value || xlsxBusy.value) return;
  void decorations.applyWatermark(preset.watermark, scope);
}
function openPrintPreview(): void {
  if (loading.value || fileBusy.value || xlsxBusy.value) return;
  if (sheetGridRef.value?.flushPendingEdit() === false) return;
  printPreviewVisible.value = true;
}
function savePageSetup(setup: SheetPageSetup): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || activeSheet.value.properties.protected)
    return;
  applyPageSetup(setup);
  pageSetupVisible.value = false;
  void nextTick(focusCellEditor);
}
watch(workbookGeneration, () => {
  pageViewModes.clear();
  showPageBreaksBySheet.clear();
  printPreviewVisible.value = false;
  watermarkVisible.value = false;
  pageSetupVisible.value = false;
});
watch(
  () => activeSheet.value.id,
  () => {
    pageSetupVisible.value = false;
    printPreviewVisible.value = false;
    watermarkVisible.value = false;
  },
);
const duplicateInputError = computed(() => {
  const feedback = validationFeedback.value;
  if (feedback?.source !== "duplicate" || feedback.target.sheetId !== activeSheet.value.id)
    return undefined;
  return {
    address: feedback.target.address,
    title: t("dataTools.duplicates.rejectionTitle"),
    message: t("dataTools.duplicates.rejectionMessage"),
  };
});
const modalValidationFeedback = computed(() =>
  duplicateInputError.value ? undefined : validationFeedback.value,
);
watch(
  () => [
    cellEditSession.state.active,
    cellEditSession.state.draft,
    cellEditSession.state.owner?.sheetId,
    cellEditSession.state.owner?.address.row,
    cellEditSession.state.owner?.address.column,
    activeSheet.value.id,
  ],
  () => {
    if (validationFeedback.value?.source === "duplicate") dismissValidationInput();
  },
  { flush: "sync" },
);
const { locale } = useAppI18n();
const fillActions = createCellFillActions({
  getWorkbook: () => session.workbook,
  getSheetId: () => activeSheet.value.id,
  getRevision: () => workbookRevision.value,
  execute: executeReplaceableCommand,
});
const canFillRows = computed(
  () =>
    activeSelectionMode.value === "cells" &&
    activeSelectionRange.value.start.row < activeSelectionRange.value.end.row,
);
const canFillColumns = computed(
  () =>
    activeSelectionMode.value === "cells" &&
    activeSelectionRange.value.start.column < activeSelectionRange.value.end.column,
);
async function fillFromDataToolbar(direction: FillDirection): Promise<void> {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    imageBusy.value ||
    formatPainterActive.value
  )
    return;
  if (!cellEditSession.finish()) return;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  await nextTick();
  if (generation !== workbookGeneration.value || sheetId !== activeSheet.value.id) return;
  fillSelection(direction);
  focusCellEditor();
}
const activeSheetDisplay = useSheetDisplaySnapshot({
  getSheet: () => activeSheet.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getRevision: () => workbookRevision.value,
  getDateSystem: () => session.workbook.dateSystem,
  getTheme: () => session.workbook.theme,
});
const axisTools = createAxisToolActions({
  getSheet: () => activeSheet.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getLocale: () => locale.value,
  getDateSystem: () => session.workbook.dateSystem,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getTheme: () => session.workbook.theme,
  getCellStyle: (address) => activeSheetDisplay.value.getCellStyle(address),
  measurer: browserCellTextMeasurer,
  flushPendingEdits: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
});
const cellOperationActions = createCellOperationActions({
  getSheet: () => activeSheet.value,
  flushPendingEdits: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
});
const contextMenuState = computed<SheetContextMenuState>(() => ({
  format: activeSelectionStyle.value,
  formattingDisabled: !isFormattingSupported.value || protectedFormatting.value,
  data: dataToolState.value,
  merge: mergeState.value,
}));
const contextActions = useSheetContextActions({
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  getAddress: () => activeAddress.value,
  getState: () => contextMenuState.value,
  getGeneration: () => workbookGeneration.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  axis: axisTools,
  cells: cellOperationActions,
  focus: focusCellEditor,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
  applyFilter,
  runExisting: ({ action, range }) => {
    switch (action.type) {
      case "insert": {
        const address = action.direction === "before" ? range.start : range.end;
        const index =
          (action.axis === "row" ? address.row : address.column) +
          (action.direction === "after" ? 1 : 0);
        insertAxis({ axis: action.axis, index, count: action.count });
        break;
      }
      case "delete": {
        const index = action.axis === "row" ? range.start.row : range.start.column;
        const count = (action.axis === "row" ? range.end.row : range.end.column) - index + 1;
        deleteAxis({ axis: action.axis, index, count });
        break;
      }
      case "formatCells":
        openCellFormat("number");
        break;
      case "formatPainter":
        activateFormatPainter();
        break;
      case "sort":
        sortSelection(action.direction);
        break;
      case "clearFilter":
        clearFilter();
        break;
      case "applyStyle":
        applyCellStyle(action.patch);
        break;
      case "applyBorders":
        applyCellBorders(action.action);
        break;
      case "updateBorderFormat":
        updateBorderFormat(action.patch);
        break;
      case "merge":
        mergeSelection(action.mode);
        break;
      case "unmerge":
        unmergeSelection();
        break;
      case "autoSum":
        formulaTools.aggregate("SUM");
        break;
    }
  },
});
const { statisticsRange, choiceAddress, filterState: contextFilterState } = contextActions;
watch(workbookGeneration, () => cellEditSession.cancel(), { flush: "sync" });
const cellFormatSelection = shallowRef<CellFormatSelection>();
const cellFormatInitialTab = ref<CellFormatTab>("border");
const conditionalFormattingSelection = shallowRef<ConditionalFormattingSelection>();
const conditionalFormattingSheets = shallowRef<readonly ConditionalFormatManagerSheet[]>([]);
const conditionalFormatQuickRule = ref<ConditionalFormatQuickRule>();
const conditionalFormatRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const conditionalFormatPickingValue = ref(false);
const { active: pickingConditionalFormatRange, reference: pickedConditionalFormatReference } =
  conditionalFormatRangePicker;
watch(workbookGeneration, () => {
  cellFormatSelection.value = undefined;
  conditionalFormattingSelection.value = undefined;
  conditionalFormattingSheets.value = [];
  conditionalFormatRangePicker.cancel();
});

function openCellFormat(tab: CellFormatTab = "border"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  cellFormatInitialTab.value = tab;
  cellFormatSelection.value = captureCellFormatSelection();
}

function closeCellFormat(): void {
  cellFormatSelection.value = undefined;
  void nextTick(focusCellEditor);
}

function confirmCellFormat(change: CellFormatChange): void {
  const target = cellFormatSelection.value;
  if (!target) return;
  applyCellFormat(change, target);
  closeCellFormat();
}

function openConditionalFormatting(kind?: ConditionalFormatQuickRule): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  const target = captureConditionalFormattingSelection();
  if (!target) return;
  const preset = kind ? getConditionalFormatPreset(kind) : undefined;
  if (preset) {
    setConditionalFormats(
      [
        {
          id: createConditionalFormatRuleId(),
          ranges: [target.range],
          anchor: { ...target.range.start },
          condition: preset,
          style: {},
        },
        ...target.rules,
      ],
      target,
    );
    void nextTick(focusCellEditor);
    return;
  }
  conditionalFormatQuickRule.value = kind;
  conditionalFormattingSelection.value = target;
  conditionalFormattingSheets.value = sheets.value.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    rules: (sheet.conditionalFormats ?? []).map(cloneConditionalFormatRule),
    selectionRanges: formatConditionalFormatRanges([
      sheet.id === target.sheetId
        ? target.range
        : { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    ]),
    protected: sheet.properties.protected,
  }));
}

function closeConditionalFormatting(): void {
  conditionalFormatRangePicker.cancel();
  conditionalFormattingSelection.value = undefined;
  conditionalFormattingSheets.value = [];
  conditionalFormatQuickRule.value = undefined;
  void nextTick(focusCellEditor);
}

async function selectConditionalFormatReference(
  current: string,
  requestedSheetId?: string,
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const previousSheetId = activeSheet.value.id;
  const sheetId =
    requestedSheetId ?? conditionalFormattingSelection.value?.sheetId ?? previousSheetId;
  if (!workbook.sheets.has(sheetId)) return undefined;
  if (sheetId !== previousSheetId) selectSheet(sheetId);
  let selected: string | undefined;
  try {
    selected = await conditionalFormatRangePicker.selectReference(current);
  } finally {
    if (
      session.workbook === workbook &&
      workbookGeneration.value === generation &&
      activeSheet.value.id !== previousSheetId &&
      workbook.sheets.has(previousSheetId)
    ) {
      selectSheet(previousSheetId);
    }
  }
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !conditionalFormattingSelection.value
  )
    return undefined;
  if (selected === undefined) return undefined;
  const target = resolveRangeReference(workbook, selected, sheetId);
  if (!target || target.sheetId !== sheetId) return undefined;
  return formatConditionalFormatRanges([target.range]);
}

async function selectConditionalFormatValueReference(
  current: string,
  requestedSheetId?: string,
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const previousSheetId = activeSheet.value.id;
  const sheetId =
    requestedSheetId ?? conditionalFormattingSelection.value?.sheetId ?? previousSheetId;
  if (!workbook.sheets.has(sheetId)) return undefined;
  if (sheetId !== previousSheetId) selectSheet(sheetId);
  conditionalFormatPickingValue.value = true;
  try {
    const selected = await conditionalFormatRangePicker.selectReference(current);
    if (
      session.workbook !== workbook ||
      workbookGeneration.value !== generation ||
      !conditionalFormattingSelection.value
    )
      return undefined;
    if (selected === undefined) return undefined;
    const target = resolveRangeReference(workbook, selected, sheetId);
    if (!target) return undefined;
    const reference = formatRangeReference(workbook.sheets.get(target.sheetId)!.name, target.range);
    return target.sheetId === sheetId
      ? `=${reference.slice(reference.lastIndexOf("!") + 1)}`
      : reference;
  } finally {
    if (
      session.workbook === workbook &&
      workbookGeneration.value === generation &&
      activeSheet.value.id !== previousSheetId &&
      workbook.sheets.has(previousSheetId)
    ) {
      selectSheet(previousSheetId);
    }
    conditionalFormatPickingValue.value = false;
  }
}

function saveConditionalFormats(rules: Parameters<typeof setConditionalFormats>[0]): void {
  const target = conditionalFormattingSelection.value;
  if (!target) return;
  if (setConditionalFormats(rules, target)) closeConditionalFormatting();
}

function saveConditionalFormatSheets(changes: ConditionalFormatSheetChange[]): void {
  const target = conditionalFormattingSelection.value;
  if (!target) return;
  if (setConditionalFormatsForSheets(changes, target.generation)) closeConditionalFormatting();
}

function clearConditionalFormatRules(scope: "selection" | "sheet"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  clearConditionalFormats(scope);
}

function onSelectSheet(sheetId: string): void {
  if (sheetGridRef.value?.flushPendingShapeTextEdit() === false) return;
  if (cellEditSession.state.composing) return;
  if (cellEditSession.state.active && cellEditSession.state.draft.startsWith("=")) {
    cellEditSession.activateSurface("formula-bar");
    selectSheet(sheetId);
    void nextTick(focusFormulaBarOrGrid);
    return;
  }
  if (cellEditSession.finish()) selectSheet(sheetId);
}

async function onTraverseFromFormulaBar(payload: {
  address: { row: number; column: number };
  direction: "up" | "down" | "left" | "right";
  sheetId?: string;
}): Promise<void> {
  if (payload.sheetId && payload.sheetId !== activeSheet.value.id) {
    selectSheet(payload.sheetId);
    await nextTick();
  }
  traverseFromFormulaBar(payload);
}

function onCancelFormulaEdit(sheetId?: string): void {
  if (sheetId && sheetId !== activeSheet.value.id) selectSheet(sheetId);
  void nextTick(focusCellEditor);
}

const assetStore = props.imageAssetStore ?? createIndexedDbImageAssetStore();
const workbookTheme = computed(() => {
  void workbookRevision.value;
  return session.workbook.theme;
});
provide(workbookThemeKey, workbookTheme);
const themeDialogVisible = ref(false);
const pageThemeController = usePageThemeController({
  isBusy: () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    [...session.workbook.sheets.values()].some((sheet) => sheet.properties.protected),
  finishEditing: () => cellEditSession.finish(),
  execute: executeCommand,
  focus: focusCellEditor,
});
const decorations = usePageDecorationActions({
  assetStore,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  flushPendingEdits: () => cellEditSession.finish(),
  setDecoration: (sheetId, decoration) =>
    executeCommand(createSetSheetPageDecorationCommand(sheetId, decoration)),
  setWatermarks: (sheetIds, watermark, presets) =>
    executeCommand(createSetSheetsWatermarkCommand(sheetIds, watermark, presets)),
  setPresets: (presets) => executeCommand(createSetWorkbookWatermarkPresetsCommand(presets)),
});
watch(watermarkVisible, (visible) => {
  if (!visible) decorations.cancelWatermark();
});
const { busy: decorationBusy, current: pageDecoration, feedback: decorationFeedback } = decorations;
watch(decorationFeedback, (feedback) => {
  if (feedback) void MessagePlugin.error(t(`pageDecoration.${feedback}`));
});

const {
  urls: imageAssetUrls,
  sizes: imageAssetSizes,
  loading: loadingImageAssetIds,
  missing: missingImageAssetIds,
} = useImageAssetUrls(() => session.workbook, assetStore);
const pictureOwnerGeneration = ref(0);
watch(
  () => [session.workbook, activeSheet.value, workbookGeneration.value],
  () => {
    pictureOwnerGeneration.value += 1;
  },
  { flush: "sync" },
);
const pictureCellConversion = usePictureCellConversion({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getSelectedIds: () => selectedPictureIds.value,
  getSelectedPath: () => selectedOwnedPicturePath.value,
  flushPendingEdits: () =>
    cellEditSession.finish() && (sheetGridRef.value?.applyPendingPictureCrop() ?? true),
  apply: convertFloatingImageToCell,
  onApplied: (address) => {
    sheetGridRef.value?.selectFloatingImage(null);
    navigateToAddress(formatCellAddress(address));
  },
});

const imageActions = useSheetImageActions({
  assetStore,
  execute: (command) => {
    const oldIds = new Set(activeSheet.value.floatingImages.map((image) => image.id));
    const result = executeCommand(command);
    if (command.type === "setSheetFloatingImages" && command.sheetId === activeSheet.value.id) {
      const added = activeSheet.value.floatingImages
        .filter((image) => !oldIds.has(image.id))
        .map((image) => image.id);
      if (added.length) void nextTick(() => sheetGridRef.value?.selectFloatingImages(added));
    }
    return result;
  },
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getAddress: () => activeAddress.value,
  getSelectedIds: () => selectedPictureIds.value,
  getSelectedPath: () => selectedOwnedPicturePath.value,
  getFrameContext: () => sheetGridRef.value?.getPictureFrameContext(activeSheet.value),
  flushPendingEdits: () => cellEditSession.finish(),
  setCellImage,
  setFloatingImage: (image, sheetId) => {
    const changed = setFloatingImage(image, sheetId);
    if (changed && activeSheet.value.id === sheetId)
      void nextTick(() => sheetGridRef.value?.selectFloatingImage(image.id));
    return changed;
  },
  convertCellImageToFloating,
});
const pictureCellOverwriteConfirmation = computed<PictureCellOverwriteConfirmation | null>(
  () => imageActions.insertionConfirmation.value ?? pictureCellConversion.confirmation.value,
);
watch(
  imageActions.insertionConfirmation,
  (confirmation) => {
    if (confirmation) pictureCellConversion.confirmation.value = null;
  },
  { flush: "sync" },
);
watch(
  pictureCellConversion.confirmation,
  (confirmation) => {
    if (confirmation) imageActions.cancelPending();
  },
  { flush: "sync" },
);
function showImageFeedback(key: MessageKey): void {
  if (key === "image.unchanged" || key === "clipboard.readyToMove") {
    void MessagePlugin.info(t(key));
  } else if (
    key === "image.inserted" ||
    key === "image.copied" ||
    key === "image.convertedToFloating"
  ) {
    void MessagePlugin.success(t(key));
  } else {
    void MessagePlugin.error(t(key));
  }
}
watch(
  imageActions.feedback,
  (key) => {
    if (key) showImageFeedback(key);
  },
  { flush: "sync" },
);
const pivotActions = usePivotActions({
  getWorkbook: () => session.workbook,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  name: () => t("pivot.title"),
  total: () => t("pivot.total"),
  empty: () => t("pivot.empty"),
  sumCaption: (field) => `${t("pivot.sum")} · ${field}`,
  consolidationLabels: () => [
    t("pivot.rows"),
    t("pivot.columns"),
    t("pivot.values"),
    t("pivot.pageField", { index: 1 }),
    t("pivot.pageField", { index: 2 }),
    t("pivot.pageField", { index: 3 }),
    t("pivot.pageField", { index: 4 }),
  ],
  pageItemPrefix: () => t("pivot.pageItemPrefix"),
  valueCaption: (aggregate, field) =>
    t(aggregate === "sum" ? "pivot.sumOf" : "pivot.countOf", { field }),
  reportLayout: () => ({
    rowLabel: t("pivot.rows"),
    columnLabel: t("pivot.columns"),
    allLabel: t("pivot.reportAll"),
    multipleLabel: t("pivot.reportMultiple"),
  }),
  activate: (sheetId, table) => {
    const workbook = session.workbook;
    const generation = workbookGeneration.value;
    selectSheet(sheetId);
    void nextTick(() => {
      if (
        session.workbook !== workbook ||
        workbookGeneration.value !== generation ||
        activeSheet.value.id !== sheetId ||
        !activeSheet.value.pivotTables?.includes(table)
      )
        return;
      sheetGridRef.value?.navigateToCell(table.anchor);
      pivotFieldsVisible.value = true;
    });
  },
  activateDetails: (sheetId) => {
    selectSheet(sheetId);
    void nextTick(() => sheetGridRef.value?.navigateToCell({ row: 0, column: 0 }));
  },
  onDetailsError: (reason) => {
    void MessagePlugin.error(
      t(
        reason === "cache"
          ? "pivot.detailsNeedRefresh"
          : reason === "protected"
            ? "pivot.error.protected"
            : "pivot.detailsFailed",
      ),
    );
  },
  onError: () => {
    void MessagePlugin.error(t("pivot.refreshFailed"));
  },
});
const {
  dialog: pivotDialog,
  editing: editingPivot,
  error: pivotError,
  errorReason: pivotErrorReason,
} = pivotActions;
const activePivot = computed(() => {
  void workbookRevision.value;
  return pivotActions.selected();
});
const pivotFieldsVisible = ref(false);
const pivotFieldSettingsOpen = ref(false);
const pivotFieldsPaneRef = shallowRef<InstanceType<typeof PivotFieldsPane>>();
const pivotStyles = computed(() => [...createThemedTableStyles(), ...customPivotTableStyles.value]);
const pivotDisabled = computed(
  () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !canUseSheetPermission(activeSheet.value, "pivotTables"),
);
const pivotActiveField = computed<{ area: PivotArea; index: number; name: string } | undefined>(
  () => {
    const table = activePivot.value;
    if (!table) return undefined;
    let headers: string[] = [];
    try {
      headers = getPivotTableSource(session.workbook, table).headers;
    } catch {
      return undefined;
    }
    return getPivotActiveField(table, headers, activeAddress.value);
  },
);
const pivotGroupField = computed(() => {
  const table = activePivot.value,
    field = pivotActiveField.value;
  if (!table || !field || (field.area !== "rows" && field.area !== "columns")) return undefined;
  return (field.area === "rows" ? table.rowFields : table.columnFields)[field.index];
});
const pivotGrouping = usePivotGrouping({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  selected: pivotActions.selected,
  getField: () => pivotGroupField.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.error(t("pivot.groupFailed"));
  },
});
const { draft: pivotGroupingDraft } = pivotGrouping;
watch(workbookGeneration, pivotGrouping.close);
watch(() => activeSheet.value.id, pivotGrouping.close);
watch(
  () => activePivot.value?.id,
  (id) => {
    pivotFieldsVisible.value = !!id;
  },
);
function openPivotFields(id?: string): void {
  const table = pivotActions.selected(id);
  if (!table) return;
  sheetGridRef.value?.navigateToCell(table.anchor);
  pivotFieldsVisible.value = true;
}
function openPivotFieldSettings(): void {
  const field = pivotActiveField.value;
  pivotFieldsVisible.value = true;
  void nextTick(() => pivotFieldsPaneRef.value?.openFieldSettings(field));
}
const pivotRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingPivotRange, reference: pickedPivotReference } = pivotRangePicker;
const selectPivotReference = computed(() => {
  const dialog = pivotDialog.value;
  return (current: string): Promise<string | undefined> =>
    dialog && pivotDialog.value === dialog
      ? pivotRangePicker.selectReference(current)
      : Promise.resolve(undefined);
});
watch(editingPivot, () => pivotRangePicker.cancel(), { flush: "sync" });
watch(
  () => activeSheet.value.id,
  () => {
    if (!pickingPivotRange.value) pivotActions.closeOnSheetChange();
  },
  { flush: "sync" },
);
const controlActions = useFormControlActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  getEvaluator: () => activeSheetEvaluator.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  name: (type) => t(`control.${type}`),
});
const { dialog: controlDialog, editing: editingControl, error: controlError } = controlActions;
const controlRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingControlRange, reference: pickedControlReference } = controlRangePicker;
watch(controlDialog, () => controlRangePicker.cancel(), { flush: "sync" });
const attachmentActions = useAttachmentActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.error(t("attachment.failed"));
  },
});
const { viewing: viewingAttachment, busy: attachmentBusy } = attachmentActions;
watch(() => activeSheet.value.id, attachmentActions.close);
watch(workbookGeneration, attachmentActions.close);
const cameraActions = useCameraActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getRange: () => activeSelectionRange.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  name: () => t("camera.title"),
});
const { dialog: cameraDialog, editing: editingCamera, error: cameraError } = cameraActions;
const cameraRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingCameraRange, reference: pickedCameraReference } = cameraRangePicker;
watch(cameraDialog, () => cameraRangePicker.cancel(), { flush: "sync" });
const sparklineActions = useSparklineActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  getGeneration: () => workbookGeneration.value,
  flush: () => cellEditSession.finish(),
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  execute: executeCommand,
});
const {
  dialog: sparklineDialog,
  draft: sparklineDraft,
  error: sparklineError,
  failed: sparklineFailed,
} = sparklineActions;
const sparklineRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingSparklineRange, reference: pickedSparklineReference } = sparklineRangePicker;
let sparklinePickerSequence = 0;
const sparklinePicker = shallowRef<{ id: number; confirm: () => void; cancel: () => void }>();
const selectSparklineReference = computed(() => {
  const dialog = sparklineDialog.value;
  return async (current: string): Promise<string | undefined> => {
    if (!dialog?.isCurrent()) return undefined;
    const selection = sparklineRangePicker.selectReference(current);
    const picker = {
      id: ++sparklinePickerSequence,
      confirm: () => {
        if (sparklinePicker.value === picker && dialog.isCurrent()) sparklineRangePicker.confirm();
      },
      cancel: () => {
        if (sparklinePicker.value === picker && dialog.isCurrent()) sparklineRangePicker.cancel();
      },
    };
    sparklinePicker.value = picker;
    const result = await selection;
    if (sparklinePicker.value === picker) sparklinePicker.value = undefined;
    return dialog.isCurrent() ? result : undefined;
  };
});
watch(
  sparklineDialog,
  () => {
    sparklineRangePicker.cancel();
    sparklinePicker.value = undefined;
  },
  { flush: "sync" },
);
const selectedChartId = ref<string | null>(null);
const chartFormatPaneVisible = ref(false);
const chartFormatPaneRef = ref<InstanceType<typeof ChartFormatPane>>();
const chartFormatTarget = shallowRef<ChartFormatTarget>({ kind: "chart" });
watch(
  [activeSheet, workbookGeneration],
  () => {
    selectedChartId.value = null;
    chartFormatPaneVisible.value = false;
    chartFormatTarget.value = { kind: "chart" };
  },
  { flush: "sync" },
);
const chartActions = useChartActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  name: () => t("chart.tools"),
  title: () => t("chart.defaultTitle"),
  onInserted: (drawingId) => sheetGridRef.value?.selectDrawing(drawingId),
  onEditPivot: openPivotFields,
});
const { dialog: chartDialog, editing: editingChart, error: chartError } = chartActions;
const chartSourceActions = useChartSourceActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getEvaluator: () => activeSheetEvaluator.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || !!chartDialog.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  execute: executeCommand,
  selectSheet,
  selectDrawing: (drawingId) => sheetGridRef.value?.selectDrawing(drawingId),
  selectReference: (current, role) => selectChartSourceReference(current, role),
});
const { dialog: chartSourceDialog, error: chartSourceError } = chartSourceActions;
function openChartSource(drawing: SheetChartDrawing): void {
  if (getChartSourceApplicability(drawing.chart) === "editable") chartSourceActions.edit(drawing);
  else chartActions.edit(drawing);
}
const chartObjectControls = useChartObjectControls({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getSelectedId: () => selectedChartId.value,
  isBusy: () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !!chartDialog.value ||
    !!chartSourceDialog.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  execute: executeCommand,
  edit: chartActions.edit,
  source: openChartSource,
  format: openChartFormat,
  getData: (_drawing, chart) =>
    getSheetChartData(activeSheet.value, chart, activeSheetEvaluator.value, (sheetId) =>
      session.workbook.sheets.get(sheetId),
    ),
  getSourceData: (_drawing, chart) =>
    getSheetChartSourceData(activeSheet.value, chart, activeSheetEvaluator.value, (sheetId) =>
      session.workbook.sheets.get(sheetId),
    ),
  getAxisTitle: () => t("chart.axisTitlePlaceholder"),
});
const chartObjectContext = chartObjectControls.snapshot;
const chartLayoutPreview = chartObjectControls.paintPreview;
const chartFormatControls = useChartFormatControls({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getSelectedId: () => selectedChartId.value,
  getTarget: () => chartFormatTarget.value,
  getEvaluator: () => activeSheetEvaluator.value,
  isOpen: () => chartFormatPaneVisible.value,
  isBusy: () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !!chartDialog.value ||
    !!chartSourceDialog.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  execute: executeCommand,
});
const chartFormatContext = chartFormatControls.snapshot;
const chartFormatChoices = computed(() => {
  void workbookRevision.value;
  const owner = chartObjectContext.value;
  if (!owner) return [];
  try {
    const data = getSheetChartSourceData(
      activeSheet.value,
      owner.drawing.chart,
      activeSheetEvaluator.value,
      (sheetId) => session.workbook.sheets.get(sheetId),
    );
    const visibleData = getSheetChartData(
      activeSheet.value,
      owner.drawing.chart,
      activeSheetEvaluator.value,
      (sheetId) => session.workbook.sheets.get(sheetId),
    );
    const series = getChartFormatSeries(owner.drawing.chart, data);
    const seriesNames = new Map<string, number>();
    for (const entry of series) seriesNames.set(entry.name, (seriesNames.get(entry.name) ?? 0) + 1);
    const hidden = new Set(owner.drawing.chart.seriesFilter?.hiddenSeriesIds);
    return getChartFormatTargets(owner.drawing.chart, data, visibleData).map((target) => ({
      target,
      label:
        target.kind === "series"
          ? t(
              hidden.has(target.seriesId)
                ? "chart.formatHiddenSeriesName"
                : "chart.formatSeriesName",
              {
                name: (() => {
                  const index = series.findIndex((entry) => entry.id === target.seriesId);
                  const entry = series[index];
                  if (!entry) return target.seriesId;
                  return (seriesNames.get(entry.name) ?? 0) > 1
                    ? t("chart.formatDuplicateSeriesName", { name: entry.name, index: index + 1 })
                    : entry.name;
                })(),
              },
            )
          : target.kind === "chart"
            ? t("chart.formatChartArea")
            : target.kind === "title"
              ? t("chart.title")
              : target.kind === "plot"
                ? t("chart.formatPlotArea")
                : target.kind === "categoryAxis"
                  ? t("chart.formatCategoryAxis")
                  : target.kind === "secondaryValueAxis"
                    ? t("chart.formatSecondaryValueAxis")
                    : t("chart.formatValueAxis"),
    }));
  } catch {
    return [{ target: { kind: "chart" } as ChartFormatTarget, label: t("chart.formatChartArea") }];
  }
});
function openChartFormat(drawing: SheetChartDrawing, target: ChartFormatTarget): void {
  if (
    drawing !== chartObjectContext.value?.drawing ||
    !activeSheet.value.drawings?.includes(drawing)
  )
    return;
  if (
    !chartFormatChoices.value.some(
      (entry) => chartFormatTargetKey(entry.target) === chartFormatTargetKey(target),
    )
  )
    return;
  if (
    chartFormatPaneVisible.value &&
    chartFormatTargetKey(target) !== chartFormatTargetKey(chartFormatTarget.value) &&
    chartFormatPaneRef.value?.canChangeTarget() === false
  )
    return;
  shapeFormatPane.close();
  shapeGroupFormatPane.close();
  shapeConnectorFormatPane.close();
  pictureTools.paneVisible.value = false;
  chartFormatTarget.value = target;
  chartFormatPaneVisible.value = true;
}
function selectChartFormatElement(
  drawing: SheetChartDrawing,
  target: ChartFormatTarget,
  openPane: boolean,
): void {
  if (
    !activeSheet.value.drawings?.includes(drawing) ||
    drawing !== chartObjectContext.value?.drawing
  )
    return;
  if (openPane || chartFormatPaneVisible.value) chartObjectContext.value?.format?.(target);
  else if (
    chartFormatChoices.value.some(
      (entry) => chartFormatTargetKey(entry.target) === chartFormatTargetKey(target),
    )
  )
    chartFormatTarget.value = target;
}
const chartRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingChartRange, reference: pickedChartReference } = chartRangePicker;
let chartPickerId = 0;
const chartPicker = shallowRef<{ id: number; confirm: () => void; cancel: () => void }>();
const selectChartReference = computed(() => {
  const dialog = chartDialog.value;
  return async (current: string): Promise<string | undefined> => {
    if (!dialog?.isCurrent() || dialog.initial.chart.pivotTableId) return undefined;
    const selected = chartRangePicker.selectReference(current);
    const picker = {
      id: ++chartPickerId,
      confirm: () => {
        if (chartPicker.value === picker && dialog.isCurrent()) chartRangePicker.confirm();
      },
      cancel: () => {
        if (chartPicker.value === picker && dialog.isCurrent()) chartRangePicker.cancel();
      },
    };
    chartPicker.value = picker;
    const result = await selected;
    const ownedPicker = chartPicker.value === picker;
    if (ownedPicker) chartPicker.value = undefined;
    const canRestoreExisting = () =>
      !!dialog.existing &&
      dialog.isCurrent() &&
      !loading.value &&
      !fileBusy.value &&
      !xlsxBusy.value &&
      canUseSheetPermission(dialog.sheet, "editObjects");
    if (ownedPicker && canRestoreExisting()) {
      // Grid picking may clear selection; restore only this still-current edit owner.
      await nextTick();
      if (chartPickerId === picker.id && !chartPicker.value && canRestoreExisting())
        sheetGridRef.value?.selectDrawing(dialog.existing!.id);
    }
    return dialog.isCurrent() ? result : undefined;
  };
});
async function selectChartSourceReference(
  current: string,
  role: ChartSourceReferenceRole,
): Promise<string | undefined> {
  const dialog = chartSourceDialog.value;
  if (!dialog?.isCurrent()) return undefined;
  const selected = chartRangePicker.selectReference(current, {
    singleCell: role === "series-name",
  });
  const picker = {
    id: ++chartPickerId,
    confirm: () => {
      if (chartPicker.value === picker && dialog.isCurrent()) chartRangePicker.confirm();
    },
    cancel: () => {
      if (chartPicker.value === picker && dialog.isCurrent()) chartRangePicker.cancel();
    },
  };
  chartPicker.value = picker;
  const result = await selected;
  if (chartPicker.value === picker) chartPicker.value = undefined;
  return dialog.isCurrent() ? result : undefined;
}
watch(
  [chartDialog, chartSourceDialog],
  () => {
    chartRangePicker.cancel();
    chartPicker.value = undefined;
  },
  { flush: "sync" },
);
watch(workbookGeneration, () => {
  drawingActions.close();
  symbolDialog.value = undefined;
});
function insertPivot(chart: boolean): void {
  if (chart && activePivot.value) chartActions.insertPivot(activePivot.value.id);
  else if (!activePivot.value) pivotActions.open(chart);
}
function editSheetDrawing(drawing: SheetDrawing): void {
  if (drawing.kind !== "equation") equationOpenRequest++;
  if (drawing.kind === "shapeGroup") {
    openShapeGroupFormat(drawing, [drawing.id]);
    return;
  }
  if (drawing.kind === "chart") chartActions.edit(drawing);
  else if (drawing.kind === "control") controlActions.open(drawing);
  else if (drawing.kind === "attachment") attachmentActions.viewing.value = drawing;
  else if (drawing.kind === "camera") cameraActions.open(drawing);
  else if (drawing.kind === "equation") beginEquationEdit(drawing);
  else drawingActions.edit(drawing);
}
const symbolDialog = shallowRef<{
  dialogId: number;
  insert: (symbol: SymbolInsertion) => boolean;
  close: () => void;
}>();
const symbolVisible = computed(() => !!symbolDialog.value);
const symbolPreferences = useSymbolPreferences();
let symbolDialogSequence = 0;
const captureBusy = ref(false);
function openSymbolDialog(): void {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !canEditCell(activeSheet.value, activeAddress.value)
  )
    return;
  const generation = workbookGeneration.value;
  const sheet = activeSheet.value;
  const address = { ...activeAddress.value };
  const priorSurface = cellEditSession.state.active ? cellEditSession.state.surface : "grid";
  if (
    !cellEditSession.begin(
      {
        sheetId: sheet.id,
        address,
        input: activeCellInput.value,
        content: getCellContent(sheet, address),
        asText: isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat),
      },
      { surface: priorSurface, mode: "append" },
    )
  )
    return;
  const editGeneration = cellEditSession.state.generation;
  const documentRevision = workbookRevision.value;
  let revision = cellEditSession.state.revision;
  const current = {
    dialogId: ++symbolDialogSequence,
    insert: (symbol: SymbolInsertion) => {
      if (
        symbolDialog.value !== current ||
        workbookGeneration.value !== generation ||
        activeSheet.value !== sheet ||
        activeAddress.value.row !== address.row ||
        activeAddress.value.column !== address.column ||
        cellEditSession.state.generation !== editGeneration ||
        workbookRevision.value !== documentRevision ||
        cellEditSession.state.revision !== revision
      )
        return false;
      const accepted = insertSymbol(symbol, false);
      if (accepted) revision = cellEditSession.state.revision;
      return accepted;
    },
    close: () => {
      if (symbolDialog.value !== current) return;
      symbolDialog.value = undefined;
      if (cellEditSession.state.generation === editGeneration) {
        cellEditSession.activateSurface(priorSurface);
        void nextTick(priorSurface === "formula-bar" ? focusFormulaBarOrGrid : focusCellEditor);
      }
    },
  };
  symbolDialog.value = current;
}
function insertSymbol(symbol: SymbolInsertion, restoreFocus = true): boolean {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !canEditCell(activeSheet.value, activeAddress.value) ||
    cellEditSession.state.composing ||
    !validSymbolInsertion(symbol)
  )
    return false;
  const formula =
    (cellEditSession.state.active ? cellEditSession.state.draft : activeCellInput.value).startsWith(
      "=",
    ) &&
    !isTextCellNumberFormat(getCellStyle(activeSheet.value, activeAddress.value)?.numberFormat);
  if (symbol.fontFamily && !formula && !canUseSheetPermission(activeSheet.value, "formatCells")) {
    void MessagePlugin.warning(t("workspace.cellEditUnavailable"));
    return false;
  }
  if (
    !cellEditSession.begin(
      {
        sheetId: activeSheet.value.id,
        address: activeAddress.value,
        input: activeCellInput.value,
        content: getCellContent(activeSheet.value, activeAddress.value),
        asText: isTextCellNumberFormat(
          getCellStyle(activeSheet.value, activeAddress.value)?.numberFormat,
        ),
      },
      {
        surface: cellEditSession.state.active ? cellEditSession.state.surface : "grid",
        mode: "append",
      },
    )
  )
    return false;
  if (
    !cellEditSession.replaceSelection(symbol.text, formula ? undefined : symbol.fontFamily, {
      preserveLiteral: !formula,
      preserveTypingFont: !formula,
    })
  )
    return false;
  if (restoreFocus)
    void nextTick(
      cellEditSession.state.surface === "formula-bar" ? focusFormulaBarOrGrid : focusCellEditor,
    );
  return true;
}
const quickSymbolInsert = computed(() => {
  const generation = workbookGeneration.value;
  const sheet = activeSheet.value;
  const address = { ...activeAddress.value };
  const editGeneration = cellEditSession.state.generation;
  const revision = cellEditSession.state.revision;
  const documentRevision = workbookRevision.value;
  const selection = { ...cellEditSession.state.selection };
  return (symbol: SymbolInsertion): boolean => {
    if (
      workbookGeneration.value !== generation ||
      activeSheet.value !== sheet ||
      activeAddress.value.row !== address.row ||
      activeAddress.value.column !== address.column ||
      cellEditSession.state.generation !== editGeneration ||
      cellEditSession.state.revision !== revision ||
      workbookRevision.value !== documentRevision ||
      symbolVisible.value ||
      cellEditSession.state.selection.start !== selection.start ||
      cellEditSession.state.selection.end !== selection.end ||
      cellEditSession.state.selection.direction !== selection.direction
    )
      return false;
    return insertSymbol(symbol);
  };
});
watch(
  () => activeSheet.value.id,
  () => {
    symbolDialog.value = undefined;
  },
);
async function insertScreenCapture(): Promise<void> {
  if (
    captureBusy.value ||
    imageBusy.value ||
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    !canUseSheetPermission(activeSheet.value, "editObjects") ||
    !cellEditSession.finish()
  )
    return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    void MessagePlugin.warning(t("drawing.captureUnsupported"));
    return;
  }
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const address = { ...activeAddress.value };
  captureBusy.value = true;
  try {
    const file = await captureScreen();
    if (
      file &&
      session.workbook === workbook &&
      activeSheet.value.id === sheetId &&
      canUseSheetPermission(activeSheet.value, "editObjects")
    )
      await imageActions.pasteImageFile(file, "floating", address);
  } catch {
    void MessagePlugin.error(t("drawing.captureFailed"));
  } finally {
    captureBusy.value = false;
  }
}
const persistence = useWorkbookPersistence({
  store: props.workbookStore ?? createIndexedDbWorkbookStore(),
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  replaceWorkbook,
});
const { loading, status: saveStatus, error: saveError } = persistence;
const fileActions = useWorkbookFileActions({
  persistence,
  assetStore,
  getWorkbook: () => session.workbook,
  flushPendingEdits: () => cellEditSession.finish() && flushPendingGridEdit(),
  hasPendingEdits: () => cellEditSession.hasPendingEdit() || hasPendingGridEdit(),
  isBlocked: () =>
    xlsxActions.busy.value ||
    xlsxActions.passwordRequired.value ||
    xlsxActions.confirmation.value !== undefined,
});
const { busy: fileBusy, confirmation, feedback } = fileActions;
const xlsxActions = useWorkbookXlsxActions({
  assetStore,
  persistence,
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  flushPendingEdits: () => cellEditSession.finish() && flushPendingGridEdit(),
  hasPendingEdits: () => cellEditSession.hasPendingEdit() || hasPendingGridEdit(),
  isBlocked: () => fileBusy.value || confirmation.value !== undefined || imageBusy.value,
});
const {
  busy: xlsxBusy,
  confirmation: xlsxConfirmation,
  feedback: xlsxFeedback,
  report: xlsxReport,
} = xlsxActions;

const shapeTextImages = createCanvasImageCache(() => {});
onBeforeUnmount(shapeTextImages.dispose);
function getShapePaintAssetSize(id: string) {
  const size = imageAssetSizes.value.get(id);
  if (size) return size;
  const image =
    shapePaintAssets.getAssetImage(id) ??
    (imageAssetUrls.value.get(id)
      ? shapeTextImages.peek?.(imageAssetUrls.value.get(id)!)
      : undefined);
  return image ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
}
const chartPrintSheetResolver = computed(() => {
  void workbookRevision.value;
  const workbook = session.workbook;
  return (id: string) => workbook.sheets.get(id);
});
const textBoxReferenceResolver = computed(() => {
  void workbookRevision.value;
  return createTextBoxReferenceResolver({
    workbook: session.workbook,
    evaluator: activeSheetEvaluator.value,
    locale: locale.value,
  });
});
function prepareWorkspaceDrawing(
  sheet: Sheet,
  metrics: PictureSheetMetrics | undefined,
  next: SheetDrawing,
  owner: SheetDrawing | undefined,
  forest?: readonly SheetDrawing[],
  preparationMode?: ShapeTextPreparationMode,
): SheetDrawing {
  return prepareTextBoxReferenceUpdate(
    textBoxReferenceResolver.value,
    next,
    owner,
    sheetGridRef.value?.getDrawingLayout(sheet),
    undefined,
    {
      resources: {
        theme: session.workbook.theme,
        getAssetImage: (id) =>
          shapePaintAssets.getAssetImage(id) ??
          (imageAssetUrls.value.get(id)
            ? shapeTextImages.get(imageAssetUrls.value.get(id)!)
            : undefined),
        getAssetSize: getShapePaintAssetSize,
      },
    },
    metrics,
    forest
      ? {
          candidateForest: forest,
          sourceForest: sheet.drawings ?? [],
          revision: workbookRevision.value,
        }
      : undefined,
    preparationMode,
  );
}
const drawingActions = useDrawingActions({
  preflightConnectedCollection: (pass) => {
    preflightShapeConnectorPaint(pass, {
      theme: session.workbook.theme,
      getAssetSize: getShapePaintAssetSize,
    });
    return true;
  },
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  name: (kind) => t(`drawing.${kind}`),
  prepareDrawing: (next, owner, forest, preparationMode) =>
    prepareWorkspaceDrawing(
      activeSheet.value,
      sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
      next,
      owner,
      forest,
      preparationMode,
    ),
});
const { dialog: drawingDialog, editing: editingDrawing } = drawingActions;
const shapeObjectFormatPaneRef = ref<InstanceType<typeof ShapeFormatPane>>();
const shapeFormatPane = useOwnedShapeFormatPane({
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  update: drawingActions.update,
  isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
  getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
});
const shapeGroupFormatPane = useOwnedShapeGroupFormatPane({
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  replaceCollection: drawingActions.replaceCollection,
  replaceCollectionPreservingGeometry: drawingActions.replaceCollectionPreservingGeometry,
  isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
  getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
  getCameraUnsupportedReason: () => t("drawing.groupCameraConnectorUnavailable"),
  getScopeDescription: (scope) => {
    const description = t("drawing.groupFormatScope", {
      count: scope.descendantCount,
      body: scope.bodyEligibleCount,
      text: scope.textEligibleCount,
    });
    return scope.rotation3dShared
      ? `${description} ${t("drawing.groupCameraScope", { count: scope.rotation3dAffectedCount })}`
      : description;
  },
});
const shapeConnectorFormatPane = useOwnedShapeConnectorFormatPane({
  getLocale: () => (locale.value === "zh-CN" ? "zh-CN" : "en-US"),
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  replaceCollection: drawingActions.replaceCollection,
  isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
  getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
  getPaintResources: () => ({
    theme: session.workbook.theme,
    getAssetSize: getShapePaintAssetSize,
  }),
});
const shapeTextEditSelection = shallowRef<{ start: number; end: number }>();
const shapeTextFieldDrafts = createShapeTextFieldDrafts();
provide(shapeTextFieldDraftsKey, shapeTextFieldDrafts);
const shapeTextEdit = useShapeTextEditSession({
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () => sheetGridRef.value?.flushPendingCellEdit() ?? cellEditSession.finish(),
  replaceCollection: drawingActions.replaceCollection,
  flushFieldDrafts: (id) => shapeTextFieldDrafts.flush(`shape-text-${id}`).accepted,
  focusFieldDraft: (id) => shapeTextFieldDrafts.focusRejected(`shape-text-${id}`),
});
const shapeTextEditCallbacks = computed(() => {
  const current = shapeTextEdit.snapshot.value;
  return current ? shapeTextEdit.callbacks(current.sessionId) : undefined;
});
const shapeTextCharacterPane = useShapeTextCharacterFormatPane({
  getSnapshot: () => shapeTextEdit.snapshot.value,
  getTheme: () => session.workbook.theme,
  getCallbacks: () => shapeTextEditCallbacks.value,
  getWorkbookId: () => session.workbook.id,
  getSheetId: () => activeSheet.value.id,
  getLocale: () => (locale.value === "zh-CN" ? "zh-CN" : "en-US"),
});
function startShapeTextEdit(request: ShapeCanvasTextEditRequest): boolean {
  const keepPropertiesOpen = !!(
    shapeTextCharacterPane.snapshot.value ||
    shapeFormatPane.snapshot.value ||
    shapeGroupFormatPane.snapshot.value ||
    shapeConnectorFormatPane.snapshot.value
  );
  const previous = shapeTextEdit.snapshot.value;
  if (previous && !shapeTextEdit.commit(previous.sessionId)) return false;
  if (!shapeTextEdit.begin(request.root, request.path)) return false;
  const opened = shapeTextEdit.snapshot.value!;
  if (
    request.text !== undefined &&
    !shapeTextEdit.update(opened.sessionId, opened.text + request.text)
  )
    return false;
  const length = shapeTextEdit.snapshot.value!.draftText.length;
  shapeTextEditSelection.value = { start: request.selection === "all" ? 0 : length, end: length };
  shapeTextEdit.setSelection(opened.sessionId, {
    ...shapeTextEditSelection.value,
    direction: request.selection === "all" ? "forward" : "none",
  });
  if (keepPropertiesOpen) shapeTextCharacterPane.open();
  else shapeTextCharacterPane.close();
  shapeFormatPane.close();
  shapeGroupFormatPane.close();
  shapeConnectorFormatPane.close();
  drawingActions.close();
  return true;
}
const equationEdit = useEquationEditSession({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () =>
    sheetGridRef.value
      ? sheetGridRef.value.flushPendingShapeTextEdit() && sheetGridRef.value.flushPendingCellEdit()
      : cellEditSession.finish(),
  execute: executeCommand,
  name: () => t("equation.equation"),
  openInserted: (source) => beginPreparedEquation(++equationOpenRequest, source, undefined, true),
});
const equationPlaceholdersHidden = ref(false);
let equationOpenRequest = 0;
/** A completed source edit replaces all roots. Let the grid consume that revision
 * before taking its exact geometry lease, and reject any intervening owner change. */
function beginPreparedEquation(
  request: number,
  root: SheetDrawing,
  path: ShapeGroupPath | undefined,
  afterCommit: boolean,
): boolean {
  const sheet = activeSheet.value,
    workbook = session.workbook,
    generation = workbookGeneration.value,
    revision = workbookRevision.value,
    fingerprint = JSON.stringify(normalizeSheetDrawing(root));
  const open = () => {
    try {
      if (
        request !== equationOpenRequest ||
        activeSheet.value !== sheet ||
        session.workbook !== workbook ||
        workbookGeneration.value !== generation ||
        workbookRevision.value !== revision ||
        !sheet.drawings?.includes(root) ||
        JSON.stringify(normalizeSheetDrawing(root)) !== fingerprint
      )
        return false;
      const opened = path
        ? isShapeGroupDrawing(root) && equationEdit.beginOwned(root, path)
        : root.kind === "equation" && equationEdit.begin(root);
      if (!opened) return false;
      drawingActions.close();
      shapeFormatPane.close();
      shapeGroupFormatPane.close();
      shapeConnectorFormatPane.close();
      return true;
    } catch {
      return false;
    }
  };
  if (afterCommit) {
    void nextTick(open);
    return true;
  }
  return open();
}
function beginEquationEdit(drawing: EquationRootEditSource): boolean {
  const request = ++equationOpenRequest,
    sheet = activeSheet.value,
    workbook = session.workbook,
    generation = workbookGeneration.value,
    revision = workbookRevision.value;
  if (!sheet.drawings?.includes(drawing)) return false;
  const fingerprint = JSON.stringify(normalizeSheetDrawing(drawing));
  const current = equationEdit.snapshot.value;
  if (current && current.source !== drawing && !equationEdit.callbacks.value?.commit())
    return false;
  // Finishing a sibling normalizes the full collection and replaces untouched root instances too.
  const target = sheet.drawings?.find((root) => root.id === drawing.id);
  if (
    activeSheet.value !== sheet ||
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    target?.kind !== "equation" ||
    JSON.stringify(normalizeSheetDrawing(target)) !== fingerprint
  )
    return false;
  return beginPreparedEquation(request, target, undefined, workbookRevision.value !== revision);
}
function editOwnedDrawing(root: ShapeGroupDrawing, path: ShapeGroupPath): boolean {
  const request = ++equationOpenRequest;
  const node = findShapeGroupNode(root, path)?.node;
  if (!isSheetGroupedEquationDrawing(node)) return drawingActions.editGroupLeaf(root, path);
  const sheet = activeSheet.value,
    workbook = session.workbook,
    generation = workbookGeneration.value,
    revision = workbookRevision.value,
    fingerprint = JSON.stringify(node);
  if (!sheet.drawings?.includes(root)) return false;
  const current = equationEdit.snapshot.value;
  if (
    current &&
    (current.root !== root || current.source !== node) &&
    !equationEdit.callbacks.value?.commit()
  )
    return false;
  // Finishing another mathematical leaf may replace this same outer owner.
  const owner = sheet.drawings?.find((drawing) => drawing.id === root.id);
  if (
    activeSheet.value !== sheet ||
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !isShapeGroupDrawing(owner) ||
    JSON.stringify(findShapeGroupNode(owner, path)?.node) !== fingerprint
  )
    return false;
  return beginPreparedEquation(request, owner, [...path], workbookRevision.value !== revision);
}
const equationInsertHandler = computed(() => {
  const workbook = session.workbook,
    sheet = activeSheet.value,
    generation = workbookGeneration.value;
  const revision = workbookRevision.value;
  return (preset: EquationPresetId | null): boolean => {
    if (
      session.workbook !== workbook ||
      activeSheet.value !== sheet ||
      workbookGeneration.value !== generation ||
      workbookRevision.value !== revision
    )
      return false;
    if (equationEdit.snapshot.value && !equationEdit.callbacks.value?.commit()) return false;
    const textDocument = preset
      ? createEquationPreset(preset, equationEdit.createId)
      : {
          kind: "equation-document-v1" as const,
          body: { kind: "sequence" as const, id: equationEdit.createId(), children: [] },
        };
    return equationEdit.insert(textDocument);
  };
});
const equationMatrixCell = computed(() => {
  const state = equationEdit.snapshot.value,
    node = equationEdit.selectedStructure.value;
  if (!state?.draft || node?.kind !== "matrix") return { row: 0, column: 0 };
  for (let row = 0; row < node.rows.length; row++)
    for (let column = 0; column < node.rows[row]!.length; column++) {
      if (node.rows[row]![column]!.id === state.draft.selection.slotId) return { row, column };
    }
  return { row: 0, column: 0 };
});
function insertEquationTemplate(id: string): boolean {
  const state = equationEdit.snapshot.value;
  if (!state?.draft || state.mode !== "structured") return false;
  try {
    return (
      equationEdit.callbacks.value?.action({
        type: "insert-nodes",
        selection: state.draft.selection,
        nodes: [createEquationTemplate(id, equationEdit.createId)],
      }) === true
    );
  } catch {
    return false;
  }
}
function insertEquationSymbol(payload: EquationSymbolInsertion): boolean {
  const state = equationEdit.snapshot.value;
  if (!state?.draft || state.mode !== "structured") return false;
  return (
    equationEdit.callbacks.value?.action({
      type: "insert-nodes",
      selection: state.draft.selection,
      nodes: [{ kind: payload.kind, id: equationEdit.createId(), value: payload.value }],
    }) === true
  );
}
function insertEquationNormalText(): boolean {
  return equationEdit.callbacks.value?.toggleNormalText() === true;
}
function editEquationMathOption(action: EquationDraftAction): boolean {
  return equationEdit.callbacks.value?.action(action) === true;
}
const textBoxReferenceActions = useTextBoxReference({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getResolver: () => textBoxReferenceResolver.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () =>
    (sheetGridRef.value?.flushPendingShapeTextEdit() ?? true) && cellEditSession.finish(),
  replaceCollection: drawingActions.replaceCollectionPreservingGeometry,
});
const { dialog: textBoxReferenceDialog } = textBoxReferenceActions;
const textBoxReferencePicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingTextBoxReference, reference: pickedTextBoxReference } =
  textBoxReferencePicker;
watch(textBoxReferenceDialog, () => textBoxReferencePicker.cancel(), { flush: "sync" });
const selectTextBoxReference = computed(() => {
  const request = textBoxReferenceDialog.value;
  return async (current: string): Promise<string | undefined> => {
    if (!request?.isCurrent()) return undefined;
    const selected = await textBoxReferencePicker.selectReference(current, { singleCell: true });
    return request.isCurrent() ? selected : undefined;
  };
});
const textBoxReferencePickerCallbacks = computed(() => {
  const request = textBoxReferenceDialog.value;
  return {
    confirm: () => {
      if (textBoxReferenceDialog.value !== request) return;
      if (request?.isCurrent()) textBoxReferencePicker.confirm();
      else textBoxReferencePicker.cancel();
    },
    cancel: () => {
      if (textBoxReferenceDialog.value === request) textBoxReferencePicker.cancel();
    },
  };
});
function openShapeGroupFormat(root: ShapeGroupDrawing, path: ShapeGroupPath) {
  const selected = traverseShapeGroup(root).find(
    ({ path: current }) => JSON.stringify(current) === JSON.stringify(path),
  )?.node;
  if (selected?.kind === "shape" && selected.shapeConnector) {
    if (shapeConnectorFormatPane.open(root, path)) {
      shapeGroupFormatPane.close();
      shapeFormatPane.close();
      drawingActions.close();
      sheetGridRef.value?.selectShapeObjects([path]);
    }
    return;
  }
  if (shapeGroupFormatPane.open(root, path)) {
    shapeConnectorFormatPane.close();
    shapeFormatPane.close();
    drawingActions.close();
    sheetGridRef.value?.selectShapeObjects([path]);
  }
}
function selectedShapeGroupChanged(rootId: string | null, path: ShapeGroupPath | null) {
  const connectorRoot = shapeConnectorFormatPane.root.value;
  if (
    connectorRoot?.kind === "shapeGroup" &&
    (connectorRoot.id !== rootId ||
      JSON.stringify(shapeConnectorFormatPane.path.value) !== JSON.stringify(path))
  ) {
    shapeConnectorFormatPane.close();
    shapePaintAssets.cancel();
  }
  if (
    shapeGroupFormatPane.root.value &&
    (shapeGroupFormatPane.root.value.id !== rootId ||
      JSON.stringify(shapeGroupFormatPane.path.value) !== JSON.stringify(path))
  ) {
    shapeGroupFormatPane.close();
    shapePaintAssets.cancel();
  }
}
const shapePaintAssets = createShapePaintAssetSource({
  getSnapshot: () =>
    shapeTextCharacterPane.ribbonSnapshot.value ??
    shapeRibbonFormat.snapshot.value ??
    shapeConnectorFormatPane.snapshot.value ??
    shapeGroupFormatPane.snapshot.value ??
    shapeFormatPane.snapshot.value,
  store: assetStore,
  preparePixels: async (asset) => {
    if (asset.width * asset.height * 4 > 64 * 1024 * 1024) return;
    const url = URL.createObjectURL(asset.blob),
      image = new Image();
    try {
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  },
});
onBeforeUnmount(shapePaintAssets.dispose);
watch(
  () =>
    [
      shapeFormatPane.drawing.value,
      drawingDialog.value?.initial,
      shapeGroupFormatPane.root.value,
      shapeTextEdit.snapshot.value?.draftView,
      imageAssetUrls.value,
    ] as const,
  ([selected, edited, group, draft, urls]) => {
    const retained = new Set<string>();
    const groupText = group
      ? traverseShapeGroup(group).flatMap((visit) =>
          visit.node.kind === "shape" || visit.node.kind === "textBox" ? [visit.node] : [],
        )
      : [];
    for (const textOwner of [selected, edited, draft, ...groupText])
      for (const id of getShapeTextAssetIds(textOwner?.shapeText, textOwner?.text)) {
        const url = urls.get(id);
        if (url) {
          retained.add(url);
          shapeTextImages.get(url);
        }
      }
    shapeTextImages.retain(retained);
  },
  { immediate: true },
);
const shapePaneRequestedTab = ref<ShapeFormatTab>("fill-line");
function beforeShapeFormatTabChange(tab: ShapeFormatTab): boolean {
  const edit = shapeTextEdit.snapshot.value;
  if (!edit || (tab !== "size-properties" && tab !== "effects")) return true;
  const rootId = edit.sourceRootId,
    path = edit.path,
    sheet = activeSheet.value;
  if (sheetGridRef.value?.flushPendingShapeTextEdit() === false || activeSheet.value !== sheet)
    return false;
  const root = sheet.drawings?.find((value) => value.id === rootId);
  if (!root) return false;
  const opened =
    root.kind === "shapeGroup" ? shapeGroupFormatPane.open(root, path) : shapeFormatPane.open(root);
  if (!opened) return false;
  shapePaneRequestedTab.value = tab;
  return true;
}
function openShapeFormat(drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing) {
  if (drawing.kind === "shape" && drawing.shapeConnector) {
    if (shapeConnectorFormatPane.open(drawing)) {
      shapeFormatPane.close();
      shapeGroupFormatPane.close();
      drawingActions.close();
      sheetGridRef.value?.selectDrawing(drawing.id);
    }
    return;
  }
  if (shapeFormatPane.open(drawing)) {
    shapeConnectorFormatPane.close();
    shapeGroupFormatPane.close();
    drawingActions.close();
    sheetGridRef.value?.selectDrawing(drawing.id);
  }
}
function selectedShapeChanged(id: string | null) {
  if (selectedChartId.value !== id) {
    chartFormatPaneVisible.value = false;
    chartFormatTarget.value = { kind: "chart" };
  }
  selectedChartId.value = activeSheet.value.drawings?.some(
    (node) => node.id === id && node.kind === "chart",
  )
    ? id
    : null;
  if (shapeConnectorFormatPane.root.value && shapeConnectorFormatPane.root.value.id !== id) {
    shapeConnectorFormatPane.close();
    shapePaintAssets.cancel();
  }
  if (shapeGroupFormatPane.root.value && shapeGroupFormatPane.root.value.id !== id) {
    shapeGroupFormatPane.close();
    shapePaintAssets.cancel();
  }
  if (shapeFormatPane.drawing.value && shapeFormatPane.drawing.value.id !== id) {
    shapeFormatPane.close();
    shapePaintAssets.cancel();
  }
}
const shapeInteractionBlocked = ref(false);
let shapeCreationEditorIntent = 0;
const shapeCreation = useShapeCreation({
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || shapeInteractionBlocked.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  name: (choice) => choice.label[locale.value === "zh-CN" ? "zh-CN" : "en-US"],
  getTextBoxFontFamily: () => session.workbook.theme.bodyFont,
  onStart: () => {
    shapeCreationEditorIntent++;
    drawingActions.close();
    sheetGridRef.value?.selectDrawing(null);
  },
  execute: executeCommand,
  onCreated: (drawing, request) => {
    const token = ++shapeCreationEditorIntent;
    if (request.continuous) return;
    if (drawing.kind !== "textBox") {
      sheetGridRef.value?.selectDrawing(drawing.id);
      return;
    }
    // Core normalizes the creation payload again: edit only the durable root,
    // after the updated worksheet metrics have reached the grid.
    const root = request.sheet.drawings?.find((node) => node.id === drawing.id);
    const revision = workbookRevision.value;
    if (!root || root.kind !== "textBox") return;
    void nextTick(() => {
      if (
        token !== shapeCreationEditorIntent ||
        session.workbook !== request.workbook ||
        activeSheet.value !== request.sheet ||
        workbookGeneration.value !== request.generation ||
        workbookRevision.value !== revision ||
        loading.value ||
        fileBusy.value ||
        xlsxBusy.value ||
        shapeInteractionBlocked.value ||
        shapeCreation.request.value ||
        shapeTextEdit.snapshot.value ||
        !request.sheet.drawings?.includes(root) ||
        !sheetGridRef.value?.selectShapeObjects([[root.id]])
      )
        return;
      startShapeTextEdit({ root, selection: "end" });
    });
  },
});
const selectedShapeObjectPaths = shallowRef<readonly ShapeGroupPath[]>([]);
function selectedShapeObjectsChanged(paths: readonly ShapeGroupPath[], owner: Sheet) {
  if (owner !== activeSheet.value) return;
  if (JSON.stringify(paths) === JSON.stringify(selectedShapeObjectPaths.value)) return;
  selectedShapeObjectPaths.value = paths.map((path) => [...path]);
}
function formatShapeObjectPath(path: ShapeGroupPath): boolean {
  const root = activeSheet.value.drawings?.find((node) => node.id === path[0]);
  if (!root) return false;
  if (root.kind === "shapeGroup") {
    openShapeGroupFormat(root, path);
    return (
      JSON.stringify(shapeGroupFormatPane.path.value ?? shapeConnectorFormatPane.path.value) ===
      JSON.stringify(path)
    );
  }
  if (path.length !== 1 || (root.kind !== "shape" && root.kind !== "textBox")) return false;
  openShapeFormat(root);
  return (
    shapeFormatPane.drawing.value?.id === root.id ||
    shapeConnectorFormatPane.root.value?.id === root.id
  );
}
const shapeRibbonFormat = useShapeRibbonFormat({
  getPaths: () => selectedShapeObjectPaths.value,
  isTextEditing: () => !!shapeTextEdit.snapshot.value,
  root: {
    getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
    getWorkbook: () => session.workbook,
    getSheet: () => activeSheet.value,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
    flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
    update: drawingActions.update,
    isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
    getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
  },
  group: {
    getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
    getWorkbook: () => session.workbook,
    getSheet: () => activeSheet.value,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
    flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
    replaceCollection: drawingActions.replaceCollection,
    replaceCollectionPreservingGeometry: drawingActions.replaceCollectionPreservingGeometry,
    isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
    getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
    getCameraUnsupportedReason: () => t("drawing.groupCameraConnectorUnavailable"),
  },
});
const shapeRibbonSnapshot = computed(() =>
  shapeTextEdit.snapshot.value
    ? shapeTextCharacterPane.ribbonSnapshot.value
    : shapeRibbonFormat.snapshot.value,
);
const shapeRibbonCapabilities = computed(() =>
  shapeTextEdit.snapshot.value
    ? shapeTextCharacterPane.capabilities.value
    : shapeRibbonFormat.capabilities.value,
);
function shapeRibbonIntent(intent: Parameters<typeof shapeRibbonFormat.onIntent>[0]): boolean {
  return shapeTextEdit.snapshot.value
    ? shapeTextCharacterPane.onIntent(intent)
    : shapeRibbonFormat.onIntent(intent);
}
function selectedShapeFieldLease(snapshot: NonNullable<typeof shapeRibbonFormat.snapshot.value>) {
  const owner = shapeFormatOwnerKey(snapshot.owner),
    fieldOwner = snapshot.owner.sessionId,
    workbook = session.workbook,
    sheet = activeSheet.value,
    generation = workbookGeneration.value,
    paths = JSON.stringify(selectedShapeObjectPaths.value);
  const current = () => {
    const selected = shapeRibbonFormat.snapshot.value;
    return (
      !shapeTextEdit.snapshot.value &&
      session.workbook === workbook &&
      activeSheet.value === sheet &&
      workbookGeneration.value === generation &&
      JSON.stringify(selectedShapeObjectPaths.value) === paths &&
      !!selected &&
      shapeFormatOwnerKey(selected.owner) === owner
    );
  };
  return { fieldOwner, current };
}
function ownsSelectedShapeFieldTarget(target: EventTarget | null): boolean {
  const snapshot = shapeRibbonFormat.snapshot.value;
  if (!(target instanceof Node) || !target.isConnected) return false;
  if (snapshot) {
    const lease = selectedShapeFieldLease(snapshot);
    if (
      lease.current() &&
      shapeTextFieldDrafts.ownsTarget(lease.fieldOwner, target) &&
      lease.current()
    )
      return true;
  }
  const paneLease = selectedShapePaneFieldLease(snapshot);
  return (
    !!paneLease &&
    paneLease.current() &&
    shapeTextFieldDrafts.ownsTarget(`shape-pane:${paneLease.pane.owner.sessionId}`, target) &&
    paneLease.current()
  );
}
/** Connector selections intentionally have no ordinary Shape Ribbon session. */
function selectedConnectorPaneFieldLease(
  pane: NonNullable<typeof shapeConnectorFormatPane.snapshot.value>,
) {
  if (shapeConnectorFormatPane.snapshot.value !== pane) return;
  const workbook = session.workbook,
    sheet = activeSheet.value,
    generation = workbookGeneration.value,
    owner = shapeFormatOwnerKey(pane.owner),
    paths = JSON.stringify(selectedShapeObjectPaths.value);
  return {
    current: () => {
      const selected = shapeConnectorFormatPane.snapshot.value,
        selectedPaths = selectedShapeObjectPaths.value;
      return (
        !shapeTextEdit.snapshot.value &&
        session.workbook === workbook &&
        activeSheet.value === sheet &&
        workbookGeneration.value === generation &&
        workbook.sheets.get(sheet.id) === sheet &&
        selectedPaths.length === 1 &&
        JSON.stringify(selectedPaths) === paths &&
        JSON.stringify(shapeConnectorFormatPane.path.value) === JSON.stringify(selectedPaths[0]) &&
        !!selected &&
        selected.owner.workbookId === workbook.id &&
        selected.owner.sheetId === sheet.id &&
        shapeFormatOwnerKey(selected.owner) === owner
      );
    },
  };
}
function selectedShapePaneFieldLease(snapshot = shapeRibbonFormat.snapshot.value) {
  // The properties pane and Ribbon hold independent command sessions. A pane
  // popup may retain only the same uniquely selected, complete object path.
  const getPaneSnapshot = () =>
    shapeConnectorFormatPane.snapshot.value ??
    shapeGroupFormatPane.snapshot.value ??
    shapeFormatPane.snapshot.value;
  const getPanePath = () =>
    shapeConnectorFormatPane.snapshot.value
      ? shapeConnectorFormatPane.path.value
      : shapeGroupFormatPane.snapshot.value
        ? shapeGroupFormatPane.path.value
        : shapeFormatPane.drawing.value
          ? [shapeFormatPane.drawing.value.id]
          : undefined;
  const pane = getPaneSnapshot(),
    element = shapeObjectFormatPaneRef.value?.$el;
  if (!pane || !(element instanceof HTMLElement)) return;
  const lease = snapshot
    ? selectedShapeFieldLease(snapshot)
    : selectedConnectorPaneFieldLease(pane);
  if (!lease) return;
  const comparison = snapshot ?? pane;
  const owner = shapeFormatOwnerKey(pane.owner);
  const current = () => {
    const selectedPane = getPaneSnapshot(),
      paths = selectedShapeObjectPaths.value,
      style = getComputedStyle(element);
    return (
      lease.current() &&
      shapeObjectFormatPaneRef.value?.$el === element &&
      element.isConnected &&
      !element.hidden &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      !!selectedPane &&
      shapeFormatOwnerKey(selectedPane.owner) === owner &&
      selectedPane.owner.workbookId === comparison.owner.workbookId &&
      selectedPane.owner.sheetId === comparison.owner.sheetId &&
      selectedPane.owner.drawingId === comparison.owner.drawingId &&
      paths.length === 1 &&
      JSON.stringify(getPanePath()) === JSON.stringify(paths[0])
    );
  };
  return { pane, element, current };
}
function flushSelectedShapeFieldDrafts(snapshot = shapeRibbonFormat.snapshot.value): boolean {
  if (!snapshot) return true;
  const lease = selectedShapeFieldLease(snapshot);
  // A successful field command may advance revision. Its exact selection owner must survive.
  return (
    lease.current() && shapeTextFieldDrafts.flush(lease.fieldOwner).accepted && lease.current()
  );
}
function beforeShapeContextChange(): boolean {
  const edit = shapeTextEdit.snapshot.value;
  return edit
    ? shapeTextFieldDrafts.flush(`shape-text-${edit.sessionId}`).accepted
    : flushSelectedShapeFieldDrafts();
}
const shapeObjectControls = useShapeObjectControls({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext(activeSheet.value)?.metrics,
  getSelection: () => selectedShapeObjectPaths.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || shapeInteractionBlocked.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  select: (paths) => sheetGridRef.value?.selectShapeObjects(paths) ?? false,
  format: formatShapeObjectPath,
  replaceCollection: drawingActions.replaceCollection,
  replaceVisibilityCollection: drawingActions.replaceVisibilityCollection,
});
const shapeRibbonObjectTools = computed(() => {
  const tools = shapeObjectControls.snapshot.value;
  if (!tools) return undefined;
  const lease = shapeTextEdit.snapshot.value;
  const request = (action: "format" | "selection" | Parameters<typeof tools.actionHandler>[0]) => {
    if (lease && action === "format") {
      if (shapeTextEdit.snapshot.value?.sessionId !== lease.sessionId) return false;
      shapeTextCharacterPane.open();
      return true;
    }
    if (lease) {
      if (
        shapeTextEdit.snapshot.value?.sessionId !== lease.sessionId ||
        sheetGridRef.value?.flushPendingShapeTextEdit() === false
      )
        return false;
    }
    const current = shapeObjectControls.snapshot.value;
    if (!current) return false;
    return action === "format"
      ? current.formatHandler()
      : action === "selection"
        ? current.selectionPaneHandler()
        : current.actionHandler(action);
  };
  return {
    ...tools,
    locale: locale.value === "zh-CN" ? ("zh-CN" as const) : ("en-US" as const),
    actionHandler: (action: Parameters<typeof tools.actionHandler>[0]) => request(action),
    formatHandler: () => request("format"),
    selectionPaneHandler: () => request("selection"),
  };
});
watch(
  () => [activeSheet.value, workbookGeneration.value],
  () => {
    selectedShapeObjectPaths.value = [];
    shapeObjectControls.paneVisible.value = false;
  },
);
const shapeDrawingTransfer = useShapeDrawingTransfer({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || !!shapeTextEdit.snapshot.value,
  execute: executeCommand,
  prepareDrawing: (sheet, metrics, next, owner, forest) =>
    prepareWorkspaceDrawing(sheet, metrics, next, owner, forest, "preserve-geometry"),
  preflightConnectedCollection: (pass) => {
    preflightShapeConnectorPaint(pass, {
      theme: session.workbook.theme,
      getAssetSize: getShapePaintAssetSize,
    });
    return true;
  },
});
const shapeClipboardEpoch = ref(0);
const shapeClipboard = useShapeClipboard({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getDocumentRevision: () => session.history.revision,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext(activeSheet.value)?.metrics,
  getSelectedPaths: () =>
    sheetGridRef.value?.getSelectedShapeObjects() ?? selectedShapeObjectPaths.value,
  getTargetAddress: () => activeAddress.value,
  replaceCollection: drawingActions.replaceCollectionPreservingGeometry,
  replaceCollections: shapeDrawingTransfer.replaceCollections,
  prepareRootsForTarget: (roots, sourceSheet, targetSheet) => {
    if (!roots.some((drawing) => drawing.kind === "chart")) return roots;
    const workbook = session.workbook;
    try {
      const evaluator = createWorkbookEvaluator(workbook, sourceSheet.id);
      return roots.map((drawing) =>
        drawing.kind === "chart"
          ? planChartClipboardSourceForTarget({
              drawing,
              sourceSheet,
              targetSheet,
              evaluator,
              resolveSheet: (id) => workbook.sheets.get(id),
            })
          : drawing,
      );
    } catch (error) {
      throw new ShapeClipboardError(
        error instanceof ChartClipboardSourceError &&
          (error.reason === "unsupported-legacy-source" ||
            error.reason === "unsupported-pivot-source" ||
            error.reason === "dormant-series-id-collision" ||
            error.reason === "non-equivalent-source")
          ? "chart-source-unsupported"
          : "chart-source-invalid",
      );
    }
  },
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || !!shapeTextEdit.snapshot.value,
  onSelect: (paths) => {
    const workbook = session.workbook,
      sheet = activeSheet.value,
      generation = workbookGeneration.value,
      revision = workbookRevision.value,
      address = { ...activeAddress.value },
      selectionRevision = sheetGridRef.value?.getShapeObjectSelectionRevision(),
      previous = sheetGridRef.value?.getSelectedShapeObjects() ?? [],
      selection = paths.map((path) => [...path]),
      roots = selection.map((path) => sheet.drawings?.find((root) => root.id === path[0]));
    shapeClipboardEpoch.value++;
    // Collection commits update the grid's drawings and metrics on the next Vue tick.
    void nextTick(() => {
      if (
        session.workbook !== workbook ||
        activeSheet.value !== sheet ||
        workbookGeneration.value !== generation ||
        workbookRevision.value !== revision ||
        activeAddress.value.row !== address.row ||
        activeAddress.value.column !== address.column ||
        shapeTextEdit.snapshot.value ||
        sheetGridRef.value?.getShapeObjectSelectionRevision() !== selectionRevision ||
        roots.some((root) => !root || !sheet.drawings?.includes(root))
      )
        return;
      const current = sheetGridRef.value?.getSelectedShapeObjects() ?? [];
      if (JSON.stringify(current) !== JSON.stringify(previous)) {
        // A cut can remove the old selection while the grid refreshes. Any surviving
        // or explicitly selected replacement must retain the user's newer selection.
        const surviving = new Set(
          (sheet.drawings ?? []).flatMap((root) =>
            isShapeGroupDrawing(root)
              ? traverseShapeGroup(root).map(({ path }) => JSON.stringify(path))
              : [JSON.stringify([root.id])],
          ),
        );
        if (current.length || previous.some((path) => surviving.has(JSON.stringify(path)))) return;
      }
      sheetGridRef.value?.selectShapeObjects(selection);
    });
  },
  onCopy: () => {
    shapeClipboardEpoch.value++;
  },
  onFeedback: (reason: ShapeClipboardFailure) => {
    const owningGroup =
      reason === "unsupported-group-scene" || reason === "unsupported-owner-effects";
    void MessagePlugin.warning(
      locale.value === "zh-CN"
        ? owningGroup
          ? "此成员继承组的三维场景或组合效果。请复制所属组以保留完整外观。"
          : reason === "chart-source-unsupported"
            ? "此图表的旧范围或透视来源暂不能跨表移动而保持数据含义。请在当前工作表粘贴，或先在选择数据中设置明确的系列来源；原图和剪贴板已保留。"
            : reason === "chart-source-invalid"
              ? "图表来源或所在工作表已变化，未执行粘贴。请重新复制图表；原图和剪贴板已保留。"
              : reason === "cross-sheet-cut"
                ? "此对象暂不能跨工作表剪切。请使用复制；原对象已保留。"
                : "无法复制、剪切或粘贴此形状。请检查对象权限及当前选区，原对象和剪贴板已保留。"
        : owningGroup
          ? "Copy the owning group to retain its shared 3D scene and composited effects."
          : reason === "chart-source-unsupported"
            ? "This legacy or Pivot chart cannot move across sheets while preserving its data meaning. Paste on its original sheet or configure explicit series in Select Data first; the original and clipboard are kept."
            : reason === "chart-source-invalid"
              ? "The chart source or owning sheet changed. Copy the chart again; the original and clipboard are kept."
              : reason === "cross-sheet-cut"
                ? "This object cannot be cut across sheets yet. Use Copy; the original is kept."
                : "The shape clipboard action was not applied. Check permissions and selection; the original and clipboard are kept.",
    );
  },
});
const { confirmation: shapeClipboardTransferConfirmation } = shapeClipboard;
const canPasteShapeObjects = computed(() => {
  void shapeClipboardEpoch.value;
  return shapeClipboard.hasPending();
});
const shapeClipboardHandlers = computed(() => {
  const workbook = session.workbook,
    sheet = activeSheet.value,
    generation = workbookGeneration.value,
    revision = workbookRevision.value,
    metrics = sheetGridRef.value?.getShapeFrameContext(sheet)?.metrics,
    address = { ...activeAddress.value };
  const valid = () =>
    session.workbook === workbook &&
    activeSheet.value === sheet &&
    generation === workbookGeneration.value &&
    revision === workbookRevision.value &&
    metrics === sheetGridRef.value?.getShapeFrameContext(sheet)?.metrics &&
    address.row === activeAddress.value.row &&
    address.column === activeAddress.value.column;
  return {
    copy: (paths: readonly ShapeGroupPath[]) => valid() && shapeClipboard.copy(paths),
    cut: (paths: readonly ShapeGroupPath[]) => valid() && shapeClipboard.cut(paths),
    paste: () => {
      if (!valid()) return false;
      const accepted = shapeClipboard.paste(address);
      shapeClipboardEpoch.value++;
      return accepted;
    },
  };
});
function clearCompetingShapeClipboard(): void {
  if (shapeClipboard.clear()) shapeClipboardEpoch.value++;
}
function captureCompetingShapeClipboardCopy(): () => void {
  const identity = shapeClipboard.getIdentity(),
    workbook = session.workbook,
    generation = workbookGeneration.value;
  return () => {
    if (
      identity &&
      session.workbook === workbook &&
      workbookGeneration.value === generation &&
      shapeClipboard.clear(identity)
    )
      shapeClipboardEpoch.value++;
  };
}
watch(workbookGeneration, clearCompetingShapeClipboard);

const wordArtActions = useWordArtActions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext(activeSheet.value)?.metrics,
  getAddress: () => activeAddress.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || shapeInteractionBlocked.value,
  flush: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  replaceCollection: drawingActions.replaceCollection,
  name: () => t("drawing.wordArt"),
  placeholder: () => (locale.value === "zh-CN" ? "请输入文字" : "Your text here"),
  getFontFamily: () => session.workbook.theme.bodyFont,
  prepareFont: (drawing) => ensureCellFontResource(drawing.shapeText!.fontFamily!),
  onInserted: (root) => {
    const workbook = session.workbook,
      sheet = activeSheet.value,
      generation = workbookGeneration.value,
      revision = workbookRevision.value;
    // The insertion command invalidates grid metric objects. Start the editor
    // only after its stored root and current worksheet metrics reach the grid.
    void nextTick(() => {
      if (
        session.workbook !== workbook ||
        activeSheet.value !== sheet ||
        workbookGeneration.value !== generation ||
        workbookRevision.value !== revision ||
        !sheet.drawings?.includes(root) ||
        shapeTextEdit.snapshot.value ||
        !sheetGridRef.value?.selectShapeObjects([[root.id]])
      )
        return;
      startShapeTextEdit({ root, selection: "all" });
    });
  },
});
const wordArtInsertHandler = computed(() => {
  void workbookGeneration.value;
  void activeSheet.value;
  void workbookRevision.value;
  void activeAddress.value.row;
  void activeAddress.value.column;
  return wordArtActions.createInsertHandler();
});
onBeforeUnmount(wordArtActions.cancelPending);

const shapeInsertHandler = computed(() => {
  const owner = shapeCreation.captureOwner();
  void workbookRevision.value;
  return (choice: ShapeGalleryChoice, continuous: boolean) =>
    shapeCreation.start(choice, continuous, owner);
});

const drawingTextBoxHandler = computed(() => {
  const target = drawingDialog.value;
  return (direction: "horizontal" | "vertical") => drawingActions.requestTextBox(direction, target);
});
const drawingConfirmHandler = computed(() => {
  const target = drawingDialog.value;
  return (drawing: SheetGraphicDrawing) => drawingActions.confirm(drawing, target);
});
const pictureAssetTools = usePictureAssetTools({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getSelectedIds: () => selectedPictureIds.value,
  getSelectedPath: () => selectedOwnedPicturePath.value,
  assetStore,
  getFrameContext: () => sheetGridRef.value?.getPictureFrameContext?.(activeSheet.value),
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageActions.busy.value,
  execute: executeCommand,
  feedback: (key, error) => {
    void (error ? MessagePlugin.error(t(key)) : MessagePlugin.success(t(key)));
  },
});
const imageBusy = computed(() => imageActions.busy.value || pictureAssetTools.busy.value);
const pictureTools = usePictureTools({
  getSheet: () => activeSheet.value,
  getSelectedPath: () => selectedOwnedPicturePath.value,
  selectedIds: selectedPictureIds,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: executeCommand,
  getFrameContext: () => sheetGridRef.value?.getPictureFrameContext?.(activeSheet.value),
});
function performPictureGroup(
  ungroup = false,
  ids: readonly string[] = selectedPictureIds.value,
  owner = activeSheet.value,
): boolean {
  if (owner !== activeSheet.value || activeViewMode.value === "page-layout") return false;
  const focusBeforeGrouping = document.activeElement;
  const accepted = pictureTools.group(ungroup, [...ids]);
  if (accepted) {
    const selectedIds = [...selectedPictureIds.value];
    // Keep the contextual Ribbon owned while Grid receives the replacement
    // roots; its selection-change notification arrives on the following tick.
    selectedPictureId.value =
      selectedIds.find((id) => owner.floatingImages.some((root) => root.id === id)) ?? null;
    const workbook = session.workbook,
      generation = pictureOwnerGeneration.value,
      revision = workbookRevision.value,
      grid = sheetGridRef.value;
    grid?.selectFloatingImages(selectedIds);
    // The floating Group button disappears with the old multi-selection. Return
    // keyboard ownership to its new group, after Grid has received the new roots.
    if (!ungroup)
      void nextTick(() => {
        if (
          session.workbook !== workbook ||
          activeSheet.value !== owner ||
          pictureOwnerGeneration.value !== generation ||
          workbookRevision.value !== revision ||
          sheetGridRef.value !== grid ||
          selectedIds.length !== selectedPictureIds.value.length ||
          selectedIds.some((id, index) => selectedPictureIds.value[index] !== id) ||
          !selectedIds.every((id) =>
            owner.floatingImages.some((root) => root.id === id && isPictureGroup(root)),
          ) ||
          (document.activeElement !== focusBeforeGrouping &&
            !(
              focusBeforeGrouping &&
              !focusBeforeGrouping.isConnected &&
              document.activeElement === document.body
            ))
        )
          return;
        grid?.focusOwnedPictureSelection(selectedIds, owner);
      });
  } else showImageFeedback("picture.operationFailed");
  return accepted;
}
function deleteOwnedPictures(paths: readonly PictureGroupPath[], owner: Sheet): boolean {
  if (owner !== activeSheet.value) return false;
  const accepted = pictureTools.deletePaths(paths);
  if (accepted) sheetGridRef.value?.selectFloatingImages([...selectedPictureIds.value]);
  return accepted;
}
let picturePaneEpoch = 0;
watch(
  [() => session.workbook, activeSheet, pictureOwnerGeneration, pictureTools.paneVisible],
  () => {
    picturePaneEpoch += 1;
  },
  { flush: "sync" },
);
function picturePaneImageAvailable(image: FloatingImage): boolean {
  void workbookRevision.value;
  return canEditPictureSelection(activeSheet.value, [image.id]);
}
const picturePaneHandlers = computed(() => {
  const workbook = session.workbook;
  const sheet = activeSheet.value;
  const generation = pictureOwnerGeneration.value;
  const visible = pictureTools.paneVisible.value;
  const epoch = picturePaneEpoch;
  const current = () =>
    visible &&
    epoch === picturePaneEpoch &&
    workbook === session.workbook &&
    sheet === activeSheet.value &&
    generation === pictureOwnerGeneration.value;
  return {
    rename: (image: FloatingImage, name: string) => current() && pictureTools.rename(image, name),
    visibility: (image: FloatingImage) => current() && pictureTools.toggleVisibility(image),
    select: (ids: string[]) => {
      if (!current() || (ids.length && !canEditPictureSelection(sheet, ids))) return false;
      sheetGridRef.value?.selectFloatingImages(ids);
      return true;
    },
    close: () => {
      if (!current()) return false;
      pictureTools.paneVisible.value = false;
      return true;
    },
  };
});
const selectedOwnedPictureLeaf = computed(() => {
  void workbookRevision.value;
  const path = selectedOwnedPicturePath.value;
  const context = sheetGridRef.value?.getPictureFrameContext(activeSheet.value);
  if (
    !path ||
    path.length < 2 ||
    selectedPictureIds.value.length !== 1 ||
    path[0] !== selectedPictureIds.value[0] ||
    !context
  )
    return;
  try {
    const resolved = resolveOwnedPictureNode(activeSheet.value.floatingImages, path, context);
    return resolved?.visible &&
      resolved.layout &&
      !resolved.layout.collapsed &&
      resolved.node.kind === "grouped-picture-v1"
      ? { node: resolved.node, path: [...path] }
      : undefined;
  } catch {
    return;
  }
});
const pictureToolbarRef = ref<InstanceType<typeof PictureToolbar> | null>(null);
const pictureOwnedLeafRibbonRef = ref<InstanceType<typeof PictureOwnedLeafRibbon> | null>(null);
const pictureEffectsFocusReturn = usePictureEffectsFocusReturn({
  getOwner: () => {
    void workbookRevision.value;
    const sheet = activeSheet.value;
    const leaf = selectedOwnedPictureLeaf.value;
    const targets = leaf
      ? [{ id: selectedPictureIds.value[0]!, assetId: leaf.node.assetId }]
      : selectedPictureIds.value.map((id) => {
          const image = sheet.floatingImages.find((entry) => entry.id === id);
          return image && !isPictureGroup(image) ? { id, assetId: image.assetId } : undefined;
        });
    if (!targets.length || targets.some((target) => !target)) return undefined;
    return {
      workbook: session.workbook,
      sheet,
      generation: pictureOwnerGeneration.value,
      mode: leaf ? "owned" : "standalone",
      targets: targets as { id: string; assetId: string }[],
      path: leaf ? leaf.path : null,
    };
  },
  isBlocked: () =>
    gridInert.value ||
    imageBusy.value ||
    Boolean(activeRangePicker.value) ||
    cellEditSession.state.active ||
    cellEditSession.state.composing ||
    Boolean(shapeTextEdit.snapshot.value) ||
    Boolean(equationEdit.snapshot.value) ||
    (sheetGridRef.value?.hasActivePictureCrop() ?? false),
  getTarget: (mode) =>
    mode === "owned"
      ? (pictureOwnedLeafRibbonRef.value?.getEffectsTrigger() ?? null)
      : (pictureToolbarRef.value?.getEffectsTrigger() ?? null),
});
const pictureFormatVisible = ref(false);
const pictureFormatComponentRef = ref<InstanceType<typeof PictureFormatPane> | null>(null);
const pictureFormatInitialTab = ref<"effects" | "size-properties">("size-properties");
const pictureFormatInitialPaint = ref<"fill" | "line" | undefined>();
const pictureIntrinsicOwner = computed<readonly unknown[]>((previous) => {
  const next = [
    session.workbook,
    activeSheet.value,
    pictureOwnerGeneration.value,
    JSON.stringify(selectedPictureIds.value),
    JSON.stringify(selectedOwnedPicturePath.value ?? null),
  ];
  // Grid revision notifications may replace selection arrays without changing their owner.
  return previous && next.every((value, index) => value === previous[index]) ? previous : next;
});
function selectedPictureIntrinsicSource() {
  if (selectedPictureIds.value.length !== 1) return;
  const leaf = selectedOwnedPictureLeaf.value;
  if (selectedOwnedPicturePath.value && selectedOwnedPicturePath.value.length > 1 && !leaf) return;
  const node = leaf?.node ?? selectedPicture.value;
  if (!node || isPictureGroup(node)) return;
  const url = imageAssetUrls.value.get(node.assetId);
  return url ? { assetId: node.assetId, url } : undefined;
}
const pictureIntrinsic = usePictureIntrinsicSize({
  getOwner: () => pictureIntrinsicOwner.value,
  getSource: selectedPictureIntrinsicSource,
});
const pictureIntrinsicRetry = computed(() => {
  const owner = pictureIntrinsicOwner.value,
    source = selectedPictureIntrinsicSource();
  return () => {
    const now = selectedPictureIntrinsicSource();
    if (
      owner === pictureIntrinsicOwner.value &&
      source?.assetId === now?.assetId &&
      source?.url === now?.url
    )
      pictureIntrinsic.retry();
  };
});
const pictureOriginalResetOwner = computed(() => {
  const owner = pictureIntrinsicOwner.value,
    node = selectedOwnedPictureLeaf.value?.node ?? selectedPicture.value,
    size = pictureIntrinsic.size.value,
    source = selectedPictureIntrinsicSource(),
    path =
      selectedOwnedPictureLeaf.value?.path ??
      (selectedPictureIds.value.length === 1 ? [selectedPictureIds.value[0]!] : []),
    signature = node ? JSON.stringify(node) : undefined;
  const available =
    !!node &&
    !isPictureGroup(node) &&
    !!size &&
    size.assetId === source?.assetId &&
    size.url === source?.url;
  return {
    available,
    reason: t(
      pictureIntrinsic.status.value === "loading"
        ? "pictureFormat.originalSizeLoading"
        : "pictureFormat.originalSizeUnavailable",
    ),
    apply: (): boolean => {
      const current = selectedOwnedPictureLeaf.value?.node ?? selectedPicture.value,
        now = selectedPictureIntrinsicSource();
      if (
        !available ||
        !size ||
        owner !== pictureIntrinsicOwner.value ||
        size !== pictureIntrinsic.size.value ||
        source?.assetId !== now?.assetId ||
        source?.url !== now?.url ||
        JSON.stringify(current) !== signature ||
        loading.value ||
        fileBusy.value ||
        xlsxBusy.value ||
        imageBusy.value ||
        !beforePictureFormatInteraction()
      )
        return false;
      return pictureTools.restoreOriginal(path, {
        assetId: size.assetId,
        width: size.width,
        height: size.height,
      });
    },
  };
});
function pictureFormatBusy(): boolean {
  return loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value;
}
function beforePictureFormatPaneInteraction(): boolean {
  if (pictureFormatBusy()) return false;
  // Viewing a protected object's settings must never flush a pending crop edit.
  if (!canEditPictureSelection(activeSheet.value, selectedPictureIds.value)) return true;
  return beforePictureFormatInteraction();
}
function beforePictureFormatInteraction(): boolean {
  const workbook = session.workbook,
    sheet = activeSheet.value,
    generation = pictureOwnerGeneration.value;
  const ids = JSON.stringify(selectedPictureIds.value),
    path = JSON.stringify(selectedOwnedPicturePath.value);
  if (sheetGridRef.value?.applyPendingPictureCrop() === false) return false;
  return (
    session.workbook === workbook &&
    activeSheet.value === sheet &&
    pictureOwnerGeneration.value === generation &&
    JSON.stringify(selectedPictureIds.value) === ids &&
    JSON.stringify(selectedOwnedPicturePath.value) === path
  );
}
const pictureFormatPane = useOwnedPictureFormatPane({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getRevision: () => workbookRevision.value,
  getContext: () => sheetGridRef.value?.getPictureFrameContext(activeSheet.value),
  getSelectedPath: () => selectedOwnedPicturePath.value,
  getSelectedIds: () => selectedPictureIds.value,
  isOpen: () => pictureFormatVisible.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: pictureTools.replaceAll,
  onCropShapeApplied: (path) => {
    const owner = activeSheet.value,
      generation = pictureOwnerGeneration.value;
    void nextTick(() => {
      if (
        activeSheet.value !== owner ||
        pictureOwnerGeneration.value !== generation ||
        selectedPictureIds.value.length !== 1 ||
        selectedPictureIds.value[0] !== path[0]
      )
        return;
      const selected = selectedOwnedPicturePath.value;
      if (path.length > 1 && JSON.stringify(selected) !== JSON.stringify(path)) return;
      if (path.length === 1 && selected && selected.length > 1) return;
      if (sheetGridRef.value?.canCropPicture()) sheetGridRef.value.cropImage();
    });
  },
  getDisabledReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
  getUnsupportedCropReason: () => t("picture.groupReflectionUnsupported"),
  isImageAssetAvailable: (assetId) =>
    imageAssetUrls.value.has(assetId) || picturePaintAssets.has(assetId),
  getIntrinsicSize: (assetId) => {
    const size = pictureIntrinsic.size.value;
    return size?.assetId === assetId && imageAssetUrls.value.get(assetId) === size.url
      ? size
      : undefined;
  },
  getMissingIntrinsicReason: () =>
    t(
      pictureIntrinsic.status.value === "loading"
        ? "pictureFormat.originalSizeLoading"
        : "pictureFormat.originalSizeUnavailable",
    ),
  getOriginalSizeLimitReason: () => t("pictureFormat.originalSizeTooLarge"),
  getInheritedLineReason: () => t("pictureFormat.capabilityReasons.inheritedLine"),
  getCompositeLineReason: () => t("pictureFormat.capabilityReasons.compositeLine"),
  getInheritedPropertiesReason: () => t("pictureFormat.capabilityReasons.inheritedProperties"),
  getProtectedReason: () => t("pictureFormat.capabilityReasons.protectedObject"),
  getLockPermissionReason: () => t("pictureFormat.capabilityReasons.lockPermission"),
});
const picturePaintAssets = createPicturePaintAssetSource({
  getSnapshot: () => pictureFormatPane.snapshot.value,
  store: assetStore,
});
onBeforeUnmount(picturePaintAssets.dispose);
function pictureFormatLabel(key: PictureFormatLabelKey): string {
  return t(`pictureFormat.${key}`);
}
function openOwnedPictureFormat(
  path?: PictureGroupPath,
  owner = activeSheet.value,
  paint?: "fill" | "line",
  target?: "effects",
): void {
  if (owner !== activeSheet.value || pictureFormatBusy()) return;
  if (path) selectedOwnedPicturePath.value = path.length > 1 ? [...path] : null;
  if (!pictureFormatVisible.value) {
    pictureFormatInitialPaint.value = paint;
    pictureFormatInitialTab.value = target ?? "size-properties";
  }
  pictureFormatVisible.value = true;
  if (paint) pictureFormatComponentRef.value?.showPaint(paint);
  else if (target === "effects") pictureFormatComponentRef.value?.showEffects();
}
function closeOwnedPictureFormat(): void {
  pictureFormatVisible.value = false;
  pictureFormatPane.close();
}
let sourceRibbonSequence = 0;
let sourceRibbonDisplaySequence = 0;
let sourceRibbonDisplayOwner: readonly unknown[] | undefined;
const pictureSourceRibbonOwner = computed(() => {
  void workbookRevision.value;
  const leaf = selectedOwnedPictureLeaf.value,
    image = leaf?.node ?? selectedPicture.value;
  if (!image || isPictureGroup(image)) {
    sourceRibbonDisplayOwner = undefined;
    return;
  }
  const workbook = session.workbook,
    sheet = activeSheet.value,
    generation = pictureOwnerGeneration.value,
    revision = workbookRevision.value;
  const path = leaf?.path,
    selected = [...selectedPictureIds.value],
    context = sheetGridRef.value?.getPictureFrameContext(sheet);
  // Command leases refresh with frame context. Rendering identity must not:
  // late layout notifications otherwise remove a trigger already safely focused.
  const displayOwner = [
    workbook,
    sheet,
    generation,
    revision,
    JSON.stringify(selected),
    JSON.stringify(path ?? null),
    image.id,
    image.assetId,
  ];
  if (
    !sourceRibbonDisplayOwner ||
    !displayOwner.every((value, index) => value === sourceRibbonDisplayOwner![index])
  ) {
    sourceRibbonDisplayOwner = displayOwner;
    sourceRibbonDisplaySequence++;
  }
  const displayKey = `picture-source-display-${sourceRibbonDisplaySequence}`;
  const key = `picture-source-owner-${++sourceRibbonSequence}`;
  const current = (): boolean =>
    key === pictureSourceRibbonOwner.value?.key &&
    workbook === session.workbook &&
    sheet === activeSheet.value &&
    generation === pictureOwnerGeneration.value &&
    revision === workbookRevision.value &&
    selected.length === selectedPictureIds.value.length &&
    selected.every((id, index) => id === selectedPictureIds.value[index]) &&
    JSON.stringify(path ?? null) === JSON.stringify(selectedOwnedPicturePath.value ?? null) &&
    context?.metrics === sheetGridRef.value?.getPictureFrameContext(sheet)?.metrics;
  return {
    key,
    displayKey,
    appearance: (patch: Partial<ImageAppearance> | undefined) => {
      if (!current() || !beforePictureFormatInteraction()) return false;
      return pictureTools.applyAppearance(patch);
    },
    effect: (edit: PictureEffectEdit) => {
      if (!current() || !beforePictureFormatInteraction()) return false;
      return pictureTools.applyEffect(edit);
    },
    save: () => {
      if (current()) void pictureAssetTools.exportPictures("png");
    },
    canReplace: imageActions.canReplace(image.id, path),
    canAnnotate: pictureDialogs.canAnnotate(),
    annotate: () => current() && pictureDialogs.openAnnotation(),
    canConvert: pictureCellConversion.canConvert(path?.[0] ?? image.id, path),
    convert: () => current() && pictureCellConversion.request(path?.[0] ?? image.id, path),
    canCrop: sheetGridRef.value?.canCropPicture() ?? false,
    canPreview: sheetGridRef.value?.canPreviewPicture() ?? false,
    preview: () => current() && (sheetGridRef.value?.previewSelectedPicture() ?? false),
    crop: () => current() && (sheetGridRef.value?.cropImage() ?? false),
    replace: () => {
      if (current()) void imageActions.requestReplace(image.id, path);
    },
    format: (target?: "effects") => {
      if (current()) openOwnedPictureFormat(path, sheet, undefined, target);
    },
  };
});
function performPictureContextSourceAction(
  action: PictureContextSourceAction,
  path: PictureGroupPath,
  owner: Sheet,
): void {
  if (
    owner !== activeSheet.value ||
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    imageBusy.value ||
    selectedPictureIds.value.length !== 1 ||
    selectedPictureIds.value[0] !== path[0] ||
    JSON.stringify(path.length > 1 ? path : null) !== JSON.stringify(selectedOwnedPicturePath.value)
  )
    return;
  const source = pictureSourceRibbonOwner.value;
  if (!source) return;
  if (action === "replace" && source.canReplace) source.replace();
  else if (action === "save") source.save();
  else if (action === "crop" && source.canCrop) source.crop();
  else if (action === "annotate" && source.canAnnotate) source.annotate();
  else if (action === "preview" && source.canPreview) source.preview();
  else if (action === "format") source.format();
}
const pictureToolbarOwner = usePictureToolbarOwner({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getImage: () => selectedPicture.value,
  getSelectedIds: () => selectedPictureIds.value,
  getFrameContext: () => sheetGridRef.value?.getPictureFrameContext?.(activeSheet.value),
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  resize: pictureTools.resizeOne,
  aspectRatio: pictureTools.setAspectRatio,
  appearance: pictureTools.applyAppearance,
  effect: pictureTools.applyEffect,
});
watch([pictureOwnerGeneration, selectedPictureId], pictureTools.clearFeedback, { flush: "sync" });
const pictureDialogs = usePictureDialogSessions({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getGeneration: () => pictureOwnerGeneration.value,
  getSelectedImage: () => selectedPicture.value ?? undefined,
  getSelectedIds: () => selectedPictureIds.value,
  getSelectedPath: () => selectedOwnedPicturePath.value,
  getFrameContext: () => sheetGridRef.value?.getPictureFrameContext(activeSheet.value),
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  hasAsset: (id) => Boolean(imageAssetUrls.value.get(id)),
  setImage: setFloatingImage,
  setImages: (images, sheetId) =>
    sheetId === activeSheet.value.id && pictureTools.replaceAll(images),
  flushPendingEdits: () =>
    cellEditSession.finish() && (sheetGridRef.value?.applyPendingPictureCrop() ?? false),
  compress: pictureAssetTools.compress,
  resize: pictureTools.resizeMany,
  resizeFeedback: () => pictureTools.sizeFeedback.value,
});
const {
  annotation: pictureAnnotation,
  compression: pictureCompression,
  batch: pictureBatchSize,
} = pictureDialogs;
watch(selectedPictureId, (id) => {
  if (!id) pictureDialogs.closeBatchSize();
});

const encryptDocumentVisible = ref(false);
function openDocumentEncryption(): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  encryptDocumentVisible.value = true;
}
async function exportEncryptedDocument(password: string): Promise<void> {
  await xlsxActions.exportXlsx(password);
  if (xlsxFeedback.value?.key === "xlsx.feedback.exported" || xlsxConfirmation.value === "export")
    encryptDocumentVisible.value = false;
}
watch(workbookGeneration, () => {
  encryptDocumentVisible.value = false;
});

const formulaTools = useFormulaToolsController({
  getWorkbook: () => session.workbook,
  getSelection: () => ({
    address: activeAddress.value,
    range: activeSelectionRange.value,
  }),
  getSheetEvaluator: () => activeSheetEvaluator.value,
  editSession: cellEditSession,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: executeCommand,
  focusFormulaBar: focusFormulaBarOrGrid,
  recalculate,
});
const duplicateErrorChecks = useDuplicateErrorChecks({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getRevision: () => workbookRevision.value,
});
const {
  errorCells: duplicateErrorCells,
  settings: duplicateCheckSettings,
  ignoredCount: ignoredDuplicateCount,
} = duplicateErrorChecks;
const activeCellErrorKind = computed(() =>
  duplicateErrorChecks.errorKinds.value.get(
    `${activeAddress.value.row}:${activeAddress.value.column}`,
  ),
);
const activeCellErrorDescription = computed(() =>
  activeCellErrorKind.value === "number-stored-as-text"
    ? {
        numberConversion: true,
        label: t("dataTools.duplicates.errorChecks.numberStoredAsText"),
        message: t("dataTools.duplicates.errorChecks.numberStoredAsTextMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllNumberTextHint"),
      }
    : undefined,
);
const duplicateErrorOptionsVisible = ref(false);
function openDuplicateErrorOptions(): void {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    imageBusy.value ||
    !cellEditSession.finish()
  )
    return;
  duplicateErrorOptionsVisible.value = true;
}
function closeDuplicateErrorOptions(): void {
  duplicateErrorOptionsVisible.value = false;
  void nextTick(focusCellEditor);
}
function confirmDuplicateErrorOptions(payload: {
  settings: ErrorCheckSettings;
  resetIgnored: boolean;
}): void {
  duplicateErrorChecks.applySettings(payload.settings, payload.resetIgnored);
  closeDuplicateErrorOptions();
}
function convertCellErrorValues(scope: "cell" | "selection" | "sheet"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value) return;
  if (!cellEditSession.finish()) return;
  convertNumberType("text-to-number", scope, { allowPrecisionLoss: true });
  void nextTick(focusCellEditor);
}
function ignoreSelectedDuplicateErrors(): void {
  duplicateErrorChecks.ignoreRange(activeSelectionRange.value);
  void nextTick(focusCellEditor);
}
function ignoreAllDuplicateErrors(): void {
  duplicateErrorChecks.ignoreAll(activeCellErrorKind.value);
  void nextTick(focusCellEditor);
}
function editErrorInFormulaBar(): void {
  if (!activeSheet.value.properties.protected) {
    void nextTick(focusFormulaBarOrGrid);
  }
}
watch([workbookGeneration, () => activeSheet.value.id], () => {
  duplicateErrorOptionsVisible.value = false;
});
const dataTools = useDataToolsController({
  getWorkbook: () => session.workbook,
  getSelection: () => ({
    address: activeAddress.value,
    range: activeSelectionRange.value,
    mode: activeSelectionMode.value,
  }),
  getSheetEvaluator: () => activeSheetEvaluator.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  navigateToCell: (sheetId, address) => {
    if (activeSheet.value.id !== sheetId) selectSheet(sheetId);
    void nextTick(() => navigateToAddress(formatCellAddress(address)));
  },
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: (command) => {
    const changed = executeCommand(command);
    if (changed) clearGridClipboard();
    return changed;
  },
  flush: () => cellEditSession.finish(),
  focusSheet: focusCellEditor,
  recalculate,
});
const {
  simulationDialog,
  simulationBusy,
  simulationError,
  simulationResult,
  goalSeekDraft,
  planningDraft,
  dataTableDraft,
  dataTablePreview,
  proofreadingVisible,
  proofreadingHasScanned,
  proofreadingDraft,
  proofreadingIssues,
  proofreadingError,
  proofreadingBusy,
  selectedProofreadingIssueIds,
  disabled: dataToolsDisabled,
  capabilities: dataToolCapabilities,
  filterActive: dataFilterActive,
  columns: dataToolColumns,
  sortInitial: dataSortInitial,
  rangeLabel: dataToolRangeLabel,
  splitPreview: dataSplitPreview,
  duplicateCount: dataDuplicateCount,
  validationInitial: dataValidationInitial,
  hasSubtotals: dataHasSubtotals,
  filterState: dataFilterState,
  sortVisible: dataSortVisible,
  textToColumnsVisible: dataTextToColumnsVisible,
  removeDuplicatesVisible: dataRemoveDuplicatesVisible,
  removeDuplicatesInitial: dataRemoveDuplicatesInitial,
  removeDuplicatesIsTable: dataRemoveDuplicatesIsTable,
  validationVisible: dataValidationVisible,
  subtotalVisible: dataSubtotalVisible,
  advancedFilterVisible: dataAdvancedFilterVisible,
  advancedFilterDraft: dataAdvancedFilterDraft,
  advancedFilterError: dataAdvancedFilterError,
  duplicateValuesVisible,
  duplicateValuesMode,
  duplicateValuesDraft,
  duplicateValuesError,
  consolidateVisible,
  consolidateDraft,
  consolidateError,
  consolidatePreview,
  fillNumberSequenceVisible,
  fillRankVisible,
  fillNumberSequenceInitial,
  fillRankInitial,
  fillSeriesVisible,
  fillBlanksVisible,
  fillTextVisible,
  fillCurrentDateVisible,
  fillSeriesInitial,
  fillBlanksInitial,
  fillTextInitial,
  fillCurrentDateInitial,
  fillError,
  fillRangeLabel,
  dropdownListVisible,
  dropdownListInitial,
  dropdownListError,
  lookupFillVisible,
  lookupFillDraft,
  lookupFillError,
  lookupFillPreview,
  sourceColumns: lookupFillSourceColumns,
  targetColumns: lookupFillTargetColumns,
  comparisonVisible,
  comparisonAction,
  comparisonDraft,
  comparisonError,
  comparisonColumns,
} = dataTools;
const {
  history: findHistory,
  replacement: findReplacement,
  replacementFormat: findReplacementFormat,
  replacementFormatSummary: findReplacementFormatSummary,
  format: findFormat,
  options: findOptions,
  optionsExpanded: findOptionsExpanded,
  results: findResults,
  resultCount: findResultCount,
  hasSearchedAll: findHasSearchedAll,
  status: findStatus,
  formatSummary: findFormatSummary,
} = workbookFind;
const findFormatTarget = ref<"find" | "replace">("find");
const findFormatDraft = shallowRef<ReturnType<typeof createFindFormatDraft>>();
const findFormatPicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingFindFormat, reference: pickedFindFormatReference } = findFormatPicker;
function openFind(mode: WorkbookFindMode = "find"): void {
  if (!cellEditSession.finish()) return;
  findMode.value = mode;
  findDialogVisible.value = true;
  void nextTick(() => findDialogRef.value?.focusQuery());
}
useWorkbookFindShortcuts({
  canOpen: (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-shape-canvas-text-editor], [data-shape-canvas-text-toolbar]")
    )
      return false;
    if (
      cellEditSession.state.composing ||
      formulaEditorVisible.value ||
      formulaInsertVisible.value ||
      activeRangePicker.value ||
      cellFormatSelection.value ||
      findFormatDraft.value
    )
      return false;
    const dialog = event.target instanceof Element ? event.target.closest(".t-dialog") : null;
    return !dialog || dialog.classList.contains("workbook-find-dialog-frame");
  },
  open: openFind,
});
function runFind(direction: "forward" | "backward"): void {
  if (cellEditSession.finish()) workbookFind.find(direction);
}
function runFindAll(): void {
  if (cellEditSession.finish()) workbookFind.findAll();
}
function runReplace(all = false): void {
  if (!cellEditSession.finish()) return;
  if (all) workbookFind.replaceAll();
  else workbookFind.replace();
}
function runGoTo(options: SheetGoToOptions): void {
  if (cellEditSession.finish()) workbookGoTo.locate(options);
}
function selectGoToResult(result: WorkbookFindResult): void {
  if (cellEditSession.finish()) workbookGoTo.selectResult(result);
}
function selectFindResult(result: WorkbookFindResult): void {
  if (cellEditSession.finish()) workbookFind.selectResult(result);
}
function configureFindFormat(target: "find" | "replace" = "find"): void {
  if (!cellEditSession.finish()) return;
  findFormatTarget.value = target;
  findFormatDraft.value = createFindFormatDraft(
    target === "replace" ? workbookFind.replacementFormat.value : workbookFind.format.value,
  );
}
function confirmFindFormat(change: CellFormatChange): void {
  if (findFormatTarget.value === "replace") {
    workbookFind.setReplacementFormat(
      applyFindFormatChange(workbookFind.replacementFormat.value, change),
    );
  } else {
    workbookFind.setFormat(applyFindFormatChange(workbookFind.format.value, change));
  }
  findFormatDraft.value = undefined;
}
async function pickFindFormat(
  mode: WorkbookFindFormatMode,
  purpose: "find" | "replace" = "find",
): Promise<void> {
  if (!cellEditSession.finish()) return;
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const selected = await findFormatPicker.selectReference(
    formatRangeReference(activeSheet.value.name, {
      start: activeAddress.value,
      end: activeAddress.value,
    }),
  );
  if (
    !selected ||
    workbook !== session.workbook ||
    generation !== workbookGeneration.value ||
    !findDialogVisible.value
  )
    return;
  const target = resolveRangeReference(workbook, selected, sheetId);
  if (!target) return;
  const sheet = workbook.sheets.get(target.sheetId);
  if (!sheet) return;
  const address = target.range.start;
  const setFormat =
    purpose === "replace" ? workbookFind.setReplacementFormat : workbookFind.setFormat;
  setFormat(
    buildFindFormatFromCell(sheet.cells.get(`${address.row}:${address.column}`)?.style, mode),
    `${sheet.name}!${formatCellAddress(address)}`,
  );
}
watch(findDialogVisible, (visible) => {
  if (!visible) {
    findFormatPicker.cancel();
    findFormatDraft.value = undefined;
  }
});
watch(workbookGeneration, () => {
  findFormatPicker.cancel();
  findFormatDraft.value = undefined;
});
const simulationRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingSimulationRange, reference: pickedSimulationReference } =
  simulationRangePicker;
async function selectSimulationReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const dialog = simulationDialog.value;
  const selected = await simulationRangePicker.selectReference(current, options);
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !dialog ||
    simulationDialog.value !== dialog
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(simulationDialog, () => simulationRangePicker.cancel());
const proofreadingRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingProofreadingRange, reference: pickedProofreadingReference } =
  proofreadingRangePicker;
async function selectProofreadingReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const selected = await proofreadingRangePicker.selectReference(current);
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !proofreadingVisible.value
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(proofreadingVisible, (visible) => {
  if (!visible) proofreadingRangePicker.cancel();
});
const splitRangePicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingSplitRange, reference: pickedSplitReference } = splitRangePicker;
async function selectSplitReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const selected = await splitRangePicker.selectReference(current, options);
  if (session.workbook !== workbook || !dataTextToColumnsVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dataTextToColumnsVisible, (visible) => {
  if (!visible) splitRangePicker.cancel();
});
const validationRangePicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingValidationRange, reference: pickedValidationReference } =
  validationRangePicker;
const validationPickingCell = ref(true);
async function selectValidationReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  validationPickingCell.value = options.singleCell === true;
  const selected = await validationRangePicker.selectReference(current, options);
  if (session.workbook !== workbook || !dataValidationVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dataValidationVisible, (visible) => {
  if (!visible) validationRangePicker.cancel();
});
const dropdownRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingDropdownRange, reference: pickedDropdownReference } = dropdownRangePicker;
async function selectDropdownReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const selected = await dropdownRangePicker.selectReference(current);
  if (session.workbook !== workbook || !dropdownListVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dropdownListVisible, (visible) => {
  if (!visible) dropdownRangePicker.cancel();
});
const fillRankRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingFillRankRange, reference: pickedFillRankReference } = fillRankRangePicker;
const fillRankPickingDestination = ref(false);
async function selectFillRankReference(
  current: string,
  singleCell: boolean,
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  fillRankPickingDestination.value = singleCell;
  const selected = await fillRankRangePicker.selectReference(current, { singleCell });
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !fillRankVisible.value
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
const selectFillRankSource = (current: string) => selectFillRankReference(current, false);
const selectFillRankDestination = (current: string) => selectFillRankReference(current, true);
watch(fillRankVisible, (visible) => {
  if (!visible) fillRankRangePicker.cancel();
});
const advancedRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingAdvancedRange, reference: pickedAdvancedReference } = advancedRangePicker;
const advancedRangeField = ref<"listRange" | "criteriaRange" | "destination">();
async function pickAdvancedFilterRange(field: "listRange" | "criteriaRange" | "destination") {
  advancedRangeField.value = field;
  const selected = await advancedRangePicker.selectReference(dataAdvancedFilterDraft.value[field]);
  advancedRangeField.value = undefined;
  if (selected !== undefined && dataAdvancedFilterVisible.value) {
    const draft: AdvancedFilterDraft = { ...dataAdvancedFilterDraft.value, [field]: selected };
    dataTools.updateAdvancedFilterDraft(draft);
  }
}
watch(dataAdvancedFilterVisible, (visible) => {
  if (!visible) advancedRangePicker.cancel();
});
const duplicateRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingDuplicateRange, reference: pickedDuplicateReference } = duplicateRangePicker;
async function pickDuplicateRange() {
  const selected = await duplicateRangePicker.selectReference(duplicateValuesDraft.value.range);
  if (selected !== undefined && duplicateValuesVisible.value) {
    dataTools.updateDuplicateValuesDraft({ ...duplicateValuesDraft.value, range: selected });
  }
}
watch(duplicateValuesVisible, (visible) => {
  if (!visible) duplicateRangePicker.cancel();
});
const comparisonRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingComparisonRange, reference: pickedComparisonReference } =
  comparisonRangePicker;
async function pickComparisonRange(field: "firstRange" | "secondRange") {
  const selected = await comparisonRangePicker.selectReference(comparisonDraft.value[field]);
  if (selected !== undefined && comparisonVisible.value) {
    dataTools.updateComparisonDraft({ ...comparisonDraft.value, [field]: selected });
  }
}
watch(comparisonVisible, (visible) => {
  if (!visible) comparisonRangePicker.cancel();
});
const lookupFillRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingLookupFillRange, reference: pickedLookupFillReference } =
  lookupFillRangePicker;
async function pickLookupFillRange(field: "sourceRange" | "targetRange") {
  const selected = await lookupFillRangePicker.selectReference(lookupFillDraft.value[field]);
  if (selected !== undefined && lookupFillVisible.value) {
    dataTools.updateLookupFillDraft({ ...lookupFillDraft.value, [field]: selected });
  }
}
watch(lookupFillVisible, (visible) => {
  if (!visible) lookupFillRangePicker.cancel();
});
const consolidateRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingConsolidateRange, reference: pickedConsolidateReference } =
  consolidateRangePicker;
async function selectConsolidateSourceReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const selected = await consolidateRangePicker.selectReference(current);
  return session.workbook === workbook && consolidateVisible.value ? selected : undefined;
}
async function pickConsolidateRange() {
  const selected = await consolidateRangePicker.selectReference(
    consolidateDraft.value.destination,
    { singleCell: true },
  );
  if (selected === undefined || !consolidateVisible.value) return;
  dataTools.updateConsolidateDraft({ ...consolidateDraft.value, destination: selected });
}
watch(consolidateVisible, (visible) => {
  if (!visible) consolidateRangePicker.cancel();
});
const dataToolsModalOpen = computed(
  () =>
    (Boolean(simulationDialog.value) && !pickingSimulationRange.value) ||
    (proofreadingVisible.value && !pickingProofreadingRange.value) ||
    fillNumberSequenceVisible.value ||
    (fillRankVisible.value && !pickingFillRankRange.value) ||
    fillSeriesVisible.value ||
    fillBlanksVisible.value ||
    fillTextVisible.value ||
    fillCurrentDateVisible.value ||
    duplicateErrorOptionsVisible.value ||
    dataTools.sortVisible.value ||
    (dataTools.textToColumnsVisible.value && !pickingSplitRange.value) ||
    dataTools.removeDuplicatesVisible.value ||
    (dataValidationVisible.value && !pickingValidationRange.value) ||
    dataTools.subtotalVisible.value ||
    (dataAdvancedFilterVisible.value && !pickingAdvancedRange.value) ||
    (duplicateValuesVisible.value && !pickingDuplicateRange.value) ||
    (comparisonVisible.value && !pickingComparisonRange.value) ||
    (lookupFillVisible.value && !pickingLookupFillRange.value) ||
    (dropdownListVisible.value && !pickingDropdownRange.value) ||
    (consolidateVisible.value && !pickingConsolidateRange.value),
);

function chooseValidationValue(payload: {
  address: CellAddress;
  value: string | number | boolean;
}): void {
  if (!cellEditSession.finish()) return;
  commitCellValue(payload);
  void nextTick(focusCellEditor);
}

function retryValidationInput(): void {
  dismissValidationInput();
  void nextTick(() =>
    cellEditSession.state.surface === "formula-bar" ? focusFormulaBarOrGrid() : focusCellEditor(),
  );
}

function cancelValidationInput(): void {
  dismissValidationInput();
  cellEditSession.cancel();
  void nextTick(focusCellEditor);
}

function confirmValidationInput(): void {
  if (acceptValidationInput()) cellEditSession.cancel();
  void nextTick(focusCellEditor);
}

function toggleOutline(payload: { id: string; collapsed: boolean }): void {
  if (dataToolsDisabled.value || !cellEditSession.finish()) return;
  executeCommand(
    createSetSheetOutlineGroupCollapsedCommand(activeSheet.value.id, payload.id, payload.collapsed),
  );
}

function showOutlineLevel(payload: { axis: SheetDimensionAxis; level: number }): void {
  if (dataToolsDisabled.value || !cellEditSession.finish()) return;
  executeCommand(
    createSetSheetOutlineLevelCommand(activeSheet.value.id, payload.axis, payload.level),
  );
}
const {
  disabled: formulaToolsDisabled,
  editTargetSheet,
  namesVisible,
  namedRanges,
  nameSelectionReference,
  recentFunctions,
  calculationSettings,
} = formulaTools;
const formulaReadOnly = computed(() => {
  void workbookRevision.value;
  return !canEditCell(
    editTargetSheet.value,
    cellEditSession.state.owner?.address ?? activeAddress.value,
  );
});
const formulaInsertVisible = ref(false);

function closeFormulaInsert(): void {
  formulaInsertVisible.value = false;
  void nextTick(focusFormulaBarOrGrid);
}

function insertFunctionFromBar(name: string): void {
  formulaTools.insertFunction(name);
  closeFormulaInsert();
}

const formulaEditor = useFormulaEditorController({
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  editSession: cellEditSession,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  focusFormulaBar: focusFormulaBarOrGrid,
});
const {
  visible: formulaEditorVisible,
  previewing: formulaPreviewing,
  previewValue: formulaPreviewValue,
  value: formulaEditorValue,
  targetLabel: formulaEditorTarget,
  error: formulaEditorError,
  disabled: formulaEditorDisabled,
} = formulaEditor;
watch(workbookGeneration, () => {
  formulaEditor.reset();
  formulaInsertVisible.value = false;
  namesVisible.value = false;
  recentFunctions.value = [];
});

const protectionRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingProtectionRange, reference: pickedProtectionReference } =
  protectionRangePicker;
async function selectProtectionReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const selected = await protectionRangePicker.selectReference(current);
  if (
    selected === undefined ||
    session.workbook !== workbook ||
    protectionDialog.value !== "ranges"
  )
    return undefined;
  const resolved = resolveRangeReference(workbook, selected, sheetId);
  if (!resolved || resolved.sheetId !== sheetId) return undefined;
  return `${formatCellAddress(resolved.range.start)}:${formatCellAddress(resolved.range.end)}`;
}
watch(protectionDialog, (dialog) => {
  if (dialog !== "ranges") protectionRangePicker.cancel();
});

const nameRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingNameRange, reference: pickedNameReference } = nameRangePicker;
const activeRangePicker = computed(() => {
  if (pickingTextBoxReference.value) return textBoxReferencePicker;
  if (pickingProtectionRange.value) return protectionRangePicker;
  if (pickingTableRange.value) return tableRangePicker;
  if (pickingPivotRange.value) return pivotRangePicker;
  if (pickingControlRange.value) return controlRangePicker;
  if (pickingCameraRange.value) return cameraRangePicker;
  if (pickingChartRange.value) return chartRangePicker;
  if (pickingSparklineRange.value) return sparklineRangePicker;
  if (pickingPageSetupRange.value) return pageSetupRangePicker;
  if (pickingFindFormat.value) return findFormatPicker;
  if (pickingSimulationRange.value) return simulationRangePicker;
  if (pickingProofreadingRange.value) return proofreadingRangePicker;
  if (pickingSplitRange.value) return splitRangePicker;
  if (pickingFillRankRange.value) return fillRankRangePicker;
  if (pickingValidationRange.value) return validationRangePicker;
  if (pickingDropdownRange.value) return dropdownRangePicker;
  if (pickingConsolidateRange.value) return consolidateRangePicker;
  if (pickingLookupFillRange.value) return lookupFillRangePicker;
  if (pickingComparisonRange.value) return comparisonRangePicker;
  if (pickingDuplicateRange.value) return duplicateRangePicker;
  if (pickingAdvancedRange.value) return advancedRangePicker;
  if (pickingConditionalFormatRange.value) return conditionalFormatRangePicker;
  if (pickingNameRange.value) return nameRangePicker;
  return undefined;
});
const pickingReferenceRange = computed(() => activeRangePicker.value !== undefined);
watch(namesVisible, (visible) => {
  if (!visible) nameRangePicker.cancel();
});

function changeSheetProperties(payload: {
  sheetId: string;
  patch: Partial<SheetProperties>;
}): void {
  if (!cellEditSession.finish()) return;
  if (payload.patch.protected !== undefined) {
    if (payload.sheetId !== activeSheet.value.id) {
      selectSheet(payload.sheetId);
      void nextTick(() => protectionActions.open("sheet"));
    } else protectionActions.open("sheet");
    return;
  }
  updateSheetProperties(payload);
}

function onWorkspaceWheel(event: WheelEvent): void {
  if (!event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  event.stopPropagation();
  zoom.value = normalizeSheetZoom(
    zoom.value + (event.deltaY < 0 ? SHEET_ZOOM_STEP : -SHEET_ZOOM_STEP),
  );
}

function focusFormulaBarOrGrid(): void {
  if (showFormulaBar.value) formulaBarRef.value?.focus({ preserveSelection: true });
  else focusCellEditor();
}

function setShowFormulaBar(visible: boolean): void {
  if (showFormulaBar.value === visible || (!visible && cellEditSession.state.composing)) return;
  const transferDraft =
    !visible && cellEditSession.state.active && cellEditSession.state.surface === "formula-bar";
  if (transferDraft) cellEditSession.activateSurface("grid");
  showFormulaBar.value = visible;
  if (transferDraft) void nextTick(focusCellEditor);
}

function onWorkspaceShapeTextOutsideAction(event: PointerEvent | MouseEvent): void {
  equationOpenRequest++;
  const math = equationEdit.snapshot.value;
  if (
    math &&
    !(
      event.target instanceof Element &&
      event.target.closest(`[data-equation-session="${math.sessionId}"]`)
    )
  ) {
    if (sheetGridRef.value?.flushPendingEquationEdit() === false) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }
  const current = shapeTextEdit.snapshot.value;
  if (!current) {
    const selected = shapeRibbonFormat.snapshot.value;
    if (!selected || ownsSelectedShapeFieldTarget(event.target)) return;
    if (!flushSelectedShapeFieldDrafts(selected)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return;
  }
  if (ownsShapeTextEditTarget(event.target, current.sessionId)) return;
  if (sheetGridRef.value?.flushPendingShapeTextEdit() === false) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function onWorkspaceNativeTextCopy(event: ClipboardEvent): void {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) ||
    target.closest("[data-shape-canvas-text-editor]")
  )
    return;
  if (
    target.selectionStart === null ||
    target.selectionEnd === null ||
    target.selectionStart === target.selectionEnd
  )
    return;
  const identity = shapeClipboard.getIdentity(),
    workbook = session.workbook,
    generation = workbookGeneration.value;
  void Promise.resolve().then(() => {
    if (
      identity &&
      !event.defaultPrevented &&
      session.workbook === workbook &&
      workbookGeneration.value === generation &&
      shapeClipboard.clear(identity)
    )
      shapeClipboardEpoch.value++;
  });
}
function onWorkspaceKeydown(event: KeyboardEvent): void {
  const effectsFocusReturn = pictureEffectsFocusReturn.value;
  const effectsTrigger = effectsFocusReturn();
  const fromEffectsTrigger = event.target instanceof Node && effectsTrigger?.contains(event.target);
  const activeBeforeHistory = document.activeElement;
  const historyContext = {
    blocked: gridInert.value || imageBusy.value || !!activeRangePicker.value,
    editing:
      cellEditSession.state.active ||
      cellEditSession.state.composing ||
      !!shapeTextEdit.snapshot.value ||
      !!equationEdit.snapshot.value,
    cropping: sheetGridRef.value?.hasActivePictureCrop() ?? false,
    undo,
    redo,
  };
  if (routeRibbonHistoryShortcut(event, historyContext)) {
    if (fromEffectsTrigger && effectsTrigger)
      restoreFocusAfterRemount(effectsTrigger, effectsFocusReturn, () => true, activeBeforeHistory);
    return;
  }
  const paneHistory = selectedShapePaneFieldLease();
  const paneFocusOwner = paneHistory
    ? {
        workbook: session.workbook,
        sheet: activeSheet.value,
        generation: workbookGeneration.value,
        paths: JSON.stringify(selectedShapeObjectPaths.value),
        owner: shapeFormatOwnerKey(paneHistory.pane.owner),
      }
    : undefined;
  const galleryPaintEditor =
    event.target instanceof HTMLInputElement &&
    event.target.getAttribute("data-panel-select-control") === "readonly-combobox"
      ? event.target.closest<HTMLElement>(".picture-paint-editor")
      : null;
  const galleryModeId =
    galleryPaintEditor && paneHistory?.element.contains(galleryPaintEditor)
      ? galleryPaintEditor.querySelector<HTMLInputElement>(
          'input[id^="picture-paint-mode-"][data-format-pane-history-control="readonly-combobox"]',
        )?.id
      : undefined;
  if (
    routeFormatPaneHistoryShortcut(event, {
      ...historyContext,
      pane: paneHistory?.element,
      current: () => paneHistory?.current() ?? false,
    })
  ) {
    const input = event.target;
    if (paneHistory && isFormatPaneReadonlyHistoryControl(input)) {
      const id = input.id;
      // Undo can legitimately refresh the Ribbon's independent session. Resolve
      // the same semantic pane owner again without reviving its retired lease.
      const currentFocusPane = () => {
        const next = selectedShapePaneFieldLease();
        return paneFocusOwner &&
          next &&
          session.workbook === paneFocusOwner.workbook &&
          activeSheet.value === paneFocusOwner.sheet &&
          workbookGeneration.value === paneFocusOwner.generation &&
          JSON.stringify(selectedShapeObjectPaths.value) === paneFocusOwner.paths &&
          next.element === paneHistory.element &&
          shapeFormatOwnerKey(next.pane.owner) === paneFocusOwner.owner &&
          next.current()
          ? next
          : undefined;
      };
      restoreFocusAfterRemount(
        input,
        () => {
          const currentPane = currentFocusPane()?.element;
          if (!currentPane) return;
          const controls = [
            ...currentPane.querySelectorAll<HTMLInputElement>(
              "input[data-format-pane-history-control], input[data-panel-select-control]",
            ),
          ];
          const original = controls.find(
            (control) => control.id === id && isFormatPaneReadonlyHistoryControl(control),
          );
          if (original) return original;
          // A picture-only gallery can disappear or replace its keyed trigger.
          // Return only to the captured editor's own mode, never another editor.
          if (
            !galleryModeId ||
            !galleryPaintEditor?.isConnected ||
            !currentPane.contains(galleryPaintEditor) ||
            galleryPaintEditor.closest("[data-shape-format-pane]") !== currentPane
          )
            return;
          return controls.find(
            (control) =>
              control.id === galleryModeId &&
              galleryPaintEditor.contains(control) &&
              isFormatPaneReadonlyHistoryControl(control),
          );
        },
        () => !!currentFocusPane(),
        activeBeforeHistory,
      );
    }
    return;
  }
  const math = equationEdit.snapshot.value;
  if (
    math &&
    event.target instanceof Element &&
    event.target.closest(`[data-equation-session="${math.sessionId}"]`)
  )
    return;
  if (
    math &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.key === "F2" || event.key === "Enter") &&
    event.target instanceof Element &&
    !event.target.closest("input, textarea, [contenteditable]")
  ) {
    const id = event.target.closest<HTMLElement>("[data-sheet-drawing-id]")?.dataset.sheetDrawingId;
    if (id)
      for (const root of activeSheet.value.drawings ?? []) {
        if (isShapeGroupDrawing(root)) {
          const visit = traverseShapeGroup(root).find(
            ({ node }) => node.id === id && isSheetGroupedEquationDrawing(node),
          );
          if (!visit) continue;
          // Commit may replace the outer root and invalidate the original Layer
          // view before this captured keystroke reaches its target handler.
          event.preventDefault();
          event.stopImmediatePropagation();
          editOwnedDrawing(root, visit.path);
          return;
        }
        if (root.id === id && root.kind === "equation") {
          event.preventDefault();
          event.stopImmediatePropagation();
          beginEquationEdit(root);
          return;
        }
      }
  }
  if (math && sheetGridRef.value?.flushPendingEquationEdit() === false) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const currentShapeTextEdit = shapeTextEdit.snapshot.value;
  if (currentShapeTextEdit && ownsShapeTextEditTarget(event.target, currentShapeTextEdit.sessionId))
    return;
  if (shapeTextEdit.snapshot.value && sheetGridRef.value?.flushPendingShapeTextEdit() === false) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (symbolVisible.value) return;
  if (
    themeDialogVisible.value ||
    backgroundConflictVisible.value ||
    printPreviewVisible.value ||
    watermarkVisible.value ||
    (pageSetupVisible.value && !pickingPageSetupRange.value) ||
    formulaEditorVisible.value ||
    formulaInsertVisible.value ||
    hyperlinkDraft.value ||
    noteDraft.value
  )
    return;
  const picker = activeRangePicker.value;
  if (picker) {
    if (event.key === "Escape") picker.cancel();
    else if (event.key === "Enter") picker.confirm();
    else if (event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const target = event.target instanceof Element ? event.target : undefined;
  const genericInput =
    target?.closest("input, textarea, [contenteditable]") &&
    !target?.closest("[data-cell-edit-surface]");
  if (
    !genericInput &&
    !event.defaultPrevented &&
    !event.repeat &&
    !event.isComposing &&
    !cellEditSession.state.active &&
    !cellEditSession.state.composing &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !target?.closest('[role="dialog"],[role="menu"],[role="listbox"]')
  ) {
    const key = event.key.toLowerCase();
    const paths = sheetGridRef.value?.getSelectedShapeObjects() ?? [];
    if (
      ((key === "c" || key === "x") && paths.length) ||
      (key === "v" && shapeClipboard.hasPending())
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "c") shapeClipboard.copy(paths);
      else if (key === "x") shapeClipboard.cut(paths);
      else shapeClipboard.paste();
      shapeClipboardEpoch.value++;
      return;
    }
    if (key === "c" || key === "x") {
      shapeClipboard.clear();
      shapeClipboardEpoch.value++;
    }
  }
  if (
    !gridInert.value &&
    !genericInput &&
    !event.repeat &&
    !event.isComposing &&
    !cellEditSession.state.composing &&
    !event.defaultPrevented
  ) {
    const symbol = resolveSymbolShortcut(symbolPreferences.preferences.value, event);
    if (symbol) {
      event.preventDefault();
      event.stopPropagation();
      const generation = workbookGeneration.value;
      const sheet = activeSheet.value;
      const address = { ...activeAddress.value };
      const editGeneration = cellEditSession.state.generation;
      const revision = cellEditSession.state.revision;
      const documentRevision = workbookRevision.value;
      const selection = { ...cellEditSession.state.selection };
      void (symbol.fontFamily ? ensureCellFontResource(symbol.fontFamily) : Promise.resolve())
        .then(() => {
          if (
            generation !== workbookGeneration.value ||
            sheet !== activeSheet.value ||
            address.row !== activeAddress.value.row ||
            address.column !== activeAddress.value.column ||
            editGeneration !== cellEditSession.state.generation ||
            documentRevision !== workbookRevision.value ||
            revision !== cellEditSession.state.revision ||
            cellEditSession.state.selection.start !== selection.start ||
            cellEditSession.state.selection.end !== selection.end ||
            cellEditSession.state.selection.direction !== selection.direction ||
            gridInert.value
          )
            return;
          if (insertSymbol(symbol))
            symbolPreferences.update(withRecentSymbol(symbolPreferences.preferences.value, symbol));
        })
        .catch(() => {
          void MessagePlugin.warning(t("workspace.cellEditUnavailable"));
        });
      return;
    }
  }
  if (
    event.key.toLowerCase() === "k" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !cellEditSession.state.composing
  ) {
    event.preventDefault();
    event.stopPropagation();
    hyperlinkActions.edit();
    return;
  }
  if (
    event.key.toLowerCase() === "t" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    event.stopPropagation();
    tableActions.requestCreate();
    return;
  }
  if (
    event.key === "1" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !cellEditSession.state.composing
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!cellFormatSelection.value) openCellFormat();
    return;
  }
  if (
    event.key === "F2" &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    !cellEditSession.state.composing
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (cellEditSession.state.surface === "formula-bar") focusCellEditor();
    else {
      showFormulaBar.value = true;
      void nextTick(() => formulaBarRef.value?.focus({ preserveSelection: true }));
    }
    return;
  }
  if (event.key !== "Escape" || !formatPainterActive.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  cancelFormatPainter();
}
const gridInert = computed(
  () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    (!!protectionDialog.value && !pickingProtectionRange.value) ||
    !!textReview.mode.value ||
    !!wordProofreading.panel.value ||
    encryptDocumentVisible.value ||
    xlsxActions.passwordRequired.value ||
    !!cellFormatSelection.value ||
    !!findFormatDraft.value ||
    dataToolsModalOpen.value ||
    !!hyperlinkDraft.value ||
    (!!editingCamera.value && !pickingCameraRange.value) ||
    (!!editingControl.value && !pickingControlRange.value) ||
    (!!editingPivot.value && !pickingPivotRange.value) ||
    pivotFieldSettingsOpen.value ||
    !!pictureAnnotation.value ||
    !!viewingAttachment.value ||
    !!editingDrawing.value ||
    (!!textBoxReferenceDialog.value && !pickingTextBoxReference.value) ||
    !!shapeClipboardTransferConfirmation.value ||
    symbolVisible.value ||
    ((!!editingChart.value || !!chartSourceDialog.value) && !pickingChartRange.value) ||
    (!!sparklineDraft.value && !pickingSparklineRange.value) ||
    cellStylesModalOpen.value ||
    (tableModalOpen.value && !pickingTableRange.value) ||
    formulaEditorVisible.value ||
    formulaInsertVisible.value ||
    printPreviewVisible.value ||
    backgroundConflictVisible.value ||
    themeDialogVisible.value ||
    watermarkVisible.value ||
    (pageSetupVisible.value && !pickingPageSetupRange.value) ||
    !!modalValidationFeedback.value,
);
watch(
  gridInert,
  (blocked) => {
    shapeInteractionBlocked.value = blocked;
    if (blocked) shapeCreation.cancel();
  },
  { immediate: true, flush: "sync" },
);
</script>

<template>
  <section
    class="spreadsheet-workspace"
    :class="{
      'is-formula-bar-hidden': !showFormulaBar,
    }"
    :aria-label="t('workspace.editor')"
    :aria-busy="loading || fileBusy || imageBusy || xlsxBusy"
    @keydown.capture="onWorkspaceKeydown"
    @copy.capture="onWorkspaceNativeTextCopy"
    @cut.capture="onWorkspaceNativeTextCopy"
    @pointerdown.capture="onWorkspaceShapeTextOutsideAction"
    @click.capture="onWorkspaceShapeTextOutsideAction"
    @wheel.capture="onWorkspaceWheel"
  >
    <input
      :ref="imageActions.fileInput"
      :key="imageActions.pickerKey.value"
      type="file"
      class="spreadsheet-workspace__image-input"
      :accept="SUPPORTED_IMAGE_FILE_ACCEPT"
      :aria-label="t('image.insertMenu')"
      @change="imageActions.onFileChange"
      @cancel="imageActions.onFileCancel"
    />
    <SpreadsheetRibbon
      :has-chart="!!chartObjectContext"
      :has-image="!!selectedPicture"
      :has-shape="!!shapeObjectControls.snapshot.value?.paths.length"
      :before-shape-context-change="beforeShapeContextChange"
      :has-shape-text="
        !!shapeRibbonSnapshot &&
        (shapeRibbonSnapshot.values.fontSizePt !== undefined ||
          shapeRibbonSnapshot.mixedFields?.includes('fontSizePt') === true)
      "
      :shape-text-session-id="shapeTextEdit.snapshot.value?.sessionId"
      :shape-context-key="
        JSON.stringify([activeSheet.id, workbookGeneration, selectedShapeObjectPaths])
      "
      :has-equation="!!equationEdit.snapshot.value"
      :pivot-id="activePivot?.id"
      :hyperlink-disabled="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !canUseSheetPermission(activeSheet, 'insertHyperlinks') ||
        !canEditCell(activeSheet, activeAddress)
      "
      :image-disabled="
        loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
      "
      :theme="session.workbook.theme"
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported || protectedFormatting"
      :conditional-formatting-disabled="activeSheet.properties.protected"
      :read-only="activeSheet.properties.protected"
      @toggle-protection="
        changeSheetProperties({
          sheetId: activeSheet.id,
          patch: { protected: !activeSheet.properties.protected },
        })
      "
      :format-painter-active="formatPainterActive"
      :data-state="dataToolState"
      :merge-state="mergeState"
      :formula-disabled="formulaToolsDisabled"
      :edit-session-id="cellEditSession.id"
      :recent-functions="recentFunctions"
      :name-creation-enabled="!formulaToolsDisabled"
      :calculation-settings="calculationSettings"
      :cell-styles="customCellStyles"
      :table-styles="customTableStyles"
      :pivot-table-styles="customPivotTableStyles"
      :selected-table-style-id="activeTable?.style.id"
      :selected-table-style-color="activeTable?.style.accentColor"
      :has-table="!!activeTable"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!conditionalFormattingSelection ||
        !!hyperlinkDraft ||
        (!!editingCamera && !pickingCameraRange) ||
        (!!editingControl && !pickingControlRange) ||
        (!!editingPivot && !pickingPivotRange) ||
        pivotFieldSettingsOpen ||
        !!pictureAnnotation ||
        !!viewingAttachment ||
        !!editingDrawing ||
        !!textBoxReferenceDialog ||
        !!shapeClipboardTransferConfirmation ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        (!!sparklineDraft && !pickingSparklineRange) ||
        cellStylesModalOpen ||
        tableModalOpen ||
        !!findFormatDraft ||
        namesVisible ||
        pickingReferenceRange ||
        dataToolsModalOpen ||
        formulaEditorVisible ||
        formulaInsertVisible ||
        !!modalValidationFeedback
      "
      @insert-image="imageActions.requestInsert"
      @insert-hyperlink="hyperlinkActions.edit"
      @apply-borders="applyCellBorders"
      @update-border-format="updateBorderFormat"
      @open-cell-format="openCellFormat"
      @create-conditional-format="openConditionalFormatting"
      @manage-conditional-formats="openConditionalFormatting()"
      @clear-conditional-formats="clearConditionalFormatRules"
      @apply-named-cell-style="cellStyleActions.applyStyle"
      @create-cell-style="cellStyleActions.createStyle"
      @edit-cell-style="cellStyleActions.editStyle"
      @delete-cell-style="cellStyleActions.deleteStyle"
      @merge-cell-styles="cellStyleActions.openMerge"
      @apply-table-style="tableActions.applyStyle"
      @create-table-style="tableActions.openStyle()"
      @edit-table-style="tableActions.openStyle($event)"
      @delete-table-style="tableActions.deleteStyle"
      @create-pivot-table-style="tableActions.openPivotStyle()"
      @edit-pivot-table-style="tableActions.openPivotStyle($event)"
      @delete-pivot-table-style="tableActions.deletePivotStyle"
      @clear-table-style="tableActions.clearStyle"
      @manage-table="tableActions.openSettings"
      @apply-style="applyCellStyle"
      @convert-number-type="convertNumberType"
      @adjust-decimals="adjustNumberFormatDecimals"
      @adjust-indent="adjustIndent"
      @activate-format-painter="activateFormatPainter"
      @auto-sum="formulaTools.aggregate('SUM')"
      @insert-function="formulaTools.insertFunction"
      @aggregate="formulaTools.aggregate"
      @open-names="formulaTools.openNames"
      @create-names-from-selection="formulaTools.createNamesFromSelection"
      @update-calculation-settings="formulaTools.updateCalculationSettings"
      @recalculate="formulaTools.recalculate"
      @formula-interaction-end="formulaTools.focusFormulaBar"
      @sort="sortSelection"
      @apply-filter="applyFilter"
      @clear-filter="clearFilter"
      @freeze="freeze"
      @unfreeze="unfreeze"
      @merge="mergeSelection"
      @unmerge="unmergeSelection"
      @undo="undo"
      @redo="redo"
    >
      <template #pivot-analysis-tools>
        <PivotAnalysisToolbar
          v-if="activePivot"
          :table="activePivot"
          :disabled="pivotDisabled"
          :fields-visible="pivotFieldsVisible"
          :active-field="pivotActiveField?.name ?? ''"
          :group-enabled="pivotGroupField !== undefined"
          :ungroup-enabled="activePivot.groups?.some((group) => group.field === pivotGroupField)"
          @group="pivotGrouping.open()"
          @ungroup="pivotGrouping.ungroup()"
          @rename="pivotActions.update({ ...activePivot, name: $event })"
          @settings="openPivotFieldSettings"
          @refresh="pivotActions.refresh"
          @source="pivotActions.source"
          @clear="pivotActions.clear"
          @move="pivotActions.move"
          @remove="pivotActions.remove(true)"
          @convert="pivotActions.remove(false)"
          @chart="pivotActions.chart"
          @fields="pivotFieldsVisible = !pivotFieldsVisible"
        />
      </template>
      <template #pivot-design-tools>
        <PivotDesignToolbar
          v-if="activePivot"
          :table="activePivot"
          :disabled="pivotDisabled"
          @update="pivotActions.update($event)"
        >
          <template #styles
            ><TableStyleGallery
              kind="pivot"
              :styles="pivotStyles"
              :selected-style-id="activePivot.styleId ?? pivotStyles[0]?.id"
              compact
              layout="ribbon"
              :disabled="pivotDisabled"
              @select="pivotActions.update({ ...activePivot, styleId: $event.id })"
              @edit="tableActions.openPivotStyle($event)"
              @delete="tableActions.deletePivotStyle"
          /></template>
        </PivotDesignToolbar>
      </template>
      <template #equation-tools>
        <EquationTools
          v-if="equationEdit.snapshot.value"
          :owner-id="equationEdit.snapshot.value.ownerId"
          :session-id="equationEdit.snapshot.value.sessionId"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :disabled="loading || fileBusy || xlsxBusy || equationEdit.snapshot.value.composing"
          :restore-structured-available="!!equationEdit.snapshot.value.draft"
          :normal-text-active="equationEdit.snapshot.value.normalText"
          :source-mode="equationEdit.snapshot.value.mode"
          :selected-structure="equationEdit.selectedStructure.value"
          :selected-matrix-row="equationMatrixCell.row"
          :selected-matrix-column="equationMatrixCell.column"
          :placeholders-hidden="equationPlaceholdersHidden"
          :insert-template="insertEquationTemplate"
          :insert-symbol="insertEquationSymbol"
          :convert-fraction="
            (intent) => editEquationMathOption({ type: 'fraction-style', ...intent })
          "
          :edit-matrix="editEquationMathOption"
          :edit-source="() => equationEdit.callbacks.value?.sourceMode() ?? false"
          :edit-normal-text="insertEquationNormalText"
          :reload-structured="() => equationEdit.callbacks.value?.reloadStructured() ?? false"
          :hide-placeholders="
            (hidden) => {
              equationPlaceholdersHidden = hidden;
              return true;
            }
          "
          :finish="() => equationEdit.callbacks.value?.commit() ?? false"
        />
        <div
          v-if="equationEdit.snapshot.value?.sourceWarning"
          role="alert"
          data-equation-source-warning
          :data-equation-session="equationEdit.snapshot.value.sessionId"
          class="spreadsheet-workspace__equation-warning"
        >
          <p>{{ t("equation.sourceNotice") }}</p>
          <button type="button" @click="equationEdit.callbacks.value?.confirmSourceMode()">
            {{ t("equation.source") }}
          </button>
          <button type="button" @click="equationEdit.callbacks.value?.dismissSourceWarning()">
            {{ t("equation.cancel") }}
          </button>
        </div>
      </template>
      <template #shape-tools>
        <ShapeTextRibbonTools
          v-if="shapeRibbonSnapshot"
          mode="drawing"
          :snapshot="shapeRibbonSnapshot"
          :capabilities="shapeRibbonCapabilities"
          :on-intent="shapeRibbonIntent"
          :session-id="shapeTextEdit.snapshot.value?.sessionId"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :t="pictureFormatLabel"
          :load-paint-asset="shapePaintAssets.load"
          :object-tools="shapeRibbonObjectTools"
        />
        <ShapeToolsToolbar
          v-else
          v-if="shapeObjectControls.snapshot.value"
          :owner-key="shapeObjectControls.snapshot.value.ownerKey"
          :disabled="shapeObjectControls.snapshot.value.disabled"
          :can-flip="shapeObjectControls.snapshot.value.canFlip"
          :can-rotate="shapeObjectControls.snapshot.value.canRotate"
          :can-order="shapeObjectControls.snapshot.value.canOrder"
          :can-format="shapeObjectControls.snapshot.value.canFormat"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :unavailable-reason="
            locale === 'zh-CN'
              ? '该对象暂不支持此操作，原数据已保留。'
              : 'This operation is unavailable for this object; its original data is preserved.'
          "
          :action-handler="shapeObjectControls.snapshot.value.actionHandler"
          :format-handler="shapeObjectControls.snapshot.value.formatHandler"
          :selection-pane-handler="shapeObjectControls.snapshot.value.selectionPaneHandler"
        />
      </template>
      <template #shape-text-tools>
        <ShapeTextRibbonTools
          v-if="shapeRibbonSnapshot"
          mode="text"
          :snapshot="shapeRibbonSnapshot"
          :capabilities="shapeRibbonCapabilities"
          :on-intent="shapeRibbonIntent"
          :session-id="shapeTextEdit.snapshot.value?.sessionId"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :t="pictureFormatLabel"
          :load-paint-asset="shapePaintAssets.load"
        />
      </template>
      <template #image-tools>
        <PictureToolbar
          ref="pictureToolbarRef"
          :restore-effects-focus-target="pictureEffectsFocusReturn"
          :can-restore="pictureOriginalResetOwner.available"
          :restore-handler="pictureOriginalResetOwner.apply"
          :restore-unavailable-reason="pictureOriginalResetOwner.reason"
          :alignment-reference="pictureAlignmentReference"
          @reference="pictureAlignmentReference = $event"
          v-if="selectedPicture && !isPictureGroup(selectedPicture)"
          :key="pictureToolbarOwner?.key"
          :image="selectedPicture"
          :geometry="pictureToolbarOwner?.geometry"
          :draft-owner-key="pictureToolbarOwner?.draftKey"
          :appearance-draft-key="pictureToolbarOwner?.appearanceDraftKey"
          :error="
            pictureTools.sizeFeedback.value
              ? t(pictureTools.sizeFeedback.value)
              : pictureTools.operationFeedback.value
                ? t(pictureTools.operationFeedback.value)
                : undefined
          "
          :selection-count="selectedPictureIds.length"
          :group-create-disabled="!canUseSheetPermission(activeSheet, 'editObjects')"
          :preview-on-double-click="picturePreviewOnDoubleClick"
          @view-settings="picturePreviewOnDoubleClick = $event"
          :busy="loading || fileBusy || xlsxBusy || imageBusy"
          :disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            imageBusy ||
            attachmentBusy ||
            captureBusy ||
            !canEditPictureSelection(activeSheet, selectedPictureIds)
          "
          :resize-handler="pictureToolbarOwner?.resize"
          :aspect-ratio-handler="pictureToolbarOwner?.aspectRatio"
          :appearance-handler="pictureToolbarOwner?.appearance"
          :effect-handler="pictureToolbarOwner?.effect"
          :convert-handler="pictureSourceRibbonOwner?.convert"
          :can-convert="pictureSourceRibbonOwner?.canConvert"
          :replace-handler="pictureSourceRibbonOwner?.replace"
          :can-replace="pictureSourceRibbonOwner?.canReplace"
          :can-preview="pictureSourceRibbonOwner?.canPreview"
          :preview-handler="pictureSourceRibbonOwner?.preview"
          :can-annotate="pictureSourceRibbonOwner?.canAnnotate"
          :annotate-handler="pictureSourceRibbonOwner?.annotate"
          :can-crop="pictureSourceRibbonOwner?.canCrop"
          :crop-handler="pictureSourceRibbonOwner?.crop"
          @insert-image="imageActions.requestInsert"
          @crop="sheetGridRef?.cropImage()"
          @format="openOwnedPictureFormat(undefined, activeSheet, undefined, $event)"
          @rotate="sheetGridRef?.rotateImage($event)"
          @flip="sheetGridRef?.flipImage($event)"
          @restore="sheetGridRef?.restoreImage()"
          @replace="imageActions.requestReplace(selectedPicture.id)"
          @annotate="pictureDialogs.openAnnotation"
          @compress="pictureDialogs.openCompression"
          @batch-size="pictureDialogs.openBatchSize"
          @export="pictureAssetTools.exportPictures"
          @preview="sheetGridRef?.previewSelectedPicture()"
          @print="pictureAssetTools.printPictures"
          @group="performPictureGroup()"
          @ungroup="performPictureGroup(true)"
          @layer="pictureTools.layer"
          @align="
            (action, reference) =>
              sheetGridRef?.arrangePictures(selectedPictureIds, action, reference)
          "
          @selection-pane="pictureTools.paneVisible.value = !pictureTools.paneVisible.value"
          @convert-to-cell="pictureCellConversion.request(selectedPicture.id)"
        />
        <PictureOwnedLeafRibbon
          ref="pictureOwnedLeafRibbonRef"
          :restore-effects-focus-target="pictureEffectsFocusReturn"
          :can-restore="pictureOriginalResetOwner.available"
          :restore-handler="pictureOriginalResetOwner.apply"
          :restore-unavailable-reason="pictureOriginalResetOwner.reason"
          v-if="selectedOwnedPictureLeaf && pictureSourceRibbonOwner"
          :key="pictureSourceRibbonOwner.displayKey"
          :display-owner-key="pictureSourceRibbonOwner.displayKey"
          :image="selectedOwnedPictureLeaf.node"
          :busy="loading || fileBusy || xlsxBusy || imageBusy"
          :owner-key="pictureSourceRibbonOwner.key"
          :appearance-handler="pictureSourceRibbonOwner.appearance"
          :effect-handler="pictureSourceRibbonOwner.effect"
          :replace-handler="pictureSourceRibbonOwner.replace"
          :format-handler="pictureSourceRibbonOwner.format"
          :can-replace="pictureSourceRibbonOwner.canReplace"
          :can-preview="pictureSourceRibbonOwner.canPreview"
          :preview-handler="pictureSourceRibbonOwner.preview"
          :convert-handler="pictureSourceRibbonOwner.convert"
          :can-convert="pictureSourceRibbonOwner.canConvert"
          :can-annotate="pictureSourceRibbonOwner.canAnnotate"
          :annotate-handler="pictureSourceRibbonOwner.annotate"
          :can-crop="pictureSourceRibbonOwner.canCrop"
          :crop-handler="pictureSourceRibbonOwner.crop"
          @compress="pictureDialogs.openCompression"
          @batch-size="pictureDialogs.openBatchSize"
          @export="pictureAssetTools.exportPictures"
          :disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            imageBusy ||
            !canEditPictureSelection(activeSheet, selectedPictureIds)
          "
        />
        <PictureGroupRibbon
          :alignment-reference="pictureAlignmentReference"
          @reference="pictureAlignmentReference = $event"
          v-if="
            selectedPicture &&
            isPictureGroup(selectedPicture) &&
            (selectedOwnedPicturePath?.length ?? 0) <= 1
          "
          :key="pictureToolbarOwner?.key"
          :image="selectedPicture"
          :geometry="pictureToolbarOwner?.geometry"
          :draft-owner-key="pictureToolbarOwner?.draftKey"
          :error="
            pictureTools.sizeFeedback.value
              ? t(pictureTools.sizeFeedback.value)
              : pictureTools.operationFeedback.value
                ? t(pictureTools.operationFeedback.value)
                : undefined
          "
          :selection-count="selectedPictureIds.length"
          :group-create-disabled="!canUseSheetPermission(activeSheet, 'editObjects')"
          @compress="pictureDialogs.openCompression"
          @batch-size="pictureDialogs.openBatchSize"
          :disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            imageBusy ||
            !canEditPictureSelection(activeSheet, selectedPictureIds)
          "
          :resize-handler="pictureToolbarOwner?.resize"
          :aspect-ratio-handler="pictureToolbarOwner?.aspectRatio"
          @group="performPictureGroup()"
          @ungroup="performPictureGroup(true)"
          @layer="pictureTools.layer"
          @align="
            (action, reference) =>
              sheetGridRef?.arrangePictures(selectedPictureIds, action, reference)
          "
          @rotate="sheetGridRef?.rotateImage($event)"
          @flip="sheetGridRef?.flipImage($event)"
          @selection-pane="pictureTools.paneVisible.value = !pictureTools.paneVisible.value"
          @format="openOwnedPictureFormat()"
        />
      </template>
      <template #chart-tools>
        <ChartElementsToolbar
          v-if="chartObjectContext"
          :key="chartObjectContext.drawing.id"
          :chart="chartObjectContext.drawing.chart"
          :disabled="loading || fileBusy || xlsxBusy || chartObjectContext.disabled"
          :apply="chartObjectContext.apply"
          :apply-design="chartObjectContext.applyDesign"
          :apply-layout="chartObjectContext.applyLayout"
          :preview-layout="chartObjectContext.previewLayout"
          :apply-and-run="chartObjectContext.applyAndRun"
          :on-edit="chartObjectContext.edit"
          :on-source="chartObjectContext.source"
          :on-switch-direction="chartObjectContext.switchDirection"
          :on-format="chartObjectContext.format"
          :apply-and-format="chartObjectContext.applyAndFormat"
          :format-target="chartFormatTarget"
          :format-targets="chartFormatChoices"
        />
      </template>
      <template #insert-tools>
        <InsertToolbar
          :pivot-disabled="loading || fileBusy || xlsxBusy"
          :pivot-chart-disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            (!!activePivot && !canUseSheetPermission(activeSheet, 'editObjects'))
          "
          :pivot-manage-disabled="
            loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'pivotTables')
          "
          :has-pivot="!!activePivot"
          @insert-pivot="insertPivot"
          @edit-pivot="openPivotFields()"
          @refresh-pivot="pivotActions.refresh"
          @remove-pivot="pivotActions.remove"
          @insert-control="controlActions.open()"
          @insert-attachment="attachmentActions.requestInsert"
          @insert-drawing="drawingActions.insert"
          :insert-shape-handler="shapeInsertHandler"
          :insert-word-art-handler="wordArtInsertHandler"
          :insert-equation-handler="equationInsertHandler"
          :shape-owner-id="`${workbookGeneration}:${activeSheet.id}:${workbookRevision}`"
          @insert-camera="cameraActions.open()"
          @insert-chart="chartActions.insert"
          :sparkline-disabled="
            loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'formatCells')
          "
          @insert-sparkline="sparklineActions.open"
          @clear-sparklines="sparklineActions.remove"
          :symbol-disabled="
            loading || fileBusy || xlsxBusy || !canEditCell(activeSheet, activeAddress)
          "
          @insert-symbol="openSymbolDialog"
          :insert-symbol-text-handler="quickSymbolInsert"
          @capture-screen="insertScreenCapture"
          :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
          :image-disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            imageBusy ||
            attachmentBusy ||
            !canUseSheetPermission(activeSheet, 'editObjects')
          "
          :hyperlink-disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            !canUseSheetPermission(activeSheet, 'insertHyperlinks') ||
            !canEditCell(activeSheet, activeAddress)
          "
          :has-table="!!activeTable"
          :edit-session-id="cellEditSession.id"
          @insert-image="imageActions.requestInsert"
          @insert-hyperlink="hyperlinkActions.edit"
          @insert-table="tableActions.requestCreate"
          @manage-table="tableActions.openSettings"
        >
          <template #watermark>
            <PageWatermarkMenu
              :watermark="pageDecoration.watermark"
              :presets="session.workbook.watermarkPresets"
              :image-asset-urls="imageAssetUrls"
              :disabled="
                loading ||
                fileBusy ||
                xlsxBusy ||
                decorationBusy ||
                activeSheet.properties.protected
              "
              @apply="applyWatermark"
              @custom="openWatermark"
              @edit-document="openWatermark(undefined, pageDecoration.watermark)"
              @apply-preset="applyWatermarkPreset"
              @edit-preset="openWatermark"
              @delete-preset="decorations.deletePreset"
              @remove="decorations.removeWatermark"
            />
          </template>
        </InsertToolbar>
      </template>
      <template #table-tools>
        <TableToolsToolbar
          v-if="activeTable"
          :table="activeTable"
          :custom-styles="customTableStyles"
          :custom-pivot-styles="customPivotTableStyles"
          :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
          :edit-session-id="cellEditSession.id"
          @rename="tableActions.renameTable"
          @change-options="tableActions.updateTable"
          @resize="tableActions.openResize"
          @calculated-column="tableActions.openCalculatedColumn"
          @remove-duplicates="dataTools.openTableRemoveDuplicates(activeTable.id)"
          @convert="tableActions.convertToRange"
          @apply-style="tableActions.applyStyle"
          @create-style="tableActions.openStyle()"
          @edit-style="tableActions.openStyle($event)"
          @delete-style="tableActions.deleteStyle"
          @create-pivot-style="tableActions.openPivotStyle()"
          @edit-pivot-style="tableActions.openPivotStyle($event)"
          @delete-pivot-style="tableActions.deletePivotStyle"
          @clear-style="tableActions.clearStyle"
          @settings="tableActions.openSettings"
        />
      </template>
      <template #proofreading-tools="{ close }">
        <ProofreadingToolbar
          :busy="loading || fileBusy || xlsxBusy"
          @open="wordProofreading.open"
          @close="
            wordProofreading.panel.value = undefined;
            close();
          "
        />
      </template>
      <template #review-tools="{ openProofreading }">
        <ReviewToolbar
          :objects-read-only="!canUseSheetPermission(activeSheet, 'editObjects')"
          :busy="loading || fileBusy || xlsxBusy"
          :read-only="activeSheet.properties.protected"
          :can-lock-cells="canLockCells"
          :locked-state="lockedState"
          :structure-protected="structureProtected"
          :has-note="hasNote"
          :has-selected-notes="hasSelectedNotes"
          :has-notes="reviewNotes.length > 0"
          :show-active-note="showActiveNote"
          :edit-session-id="cellEditSession.id"
          @encrypt-document="openDocumentEncryption"
          @proofread="openProofreading"
          @spelling="textReview.open('spelling')"
          @convert-text="(mode, scope) => textReview.open(mode, scope)"
          @edit-note="reviewActions.edit()"
          @delete-notes="reviewActions.remove()"
          @previous-note="reviewActions.step(-1)"
          @next-note="reviewActions.step(1)"
          @toggle-note="reviewActions.toggleNote"
          @show-all-notes="reviewActions.setAllNotesVisible(true)"
          @hide-all-notes="reviewActions.setAllNotesVisible(false)"
          @reset-note-box="reviewActions.resetBox"
          @toggle-protection="protectionActions.open('sheet')"
          @toggle-cells-lock="protectionActions.toggleCells"
          @editable-ranges="protectionActions.open('ranges')"
          @toggle-workbook-protection="protectionActions.open('workbook')"
        />
      </template>
      <template #page-tools>
        <PageToolbar
          :setup="activePageSetup"
          :last-custom-margins="lastCustomMargins"
          :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
          :busy="loading || fileBusy || xlsxBusy"
          :active-cell="activeAddress"
          :selection-mode="activeSelectionMode"
          :view-mode="activeViewMode"
          v-model:show-page-breaks="showPageBreaks"
          :edit-session-id="cellEditSession.id"
          @change="changePageSetup"
          @open-setup="openPageSetup"
          @set-print-area="setPrintAreaFromSelection"
          @page-break="changePageBreak"
          @print-preview="openPrintPreview"
          @update:view-mode="setViewMode"
        >
          <template #appearance>
            <PageThemeMenu
              :theme="workbookTheme"
              :context-key="String(workbookGeneration)"
              @update:dialog-visible="themeDialogVisible = $event"
              :disabled="
                loading ||
                fileBusy ||
                xlsxBusy ||
                [...session.workbook.sheets.values()].some((sheet) => sheet.properties.protected)
              "
              @apply="pageThemeController.apply"
            />
            <PageBackgroundMenu
              :background-conflict="
                !!pageDecoration.watermark && pageDecoration.watermark.mode !== 'independent'
              "
              :context-key="`${workbookGeneration}:${activeSheet.id}`"
              @update:conflict-visible="backgroundConflictVisible = $event"
              :has-background="!!pageDecoration.backgroundAssetId"
              :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
              :busy="decorationBusy"
              @select-file="decorations.setBackgroundFile"
              @remove="decorations.removeBackground"
            />
            <PageWatermarkMenu
              :watermark="pageDecoration.watermark"
              :presets="session.workbook.watermarkPresets"
              :image-asset-urls="imageAssetUrls"
              :disabled="
                loading ||
                fileBusy ||
                xlsxBusy ||
                decorationBusy ||
                activeSheet.properties.protected
              "
              @apply="applyWatermark"
              @custom="openWatermark"
              @edit-document="openWatermark(undefined, pageDecoration.watermark)"
              @apply-preset="applyWatermarkPreset"
              @edit-preset="openWatermark"
              @delete-preset="decorations.deletePreset"
              @remove="decorations.removeWatermark"
            />
          </template>
          <template #beautify>
            <TableStylesMenu
              variant="tall"
              :label="t('pageTools.beautify')"
              :theme-accent-color="session.workbook.theme.accentColors[0]"
              :custom-styles="customTableStyles"
              :custom-pivot-styles="customPivotTableStyles"
              :selected-style-id="activeTable?.style.id"
              :selected-accent-color="activeTable?.style.accentColor"
              :has-table="!!activeTable"
              :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
              :edit-session-id="cellEditSession.id"
              @apply="tableActions.applyStyle"
              @create="tableActions.openStyle()"
              @edit="tableActions.openStyle($event)"
              @delete="tableActions.deleteStyle"
              @create-pivot="tableActions.openPivotStyle()"
              @edit-pivot="tableActions.openPivotStyle($event)"
              @delete-pivot="tableActions.deletePivotStyle"
              @clear="tableActions.clearStyle"
              @manage="tableActions.openSettings"
            />
          </template>
        </PageToolbar>
      </template>
      <template #view-tools>
        <ViewToolbar
          :view-mode="activeViewMode"
          @update:view-mode="setViewMode"
          v-model:show-page-rulers="showPageRulers"
          v-model:show-page-margins="showPageMargins"
          :show-page-white-space="showPageWhiteSpace"
          @update:show-page-white-space="setPageWhiteSpace"
          v-model:page-ruler-unit="pageRulerUnit"
          :edit-session-id="cellEditSession.id"
          :show-formula-bar="showFormulaBar"
          @update:show-formula-bar="setShowFormulaBar"
          v-model:show-headers="showHeaders"
          v-model:show-grid-lines="showGridLines"
          v-model:eye-comfort-enabled="eyeComfortEnabled"
          v-model:highlight-enabled="highlightEnabled"
          v-model:highlight-color="highlightColor"
          v-model:zoom="zoom"
          :fullscreen="fullscreen"
          :fullscreen-available="fullscreenAvailable"
          @toggle-fullscreen="toggleFullscreen"
          @fit-selection="fitSelectionToViewport"
          :freeze-disabled="
            activeViewMode !== 'normal' ||
            activeSheet.properties.protected ||
            !dataToolState.freezeEnabled
          "
          :active-cell="activeAddress"
          :freeze-panes="activeSheet.freezePanes"
          @freeze="freeze"
          @unfreeze="unfreeze"
        />
      </template>
      <template #data-tools>
        <DataToolbar
          :sort-disabled="
            loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'sort')
          "
          :filter-criteria-disabled="
            loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'autoFilter')
          "
          :disabled="dataToolsDisabled"
          :comparison-disabled="loading || fileBusy || xlsxBusy || imageBusy"
          :capabilities="dataToolCapabilities"
          :fill-disabled="formatPainterActive"
          :can-fill-rows="canFillRows"
          :can-fill-columns="canFillColumns"
          :filter-active="dataFilterActive"
          :edit-session-id="cellEditSession.id"
          @sort="dataTools.sort"
          @open-sort="dataTools.openSort"
          @open-goal-seek="dataTools.openGoalSeek"
          @open-planning="dataTools.openPlanning"
          @open-data-table="dataTools.openDataTable"
          @open-proofreading="dataTools.openDataProofreading"
          @toggle-filter="dataTools.toggleFilter"
          @advanced-filter="dataTools.openAdvancedFilter"
          @clear-filter="dataTools.clearFilter"
          @reapply-filter="dataTools.reapplyFilter"
          @open-text-to-columns="dataTools.openTextToColumns"
          @open-remove-duplicates="dataTools.openRemoveDuplicates"
          @open-duplicate-values="dataTools.openDuplicateValues"
          @open-consolidate="dataTools.openConsolidate"
          @open-lookup-fill="dataTools.openLookupFill"
          @open-comparison="dataTools.openComparison"
          @error-check-options="openDuplicateErrorOptions"
          @clear-duplicate-highlights="dataTools.clearDuplicateHighlights"
          @clear-duplicate-rejections="dataTools.clearDuplicateRejections"
          @open-validation="dataTools.openValidation"
          @open-dropdown-list="dataTools.openDropdownList"
          @fill="fillFromDataToolbar"
          @open-fill-series="dataTools.openFillSeries"
          @open-fill-number-sequence="dataTools.openFillNumberSequence"
          @open-fill-rank="dataTools.openFillRank"
          @flash-fill="dataTools.flashFill"
          @open-fill-current-date="dataTools.fillCurrentDate"
          @open-fill-blanks="dataTools.openFillBlanks"
          @open-fill-text="dataTools.openFillText"
          @group="dataTools.group"
          @ungroup="dataTools.ungroup"
          @clear-outline="dataTools.clearOutline"
          @expand="dataTools.setGroupsCollapsed(false)"
          @collapse="dataTools.setGroupsCollapsed(true)"
          @open-subtotal="dataTools.openSubtotal"
        />
      </template>
      <template #row-column-tools>
        <RowColumnOperationsMenu
          :sheet="activeSheet"
          :range="activeSelectionRange"
          :edit-session-id="cellEditSession.id"
          :disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            (activeSheet.properties.protected &&
              !activeSheet.protection?.formatRows &&
              !activeSheet.protection?.formatColumns &&
              !activeSheet.protection?.insertRows &&
              !activeSheet.protection?.insertColumns &&
              !activeSheet.protection?.deleteRows &&
              !activeSheet.protection?.deleteColumns)
          "
          @resize="axisTools.resize"
          @auto-fit="axisTools.autoFit"
          @standard-width="axisTools.standardWidth"
          @visibility="axisTools.visibility"
          @cell-operation="cellOperationActions.cellOperation"
          @delete-empty-rows="cellOperationActions.deleteEmptyRows"
          @insert="cellEditSession.finish() && insertAxis($event)"
          @delete="cellEditSession.finish() && deleteAxis($event)"
        />
      </template>
      <template #worksheet-tools>
        <WorksheetOperationsMenu
          :sheets="sheets"
          :active-sheet-id="activeSheet.id"
          :disabled="loading || fileBusy || xlsxBusy || structureProtected"
          @add="cellEditSession.finish() && addSheet()"
          @duplicate="cellEditSession.finish() && duplicateSheet($event)"
          @rename="cellEditSession.finish() && renameSheet($event)"
          @move="cellEditSession.finish() && moveSheet($event)"
          @delete="cellEditSession.finish() && deleteSheet($event)"
          @update-properties="changeSheetProperties"
          @restore="cellEditSession.finish() && restoreSheet($event)"
        />
      </template>
      <template #file-actions>
        <WorkbookFileActions
          :status="saveStatus"
          :error="saveError"
          :feedback="feedback"
          :can-reset="fileActions.canReset.value"
          :disabled="loading || fileBusy || xlsxBusy || !!xlsxConfirmation"
          @save="fileActions.save"
          @import-json="fileActions.importJson"
          @export-json="fileActions.exportJson"
          @reload="fileActions.requestReload"
          @reset="fileActions.requestReset"
        >
          <template #extra-menu-actions="{ close }">
            <XlsxFileActions
              :disabled="loading || fileBusy || imageBusy || !!confirmation || !!xlsxConfirmation"
              :busy="xlsxBusy"
              @close="close"
              @import-xlsx="xlsxActions.importXlsx"
              @export-xlsx="xlsxActions.exportXlsx"
            />
          </template>
        </WorkbookFileActions>
      </template>
    </SpreadsheetRibbon>

    <DataToolsDialogs
      :sort-visible="dataSortVisible"
      :text-to-columns-visible="dataTextToColumnsVisible"
      :remove-duplicates-visible="dataRemoveDuplicatesVisible"
      :validation-visible="dataValidationVisible"
      :subtotal-visible="dataSubtotalVisible"
      :columns="dataToolColumns"
      :sort-initial="dataSortInitial"
      :sort-color-columns="dataTools.sortColorColumns.value"
      :sort-icon-columns="dataTools.sortIconColumns.value"
      :date-system="session.workbook.dateSystem"
      :range-label="dataToolRangeLabel"
      :split-preview="dataSplitPreview"
      :split-column-count="dataTools.splitColumnCount.value"
      :split-preview-rows="dataTools.splitPreviewRows.value"
      :split-source-rows="dataTools.splitSourceRows.value"
      :split-suggestions="dataTools.splitSuggestions.value"
      :split-preview-error="dataTools.splitPreviewError.value"
      :split-destination-label="dataTools.splitDestinationLabel.value"
      :split-picking="pickingSplitRange"
      :select-split-reference="selectSplitReference"
      :duplicate-count="dataDuplicateCount"
      :remove-duplicates-initial="dataRemoveDuplicatesInitial"
      :remove-duplicates-is-table="dataRemoveDuplicatesIsTable"
      :validation-initial="dataValidationInitial"
      :validation-suspended="pickingValidationRange"
      :select-validation-reference="selectValidationReference"
      :has-subtotals="dataHasSubtotals"
      @close-sort="dataTools.closeSort"
      @sort="dataTools.applySort"
      @close-text-to-columns="dataTools.closeTextToColumns"
      @text-to-columns="dataTools.applyTextToColumns"
      @text-to-columns-draft-change="dataTools.updateTextToColumnsDraft"
      @close-remove-duplicates="dataTools.closeRemoveDuplicates"
      @remove-duplicates="dataTools.applyRemoveDuplicates"
      @remove-duplicates-draft-change="dataTools.updateRemoveDuplicatesDraft"
      @close-validation="dataTools.closeValidation"
      @validation="dataTools.applyValidation"
      @clear-validation="dataTools.clearValidation"
      @close-subtotal="dataTools.closeSubtotal"
      @subtotal="dataTools.applySubtotal"
      @remove-subtotals="dataTools.removeSubtotals"
    />
    <RangeReferencePicker
      v-if="pickingSplitRange"
      :reference="pickedSplitReference"
      :edit-session-id="cellEditSession.id"
      @confirm="splitRangePicker.confirm"
      @cancel="splitRangePicker.cancel"
    />
    <RangeReferencePicker
      v-if="pickingValidationRange"
      :reference="pickedValidationReference"
      :edit-session-id="cellEditSession.id"
      :title="validationPickingCell ? t('dataTools.validation.selectCell') : undefined"
      :hint="validationPickingCell ? t('dataTools.validation.selectCellHint') : undefined"
      @confirm="validationRangePicker.confirm"
      @cancel="validationRangePicker.cancel"
    />
    <DuplicateErrorCheckOptionsDialog
      :visible="duplicateErrorOptionsVisible"
      :settings="duplicateCheckSettings"
      :ignored-count="ignoredDuplicateCount"
      @confirm="confirmDuplicateErrorOptions"
      @close="closeDuplicateErrorOptions"
    />
    <ConsolidateDialog
      :visible="consolidateVisible"
      :initial="consolidateDraft"
      :error="consolidateError"
      :preview="consolidatePreview"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingConsolidateRange"
      :select-source-reference="selectConsolidateSourceReference"
      @close="dataTools.closeConsolidate"
      @apply="dataTools.applyConsolidate"
      @draft-change="dataTools.updateConsolidateDraft"
      @pick-range="pickConsolidateRange"
    />
    <RangeReferencePicker
      v-if="pickingConsolidateRange"
      :reference="pickedConsolidateReference"
      :title="t('dataTools.consolidate.title')"
      @confirm="consolidateRangePicker.confirm"
      @cancel="consolidateRangePicker.cancel"
    />
    <FillNumberSequenceDialog
      :visible="fillNumberSequenceVisible"
      :initial="fillNumberSequenceInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillNumberSequence"
    />
    <FillRankDialog
      :visible="fillRankVisible"
      :initial="fillRankInitial"
      :error="fillError"
      :picking="pickingFillRankRange"
      :select-source-reference="selectFillRankSource"
      :select-destination-reference="selectFillRankDestination"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillRank"
    />
    <RangeReferencePicker
      v-if="pickingFillRankRange"
      :reference="pickedFillRankReference"
      :edit-session-id="cellEditSession.id"
      :title="
        t(
          fillRankPickingDestination
            ? 'dataTools.fill.pickRankDestination'
            : 'dataTools.fill.pickRankSource',
        )
      "
      @confirm="fillRankRangePicker.confirm"
      @cancel="fillRankRangePicker.cancel"
    />
    <FillSeriesDialog
      :visible="fillSeriesVisible"
      :initial="fillSeriesInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillSeries"
    />
    <FillBlanksDialog
      :visible="fillBlanksVisible"
      :initial="fillBlanksInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillBlanks"
    />
    <FillTextDialog
      :visible="fillTextVisible"
      :initial="fillTextInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillText"
    />
    <FillCurrentDateDialog
      :visible="fillCurrentDateVisible"
      :initial="fillCurrentDateInitial"
      :error="fillError"
      :range-label="fillRangeLabel"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillCurrentDate"
    />
    <DropdownListDialog
      :visible="dropdownListVisible"
      :initial="dropdownListInitial"
      :error="dropdownListError"
      :suspended="pickingDropdownRange"
      :select-reference="selectDropdownReference"
      @close="dataTools.closeDropdownList"
      @apply="dataTools.applyDropdownList"
    />
    <RangeReferencePicker
      v-if="pickingDropdownRange"
      :reference="pickedDropdownReference"
      :edit-session-id="cellEditSession.id"
      :title="t('dataTools.dropdown.title')"
      @confirm="dropdownRangePicker.confirm"
      @cancel="dropdownRangePicker.cancel"
    />
    <LookupFillDialog
      :visible="lookupFillVisible"
      :initial="lookupFillDraft"
      :error="lookupFillError"
      :preview="lookupFillPreview"
      :source-columns="lookupFillSourceColumns"
      :target-columns="lookupFillTargetColumns"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingLookupFillRange"
      @close="dataTools.closeLookupFill"
      @apply="dataTools.applyLookupFill"
      @draft-change="dataTools.updateLookupFillDraft"
      @pick-range="pickLookupFillRange"
    />
    <RangeReferencePicker
      v-if="pickingLookupFillRange"
      :reference="pickedLookupFillReference"
      :title="t('dataTools.lookupFill.title')"
      @confirm="lookupFillRangePicker.confirm"
      @cancel="lookupFillRangePicker.cancel"
    />
    <DataComparisonDialog
      :visible="comparisonVisible"
      :action="comparisonAction"
      :initial="comparisonDraft"
      :columns="comparisonColumns"
      :error="comparisonError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingComparisonRange"
      @close="dataTools.closeComparison"
      @apply="dataTools.applyComparison"
      @draft-change="dataTools.updateComparisonDraft"
      @pick-range="pickComparisonRange"
    />
    <RangeReferencePicker
      v-if="pickingComparisonRange"
      :reference="pickedComparisonReference"
      :edit-session-id="cellEditSession.id"
      @confirm="comparisonRangePicker.confirm"
      @cancel="comparisonRangePicker.cancel"
    />
    <DataTableDialog
      :visible="simulationDialog === 'dataTable'"
      :initial="dataTableDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="dataTablePreview"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solveDataTable"
      @apply="dataTools.applyDataTable"
      @draft-change="dataTools.updateDataTableDraft"
    />
    <GoalSeekDialog
      :visible="simulationDialog === 'goalSeek'"
      :initial="goalSeekDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="simulationResult"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solveGoalSeek"
      @apply="dataTools.applySimulation"
      @draft-change="dataTools.updateGoalSeekDraft"
    />
    <PlanningSolverDialog
      :visible="simulationDialog === 'planning'"
      :initial="planningDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="simulationResult"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solvePlanning"
      @apply="dataTools.applySimulation"
      @draft-change="dataTools.updatePlanningDraft"
    />
    <RangeReferencePicker
      v-if="pickingSimulationRange"
      :reference="pickedSimulationReference"
      :edit-session-id="cellEditSession.id"
      @confirm="simulationRangePicker.confirm"
      @cancel="simulationRangePicker.cancel"
    />
    <DataProofreadingDialog
      :visible="proofreadingVisible"
      :has-scanned="proofreadingHasScanned"
      :draft="proofreadingDraft"
      :issues="proofreadingIssues"
      :selected-ids="selectedProofreadingIssueIds"
      :busy="proofreadingBusy"
      :error="proofreadingError"
      :picking="pickingProofreadingRange"
      :select-reference="selectProofreadingReference"
      @close="dataTools.closeDataProofreading"
      @draft-change="dataTools.updateDataProofreadingDraft"
      @scan="dataTools.scanDataProofreadingResults"
      @selection-change="dataTools.setSelectedProofreadingIssueIds"
      @select-issue="dataTools.selectDataProofreadingIssue"
      @apply-issue="dataTools.applyDataProofreadingIssue"
      @apply-type="dataTools.applyDataProofreadingType"
      @apply-selected="dataTools.applySelectedDataProofreadingIssues"
      @ignore-issue="dataTools.ignoreDataProofreadingIssue"
      @ignore-type="dataTools.ignoreDataProofreadingType"
    />
    <RangeReferencePicker
      v-if="pickingProofreadingRange"
      :reference="pickedProofreadingReference"
      :edit-session-id="cellEditSession.id"
      @confirm="proofreadingRangePicker.confirm"
      @cancel="proofreadingRangePicker.cancel"
    />
    <DuplicateValuesDialog
      :visible="duplicateValuesVisible"
      :mode="duplicateValuesMode"
      :initial="duplicateValuesDraft"
      :error="duplicateValuesError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingDuplicateRange"
      @close="dataTools.closeDuplicateValues"
      @apply="dataTools.applyDuplicateValues"
      @draft-change="dataTools.updateDuplicateValuesDraft"
      @pick-range="pickDuplicateRange"
    />
    <RangeReferencePicker
      v-if="pickingDuplicateRange"
      :reference="pickedDuplicateReference"
      :edit-session-id="cellEditSession.id"
      @confirm="duplicateRangePicker.confirm"
      @cancel="duplicateRangePicker.cancel"
    />
    <AdvancedFilterDialog
      :visible="dataAdvancedFilterVisible"
      :initial="dataAdvancedFilterDraft"
      :error="dataAdvancedFilterError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="advancedRangeField"
      @close="dataTools.closeAdvancedFilter"
      @apply="dataTools.applyAdvancedFilter"
      @draft-change="dataTools.updateAdvancedFilterDraft"
      @pick-range="pickAdvancedFilterRange"
    />
    <RangeReferencePicker
      v-if="pickingAdvancedRange"
      :reference="pickedAdvancedReference"
      :edit-session-id="cellEditSession.id"
      @confirm="advancedRangePicker.confirm"
      @cancel="advancedRangePicker.cancel"
    />
    <FilterColumnPanel
      v-if="dataFilterState"
      v-bind="dataFilterState"
      :date-system="session.workbook.dateSystem"
      @sort="dataTools.sortFilterColumn"
      @sort-color="dataTools.sortFilterColumnColor"
      @open-sort="dataTools.openFilterSort"
      @apply="dataTools.applyColumnFilter"
      @clear="dataTools.clearColumnFilter"
      @update:settings="dataTools.updateFilterPanelSettings"
      @close="dataTools.closeColumnFilter"
    />
    <DataValidationFeedbackDialog
      v-if="modalValidationFeedback"
      :feedback="modalValidationFeedback"
      @retry="retryValidationInput"
      @accept="confirmValidationInput"
      @cancel="cancelValidationInput"
    />
    <NamedRangesDialog
      :edit-session-id="cellEditSession.id"
      :visible="namesVisible"
      :suspended="pickingNameRange"
      :select-reference="nameRangePicker.selectReference"
      :ranges="namedRanges"
      :sheets="sheets"
      :active-sheet-id="activeSheet.id"
      :selection-reference="nameSelectionReference"
      @close="formulaTools.closeNames"
      @save="formulaTools.saveName"
      @delete="formulaTools.deleteName"
      @reorder="formulaTools.reorderNames"
    />
    <RangeReferencePicker
      v-if="pickingNameRange"
      :reference="pickedNameReference"
      :edit-session-id="cellEditSession.id"
      @confirm="nameRangePicker.confirm"
      @cancel="nameRangePicker.cancel"
    />
    <CellFormatDialog
      v-if="cellFormatSelection"
      :state="cellFormatSelection.state"
      :border-state="cellFormatSelection.borderState"
      :border-capabilities="cellFormatSelection.borderCapabilities"
      :merge-state="cellFormatSelection.mergeState"
      :sample-value="cellFormatSelection.sampleValue"
      :date-system="cellFormatSelection.dateSystem"
      :initial-tab="cellFormatInitialTab"
      @confirm="confirmCellFormat"
      @cancel="closeCellFormat"
    />
    <CreateTableDialog
      v-if="createTableTarget && createTableInitial"
      :key="createTableTarget.dialogId"
      :initial="createTableInitial"
      :intent="createTableTarget.intent"
      :error="tableError"
      :suspended="pickingTableRange"
      :select-reference="tableRangePicker.selectReference"
      @confirm="createTableTarget.confirm"
      @cancel="createTableTarget.cancel"
    />
    <TableSettingsDialog
      v-if="tableSettingsTarget"
      :key="tableSettingsTarget.dialogId"
      :initial="tableSettingsTarget.initial"
      :error="tableError"
      :suspended="pickingTableRange"
      :select-reference="tableRangePicker.selectReference"
      @confirm="tableSettingsTarget.confirm"
      @convert="tableSettingsTarget.convert"
      @cancel="tableSettingsTarget.cancel"
    />
    <ResizeTableDialog
      v-if="tableResizeTarget"
      :key="tableResizeTarget.dialogId"
      :initial="tableResizeTarget.range"
      :error="tableError"
      :suspended="pickingTableRange"
      :select-reference="tableRangePicker.selectReference"
      @confirm="tableResizeTarget.confirm"
      @cancel="tableResizeTarget.cancel"
    />
    <CalculatedColumnDialog
      v-if="tableCalculatedColumnTarget"
      :key="tableCalculatedColumnTarget.dialogId"
      :initial="tableCalculatedColumnTarget.initial"
      :table-name="tableCalculatedColumnTarget.tableName"
      :column-name="tableCalculatedColumnTarget.columnName"
      :range-label="tableCalculatedColumnTarget.rangeLabel"
      :anchor-label="tableCalculatedColumnTarget.anchorLabel"
      :error="tableError"
      @confirm="tableCalculatedColumnTarget.confirm"
      @cancel="tableCalculatedColumnTarget.cancel"
    />
    <HyperlinkDialog
      v-if="hyperlinkDialog"
      :key="hyperlinkDialog.dialogId"
      :draft="hyperlinkDialog.initial"
      :error="hyperlinkError"
      @confirm="hyperlinkDialog.confirm"
      @remove="hyperlinkDialog.remove"
      @cancel="hyperlinkDialog.cancel"
    />
    <NewCellStyleDialog
      v-if="cellStyleDraft"
      :style="cellStyleDraft.style"
      :initial-style="cellStyleDraft.initialStyle"
      :error="cellStylesError"
      :existing-names="customCellStyles.map((style) => style.name)"
      :date-system="session.workbook.dateSystem"
      @confirm="cellStyleActions.saveStyle"
      @cancel="cellStyleActions.close"
    />
    <MergeCellStylesDialog
      v-if="cellStylesMergeOpen"
      :styles="importedCellStyles"
      :loading="cellStylesMergeLoading"
      :error="cellStylesError"
      @select-file="cellStyleActions.importMergeFile"
      @confirm="cellStyleActions.mergeStyles"
      @cancel="cellStyleActions.close"
    />
    <NewTableStyleDialog
      v-if="tableStyleDraft"
      :style="tableStyleDraft.style"
      :existing-names="customTableStyles.map((style) => style.name)"
      :default-style-id="defaultTableStyleId"
      :date-system="session.workbook.dateSystem"
      @confirm="tableActions.confirmStyle"
      @cancel="tableActions.close"
    />
    <NewTableStyleDialog
      v-if="pivotTableStyleDraft"
      kind="pivot"
      :style="pivotTableStyleDraft.style"
      :existing-names="customPivotTableStyles.map((style) => style.name)"
      :default-style-id="defaultPivotTableStyleId"
      :date-system="session.workbook.dateSystem"
      @confirm-pivot="tableActions.confirmPivotStyle"
      @cancel="tableActions.close"
    />
    <RangeReferencePicker
      v-if="pickingTableRange"
      :reference="pickedTableReference"
      :edit-session-id="cellEditSession.id"
      :title="t('tables.selectRange')"
      @confirm="tableRangePicker.confirm"
      @cancel="tableRangePicker.cancel"
    />
    <ConditionalFormatManagerDialog
      v-if="conditionalFormattingSelection"
      :visible="true"
      :rules="conditionalFormattingSelection.rules"
      :selection-ranges="formatConditionalFormatRanges([conditionalFormattingSelection.range])"
      :sheets="conditionalFormattingSheets"
      :sheet-id="conditionalFormattingSelection.sheetId"
      :create-kind="conditionalFormatQuickRule"
      :sample-value="conditionalFormattingSelection.sampleValue"
      :date-system="session.workbook.dateSystem"
      :select-reference="selectConditionalFormatReference"
      :select-value-reference="selectConditionalFormatValueReference"
      @save="saveConditionalFormats"
      @save-sheets="saveConditionalFormatSheets"
      @close="closeConditionalFormatting"
    />
    <RangeReferencePicker
      v-if="pickingConditionalFormatRange"
      :reference="pickedConditionalFormatReference"
      :edit-session-id="cellEditSession.id"
      :title="
        t(
          conditionalFormatPickingValue
            ? 'conditionalFormatting.value'
            : 'conditionalFormatting.appliesTo',
        )
      "
      @confirm="conditionalFormatRangePicker.confirm"
      @cancel="conditionalFormatRangePicker.cancel"
    />
    <div class="spreadsheet-workspace__file-feedback">
      <WorkbookFileFeedback
        :confirmation="confirmation"
        :busy="fileBusy"
        @confirm="fileActions.confirm"
        @cancel="fileActions.cancel"
      />
      <XlsxFileFeedback
        :feedback="xlsxFeedback"
        :report="xlsxReport"
        :confirmation="xlsxConfirmation"
        :busy="xlsxBusy"
        @confirm="xlsxActions.confirm"
        @cancel="xlsxActions.cancel"
        @dismiss="xlsxActions.dismissFeedback"
      />
    </div>
    <WorkbookFormulaBar
      @clipboard-copy="clearCompetingShapeClipboard"
      v-show="showFormulaBar"
      :read-only="formulaReadOnly"
      :key="workbookGeneration"
      ref="formulaBarRef"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!findFormatDraft ||
        pickingReferenceRange ||
        !!hyperlinkDraft ||
        (!!editingCamera && !pickingCameraRange) ||
        (!!editingControl && !pickingControlRange) ||
        (!!editingPivot && !pickingPivotRange) ||
        pivotFieldSettingsOpen ||
        !!pictureAnnotation ||
        !!viewingAttachment ||
        !!editingDrawing ||
        !!textBoxReferenceDialog ||
        !!shapeClipboardTransferConfirmation ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        (!!sparklineDraft && !pickingSparklineRange) ||
        cellStylesModalOpen ||
        tableModalOpen ||
        dataToolsModalOpen ||
        formulaEditorVisible ||
        formulaInsertVisible ||
        !!modalValidationFeedback
      "
      :address="activeAddress"
      :sheet-id="activeSheet.id"
      :sheet-name="activeSheet.name"
      :edit-target-sheet-name="editTargetSheet.name"
      :address-label="activeAddressLabel"
      :input-value="activeCellInput"
      :content="getCellContent(activeSheet, activeAddress)"
      :as-text="isTextCellNumberFormat(getCellStyle(activeSheet, activeAddress)?.numberFormat)"
      :edit-session="cellEditSession"
      :handle-reference-keydown="handleFormulaReferenceKeydown"
      :search-open="findDialogVisible"
      :previewing="formulaPreviewing"
      :preview-value="formulaPreviewValue"
      :formula-editor-disabled="formulaEditorDisabled"
      @navigate="navigateToAddress"
      @commit-cell="commitCell"
      @traverse="onTraverseFromFormulaBar"
      @cancel-edit="onCancelFormulaEdit"
      @open-search="openFind('find')"
      @update-previewing="formulaPreviewing = $event"
      @open-formula-editor="formulaEditor.open"
      @open-insert-function="formulaInsertVisible = true"
    />
    <FormulaFunctionBrowser
      :visible="formulaInsertVisible"
      :recent-functions="recentFunctions"
      :edit-session-id="cellEditSession.id"
      @insert-function="insertFunctionFromBar"
      @close="closeFormulaInsert"
    />
    <FormulaEditorDialog
      :visible="formulaEditorVisible"
      :value="formulaEditorValue"
      :target-label="formulaEditorTarget"
      :preview-value="formulaPreviewValue"
      :edit-session-id="cellEditSession.id"
      :recent-functions="recentFunctions"
      :error="formulaEditorError"
      @change="formulaEditor.change"
      @composing="formulaEditor.composing"
      @confirm="formulaEditor.confirm"
      @close="formulaEditor.close"
    />
    <WorkbookFindDialog
      ref="findDialogRef"
      :mode="findMode"
      :replacement="findReplacement"
      :replacement-format="findReplacementFormat"
      :replacement-format-summary="findReplacementFormatSummary"
      :go-to-results="workbookGoTo.results.value"
      :go-to-result-count="workbookGoTo.resultCount.value"
      :go-to-status="workbookGoTo.status.value"
      :visible="findDialogVisible && !pickingFindFormat && !findFormatDraft"
      :query="searchQuery"
      :history="findHistory"
      :options="findOptions"
      :expanded="findOptionsExpanded"
      :results="findResults"
      :has-searched-all="findHasSearchedAll"
      :result-count="findResultCount"
      :status="findStatus"
      :format-summary="findFormatSummary"
      :format="findFormat"
      @update-query="updateSearchQuery"
      @update-mode="findMode = $event"
      @update-replacement="findReplacement = $event"
      @update-options="workbookFind.updateOptions"
      @update-expanded="workbookFind.setOptionsExpanded"
      @find="runFind"
      @find-all="runFindAll"
      @replace="runReplace()"
      @replace-all="runReplace(true)"
      @go-to="runGoTo"
      @select-go-to-result="selectGoToResult"
      @select-result="selectFindResult"
      @pick-format="pickFindFormat"
      @configure-format="configureFindFormat()"
      @configure-replacement-format="configureFindFormat('replace')"
      @pick-replacement-format="pickFindFormat($event, 'replace')"
      @clear-replacement-format="workbookFind.setReplacementFormat()"
      @clear-format="workbookFind.setFormat()"
      @close="findDialogVisible = false"
      @closed="restoreSearchFocus"
    />
    <RangeReferencePicker
      v-if="pickingFindFormat"
      :reference="pickedFindFormatReference"
      :title="t('navigation.findPickFormat')"
      :hint="t('navigation.findPickFormatHint')"
      :edit-session-id="cellEditSession.id"
      @confirm="findFormatPicker.confirm"
      @cancel="findFormatPicker.cancel"
    />
    <CellFormatDialog
      v-if="findFormatDraft"
      :state="findFormatDraft.state"
      :border-state="findFormatDraft.borderState"
      :border-capabilities="{ innerHorizontal: false, innerVertical: false }"
      :sample-value="(findFormatTarget === 'replace' ? findReplacement : searchQuery) || 'Aa'"
      initial-tab="font"
      @confirm="confirmFindFormat"
      @cancel="findFormatDraft = undefined"
    />
    <div
      class="spreadsheet-workspace__grid"
      :class="{ 'is-eye-comfort': eyeComfortEnabled }"
      :inert="gridInert"
    >
      <div class="spreadsheet-workspace__sheet">
        <SheetGrid
          :picture-source-busy="imageBusy || loading || fileBusy || xlsxBusy"
          :restore-picture-original="pictureOriginalResetOwner.apply"
          :can-restore-picture-original="pictureOriginalResetOwner.available"
          :picture-alignment-reference="pictureAlignmentReference"
          @picture-alignment-reference="pictureAlignmentReference = $event"
          @unlock-range="protectionActions.requestRangeUnlock"
          :note-draft="noteDraft"
          :note-error="noteError"
          :show-active-note="showActiveNote"
          :show-all-notes="showAllNotes"
          :hidden-note-keys="hiddenNoteKeys"
          :note-preview-disabled="gridInert"
          :theme="workbookTheme"
          :show-page-breaks="showPageBreaks"
          :view-mode="activeViewMode"
          :page-setup="activePageSetup"
          @page-setup-change="applyPageSetup"
          :show-page-rulers="showPageRulers"
          :show-page-margins="showPageMargins"
          :show-page-white-space="showPageWhiteSpace"
          @update:show-page-white-space="setPageWhiteSpace"
          :page-ruler-unit="pageRulerUnit"
          file-name="workbook.xlsx"
          @open-header-footer="openHeaderFooter"
          v-model:zoom="zoom"
          :show-headers="showHeaders"
          :show-grid-lines="showGridLines"
          :show-axis-quick-tools="showAxisQuickTools"
          :highlight-enabled="highlightEnabled"
          :highlight-color="highlightColor"
          :grid-id="gridId"
          external-horizontal-scrollbar
          :read-only="activeSheet.properties.protected"
          :key="workbookGeneration"
          :ref="setSheetGridRef"
          :sheet="activeSheet"
          :chart-layout-preview="chartLayoutPreview"
          :workbook="session.workbook"
          :evaluator="activeSheetEvaluator"
          :context-menu-state="contextMenuState"
          :validation-info="activeValidationInfo"
          :input-error="duplicateInputError"
          @dismiss-input-error="retryValidationInput"
          :error-cells="duplicateErrorCells"
          :active-cell-error="activeCellErrorDescription"
          :error-indicator-color="duplicateCheckSettings.indicatorColor"
          @convert-cell-to-number="convertCellErrorValues('cell')"
          @convert-selection-to-number="convertCellErrorValues('selection')"
          @correct-sheet-errors="convertCellErrorValues('sheet')"
          @ignore-selected-cell-errors="ignoreSelectedDuplicateErrors"
          @ignore-all-cell-errors="ignoreAllDuplicateErrors"
          @edit-error-in-formula-bar="editErrorInFormulaBar"
          @error-check-options="openDuplicateErrorOptions"
          @filter-column-request="dataTools.openColumnFilter($event)"
          @table-expand-request="tableActions.expandTable"
          @open-hyperlink="hyperlinkActions.open"
          @edit-note="reviewActions.edit($event)"
          @save-note="reviewActions.save"
          @cancel-note="reviewActions.close(false)"
          @update-note-box="reviewActions.updateBox"
          @delete-note="reviewActions.remove($event)"
          @validation-choose="chooseValidationValue"
          @outline-toggle="toggleOutline"
          @outline-level="showOutlineLevel"
          @context-action="contextActions.request"
          :date-system="session.workbook.dateSystem"
          :reference-editor="activeRangePicker?.editor ?? formulaBarRef"
          :edit-session="cellEditSession"
          :image-asset-urls="imageAssetUrls"
          :image-preview-on-double-click="picturePreviewOnDoubleClick"
          :loading-image-asset-ids="loadingImageAssetIds"
          :missing-image-asset-ids="missingImageAssetIds"
          @selected-floating-image-change="
            (id, ids) => {
              selectedPictureId = id;
              selectedPictureIds = ids;
            }
          "
          :shape-creation-request="shapeCreation.request.value"
          :equation-edit-snapshot="equationEdit.snapshot.value"
          :equation-edit-callbacks="equationEdit.callbacks.value"
          :equation-placeholders-hidden="equationPlaceholdersHidden"
          :owns-selected-shape-field-target="ownsSelectedShapeFieldTarget"
          :shape-text-edit-snapshot="shapeTextEdit.snapshot.value"
          :shape-text-edit-callbacks="shapeTextEditCallbacks"
          :shape-text-edit-start="startShapeTextEdit"
          :shape-text-edit-selection="shapeTextEditSelection"
          :text-box-reference-resolver="textBoxReferenceResolver"
          :open-text-box-reference="textBoxReferenceActions.open"
          :shape-creation-commit="shapeCreation.commit"
          :shape-creation-cancel="shapeCreation.cancel"
          :apply-drawing-update="drawingActions.update"
          :apply-drawing-collection="drawingActions.replaceCollection"
          :copy-shape-objects="shapeClipboardHandlers.copy"
          :cut-shape-objects="shapeClipboardHandlers.cut"
          :paste-shape-objects="shapeClipboardHandlers.paste"
          :can-paste-shape-objects="canPasteShapeObjects"
          :capture-clipboard-copy="captureCompetingShapeClipboardCopy"
          @clipboard-copy="clearCompetingShapeClipboard"
          @update-drawing="drawingActions.update"
          @delete-drawing="drawingActions.remove"
          @edit-drawing="editSheetDrawing"
          @edit-owned-shape="editOwnedDrawing"
          @format-drawing="openShapeFormat"
          @format-shape-group="openShapeGroupFormat"
          @selected-shape-group-change="selectedShapeGroupChanged"
          @selected-shape-objects-change="selectedShapeObjectsChanged"
          @selected-drawing-change="selectedShapeChanged"
          @select-chart-element="selectChartFormatElement"
          @configure-pivot="openPivotFields"
          @update-pivot="pivotActions.update"
          @show-pivot-details="(id, address) => pivotActions.showDetails(id, address)"
          @group-pivot-field="pivotGrouping.open"
          @ungroup-pivot-field="pivotGrouping.ungroup"
          @configure-pivot-filter="
            (id, index) => {
              openPivotFields(id);
              void nextTick(() =>
                pivotFieldsPaneRef?.openFieldSettings({ area: 'filters', index }),
              );
            }
          "
          @change-control="controlActions.change"
          @update-floating-images="pictureTools.updateMany"
          @group-floating-images="(ids) => performPictureGroup(false, ids)"
          @delete-floating-images="pictureTools.remove"
          @update-floating-image="setFloatingImage"
          @delete-floating-image="deleteFloatingImage"
          :apply-picture-to-cell="pictureCellConversion.request"
          :can-convert-picture-to-cell="pictureCellConversion.canConvert"
          @paste-image-file="imageActions.pasteImageFile"
          @convert-cell-image-to-floating="imageActions.convertCellImageToFloating"
          @paste-floating-image="imageActions.pasteFloatingImage"
          @paste-floating-images="imageActions.pasteFloatingImages"
          @image-feedback="showImageFeedback"
          @picture-source-action="performPictureContextSourceAction"
          :workbook-revision="workbookRevision"
          :apply-paste="pasteCells"
          :apply-axis-move="moveAxis"
          :apply-floating-image-move="pictureTools.updateMany"
          :apply-picture-collection-change="pictureTools.replaceAll"
          :picture-owner-generation="pictureOwnerGeneration"
          :apply-owned-picture-delete="deleteOwnedPictures"
          :apply-picture-ungroup="(ids, owner) => performPictureGroup(true, ids, owner)"
          @selected-owned-picture-path-change="
            (path, owner) => {
              if (owner === activeSheet) selectedOwnedPicturePath = path;
            }
          "
          @format-owned-picture="openOwnedPictureFormat"
          :apply-fill="fillActions.apply"
          @end-fill="fillActions.clear"
          @fill-feedback="
            MessagePlugin.warning(
              t(
                $event === 'pivotResultProtected'
                  ? 'pivot.resultProtected'
                  : $event === 'duplicate'
                    ? 'dataTools.duplicates.duplicateRejected'
                    : `autoFill.${$event}`,
              ),
            )
          "
          :view-state="activeSheetViewState"
          :format-painter-active="formatPainterActive"
          @clear-cells="clearCells"
          @commit-cell="commitCell"
          @delete-axis="deleteAxis"
          @format-painter-target="applyFormatPainterTarget"
          @insert-axis="insertAxis"
          @freeze-change="setFreezePanes"
          @resize-dimension="resizeDimension"
          @cancel-format-painter="cancelFormatPainter"
          @flash-fill="dataTools.flashFill"
          @undo="undo"
          @redo="redo"
          @view-state-change="updateActiveSheetViewState"
          @selection-dragging-change="setSelectionDragging"
          @horizontal-scroll-change="updateHorizontalScrollState"
        />
      </div>
      <PivotFieldsPane
        v-if="activePivot && pivotFieldsVisible"
        ref="pivotFieldsPaneRef"
        :table="activePivot"
        :workbook="session.workbook"
        :revision="workbookRevision"
        :disabled="pivotDisabled"
        @update="pivotActions.update($event)"
        @close="pivotFieldsVisible = false"
        @settings-open="pivotFieldSettingsOpen = $event"
      />
      <PictureFormatPane
        ref="pictureFormatComponentRef"
        :initial-paint="pictureFormatInitialPaint"
        :initial-tab="pictureFormatInitialTab"
        :intrinsic-status="pictureIntrinsic.status.value"
        :retry-intrinsic="pictureIntrinsicRetry"
        v-if="pictureFormatVisible"
        :snapshot="pictureFormatPane.snapshot.value"
        :capabilities="pictureFormatPane.capabilities.value"
        :on-intent="pictureFormatPane.onIntent"
        :before-interaction="beforePictureFormatPaneInteraction"
        :load-paint-asset="picturePaintAssets.load"
        :options="{
          lineMode: [
            { value: 'inherit', label: t('pictureFormat.options.inheritLine') },
            { value: 'none', label: t('pictureFormat.none') },
            { value: 'solid', label: t('pictureFormat.options.localLine') },
            { value: 'gradient', label: t('pictureFormat.gradient'), disabled: true },
          ],
          shadowPreset: [
            { value: 'inherit', label: t('pictureFormat.options.inheritShadow') },
            { value: 'none', label: t('pictureFormat.options.noShadow') },
            { value: 'soft', label: t('pictureFormat.options.softShadow') },
            { value: 'hard', label: t('pictureFormat.options.hardShadow') },
          ],
        }"
        :t="pictureFormatLabel"
        @close="closeOwnedPictureFormat"
      />
      <ChartFormatPane
        ref="chartFormatPaneRef"
        v-if="chartFormatContext"
        :drawing="chartFormatContext.drawing"
        :data="chartFormatContext.data"
        :visible-data="chartFormatContext.visibleData"
        :target="chartFormatContext.target"
        :apply="chartFormatContext.apply"
        :disabled="loading || fileBusy || xlsxBusy || chartFormatContext.disabled"
        :error="chartFormatControls.error.value ? t('chart.formatApplyFailed') : undefined"
        @update:target="(target) => chartObjectContext?.format?.(target)"
        @close="
          () => {
            if (chartFormatPaneRef?.canChangeTarget() !== false) chartFormatPaneVisible = false;
          }
        "
      />
      <ShapeFormatPane
        ref="shapeObjectFormatPaneRef"
        :key="
          shapeTextEdit.snapshot.value
            ? `character-${shapeTextEdit.snapshot.value.sessionId}`
            : 'object-format'
        "
        v-if="
          shapeTextCharacterPane.snapshot.value ||
          shapeConnectorFormatPane.snapshot.value ||
          shapeGroupFormatPane.snapshot.value ||
          shapeFormatPane.snapshot.value
        "
        :snapshot="
          shapeTextCharacterPane.snapshot.value ??
          shapeConnectorFormatPane.snapshot.value ??
          shapeGroupFormatPane.snapshot.value ??
          shapeFormatPane.snapshot.value
        "
        :capabilities="
          shapeTextCharacterPane.snapshot.value
            ? shapeTextCharacterPane.capabilities.value
            : shapeConnectorFormatPane.snapshot.value
              ? shapeConnectorFormatPane.capabilities.value
              : shapeGroupFormatPane.snapshot.value
                ? shapeGroupFormatPane.capabilities.value
                : shapeFormatPane.capabilities.value
        "
        :on-intent="
          shapeTextCharacterPane.snapshot.value
            ? shapeTextCharacterPane.onIntent
            : shapeConnectorFormatPane.snapshot.value
              ? shapeConnectorFormatPane.onIntent
              : shapeGroupFormatPane.snapshot.value
                ? shapeGroupFormatPane.onIntent
                : shapeFormatPane.onIntent
        "
        :load-paint-asset="shapePaintAssets.load"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :t="pictureFormatLabel"
        :initial-tab="
          shapeTextCharacterPane.snapshot.value
            ? shapeTextCharacterPane.snapshot.value.drawing.kind === 'shape' &&
              shapeTextCharacterPane.snapshot.value.drawing.wordArt
              ? 'text-fill-line'
              : 'text-box'
            : shapePaneRequestedTab
        "
        :before-tab-change="beforeShapeFormatTabChange"
        :data-shape-text-edit-session="shapeTextEdit.snapshot.value?.sessionId"
        @close="
          shapeTextCharacterPane.close();
          shapeFormatPane.close();
          shapeGroupFormatPane.close();
          shapeConnectorFormatPane.close();
          shapePaintAssets.cancel();
        "
      />
      <ShapeSelectionPane
        v-if="shapeObjectControls.paneVisible.value && shapeObjectControls.snapshot.value"
        :owner-key="shapeObjectControls.snapshot.value.ownerKey"
        :draft-owner-key="shapeObjectControls.snapshot.value.draftOwnerKey"
        :rows="shapeObjectControls.snapshot.value.rows"
        :disabled="loading || fileBusy || xlsxBusy"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :select-handler="shapeObjectControls.snapshot.value.selectHandler"
        :rename-handler="shapeObjectControls.snapshot.value.renameHandler"
        :visibility-handler="shapeObjectControls.snapshot.value.visibilityHandler"
        :all-visibility-handler="shapeObjectControls.snapshot.value.allVisibilityHandler"
        :can-toggle-all-visibility="shapeObjectControls.snapshot.value.canToggleAllVisibility"
        :order-handler="shapeObjectControls.snapshot.value.actionHandler"
        :close-handler="shapeObjectControls.snapshot.value.closeHandler"
      />
      <PictureSelectionPane
        v-if="pictureTools.paneVisible.value"
        :images="activeSheet.floatingImages"
        :selected-ids="selectedPictureIds"
        :disabled="loading || fileBusy || xlsxBusy || imageBusy"
        :can-edit-image="picturePaneImageAvailable"
        :rename-handler="picturePaneHandlers.rename"
        :visibility-handler="picturePaneHandlers.visibility"
        :select-handler="picturePaneHandlers.select"
        :close-handler="picturePaneHandlers.close"
      />
    </div>
    <DocumentPasswordDialog
      v-if="encryptDocumentVisible"
      mode="encrypt"
      :busy="xlsxBusy"
      @submit="exportEncryptedDocument"
      @close="encryptDocumentVisible = false"
    />
    <DocumentPasswordDialog
      v-if="xlsxActions.passwordRequired.value"
      mode="decrypt"
      :busy="xlsxBusy"
      :incorrect="xlsxActions.passwordError.value"
      @submit="xlsxActions.submitPassword"
      @close="xlsxActions.cancel"
    />
    <WordReviewDialog :controller="wordProofreading" />
    <WordDictionaryDialog :controller="wordProofreading" />
    <TextReviewDialog
      v-if="textReview.mode.value === 'spelling'"
      v-model:scope="textReview.scope.value"
      v-model:language="textReview.language.value"
      :cells="textReview.cells.value"
      :result="textReview.result.value"
      :busy="textReview.busy.value"
      :error="textReview.error.value"
      :skipped="textReview.skipped.value"
      @run="textReview.run"
      @close="textReview.close"
      @replace="textReview.replace"
      @ignore="textReview.ignore"
    />
    <PictureAnnotationDialog
      v-if="pictureAnnotation"
      :key="pictureAnnotation.dialogId"
      :image="pictureAnnotation.image"
      :source="imageAssetUrls.get(pictureAnnotation.image.assetId) ?? ''"
      :frame-source="pictureAnnotation.frameSource"
      :theme="session.workbook.theme"
      :asset-urls="imageAssetUrls"
      :confirm-handler="pictureAnnotation.confirm"
      :error="pictureAnnotation.error.value ? t(pictureAnnotation.error.value) : ''"
      @confirm="pictureAnnotation.confirm"
      @close="pictureAnnotation.close"
    />
    <PictureCellOverwriteDialog
      v-if="pictureCellOverwriteConfirmation"
      :key="`${pictureCellOverwriteConfirmation.insertionTargets ? 'insert' : 'convert'}:${pictureCellOverwriteConfirmation.key}`"
      :confirmation="pictureCellOverwriteConfirmation"
    />
    <PictureCompressDialog
      v-if="pictureCompression"
      :key="pictureCompression.dialogId"
      :busy="pictureAssetTools.busy.value"
      :error="pictureCompression.error.value ? t(pictureCompression.error.value) : ''"
      @confirm="pictureCompression.confirm"
      @close="pictureCompression.close"
    />
    <PictureBatchSizeDialog
      v-if="pictureBatchSize"
      :key="pictureBatchSize.dialogId"
      :width="pictureBatchSize.image.width"
      :height="pictureBatchSize.image.height"
      :error="pictureBatchSize.error.value ? t(pictureBatchSize.error.value) : ''"
      @confirm="pictureBatchSize.confirm"
      @close="pictureBatchSize.close"
    />
    <PagePrintPreview
      :theme="workbookTheme"
      v-if="printPreviewVisible"
      v-model:visible="printPreviewVisible"
      :sheet="activeSheet"
      :evaluator="activeSheetEvaluator"
      :resolve-chart-sheet="chartPrintSheetResolver"
      :text-box-reference-resolver="textBoxReferenceResolver"
      :setup="activePageSetup"
      :workbook-revision="workbookRevision"
      :image-asset-urls="imageAssetUrls"
      :locale="locale"
      :date-system="session.workbook.dateSystem"
      file-name="workbook.xlsx"
    />
    <WatermarkDialog
      v-model:visible="watermarkVisible"
      :watermark="watermarkDialogValue"
      :image-asset-urls="imageAssetUrls"
      :busy="decorationBusy"
      @save="saveCustomWatermark"
    />
    <PageSetupDialog
      v-model:visible="pageSetupVisible"
      :setup="activePageSetup"
      :initial-tab="pageSetupTab"
      :header-footer-target="headerFooterTarget"
      :sheet-name="activeSheet.name"
      file-name="workbook.xlsx"
      :suspended="pickingPageSetupRange"
      :select-reference="selectPageSetupReference"
      @confirm="savePageSetup"
    />
    <RangeReferencePicker
      v-if="pickingPageSetupRange"
      :reference="pickedPageSetupReference"
      :title="
        t(
          pageSetupRangeField === 'printArea'
            ? 'pageLayout.printArea'
            : pageSetupRangeField === 'titleColumns'
              ? 'pageLayout.titleColumns'
              : pageSetupRangeField === 'bottomTitleRows'
                ? 'pageLayout.bottomTitleRows'
                : 'pageLayout.titleRows',
        )
      "
      @confirm="pageSetupRangePicker.confirm"
      @cancel="pageSetupRangePicker.cancel"
    />
    <SheetColumnStatisticsDialog
      v-if="statisticsRange"
      :sheet="activeSheet"
      :evaluator="activeSheetEvaluator"
      :range="statisticsRange"
      :locale="locale"
      @close="contextActions.closePanels()"
    />
    <SheetColumnChoiceDialog
      v-if="choiceAddress"
      :sheet="activeSheet"
      :evaluator="activeSheetEvaluator"
      :address="choiceAddress"
      :read-only="activeSheet.properties.protected"
      @choose="contextActions.choose"
      @close="contextActions.closePanels()"
    />
    <SheetContextFilterDialog
      v-if="contextFilterState"
      :options="contextFilterState.options"
      :applied-keys="contextFilterState.appliedKeys"
      :disabled="activeSheet.properties.protected"
      @apply="contextActions.confirmFilter"
      @close="contextActions.closePanels()"
    />
    <WorkbookStatusBar
      :sheet-tabs-disabled="
        pickingTableRange ||
        (pickingChartRange && !chartSourceDialog) ||
        pickingSparklineRange ||
        pickingCameraRange ||
        pickingControlRange
      "
      :view-mode="activeViewMode"
      @update:view-mode="setViewMode"
      :edit-session-id="
        cellEditSession.state.draft.startsWith('=') ? cellEditSession.id : undefined
      "
      v-model:zoom="zoom"
      @fit-selection="fitSelectionToViewport"
      v-model:show-headers="showHeaders"
      v-model:show-grid-lines="showGridLines"
      v-model:show-axis-quick-tools="showAxisQuickTools"
      v-model:eye-comfort-enabled="eyeComfortEnabled"
      v-model:highlight-enabled="highlightEnabled"
      v-model:highlight-color="highlightColor"
      :fullscreen="fullscreen"
      :fullscreen-available="fullscreenAvailable"
      @toggle-fullscreen="toggleFullscreen"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!hyperlinkDraft ||
        (!!editingCamera && !pickingCameraRange) ||
        (!!editingControl && !pickingControlRange) ||
        (!!editingPivot && !pickingPivotRange) ||
        pivotFieldSettingsOpen ||
        !!pictureAnnotation ||
        !!viewingAttachment ||
        !!editingDrawing ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        (!!sparklineDraft && !pickingSparklineRange) ||
        cellStylesModalOpen ||
        (tableModalOpen && !pickingTableRange)
      "
      :sheets="sheets"
      :structure-protected="structureProtected"
      :active-sheet-id="session.workbook.activeSheetId"
      :selection-summary="activeSelectionSummary"
      @select="onSelectSheet"
      @add="cellEditSession.finish() && addSheet()"
      @duplicate="cellEditSession.finish() && duplicateSheet($event)"
      @rename="renameSheet"
      @delete="cellEditSession.finish() && deleteSheet($event)"
      @move="moveSheet"
      @update-properties="changeSheetProperties"
      @restore="cellEditSession.finish() && restoreSheet($event)"
    >
      <template #horizontal-scrollbar>
        <SheetHorizontalScrollbar
          :key="activeSheet.id"
          :state="horizontalScrollState"
          :controls="gridId"
          @scroll="scrollGridHorizontally"
        />
      </template>
    </WorkbookStatusBar>
    <SheetProtectionDialog
      :visible="protectionDialog === 'sheet'"
      :protected="activeSheet.properties.protected"
      :configuration="protectionConfiguration"
      :error="protectionError"
      @close="protectionActions.close"
      @save="protectionActions.save"
    />
    <RangeReferencePicker
      v-if="pickingProtectionRange"
      :reference="pickedProtectionReference"
      @confirm="protectionRangePicker.confirm"
      @cancel="protectionRangePicker.cancel"
    />
    <EditableRangesDialog
      :visible="protectionDialog === 'ranges'"
      :configuration="protectionConfiguration"
      :suspended="pickingProtectionRange"
      :select-reference="selectProtectionReference"
      :selection="protectionSelection"
      :read-only="activeSheet.properties.protected"
      :error="protectionError"
      @close="protectionActions.close"
      @save="protectionActions.save"
      @protect="protectionActions.protectWithRanges"
      @unlock="protectionActions.requestRangeUnlock"
    />
    <WorkbookProtectionDialog
      :visible="protectionDialog === 'workbook'"
      :protected="structureProtected"
      :has-password="Boolean(session.workbook.structurePassword)"
      :error="protectionError"
      @close="protectionActions.close"
      @save="protectionActions.save(undefined, $event)"
    />
    <UnlockRangeDialog
      :visible="protectionDialog === 'unlock'"
      :range-name="protectionActions.unlockRangeName.value"
      :error="protectionError"
      @close="protectionActions.close"
      @unlock="protectionActions.unlock"
    />
  </section>
  <ShapeClipboardTransferDialog
    v-if="shapeClipboardTransferConfirmation"
    :key="shapeClipboardTransferConfirmation.sessionId"
    :request="shapeClipboardTransferConfirmation"
  />
  <TextBoxReferenceDialog
    v-if="textBoxReferenceDialog"
    :key="textBoxReferenceDialog.sessionId"
    :request="textBoxReferenceDialog"
    :disabled="textBoxReferenceActions.disabled.value"
    :busy="textBoxReferenceActions.busy.value"
    :error="textBoxReferenceActions.error.value"
    :suspended="pickingTextBoxReference"
    :select-reference="selectTextBoxReference"
  />
  <RangeReferencePicker
    v-if="pickingTextBoxReference"
    :reference="pickedTextBoxReference"
    :title="t('drawing.textBoxReferenceSource')"
    :hint="t('drawing.textBoxReferenceHint')"
    @confirm="textBoxReferencePickerCallbacks.confirm"
    @cancel="textBoxReferencePickerCallbacks.cancel"
  />
  <DrawingEditorDialog
    v-if="drawingDialog"
    :key="drawingDialog.dialogId"
    :drawing="drawingDialog.initial"
    :normalize-drawing="drawingActions.normalizeDialogDrawing.value"
    :text-box-reference-resolver="textBoxReferenceResolver"
    :theme="session.workbook.theme"
    :image-asset-urls="imageAssetUrls"
    :request-text-box="drawingTextBoxHandler"
    :confirm-drawing="drawingConfirmHandler"
    :disabled="!drawingActions.canEditDialog.value"
    @confirm="drawingDialog.confirm"
    @close="drawingDialog.close"
  />
  <SymbolDialog
    v-if="symbolDialog"
    :key="symbolDialog.dialogId"
    :disabled="loading || fileBusy || xlsxBusy || !canEditCell(activeSheet, activeAddress)"
    :edit-session-id="cellEditSession.id"
    :insert-text="symbolDialog.insert"
    :default-font-family="
      activeSheetDisplay.getCellStyle(activeAddress)?.fontFamily ?? DEFAULT_CELL_FONT_FAMILY
    "
    @close="symbolDialog.close"
  />
  <ChartEditorDialog
    v-if="chartDialog"
    :key="chartDialog.dialogId"
    :drawing="chartDialog.initial"
    :mode="chartDialog.existing ? 'change-type' : 'insert'"
    :combo-recipe="chartDialog.comboRecipe"
    :workbook="chartDialog.workbook"
    :sheet="chartDialog.sheet"
    :evaluator="activeSheetEvaluator"
    :revision="workbookRevision"
    :disabled="
      loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
    "
    :error="chartError"
    :suspended="pickingChartRange"
    :select-reference="selectChartReference"
    @edit-pivot="chartDialog.editPivot"
    @confirm="chartDialog.confirm"
    @close="chartDialog.close"
  />
  <ChartSourceDialog
    v-if="chartSourceDialog"
    :key="chartSourceDialog.dialogId"
    :drawing="chartSourceDialog.initial"
    :workbook="chartSourceDialog.workbook"
    :sheet="chartSourceDialog.sheet"
    :evaluator="activeSheetEvaluator.forSheet?.(chartSourceDialog.sheet.id) ?? activeSheetEvaluator"
    :revision="workbookRevision"
    :disabled="
      loading ||
      fileBusy ||
      xlsxBusy ||
      !canUseSheetPermission(chartSourceDialog.sheet, 'editObjects')
    "
    :owner-valid="chartSourceDialog.isCurrent"
    :error="chartSourceError"
    :suspended="pickingChartRange"
    :commit="chartSourceDialog.commit"
    :select-reference="chartSourceDialog.selectReference"
    @close="chartSourceDialog.close"
  />
  <RangeReferencePicker
    v-if="pickingChartRange && chartPicker"
    :key="chartPicker.id"
    :reference="pickedChartReference"
    :edit-session-id="cellEditSession.id"
    @confirm="chartPicker.confirm"
    @cancel="chartPicker.cancel"
  />
  <input
    :ref="attachmentActions.fileInput"
    type="file"
    hidden
    @change="attachmentActions.onFiles"
  />
  <AttachmentDialog
    v-if="viewingAttachment"
    :drawing="viewingAttachment"
    @download="attachmentActions.download(viewingAttachment)"
    @close="attachmentActions.close"
  />
  <PivotGroupingDialog
    v-if="pivotGroupingDraft"
    :draft="pivotGroupingDraft"
    :date-system="session.workbook.dateSystem"
    :disabled="pivotDisabled"
    @apply="pivotGrouping.apply"
    @close="pivotGrouping.close"
  />
  <PivotTableDialog
    v-if="pivotDialog"
    :key="pivotDialog.dialogId"
    :initial="pivotDialog.initial"
    :workbook="session.workbook"
    :revision="workbookRevision"
    :disabled="loading || fileBusy || xlsxBusy"
    :error="pivotError"
    :error-reason="pivotErrorReason"
    :suspended="pickingPivotRange"
    :select-reference="selectPivotReference"
    @confirm="pivotDialog.confirm"
    @close="pivotDialog.close"
  />
  <RangeReferencePicker
    v-if="pickingPivotRange"
    :reference="pickedPivotReference"
    :edit-session-id="cellEditSession.id"
    @confirm="pivotRangePicker.confirm"
    @cancel="pivotRangePicker.cancel"
  />
  <FormControlDialog
    v-if="controlDialog"
    :key="controlDialog.dialogId"
    :drawing="controlDialog.initial"
    :sheet-name="activeSheet.name"
    :disabled="
      loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
    "
    :error="controlError"
    :suspended="pickingControlRange"
    :select-reference="controlRangePicker.selectReference"
    @confirm="controlDialog.confirm"
    @close="controlDialog.close"
  />
  <RangeReferencePicker
    v-if="pickingControlRange"
    :reference="pickedControlReference"
    :edit-session-id="cellEditSession.id"
    @confirm="controlRangePicker.confirm"
    @cancel="controlRangePicker.cancel"
  />
  <CameraEditorDialog
    v-if="cameraDialog"
    :key="cameraDialog.dialogId"
    :drawing="cameraDialog.initial"
    :sheet-name="activeSheet.name"
    :disabled="
      loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
    "
    :error="cameraError"
    :suspended="pickingCameraRange"
    :select-reference="cameraRangePicker.selectReference"
    @confirm="cameraDialog.confirm"
    @close="cameraDialog.close"
  />
  <RangeReferencePicker
    v-if="pickingCameraRange"
    :reference="pickedCameraReference"
    :edit-session-id="cellEditSession.id"
    @confirm="cameraRangePicker.confirm"
    @cancel="cameraRangePicker.cancel"
  />
  <SparklineDialog
    v-if="sparklineDialog"
    :key="sparklineDialog.dialogId"
    :initial="sparklineDialog.initial"
    :disabled="
      loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'formatCells')
    "
    :error="sparklineError"
    :failed="sparklineFailed"
    :suspended="pickingSparklineRange"
    :select-reference="selectSparklineReference"
    @confirm="sparklineDialog.confirm"
    @close="sparklineDialog.close"
  />
  <RangeReferencePicker
    v-if="pickingSparklineRange && sparklinePicker"
    :key="sparklinePicker.id"
    :reference="pickedSparklineReference"
    :edit-session-id="cellEditSession.id"
    @confirm="sparklinePicker.confirm"
    @cancel="sparklinePicker.cancel"
  />
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) 49px;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-width: 320px;
  min-height: 360px;
  overflow: hidden;
  background: var(--sheetcraft-surface-panel);

  &.is-formula-bar-hidden {
    grid-template-rows: auto auto minmax(0, 1fr) 49px;
  }

  &__image-input {
    display: none;
  }

  &__sheet {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  &__grid {
    display: flex;
    min-width: 0;
    min-height: 0;

    &.is-eye-comfort {
      --sheetcraft-surface-panel: var(--sheetcraft-eye-comfort-surface);
      --sheetcraft-surface-secondary: var(--sheetcraft-eye-comfort-header);
      --sheetcraft-border-subtle: var(--sheetcraft-eye-comfort-gridline);
    }
  }
}
</style>
