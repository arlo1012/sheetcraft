import type { ExcelDateParts, ExcelDateSystem } from "./date-system.js";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  normalizeFormulaFunctionName,
  type FormulaFunctionArgument,
  type FormulaFunctionRegistry,
} from "./functions.js";
import { parseFormula } from "./parser.js";
import { formulaArray, isFormulaArray, scalarize } from "./runtime.js";
import {
  createFormulaError,
  isFormulaError,
  type FormulaAst,
  type FormulaEvaluationResolver,
  type FormulaExpression,
  type FormulaRange,
  type FormulaRangeBounds,
  type FormulaRuntimeValue,
  type FormulaValue,
} from "./types.js";

export type FormulaEvaluationOptions = Readonly<{
  registry?: FormulaFunctionRegistry;
  dateSystem?: ExcelDateSystem;
  now?: () => ExcelDateParts;
  address?: { row: number; column: number };
}>;

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

function evaluateRange(
  bounds: FormulaRangeBounds & { sheetName?: string },
  resolver: FormulaEvaluationResolver,
): FormulaRuntimeValue {
  const rows = bounds.end.row - bounds.start.row + 1,
    columns = bounds.end.column - bounds.start.column + 1;
  if (rows * columns > 100_000) return createFormulaError("CALC");
  return formulaArray(
    Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        resolver.resolveCell({
          row: bounds.start.row + row,
          column: bounds.start.column + column,
          ...(bounds.sheetName ? { sheetName: bounds.sheetName } : {}),
        }),
      ),
    ),
  );
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

function broadcast(
  left: FormulaRuntimeValue,
  right: FormulaRuntimeValue,
  operation: (left: FormulaValue, right: FormulaValue) => FormulaValue,
): FormulaRuntimeValue {
  if (!isFormulaArray(left) && !isFormulaArray(right)) return operation(left, right);
  const leftRows = isFormulaArray(left) ? left.rows : [[left]];
  const rightRows = isFormulaArray(right) ? right.rows : [[right]];
  const rows = Math.max(leftRows.length, rightRows.length);
  const columns = Math.max(leftRows[0]?.length ?? 0, rightRows[0]?.length ?? 0);
  if (
    (!isFormulaArray(left) || leftRows.length === rows) &&
    (!isFormulaArray(right) || rightRows.length === rows) &&
    (!isFormulaArray(left) || (leftRows[0]?.length ?? 0) === columns) &&
    (!isFormulaArray(right) || (rightRows[0]?.length ?? 0) === columns)
  )
    return formulaArray(
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) =>
          operation(
            leftRows[isFormulaArray(left) ? row : 0]![isFormulaArray(left) ? column : 0]!,
            rightRows[isFormulaArray(right) ? row : 0]![isFormulaArray(right) ? column : 0]!,
          ),
        ),
      ),
    );
  return createFormulaError("VALUE");
}

function binaryScalar(
  operator: "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=",
  left: FormulaValue,
  right: FormulaValue,
): FormulaValue {
  if (operator === "&") {
    const first = text(left),
      second = text(right);
    return isFormulaError(first) ? first : isFormulaError(second) ? second : `${first}${second}`;
  }
  if (isComparison(operator)) {
    const value = compare(left, right);
    return isFormulaError(value) ? value : comparison(operator, value);
  }
  const first = arithmetic(left),
    second = arithmetic(right);
  if (isFormulaError(first)) return first;
  if (isFormulaError(second)) return second;
  if (operator === "+") return result(first + second);
  if (operator === "-") return result(first - second);
  if (operator === "*") return result(first * second);
  if (operator === "^") return result(first ** second);
  return second === 0 ? createFormulaError("DIV0") : result(first / second);
}

function ifCondition(value: FormulaValue): boolean | FormulaValue {
  if (isFormulaError(value)) return value;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  return typeof value === "number" ? value !== 0 : createFormulaError("VALUE");
}

function evaluateIfRuntime(
  args: FormulaExpression[],
  resolver: FormulaEvaluationResolver,
  registry: FormulaFunctionRegistry,
  options?: FormulaEvaluationOptions,
): FormulaRuntimeValue {
  const condition = evaluateExpression(args[0]!, resolver, registry, options);
  if (!isFormulaArray(condition)) {
    const selected = ifCondition(condition);
    if (isFormulaError(selected)) return selected;
    return selected
      ? evaluateExpression(args[1]!, resolver, registry, options)
      : args[2]
        ? evaluateExpression(args[2], resolver, registry, options)
        : false;
  }
  const whenTrue = evaluateExpression(args[1]!, resolver, registry, options);
  const whenFalse = args[2] ? evaluateExpression(args[2], resolver, registry, options) : false;
  const trueRows = isFormulaArray(whenTrue) ? whenTrue.rows : [[whenTrue]],
    falseRows = isFormulaArray(whenFalse) ? whenFalse.rows : [[whenFalse]];
  const rows = condition.rows.length,
    columns = condition.rows[0]?.length ?? 0;
  if (
    (isFormulaArray(whenTrue) &&
      (trueRows.length !== rows || (trueRows[0]?.length ?? 0) !== columns)) ||
    (isFormulaArray(whenFalse) &&
      (falseRows.length !== rows || (falseRows[0]?.length ?? 0) !== columns))
  )
    return createFormulaError("VALUE");
  return formulaArray(
    condition.rows.map((row, r) =>
      row.map((item, c) => {
        const selected = ifCondition(item);
        return isFormulaError(selected)
          ? selected
          : selected
            ? trueRows[isFormulaArray(whenTrue) ? r : 0]![isFormulaArray(whenTrue) ? c : 0]!
            : falseRows[isFormulaArray(whenFalse) ? r : 0]![isFormulaArray(whenFalse) ? c : 0]!;
      }),
    ),
  );
}

function evaluateExpression(
  expression: FormulaExpression,
  resolver: FormulaEvaluationResolver,
  registry: FormulaFunctionRegistry,
  options?: FormulaEvaluationOptions,
): FormulaRuntimeValue {
  if (expression.kind === "number" || expression.kind === "string" || expression.kind === "boolean")
    return validate(expression.value);
  if (expression.kind === "omitted") return null;
  if (expression.kind === "reference")
    return validate(
      resolver.resolveCell({
        row: expression.reference.row,
        column: expression.reference.column,
        ...(expression.reference.sheetName ? { sheetName: expression.reference.sheetName } : {}),
      }),
    );
  if (expression.kind === "spill") {
    const value = resolver.resolveSpill?.({
      row: expression.reference.row,
      column: expression.reference.column,
      ...(expression.reference.sheetName ? { sheetName: expression.reference.sheetName } : {}),
    });
    return value === undefined ? createFormulaError("REF") : value;
  }
  if (expression.kind === "range")
    return evaluateRange(
      {
        ...rangeBounds(expression.range),
        ...(expression.range.start.sheetName
          ? { sheetName: expression.range.start.sheetName }
          : {}),
      },
      resolver,
    );
  if (expression.kind === "axis-range") {
    const bounds =
      expression.range.axis === "column"
        ? {
            start: { row: 0, column: Math.min(expression.range.start, expression.range.end) },
            end: { row: 1_048_575, column: Math.max(expression.range.start, expression.range.end) },
          }
        : {
            start: { row: Math.min(expression.range.start, expression.range.end), column: 0 },
            end: { row: Math.max(expression.range.start, expression.range.end), column: 16_383 },
          };
    return evaluateRange(
      {
        ...bounds,
        ...(expression.range.sheetName ? { sheetName: expression.range.sheetName } : {}),
      },
      resolver,
    );
  }
  if (expression.kind === "structured-reference") {
    const resolved = resolver.resolveStructuredReference?.(expression.reference, options?.address);
    return resolved?.value ?? createFormulaError("REF");
  }
  if (expression.kind === "array")
    return formulaArray(
      expression.rows.map((row) =>
        row.map((item) => scalarize(evaluateExpression(item, resolver, registry, options))),
      ),
    );
  if (expression.kind === "error") return createFormulaError(expression.code);
  if (expression.kind === "identifier") {
    const named = resolver.resolveName?.(expression.name);
    if (!named) return createFormulaError("NAME");
    if (typeof named === "object" && named !== null && "start" in named) {
      return named.start.row === named.end.row && named.start.column === named.end.column
        ? validate(
            resolver.resolveCell({
              ...named.start,
              ...(named.sheetName ? { sheetName: named.sheetName } : {}),
            }),
          )
        : createFormulaError("VALUE");
    }
    return validate(named);
  }
  if (expression.kind === "unary") {
    const value = evaluateExpression(expression.operand, resolver, registry, options);
    return isFormulaArray(value)
      ? formulaArray(
          value.rows.map((row) =>
            row.map((item) => {
              const operand = arithmetic(item);
              return isFormulaError(operand)
                ? operand
                : result(expression.operator === "-" ? -operand : operand);
            }),
          ),
        )
      : (() => {
          const operand = arithmetic(value);
          return isFormulaError(operand)
            ? operand
            : result(expression.operator === "-" ? -operand : operand);
        })();
  }
  if (expression.kind === "binary") {
    return broadcast(
      evaluateExpression(expression.left, resolver, registry, options),
      evaluateExpression(expression.right, resolver, registry, options),
      (left, right) => binaryScalar(expression.operator, left, right),
    );
  }
  const definition = registry.get(expression.name);
  if (
    normalizeFormulaFunctionName(expression.name) === "IF" &&
    expression.args.length >= 2 &&
    expression.args.length <= 3
  )
    return evaluateIfRuntime(expression.args, resolver, registry, options);
  if (!definition) return createFormulaError("NAME");
  const { minArgs, maxArgs } = definition.metadata;
  if (expression.args.length < minArgs || (maxArgs !== null && expression.args.length > maxArgs))
    return createFormulaError("VALUE");
  const cache: ReturnType<typeof functionArgument>[] = [];
  return definition.evaluate({
    argumentCount: expression.args.length,
    ...(options?.dateSystem ? { dateSystem: options.dateSystem } : {}),
    ...(options?.now ? { now: options.now } : {}),
    ...(options?.address ? { address: options.address } : {}),
    evaluateArgument(index) {
      const cached = cache[index];
      if (cached) return cached;
      const argument = expression.args[index];
      const next = argument
        ? functionArgument(argument, resolver, registry, options)
        : {
            kind: "scalar" as const,
            value: createFormulaError("VALUE"),
            source: "expression" as const,
          };
      cache[index] = next;
      return next;
    },
  }) as FormulaRuntimeValue;
}

function* rangeEntries(
  bounds: FormulaRangeBounds & { sheetName?: string },
  resolver: FormulaEvaluationResolver,
) {
  yield* resolver.resolveRangeEntries?.(bounds) ?? [];
}

function functionArgument(
  expression: FormulaExpression,
  resolver: FormulaEvaluationResolver,
  registry: FormulaFunctionRegistry,
  options?: FormulaEvaluationOptions,
): FormulaFunctionArgument {
  if (expression.kind === "omitted") {
    return { kind: "scalar", value: null, source: "omitted" };
  }
  if (expression.kind === "identifier") {
    const named = resolver.resolveName?.(expression.name);
    if (typeof named === "object" && named !== null && "start" in named) {
      return {
        kind: "range" as const,
        values: resolver.resolveRange(named),
        ...(resolver.resolveRangeEntries ? { entries: rangeEntries(named, resolver) } : {}),
        bounds: named,
        getValue: (row, column) =>
          resolver.resolveCell({
            row,
            column,
            ...(named.sheetName ? { sheetName: named.sheetName } : {}),
          }),
      };
    }
  }
  if (expression.kind === "range") {
    const bounds = rangeBounds(expression.range);
    const sheetName = expression.range.start.sheetName;
    return {
      kind: "range" as const,
      values: resolver.resolveRange({
        ...bounds,
        ...(sheetName ? { sheetName } : {}),
      }),
      ...(resolver.resolveRangeEntries
        ? { entries: rangeEntries({ ...bounds, ...(sheetName ? { sheetName } : {}) }, resolver) }
        : {}),
      bounds,
      getValue: (row, column) =>
        resolver.resolveCell({ row, column, ...(sheetName ? { sheetName } : {}) }),
    };
  }
  if (expression.kind === "axis-range") {
    const bounds =
      expression.range.axis === "column"
        ? {
            start: { row: 0, column: Math.min(expression.range.start, expression.range.end) },
            end: { row: 1_048_575, column: Math.max(expression.range.start, expression.range.end) },
          }
        : {
            start: { row: Math.min(expression.range.start, expression.range.end), column: 0 },
            end: { row: Math.max(expression.range.start, expression.range.end), column: 16_383 },
          };
    const sheetName = expression.range.sheetName;
    return {
      kind: "range",
      values: resolver.resolveRange({ ...bounds, ...(sheetName ? { sheetName } : {}) }),
      ...(resolver.resolveRangeEntries
        ? { entries: rangeEntries({ ...bounds, ...(sheetName ? { sheetName } : {}) }, resolver) }
        : {}),
      bounds,
      getValue: (row, column) =>
        resolver.resolveCell({ row, column, ...(sheetName ? { sheetName } : {}) }),
    };
  }
  if (expression.kind === "structured-reference") {
    const resolved = resolver.resolveStructuredReference?.(expression.reference, options?.address);
    if (resolved?.range) {
      const { range } = resolved;
      return {
        kind: "range",
        values: range.values,
        ...(range.entries ? { entries: range.entries } : {}),
        bounds: range.bounds,
        ...(range.getValue ? { getValue: range.getValue } : {}),
      };
    }
  }
  const reference = expression.kind === "reference" ? expression.reference : null;
  return {
    kind: "scalar" as const,
    value: evaluateExpression(expression, resolver, registry, options),
    source:
      expression.kind === "number" || expression.kind === "string" || expression.kind === "boolean"
        ? "literal"
        : expression.kind === "reference"
          ? "reference"
          : "expression",
    ...(reference
      ? {
          address: { row: reference.row, column: reference.column },
          ...(resolver.resolveRangeEntries
            ? {
                entries: rangeEntries(
                  {
                    start: reference,
                    end: reference,
                    ...(reference.sheetName ? { sheetName: reference.sheetName } : {}),
                  },
                  resolver,
                ),
              }
            : {}),
          getValue: (row: number, column: number) =>
            resolver.resolveCell({
              row,
              column,
              ...(reference.sheetName ? { sheetName: reference.sheetName } : {}),
            }),
        }
      : {}),
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
  return scalarize(
    evaluateExpression(
      ast.expression,
      resolver,
      options?.registry ?? DEFAULT_FORMULA_FUNCTION_REGISTRY,
      options,
    ),
  );
}

export function evaluateFormulaRuntimeAst(
  ast: FormulaAst,
  resolver: FormulaEvaluationResolver,
  options?: FormulaEvaluationOptions,
): FormulaRuntimeValue {
  return evaluateExpression(
    ast.expression,
    resolver,
    options?.registry ?? DEFAULT_FORMULA_FUNCTION_REGISTRY,
    options,
  );
}

export function evaluateFormulaRuntime(
  source: string,
  resolver: FormulaEvaluationResolver,
  options?: FormulaEvaluationOptions,
): FormulaRuntimeValue {
  const parsed = parseFormula(source);
  return parsed.ok
    ? evaluateFormulaRuntimeAst(parsed.ast, resolver, options)
    : createFormulaError("PARSE");
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
