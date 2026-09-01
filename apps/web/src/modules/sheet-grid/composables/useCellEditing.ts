import { nextTick, ref } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { CellSelection } from "@idea10/sheet-engine/selection";

export type CellEditorHandle = {
  focus: (options?: { selectAll?: boolean; clientX?: number }) => void;
  insertLineBreak: () => void;
};

export function useCellEditing(options: {
  getActiveCell: () => CellAddress;
  getInputValue: () => string;
  onClearClipboard: () => void;
  onCommit: (payload: { address: CellAddress; input: string }) => void;
  onSelectionChange: (selection: CellSelection) => void;
}) {
  const editorRef = ref<CellEditorHandle | null>(null);
  const editingValue = ref("");
  const isEditing = ref(false);
  const isComposing = ref(false);
  let compositionStartValue = "";
  let wasEditingBeforeComposition = false;
  let shouldFinishAfterComposition = false;
  let pendingSelectionAfterComposition: CellSelection | undefined;

  function focusEditor(selectAll = false, clientX?: number): void {
    void nextTick(() => editorRef.value?.focus({ selectAll, clientX }));
  }

  function deferSelectionWhileComposing(selection: CellSelection): boolean {
    if (!isComposing.value) {
      return false;
    }
    pendingSelectionAfterComposition = selection;
    shouldFinishAfterComposition = true;
    return true;
  }

  function beginEdit(mode: "append" | "replace", initialValue = "", clientX?: number): void {
    editingValue.value = mode === "append" ? options.getInputValue() : initialValue;
    isEditing.value = true;
    focusEditor(false, clientX);
  }

  function finishEdit(destination?: CellSelection, restoreFocus = true): void {
    if (isEditing.value) {
      options.onClearClipboard();
      options.onCommit({
        address: { ...options.getActiveCell() },
        input: editingValue.value,
      });
    }
    isEditing.value = false;
    isComposing.value = false;
    wasEditingBeforeComposition = false;
    shouldFinishAfterComposition = false;
    pendingSelectionAfterComposition = undefined;
    editingValue.value = "";
    if (destination) {
      options.onSelectionChange(destination);
    } else if (restoreFocus) {
      focusEditor();
    }
  }

  function cancelEdit(restoreFocus = true): void {
    isEditing.value = false;
    isComposing.value = false;
    wasEditingBeforeComposition = false;
    shouldFinishAfterComposition = false;
    pendingSelectionAfterComposition = undefined;
    editingValue.value = "";
    if (restoreFocus) {
      focusEditor();
    }
  }

  function onInput(value: string): void {
    if (!isEditing.value) {
      isEditing.value = true;
    }
    editingValue.value = value;
  }

  function onCompositionStart(): void {
    compositionStartValue = editingValue.value;
    wasEditingBeforeComposition = isEditing.value;
    shouldFinishAfterComposition = false;
    pendingSelectionAfterComposition = undefined;
    if (!isEditing.value) {
      editingValue.value = "";
      isEditing.value = true;
    }
    isComposing.value = true;
  }

  function onCompositionEnd(value: string, event: CompositionEvent): void {
    isComposing.value = false;
    const shouldPreserveExistingEdit = wasEditingBeforeComposition;
    wasEditingBeforeComposition = false;
    if (event.data === "" && value === compositionStartValue) {
      if (shouldPreserveExistingEdit) {
        editingValue.value = compositionStartValue;
        if (shouldFinishAfterComposition) {
          finishEdit(pendingSelectionAfterComposition, !pendingSelectionAfterComposition);
        } else {
          shouldFinishAfterComposition = false;
          pendingSelectionAfterComposition = undefined;
        }
        return;
      }
      const destination = pendingSelectionAfterComposition;
      const restoreFocus = !shouldFinishAfterComposition;
      cancelEdit(restoreFocus);
      if (destination) {
        options.onSelectionChange(destination);
      }
      return;
    }
    if (isEditing.value) {
      editingValue.value = value;
    }
    if (shouldFinishAfterComposition) {
      finishEdit(pendingSelectionAfterComposition, !pendingSelectionAfterComposition);
    }
  }

  function onBlur(): void {
    if (!isEditing.value) {
      return;
    }
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
    editingValue,
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
