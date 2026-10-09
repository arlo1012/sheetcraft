import type { CellAddress, CellRange } from "@sheetcraft/core/workbook";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import type { CellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";

export function useFormulaReferenceNavigation(options: {
  session: CellEditSession;
  getEditor: () => FormulaReferenceEditor | null;
  getActiveAddress: () => CellAddress;
  getVisibleRow: (row: number, direction: -1 | 1) => number | null;
  getVisibleColumn?: (column: number, direction: -1 | 1) => number | null;
  ensureVisible: (address: CellAddress) => void;
}) {
  function handleReferenceKeydown(event: KeyboardEvent): boolean {
    const { state } = options.session;
    if (!state.active || state.composing || event.isComposing || !state.draft.startsWith("="))
      return false;
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    if (event.key === "F2") {
      options.session.setMode(state.mode === "edit" ? "point" : "edit");
      event.preventDefault();
      return true;
    }
    if (state.mode !== "point") return false;
    const delta = {
      ArrowUp: { rows: -1, columns: 0 },
      ArrowDown: { rows: 1, columns: 0 },
      ArrowLeft: { rows: 0, columns: -1 },
      ArrowRight: { rows: 0, columns: 1 },
    }[event.key];
    if (!delta) return false;
    const editor = options.getEditor();
    if (!editor?.canPickReference()) return false;
    const token = editor.references.find(
      (reference) =>
        state.selection.start >= reference.start && state.selection.end <= reference.end,
    );
    const previous = editor.referenceActive ? editor.referenceRange : (token?.range ?? null);
    const source = previous?.end ?? options.getActiveAddress();
    const destination: CellAddress = {
      row: delta.rows
        ? (options.getVisibleRow(source.row, delta.rows > 0 ? 1 : -1) ?? source.row)
        : source.row,
      column:
        delta.columns && options.getVisibleColumn
          ? (options.getVisibleColumn(source.column, delta.columns > 0 ? 1 : -1) ?? source.column)
          : Math.max(0, Math.min(MAX_SHEET_COLUMNS - 1, source.column + delta.columns)),
    };
    destination.row = Math.max(0, Math.min(MAX_SHEET_ROWS - 1, destination.row));
    const range: CellRange = {
      start: { ...(event.shiftKey ? (previous?.start ?? source) : destination) },
      end: destination,
    };
    if (!editor.pickReference(range, "start")) return false;
    options.ensureVisible(destination);
    event.preventDefault();
    return true;
  }

  return { handleReferenceKeydown };
}
