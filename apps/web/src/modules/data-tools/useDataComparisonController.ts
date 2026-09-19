import { computed, ref, watch } from "vue";
import {
  createExtractDataComparisonCommand,
  createMarkDataComparisonCommand,
  type DataComparisonOptions,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { WorkbookDomainError } from "@idea10/core/errors";
import { formatFormulaAddress } from "@idea10/core/formula";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { DataComparisonAction, DataComparisonDraft } from "./data-comparison-types";
import type { DataToolColumn } from "./data-tools-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};

const emptyDraft = (): DataComparisonDraft => ({
  scope: "single",
  firstRange: "",
  secondRange: "",
  comparisonMode: "cells",
  columns: [],
  hasHeader: false,
  side: "first",
  fillColor: "#ffc7ce",
});

/** Keeps both source references stable while the range picker visits other sheets. */
export function useDataComparisonController(options: Options) {
  const { t } = useAppI18n();
  const createId = createBrowserIdFactory();
  const comparisonVisible = ref(false);
  const comparisonAction = ref<DataComparisonAction>("markDuplicate");
  const comparisonDraft = ref<DataComparisonDraft>(emptyDraft());
  const comparisonError = ref("");
  let target: { workbook: Workbook; generation: number; sheetId: string } | undefined;

  function resolveFirst(range: string) {
    return target ? resolveRangeReference(options.getWorkbook(), range, target.sheetId) : undefined;
  }

  const comparisonColumns = computed<DataToolColumn[]>(() => {
    if (!comparisonVisible.value) return [];
    const source = resolveFirst(comparisonDraft.value.firstRange);
    if (!source) return [];
    const evaluator = comparisonDraft.value.hasHeader
      ? createWorkbookEvaluator(options.getWorkbook(), source.sheetId)
      : undefined;
    return Array.from(
      { length: source.range.end.column - source.range.start.column + 1 },
      (_, offset) => {
        const address = { row: source.range.start.row, column: source.range.start.column + offset };
        const value = evaluator?.getComputedValue(address);
        return {
          column: offset,
          label: formatFormulaAddress({ row: 0, column: address.column }).replace(/1$/, ""),
          ...(value == null || typeof value === "object" ? {} : { header: String(value) }),
        };
      },
    );
  });

  function openComparison(action: DataComparisonAction): void {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    const selection = options.getSelection().range;
    const range = {
      start: {
        row: Math.min(selection.start.row, selection.end.row),
        column: Math.min(selection.start.column, selection.end.column),
      },
      end: {
        row: Math.max(selection.start.row, selection.end.row),
        column: Math.max(selection.start.column, selection.end.column),
      },
    };
    target = { workbook, generation: options.getGeneration(), sheetId: sheet.id };
    comparisonAction.value = action;
    comparisonDraft.value = {
      ...emptyDraft(),
      firstRange: formatRangeReference(sheet.name, range),
      columns: Array.from(
        { length: range.end.column - range.start.column + 1 },
        (_, index) => index,
      ),
    };
    comparisonError.value = "";
    comparisonVisible.value = true;
  }

  function updateComparisonDraft(draft: DataComparisonDraft): void {
    const previous = resolveFirst(comparisonDraft.value.firstRange);
    const source = resolveFirst(draft.firstRange);
    const changedColumns =
      source &&
      (previous?.sheetId !== source.sheetId ||
        previous.range.start.column !== source.range.start.column ||
        previous.range.end.column !== source.range.end.column);
    comparisonDraft.value = {
      ...draft,
      columns: changedColumns
        ? Array.from(
            { length: source.range.end.column - source.range.start.column + 1 },
            (_, i) => i,
          )
        : [...draft.columns],
    };
    comparisonError.value = "";
  }

  function closeComparison(): void {
    comparisonVisible.value = false;
    comparisonError.value = "";
    target = undefined;
  }

  function applyComparison(draft: DataComparisonDraft): void {
    comparisonDraft.value = { ...draft, columns: [...draft.columns] };
    comparisonError.value = "";
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !options.getWorkbook().sheets.has(target.sheetId)
    ) {
      comparisonError.value = t("dataTools.comparison.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const source = resolveRangeReference(workbook, draft.firstRange, target.sheetId);
    const comparison =
      draft.scope === "double"
        ? resolveRangeReference(workbook, draft.secondRange, target.sheetId)
        : undefined;
    if (!source || (draft.scope === "double" && !comparison)) {
      comparisonError.value = t("dataTools.comparison.invalidRange");
      return;
    }
    const compareOptions: DataComparisonOptions = {
      source,
      ...(comparison ? { comparison } : {}),
      mode: draft.comparisonMode,
      columns: [...draft.columns],
      hasHeader: draft.hasHeader,
      match: comparisonAction.value.endsWith("Duplicate") ? "duplicate" : "unique",
      side: comparison ? draft.side : "first",
    };
    try {
      const command = comparisonAction.value.startsWith("mark")
        ? createMarkDataComparisonCommand(workbook, compareOptions, draft.fillColor)
        : createExtractDataComparisonCommand(workbook, compareOptions, {
            idFactory: createId,
            sheetName: t("dataTools.comparison.resultSheetName"),
            valueLabel: t("dataTools.comparison.valueHeader"),
          });
      options.execute(command);
      closeComparison();
      options.focusSheet();
    } catch (cause) {
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      comparisonError.value =
        field === "empty"
          ? t("dataTools.comparison.empty")
          : field === "columns"
            ? t("dataTools.comparison.invalidColumns")
            : field === "merged"
              ? t("dataTools.comparison.mergedRange")
              : field === "spill"
                ? t("dataTools.comparison.spillRange")
                : field === "protected" ||
                    (cause instanceof WorkbookDomainError && cause.data.code === "sheet_protected")
                  ? t("dataTools.comparison.protectedRange")
                  : field === "size"
                    ? t("dataTools.comparison.rangeTooLarge")
                    : field === "sourceRange" || field === "comparisonRange" || field === "range"
                      ? t("dataTools.comparison.invalidRange")
                      : t("dataTools.comparison.invalidOperation");
    }
  }

  watch(options.getGeneration, closeComparison);
  return {
    comparisonVisible,
    comparisonAction,
    comparisonDraft,
    comparisonError,
    comparisonColumns,
    openComparison,
    updateComparisonDraft,
    closeComparison,
    applyComparison,
  };
}
