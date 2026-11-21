import { computed, nextTick, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { getPivotTableSource } from "@sheetcraft/core/pivot-tables";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import { createThemedTableStyles, type TableStyleDefinition } from "@sheetcraft/core/table-styles";
import type {
  CellAddress,
  CellRange,
  Sheet,
  SheetEvaluator,
  SheetTable,
  Workbook,
} from "@sheetcraft/core/workbook";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useAttachmentActions } from "../../modules/attachments/useAttachmentActions";
import type { DiagramWorkspace } from "../../modules/attachments/useDiagramActions";
import { useCameraActions } from "../../modules/camera/useCameraActions";
import { useDashboardActions } from "../../modules/dashboards/useDashboardActions";
import { useFlowchartActions } from "../../modules/flowcharts/useFlowchartActions";
import { useFormControlActions } from "../../modules/form-controls/useFormControlActions";
import { useMindMapActions } from "../../modules/mind-maps/useMindMapActions";
import type PivotFieldsPaneType from "../../modules/pivot-tables/components/PivotFieldsPane.vue";
import { getPivotActiveField } from "../../modules/pivot-tables/pivot-active-field";
import type { PivotArea } from "../../modules/pivot-tables/pivot-field-edits";
import { usePivotActions } from "../../modules/pivot-tables/usePivotActions";
import { usePivotGrouping } from "../../modules/pivot-tables/usePivotGrouping";
import { useTableSlicers } from "../../modules/slicers/useTableSlicers";
import { useSparklineActions } from "../../modules/sparklines/useSparklineActions";
import { useSparklineAxisLimit } from "../../modules/sparklines/useSparklineAxisLimit";
import { useSparklineDataOptions } from "../../modules/sparklines/useSparklineDataOptions";
import { useSparklineDateAxis } from "../../modules/sparklines/useSparklineDateAxis";
import { useSparklineTools } from "../../modules/sparklines/useSparklineTools";
import type { MessageKey, MessageParams } from "../../shared/i18n";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";

type WorkspacePivotAndObjectsOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getActiveAddress: () => CellAddress;
  getSelectionRange: () => CellRange;
  getEvaluator: () => SheetEvaluator;
  getActiveTable: () => SheetTable | undefined;
  customPivotTableStyles: ComputedRef<readonly TableStyleDefinition[]>;
  getSelectedShapeObjectPaths: () => readonly ShapeGroupPath[];
  workbookGeneration: Ref<number>;
  workbookRevision: Ref<number>;
  isBusy: () => boolean;
  flushCellEdit: () => boolean;
  executeCommand: (command: WorkbookCommand) => boolean;
  selectSheet: (sheetId: string) => void;
  navigateToCell: (address: CellAddress) => void;
  selectDrawing: (id: string) => void;
  selectShapeObjects: (paths: readonly ShapeGroupPath[]) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};

/** Owns pivot tables, table slicers, form controls, attachments, diagrams, camera, sparklines, and dashboards. */
export function useWorkspacePivotAndObjects(options: WorkspacePivotAndObjectsOptions) {
  const { t, workbookGeneration, workbookRevision } = options;

  const pivotActions = usePivotActions({
    getWorkbook: options.getWorkbook,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getSheet: options.getActiveSheet,
    getRange: options.getSelectionRange,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
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
      const workbook = options.getWorkbook();
      const generation = workbookGeneration.value;
      options.selectSheet(sheetId);
      void nextTick(() => {
        const sheet = options.getActiveSheet();
        if (
          options.getWorkbook() !== workbook ||
          workbookGeneration.value !== generation ||
          sheet.id !== sheetId ||
          !sheet.pivotTables?.includes(table)
        )
          return;
        options.navigateToCell(table.anchor);
        pivotFieldsVisible.value = true;
      });
    },
    activateDetails: (sheetId) => {
      options.selectSheet(sheetId);
      void nextTick(() => options.navigateToCell({ row: 0, column: 0 }));
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
  const pivotFieldsPaneRef = shallowRef<InstanceType<typeof PivotFieldsPaneType>>();
  const pivotStyles = computed(() => [
    ...createThemedTableStyles(),
    ...options.customPivotTableStyles.value,
  ]);
  const pivotDisabled = computed(
    () => options.isBusy() || !canUseSheetPermission(options.getActiveSheet(), "pivotTables"),
  );
  const pivotActiveField = computed<{ area: PivotArea; index: number; name: string } | undefined>(
    () => {
      const table = activePivot.value;
      if (!table) return undefined;
      let headers: string[] = [];
      try {
        headers = getPivotTableSource(options.getWorkbook(), table).headers;
      } catch {
        return undefined;
      }
      return getPivotActiveField(table, headers, options.getActiveAddress());
    },
  );
  const pivotGroupField = computed(() => {
    const table = activePivot.value,
      field = pivotActiveField.value;
    if (!table || !field || (field.area !== "rows" && field.area !== "columns")) return undefined;
    return (field.area === "rows" ? table.rowFields : table.columnFields)[field.index];
  });
  const pivotGrouping = usePivotGrouping({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    selected: pivotActions.selected,
    getField: () => pivotGroupField.value,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    onError: () => {
      void MessagePlugin.error(t("pivot.groupFailed"));
    },
  });
  const { draft: pivotGroupingDraft } = pivotGrouping;
  watch(workbookGeneration, pivotGrouping.close);
  watch(() => options.getActiveSheet().id, pivotGrouping.close);
  watch(
    () => activePivot.value?.id,
    (id) => {
      pivotFieldsVisible.value = !!id;
    },
  );
  function openPivotFields(id?: string): void {
    const table = pivotActions.selected(id);
    if (!table) return;
    options.navigateToCell(table.anchor);
    pivotFieldsVisible.value = true;
  }
  let pendingPivotFieldSettings: typeof pivotActiveField.value | undefined;
  let hasPendingPivotFieldSettings = false;
  watch(pivotFieldsPaneRef, (pane) => {
    if (!pane || !hasPendingPivotFieldSettings) return;
    const field = pendingPivotFieldSettings;
    pendingPivotFieldSettings = undefined;
    hasPendingPivotFieldSettings = false;
    pane.openFieldSettings(field);
  });
  function openPivotFieldSettings(): void {
    const field = pivotActiveField.value;
    pivotFieldsVisible.value = true;
    if (pivotFieldsPaneRef.value) {
      void nextTick(() => pivotFieldsPaneRef.value?.openFieldSettings(field));
      return;
    }
    pendingPivotFieldSettings = field;
    hasPendingPivotFieldSettings = true;
  }
  const pivotRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
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
    () => options.getActiveSheet().id,
    () => {
      if (!pickingPivotRange.value) pivotActions.closeOnSheetChange();
    },
    { flush: "sync" },
  );

  const tableSlicers = useTableSlicers({
    workbook: options.getWorkbook,
    sheet: options.getActiveSheet,
    table: options.getActiveTable,
    pivot: () => activePivot.value,
    address: options.getActiveAddress,
    revision: () => workbookRevision.value,
    busy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    selectDrawing: options.selectDrawing,
  });

  const controlActions = useFormControlActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getAddress: options.getActiveAddress,
    getEvaluator: options.getEvaluator,
    selectSheet: options.selectSheet,
    selectDrawing: (id) => {
      options.selectShapeObjects([[id]]);
    },
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    name: (type) => t(`control.${type}`),
  });
  const { dialog: controlDialog, editing: editingControl, error: controlError } = controlActions;
  const controlRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
  const { active: pickingControlRange, reference: pickedControlReference } = controlRangePicker;
  watch(controlDialog, () => controlRangePicker.cancel(), { flush: "sync" });

  const attachmentActions = useAttachmentActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getAddress: options.getActiveAddress,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    onError: () => {
      void MessagePlugin.error(t("attachment.failed"));
    },
  });
  const {
    viewing: viewingAttachment,
    busy: attachmentBusy,
    inserting: insertingAttachment,
  } = attachmentActions;
  watch(() => options.getActiveSheet().id, attachmentActions.close);
  watch(workbookGeneration, attachmentActions.close);

  const diagramWorkspace: DiagramWorkspace = {
    getSheets: () => options.getWorkbook().sheets.values(),
    getSheet: options.getActiveSheet,
    getAddress: options.getActiveAddress,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
  };
  const flowcharts = useFlowchartActions(diagramWorkspace);
  const mindMaps = useMindMapActions(diagramWorkspace);
  const { editor: mindMapEditor, error: mindMapError } = mindMaps;
  watch(() => options.getActiveSheet().id, mindMaps.close);
  watch(workbookGeneration, mindMaps.close);
  const { editor: flowchartEditor, error: flowchartError } = flowcharts;
  watch(() => options.getActiveSheet().id, flowcharts.close);
  watch(workbookGeneration, flowcharts.close);

  const cameraActions = useCameraActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getEvaluator: options.getEvaluator,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getRange: options.getSelectionRange,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    name: () => t("camera.title"),
  });
  const { dialog: cameraDialog, editing: editingCamera, error: cameraError } = cameraActions;
  const cameraRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
  const { active: pickingCameraRange, reference: pickedCameraReference } = cameraRangePicker;
  watch(cameraDialog, () => cameraRangePicker.cancel(), { flush: "sync" });

  const sparklineActions = useSparklineActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getRange: options.getSelectionRange,
    getGeneration: () => workbookGeneration.value,
    flush: options.flushCellEdit,
    isBusy: options.isBusy,
    execute: options.executeCommand,
    selectSheet: options.selectSheet,
  });
  const {
    dialog: sparklineDialog,
    draft: sparklineDraft,
    error: sparklineError,
    failed: sparklineFailed,
  } = sparklineActions;
  const sparklineToolContext = useSparklineTools({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getRange: options.getSelectionRange,
    getAddress: options.getActiveAddress,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    edit: (address) => sparklineActions.open(undefined, address),
  });
  const sparklineRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
  const sparklineSettings = {
    getContext: () => sparklineToolContext.value,
    flush: options.flushCellEdit,
  };
  const sparklineDataOptions = useSparklineDataOptions(sparklineSettings);
  const sparklineDates = useSparklineDateAxis({
    ...sparklineSettings,
    workbook: options.getWorkbook,
    sheet: options.getActiveSheet,
    revision: () => workbookRevision.value,
    selectSheet: options.selectSheet,
  });
  const sparklineAxisLimit = useSparklineAxisLimit(sparklineSettings);
  const { active: pickingSparklineRange, reference: pickedSparklineReference } =
    sparklineRangePicker;
  let sparklinePickerSequence = 0;
  const sparklinePicker = shallowRef<{ id: number; confirm: () => void; cancel: () => void }>();
  const selectSparklineReference = computed(() => {
    const dialog = sparklineDialog.value;
    const dates = sparklineDates.dialog.value;
    const currentOwner = () =>
      dates ? sparklineDates.dialog.value === dates : dialog?.isCurrent();
    return async (current: string): Promise<string | undefined> => {
      if (!currentOwner()) return undefined;
      const select = () => sparklineRangePicker.selectReference(current);
      const selection = dates
        ? sparklineDates.pick(select)
        : sparklineActions.pickReference(select);
      const picker = {
        id: ++sparklinePickerSequence,
        confirm: () => {
          if (sparklinePicker.value === picker && currentOwner()) sparklineRangePicker.confirm();
        },
        cancel: () => {
          if (sparklinePicker.value === picker && currentOwner()) sparklineRangePicker.cancel();
        },
      };
      sparklinePicker.value = picker;
      const result = await selection;
      if (sparklinePicker.value === picker) sparklinePicker.value = undefined;
      return currentOwner() ? result : undefined;
    };
  });
  watch(
    [sparklineDialog, sparklineDates.dialog],
    () => {
      sparklineRangePicker.cancel();
      sparklinePicker.value = undefined;
    },
    { flush: "sync" },
  );

  const selectedChartId = ref<string | null>(null);
  const selectedSlicerId = ref<string | null>(null);
  const selectedSlicer = computed(() => {
    void workbookRevision.value;
    const selectedPaths = options.getSelectedShapeObjectPaths();
    const id =
      selectedSlicerId.value ??
      (selectedPaths.length === 1 && selectedPaths[0]?.length === 1 ? selectedPaths[0][0] : null);
    if (!id) return undefined;
    const drawing = options.getActiveSheet().drawings?.find((node) => node.id === id);
    return drawing?.kind === "slicer" ? drawing : undefined;
  });
  const selectedSlicerState = computed(() => {
    const drawing = selectedSlicer.value;
    return drawing ? tableSlicers.state(options.getActiveSheet(), drawing) : undefined;
  });

  const dashboards = useDashboardActions({
    workbook: options.getWorkbook,
    sheet: options.getActiveSheet,
    range: options.getSelectionRange,
    selectSheet: options.selectSheet,
    busy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    title: () => t("dashboard.title"),
    widgetTitle: (kind) => t(`dashboard.${kind}`),
  });
  const {
    creating: creatingDashboard,
    editing: editingDashboard,
    error: dashboardError,
  } = dashboards;
  const { active: pickingDashboardRange, reference: dashboardReference } = dashboards.picker;
  watch(workbookGeneration, dashboards.close);

  return {
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
  };
}
