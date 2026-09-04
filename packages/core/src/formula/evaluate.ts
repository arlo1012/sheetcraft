import { parseFormula } from "./parser.js";
import {
  createFormulaError,
  isFormulaError,
  type FormulaAst,
  type FormulaEvaluationResolver,
  type FormulaExpression,
  type FormulaRange,
  type FormulaValue,
} from "./types.js";

function isFiniteNumber(value: FormulaValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateValue(value: FormulaValue): FormulaValue {
  return typeof value === "number" && !Number.isFinite(value) ? createFormulaError("VALUE") : value;
}

function coerceArithmetic(value: FormulaValue): number | ReturnType<typeof createFormulaError> {
  const validated = validateValue(value);
  if (isFormulaError(validated)) return validated;
  if (validated === null) return 0;
  return isFiniteNumber(validated) ? validated : createFormulaError("VALUE");
}

function addFiniteNumber(
  total: number,
  value: number,
): number | ReturnType<typeof createFormulaError> {
  const nextTotal = total + value;
  return Number.isFinite(nextTotal) ? nextTotal : createFormulaError("VALUE");
}

function normalizeRangeBounds(range: FormulaRange) {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function addRangeValues(range: FormulaRange, resolver: FormulaEvaluationResolver): FormulaValue {
  let total = 0;
  for (const rangeValue of resolver.resolveRange(normalizeRangeBounds(range))) {
    const value = validateValue(rangeValue);
    if (isFormulaError(value)) return value;
    if (!isFiniteNumber(value)) continue;
    const nextTotal = addFiniteNumber(total, value);
    if (isFormulaError(nextTotal)) return nextTotal;
    total = nextTotal;
  }
  return total;
}

function evaluateExpression(
  expression: FormulaExpression,
  resolver: FormulaEvaluationResolver,
): FormulaValue {
  if (expression.kind === "number") return validateValue(expression.value);
  if (expression.kind === "reference") {
    return validateValue(
      resolver.resolveCell({ row: expression.reference.row, column: expression.reference.column }),
    );
  }
  if (expression.kind === "range") return createFormulaError("VALUE");
  if (expression.kind === "error") return createFormulaError(expression.code);
  if (expression.kind === "identifier") return createFormulaError("NAME");
  if (expression.kind === "unary") {
    const operand = coerceArithmetic(evaluateExpression(expression.operand, resolver));
    if (isFormulaError(operand)) return operand;
    const result = expression.operator === "-" ? -operand : operand;
    return Number.isFinite(result) ? result : createFormulaError("VALUE");
  }
  if (expression.kind === "binary") {
    const left = coerceArithmetic(evaluateExpression(expression.left, resolver));
    if (isFormulaError(left)) return left;
    const right = coerceArithmetic(evaluateExpression(expression.right, resolver));
    if (isFormulaError(right)) return right;
    if (expression.operator === "+") {
      const result = left + right;
      return Number.isFinite(result) ? result : createFormulaError("VALUE");
    }
    if (expression.operator === "-") {
      const result = left - right;
      return Number.isFinite(result) ? result : createFormulaError("VALUE");
    }
    if (expression.operator === "*") {
      const result = left * right;
      return Number.isFinite(result) ? result : createFormulaError("VALUE");
    }
    if (right === 0) return createFormulaError("DIV0");
    const result = left / right;
    return Number.isFinite(result) ? result : createFormulaError("VALUE");
  }

  if (expression.name.toUpperCase() !== "SUM") return createFormulaError("NAME");
  let total = 0;
  for (const argument of expression.args) {
    if (argument.kind === "range") {
      const rangeTotal = addRangeValues(argument.range, resolver);
      if (isFormulaError(rangeTotal)) return rangeTotal;
      if (!isFiniteNumber(rangeTotal)) return createFormulaError("VALUE");
      const nextTotal = addFiniteNumber(total, rangeTotal);
      if (isFormulaError(nextTotal)) return nextTotal;
      total = nextTotal;
      continue;
    }

    const value = evaluateExpression(argument, resolver);
    if (isFormulaError(value)) return value;
    if (!isFiniteNumber(value)) continue;
    const nextTotal = addFiniteNumber(total, value);
    if (isFormulaError(nextTotal)) return nextTotal;
    total = nextTotal;
  }
  return total;
}

export function evaluateFormulaAst(
  ast: FormulaAst,
  resolver: FormulaEvaluationResolver,
): FormulaValue {
  return evaluateExpression(ast.expression, resolver);
}

export function evaluateFormula(source: string, resolver: FormulaEvaluationResolver): FormulaValue {
  const result = parseFormula(source);
  return result.ok ? evaluateFormulaAst(result.ast, resolver) : createFormulaError("PARSE");
}
