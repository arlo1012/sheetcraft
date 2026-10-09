import {
  evaluateFormula,
  type FormulaEvaluationOptions,
  type FormulaEvaluationResolver,
  type FormulaValue,
} from "@sheetcraft/core/formula";

/** Exercise the public parser/evaluator with an explicit, zero-based cell grid. */
export function evaluateFormulaProbe(
  source: string,
  cells: readonly (readonly FormulaValue[])[] = [],
  options?: FormulaEvaluationOptions,
): FormulaValue {
  const resolver: FormulaEvaluationResolver = {
    resolveCell: ({ row, column }) => cells[row]?.[column] ?? null,
    resolveRange: ({ start, end }) => {
      const values: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          values.push(cells[row]?.[column] ?? null);
      return values;
    },
  };
  return evaluateFormula(source, resolver, options);
}
