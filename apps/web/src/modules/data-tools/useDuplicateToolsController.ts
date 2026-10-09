import { ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createClearSheetDuplicateRulesCommand,
  createCountDuplicateValuesCommand,
  createSetSheetDuplicateRulesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { getActiveSheet, type CellRange, type Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type { DuplicateToolDraft, DuplicateToolMode } from "./duplicate-tools-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};

const emptyDraft = (): DuplicateToolDraft => ({
  range: "",
  fillColor: "#ffc7ce",
});

/** Selection-owned duplicate operations; reference picking may visit another sheet. */
export function useDuplicateToolsController(options: Options) {
  const { t } = useAppI18n();
  const createId = createBrowserIdFactory();
  const duplicateValuesVisible = ref(false);
  const duplicateValuesMode = ref<DuplicateToolMode>("highlight");
  const duplicateValuesDraft = ref<DuplicateToolDraft>(emptyDraft());
  const duplicateValuesError = ref("");
  let target: { workbook: Workbook; generation: number; sheetId: string } | undefined;

  function openDuplicateValues(mode: DuplicateToolMode): void {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    if (mode !== "count" && sheet.properties.protected) return;
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
    duplicateValuesMode.value = mode;
    duplicateValuesDraft.value = {
      ...emptyDraft(),
      range: formatRangeReference(sheet.name, range),
    };
    duplicateValuesError.value = "";
    duplicateValuesVisible.value = true;
  }

  function updateDuplicateValuesDraft(draft: DuplicateToolDraft): void {
    duplicateValuesDraft.value = { ...draft };
    duplicateValuesError.value = "";
  }

  function closeDuplicateValues(): void {
    duplicateValuesVisible.value = false;
    duplicateValuesError.value = "";
    target = undefined;
  }

  function applyDuplicateValues(draft: DuplicateToolDraft): void {
    updateDuplicateValuesDraft(draft);
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !options.getWorkbook().sheets.has(target.sheetId)
    ) {
      duplicateValuesError.value = t("dataTools.duplicates.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const source = resolveRangeReference(workbook, draft.range, target.sheetId);
    if (!source) {
      duplicateValuesError.value = t("dataTools.duplicates.invalidRange");
      return;
    }
    const sourceSheet = workbook.sheets.get(source.sheetId)!;
    const mode = duplicateValuesMode.value;
    if (mode !== "count" && sourceSheet.properties.protected) {
      duplicateValuesError.value = t("dataTools.duplicates.protectedRange");
      return;
    }
    try {
      if (mode === "count") {
        options.execute(
          createCountDuplicateValuesCommand(workbook, source.sheetId, source.range, {
            idFactory: createId,
            sheetName: t("dataTools.duplicates.countSheetName"),
            valueLabel: t("dataTools.duplicates.valueHeader"),
            countLabel: t("dataTools.duplicates.countHeader"),
          }),
        );
      } else {
        const range = {
          start: { ...source.range.start },
          end: { ...source.range.end },
        };
        const existing = sourceSheet.duplicateRules ?? [];
        // Reapplying the same operation replaces its exact rule instead of stacking duplicates.
        const same = (rule: (typeof existing)[number]) =>
          rule.kind === mode &&
          rule.range.start.row === range.start.row &&
          rule.range.start.column === range.start.column &&
          rule.range.end.row === range.end.row &&
          rule.range.end.column === range.end.column;
        const previous = existing.find(same);
        options.execute(
          createSetSheetDuplicateRulesCommand(source.sheetId, [
            ...existing.filter((rule) => !same(rule)),
            {
              id: previous?.id ?? createId("duplicate"),
              kind: mode,
              range,
              ...(mode === "highlight" ? { fillColor: draft.fillColor } : {}),
            },
          ]),
        );
      }
      closeDuplicateValues();
      options.focusSheet();
    } catch (cause) {
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      duplicateValuesError.value =
        field === "empty"
          ? t("dataTools.duplicates.empty")
          : field === "sourceRange"
            ? t("dataTools.duplicates.invalidRange")
            : t("dataTools.duplicates.invalidOperation");
    }
  }

  function clear(kind: "highlight" | "reject"): void {
    if (options.isBusy() || !options.flush()) return;
    const sheet = getActiveSheet(options.getWorkbook());
    if (sheet.properties.protected) return;
    try {
      options.execute(
        createClearSheetDuplicateRulesCommand(sheet.id, kind, options.getSelection().range),
      );
      options.focusSheet();
    } catch {
      void MessagePlugin.warning(t("dataTools.duplicates.invalidOperation"));
    }
  }

  watch(options.getGeneration, closeDuplicateValues);
  return {
    duplicateValuesVisible,
    duplicateValuesMode,
    duplicateValuesDraft,
    duplicateValuesError,
    openDuplicateValues,
    updateDuplicateValuesDraft,
    applyDuplicateValues,
    closeDuplicateValues,
    clearDuplicateHighlights: () => clear("highlight"),
    clearDuplicateRejections: () => clear("reject"),
  };
}
