import { computed, ref, watch } from "vue";
import {
  analyzeLookupFill,
  createLookupFillCommand,
  type LookupFillOptions,
  type LookupFillPreview,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  type CellRange,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { formatFormulaAddress } from "@sheetcraft/core/formula";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type { DataToolColumn } from "./data-tools-types";
import type { LookupFillDraft } from "./lookup-fill-types";
type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};
const empty = (): LookupFillDraft => ({
  sourceRange: "",
  targetRange: "",
  hasHeader: true,
  matchFields: [],
  fillFields: [],
  matchMode: "first",
  overwrite: false,
});
export function useLookupFillController(options: Options) {
  const { t } = useAppI18n();
  const lookupFillVisible = ref(false),
    lookupFillDraft = ref<LookupFillDraft>(empty()),
    lookupFillError = ref(""),
    lookupFillPreview = ref<LookupFillPreview>();
  let target: { workbook: Workbook; generation: number; sheetId: string } | undefined;
  const resolve = (value: string) =>
    target ? resolveRangeReference(options.getWorkbook(), value, target.sheetId) : undefined;
  const columns = (which: "source" | "target") =>
    computed<DataToolColumn[]>(() => {
      const selected = resolve(
        which === "source" ? lookupFillDraft.value.sourceRange : lookupFillDraft.value.targetRange,
      );
      if (!selected) return [];
      const evaluator = lookupFillDraft.value.hasHeader
        ? createWorkbookEvaluator(options.getWorkbook(), selected.sheetId)
        : undefined;
      return Array.from(
        { length: selected.range.end.column - selected.range.start.column + 1 },
        (_, column) => {
          const address = {
            row: selected.range.start.row,
            column: selected.range.start.column + column,
          };
          const value = evaluator?.getComputedValue(address);
          return {
            column,
            label: formatFormulaAddress({ row: 0, column: address.column }).replace(/1$/, ""),
            ...(value == null || typeof value === "object" ? {} : { header: String(value) }),
          };
        },
      );
    });
  const sourceColumns = columns("source"),
    targetColumns = columns("target");
  function openLookupFill() {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook(),
      sheet = getActiveSheet(workbook),
      range = options.getSelection().range;
    const normal = {
      start: {
        row: Math.min(range.start.row, range.end.row),
        column: Math.min(range.start.column, range.end.column),
      },
      end: {
        row: Math.max(range.start.row, range.end.row),
        column: Math.max(range.start.column, range.end.column),
      },
    };
    target = { workbook, generation: options.getGeneration(), sheetId: sheet.id };
    lookupFillDraft.value = { ...empty(), targetRange: formatRangeReference(sheet.name, normal) };
    lookupFillError.value = "";
    lookupFillPreview.value = undefined;
    lookupFillVisible.value = true;
  }
  function updateLookupFillDraft(draft: LookupFillDraft) {
    lookupFillDraft.value = {
      ...draft,
      matchFields: draft.matchFields.map((field) => ({ ...field })),
      fillFields: draft.fillFields.map((field) => ({ ...field })),
    };
    lookupFillError.value = "";
    updatePreview();
  }
  function toOptions(draft: LookupFillDraft): LookupFillOptions | undefined {
    const source = resolve(draft.sourceRange),
      targetRange = resolve(draft.targetRange);
    return source && targetRange
      ? {
          source,
          target: targetRange,
          hasHeader: draft.hasHeader,
          matchFields: draft.matchFields,
          fillFields: draft.fillFields,
          matchMode: draft.matchMode,
          overwrite: draft.overwrite,
        }
      : undefined;
  }
  function formatLookupFillError(cause: unknown): string {
    const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
    return field === "protected"
      ? t("dataTools.lookupFill.protectedRange")
      : field === "merged"
        ? t("dataTools.lookupFill.mergedRange")
        : field === "spill"
          ? t("dataTools.lookupFill.spillRange")
          : field === "size"
            ? t("dataTools.lookupFill.rangeTooLarge")
            : field === "matchFields" || field === "fillFields"
              ? t("dataTools.lookupFill.invalidFields")
              : t("dataTools.lookupFill.invalidOperation");
  }
  function updatePreview() {
    const payload = toOptions(lookupFillDraft.value);
    if (!payload || !payload.matchFields.length || !payload.fillFields.length) {
      lookupFillPreview.value = undefined;
      return;
    }
    try {
      lookupFillPreview.value = analyzeLookupFill(options.getWorkbook(), payload);
      lookupFillError.value = "";
    } catch (cause) {
      lookupFillPreview.value = undefined;
      lookupFillError.value = formatLookupFillError(cause);
    }
  }
  function closeLookupFill() {
    lookupFillVisible.value = false;
    lookupFillError.value = "";
    lookupFillPreview.value = undefined;
    target = undefined;
  }
  function applyLookupFill(draft: LookupFillDraft) {
    updateLookupFillDraft(draft);
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !options.getWorkbook().sheets.has(target.sheetId)
    ) {
      lookupFillError.value = t("dataTools.lookupFill.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const payload = toOptions(draft);
    if (!payload) {
      lookupFillError.value = t("dataTools.lookupFill.invalidRange");
      return;
    }
    if (lookupFillPreview.value?.writeCount === 0) {
      lookupFillError.value = t("dataTools.lookupFill.noChanges");
      return;
    }
    try {
      if (!options.execute(createLookupFillCommand(options.getWorkbook(), payload))) {
        lookupFillError.value = t("dataTools.lookupFill.executeFailed");
        return;
      }
      closeLookupFill();
      options.focusSheet();
    } catch (cause) {
      lookupFillError.value = formatLookupFillError(cause);
    }
  }
  watch(options.getGeneration, closeLookupFill);
  return {
    lookupFillVisible,
    lookupFillDraft,
    lookupFillError,
    lookupFillPreview,
    sourceColumns,
    targetColumns,
    openLookupFill,
    closeLookupFill,
    updateLookupFillDraft,
    applyLookupFill,
  };
}
