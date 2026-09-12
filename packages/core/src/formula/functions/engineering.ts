import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionContext, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar } from "./helpers.js";

function value(context: FormulaFunctionContext, index: number): FormulaValue {
  return scalar(context.evaluateArgument(index));
}
function integer(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  const result = finiteNumber(value(context, index));
  return isFormulaError(result) ? result : Math.trunc(result);
}
function sourceText(
  context: FormulaFunctionContext,
  index: number,
): string | ReturnType<typeof formulaError> {
  const result = value(context, index);
  if (isFormulaError(result)) return result;
  if (typeof result === "number")
    return Number.isSafeInteger(result) ? String(result) : formulaError("NUM");
  return typeof result === "string" ? result : formulaError("VALUE");
}

function parseSigned(
  context: FormulaFunctionContext,
  base: 2 | 16,
): number | ReturnType<typeof formulaError> {
  const source = sourceText(context, 0);
  if (isFormulaError(source)) return source;
  const expression = base === 2 ? /^[01]{1,10}$/ : /^[0-9a-fA-F]{1,10}$/;
  if (!expression.test(source)) return formulaError("NUM");
  const parsed = Number.parseInt(source, base);
  const bits = base === 2 ? 10 : 40;
  const sign = 2 ** (bits - 1);
  return parsed >= sign ? parsed - 2 ** bits : parsed;
}

function places(
  context: FormulaFunctionContext,
  length: number,
  negative: boolean,
): number | ReturnType<typeof formulaError> {
  // Excel emits the fixed-width two's-complement form for a negative input;
  // its optional places argument is ignored in that case.
  if (negative) return 0;
  if (context.argumentCount === 1) return 0;
  const result = integer(context, 1);
  if (isFormulaError(result)) return result;
  return result < 1 || result > 10 || result < length ? formulaError("NUM") : result;
}

function decimalTo(context: FormulaFunctionContext, base: 2 | 16): FormulaValue {
  const source = integer(context, 0);
  if (isFormulaError(source)) return source;
  const bits = base === 2 ? 10 : 40;
  const minimum = -(2 ** (bits - 1));
  const maximum = 2 ** (bits - 1) - 1;
  if (source < minimum || source > maximum) return formulaError("NUM");
  const negative = source < 0;
  const result = (negative ? source + 2 ** bits : source)
    .toString(base)
    .toUpperCase()
    .padStart(negative ? 10 : 0, "0");
  const requested = places(context, result.length, negative);
  if (isFormulaError(requested)) return requested;
  return requested === 0 ? result : result.padStart(requested, "0");
}

export const ENGINEERING_FUNCTIONS = [
  defineFunction(
    {
      name: "BIN2DEC",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => parseSigned(context, 2),
  ),
  defineFunction(
    {
      name: "DEC2BIN",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "places", optional: true }],
      lazy: false,
    },
    (context) => decimalTo(context, 2),
  ),
  defineFunction(
    {
      name: "HEX2DEC",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => parseSigned(context, 16),
  ),
  defineFunction(
    {
      name: "DEC2HEX",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "places", optional: true }],
      lazy: false,
    },
    (context) => decimalTo(context, 16),
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
