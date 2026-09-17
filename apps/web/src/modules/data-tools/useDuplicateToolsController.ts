import { ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createClearSheetDuplicateRulesCommand,
  createCountDuplicateValuesCommand,
  createSetSheetDuplicateRulesCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { WorkbookDomainError } from "@idea10/core/errors";
import {
  getActiveSheet,
  MAX_SHEET_COLUMNS,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
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
  hasHeader: false,
  fillColor: "#ffc7ce",
  destination: "",
  overwrite: false,
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
    if (sheet.properties.protected) return;
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
    const destination = { row: range.start.row, column: range.end.column + 1 };
    target = { workbook, generation: options.getGeneration(), sheetId: sheet.id };
    duplicateValuesMode.value = mode;
    duplicateValuesDraft.value = {
      ...emptyDraft(),
      range: formatRangeReference(sheet.name, range),
      destination:
        destination.column < MAX_SHEET_COLUMNS
          ? formatRangeReference(sheet.name, { start: destination, end: destination })
          : "",
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
    if (!source || (draft.hasHeader && source.range.start.row === source.range.end.row)) {
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
        if (source.range.start.column !== source.range.end.column) {
          duplicateValuesError.value = t("dataTools.duplicates.oneColumn");
          return;
        }
        const destination = resolveRangeReference(workbook, draft.destination, target.sheetId);
        if (
          !destination ||
          destination.range.start.row !== destination.range.end.row ||
          destination.range.start.column !== destination.range.end.column
        ) {
          duplicateValuesError.value = t("dataTools.duplicates.invalidDestination");
          return;
        }
        if (workbook.sheets.get(destination.sheetId)?.properties.protected) {
          duplicateValuesError.value = t("dataTools.duplicates.protectedRange");
          return;
        }
        options.execute(
          createCountDuplicateValuesCommand(
            source.sheetId,
            source.range,
            {
              sheetId: destination.sheetId,
              address: destination.range.start,
            },
            {
              hasHeader: draft.hasHeader,
              overwrite: draft.overwrite,
              headerLabel: t("dataTools.duplicates.countHeader"),
            },
          ),
        );
      } else {
        const range = {
          start: {
            row: source.range.start.row + (draft.hasHeader ? 1 : 0),
            column: source.range.start.column,
          },
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
        field === "duplicate"
          ? t("dataTools.duplicates.duplicateRejected")
          : field === "overwrite"
            ? t("dataTools.duplicates.overwriteRequired")
            : field === "destination"
              ? t("dataTools.duplicates.invalidDestination")
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
