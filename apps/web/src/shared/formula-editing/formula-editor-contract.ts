import type { CellRange } from "@idea10/core/workbook";
import type { FormulaReferenceToken } from "./formula-reference-tokens";

export type FormulaReferencePickPhase = "start" | "update" | "end";

/**
 * The small interaction boundary shared by the in-cell editor and formula
 * bar. It intentionally describes only text editing, not workbook mutation.
 */
export type FormulaReferenceEditor = {
  canPickReference: () => boolean;
  pickReference: (range: CellRange, phase: FormulaReferencePickPhase) => boolean;
  readonly referenceRange: CellRange | null;
  readonly referenceActive: boolean;
  readonly references: readonly FormulaReferenceToken[];
  readonly editingFormula: boolean;
};
