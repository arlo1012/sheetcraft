import { createFormulaError, isFormulaError, type FormulaValue } from "../types.js";
import { isFormulaArray, scalarize } from "../runtime.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionContext,
  FormulaFunctionDefinition,
  FormulaFunctionMetadata,
} from "./contracts.js";

export const formulaError = (code: "DIV0" | "VALUE" | "NUM" | "NA" | "REF") =>
  createFormulaError(code);

export function defineFunction(
  metadata: FormulaFunctionMetadata,
  evaluate: FormulaFunctionDefinition["evaluate"],
  selectDependencyArguments?: FormulaFunctionDefinition["selectDependencyArguments"],
): FormulaFunctionDefinition {
  return { metadata, evaluate, selectDependencyArguments };
}

export function scalar(argument: FormulaFunctionArgument): FormulaValue {
  return argument.kind === "scalar" ? scalarize(argument.value) : formulaError("VALUE");
}

/** Distinguishes an empty argument slot from a reference whose computed value is blank. */
export function isOmittedArgument(argument: FormulaFunctionArgument): boolean {
  return argument.kind === "scalar" && argument.source === "omitted";
}

export function finiteNumber(value: FormulaValue): number | ReturnType<typeof formulaError> {
  if (isFormulaError(value)) return value;
  return typeof value === "number" && Number.isFinite(value) ? value : formulaError("VALUE");
}

export function integer(value: FormulaValue): number | ReturnType<typeof formulaError> {
  const number = finiteNumber(value);
  return isFormulaError(number) ? number : Math.trunc(number);
}

export function condition(value: FormulaValue): boolean | ReturnType<typeof formulaError> {
  if (isFormulaError(value)) return value;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value !== 0 : formulaError("VALUE");
  return formulaError("VALUE");
}

export function values(argument: FormulaFunctionArgument): Iterable<FormulaValue> {
  if (argument.kind === "range") return argument.values;
  const value = argument.value;
  return isFormulaArray(value) ? value.rows.flat() : [scalarize(value)];
}

export function argumentsValues(
  context: FormulaFunctionContext,
): Iterable<[FormulaFunctionArgument, FormulaValue]> {
  return (function* () {
    for (let index = 0; index < context.argumentCount; index += 1) {
      const argument = context.evaluateArgument(index);
      for (const value of values(argument))
        yield [argument, value] as [FormulaFunctionArgument, FormulaValue];
    }
  })();
}

export function flatten(context: FormulaFunctionContext): FormulaValue[] {
  return [...argumentsValues(context)].map(([, value]) => value);
}

export function compareValues(
  left: FormulaValue,
  right: FormulaValue,
): number | ReturnType<typeof formulaError> {
  if (isFormulaError(left)) return left;
  if (isFormulaError(right)) return right;
  if (typeof left === "number" && typeof right === "number")
    return left === right ? 0 : left < right ? -1 : 1;
  const a = left === null ? "" : String(left).toLocaleUpperCase();
  const b = right === null ? "" : String(right).toLocaleUpperCase();
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Excel wildcard matching: * and ? match text, and ~ escapes either character. */
export function wildcardMatch(value: string, pattern: string): boolean {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "~" && index + 1 < pattern.length) {
      expression += escapeRegExp(pattern[index + 1]!);
      index += 1;
    } else {
      expression += character === "*" ? ".*" : character === "?" ? "." : escapeRegExp(character);
    }
  }
  return new RegExp(`${expression}$`, "i").test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function roundAwayFromZero(value: number, digits: number): FormulaValue {
  const roundedDigits = Math.trunc(digits);
  if (!Number.isFinite(roundedDigits) || Math.abs(roundedDigits) > 308) return formulaError("NUM");
  const shifted = shiftDecimal(Math.abs(value), roundedDigits);
  if (!Number.isFinite(shifted)) return formulaError("NUM");
  const result = Math.sign(value) * shiftDecimal(Math.round(shifted), -roundedDigits);
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function shiftDecimal(value: number, exponent: number): number {
  const [coefficient, scientificExponent = "0"] = value.toString().toLowerCase().split("e");
  return Number(`${coefficient}e${Number(scientificExponent) + exponent}`);
}
