import { computed, ref, watch } from "vue";
import {
  analyzeConsolidate,
  createConsolidateCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { WorkbookDomainError } from "@idea10/core/errors";
import { getActiveSheet, type CellRange, type Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type { ConsolidateDraft, ConsolidatePreview } from "./consolidate-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};

const emptyDraft = (): ConsolidateDraft => ({
  sources: [""],
  destination: "",
  function: "sum",
  topRow: false,
  leftColumn: false,
  overwrite: false,
});
const copyDraft = (draft: ConsolidateDraft): ConsolidateDraft => ({
  ...draft,
  sources: [...draft.sources],
});

/** Resolves multi-sheet range references and keeps one source/destination snapshot per dialog. */
export function useConsolidateController(options: Options) {
  const { t } = useAppI18n();
  const consolidateVisible = ref(false);
  const consolidateDraft = ref<ConsolidateDraft>(emptyDraft());
  const consolidateError = ref("");
  let target: { workbook: Workbook; generation: number; sheetId: string } | undefined;

  function resolve(draft: ConsolidateDraft) {
    if (!target) return undefined;
    const workbook = options.getWorkbook();
    const sources = draft.sources.map((source) =>
      resolveRangeReference(workbook, source, target!.sheetId),
    );
    const destination = resolveRangeReference(workbook, draft.destination, target.sheetId);
    if (sources.some((source) => !source) || !destination) return undefined;
    return {
      sources: sources as Array<{ sheetId: string; range: CellRange }>,
      destination: { sheetId: destination.sheetId, address: { ...destination.range.start } },
    };
  }

  const consolidatePreview = computed<ConsolidatePreview | undefined>(() => {
    if (!consolidateVisible.value || !target || target.workbook !== options.getWorkbook())
      return undefined;
    const ranges = resolve(consolidateDraft.value);
    if (!ranges) return undefined;
    try {
      return analyzeConsolidate(options.getWorkbook(), {
        ...ranges,
        function: consolidateDraft.value.function,
        topRow: consolidateDraft.value.topRow,
        leftColumn: consolidateDraft.value.leftColumn,
        overwrite: consolidateDraft.value.overwrite,
      });
    } catch {
      return undefined;
    }
  });

  function openConsolidate(): void {
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
    consolidateDraft.value = {
      ...emptyDraft(),
      sources: [formatRangeReference(sheet.name, range)],
    };
    consolidateError.value = "";
    consolidateVisible.value = true;
  }
  function updateConsolidateDraft(draft: ConsolidateDraft): void {
    consolidateDraft.value = {
      ...copyDraft(draft),
      sources: draft.sources.filter((source) => source !== undefined),
    };
    consolidateError.value = "";
  }
  function closeConsolidate(): void {
    consolidateVisible.value = false;
    consolidateError.value = "";
    target = undefined;
  }
  function applyConsolidate(draft: ConsolidateDraft): void {
    updateConsolidateDraft(draft);
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !options.getWorkbook().sheets.has(target.sheetId)
    ) {
      consolidateError.value = t("dataTools.consolidate.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const ranges = resolve(draft);
    if (!ranges) {
      consolidateError.value = t("dataTools.consolidate.invalidRange");
      return;
    }
    try {
      const executed = options.execute(
        createConsolidateCommand(options.getWorkbook(), {
          ...ranges,
          function: draft.function,
          topRow: draft.topRow,
          leftColumn: draft.leftColumn,
          overwrite: draft.overwrite,
        }),
      );
      if (!executed) {
        consolidateError.value = t("dataTools.consolidate.invalidOperation");
        return;
      }
      closeConsolidate();
      options.focusSheet();
    } catch (cause) {
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      consolidateError.value =
        field === "overwrite"
          ? t("dataTools.consolidate.overwriteRequired")
          : field === "protected"
            ? t("dataTools.consolidate.protectedDestination")
            : field === "merged"
              ? t("dataTools.consolidate.mergedRange")
              : field === "spill"
                ? t("dataTools.consolidate.spillRange")
                : field === "bounds"
                  ? t("dataTools.consolidate.outOfBounds")
                  : field === "size"
                    ? t("dataTools.consolidate.rangeTooLarge")
                    : field === "empty"
                      ? t("dataTools.consolidate.empty")
                      : t("dataTools.consolidate.invalidOperation");
    }
  }
  watch(options.getGeneration, closeConsolidate);
  return {
    consolidateVisible,
    consolidateDraft,
    consolidateError,
    consolidatePreview,
    openConsolidate,
    updateConsolidateDraft,
    closeConsolidate,
    applyConsolidate,
  };
}
