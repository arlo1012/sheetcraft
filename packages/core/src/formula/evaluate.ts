import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  type FormulaFunctionArgument,
  type FormulaFunctionRegistry,
} from "./functions.js";
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

export type FormulaEvaluationOptions = Readonly<{ registry?: FormulaFunctionRegistry }>;

function finite(value: FormulaValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validate(value: FormulaValue): FormulaValue {
  return typeof value === "number" && !Number.isFinite(value) ? createFormulaError("VALUE") : value;
}

function arithmetic(value: FormulaValue): number | ReturnType<typeof createFormulaError> {
  value = validate(value);
  if (isFormulaError(value)) return value;
  if (value === null) return 0;
  return finite(value) ? value : createFormulaError("VALUE");
}

function text(value: FormulaValue): string | ReturnType<typeof createFormulaError> {
  value = validate(value);
  if (isFormulaError(value)) return value;
  if (value === null) return "";
  return typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
}

function rangeBounds(range: FormulaRange) {
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

function compare(
  left: FormulaValue,
  right: FormulaValue,
): -1 | 0 | 1 | ReturnType<typeof createFormulaError> {
  left = validate(left);
  right = validate(right);
  if (isFormulaError(left)) return left;
  if (isFormulaError(right)) return right;
  if (left === null && right === null) return 0;
  if (left === null) return compare(blankFor(right as Exclude<FormulaValue, null>), right);
  if (right === null) return compare(left, blankFor(left as Exclude<FormulaValue, null>));
  if (typeof left === typeof right) {
    if (typeof left === "string" && typeof right === "string") {
      left = left.toLocaleUpperCase("en-US");
      right = right.toLocaleUpperCase("en-US");
    }
    return left === right ? 0 : left < right ? -1 : 1;
  }
  return rank(left) < rank(right) ? -1 : 1;
}

function blankFor(value: Exclude<FormulaValue, null>): FormulaValue {
  return typeof value === "number" ? 0 : typeof value === "string" ? "" : false;
}

function rank(value: Exclude<FormulaValue, null>): number {
  return typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2;
}

function comparison(operator: string, value: -1 | 0 | 1): boolean {
  if (operator === "=") return value === 0;
  if (operator === "<>") return value !== 0;
  if (operator === "<") return value < 0;
  if (operator === "<=") return value <= 0;
  if (operator === ">") return value > 0;
  return value >= 0;
}

function isComparison(operator: string): boolean {
  return ["=", "<>", "<", "<=", ">", ">="].includes(operator);
}

function evaluateExpression(
  expression: FormulaExpression,
  resolver: FormulaEvaluationResolver,
  registry: FormulaFunctionRegistry,
): FormulaValue {
  if (expression.kind === "number" || expression.kind === "string" || expression.kind === "boolean")
    return validate(expression.value);
  if (expression.kind === "reference")
    return validate(
      resolver.resolveCell({ row: expression.reference.row, column: expression.reference.column }),
    );
  if (expression.kind === "range") return createFormulaError("VALUE");
  if (expression.kind === "error") return createFormulaError(expression.code);
  if (expression.kind === "identifier") return createFormulaError("NAME");
  if (expression.kind === "unary") {
    const operand = arithmetic(evaluateExpression(expression.operand, resolver, registry));
    if (isFormulaError(operand)) return operand;
    return result(expression.operator === "-" ? -operand : operand);
  }
  if (expression.kind === "binary") {
    const left = evaluateExpression(expression.left, resolver, registry);
    const right = () => evaluateExpression(expression.right, resolver, registry);
    if (expression.operator === "&") {
      const first = text(left);
      if (isFormulaError(first)) return first;
      const second = text(right());
      return isFormulaError(second) ? second : `${first}${second}`;
    }
    if (isComparison(expression.operator)) {
      const value = compare(left, right());
      return isFormulaError(value) ? value : comparison(expression.operator, value);
    }
    const first = arithmetic(left);
    if (isFormulaError(first)) return first;
    const second = arithmetic(right());
    if (isFormulaError(second)) return second;
    if (expression.operator === "+") return result(first + second);
    if (expression.operator === "-") return result(first - second);
    if (expression.operator === "*") return result(first * second);
    return second === 0 ? createFormulaError("DIV0") : result(first / second);
  }
  const definition = registry.get(expression.name);
  if (!definition) return createFormulaError("NAME");
  const { minArgs, maxArgs } = definition.metadata;
  if (expression.args.length < minArgs || (maxArgs !== null && expression.args.length > maxArgs))
    return createFormulaError("VALUE");
  const cache: ReturnType<typeof functionArgument>[] = [];
  return definition.evaluate({
    argumentCount: expression.args.length,
    evaluateArgument(index) {
      const cached = cache[index];
      if (cached) return cached;
      const argument = expression.args[index];
      const next = argument
        ? functionArgument(argument, resolver, registry)
        : {
            kind: "scalar" as const,
            value: createFormulaError("VALUE"),
            source: "expression" as const,
          };
      cache[index] = next;
      return next;
    },
  });
}

function functionArgument(
  expression: FormulaExpression,
  resolver: FormulaEvaluationResolver,
  registry: FormulaFunctionRegistry,
): FormulaFunctionArgument {
  return expression.kind === "range"
    ? { kind: "range" as const, values: resolver.resolveRange(rangeBounds(expression.range)) }
    : {
        kind: "scalar" as const,
        value: evaluateExpression(expression, resolver, registry),
        source:
          expression.kind === "number" ||
          expression.kind === "string" ||
          expression.kind === "boolean"
            ? "literal"
            : expression.kind === "reference"
              ? "reference"
              : "expression",
      };
}

function result(value: number): FormulaValue {
  return Number.isFinite(value) ? value : createFormulaError("VALUE");
}

export function evaluateFormulaAst(
  ast: FormulaAst,
  resolver: FormulaEvaluationResolver,
  options?: FormulaEvaluationOptions,
): FormulaValue {
  return evaluateExpression(
    ast.expression,
    resolver,
    options?.registry ?? DEFAULT_FORMULA_FUNCTION_REGISTRY,
  );
}

export function evaluateFormula(
  source: string,
  resolver: FormulaEvaluationResolver,
  options?: FormulaEvaluationOptions,
): FormulaValue {
  const parsed = parseFormula(source);
  return parsed.ok
    ? evaluateFormulaAst(parsed.ast, resolver, options)
    : createFormulaError("PARSE");
}
