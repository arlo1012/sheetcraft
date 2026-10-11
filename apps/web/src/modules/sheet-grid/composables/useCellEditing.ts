import { computed, nextTick, ref } from "vue";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { CellContent } from "@sheetcraft/core/formula";
import type { CellSelection } from "@sheetcraft/sheet-engine/selection";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import { isCellEditSessionTarget } from "../../../shared/cell-editing/cell-edit-focus";
import {
  useCellEditSession,
  type CellEditSession,
  type CellEditFinishOptions,
  type CellEditCommit,
} from "../../../shared/cell-editing/useCellEditSession";

export type CellEditorHandle = {
  focus: (options?: {
    selectAll?: boolean;
    clientX?: number;
    selection?: { start: number; end: number; direction: "none" | "forward" | "backward" };
  }) => void;
  insertLineBreak: () => void;
  formulaReferenceEditor: FormulaReferenceEditor | null;
};

export function useCellEditing(options: {
  session?: CellEditSession;
  getSheetId?: () => string;
  getActiveCell: () => CellAddress;
  getInputValue: () => string;
  getContent?: () => CellContent | null;
  getAsText?: () => boolean;
  onClearClipboard: () => void;
  onCommit: (payload: CellEditCommit) => void;
  onSelectionChange: (selection: CellSelection) => void;
}) {
  const editorRef = ref<CellEditorHandle | null>(null);
  const editSession =
    options.session ??
    useCellEditSession({
      onCommit: (payload) => options.onCommit(payload),
    });
  const isEditing = computed(
    () => editSession.state.active && editSession.state.owner?.sheetId === options.getSheetId?.(),
  );
  const isComposing = computed(() => isEditing.value && editSession.state.composing);
  const editingAddress = computed(() =>
    isEditing.value ? editSession.state.owner?.address : undefined,
  );
  const editingValue = computed({
    get: () => (isEditing.value ? editSession.state.draft : ""),
    set: (value: string) => editSession.setDraft(value),
  });
  let compositionStartValue = "";
  let wasEditingBeforeComposition = false;
  let shouldFinishAfterComposition = false;
  let pendingSelectionAfterComposition: CellSelection | undefined;

  function context() {
    const sheetId = options.getSheetId?.();
    return {
      address: { ...options.getActiveCell() },
      input: options.getInputValue(),
      content: options.getContent?.(),
      asText: options.getAsText?.(),
      ...(sheetId === undefined ? {} : { sheetId }),
    };
  }

  function focusEditor(selectAll = false, clientX?: number): void {
    void nextTick(() =>
      editorRef.value?.focus({
        selectAll,
        clientX,
        ...(isEditing.value && clientX === undefined
          ? { selection: editSession.state.selection }
          : {}),
      }),
    );
  }

  function deferSelectionWhileComposing(selection: CellSelection): boolean {
    if (!isComposing.value) return false;
    pendingSelectionAfterComposition = selection;
    shouldFinishAfterComposition = true;
    return true;
  }

  function beginEdit(mode: "append" | "replace", initialValue = "", clientX?: number): void {
    if (!editSession.begin(context(), { surface: "grid", mode, initialValue })) return;
    focusEditor(false, clientX);
  }

  function clearDeferredComposition(): void {
    wasEditingBeforeComposition = false;
    shouldFinishAfterComposition = false;
    pendingSelectionAfterComposition = undefined;
  }

  function finishEdit(
    destination?: CellSelection,
    restoreFocus = true,
    finishOptions: CellEditFinishOptions = {},
  ): boolean {
    if (isEditing.value) {
      if (isComposing.value) {
        shouldFinishAfterComposition = true;
        pendingSelectionAfterComposition = destination;
        return false;
      }
      options.onClearClipboard();
      if (!editSession.finish(finishOptions)) {
        if (restoreFocus) focusEditor();
        return false;
      }
    }
    clearDeferredComposition();
    if (destination) options.onSelectionChange(destination);
    else if (restoreFocus) focusEditor();
    return true;
  }

  function cancelEdit(restoreFocus = true): void {
    if (isEditing.value) editSession.cancel();
    clearDeferredComposition();
    if (restoreFocus) focusEditor();
  }

  function onInput(value: string): void {
    if (
      !isEditing.value &&
      !editSession.begin(context(), {
        surface: "grid",
        mode: "replace",
        initialValue: value,
      })
    )
      return;
    editSession.activateSurface("grid");
    editSession.setDraft(value);
  }

  function onCompositionStart(): void {
    compositionStartValue = editingValue.value;
    wasEditingBeforeComposition = isEditing.value;
    shouldFinishAfterComposition = false;
    pendingSelectionAfterComposition = undefined;
    if (
      !isEditing.value &&
      !editSession.begin(context(), {
        surface: "grid",
        mode: "replace",
        initialValue: "",
      })
    )
      return;
    editSession.activateSurface("grid");
    editSession.startComposition();
  }

  function onCompositionEnd(value: string, event: CompositionEvent): void {
    const preserveExisting = wasEditingBeforeComposition;
    wasEditingBeforeComposition = false;
    editSession.endComposition(value);
    if (event.data === "" && value === compositionStartValue && !preserveExisting) {
      const destination = pendingSelectionAfterComposition;
      const restoreFocus = !shouldFinishAfterComposition;
      cancelEdit(restoreFocus);
      if (destination) options.onSelectionChange(destination);
      return;
    }
    if (shouldFinishAfterComposition)
      finishEdit(pendingSelectionAfterComposition, !pendingSelectionAfterComposition);
  }

  function onBlur(event?: FocusEvent): void {
    if (!isEditing.value) return;
    const next = event?.relatedTarget;
    if (isCellEditSessionTarget(next ?? null, editSession.id)) return;
    if (isComposing.value) {
      shouldFinishAfterComposition = true;
      return;
    }
    finishEdit(undefined, false);
  }

  return {
    beginEdit,
    cancelEdit,
    deferSelectionWhileComposing,
    editSession,
    editingValue,
    editingAddress,
    editorRef,
    finishEdit,
    focusEditor,
    isComposing,
    isEditing,
    onBlur,
    onCompositionEnd,
    onCompositionStart,
    onInput,
  };
}
