<script setup lang="ts">
import { canEditPictureSelection } from "@sheetcraft/core/picture-protection";
import { getCellContent, getCellStyle, createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import { useWordProofreading } from "../modules/text-proofreading/useWordProofreading";
const ProofreadingToolbar = defineAsyncComponent(
  () => import("../modules/text-proofreading/components/ProofreadingToolbar.vue"),
);
const WordReviewDialog = defineAsyncComponent(
  () => import("../modules/text-proofreading/components/WordReviewDialog.vue"),
);
const WordDictionaryDialog = defineAsyncComponent(
  () => import("../modules/text-proofreading/components/WordDictionaryDialog.vue"),
);
const DocumentPasswordDialog = defineAsyncComponent(
  () => import("../modules/workbook-xlsx/components/DocumentPasswordDialog.vue"),
);
import { useTextReviewController } from "../modules/review-tools/useTextReviewController";
const TextReviewDialog = defineAsyncComponent(
  () => import("../modules/review-tools/components/TextReviewDialog.vue"),
);
import {
  canEditCell,
  canUseSheetPermission,
  isPictureGroup,
  type PictureGroupPath,
} from "@sheetcraft/core";
import { useProtectionController } from "../modules/review-tools/useProtectionController";
const UnlockRangeDialog = defineAsyncComponent(
  () => import("../modules/review-tools/components/UnlockRangeDialog.vue"),
);
const SheetProtectionDialog = defineAsyncComponent(
  () => import("../modules/review-tools/components/SheetProtectionDialog.vue"),
);
const EditableRangesDialog = defineAsyncComponent(
  () => import("../modules/review-tools/components/EditableRangesDialog.vue"),
);
const WorkbookProtectionDialog = defineAsyncComponent(
  () => import("../modules/review-tools/components/WorkbookProtectionDialog.vue"),
);
const ReviewToolbar = defineAsyncComponent(
  () => import("../modules/review-tools/components/ReviewToolbar.vue"),
);
import { useReviewController } from "../modules/review-tools/useReviewController";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import {
  computed,
  defineAsyncComponent,
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
  createSetSheetPageDecorationCommand,
  createSetSheetsWatermarkCommand,
  createSetWorkbookWatermarkPresetsCommand,
} from "@sheetcraft/core/commands";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useWorkbookFullscreen } from "../modules/workbook/composables/useWorkbookFullscreen";
import { useEyeComfortMode } from "../modules/workbook/composables/useEyeComfortMode";
import { normalizeSheetZoom, SHEET_ZOOM_STEP } from "../shared/sheet-view/zoom";
import { useCellEditSession } from "../shared/cell-editing/useCellEditSession";
import { useFormulaToolsController } from "../modules/formula-tools/useFormulaToolsController";
import { useFormulaEditorController } from "../modules/formula-tools/useFormulaEditorController";
const FormulaFunctionBrowser = defineAsyncComponent(
  () => import("../modules/formula-tools/components/FormulaFunctionBrowser.vue"),
);
const FormulaEditorDialog = defineAsyncComponent(
  () => import("../modules/formula-tools/components/FormulaEditorDialog.vue"),
);
import { useDataToolsController } from "../modules/data-tools/useDataToolsController";
import { useDuplicateErrorChecks } from "../modules/data-tools/useDuplicateErrorChecks";
import { describeCellErrorCheck } from "../modules/data-tools/error-check-descriptions";
import type { ErrorCheckSettings } from "../modules/data-tools/duplicate-error-preferences";
const DuplicateErrorCheckOptionsDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue"),
);
const DataTableDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataTableDialog.vue"),
);
const CreateTableDialog = defineAsyncComponent(
  () => import("../modules/table-styles/components/CreateTableDialog.vue"),
);
const TableSettingsDialog = defineAsyncComponent(
  () => import("../modules/table-styles/components/TableSettingsDialog.vue"),
);
const ResizeTableDialog = defineAsyncComponent(
  () => import("../modules/table-styles/components/ResizeTableDialog.vue"),
);
const CalculatedColumnDialog = defineAsyncComponent(
  () => import("../modules/table-styles/components/CalculatedColumnDialog.vue"),
);
const TableToolsToolbar = defineAsyncComponent(
  () => import("../modules/table-styles/components/TableToolsToolbar.vue"),
);
const NewTableStyleDialog = defineAsyncComponent(
  () => import("../modules/table-styles/components/NewTableStyleDialog.vue"),
);
const HyperlinkDialog = defineAsyncComponent(
  () => import("../modules/hyperlinks/components/HyperlinkDialog.vue"),
);
import { useWorkspaceKeyboardShortcuts } from "./composables/useWorkspaceKeyboardShortcuts";
import { useWorkspacePivotAndObjects } from "./composables/useWorkspacePivotAndObjects";
import { useWorkspaceShapeClipboard } from "./composables/useWorkspaceShapeClipboard";
const AttachmentInsertDialog = defineAsyncComponent(
  () => import("../modules/attachments/components/AttachmentInsertDialog.vue"),
);
import { useHyperlinksController } from "../modules/hyperlinks/useHyperlinksController";
const NewCellStyleDialog = defineAsyncComponent(
  () => import("../modules/cell-styles/components/NewCellStyleDialog.vue"),
);
const MergeCellStylesDialog = defineAsyncComponent(
  () => import("../modules/cell-styles/components/MergeCellStylesDialog.vue"),
);
import { useCellStylesController } from "../modules/cell-styles/useCellStylesController";
import { useTableStylesController } from "../modules/table-styles/useTableStylesController";
const GoalSeekDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/GoalSeekDialog.vue"),
);
const PlanningSolverDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/PlanningSolverDialog.vue"),
);
const DataProofreadingDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataProofreadingDialog.vue"),
);
const DataToolbar = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataToolbar.vue"),
);
const ViewToolbar = defineAsyncComponent(
  () => import("../modules/view-tools/components/ViewToolbar.vue"),
);
const PagePrintPreview = defineAsyncComponent(
  () => import("../modules/page-layout/components/PagePrintPreview.vue"),
);
const PageThemeMenu = defineAsyncComponent(
  () => import("../modules/page-layout/components/PageThemeMenu.vue"),
);
import { usePageThemeController } from "../modules/page-layout/usePageThemeController";
import { workbookThemeKey } from "../shared/color/workbook-theme-context";
const PageBackgroundMenu = defineAsyncComponent(
  () => import("../modules/page-decorations/components/PageBackgroundMenu.vue"),
);
import { usePictureAssetTools } from "../modules/sheet-images/usePictureAssetTools";
import { usePictureCellConversion } from "../modules/sheet-images/usePictureCellConversion";
const PictureCellOverwriteDialog = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureCellOverwriteDialog.vue"),
);
const PictureBatchInsertDialog = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureBatchInsertDialog.vue"),
);
import type { PictureCellOverwriteConfirmation } from "../modules/sheet-images/picture-cell-overwrite-confirmation";
const PictureCompressDialog = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureCompressDialog.vue"),
);
const PictureBatchSizeDialog = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureBatchSizeDialog.vue"),
);
import {
  usePictureTools,
  type PictureAlignmentReference,
} from "../modules/sheet-images/usePictureTools";
const PictureSelectionPane = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureSelectionPane.vue"),
);
const PictureAnnotationDialog = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureAnnotationDialog.vue"),
);
import type PictureToolbarType from "../modules/sheet-images/components/PictureToolbar.vue";
const PictureToolbar = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureToolbar.vue"),
);
import type { Sheet, FloatingImage } from "@sheetcraft/core/workbook";
const PictureGroupRibbon = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureGroupRibbon.vue"),
);
import type PictureOwnedLeafRibbonType from "../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
const PictureOwnedLeafRibbon = defineAsyncComponent(
  () => import("../modules/sheet-images/components/PictureOwnedLeafRibbon.vue"),
);
import type PictureFormatPaneType from "../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import { pictureFormatOwnerKey } from "../modules/sheet-images/picture-format-pane-model";
const PictureFormatPane = defineAsyncComponent(
  () => import("../modules/sheet-images/components/format-pane/PictureFormatPane.vue"),
);
import type ShapeFormatPaneType from "../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
const SparklineDateAxisDialog = defineAsyncComponent(
  () => import("../modules/sparklines/components/SparklineDateAxisDialog.vue"),
);
const SparklineAxisLimitDialog = defineAsyncComponent(
  () => import("../modules/sparklines/components/SparklineAxisLimitDialog.vue"),
);
const SparklineDataOptionsDialog = defineAsyncComponent(
  () => import("../modules/sparklines/components/SparklineDataOptionsDialog.vue"),
);
const SparklineToolsToolbar = defineAsyncComponent(
  () => import("../modules/sparklines/components/SparklineToolsToolbar.vue"),
);
const PivotGroupingDialog = defineAsyncComponent(
  () => import("../modules/pivot-tables/components/PivotGroupingDialog.vue"),
);
const PivotFieldsPane = defineAsyncComponent(
  () => import("../modules/pivot-tables/components/PivotFieldsPane.vue"),
);
const PivotAnalysisToolbar = defineAsyncComponent(
  () => import("../modules/pivot-tables/components/PivotAnalysisToolbar.vue"),
);
const PivotDesignToolbar = defineAsyncComponent(
  () => import("../modules/pivot-tables/components/PivotDesignToolbar.vue"),
);
import TableStyleGallery from "../modules/table-styles/components/TableStyleGallery.vue";
const PivotTableDialog = defineAsyncComponent(
  () => import("../modules/pivot-tables/components/PivotTableDialog.vue"),
);
const InsertSlicerDialog = defineAsyncComponent(
  () => import("../modules/slicers/components/InsertSlicerDialog.vue"),
);
const SlicerToolbar = defineAsyncComponent(
  () => import("../modules/slicers/components/SlicerToolbar.vue"),
);
const SlicerSettingsDialog = defineAsyncComponent(
  () => import("../modules/slicers/components/SlicerSettingsDialog.vue"),
);
const FormControlDialog = defineAsyncComponent(
  () => import("../modules/form-controls/components/FormControlDialog.vue"),
);
const AttachmentDialog = defineAsyncComponent(
  () => import("../modules/attachments/components/AttachmentDialog.vue"),
);
const CameraEditorDialog = defineAsyncComponent(
  () => import("../modules/camera/components/CameraEditorDialog.vue"),
);
const SparklineDialog = defineAsyncComponent(
  () => import("../modules/sparklines/components/SparklineDialog.vue"),
);
const ChartFormatPane = defineAsyncComponent(
  () => import("../modules/charts/components/ChartFormatPane.vue"),
);
const ChartElementsToolbar = defineAsyncComponent(
  () => import("../modules/charts/components/ChartElementsToolbar.vue"),
);
const DashboardPanel = defineAsyncComponent(
  () => import("../modules/dashboards/DashboardPanel.vue"),
);
const DashboardCreateDialog = defineAsyncComponent(
  () => import("../modules/dashboards/DashboardCreateDialog.vue"),
);
const DashboardWidgetDialog = defineAsyncComponent(
  () => import("../modules/dashboards/DashboardWidgetDialog.vue"),
);
const MindMapDialog = defineAsyncComponent(() => import("../modules/mind-maps/MindMapDialog.vue"));
const FlowchartDialog = defineAsyncComponent(
  () => import("../modules/flowcharts/FlowchartDialog.vue"),
);
const ChartEditorDialog = defineAsyncComponent(
  () => import("../modules/charts/components/ChartEditorDialog.vue"),
);
const ChartSourceDialog = defineAsyncComponent(
  () => import("../modules/charts/components/ChartSourceDialog.vue"),
);
const SymbolDialog = defineAsyncComponent(
  () => import("../modules/insert-tools/components/SymbolDialog.vue"),
);
import { useSheetDisplaySnapshot } from "../modules/sheet-grid/canvas/sheet-display-snapshot";
import { DEFAULT_CELL_FONT_FAMILY } from "@sheetcraft/core/style";
const ScreenRecordingTool = defineAsyncComponent(
  () => import("../modules/insert-tools/components/ScreenRecordingTool.vue"),
);
const ScreenCaptureSourceDialog = defineAsyncComponent(
  () => import("../modules/insert-tools/components/ScreenCaptureSourceDialog.vue"),
);
const ScreenCaptureDialog = defineAsyncComponent(
  () => import("../modules/insert-tools/components/ScreenCaptureDialog.vue"),
);
const TextBoxReferenceDialog = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/TextBoxReferenceDialog.vue"),
);
const DrawingEditorDialog = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/DrawingEditorDialog.vue"),
);
const ShapeFormatPane = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue"),
);
const ShapeTextRibbonTools = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/ShapeTextRibbonTools.vue"),
);
const ShapeToolsToolbar = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/ShapeToolsToolbar.vue"),
);
const ShapeSelectionPane = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/ShapeSelectionPane.vue"),
);
const ShapeClipboardTransferDialog = defineAsyncComponent(
  () => import("../modules/sheet-drawings/components/ShapeClipboardTransferDialog.vue"),
);
const EquationTools = defineAsyncComponent(
  () => import("../modules/sheet-drawings/equation/EquationTools.vue"),
);
const InsertToolbar = defineAsyncComponent(
  () => import("../modules/insert-tools/components/InsertToolbar.vue"),
);
const PageWatermarkMenu = defineAsyncComponent(
  () => import("../modules/page-decorations/components/PageWatermarkMenu.vue"),
);
const WatermarkDialog = defineAsyncComponent(
  () => import("../modules/page-decorations/components/WatermarkDialog.vue"),
);
import { usePageDecorationActions } from "../modules/page-decorations/usePageDecorationActions";
const PageToolbar = defineAsyncComponent(
  () => import("../modules/page-layout/components/PageToolbar.vue"),
);
import TableStylesMenu from "../modules/table-styles/components/TableStylesMenu.vue";
const PageSetupDialog = defineAsyncComponent(
  () => import("../modules/page-layout/components/PageSetupDialog.vue"),
);
const DataToolsDialogs = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataToolsDialogs.vue"),
);
const DuplicateValuesDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DuplicateValuesDialog.vue"),
);
const ConsolidateDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/ConsolidateDialog.vue"),
);
const FillNumberSequenceDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillNumberSequenceDialog.vue"),
);
const FillRankDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillRankDialog.vue"),
);
const FillSeriesDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillSeriesDialog.vue"),
);
const FillBlanksDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillBlanksDialog.vue"),
);
const FillTextDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillTextDialog.vue"),
);
const FillCurrentDateDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/FillCurrentDateDialog.vue"),
);
const DropdownListDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DropdownListDialog.vue"),
);
const LookupFillDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/LookupFillDialog.vue"),
);
const DataComparisonDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataComparisonDialog.vue"),
);
const AdvancedFilterDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/AdvancedFilterDialog.vue"),
);
import type { FillDirection } from "@sheetcraft/sheet-engine/fill-selection";
const FilterColumnPanel = defineAsyncComponent(
  () => import("../modules/data-tools/components/FilterColumnPanel.vue"),
);
const DataValidationFeedbackDialog = defineAsyncComponent(
  () => import("../modules/data-tools/components/DataValidationFeedbackDialog.vue"),
);
const RangeReferencePicker = defineAsyncComponent(
  () => import("../shared/range-reference/RangeReferencePicker.vue"),
);
import { useRangeReferencePicker } from "../shared/range-reference/useRangeReferencePicker";
const NamedRangesDialog = defineAsyncComponent(
  () => import("../modules/formula-tools/components/NamedRangesDialog.vue"),
);
import {
  createIndexedDbImageAssetStore,
  type ImageAssetStore,
} from "../modules/image-assets/imageAssetStore";
import { useImageAssetUrls } from "../modules/image-assets/useImageAssetUrls";
import { useSheetImageActions } from "../modules/sheet-images/useSheetImageActions";
import { SUPPORTED_IMAGE_FILE_ACCEPT } from "../modules/image-assets/supportedImageTypes";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import { useSheetContextActions } from "./composables/useSheetContextActions";
import { useWorkspaceCellFormatting } from "./composables/useWorkspaceCellFormatting";
import { useWorkspaceCharts } from "./composables/useWorkspaceCharts";
import { useWorkspaceDataRangePickers } from "./composables/useWorkspaceDataRangePickers";
import { useWorkspaceEquationEditing } from "./composables/useWorkspaceEquationEditing";
import { useWorkspaceFindAndGoTo } from "./composables/useWorkspaceFindAndGoTo";
import { useWorkspaceInsertCapture } from "./composables/useWorkspaceInsertCapture";
import { useWorkspacePageLayout } from "./composables/useWorkspacePageLayout";
import { useWorkspacePictureFormat } from "./composables/useWorkspacePictureFormat";
import { useWorkspaceShapeFormat } from "./composables/useWorkspaceShapeFormat";
import { createTypedEventBus } from "../shared/runtime/typed-event-bus";
import {
  createWorkspaceRuntime,
  provideWorkspaceRuntime,
  type WorkspaceEvents,
} from "../shared/runtime/workspace-runtime";
import type { SheetContextMenuState } from "../modules/sheet-grid/context-menu-contracts";
const SheetColumnStatisticsDialog = defineAsyncComponent(
  () => import("../modules/sheet-grid/components/SheetColumnStatisticsDialog.vue"),
);
const SheetColumnChoiceDialog = defineAsyncComponent(
  () => import("../modules/sheet-grid/components/SheetColumnChoiceDialog.vue"),
);
const SheetContextFilterDialog = defineAsyncComponent(
  () => import("../modules/sheet-grid/components/SheetContextFilterDialog.vue"),
);
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
import type { WorkbookFindMode } from "../modules/workbook/workbook-find-types";
import { resolveRangeReference } from "../shared/range-reference/formatRangeReference";
import type WorkbookFindDialogType from "../modules/workbook/components/WorkbookFindDialog.vue";
const WorkbookFindDialog = defineAsyncComponent(
  () => import("../modules/workbook/components/WorkbookFindDialog.vue"),
);
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import { useSpreadsheetWorkspaceController } from "./composables/useSpreadsheetWorkspaceController";
const CellFormatDialog = defineAsyncComponent(
  () => import("../modules/cell-format/components/CellFormatDialog.vue"),
);
const ConditionalFormatManagerDialog = defineAsyncComponent(
  () => import("../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue"),
);
import { formatConditionalFormatRanges } from "../modules/conditional-formatting/conditional-formatting-ui";
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
const findDialogRef = ref<InstanceType<typeof WorkbookFindDialogType>>();
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

const workspaceEvents = createTypedEventBus<WorkspaceEvents>();
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
} = useSpreadsheetWorkspaceController({ events: workspaceEvents });

const workspaceRuntime = createWorkspaceRuntime({
  events: workspaceEvents,
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getActiveAddress: () => activeAddress.value,
  getSelectionRange: () => activeSelectionRange.value,
  getEvaluator: () => activeSheetEvaluator.value,
  workbookGeneration,
  workbookRevision,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  executeCommand,
  executeReplaceableCommand,
  undo,
  redo,
  selectSheet,
  focusGrid: focusCellEditor,
  notify: (level, message) => {
    void MessagePlugin[level](message);
  },
});
provideWorkspaceRuntime(workspaceRuntime);

const cellEditSession = useCellEditSession({ onCommit: commitCell });
workspaceRuntime.coordinator.registerEditParticipant({
  id: "cell",
  priority: 10,
  isActive: () => cellEditSession.state.active,
  flush: () => cellEditSession.finish(),
  cancel: () => cellEditSession.cancel(),
});
workspaceRuntime.coordinator.registerClipboardOwner("cell", () => clearGridClipboard());
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
  displayedNoteKeys,
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
const {
  pageSetupVisible,
  pageSetupRangePicker,
  pickingPageSetupRange,
  pickedPageSetupReference,
  pageSetupRangeField,
  selectPageSetupReference,
  showPageBreaks,
  printPreviewVisible,
  returnToPrintPreview,
  watermarkVisible,
  backgroundConflictVisible,
  watermarkDialogValue,
  showPageRulers,
  showPageMargins,
  showPageWhiteSpace,
  pageRulerUnit,
  pageSetupTab,
  headerFooterTarget,
  activeViewMode,
  activePageSetup,
  lastCustomMargins,
  setPageWhiteSpace,
  openHeaderFooter,
  setViewMode,
  applyPageSetup,
  openPageSetup,
  changePageSetup,
  setPrintAreaFromSelection,
  changePageBreak,
  applyWatermark,
  saveCustomWatermark,
  openWatermark,
  applyWatermarkPreset,
  openPrintPreview,
  openPrintPageSetup,
  savePageSetup,
} = useWorkspacePageLayout({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  getSelectionRange: () => activeSelectionRange.value,
  getActiveAddress: () => activeAddress.value,
  getSelectionMode: () => activeSelectionMode.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flushPendingEdit: () => sheetGridRef.value?.flushPendingEdit() !== false,
  executeCommand,
  focusCellEditor,
  getDecorations: () => decorations,
  showImageFeedback,
  t,
});
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
const {
  cellFormatSelection,
  cellFormatInitialTab,
  conditionalFormattingSelection,
  conditionalFormattingSheets,
  conditionalFormatQuickRule,
  conditionalFormatRangePicker,
  conditionalFormatPickingValue,
  pickingConditionalFormatRange,
  pickedConditionalFormatReference,
  openCellFormat,
  closeCellFormat,
  confirmCellFormat,
  openConditionalFormatting,
  closeConditionalFormatting,
  selectConditionalFormatReference,
  selectConditionalFormatValueReference,
  saveConditionalFormats,
  saveConditionalFormatSheets,
  clearConditionalFormatRules,
} = useWorkspaceCellFormatting({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getSheets: () => sheets.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  cellEditSession,
  selectSheet,
  focusCellEditor,
  captureCellFormatSelection,
  applyCellFormat,
  captureConditionalFormattingSelection,
  setConditionalFormats,
  setConditionalFormatsForSheets,
  clearConditionalFormats,
});

function onSelectSheet(sheetId: string): void {
  if (sparklineActions.pickerOwner.value) {
    const target = sparklineDialog.value?.workbook.sheets.get(sheetId);
    if (target && !target.dashboard && !target.properties.hidden) selectSheet(sheetId);
    return;
  }
  if (pickingControlRange.value) {
    const target = controlDialog.value?.workbook.sheets.get(sheetId);
    if (target && !target.dashboard && !target.properties.hidden) selectSheet(sheetId);
    return;
  }
  if (sparklineDates.picking.value) {
    sparklineDates.selectPickerSheet(sheetId);
    return;
  }
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
    if (
      (command.type === "setSheetFloatingImages" || command.type === "insertPictureBatch") &&
      command.sheetId === activeSheet.value.id
    ) {
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
  getRange: () => activeSelectionRange.value,
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
    workspaceRuntime.notify("info", t(key));
  } else if (
    key === "image.inserted" ||
    key === "image.copied" ||
    key === "image.convertedToFloating"
  ) {
    workspaceRuntime.notify("success", t(key));
  } else {
    workspaceRuntime.notify("error", t(key));
  }
}
watch(
  imageActions.feedback,
  (key) => {
    if (key) showImageFeedback(key);
  },
  { flush: "sync" },
);
const {
  pivotActions,
  pivotDialog,
  editingPivot,
  pivotError,
  pivotErrorReason,
  activePivot,
  pivotFieldsVisible,
  pivotFieldSettingsOpen,
  pivotFieldsPaneRef,
  pivotStyles,
  pivotDisabled,
  pivotActiveField,
  pivotGroupField,
  pivotGrouping,
  pivotGroupingDraft,
  openPivotFields,
  openPivotFieldSettings,
  pivotRangePicker,
  pickingPivotRange,
  pickedPivotReference,
  selectPivotReference,
  tableSlicers,
  controlActions,
  controlDialog,
  editingControl,
  controlError,
  controlRangePicker,
  pickingControlRange,
  pickedControlReference,
  attachmentActions,
  viewingAttachment,
  attachmentBusy,
  insertingAttachment,
  flowcharts,
  mindMaps,
  mindMapEditor,
  mindMapError,
  flowchartEditor,
  flowchartError,
  cameraActions,
  cameraDialog,
  editingCamera,
  cameraError,
  cameraRangePicker,
  pickingCameraRange,
  pickedCameraReference,
  sparklineActions,
  sparklineDialog,
  sparklineDraft,
  sparklineError,
  sparklineFailed,
  sparklineToolContext,
  sparklineRangePicker,
  sparklineDataOptions,
  sparklineDates,
  sparklineAxisLimit,
  pickingSparklineRange,
  pickedSparklineReference,
  sparklinePicker,
  selectSparklineReference,
  selectedChartId,
  selectedSlicerId,
  selectedSlicer,
  selectedSlicerState,
  dashboards,
  creatingDashboard,
  editingDashboard,
  dashboardError,
  pickingDashboardRange,
  dashboardReference,
} = useWorkspacePivotAndObjects({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getActiveAddress: () => activeAddress.value,
  getSelectionRange: () => activeSelectionRange.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getActiveTable: () => activeTable.value,
  customPivotTableStyles,
  getSelectedShapeObjectPaths: () => selectedShapeObjectPaths.value,
  workbookGeneration,
  workbookRevision,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flushCellEdit: () => cellEditSession.finish(),
  executeCommand,
  selectSheet,
  navigateToCell: (address) => {
    sheetGridRef.value?.navigateToCell(address);
  },
  selectDrawing: (id) => {
    sheetGridRef.value?.selectDrawing(id);
  },
  selectShapeObjects: (paths) => {
    sheetGridRef.value?.selectShapeObjects(paths);
  },
  t,
});
const {
  chartFormatPaneVisible,
  chartFormatPaneRef,
  chartFormatTarget,
  chartActions,
  chartDialog,
  editingChart,
  chartError,
  chartSourceDialog,
  chartSourceError,
  chartObjectContext,
  chartLayoutPreview,
  chartFormatControls,
  chartFormatContext,
  chartFormatChoices,
  selectChartFormatElement,
  chartRangePicker,
  pickingChartRange,
  pickedChartReference,
  chartPicker,
  selectChartReference,
} = useWorkspaceCharts({
  runtime: workspaceRuntime,
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getSelectionRange: () => activeSelectionRange.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  getWorkbookRevision: () => workbookRevision.value,
  selectedChartId,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flushCellEdit: () => cellEditSession.finish(),
  flushGridOrCellEdit: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  executeCommand,
  selectSheet,
  selectDrawing: (drawingId) => sheetGridRef.value?.selectDrawing(drawingId),
  openPivotFields,
  t,
});
watch(
  [activeSheet, workbookGeneration],
  () => {
    selectedChartId.value = null;
    selectedSlicerId.value = null;
    chartFormatPaneVisible.value = false;
    chartFormatTarget.value = { kind: "chart" };
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
  if (drawing.kind !== "equation") cancelPendingEquationOpen();
  if (drawing.kind === "shapeGroup") {
    openShapeGroupFormat(drawing, [drawing.id]);
    return;
  }
  if (drawing.kind === "chart") chartActions.edit(drawing);
  else if (drawing.kind === "control") controlActions.open(drawing);
  else if (drawing.kind === "attachment") {
    if (!flowcharts.open("gallery", drawing) && !mindMaps.open("workbook", drawing))
      attachmentActions.viewing.value = drawing;
  } else if (drawing.kind === "camera") cameraActions.open(drawing);
  else if (drawing.kind === "slicer") {
    sheetGridRef.value?.selectDrawing(drawing.id);
    tableSlicers.openSettings(drawing);
  } else if (drawing.kind === "equation") beginEquationEdit(drawing);
  else drawingActions.edit(drawing);
}
const {
  symbolDialog,
  symbolVisible,
  symbolPreferences,
  openSymbolDialog,
  insertSymbol,
  quickSymbolInsert,
  captureBusy,
  recordingToolOpen,
  recordingModal,
  openRecorder,
  closeRecorder,
  insertRecording,
  canCaptureScreen,
  screenCapture,
  requestingCapture,
  preparingFrame,
  insertScreenCapture,
  acquireScreenCapture,
  insertCapturedRegion,
} = useWorkspaceInsertCapture({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  getWorkbookRevision: () => workbookRevision.value,
  getActiveAddress: () => activeAddress.value,
  getActiveCellInput: () => activeCellInput.value,
  cellEditSession,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  isImageBusy: () => imageBusy.value,
  focusCellEditor,
  focusFormulaBarOrGrid,
  pasteFloatingImage: (file, address) => imageActions.pasteImageFile(file, "floating", address),
  insertRecordingAttachment: (file) => Boolean(attachmentActions.requestInsert("icon", file)),
  t,
});
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
  dashboardLabels: () => ({
    records: t("dashboard.records"),
    blank: t("dashboard.blank"),
    noSource: t("dashboard.noSource"),
  }),
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

const workbookPrintSheets = computed(() => {
  void workbookRevision.value;
  return [...session.workbook.sheets.values()].map((sheet) => ({
    sheet,
    evaluator:
      activeSheetEvaluator.value.forSheet?.(sheet.id) ??
      createWorkbookEvaluator(session.workbook, sheet.id),
    setup: sheet.pageSetup ?? DEFAULT_SHEET_PAGE_SETUP,
    displayedNoteKeys: reviewActions.getDisplayedNoteKeys(sheet),
  }));
});
const chartPrintSheetResolver = computed(() => {
  void workbookRevision.value;
  const workbook = session.workbook;
  return (id: string) => workbook.sheets.get(id);
});
const shapeObjectFormatPaneRef = ref<InstanceType<typeof ShapeFormatPaneType>>();
const {
  getShapePaintAssetSize,
  textBoxReferenceResolver,
  prepareWorkspaceDrawing,
  drawingActions,
  drawingDialog,
  editingDrawing,
  shapeFormatPane,
  shapeGroupFormatPane,
  shapeConnectorFormatPane,
  shapeTextEditSelection,
  shapeTextEdit,
  shapeTextEditCallbacks,
  shapeFormatPresentation,
  closeAllShapeFormatPanes,
  startShapeTextEdit,
  textBoxReferenceActions,
  textBoxReferenceDialog,
  textBoxReferencePicker,
  pickingTextBoxReference,
  pickedTextBoxReference,
  selectTextBoxReference,
  textBoxReferencePickerCallbacks,
  openShapeGroupFormat,
  selectedShapeGroupChanged,
  shapePaintAssets,
  beforeShapeFormatTabChange,
  openShapeFormat,
  selectedShapeChanged,
  shapeInteractionBlocked,
  shapeCreation,
  selectedShapeObjectPaths,
  selectedShapeObjectsChanged,
  shapeRibbonFormat,
  shapeRibbonSnapshot,
  shapeRibbonCapabilities,
  shapeRibbonIntent,
  ownsSelectedShapeFieldTarget,
  selectedShapePaneFieldLease,
  flushSelectedShapeFieldDrafts,
  beforeShapeContextChange,
  shapeObjectControls,
  shapeRibbonObjectTools,
  activeShapeFormatPaneSnapshot,
  activeShapeFormatPaneCapabilities,
  activeShapeFormatPaneIntent,
  activeShapeFormatInitialTab,
} = useWorkspaceShapeFormat({
  runtime: workspaceRuntime,
  shapeObjectFormatPaneRef,
  assetStore,
  locale,
  imageAssetUrls,
  imageAssetSizes,
  getShapeMetrics: (sheet) => sheetGridRef.value?.getShapeFrameContext?.(sheet)?.metrics,
  getDrawingLayout: (sheet) => sheetGridRef.value?.getDrawingLayout(sheet),
  flushPendingEdit: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  flushPendingCellEdit: () =>
    sheetGridRef.value?.flushPendingCellEdit() ?? cellEditSession.finish(),
  flushPendingShapeTextEdit: () => sheetGridRef.value?.flushPendingShapeTextEdit(),
  selectDrawing: (id) => {
    sheetGridRef.value?.selectDrawing(id);
  },
  selectShapeObjects: (paths) => sheetGridRef.value?.selectShapeObjects(paths) ?? false,
  onRootDrawingSelectionChanged: (id) => {
    if (selectedChartId.value !== id) {
      chartFormatPaneVisible.value = false;
      chartFormatTarget.value = { kind: "chart" };
    }
    selectedChartId.value = activeSheet.value.drawings?.some(
      (node) => node.id === id && node.kind === "chart",
    )
      ? id
      : null;
    selectedSlicerId.value = activeSheet.value.drawings?.some(
      (node) => node.id === id && node.kind === "slicer",
    )
      ? id
      : null;
  },
  t,
});
const {
  equationEdit,
  equationPlaceholdersHidden,
  cancelPendingEquationOpen,
  beginEquationEdit,
  editOwnedDrawing,
  equationInsertHandler,
  equationMatrixCell,
  insertEquationTemplate,
  insertEquationSymbol,
  insertEquationNormalText,
  editEquationMathOption,
} = useWorkspaceEquationEditing({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  getWorkbookRevision: () => workbookRevision.value,
  getActiveAddress: () => activeAddress.value,
  getMetrics: () => sheetGridRef.value?.getShapeFrameContext?.(activeSheet.value)?.metrics,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  flush: () =>
    sheetGridRef.value
      ? sheetGridRef.value.flushPendingShapeTextEdit() && sheetGridRef.value.flushPendingCellEdit()
      : cellEditSession.finish(),
  executeCommand,
  getEquationName: () => t("equation.equation"),
  closeCompetingDrawingsAndPanes: () => {
    drawingActions.close();
    shapeFormatPane.close();
    shapeGroupFormatPane.close();
    shapeConnectorFormatPane.close();
  },
  editGroupLeafDrawing: drawingActions.editGroupLeaf,
});
workspaceRuntime.coordinator.registerEditParticipant({
  id: "shape-text",
  priority: 30,
  isActive: () => Boolean(shapeTextEdit.snapshot.value),
  flush: () => sheetGridRef.value?.flushPendingShapeTextEdit() ?? true,
});
workspaceRuntime.coordinator.registerEditParticipant({
  id: "equation",
  priority: 25,
  isActive: () => Boolean(equationEdit.snapshot.value),
  flush: () => sheetGridRef.value?.flushPendingEquationEdit() ?? true,
});
workspaceRuntime.coordinator.registerEditParticipant({
  id: "picture-crop",
  priority: 20,
  isActive: () => sheetGridRef.value?.hasActivePictureCrop() ?? false,
  flush: () => sheetGridRef.value?.applyPendingPictureCrop() ?? true,
});
const {
  shapeClipboard,
  shapeClipboardEpoch,
  shapeClipboardTransferConfirmation,
  canPasteShapeObjects,
  shapeClipboardHandlers,
  clearCompetingShapeClipboard,
  captureCompetingShapeClipboardCopy,
  wordArtInsertHandler,
  shapeInsertHandler,
  drawingTextBoxHandler,
  drawingConfirmHandler,
} = useWorkspaceShapeClipboard({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getActiveAddress: () => activeAddress.value,
  workbookGeneration,
  workbookRevision,
  getDocumentRevision: () => session.history.revision,
  locale,
  getShapeMetrics: (sheet) => sheetGridRef.value?.getShapeFrameContext(sheet)?.metrics,
  getSelectedShapeObjects: () =>
    sheetGridRef.value?.getSelectedShapeObjects() ?? selectedShapeObjectPaths.value,
  getShapeObjectSelectionRevision: () => sheetGridRef.value?.getShapeObjectSelectionRevision(),
  selectShapeObjects: (paths) => sheetGridRef.value?.selectShapeObjects(paths) ?? false,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
  isWordArtBusy: () =>
    loading.value || fileBusy.value || xlsxBusy.value || shapeInteractionBlocked.value,
  isShapeTextEditing: () => Boolean(shapeTextEdit.snapshot.value),
  flushPendingEdit: () => sheetGridRef.value?.flushPendingEdit() ?? cellEditSession.finish(),
  executeCommand,
  prepareDrawing: (sheet, metrics, next, owner, forest) =>
    prepareWorkspaceDrawing(sheet, metrics, next, owner, forest, "preserve-geometry"),
  getShapePaintAssetSize,
  drawingActions,
  shapeCreation,
  startShapeTextEdit,
  t,
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
workspaceRuntime.events.on("pane:opened", ({ pane }) => {
  if (pane === "chart") pictureTools.paneVisible.value = false;
});
workspaceRuntime.coordinator.registerClipboardOwner("shape", clearCompetingShapeClipboard);
const pictureToolbarRef = ref<InstanceType<typeof PictureToolbarType> | null>(null);
const pictureOwnedLeafRibbonRef = ref<InstanceType<typeof PictureOwnedLeafRibbonType> | null>(null);
const pictureFormatComponentRef = ref<InstanceType<typeof PictureFormatPaneType> | null>(null);
const {
  performPictureGroup,
  deleteOwnedPictures,
  picturePaneImageAvailable,
  picturePaneHandlers,
  selectedOwnedPictureLeaf,
  pictureEffectsFocusReturn,
  pictureFormatVisible,
  pictureFormatInitialTab,
  pictureFormatInitialPaint,
  pictureIntrinsic,
  pictureIntrinsicRetry,
  pictureOriginalResetOwner,
  beforePictureFormatPaneInteraction,
  pictureFormatPane,
  picturePaintAssets,
  pictureFormatLabel,
  openOwnedPictureFormat,
  closeOwnedPictureFormat,
  pictureSourceRibbonOwner,
  performPictureContextSourceAction,
  pictureToolbarOwner,
  pictureDialogs,
  pictureAnnotation,
  pictureCompression,
  pictureBatchSize,
} = useWorkspacePictureFormat({
  runtime: workspaceRuntime,
  pictureFormatComponentRef,
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookRevision: () => workbookRevision.value,
  getPictureOwnerGeneration: () => pictureOwnerGeneration.value,
  selectedPictureId,
  selectedPictureIds,
  selectedOwnedPicturePath,
  selectedPicture,
  imageAssetUrls,
  assetStore,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  isPageLayoutMode: () => activeViewMode.value === "page-layout",
  isPictureInteractionBlocked: () =>
    gridInert.value ||
    imageBusy.value ||
    cellEditSession.state.active ||
    cellEditSession.state.composing ||
    Boolean(shapeTextEdit.snapshot.value) ||
    Boolean(equationEdit.snapshot.value),
  isEffectsFocusReturnBlocked: () =>
    gridInert.value ||
    imageBusy.value ||
    Boolean(activeRangePicker.value) ||
    cellEditSession.state.active ||
    cellEditSession.state.composing ||
    Boolean(shapeTextEdit.snapshot.value) ||
    Boolean(equationEdit.snapshot.value) ||
    (sheetGridRef.value?.hasActivePictureCrop() ?? false),
  getGridToken: () => sheetGridRef.value,
  selectFloatingImages: (ids) => sheetGridRef.value?.selectFloatingImages(ids),
  getPictureSelectionFocusTarget: (ids, owner) =>
    sheetGridRef.value?.getPictureSelectionFocusTarget(ids, owner),
  focusOwnedPictureSelection: (ids, owner) =>
    sheetGridRef.value?.focusOwnedPictureSelection(ids, owner),
  getEffectsTrigger: (mode) =>
    mode === "owned"
      ? (pictureOwnedLeafRibbonRef.value?.getEffectsTrigger() ?? null)
      : (pictureToolbarRef.value?.getEffectsTrigger() ?? null),
  showImageFeedback,
  getPictureFrameContext: (sheet) => sheetGridRef.value?.getPictureFrameContext?.(sheet),
  applyPendingPictureCrop: () => sheetGridRef.value?.applyPendingPictureCrop(),
  canCropPicture: () => sheetGridRef.value?.canCropPicture() ?? false,
  cropImage: () => sheetGridRef.value?.cropImage() ?? false,
  canPreviewPicture: () => sheetGridRef.value?.canPreviewPicture() ?? false,
  previewSelectedPicture: () => sheetGridRef.value?.previewSelectedPicture() ?? false,
  finishCellEdit: () => cellEditSession.finish(),
  setFloatingImage,
  pictureTools,
  pictureAssetTools,
  pictureCellConversion,
  imageActions,
  t,
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
function trimActiveCellErrorSpaces(): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value) return;
  if (!cellEditSession.finish()) return;
  const content = getCellContent(activeSheet.value, activeAddress.value);
  if (content?.kind !== "literal" || typeof content.value !== "string") return;
  const trimmed = content.value.trim();
  if (trimmed === content.value) return;
  executeCommand({
    type: "setCellContents",
    changes: [
      {
        sheetId: activeSheet.value.id,
        address: activeAddress.value,
        content: trimmed === "" ? null : { kind: "literal", value: trimmed },
      },
    ],
  });
  void nextTick(focusCellEditor);
}
function recalculateFromCellError(): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value) return;
  if (!cellEditSession.finish()) return;
  recalculate();
  void nextTick(focusCellEditor);
}
const activeCellErrorDescription = computed(() =>
  describeCellErrorCheck(activeCellErrorKind.value, t, {
    trimActiveSpaces: trimActiveCellErrorSpaces,
    recalculateWorkbook: recalculateFromCellError,
  }),
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
const {
  findDialogMounted,
  findFormatTarget,
  findFormatDraft,
  findFormatPicker,
  pickingFindFormat,
  pickedFindFormatReference,
  openFind,
  runFind,
  runFindAll,
  runReplace,
  runGoTo,
  selectGoToResult,
  selectFindResult,
  configureFindFormat,
  confirmFindFormat,
  pickFindFormat,
} = useWorkspaceFindAndGoTo({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  getActiveAddress: () => activeAddress.value,
  cellEditSession,
  workbookFind,
  workbookGoTo,
  findDialogVisible,
  findDialogRef,
  findMode,
  isShortcutBlocked: () =>
    formulaEditorVisible.value ||
    formulaInsertVisible.value ||
    Boolean(activeRangePicker.value) ||
    Boolean(cellFormatSelection.value),
});
const {
  simulationRangePicker,
  pickingSimulationRange,
  pickedSimulationReference,
  selectSimulationReference,
  proofreadingRangePicker,
  pickingProofreadingRange,
  pickedProofreadingReference,
  selectProofreadingReference,
  splitRangePicker,
  pickingSplitRange,
  pickedSplitReference,
  selectSplitReference,
  validationRangePicker,
  pickingValidationRange,
  pickedValidationReference,
  validationPickingCell,
  selectValidationReference,
  dropdownRangePicker,
  pickingDropdownRange,
  pickedDropdownReference,
  selectDropdownReference,
  fillRankRangePicker,
  pickingFillRankRange,
  pickedFillRankReference,
  fillRankPickingDestination,
  selectFillRankSource,
  selectFillRankDestination,
  advancedRangePicker,
  pickingAdvancedRange,
  pickedAdvancedReference,
  advancedRangeField,
  pickAdvancedFilterRange,
  duplicateRangePicker,
  pickingDuplicateRange,
  pickedDuplicateReference,
  pickDuplicateRange,
  comparisonRangePicker,
  pickingComparisonRange,
  pickedComparisonReference,
  pickComparisonRange,
  lookupFillRangePicker,
  pickingLookupFillRange,
  pickedLookupFillReference,
  pickLookupFillRange,
  consolidateRangePicker,
  pickingConsolidateRange,
  pickedConsolidateReference,
  selectConsolidateSourceReference,
  pickConsolidateRange,
  dataToolsModalOpen,
  activeDataRangePicker,
} = useWorkspaceDataRangePickers({
  getWorkbook: () => session.workbook,
  getActiveSheet: () => activeSheet.value,
  getWorkbookGeneration: () => workbookGeneration.value,
  selectSheet,
  dataTools,
  duplicateErrorOptionsVisible,
});

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
  if (pickingDashboardRange.value) return dashboards.picker;
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
  if (activeDataRangePicker.value) return activeDataRangePicker.value;
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

const gridInert = computed(
  () =>
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    recordingModal.value ||
    !!screenCapture.value ||
    !!imageActions.batchInsertion.value ||
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
    !!mindMapEditor.value ||
    !!creatingDashboard.value ||
    (!!editingDashboard.value && !pickingDashboardRange.value) ||
    !!flowchartEditor.value ||
    !!insertingAttachment.value ||
    !!editingDrawing.value ||
    (!!textBoxReferenceDialog.value && !pickingTextBoxReference.value) ||
    !!shapeClipboardTransferConfirmation.value ||
    symbolVisible.value ||
    ((!!editingChart.value || !!chartSourceDialog.value) && !pickingChartRange.value) ||
    ((!!sparklineDraft.value || !!sparklineDates.dialog.value) && !pickingSparklineRange.value) ||
    !!sparklineDataOptions.dialog.value ||
    !!sparklineAxisLimit.dialog.value ||
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

const { onWorkspaceShapeTextOutsideAction, onWorkspaceNativeTextCopy, onWorkspaceKeydown } =
  useWorkspaceKeyboardShortcuts({
    getWorkbook: () => session.workbook,
    getActiveSheet: () => activeSheet.value,
    getActiveAddress: () => activeAddress.value,
    workbookGeneration,
    workbookRevision,
    cellEditSession,
    gridInert,
    imageBusy,
    showFormulaBar,
    formatPainterActive,
    selectedShapeObjectPaths,
    isEditingDashboard: () => Boolean(editingDashboard.value),
    isShortcutsSuppressedByDialog: () =>
      Boolean(
        symbolVisible.value ||
        themeDialogVisible.value ||
        backgroundConflictVisible.value ||
        printPreviewVisible.value ||
        recordingModal.value ||
        screenCapture.value ||
        imageActions.batchInsertion.value ||
        watermarkVisible.value ||
        (pageSetupVisible.value && !pickingPageSetupRange.value) ||
        formulaEditorVisible.value ||
        formulaInsertVisible.value ||
        hyperlinkDraft.value ||
        noteDraft.value,
      ),
    isBusy: () => loading.value || fileBusy.value || xlsxBusy.value,
    hasChartModalOpen: () => Boolean(chartDialog.value || chartSourceDialog.value),
    hasCellFormatOpen: () => Boolean(cellFormatSelection.value),
    getActiveRangePicker: () => activeRangePicker.value,
    getEquationSnapshot: () => equationEdit.snapshot.value,
    getShapeTextEditSnapshot: () => shapeTextEdit.snapshot.value,
    getShapeRibbonFormatSnapshot: () => shapeRibbonFormat.snapshot.value,
    ownsSelectedShapeFieldTarget,
    flushSelectedShapeFieldDrafts: (selected) =>
      flushSelectedShapeFieldDrafts(
        selected as NonNullable<typeof shapeRibbonFormat.snapshot.value>,
      ),
    cancelPendingEquationOpen,
    flushPendingEquationEdit: () => sheetGridRef.value?.flushPendingEquationEdit(),
    flushPendingShapeTextEdit: () => sheetGridRef.value?.flushPendingShapeTextEdit(),
    hasActivePictureCrop: () => sheetGridRef.value?.hasActivePictureCrop() ?? false,
    getSelectedShapeObjects: () => sheetGridRef.value?.getSelectedShapeObjects() ?? [],
    getPictureEffectsFocusReturn: () => pictureEffectsFocusReturn.value,
    getChartFormatContext: () => chartFormatContext.value,
    chartFormatPaneRef,
    getSelectedShapePaneFieldLease: () => selectedShapePaneFieldLease(),
    getPictureFormatHistoryLease: () => {
      const element = pictureFormatComponentRef.value?.getHistoryElement();
      const snapshot = pictureFormatPane.snapshot.value;
      if (!pictureFormatVisible.value || !element || !snapshot) return undefined;
      const workbook = session.workbook;
      const sheet = activeSheet.value;
      const generation = pictureOwnerGeneration.value;
      const ownerKey = pictureFormatOwnerKey(snapshot.owner);
      return {
        element,
        ownerKey,
        current: () => {
          const latest = pictureFormatPane.snapshot.value;
          return (
            pictureFormatVisible.value &&
            session.workbook === workbook &&
            activeSheet.value === sheet &&
            pictureOwnerGeneration.value === generation &&
            !loading.value &&
            !fileBusy.value &&
            !xlsxBusy.value &&
            !imageBusy.value &&
            pictureFormatComponentRef.value?.getHistoryElement() === element &&
            pictureFormatComponentRef.value?.hasActiveNumericDraft() !== true &&
            !!latest &&
            pictureFormatOwnerKey(latest.owner) === ownerKey &&
            canEditPictureSelection(sheet, selectedPictureIds.value)
          );
        },
      };
    },
    shapeClipboard,
    shapeClipboardEpoch,
    symbolPreferences,
    insertSymbol,
    editOwnedDrawing,
    beginEquationEdit,
    insertScreenCapture,
    openHyperlinkEdit: () => hyperlinkActions.edit(),
    requestCreateTable: () => tableActions.requestCreate(),
    openCellFormat: () => openCellFormat(),
    focusCellEditor,
    focusFormulaBar: () => formulaBarRef.value?.focus({ preserveSelection: true }),
    cancelFormatPainter,
    undo,
    redo,
    t,
  });
</script>

<template>
  <section
    class="spreadsheet-workspace"
    :class="{
      'is-formula-bar-hidden': !showFormulaBar,
      'is-dashboard': !!activeSheet.dashboard,
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
      :id="`${gridId}-image-file`"
      name="insert-image-file"
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
      v-if="!activeSheet.dashboard"
      :print-disabled="loading || fileBusy || xlsxBusy"
      :has-chart="!!chartObjectContext"
      :has-slicer="!!selectedSlicer"
      :has-sparkline="!!sparklineToolContext"
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
        !!mindMapEditor ||
        !!flowchartEditor ||
        !!insertingAttachment ||
        !!editingDrawing ||
        !!textBoxReferenceDialog ||
        !!shapeClipboardTransferConfirmation ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        ((!!sparklineDraft || !!sparklineDates.dialog.value) && !pickingSparklineRange) ||
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
      @print="openPrintPreview"
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
          :slicer-disabled="!canUseSheetPermission(activeSheet, 'editObjects')"
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
          @insert-slicer="tableSlicers.openForPivot(activePivot)"
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
          :pick-transparent-color="
            sheetGridRef?.canPickTransparentColor()
              ? sheetGridRef.startPictureTransparentColor
              : undefined
          "
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
          :pick-transparent-color="
            sheetGridRef?.canPickTransparentColor()
              ? sheetGridRef.startPictureTransparentColor
              : undefined
          "
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
      <template #slicer-tools>
        <SlicerToolbar
          v-if="selectedSlicer"
          :drawing="selectedSlicer"
          :state="selectedSlicerState"
          :disabled="
            loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
          "
          :filter-editable="tableSlicers.editable(activeSheet, selectedSlicer)"
          @update="tableSlicers.updateOptions(activeSheet, selectedSlicer.id, $event)"
          @clear-filter="tableSlicers.clearFilter(activeSheet, selectedSlicer)"
          @open-settings="tableSlicers.openSettings(selectedSlicer)"
        />
      </template>
      <template #sparkline-tools>
        <SparklineToolsToolbar
          v-if="sparklineToolContext"
          :key="sparklineToolContext.key"
          :context="sparklineToolContext"
          @data-options="sparklineDataOptions.open"
          @custom-axis="sparklineAxisLimit.open"
          @date-axis="sparklineDates.open"
        />
      </template>
      <template #insert-tools>
        <InsertToolbar
          :theme-colors="session.workbook.theme.accentColors"
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
          @insert-control="controlActions.insert($event)"
          @insert-mind-map="mindMaps.open($event)"
          @insert-flowchart="flowcharts.open($event)"
          @insert-attachment="attachmentActions.requestInsert"
          @insert-drawing="drawingActions.insert"
          :insert-icon-handler="drawingActions.insertIcon"
          :insert-shape-handler="shapeInsertHandler"
          :insert-word-art-handler="wordArtInsertHandler"
          :insert-equation-handler="equationInsertHandler"
          :shape-owner-id="`${workbookGeneration}:${activeSheet.id}:${workbookRevision}`"
          @insert-camera="cameraActions.open()"
          :dashboard-disabled="
            loading || fileBusy || xlsxBusy || !!session.workbook.structureProtected
          "
          @insert-dashboard="dashboards.openCreate"
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
          @record-screen="openRecorder"
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
          :header-footer-disabled="
            loading || fileBusy || xlsxBusy || activeSheet.properties.protected
          "
          :slicer-disabled="
            loading ||
            fileBusy ||
            xlsxBusy ||
            !canUseSheetPermission(activeSheet, 'editObjects') ||
            tableSlicers.availableTargets.value.length === 0
          "
          :has-table="!!activeTable"
          :edit-session-id="cellEditSession.id"
          @insert-image="imageActions.requestInsert"
          @insert-hyperlink="hyperlinkActions.edit"
          @insert-header-footer="
            openHeaderFooter({ section: 'header', part: 'center', variant: 'odd' })
          "
          @insert-table="tableActions.requestCreate"
          @insert-slicer="tableSlicers.open"
          @manage-table="tableActions.openSettings"
        />
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
          @insert-slicer="tableSlicers.open"
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
      :names="hyperlinkActions.names.value"
      :recent-emails="hyperlinkActions.recentEmails.value"
      :current-sheet-name="activeSheet.name"
      :sheets="
        [...session.workbook.sheets.values()]
          .filter((sheet) => !sheet.properties.hidden)
          .map((sheet) => ({ id: sheet.id, name: sheet.name }))
      "
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
    <DashboardPanel
      v-if="activeSheet.dashboard"
      :key="activeSheet.id"
      :sheet="activeSheet"
      :workbook="session.workbook"
      :revision="workbookRevision"
      :evaluator="activeSheetEvaluator"
      :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
      :can-undo="session.history.undoStack.length > 0"
      :can-redo="session.history.redoStack.length > 0"
      :update="dashboards.update"
      @add="dashboards.edit($event)"
      @edit="dashboards.edit($event.kind, $event)"
      @undo="undo"
      @redo="redo"
      @xlsx="xlsxActions.exportXlsx()"
    />
    <DashboardCreateDialog
      v-if="creatingDashboard"
      :error="dashboardError"
      @create="dashboards.create"
      @close="dashboards.close"
    />
    <DashboardWidgetDialog
      v-if="editingDashboard"
      :key="editingDashboard.initial.id"
      :initial="editingDashboard.initial"
      :workbook="session.workbook"
      :evaluator="activeSheetEvaluator"
      :revision="workbookRevision"
      :error="dashboardError"
      :picking="pickingDashboardRange"
      :pick="dashboards.pick"
      @save="dashboards.save"
      @close="dashboards.close"
    />
    <RangeReferencePicker
      v-if="pickingDashboardRange"
      :reference="dashboardReference"
      :title="t('dashboard.pick')"
      :hint="t('dashboard.pickHint')"
      :edit-session-id="cellEditSession.id"
      @confirm="dashboards.picker.confirm"
      @cancel="dashboards.picker.cancel"
    />
    <WorkbookFormulaBar
      v-if="!activeSheet.dashboard"
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
        !!mindMapEditor ||
        !!flowchartEditor ||
        !!insertingAttachment ||
        !!editingDrawing ||
        !!textBoxReferenceDialog ||
        !!shapeClipboardTransferConfirmation ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        ((!!sparklineDraft || !!sparklineDates.dialog.value) && !pickingSparklineRange) ||
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
      v-if="findDialogMounted"
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
      v-if="!activeSheet.dashboard"
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
          :chart-element-selection="
            chartObjectContext
              ? { owner: chartObjectContext.drawing, target: chartFormatTarget }
              : undefined
          "
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
          @edit-hyperlink="hyperlinkActions.edit"
          @remove-hyperlink="hyperlinkActions.removeFromMenu"
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
        v-if="activeShapeFormatPaneSnapshot"
        :snapshot="activeShapeFormatPaneSnapshot"
        :capabilities="activeShapeFormatPaneCapabilities"
        :on-intent="activeShapeFormatPaneIntent"
        :load-paint-asset="shapePaintAssets.load"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :t="pictureFormatLabel"
        :initial-tab="activeShapeFormatInitialTab"
        :presentation-state="shapeFormatPresentation"
        :before-tab-change="beforeShapeFormatTabChange"
        :data-shape-text-edit-session="shapeTextEdit.snapshot.value?.sessionId"
        @close="closeAllShapeFormatPanes(true)"
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
    <PictureBatchInsertDialog
      v-if="imageActions.batchInsertion.value"
      :key="imageActions.pickerKey.value"
      :file-names="imageActions.batchInsertion.value.files.map((file) => file.name)"
      :mode="imageActions.batchInsertion.value.mode"
      :workbook="imageActions.batchInsertion.value.target.workbook"
      :sheet-id="imageActions.batchInsertion.value.target.sheetId"
      :initial-range="imageActions.batchInsertion.value.target.selectionRange"
      :revision="session.history.revision"
      :error="imageActions.batchError.value ? t(imageActions.batchError.value) : ''"
      :busy="imageBusy"
      @confirm="imageActions.confirmBatchInsertion"
      @close="imageActions.cancelPending"
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
      :owner-key="pictureBatchSize.dialogId"
      :size-scopes="pictureBatchSize.sizeScopes"
      :width="pictureBatchSize.image.width"
      :height="pictureBatchSize.image.height"
      :error="pictureBatchSize.error.value ? t(pictureBatchSize.error.value) : ''"
      @confirm="pictureBatchSize.confirm"
      @close="pictureBatchSize.close"
    />
    <ScreenRecordingTool
      v-if="recordingToolOpen"
      :can-insert="!activeSheet.dashboard && canUseSheetPermission(activeSheet, 'editObjects')"
      @modal="recordingModal = $event"
      @insert="insertRecording"
      @close="closeRecorder"
    />
    <ScreenCaptureSourceDialog
      v-if="screenCapture && !screenCapture.file && preparingFrame !== screenCapture"
      :can-capture="canCaptureScreen"
      :busy="requestingCapture === screenCapture"
      @screen="acquireScreenCapture(false)"
      @file="
        (file) => {
          if (screenCapture) screenCapture = { ...screenCapture, file };
        }
      "
      @close="screenCapture = undefined"
    />
    <ScreenCaptureDialog
      v-if="screenCapture?.file"
      :shape="screenCapture.shape"
      :file="screenCapture.file"
      :busy="captureBusy"
      @confirm="insertCapturedRegion"
      @close="screenCapture = undefined"
    />
    <PagePrintPreview
      :displayed-note-keys="displayedNoteKeys"
      :workbook-sheets="workbookPrintSheets"
      :selection="activeSelectionRange"
      :setup-disabled="activeSheet.properties.protected"
      @page-setup="openPrintPageSetup"
      :theme="workbookTheme"
      v-if="printPreviewVisible || returnToPrintPreview"
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
        (pickingSparklineRange &&
          !sparklineDates.picking.value &&
          !sparklineActions.pickerOwner.value) ||
        pickingCameraRange
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
        !!mindMapEditor ||
        !!flowchartEditor ||
        !!insertingAttachment ||
        !!editingDrawing ||
        symbolVisible ||
        ((!!editingChart || !!chartSourceDialog) && !pickingChartRange) ||
        ((!!sparklineDraft || !!sparklineDates.dialog.value) && !pickingSparklineRange) ||
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
    :id="`${gridId}-attachment-file`"
    name="insert-attachment-file"
    :aria-label="t('attachment.title')"
    :ref="attachmentActions.fileInput"
    type="file"
    hidden
    @change="attachmentActions.onFiles"
  />
  <MindMapDialog
    v-if="mindMapEditor"
    :start="mindMapEditor.start"
    :existing="mindMapEditor.existing"
    :source="mindMapEditor.document"
    :error="mindMapError"
    @save="mindMaps.save"
    @close="mindMaps.close"
  />
  <FlowchartDialog
    v-if="flowchartEditor"
    :start="flowchartEditor.start"
    :existing="flowchartEditor.existing"
    :source="flowchartEditor.document"
    :error="flowchartError"
    @save="flowcharts.save"
    @close="flowcharts.close"
  />
  <AttachmentInsertDialog
    v-if="insertingAttachment"
    :key="insertingAttachment.id"
    :display="insertingAttachment.display"
    :file-name="insertingAttachment.file?.name"
    :file-disabled="!canUseSheetPermission(activeSheet, 'editObjects')"
    :cloud-disabled="
      !canUseSheetPermission(activeSheet, 'insertHyperlinks') ||
      !canEditCell(activeSheet, insertingAttachment.address)
    "
    @choose-cloud="attachmentActions.chooseCloudDocument(hyperlinkActions.editCloudDocument)"
    :busy="attachmentBusy"
    :error="attachmentActions.insertError.value"
    @choose-file="attachmentActions.chooseFile"
    @confirm="attachmentActions.confirmInsert"
    @close="attachmentActions.close"
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
  <InsertSlicerDialog
    v-if="tableSlicers.fields.value"
    :fields="tableSlicers.fields.value"
    :tables="tableSlicers.dialogTables.value"
    :table-id="tableSlicers.target.value?.targetKey"
    @select-table="tableSlicers.selectTargetTable"
    @confirm="tableSlicers.insert"
    @close="tableSlicers.target.value = undefined"
  />
  <SlicerSettingsDialog
    v-if="tableSlicers.settingsDrawing.value"
    :drawing="tableSlicers.settingsDrawing.value"
    :state="tableSlicers.settingsState.value"
    @confirm="tableSlicers.applySettings"
    @close="tableSlicers.closeSettings"
  />
  <FormControlDialog
    v-if="controlDialog"
    :key="controlDialog.dialogId"
    :drawing="controlDialog.initial"
    :sheet-name="controlDialog.sheet.name"
    :linked-sheet-name="
      controlDialog.initial.control.linkedSheetId
        ? controlDialog.workbook.sheets.get(controlDialog.initial.control.linkedSheetId)?.name
        : undefined
    "
    :source-sheet-name="
      controlDialog.initial.control.sourceSheetId
        ? controlDialog.workbook.sheets.get(controlDialog.initial.control.sourceSheetId)?.name
        : undefined
    "
    :disabled="
      loading || fileBusy || xlsxBusy || !canUseSheetPermission(activeSheet, 'editObjects')
    "
    :error="controlError"
    :suspended="pickingControlRange"
    :select-reference="
      (text, singleCell) =>
        controlActions.pickReference(() => controlRangePicker.selectReference(text, { singleCell }))
    "
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
    :sheet-name="
      session.workbook.sheets.get(cameraDialog.initial.camera.sheetId ?? activeSheet.id)?.name ??
      '#REF!'
    "
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
  <SparklineDateAxisDialog
    v-if="sparklineDates.dialog.value"
    :key="sparklineDates.dialog.value.key"
    :initial="sparklineDates.dialog.value.initial"
    :failed="sparklineDates.failed.value"
    :suspended="pickingSparklineRange"
    :select-reference="selectSparklineReference"
    @confirm="sparklineDates.dialog.value.confirm"
    @close="sparklineDates.dialog.value.close"
  />
  <SparklineAxisLimitDialog
    v-if="sparklineAxisLimit.dialog.value"
    :key="sparklineAxisLimit.dialog.value.key"
    :initial="sparklineAxisLimit.dialog.value.initial"
    :failed="sparklineAxisLimit.failed.value"
    @confirm="sparklineAxisLimit.dialog.value.confirm"
    @close="sparklineAxisLimit.dialog.value.close"
  />
  <SparklineDataOptionsDialog
    v-if="sparklineDataOptions.dialog.value"
    :key="sparklineDataOptions.dialog.value.key"
    :initial="sparklineDataOptions.dialog.value.initial"
    :disabled="!sparklineToolContext || sparklineToolContext.disabled"
    :failed="sparklineDataOptions.failed.value"
    @confirm="sparklineDataOptions.dialog.value.confirm"
    @close="sparklineDataOptions.dialog.value.close"
  />
  <SparklineDialog
    v-if="sparklineDialog"
    :key="sparklineDialog.dialogId"
    :initial="sparklineDialog.initial"
    :editing="sparklineDialog.editing"
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

  &.is-dashboard {
    grid-template-rows: auto minmax(0, 1fr) 49px;
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
