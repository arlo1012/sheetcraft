import { computed, nextTick, ref, shallowRef, watch, type Ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { getSheetChartData, getSheetChartSourceData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellRange, Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import {
  chartFormatTargetKey,
  chartFormatTargetLabelKeys,
  getChartFormatSeries,
  getChartFormatTargets,
  type ChartFormatTarget,
} from "../../modules/charts/chart-format-pane";
import {
  getChartSourceApplicability,
  type ChartSourceReferenceRole,
} from "../../modules/charts/chart-source-editor";
import type ChartFormatPaneType from "../../modules/charts/components/ChartFormatPane.vue";
import { useChartActions } from "../../modules/charts/useChartActions";
import { useChartFormatControls } from "../../modules/charts/useChartFormatControls";
import { useChartObjectControls } from "../../modules/charts/useChartObjectControls";
import { useChartSourceActions } from "../../modules/charts/useChartSourceActions";
import type { MessageKey, MessageParams } from "../../shared/i18n";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";
import type { WorkspaceRuntime } from "../../shared/runtime/workspace-runtime";

type WorkspaceChartsOptions = {
  runtime?: WorkspaceRuntime;
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getSelectionRange: () => CellRange;
  getEvaluator: () => SheetEvaluator;
  getWorkbookGeneration: () => number;
  getWorkbookRevision: () => number;
  selectedChartId: Ref<string | null>;
  isBusy: () => boolean;
  flushCellEdit: () => boolean;
  flushGridOrCellEdit: () => boolean;
  executeCommand: (command: WorkbookCommand) => boolean;
  selectSheet: (sheetId: string) => void;
  selectDrawing: (drawingId: string) => void;
  openPivotFields: (id?: string) => void;
  closeCompetingFormatPanes?: () => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};

/** Owns chart insert/edit/source/object/format orchestration and chart range-reference pickers. */
export function useWorkspaceCharts(options: WorkspaceChartsOptions) {
  const chartFormatPaneVisible = ref(false);
  const chartFormatPaneRef = ref<InstanceType<typeof ChartFormatPaneType>>();
  const chartFormatTarget = shallowRef<ChartFormatTarget>({ kind: "chart" });

  options.runtime?.coordinator.registerPane("chart", () => {
    chartFormatPaneVisible.value = false;
  });

  const chartActions = useChartActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getRange: options.getSelectionRange,
    getEvaluator: options.getEvaluator,
    getGeneration: options.getWorkbookGeneration,
    getRevision: options.getWorkbookRevision,
    isBusy: options.isBusy,
    flush: options.flushCellEdit,
    execute: options.executeCommand,
    name: () => options.t("chart.tools"),
    title: () => options.t("chart.defaultTitle"),
    onInserted: options.selectDrawing,
    onEditPivot: options.openPivotFields,
  });
  const { dialog: chartDialog, editing: editingChart, error: chartError } = chartActions;

  const chartSourceActions = useChartSourceActions({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getWorkbookGeneration,
    getRevision: options.getWorkbookRevision,
    getEvaluator: options.getEvaluator,
    isBusy: () => options.isBusy() || !!chartDialog.value,
    flush: options.flushGridOrCellEdit,
    execute: options.executeCommand,
    selectSheet: options.selectSheet,
    selectDrawing: options.selectDrawing,
    selectReference: (current, role) => selectChartSourceReference(current, role),
  });
  const { dialog: chartSourceDialog, error: chartSourceError } = chartSourceActions;

  function openChartSource(drawing: SheetChartDrawing): void {
    if (getChartSourceApplicability(drawing.chart) === "editable") chartSourceActions.edit(drawing);
    else chartActions.edit(drawing);
  }

  const chartObjectControls = useChartObjectControls({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getWorkbookGeneration,
    getRevision: options.getWorkbookRevision,
    getSelectedId: () => options.selectedChartId.value,
    isBusy: () => options.isBusy() || !!chartDialog.value || !!chartSourceDialog.value,
    flush: options.flushGridOrCellEdit,
    execute: options.executeCommand,
    edit: chartActions.edit,
    source: openChartSource,
    format: openChartFormat,
    getData: (_drawing, chart) =>
      getSheetChartData(options.getActiveSheet(), chart, options.getEvaluator(), (sheetId) =>
        options.getWorkbook().sheets.get(sheetId),
      ),
    getSourceData: (_drawing, chart) =>
      getSheetChartSourceData(options.getActiveSheet(), chart, options.getEvaluator(), (sheetId) =>
        options.getWorkbook().sheets.get(sheetId),
      ),
    getAxisTitle: () => options.t("chart.axisTitlePlaceholder"),
    getChartTitle: () => options.t("chart.defaultTitle"),
  });
  const chartObjectContext = chartObjectControls.snapshot;
  const chartLayoutPreview = chartObjectControls.paintPreview;

  const chartFormatControls = useChartFormatControls({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getWorkbookGeneration,
    getRevision: options.getWorkbookRevision,
    getSelectedId: () => options.selectedChartId.value,
    getTarget: () => chartFormatTarget.value,
    getEvaluator: options.getEvaluator,
    isOpen: () => chartFormatPaneVisible.value,
    isBusy: () => options.isBusy() || !!chartDialog.value || !!chartSourceDialog.value,
    flush: options.flushGridOrCellEdit,
    execute: options.executeCommand,
  });
  const chartFormatContext = chartFormatControls.snapshot;

  const chartFormatChoices = computed(() => {
    void options.getWorkbookRevision();
    const owner = chartObjectContext.value;
    if (!owner) return [];
    const sheet = options.getActiveSheet();
    const evaluator = options.getEvaluator();
    const resolveSheet = (sheetId: string) => options.getWorkbook().sheets.get(sheetId);
    try {
      const data = getSheetChartSourceData(sheet, owner.drawing.chart, evaluator, resolveSheet);
      const visibleData = getSheetChartData(sheet, owner.drawing.chart, evaluator, resolveSheet);
      const series = getChartFormatSeries(owner.drawing.chart, data);
      const seriesNames = new Map<string, number>();
      for (const entry of series)
        seriesNames.set(entry.name, (seriesNames.get(entry.name) ?? 0) + 1);
      const hidden = new Set(owner.drawing.chart.seriesFilter?.hiddenSeriesIds);
      return getChartFormatTargets(owner.drawing.chart, data, visibleData).map((target) => ({
        target,
        label:
          target.kind === "series"
            ? options.t(
                hidden.has(target.seriesId)
                  ? "chart.formatHiddenSeriesName"
                  : "chart.formatSeriesName",
                {
                  name: (() => {
                    const index = series.findIndex((entry) => entry.id === target.seriesId);
                    const entry = series[index];
                    if (!entry) return target.seriesId;
                    return (seriesNames.get(entry.name) ?? 0) > 1
                      ? options.t("chart.formatDuplicateSeriesName", {
                          name: entry.name,
                          index: index + 1,
                        })
                      : entry.name;
                  })(),
                },
              )
            : options.t(chartFormatTargetLabelKeys[target.kind]),
      }));
    } catch {
      return [
        {
          target: { kind: "chart" } as ChartFormatTarget,
          label: options.t("chart.formatChartArea"),
        },
      ];
    }
  });

  function openChartFormat(drawing: SheetChartDrawing, target: ChartFormatTarget): void {
    if (
      drawing !== chartObjectContext.value?.drawing ||
      !options.getActiveSheet().drawings?.includes(drawing)
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
    if (options.runtime) options.runtime.coordinator.notifyPaneOpened("chart");
    else options.closeCompetingFormatPanes?.();
    chartFormatTarget.value = target;
    chartFormatPaneVisible.value = true;
  }

  function selectChartFormatElement(
    drawing: SheetChartDrawing,
    target: ChartFormatTarget,
    openPane: boolean,
  ): void {
    if (
      !options.getActiveSheet().drawings?.includes(drawing) ||
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

  const chartRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
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
        !options.isBusy() &&
        canUseSheetPermission(dialog.sheet, "editObjects");
      if (ownedPicker && canRestoreExisting()) {
        // Grid picking may clear selection; restore only this still-current edit owner.
        await nextTick();
        if (chartPickerId === picker.id && !chartPicker.value && canRestoreExisting())
          options.selectDrawing(dialog.existing!.id);
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

  return {
    chartFormatPaneVisible,
    chartFormatPaneRef,
    chartFormatTarget,
    chartActions,
    chartDialog,
    editingChart,
    chartError,
    chartSourceActions,
    chartSourceDialog,
    chartSourceError,
    openChartSource,
    chartObjectControls,
    chartObjectContext,
    chartLayoutPreview,
    chartFormatControls,
    chartFormatContext,
    chartFormatChoices,
    openChartFormat,
    selectChartFormatElement,
    chartRangePicker,
    pickingChartRange,
    pickedChartReference,
    chartPicker,
    selectChartReference,
    selectChartSourceReference,
  };
}
