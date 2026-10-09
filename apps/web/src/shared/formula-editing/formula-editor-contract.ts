import type { CellRange } from "@sheetcraft/core/workbook";
import type { FormulaReferenceRangeKind, FormulaReferenceToken } from "./formula-reference-tokens";

export type FormulaReferencePickPhase = "start" | "update" | "end";

/**
 * The small interaction boundary shared by the in-cell editor and formula
 * bar. It intentionally describes only text editing, not workbook mutation.
 */
export type FormulaReferenceEditor = {
  canPickReference: () => boolean;
  pickReference: (
    range: CellRange,
    phase: FormulaReferencePickPhase,
    rangeKind?: Exclude<FormulaReferenceRangeKind, "spill">,
  ) => boolean;
  readonly referenceRange: CellRange | null;
  readonly referenceActive: boolean;
  readonly references: readonly FormulaReferenceToken[];
  readonly editingFormula: boolean;
};
