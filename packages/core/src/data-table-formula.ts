import type { FormulaExpression, FormulaReference } from "./formula/types.js";

/** The persisted, internal root formula used for What-If Data Table result cells. */
export const SIMULATION_TABLE_FUNCTION = "SIMTABLE";

export type SimulationTableFormula = Readonly<{
  formula: FormulaReference;
  rowInput?: FormulaReference;
  rowValue?: FormulaReference;
  columnInput?: FormulaReference;
  columnValue?: FormulaReference;
}>;

export function isSimulationTableRoot(
  expression: FormulaExpression,
): expression is Extract<FormulaExpression, { kind: "function" }> {
  return (
    expression.kind === "function" && expression.name.toUpperCase() === SIMULATION_TABLE_FUNCTION
  );
}

function reference(expression: FormulaExpression | undefined): FormulaReference | undefined {
  return expression?.kind === "reference" ? expression.reference : undefined;
}

/**
 * Accepts only the exact internal root form. It deliberately is not registered
 * as a worksheet function: Workbook evaluation owns its shadow state.
 */
export function parseSimulationTableFormula(
  expression: FormulaExpression,
): SimulationTableFormula | null {
  if (!isSimulationTableRoot(expression)) return null;
  if (expression.args.length !== 3 && expression.args.length !== 5) return null;
  const formula = reference(expression.args[0]);
  const rowInput = reference(expression.args[1]);
  const rowValue = reference(expression.args[2]);
  if (!formula || !rowInput || !rowValue) return null;
  if (expression.args.length === 3) return { formula, rowInput, rowValue };
  const columnInput = reference(expression.args[3]);
  const columnValue = reference(expression.args[4]);
  return columnInput && columnValue
    ? { formula, rowInput, rowValue, columnInput, columnValue }
    : null;
}
