import {
  createFormulaError,
  formatFormulaAddress,
  parseFormula,
  type FormulaEvaluationResolver,
  type FormulaExpression,
  type FormulaValue,
} from "../../formula/index.js";
import { REGISTRY_COVERAGE_CELLS, type RegistryCoverageCase } from "./registry-coverage-cases.js";

export function coverageResolver(
  extra = new Map<string, FormulaValue>(),
): FormulaEvaluationResolver {
  const get = (row: number, column: number): FormulaValue =>
    extra.get(`${row}:${column}`) ?? REGISTRY_COVERAGE_CELLS[row]?.[column] ?? null;
  return {
    resolveCell: ({ row, column }) => get(row, column),
    resolveRange: ({ start, end }) => {
      const result: FormulaValue[] = [];
      for (let row = start.row; row <= end.row; row += 1)
        for (let column = start.column; column <= end.column; column += 1)
          result.push(get(row, column));
      return result;
    },
  };
}

function constant(expression: FormulaExpression): FormulaValue | undefined {
  if (["number", "string", "boolean"].includes(expression.kind) && "value" in expression)
    return expression.value;
  if (expression.kind === "error") return createFormulaError(expression.code);
  if (expression.kind === "unary" && expression.operand.kind === "number")
    return expression.operand.value * (expression.operator === "-" ? -1 : 1);
  return undefined;
}

/** Replaces constants with typed cells, preserving independent expected outputs. */
export function referencedCoverageCase(scenario: RegistryCoverageCase): {
  formula: string;
  cells: Map<string, FormulaValue>;
} {
  const parsed = parseFormula(scenario.formula);
  if (!parsed.ok) throw new Error(`Invalid independent case for ${scenario.name}`);
  const cells = new Map<string, FormulaValue>();
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  let block = 0;
  function visit(argument: FormulaExpression): void {
    if (argument.kind === "array") {
      const rows = argument.rows.map((row) => row.map(constant));
      if (rows.flat().includes(undefined)) return;
      const start = { row: block++ * 10, column: 30 };
      for (const [rowIndex, row] of rows.entries())
        for (const [columnIndex, value] of row.entries())
          cells.set(`${start.row + rowIndex}:${start.column + columnIndex}`, value!);
      const end = { row: start.row + rows.length - 1, column: start.column + rows[0]!.length - 1 };
      replacements.push({
        start: argument.start,
        end: argument.end,
        text: `${formatFormulaAddress(start)}:${formatFormulaAddress(end)}`,
      });
      return;
    }
    const value = constant(argument);
    if (value !== undefined) {
      const row = block++ * 10;
      cells.set(`${row}:30`, value);
      replacements.push({ start: argument.start, end: argument.end, text: `$AE$${row + 1}` });
    } else if (argument.kind === "function") argument.args.forEach(visit);
    else if (argument.kind === "unary") visit(argument.operand);
    else if (argument.kind === "binary") {
      visit(argument.left);
      visit(argument.right);
    }
  }
  visit(parsed.ast.expression);
  let formula = scenario.formula;
  for (const replacement of replacements.sort((left, right) => right.start - left.start))
    formula = `${formula.slice(0, replacement.start)}${replacement.text}${formula.slice(replacement.end)}`;
  return { formula, cells };
}
