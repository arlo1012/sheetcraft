import { isFormulaError, type FormulaValue } from "../types.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionDefinition,
} from "./contracts.js";
import {
  defineFunction,
  finiteNumber,
  formulaError,
  roundAwayFromZero,
  scalar,
  values,
} from "./helpers.js";

function directNumber(
  argument: FormulaFunctionArgument,
): number | ReturnType<typeof formulaError> {
  return finiteNumber(scalar(argument));
}
function aggregate(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  operation: "sum" | "product",
): FormulaValue {
  let result = operation === "sum" ? 0 : 1;
  for (let index = 0; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    for (const value of values(argument)) {
      if (isFormulaError(value)) return value;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return formulaError("VALUE");
        result = operation === "sum" ? result + value : result * value;
        if (!Number.isFinite(result))
          return formulaError(operation === "sum" ? "VALUE" : "NUM");
      } else if (
        argument.kind === "scalar" &&
        argument.source !== "reference"
      ) {
        if (typeof value === "boolean") {
          result =
            operation === "sum"
              ? result + Number(value)
              : result * Number(value);
        } else if (
          typeof value === "string" &&
          value.trim() !== "" &&
          Number.isFinite(Number(value))
        ) {
          result =
            operation === "sum"
              ? result + Number(value)
              : result * Number(value);
        }
      }
    }
  }
  return result;
}
export const MATH_FUNCTIONS = [
  defineFunction(
    {
      name: "SUM",
      category: "Math",
      minArgs: 0,
      maxArgs: null,
      arguments: [],
      lazy: false,
    },
    (context) => aggregate(context, "sum"),
  ),
  defineFunction(
    {
      name: "PRODUCT",
      category: "Math",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => aggregate(context, "product"),
  ),
  defineFunction(
    {
      name: "ABS",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      return isFormulaError(n) ? n : Math.abs(n);
    },
  ),
  defineFunction(
    {
      name: "INT",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      return isFormulaError(n) ? n : Math.floor(n);
    },
  ),
  defineFunction(
    {
      name: "TRUNC",
      category: "Math",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "num_digits", optional: true }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const d =
        context.argumentCount === 2
          ? directNumber(context.evaluateArgument(1))
          : 0;
      if (isFormulaError(n)) return n;
      if (isFormulaError(d)) return d;
      const digits = Math.trunc(d);
      if (digits < -308) return 0;
      if (digits > 308) return n;
      const factor = 10 ** digits;
      const value = Math.trunc(n * factor) / factor;
      return Number.isFinite(value) ? value : formulaError("NUM");
    },
  ),
  defineFunction(
    {
      name: "ROUND",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "num_digits" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const d = directNumber(context.evaluateArgument(1));
      return isFormulaError(n)
        ? n
        : isFormulaError(d)
          ? d
          : roundAwayFromZero(n, d);
    },
  ),
  defineFunction(
    {
      name: "ROUNDUP",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "num_digits" }],
      lazy: false,
    },
    (context) => roundWith(context, "up"),
  ),
  defineFunction(
    {
      name: "ROUNDDOWN",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "num_digits" }],
      lazy: false,
    },
    (context) => roundWith(context, "down"),
  ),
  defineFunction(
    {
      name: "MOD",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "divisor" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const d = directNumber(context.evaluateArgument(1));
      if (isFormulaError(n)) return n;
      if (isFormulaError(d)) return d;
      if (d === 0) return formulaError("DIV0");
      const remainder = n % d;
      if (!Number.isFinite(remainder)) return formulaError("NUM");
      return remainder === 0 || Math.sign(remainder) === Math.sign(d)
        ? remainder
        : remainder + d;
    },
  ),
  defineFunction(
    {
      name: "POWER",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "power" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const p = directNumber(context.evaluateArgument(1));
      if (isFormulaError(n)) return n;
      if (isFormulaError(p)) return p;
      const value = n ** p;
      return Number.isFinite(value) ? value : formulaError("NUM");
    },
  ),
  defineFunction(
    {
      name: "SQRT",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      return isFormulaError(n) ? n : n < 0 ? formulaError("NUM") : Math.sqrt(n);
    },
  ),
  defineFunction(
    {
      name: "SIGN",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      return isFormulaError(n) ? n : Math.sign(n);
    },
  ),
  defineFunction(
    {
      name: "CEILING",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "significance" }],
      lazy: false,
    },
    (context) => multipleRound(context, "up"),
  ),
  defineFunction(
    {
      name: "FLOOR",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "significance" }],
      lazy: false,
    },
    (context) => multipleRound(context, "down"),
  ),
  defineFunction(
    {
      name: "SUMPRODUCT",
      category: "Math",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "array1" }, { name: "array2", optional: true }],
      lazy: false,
    },
    sumProduct,
  ),
  defineFunction(
    {
      name: "PI",
      category: "Math",
      minArgs: 0,
      maxArgs: 0,
      arguments: [],
      lazy: false,
    },
    () => Math.PI,
  ),
  defineFunction(
    {
      name: "RAND",
      category: "Math",
      minArgs: 0,
      maxArgs: 0,
      arguments: [],
      lazy: false,
    },
    () => Math.random(),
  ),
  defineFunction(
    {
      name: "RANDBETWEEN",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "bottom" }, { name: "top" }],
      lazy: false,
    },
    (context) => {
      const bottom = directNumber(context.evaluateArgument(0));
      const top = directNumber(context.evaluateArgument(1));
      if (isFormulaError(bottom)) return bottom;
      if (isFormulaError(top)) return top;
      if (!Number.isInteger(bottom) || !Number.isInteger(top) || bottom > top)
        return formulaError("NUM");
      return bottom + Math.floor(Math.random() * (top - bottom + 1));
    },
  ),
  defineFunction(
    {
      name: "MROUND",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "multiple" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const m = directNumber(context.evaluateArgument(1));
      if (isFormulaError(n)) return n;
      if (isFormulaError(m)) return m;
      if (n * m < 0) return formulaError("NUM");
      if (m === 0) return 0;
      return (roundAwayFromZero(n / m, 0) as number) * m;
    },
  ),
  defineFunction(
    {
      name: "CEILING.MATH",
      category: "Math",
      minArgs: 1,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "significance", optional: true },
        { name: "mode", optional: true },
      ],
      lazy: false,
    },
    (context) => mathCeiling(context, "ceiling"),
  ),
  defineFunction(
    {
      name: "FLOOR.MATH",
      category: "Math",
      minArgs: 1,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "significance", optional: true },
        { name: "mode", optional: true },
      ],
      lazy: false,
    },
    (context) => mathCeiling(context, "floor"),
  ),
  defineFunction(
    {
      name: "ISO.CEILING",
      category: "Math",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "significance", optional: true }],
      lazy: false,
    },
    (context) => mathCeiling(context, "ceiling"),
  ),
  defineFunction(
    {
      name: "QUOTIENT",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "numerator" }, { name: "denominator" }],
      lazy: false,
    },
    (context) => {
      const a = directNumber(context.evaluateArgument(0));
      const b = directNumber(context.evaluateArgument(1));
      if (isFormulaError(a)) return a;
      if (isFormulaError(b)) return b;
      return b === 0 ? formulaError("DIV0") : Math.trunc(a / b);
    },
  ),
  ...["EVEN", "ODD"].map((name) =>
    defineFunction(
      {
        name,
        category: "Math",
        minArgs: 1,
        maxArgs: 1,
        arguments: [{ name: "number" }],
        lazy: false,
      },
      (context) => parityRound(context, name === "EVEN"),
    ),
  ),
  defineFunction(
    {
      name: "SUMSQ",
      category: "Math",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => numericFold(context, 0, (a, n) => a + n * n),
  ),
  defineFunction(
    {
      name: "GCD",
      category: "Math",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => integerFold(context, gcd, 0, true),
  ),
  defineFunction(
    {
      name: "LCM",
      category: "Math",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) =>
      integerFold(
        context,
        (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b)),
        1,
      ),
  ),
  defineFunction(
    {
      name: "FACT",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      if (isFormulaError(n)) return n;
      const integer = Math.trunc(n);
      if (integer < 0) return formulaError("NUM");
      let result = 1;
      for (let i = 2; i <= integer; i += 1) {
        result *= i;
        if (!Number.isFinite(result)) return formulaError("NUM");
      }
      return result;
    },
  ),
  defineFunction(
    {
      name: "COMBIN",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "number_chosen" }],
      lazy: false,
    },
    (context) => {
      const n = directNumber(context.evaluateArgument(0));
      const k = directNumber(context.evaluateArgument(1));
      if (isFormulaError(n)) return n;
      if (isFormulaError(k)) return k;
      const integerN = Math.trunc(n);
      const integerK = Math.trunc(k);
      if (integerN < 0 || integerK < 0 || integerK > integerN)
        return formulaError("NUM");
      let r = 1;
      for (let i = 1; i <= Math.min(integerK, integerN - integerK); i += 1)
        r = (r * (integerN - Math.min(integerK, integerN - integerK) + i)) / i;
      return Number.isFinite(r) ? r : formulaError("NUM");
    },
  ),
  defineFunction(
    {
      name: "SUBTOTAL",
      category: "Math",
      minArgs: 2,
      maxArgs: null,
      arguments: [
        { name: "function_num" },
        { name: "ref1" },
        { name: "ref2", optional: true },
      ],
      lazy: false,
    },
    (context) => subtotal(context, false),
  ),
  defineFunction(
    {
      name: "AGGREGATE",
      category: "Math",
      minArgs: 3,
      maxArgs: null,
      arguments: [
        { name: "function_num" },
        { name: "options" },
        { name: "ref1" },
        { name: "ref2", optional: true },
      ],
      lazy: false,
    },
    (context) => subtotal(context, true),
  ),
  ...[
    "SIN",
    "COS",
    "TAN",
    "ASIN",
    "ACOS",
    "ATAN",
    "SINH",
    "COSH",
    "TANH",
    "ASINH",
    "ACOSH",
    "ATANH",
    "EXP",
    "LN",
    "LOG10",
    "DEGREES",
    "RADIANS",
  ].map((name) =>
    defineFunction(
      {
        name,
        category: "Math",
        minArgs: 1,
        maxArgs: 1,
        arguments: [{ name: "number" }],
        lazy: false,
      },
      (context) => unaryMath(context, name),
    ),
  ),
  defineFunction(
    {
      name: "ATAN2",
      category: "Math",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "x_num" }, { name: "y_num" }],
      lazy: false,
    },
    (context) => {
      const x = directNumber(context.evaluateArgument(0));
      const y = directNumber(context.evaluateArgument(1));
      if (isFormulaError(x)) return x;
      if (isFormulaError(y)) return y;
      return x === 0 && y === 0 ? formulaError("DIV0") : Math.atan2(y, x);
    },
  ),
  defineFunction(
    {
      name: "LOG",
      category: "Math",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "number" }, { name: "base", optional: true }],
      lazy: false,
    },
    (context) => {
      const value = directNumber(context.evaluateArgument(0));
      const base =
        context.argumentCount === 2
          ? directNumber(context.evaluateArgument(1))
          : 10;
      if (isFormulaError(value)) return value;
      if (isFormulaError(base)) return base;
      if (value <= 0 || base <= 0 || base === 1) return formulaError("NUM");
      return Math.log(value) / Math.log(base);
    },
  ),
  defineFunction(
    {
      name: "SQRTPI",
      category: "Math",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => {
      const value = directNumber(context.evaluateArgument(0));
      return isFormulaError(value)
        ? value
        : value < 0
          ? formulaError("NUM")
          : Math.sqrt(value * Math.PI);
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

function subtotal(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  aggregateMode: boolean,
): FormulaValue {
  const functionNumber = directNumber(context.evaluateArgument(0));
  const option = aggregateMode ? directNumber(context.evaluateArgument(1)) : 0;
  if (isFormulaError(functionNumber)) return functionNumber;
  if (isFormulaError(option)) return option;
  const code = Math.trunc(functionNumber);
  const optionCode = Math.trunc(option);
  const operation = code >= 100 ? code - 100 : code;
  if (
    !Number.isInteger(functionNumber) ||
    !Number.isInteger(option) ||
    operation < 1 ||
    operation > 11 ||
    (aggregateMode && (optionCode < 0 || optionCode > 7))
  )
    return formulaError("VALUE");
  const start = aggregateMode ? 2 : 1;
  const ignoreHidden = aggregateMode
    ? [1, 3, 5, 7].includes(optionCode)
    : code >= 101;
  const ignoreErrors = aggregateMode && [2, 3, 6, 7].includes(optionCode);
  const numbers: number[] = [];
  let counta = 0;
  let product = 1;
  for (let index = start; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    const entries =
      argument.kind === "range" && argument.entries
        ? argument.entries
        : [...values(argument)].map((value) => ({
            value,
            hidden: false,
            filtered: false,
            nestedSubtotal: false,
          }));
    for (const entry of entries) {
      if (entry.nestedSubtotal && (!aggregateMode || optionCode < 4)) continue;
      if (entry.filtered || (ignoreHidden && entry.hidden)) continue;
      const value = entry.value;
      if (isFormulaError(value)) {
        if (ignoreErrors) continue;
        return value;
      }
      if (value !== null) counta += 1;
      if (typeof value === "number") {
        numbers.push(value);
        product *= value;
      }
    }
  }
  if (operation === 1)
    return numbers.length
      ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      : formulaError("DIV0");
  if (operation === 2) return numbers.length;
  if (operation === 3) return counta;
  if (operation === 4) return numbers.length ? Math.max(...numbers) : 0;
  if (operation === 5) return numbers.length ? Math.min(...numbers) : 0;
  if (operation === 6) return product;
  if (operation === 9) return numbers.reduce((sum, value) => sum + value, 0);
  if (numbers.length < (operation === 8 || operation === 10 ? 2 : 1))
    return formulaError("DIV0");
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const square = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const variance =
    square / (numbers.length - (operation === 8 || operation === 10 ? 1 : 0));
  return operation === 7 || operation === 8 ? Math.sqrt(variance) : variance;
}

function unaryMath(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  name: string,
): FormulaValue {
  const value = directNumber(context.evaluateArgument(0));
  if (isFormulaError(value)) return value;
  if ((name === "ASIN" || name === "ACOS") && (value < -1 || value > 1))
    return formulaError("NUM");
  if (name === "ACOSH" && value < 1) return formulaError("NUM");
  if (name === "ATANH" && (value <= -1 || value >= 1))
    return formulaError("NUM");
  if ((name === "LN" || name === "LOG10") && value <= 0)
    return formulaError("NUM");
  const operation: Record<string, (input: number) => number> = {
    SIN: Math.sin,
    COS: Math.cos,
    TAN: Math.tan,
    ASIN: Math.asin,
    ACOS: Math.acos,
    ATAN: Math.atan,
    SINH: Math.sinh,
    COSH: Math.cosh,
    TANH: Math.tanh,
    ASINH: Math.asinh,
    ACOSH: Math.acosh,
    ATANH: Math.atanh,
    EXP: Math.exp,
    LN: Math.log,
    LOG10: Math.log10,
    DEGREES: (input) => (input * 180) / Math.PI,
    RADIANS: (input) => (input * Math.PI) / 180,
  };
  const result = operation[name]!(value);
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function mathCeiling(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  direction: "ceiling" | "floor",
): FormulaValue {
  const n = directNumber(context.evaluateArgument(0));
  const significance =
    context.argumentCount >= 2 ? directNumber(context.evaluateArgument(1)) : 1;
  const mode =
    context.argumentCount === 3 ? directNumber(context.evaluateArgument(2)) : 0;
  if (isFormulaError(n)) return n;
  if (isFormulaError(significance)) return significance;
  if (isFormulaError(mode)) return mode;
  const s = Math.abs(significance);
  if (s === 0) return 0;
  const away = n >= 0 ? direction === "ceiling" : direction === "floor";
  const useAway = n >= 0 || mode === 0 ? away : !away;
  const value =
    (useAway ? Math.ceil : Math.floor)(Math.abs(n) / s) * s * Math.sign(n);
  return Number.isFinite(value) ? value : formulaError("NUM");
}
function parityRound(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  even: boolean,
): FormulaValue {
  const n = directNumber(context.evaluateArgument(0));
  if (isFormulaError(n)) return n;
  const magnitude = Math.ceil(Math.abs(n));
  const value =
    (magnitude % 2 === (even ? 0 : 1) ? magnitude : magnitude + 1) *
    Math.sign(n);
  return Number.isFinite(value) ? value : formulaError("NUM");
}
function numericFold(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  initial: number,
  operation: (total: number, value: number) => number,
): FormulaValue {
  let result = initial;
  for (let i = 0; i < context.argumentCount; i += 1) {
    const argument = context.evaluateArgument(i);
    for (const value of values(argument)) {
      if (isFormulaError(value)) return value;
      if (typeof value === "number") {
        result = operation(result, value);
        if (!Number.isFinite(result)) return formulaError("NUM");
      }
    }
  }
  return result;
}
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function integerFold(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  operation: (a: number, b: number) => number,
  initial: number,
  rejectUnsafe = false,
): FormulaValue {
  let result = initial;
  for (let i = 0; i < context.argumentCount; i += 1) {
    const argument = context.evaluateArgument(i);
    for (const value of values(argument)) {
      if (isFormulaError(value)) return value;
      if (typeof value !== "number") continue;
      if (value < 0 || (rejectUnsafe && value >= Number.MAX_SAFE_INTEGER))
        return formulaError("NUM");
      result = operation(result, Math.trunc(value));
      if (!Number.isFinite(result)) return formulaError("NUM");
    }
  }
  return result;
}
function roundWith(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  mode: "up" | "down",
): FormulaValue {
  const n = directNumber(context.evaluateArgument(0));
  const d = directNumber(context.evaluateArgument(1));
  if (isFormulaError(n)) return n;
  if (isFormulaError(d)) return d;
  const factor = 10 ** Math.trunc(d);
  if (!Number.isFinite(factor)) return formulaError("NUM");
  return (
    (mode === "up"
      ? Math.ceil(Math.abs(n) * factor) * Math.sign(n)
      : Math.floor(Math.abs(n) * factor) * Math.sign(n)) / factor
  );
}
function multipleRound(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  mode: "up" | "down",
): FormulaValue {
  const n = directNumber(context.evaluateArgument(0));
  const significance = directNumber(context.evaluateArgument(1));
  if (isFormulaError(n)) return n;
  if (isFormulaError(significance)) return significance;
  if (significance === 0) return 0;
  if (n * significance < 0) return formulaError("NUM");
  const result =
    (mode === "up"
      ? Math.ceil(Math.abs(n / significance))
      : Math.floor(Math.abs(n / significance))) *
    Math.abs(significance) *
    Math.sign(n);
  return Number.isFinite(result) ? result : formulaError("NUM");
}
function sumProduct(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const arrays = Array.from({ length: context.argumentCount }, (_, index) => {
    const argument = context.evaluateArgument(index);
    return [...values(argument)];
  });
  const size = arrays[0]?.length ?? 0;
  if (!arrays.every((item) => item.length === size))
    return formulaError("VALUE");
  let total = 0;
  for (let index = 0; index < size; index += 1) {
    let product = 1;
    for (const array of arrays) {
      const value = array[index];
      if (isFormulaError(value)) return value;
      product *= typeof value === "number" ? value : 0;
    }
    total += product;
  }
  return Number.isFinite(total) ? total : formulaError("NUM");
}
