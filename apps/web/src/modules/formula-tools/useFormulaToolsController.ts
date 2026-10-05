import { canEditCell } from "@idea10/core";
import { computed, nextTick, ref } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createDefinedNamesFromSelectionCommand,
  createDeleteDefinedNameCommand,
  createSetWorkbookCalculationCommand,
  createUpsertDefinedNameCommand,
  type DefinedNameLabelPosition,
  type DefinedNameDraft,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { findAutoSumRange, formatFormulaAddress } from "@idea10/core/formula";
import { formatCellContentForInput } from "@idea10/core/input";
import {
  getActiveSheet,
  getCellContent,
  type CellAddress,
  type CellRange,
  type SheetEvaluator,
  type WorkbookCalculationSettings,
  type Workbook,
} from "@idea10/core/workbook";
import { getNamedRangeValue } from "./named-range-values";
import type { CellEditSession } from "../../shared/cell-editing/useCellEditSession";
import { useAppI18n } from "../../shared/i18n";
import { insertFormulaFunction } from "../../shared/formula-editing/formula-function-insertion";
import { formatRangeReference } from "../../shared/range-reference/formatRangeReference";

export type AggregateFunction = "SUM" | "AVERAGE" | "COUNT" | "MAX" | "MIN";

/** Formula-tools alias for the shared range formatter. */
export const formatNamedRangeReference = formatRangeReference;

/** Formula tools share the editor draft and the workspace's command/history port. */
export function useFormulaToolsController(options: {
  getWorkbook: () => Workbook;
  getSelection: () => { address: CellAddress; range: CellRange };
  getSheetEvaluator: () => SheetEvaluator;
  editSession: CellEditSession;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  focusFormulaBar: () => void;
  recalculate: () => void;
}) {
  const { t } = useAppI18n();
  const namesVisible = ref(false);
  const recentFunctions = ref<string[]>([]);
  const nameSelectionReference = ref("");
  const session = options.editSession;
  const editTargetSheet = computed(() => {
    const workbook = options.getWorkbook();
    return workbook.sheets.get(session.state.owner?.sheetId ?? workbook.activeSheetId)!;
  });
  const disabled = computed(
    () =>
      options.isBusy() ||
      session.state.composing ||
      !canEditCell(
        editTargetSheet.value,
        session.state.owner?.address ?? options.getSelection().address,
      ),
  );
  const namedRanges = computed(() => {
    const workbook = options.getWorkbook();
    const evaluator = namesVisible.value ? options.getSheetEvaluator() : undefined;
    return [...workbook.definedNames.values()].map((definition) => ({
      ...getNamedRangeValue(
        workbook.sheets.get(definition.reference.sheetId),
        definition.reference,
        workbook.sheets.has(definition.reference.sheetId)
          ? (evaluator?.forSheet?.(definition.reference.sheetId) ??
              (definition.reference.sheetId === workbook.activeSheetId ? evaluator : undefined))
          : undefined,
      ),
      comment: definition.comment,
      kind: "defined" as const,
      id: definition.id,
      name: definition.name,
      scopeSheetId: definition.scopeSheetId,
      reference: workbook.sheets.has(definition.reference.sheetId)
        ? formatRangeReference(
            workbook.sheets.get(definition.reference.sheetId)!.name,
            definition.reference,
          )
        : "=#REF!",
    }));
  });
  const calculationSettings = computed(() => options.getWorkbook().calculation);

  function rememberFunction(name: string): void {
    recentFunctions.value = [name, ...recentFunctions.value.filter((item) => item !== name)].slice(
      0,
      12,
    );
  }

  function focusFormulaBar(): void {
    void nextTick(options.focusFormulaBar);
  }

  function startDraft(value: string, caret = value.length): boolean {
    const sheet = getActiveSheet(options.getWorkbook());
    const { address } = options.getSelection();
    if (
      !session.begin(
        {
          sheetId: sheet.id,
          address,
          input: formatCellContentForInput(getCellContent(sheet, address)),
        },
        { surface: "formula-bar", mode: "replace", initialValue: value },
      )
    )
      return false;
    session.setDraft(value);
    session.setSelection(caret, caret);
    session.activateSurface("formula-bar");
    session.setMode("point");
    focusFormulaBar();
    return true;
  }

  function insertFunction(name: string): void {
    if (disabled.value) return;
    if (
      !session.state.active ||
      (session.state.draft === session.state.source && !session.state.draft.startsWith("="))
    ) {
      if (startDraft(`=${name}(`)) rememberFunction(name);
      return;
    }
    const edit = insertFormulaFunction(session.state.draft, session.state.selection, name);
    if (!edit) {
      void MessagePlugin.warning(t("workspace.formulaInsertionUnavailable"));
      focusFormulaBar();
      return;
    }
    session.setDraft(edit.value);
    session.setSelection(edit.caret, edit.caret);
    session.activateSurface("formula-bar");
    session.setMode("point");
    rememberFunction(name);
    focusFormulaBar();
  }

  function aggregate(name: AggregateFunction): void {
    if (disabled.value) return;
    if (session.state.active && session.state.draft.startsWith("=")) {
      insertFunction(name);
      return;
    }
    if (session.state.active && session.state.draft !== session.state.source) {
      void MessagePlugin.warning(t("workspace.formulaInsertionUnavailable"));
      return;
    }
    const range = findAutoSumRange(
      options.getSelection().address,
      options.getSheetEvaluator().getComputedValue,
    );
    const formula = range
      ? `=${name}(${formatFormulaAddress(range.start)}:${formatFormulaAddress(range.end)})`
      : `=${name}(`;
    if (startDraft(formula, range ? formula.length - 1 : formula.length)) rememberFunction(name);
  }

  function captureNameSelection(): void {
    nameSelectionReference.value = formatRangeReference(
      getActiveSheet(options.getWorkbook()).name,
      options.getSelection().range,
    );
  }

  function openNames(): void {
    if (disabled.value) return;
    captureNameSelection();
    namesVisible.value = true;
  }

  function closeNames(): void {
    namesVisible.value = false;
    focusFormulaBar();
  }

  function saveName(draft: DefinedNameDraft, onSaved?: (id: string) => void): void {
    try {
      const command = createUpsertDefinedNameCommand(options.getWorkbook(), draft);
      if (!options.execute(command)) return;
      void MessagePlugin.success(t("workspace.nameSaved", { name: draft.name }));
      onSaved?.(command.definition.id);
    } catch {
      void MessagePlugin.warning(t("workspace.nameInvalid"));
    }
  }

  function deleteName(id: string): void {
    if (options.execute(createDeleteDefinedNameCommand(options.getWorkbook(), id))) {
      void MessagePlugin.success(t("workspace.nameDeleted"));
    }
  }

  function createNamesFromSelection(positions: readonly DefinedNameLabelPosition[]): void {
    try {
      const workbook = options.getWorkbook();
      const command = createDefinedNamesFromSelectionCommand(workbook, {
        sheetId: getActiveSheet(workbook).id,
        range: options.getSelection().range,
        positions,
        evaluator: options.getSheetEvaluator(),
      });
      if (options.execute(command)) {
        void MessagePlugin.success(
          t("formulaTools.namesCreated", { count: command.changes.length }),
        );
      }
    } catch {
      void MessagePlugin.warning(t("formulaTools.namesNotCreated"));
    }
  }

  function updateCalculationSettings(settings: WorkbookCalculationSettings): void {
    try {
      options.execute(createSetWorkbookCalculationCommand(options.getWorkbook(), settings));
    } catch {
      // Core rejects invalid calculation settings; leave the visible workbook state unchanged.
    }
  }

  function recalculate(): void {
    if (options.isBusy() || session.state.composing) return;
    options.recalculate();
    focusFormulaBar();
    void MessagePlugin.success(t("workspace.recalculated"));
  }

  return {
    disabled,
    editTargetSheet,
    recentFunctions,
    namesVisible,
    namedRanges,
    calculationSettings,
    nameSelectionReference,
    insertFunction,
    aggregate,
    focusFormulaBar,
    openNames,
    closeNames,
    captureNameSelection,
    saveName,
    deleteName,
    createNamesFromSelection,
    updateCalculationSettings,
    recalculate,
  };
}
