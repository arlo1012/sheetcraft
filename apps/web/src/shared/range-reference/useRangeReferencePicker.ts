import { computed, onBeforeUnmount, ref } from "vue";
import type { CellRange } from "@idea10/core/workbook";
import type { FormulaReferenceEditor } from "../formula-editing/formula-editor-contract";
import { getFormulaReferenceTokens } from "../formula-editing/formula-reference-tokens";
import { formatRangeReference } from "./formatRangeReference";

export type RangeReferenceSelectionOptions = { singleCell?: boolean };

/** An independent reference draft: grid picking never changes the cell edit session. */
export function useRangeReferencePicker(
  getSheetName: () => string,
  options: RangeReferenceSelectionOptions = {},
) {
  const active = ref(false);
  const reference = ref("");
  const tokens = computed(() => getFormulaReferenceTokens(reference.value));
  let resolveSelection: ((value: string | undefined) => void) | undefined;
  let singleCell = options.singleCell === true;

  function finish(value?: string): void {
    active.value = false;
    resolveSelection?.(value);
    resolveSelection = undefined;
  }

  function selectReference(
    current: string,
    selectionOptions: RangeReferenceSelectionOptions = options,
  ): Promise<string | undefined> {
    finish();
    singleCell = selectionOptions.singleCell === true;
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
      if (singleCell) range = { start: range.start, end: range.start };
      reference.value = formatRangeReference(getSheetName(), {
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
