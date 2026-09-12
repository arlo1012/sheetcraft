import { computed, onBeforeUnmount, ref } from "vue";
import type { CellRange } from "@idea10/core/workbook";
import type { FormulaReferenceEditor } from "../../shared/formula-editing/formula-editor-contract";
import { getFormulaReferenceTokens } from "../../shared/formula-editing/formula-reference-tokens";
import { formatNamedRangeReference } from "./useFormulaToolsController";

/** An independent reference draft: grid picking never changes the cell edit session. */
export function useNamedRangePicker(getSheetName: () => string) {
  const active = ref(false);
  const reference = ref("");
  const tokens = computed(() => getFormulaReferenceTokens(reference.value));
  let resolveSelection: ((value: string | undefined) => void) | undefined;

  function finish(value?: string): void {
    active.value = false;
    resolveSelection?.(value);
    resolveSelection = undefined;
  }

  function selectReference(current: string): Promise<string | undefined> {
    finish();
    reference.value = current;
    active.value = true;
    return new Promise((resolve) => {
      resolveSelection = resolve;
    });
  }

  const editor: FormulaReferenceEditor = {
    canPickReference: () => active.value,
    pickReference(range: CellRange) {
      if (!active.value) return false;
      reference.value = formatNamedRangeReference(getSheetName(), {
        start: {
          row: Math.min(range.start.row, range.end.row),
          column: Math.min(range.start.column, range.end.column),
        },
        end: {
          row: Math.max(range.start.row, range.end.row),
          column: Math.max(range.start.column, range.end.column),
        },
      });
      return true;
    },
    get referenceRange() {
      return tokens.value[0]?.range ?? null;
    },
    get referenceActive() {
      return active.value;
    },
    get references() {
      return tokens.value;
    },
    get editingFormula() {
      return active.value;
    },
  };

  function confirm(): void {
    finish(reference.value);
  }
  function cancel(): void {
    finish();
  }
  onBeforeUnmount(cancel);
  return { active, reference, editor, selectReference, confirm, cancel };
}
