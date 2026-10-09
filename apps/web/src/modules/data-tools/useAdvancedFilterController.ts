import { ref, watch } from "vue";
import { createAdvancedFilterCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { resolveDataRange } from "@sheetcraft/core/data-range";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { getActiveSheet, type CellRange, type Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type { AdvancedFilterDraft } from "./data-tools-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};

const emptyDraft = (): AdvancedFilterDraft => ({
  mode: "inPlace",
  listRange: "",
  criteriaRange: "",
  destination: "",
  uniqueOnly: false,
  overwrite: false,
});

/** The dialog owns a stable source context while its reference picker can visit other sheets. */
export function useAdvancedFilterController(options: Options) {
  const { t } = useAppI18n();
  const advancedFilterVisible = ref(false);
  const advancedFilterDraft = ref<AdvancedFilterDraft>(emptyDraft());
  const advancedFilterError = ref("");
  let target: { workbook: Workbook; generation: number; sheetId: string } | undefined;

  function openAdvancedFilter(): void {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    if (sheet.properties.protected) return;
    const range = sheet.filter?.range ?? resolveDataRange(sheet, options.getSelection().range);
    const criteria = sheet.filter?.advanced?.criteria;
    const criteriaSheet = criteria ? workbook.sheets.get(criteria.sheetId) : undefined;
    target = { workbook, generation: options.getGeneration(), sheetId: sheet.id };
    advancedFilterDraft.value = {
      ...emptyDraft(),
      listRange: formatRangeReference(sheet.name, range),
      criteriaRange:
        criteria && criteriaSheet ? formatRangeReference(criteriaSheet.name, criteria.range) : "",
      uniqueOnly: sheet.filter?.advanced?.uniqueOnly ?? false,
    };
    advancedFilterError.value = "";
    advancedFilterVisible.value = true;
  }

  function updateAdvancedFilterDraft(draft: AdvancedFilterDraft): void {
    advancedFilterDraft.value = { ...draft };
    advancedFilterError.value = "";
  }

  function closeAdvancedFilter(): void {
    advancedFilterVisible.value = false;
    advancedFilterError.value = "";
    target = undefined;
  }

  function applyAdvancedFilter(draft: AdvancedFilterDraft): void {
    updateAdvancedFilterDraft(draft);
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !options.getWorkbook().sheets.has(target.sheetId)
    ) {
      advancedFilterError.value = t("dataTools.advanced.staleTarget");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const list = resolveRangeReference(workbook, draft.listRange, target.sheetId);
    if (!list || list.range.end.row <= list.range.start.row) {
      advancedFilterError.value = t("dataTools.advanced.invalidList");
      return;
    }
    const criteria = draft.criteriaRange.trim()
      ? resolveRangeReference(workbook, draft.criteriaRange, target.sheetId)
      : undefined;
    if (
      draft.criteriaRange.trim() &&
      (!criteria || criteria.range.end.row <= criteria.range.start.row)
    ) {
      advancedFilterError.value = t("dataTools.advanced.invalidCriteria");
      return;
    }
    const destination =
      draft.mode === "copy"
        ? resolveRangeReference(workbook, draft.destination, target.sheetId)
        : undefined;
    if (draft.mode === "copy" && !destination) {
      advancedFilterError.value = t("dataTools.advanced.invalidDestination");
      return;
    }
    const changedSheet = workbook.sheets.get(destination?.sheetId ?? list.sheetId);
    if (changedSheet?.properties.protected) {
      advancedFilterError.value = t("dataTools.advanced.protectedDestination");
      return;
    }
    try {
      options.execute(
        createAdvancedFilterCommand(list.sheetId, list.range, {
          mode: draft.mode,
          ...(criteria ? { criteria } : {}),
          ...(destination
            ? { destination: { sheetId: destination.sheetId, address: destination.range.start } }
            : {}),
          uniqueOnly: draft.uniqueOnly,
          overwrite: draft.mode === "copy" && draft.overwrite,
        }),
      );
      closeAdvancedFilter();
      options.focusSheet();
    } catch (cause) {
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      advancedFilterError.value =
        field === "overwrite"
          ? t("dataTools.advanced.overwriteRequired")
          : field === "headers"
            ? t("dataTools.advanced.invalidHeaders")
            : field === "listRange"
              ? t("dataTools.advanced.invalidList")
              : field === "criteria"
                ? t("dataTools.advanced.invalidCriteria")
                : field === "destination"
                  ? t("dataTools.advanced.invalidDestination")
                  : t("dataTools.advanced.invalidOperation");
    }
  }

  watch(options.getGeneration, closeAdvancedFilter);

  return {
    advancedFilterVisible,
    advancedFilterDraft,
    advancedFilterError,
    openAdvancedFilter,
    updateAdvancedFilterDraft,
    closeAdvancedFilter,
    applyAdvancedFilter,
  };
}
