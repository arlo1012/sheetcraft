import { nextTick, ref, shallowRef, watch } from "vue";
import type { CellFormatChange } from "@sheetcraft/core/commands";
import { cloneConditionalFormatRule } from "@sheetcraft/core/conditional-formatting";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { CellFormatTab } from "../../modules/cell-format/components/CellFormatDialog.vue";
import type { ConditionalFormatQuickRule } from "../../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import type {
  ConditionalFormatManagerSheet,
  ConditionalFormatSheetChange,
} from "../../modules/conditional-formatting/conditional-format-manager-types";
import { getConditionalFormatPreset } from "../../modules/conditional-formatting/conditional-format-presets";
import {
  createConditionalFormatRuleId,
  formatConditionalFormatRanges,
} from "../../modules/conditional-formatting/conditional-formatting-ui";
import type { useCellEditSession } from "../../shared/cell-editing/useCellEditSession";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";
import type {
  CellFormatSelection,
  ConditionalFormattingSelection,
} from "./useSpreadsheetWorkspaceController";

type CellEditSession = ReturnType<typeof useCellEditSession>;
type ConditionalFormatRules = ConditionalFormattingSelection["rules"];

type WorkspaceCellFormattingOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getSheets: () => readonly Sheet[];
  getWorkbookGeneration: () => number;
  isBusy: () => boolean;
  cellEditSession: CellEditSession;
  selectSheet: (sheetId: string) => void;
  focusCellEditor: () => void;
  captureCellFormatSelection: () => CellFormatSelection | undefined;
  applyCellFormat: (change: CellFormatChange, target: CellFormatSelection) => void;
  captureConditionalFormattingSelection: () => ConditionalFormattingSelection | undefined;
  setConditionalFormats: (
    rules: ConditionalFormatRules,
    target: ConditionalFormattingSelection,
  ) => boolean;
  setConditionalFormatsForSheets: (
    changes: ConditionalFormatSheetChange[],
    generation: number,
  ) => boolean;
  clearConditionalFormats: (scope: "selection" | "sheet") => void;
};

/** Owns the cell format dialog and conditional formatting manager / range pickers. */
export function useWorkspaceCellFormatting(options: WorkspaceCellFormattingOptions) {
  const cellFormatSelection = shallowRef<CellFormatSelection>();
  const cellFormatInitialTab = ref<CellFormatTab>("border");
  const conditionalFormattingSelection = shallowRef<ConditionalFormattingSelection>();
  const conditionalFormattingSheets = shallowRef<readonly ConditionalFormatManagerSheet[]>([]);
  const conditionalFormatQuickRule = ref<ConditionalFormatQuickRule>();
  const conditionalFormatRangePicker = useRangeReferencePicker(() => options.getActiveSheet().name);
  const conditionalFormatPickingValue = ref(false);
  const { active: pickingConditionalFormatRange, reference: pickedConditionalFormatReference } =
    conditionalFormatRangePicker;

  watch(options.getWorkbookGeneration, () => {
    cellFormatSelection.value = undefined;
    conditionalFormattingSelection.value = undefined;
    conditionalFormattingSheets.value = [];
    conditionalFormatRangePicker.cancel();
  });

  function openCellFormat(tab: CellFormatTab = "border"): void {
    if (options.isBusy() || !options.cellEditSession.finish()) return;
    cellFormatInitialTab.value = tab;
    cellFormatSelection.value = options.captureCellFormatSelection();
  }

  function closeCellFormat(): void {
    cellFormatSelection.value = undefined;
    void nextTick(options.focusCellEditor);
  }

  function confirmCellFormat(change: CellFormatChange): void {
    const target = cellFormatSelection.value;
    if (!target) return;
    options.applyCellFormat(change, target);
    closeCellFormat();
  }

  function openConditionalFormatting(kind?: ConditionalFormatQuickRule): void {
    if (options.isBusy() || !options.cellEditSession.finish()) return;
    const target = options.captureConditionalFormattingSelection();
    if (!target) return;
    const preset = kind ? getConditionalFormatPreset(kind) : undefined;
    if (preset) {
      options.setConditionalFormats(
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
      void nextTick(options.focusCellEditor);
      return;
    }
    conditionalFormatQuickRule.value = kind;
    conditionalFormattingSelection.value = target;
    conditionalFormattingSheets.value = options.getSheets().map((sheet) => ({
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
    void nextTick(options.focusCellEditor);
  }

  async function selectConditionalFormatReference(
    current: string,
    requestedSheetId?: string,
  ): Promise<string | undefined> {
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const previousSheetId = options.getActiveSheet().id;
    const sheetId =
      requestedSheetId ?? conditionalFormattingSelection.value?.sheetId ?? previousSheetId;
    if (!workbook.sheets.has(sheetId)) return undefined;
    if (sheetId !== previousSheetId) options.selectSheet(sheetId);
    let selected: string | undefined;
    try {
      selected = await conditionalFormatRangePicker.selectReference(current);
    } finally {
      if (
        options.getWorkbook() === workbook &&
        options.getWorkbookGeneration() === generation &&
        options.getActiveSheet().id !== previousSheetId &&
        workbook.sheets.has(previousSheetId)
      ) {
        options.selectSheet(previousSheetId);
      }
    }
    if (
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
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
    const workbook = options.getWorkbook();
    const generation = options.getWorkbookGeneration();
    const previousSheetId = options.getActiveSheet().id;
    const sheetId =
      requestedSheetId ?? conditionalFormattingSelection.value?.sheetId ?? previousSheetId;
    if (!workbook.sheets.has(sheetId)) return undefined;
    if (sheetId !== previousSheetId) options.selectSheet(sheetId);
    conditionalFormatPickingValue.value = true;
    try {
      const selected = await conditionalFormatRangePicker.selectReference(current);
      if (
        options.getWorkbook() !== workbook ||
        options.getWorkbookGeneration() !== generation ||
        !conditionalFormattingSelection.value
      )
        return undefined;
      if (selected === undefined) return undefined;
      const target = resolveRangeReference(workbook, selected, sheetId);
      if (!target) return undefined;
      const reference = formatRangeReference(
        workbook.sheets.get(target.sheetId)!.name,
        target.range,
      );
      return target.sheetId === sheetId
        ? `=${reference.slice(reference.lastIndexOf("!") + 1)}`
        : reference;
    } finally {
      if (
        options.getWorkbook() === workbook &&
        options.getWorkbookGeneration() === generation &&
        options.getActiveSheet().id !== previousSheetId &&
        workbook.sheets.has(previousSheetId)
      ) {
        options.selectSheet(previousSheetId);
      }
      conditionalFormatPickingValue.value = false;
    }
  }

  function saveConditionalFormats(rules: ConditionalFormatRules): void {
    const target = conditionalFormattingSelection.value;
    if (!target) return;
    if (options.setConditionalFormats(rules, target)) closeConditionalFormatting();
  }

  function saveConditionalFormatSheets(changes: ConditionalFormatSheetChange[]): void {
    const target = conditionalFormattingSelection.value;
    if (!target) return;
    if (options.setConditionalFormatsForSheets(changes, target.generation))
      closeConditionalFormatting();
  }

  function clearConditionalFormatRules(scope: "selection" | "sheet"): void {
    if (options.isBusy() || !options.cellEditSession.finish()) return;
    options.clearConditionalFormats(scope);
  }

  return {
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
  };
}
