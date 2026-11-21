import { computed, nextTick, ref } from "vue";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  findShapeGroupNode,
  isShapeGroupDrawing,
  isSheetGroupedEquationDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { normalizeSheetDrawing, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import {
  createEquationPreset,
  createEquationTemplate,
  type EquationPresetId,
  type EquationSymbolInsertion,
} from "../../modules/sheet-drawings/equation/equation-catalog";
import type { EquationDraftAction } from "../../modules/sheet-drawings/equation/equation-draft";
import {
  useEquationEditSession,
  type EquationRootEditSource,
} from "../../modules/sheet-drawings/equation/useEquationEditSession";

type WorkspaceEquationEditingOptions = {
  getWorkbook: () => Workbook;
  getActiveSheet: () => Sheet;
  getWorkbookGeneration: () => number;
  getWorkbookRevision: () => number;
  getActiveAddress: () => CellAddress;
  getMetrics: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  executeCommand: (command: WorkbookCommand) => boolean;
  getEquationName: () => string;
  closeCompetingDrawingsAndPanes: () => void;
  editGroupLeafDrawing: (root: ShapeGroupDrawing, path: ShapeGroupPath) => boolean;
};

/** Owns equation edit session lifecycle, owned-group equation opening, preset/template/symbol insertion, and matrix slot lookup. */
export function useWorkspaceEquationEditing(options: WorkspaceEquationEditingOptions) {
  const equationPlaceholdersHidden = ref(false);
  let equationOpenRequest = 0;

  const equationEdit = useEquationEditSession({
    getWorkbook: options.getWorkbook,
    getSheet: options.getActiveSheet,
    getGeneration: options.getWorkbookGeneration,
    getRevision: options.getWorkbookRevision,
    getAddress: options.getActiveAddress,
    getMetrics: options.getMetrics,
    isBusy: options.isBusy,
    flush: options.flush,
    execute: options.executeCommand,
    name: options.getEquationName,
    openInserted: (source) => beginPreparedEquation(++equationOpenRequest, source, undefined, true),
  });

  function cancelPendingEquationOpen(): void {
    equationOpenRequest++;
  }

  /** A completed source edit replaces all roots. Let the grid consume that revision
   * before taking its exact geometry lease, and reject any intervening owner change. */
  function beginPreparedEquation(
    request: number,
    root: SheetDrawing,
    path: ShapeGroupPath | undefined,
    afterCommit: boolean,
  ): boolean {
    const sheet = options.getActiveSheet(),
      workbook = options.getWorkbook(),
      generation = options.getWorkbookGeneration(),
      revision = options.getWorkbookRevision(),
      fingerprint = JSON.stringify(normalizeSheetDrawing(root));
    const open = () => {
      try {
        if (
          request !== equationOpenRequest ||
          options.getActiveSheet() !== sheet ||
          options.getWorkbook() !== workbook ||
          options.getWorkbookGeneration() !== generation ||
          options.getWorkbookRevision() !== revision ||
          !sheet.drawings?.includes(root) ||
          JSON.stringify(normalizeSheetDrawing(root)) !== fingerprint
        )
          return false;
        const opened = path
          ? isShapeGroupDrawing(root) && equationEdit.beginOwned(root, path)
          : root.kind === "equation" && equationEdit.begin(root);
        if (!opened) return false;
        options.closeCompetingDrawingsAndPanes();
        return true;
      } catch {
        return false;
      }
    };
    if (afterCommit) {
      void nextTick(open);
      return true;
    }
    return open();
  }

  function beginEquationEdit(drawing: EquationRootEditSource): boolean {
    const request = ++equationOpenRequest,
      sheet = options.getActiveSheet(),
      workbook = options.getWorkbook(),
      generation = options.getWorkbookGeneration(),
      revision = options.getWorkbookRevision();
    if (!sheet.drawings?.includes(drawing)) return false;
    const fingerprint = JSON.stringify(normalizeSheetDrawing(drawing));
    const current = equationEdit.snapshot.value;
    if (current && current.source !== drawing && !equationEdit.callbacks.value?.commit())
      return false;
    // Finishing a sibling normalizes the full collection and replaces untouched root instances too.
    const target = sheet.drawings?.find((root) => root.id === drawing.id);
    if (
      options.getActiveSheet() !== sheet ||
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
      target?.kind !== "equation" ||
      JSON.stringify(normalizeSheetDrawing(target)) !== fingerprint
    )
      return false;
    return beginPreparedEquation(
      request,
      target,
      undefined,
      options.getWorkbookRevision() !== revision,
    );
  }

  function editOwnedDrawing(root: ShapeGroupDrawing, path: ShapeGroupPath): boolean {
    const request = ++equationOpenRequest;
    const node = findShapeGroupNode(root, path)?.node;
    if (!isSheetGroupedEquationDrawing(node)) return options.editGroupLeafDrawing(root, path);
    const sheet = options.getActiveSheet(),
      workbook = options.getWorkbook(),
      generation = options.getWorkbookGeneration(),
      revision = options.getWorkbookRevision(),
      fingerprint = JSON.stringify(node);
    if (!sheet.drawings?.includes(root)) return false;
    const current = equationEdit.snapshot.value;
    if (
      current &&
      (current.root !== root || current.source !== node) &&
      !equationEdit.callbacks.value?.commit()
    )
      return false;
    // Finishing another mathematical leaf may replace this same outer owner.
    const owner = sheet.drawings?.find((drawing) => drawing.id === root.id);
    if (
      options.getActiveSheet() !== sheet ||
      options.getWorkbook() !== workbook ||
      options.getWorkbookGeneration() !== generation ||
      !isShapeGroupDrawing(owner) ||
      JSON.stringify(findShapeGroupNode(owner, path)?.node) !== fingerprint
    )
      return false;
    return beginPreparedEquation(
      request,
      owner,
      [...path],
      options.getWorkbookRevision() !== revision,
    );
  }

  const equationInsertHandler = computed(() => {
    const workbook = options.getWorkbook(),
      sheet = options.getActiveSheet(),
      generation = options.getWorkbookGeneration(),
      revision = options.getWorkbookRevision();
    return (preset: EquationPresetId | null): boolean => {
      if (
        options.getWorkbook() !== workbook ||
        options.getActiveSheet() !== sheet ||
        options.getWorkbookGeneration() !== generation ||
        options.getWorkbookRevision() !== revision
      )
        return false;
      if (equationEdit.snapshot.value && !equationEdit.callbacks.value?.commit()) return false;
      const textDocument = preset
        ? createEquationPreset(preset, equationEdit.createId)
        : {
            kind: "equation-document-v1" as const,
            body: { kind: "sequence" as const, id: equationEdit.createId(), children: [] },
          };
      return equationEdit.insert(textDocument);
    };
  });

  const equationMatrixCell = computed(() => {
    const state = equationEdit.snapshot.value,
      node = equationEdit.selectedStructure.value;
    if (!state?.draft || node?.kind !== "matrix") return { row: 0, column: 0 };
    for (let row = 0; row < node.rows.length; row++)
      for (let column = 0; column < node.rows[row]!.length; column++) {
        if (node.rows[row]![column]!.id === state.draft.selection.slotId) return { row, column };
      }
    return { row: 0, column: 0 };
  });

  function insertEquationTemplate(id: string): boolean {
    const state = equationEdit.snapshot.value;
    if (!state?.draft || state.mode !== "structured") return false;
    try {
      return (
        equationEdit.callbacks.value?.action({
          type: "insert-nodes",
          selection: state.draft.selection,
          nodes: [createEquationTemplate(id, equationEdit.createId)],
        }) === true
      );
    } catch {
      return false;
    }
  }

  function insertEquationSymbol(payload: EquationSymbolInsertion): boolean {
    const state = equationEdit.snapshot.value;
    if (!state?.draft || state.mode !== "structured") return false;
    return (
      equationEdit.callbacks.value?.action({
        type: "insert-nodes",
        selection: state.draft.selection,
        nodes: [{ kind: payload.kind, id: equationEdit.createId(), value: payload.value }],
      }) === true
    );
  }

  function insertEquationNormalText(): boolean {
    return equationEdit.callbacks.value?.toggleNormalText() === true;
  }

  function editEquationMathOption(action: EquationDraftAction): boolean {
    return equationEdit.callbacks.value?.action(action) === true;
  }

  return {
    equationEdit,
    equationPlaceholdersHidden,
    cancelPendingEquationOpen,
    beginEquationEdit,
    editOwnedDrawing,
    equationInsertHandler,
    equationMatrixCell,
    insertEquationTemplate,
    insertEquationSymbol,
    insertEquationNormalText,
    editEquationMathOption,
  };
}
