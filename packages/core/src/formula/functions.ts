import { createFormulaError, isFormulaError, type FormulaValue } from "./types.js";

export type FormulaFunctionArgumentMetadata = Readonly<{
  name: string;
  optional?: boolean;
}>;

/** Runtime-neutral information suitable for formula completion and argument help. */
export type FormulaFunctionMetadata = Readonly<{
  name: string;
  category: string;
  minArgs: number;
  maxArgs: number | null;
  arguments: readonly FormulaFunctionArgumentMetadata[];
  lazy: boolean;
}>;

export type FormulaFunctionArgument =
  | Readonly<{
      kind: "scalar";
      value: FormulaValue;
      source: "literal" | "reference" | "expression";
    }>
  | Readonly<{ kind: "range"; values: Iterable<FormulaValue> }>;

/** Arguments are evaluated only when the function requests them. */
export type FormulaFunctionContext = Readonly<{
  argumentCount: number;
  evaluateArgument: (index: number) => FormulaFunctionArgument;
}>;

export type FormulaFunctionDefinition = Readonly<{
  metadata: FormulaFunctionMetadata;
  evaluate: (context: FormulaFunctionContext) => FormulaValue;
  selectDependencyArguments?: (context: FormulaFunctionContext) => readonly number[];
}>;

export type FormulaFunctionRegistry = Readonly<{
  get: (name: string) => FormulaFunctionDefinition | undefined;
  list: () => readonly FormulaFunctionMetadata[];
}>;

function error(code: "DIV0" | "VALUE" | "NUM") {
  return createFormulaError(code);
}

function scalar(argument: FormulaFunctionArgument): FormulaValue {
  return argument.kind === "scalar" ? argument.value : error("VALUE");
}

function finiteNumber(value: FormulaValue): number | ReturnType<typeof error> {
  if (isFormulaError(value)) return value;
  return typeof value === "number" && Number.isFinite(value) ? value : error("VALUE");
}

function collectNumbers(
  context: FormulaFunctionContext,
  ignoreReferencedErrors: boolean,
  includeTotal: boolean,
  ignoreInvalidDirectText: boolean,
): { count: number; total: number; minimum: number; maximum: number } | ReturnType<typeof error> {
  let count = 0;
  let total = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    const source = argument.kind === "range" ? argument.values : [argument.value];
    for (const value of source) {
      if (isFormulaError(value)) {
        if (
          !ignoreReferencedErrors ||
          (argument.kind === "scalar" && argument.source !== "reference")
        )
          return value;
        continue;
      }
      const numeric = coerceAggregateNumber(value, argument, ignoreInvalidDirectText);
      if (isFormulaError(numeric)) return numeric;
      if (numeric !== null) {
        count += 1;
        if (includeTotal) {
          total += numeric;
          if (!Number.isFinite(total)) return error("VALUE");
        }
        minimum = Math.min(minimum, numeric);
        maximum = Math.max(maximum, numeric);
      }
    }
  }
  return { count, total, minimum, maximum };
}

function coerceAggregateNumber(
  value: Exclude<FormulaValue, ReturnType<typeof createFormulaError>>,
  argument: FormulaFunctionArgument,
  ignoreInvalidDirectText: boolean,
): number | null | ReturnType<typeof error> {
  if (typeof value === "number") return Number.isFinite(value) ? value : error("VALUE");
  if (argument.kind === "range" || (argument.kind === "scalar" && argument.source === "reference"))
    return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() !== "" && Number.isFinite(numeric)) return numeric;
    return ignoreInvalidDirectText ? null : error("VALUE");
  }
  return null;
}

function aggregate(
  context: FormulaFunctionContext,
  operation: "sum" | "average" | "count" | "min" | "max",
): FormulaValue {
  const values = collectNumbers(
    context,
    operation === "count",
    operation === "sum" || operation === "average",
    operation === "count",
  );
  if (isFormulaError(values)) return values;
  if (operation === "count") return values.count;
  if (operation === "sum") return values.total;
  if (operation === "average") {
    return values.count === 0 ? error("DIV0") : values.total / values.count;
  }
  if (values.count === 0) return 0;
  return operation === "min" ? values.minimum : values.maximum;
}

function coerceCondition(value: FormulaValue): boolean | ReturnType<typeof error> {
  if (isFormulaError(value)) return value;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value !== 0 : error("VALUE");
  return error("VALUE");
}

function roundAwayFromZero(value: number, digits: number): FormulaValue {
  const roundedDigits = Math.trunc(digits);
  if (!Number.isFinite(roundedDigits) || Math.abs(roundedDigits) > 308) return error("NUM");
  const shifted = shiftDecimal(Math.abs(value), roundedDigits);
  if (!Number.isFinite(shifted)) return error("NUM");
  const rounded = Math.sign(value) * shiftDecimal(Math.round(shifted), -roundedDigits);
  return Number.isFinite(rounded) ? rounded : error("NUM");
}

/** Shifts the decimal exponent without losing decimal ties to binary multiplication. */
function shiftDecimal(value: number, exponent: number): number {
  const [coefficient, scientificExponent = "0"] = value.toString().toLowerCase().split("e");
  return Number(`${coefficient}e${Number(scientificExponent) + exponent}`);
}

function definition(
  metadata: FormulaFunctionMetadata,
  evaluate: (context: FormulaFunctionContext) => FormulaValue,
  selectDependencyArguments?: (context: FormulaFunctionContext) => readonly number[],
): FormulaFunctionDefinition {
  return { metadata, evaluate, selectDependencyArguments };
}

const DEFINITIONS = [
  definition(
    { name: "SUM", category: "Math", minArgs: 0, maxArgs: null, arguments: [], lazy: false },
    (context) => aggregate(context, "sum"),
  ),
  definition(
    {
      name: "IF",
      category: "Logical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "logical_test" },
        { name: "value_if_true" },
        { name: "value_if_false", optional: true },
      ],
      lazy: true,
    },
    (context) => {
      const condition = coerceCondition(scalar(context.evaluateArgument(0)));
      if (isFormulaError(condition)) return condition;
      return context.argumentCount === 2 && !condition
        ? false
        : scalar(context.evaluateArgument(condition ? 1 : 2));
    },
    (context) => {
      const condition = coerceCondition(scalar(context.evaluateArgument(0)));
      return isFormulaError(condition) ? [0] : condition ? [0, 1] : [0, 2];
    },
  ),
  definition(
    {
      name: "IFERROR",
      category: "Logical",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "value" }, { name: "value_if_error" }],
      lazy: true,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      return isFormulaError(value) ? scalar(context.evaluateArgument(1)) : value;
    },
    (context) => (isFormulaError(scalar(context.evaluateArgument(0))) ? [0, 1] : [0]),
  ),
  definition(
    {
      name: "AVERAGE",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => aggregate(context, "average"),
  ),
  definition(
    {
      name: "COUNT",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "value1" }, { name: "value2", optional: true }],
      lazy: false,
    },
    (context) => aggregate(context, "count"),
  ),
  definition(
    {
      name: "MIN",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => aggregate(context, "min"),
  ),
  definition(
    {
      name: "MAX",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => aggregate(context, "max"),
  ),
  definition(
    {
      name: "ROUND",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "num_digits" }],
      lazy: false,
    },
    (context) => {
      const value = finiteNumber(scalar(context.evaluateArgument(0)));
      if (isFormulaError(value)) return value;
      const digits = finiteNumber(scalar(context.evaluateArgument(1)));
      if (isFormulaError(digits)) return digits;
      return roundAwayFromZero(value, digits);
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

const definitionsByName = new Map(DEFINITIONS.map((item) => [item.metadata.name, item]));
const metadata = DEFINITIONS.map((item) => item.metadata);

export const DEFAULT_FORMULA_FUNCTION_REGISTRY: FormulaFunctionRegistry = Object.freeze({
  get: (name) => definitionsByName.get(name.toUpperCase()),
  list: () => metadata,
});

export function getFormulaFunctionMetadata(
  registry: FormulaFunctionRegistry = DEFAULT_FORMULA_FUNCTION_REGISTRY,
): readonly FormulaFunctionMetadata[] {
  return registry.list();
}
