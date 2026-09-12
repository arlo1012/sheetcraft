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

function signedBase(
  context: FormulaFunctionContext,
  base: 2 | 8 | 16,
): number | ReturnType<typeof formulaError> {
  if (base === 2 || base === 16) return parseSigned(context, base);
  const source = sourceText(context, 0);
  if (isFormulaError(source)) return source;
  if (!/^[0-7]{1,10}$/.test(source)) return formulaError("NUM");
  const parsed = Number.parseInt(source, 8);
  return parsed >= 2 ** 29 ? parsed - 2 ** 30 : parsed;
}

function formatBase(value: number, base: 2 | 8 | 16, places: number | null): FormulaValue {
  const bits = base === 2 ? 10 : base === 8 ? 30 : 40;
  const minimum = -(2 ** (bits - 1));
  const maximum = 2 ** (bits - 1) - 1;
  if (value < minimum || value > maximum) return formulaError("NUM");
  const negative = value < 0;
  const formatted = (negative ? value + 2 ** bits : value)
    .toString(base)
    .toUpperCase()
    .padStart(negative ? 10 : 0, "0");
  if (negative || places === null) return formatted;
  return places < formatted.length || places > 10
    ? formulaError("NUM")
    : formatted.padStart(places, "0");
}

function convertBase(
  context: FormulaFunctionContext,
  from: 2 | 8 | 16,
  to: 2 | 8 | 16 | 10,
): FormulaValue {
  const parsed = signedBase(context, from);
  if (isFormulaError(parsed)) return parsed;
  if (to === 10) return parsed;
  let requested: number | null = null;
  if (context.argumentCount === 2) {
    requested = integer(context, 1);
    if (isFormulaError(requested)) return requested;
  }
  return formatBase(parsed, to, requested);
}

const MAX_BIT = 2 ** 48 - 1;

function bitOperand(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  const result = integer(context, index);
  return isFormulaError(result) || result < 0 || result > MAX_BIT ? formulaError("NUM") : result;
}

function bitwise(
  context: FormulaFunctionContext,
  operator: (left: bigint, right: bigint) => bigint,
): FormulaValue {
  const left = bitOperand(context, 0);
  const right = bitOperand(context, 1);
  if (isFormulaError(left) || isFormulaError(right)) return isFormulaError(left) ? left : right;
  return Number(operator(BigInt(left), BigInt(right)));
}

function shift(context: FormulaFunctionContext, direction: 1 | -1): FormulaValue {
  const value = bitOperand(context, 0);
  const amount = integer(context, 1);
  if (isFormulaError(value) || isFormulaError(amount))
    return isFormulaError(value) ? value : amount;
  if (Math.abs(amount) > 53) return formulaError("NUM");
  const effective = amount * direction;
  const result =
    effective >= 0 ? BigInt(value) << BigInt(effective) : BigInt(value) >> BigInt(-effective);
  return result > BigInt(MAX_BIT) ? formulaError("NUM") : Number(result);
}

type Unit = Readonly<{ dimension: string; scale: number; offset?: number }>;

const UNITS: Readonly<Record<string, Unit>> = {
  m: { dimension: "length", scale: 1 },
  km: { dimension: "length", scale: 1_000 },
  cm: { dimension: "length", scale: 0.01 },
  mm: { dimension: "length", scale: 0.001 },
  in: { dimension: "length", scale: 0.0254 },
  ft: { dimension: "length", scale: 0.3048 },
  yd: { dimension: "length", scale: 0.9144 },
  mi: { dimension: "length", scale: 1_609.344 },
  g: { dimension: "mass", scale: 1 },
  kg: { dimension: "mass", scale: 1_000 },
  lbm: { dimension: "mass", scale: 453.59237 },
  ozm: { dimension: "mass", scale: 28.349523125 },
  s: { dimension: "time", scale: 1 },
  min: { dimension: "time", scale: 60 },
  hr: { dimension: "time", scale: 3_600 },
  day: { dimension: "time", scale: 86_400 },
  C: { dimension: "temperature", scale: 1, offset: 0 },
  F: { dimension: "temperature", scale: 5 / 9, offset: -32 },
  K: { dimension: "temperature", scale: 1, offset: -273.15 },
};

function unitText(
  context: FormulaFunctionContext,
  index: number,
): string | ReturnType<typeof formulaError> {
  const source = value(context, index);
  if (isFormulaError(source)) return source;
  return typeof source === "string" ? source : formulaError("VALUE");
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
  defineFunction(
    {
      name: "OCT2DEC",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => signedBase(context, 8),
  ),
  defineFunction(
    {
      name: "DEC2OCT",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "places", optional: true }],
      lazy: false,
    },
    (context) => {
      const value = integer(context, 0);
      if (isFormulaError(value)) return value;
      const places = context.argumentCount === 1 ? null : integer(context, 1);
      return isFormulaError(places) ? places : formatBase(value, 8, places);
    },
  ),
  ...([2, 8, 16] as const).flatMap((from) =>
    ([2, 8, 16] as const)
      .filter((to) => to !== from)
      .map((to) => {
        const labels: Record<2 | 8 | 16, string> = { 2: "BIN", 8: "OCT", 16: "HEX" };
        return defineFunction(
          {
            name: `${labels[from]}2${labels[to]}`,
            category: "Engineering",
            minArgs: 1,
            maxArgs: 2,
            arguments: [{ name: "number" }, { name: "places", optional: true }],
            lazy: false,
          },
          (context) => convertBase(context, from, to),
        );
      }),
  ),
  defineFunction(
    {
      name: "BITAND",
      category: "Engineering",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number1" }, { name: "number2" }],
      lazy: false,
    },
    (context) => bitwise(context, (left, right) => left & right),
  ),
  defineFunction(
    {
      name: "BITOR",
      category: "Engineering",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number1" }, { name: "number2" }],
      lazy: false,
    },
    (context) => bitwise(context, (left, right) => left | right),
  ),
  defineFunction(
    {
      name: "BITXOR",
      category: "Engineering",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number1" }, { name: "number2" }],
      lazy: false,
    },
    (context) => bitwise(context, (left, right) => left ^ right),
  ),
  defineFunction(
    {
      name: "BITLSHIFT",
      category: "Engineering",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "shift_amount" }],
      lazy: false,
    },
    (context) => shift(context, 1),
  ),
  defineFunction(
    {
      name: "BITRSHIFT",
      category: "Engineering",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "shift_amount" }],
      lazy: false,
    },
    (context) => shift(context, -1),
  ),
  defineFunction(
    {
      name: "DELTA",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => {
      const first = finiteNumber(value(context, 0));
      const second = context.argumentCount === 1 ? 0 : finiteNumber(value(context, 1));
      return isFormulaError(first)
        ? first
        : isFormulaError(second)
          ? second
          : first === second
            ? 1
            : 0;
    },
  ),
  defineFunction(
    {
      name: "GESTEP",
      category: "Engineering",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "step", optional: true }],
      lazy: false,
    },
    (context) => {
      const number = finiteNumber(value(context, 0));
      const step = context.argumentCount === 1 ? 0 : finiteNumber(value(context, 1));
      return isFormulaError(number) ? number : isFormulaError(step) ? step : number >= step ? 1 : 0;
    },
  ),
  defineFunction(
    {
      name: "CONVERT",
      category: "Engineering",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "number" }, { name: "from_unit" }, { name: "to_unit" }],
      lazy: false,
    },
    (context) => {
      const amount = finiteNumber(value(context, 0));
      const fromName = unitText(context, 1);
      const toName = unitText(context, 2);
      if (isFormulaError(amount) || isFormulaError(fromName) || isFormulaError(toName))
        return isFormulaError(amount) ? amount : isFormulaError(fromName) ? fromName : toName;
      const from = UNITS[fromName];
      const to = UNITS[toName];
      if (!from || !to || from.dimension !== to.dimension) return formulaError("NA");
      const base =
        from.dimension === "temperature"
          ? (amount + from.offset!) * from.scale
          : amount * from.scale;
      const result =
        to.dimension === "temperature" ? base / to.scale - to.offset! : base / to.scale;
      return Number.isFinite(result) ? result : formulaError("NUM");
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
