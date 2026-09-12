import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionContext, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar } from "./helpers.js";

function number(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  return finiteNumber(scalar(context.evaluateArgument(index)));
}

function paymentType(
  context: FormulaFunctionContext,
  index: number,
): 0 | 1 | ReturnType<typeof formulaError> {
  if (context.argumentCount <= index) return 0;
  const value = number(context, index);
  if (isFormulaError(value)) return value;
  return value !== 0 && value !== 1 ? formulaError("NUM") : value;
}

function argumentsFor(
  context: FormulaFunctionContext,
  required: number,
): number[] | ReturnType<typeof formulaError> {
  const result: number[] = [];
  for (let index = 0; index < required; index += 1) {
    const value = number(context, index);
    if (isFormulaError(value)) return value;
    result.push(value);
  }
  return result;
}

function fv(rate: number, nper: number, pmt: number, pv: number, type: number): FormulaValue {
  if (nper < 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(pv + pmt * nper)
      : -(pv * (1 + rate) ** nper + pmt * (1 + rate * type) * (((1 + rate) ** nper - 1) / rate));
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function pv(rate: number, nper: number, pmt: number, future: number, type: number): FormulaValue {
  if (nper < 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(future + pmt * nper)
      : -(future + pmt * (1 + rate * type) * (((1 + rate) ** nper - 1) / rate)) /
        (1 + rate) ** nper;
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function pmt(
  rate: number,
  nper: number,
  present: number,
  future: number,
  type: number,
): FormulaValue {
  if (nper <= 0) return formulaError("NUM");
  const result =
    rate === 0
      ? -(present + future) / nper
      : (-(future + present * (1 + rate) ** nper) * rate) /
        ((1 + rate * type) * ((1 + rate) ** nper - 1));
  return Number.isFinite(result) ? result : formulaError("NUM");
}

function nper(
  rate: number,
  payment: number,
  present: number,
  future: number,
  type: number,
): FormulaValue {
  if (rate === 0) return payment === 0 ? formulaError("NUM") : -(present + future) / payment;
  if (rate <= -1) return formulaError("NUM");
  const adjusted = (payment * (1 + rate * type)) / rate;
  const numerator = adjusted - future;
  const denominator = present + adjusted;
  const ratio = numerator / denominator;
  if (ratio <= 0 || !Number.isFinite(ratio)) return formulaError("NUM");
  const result = Math.log(ratio) / Math.log(1 + rate);
  return Number.isFinite(result) ? result : formulaError("NUM");
}

export const FINANCIAL_FUNCTIONS = [
  defineFunction(
    {
      name: "FV",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pmt" },
        { name: "pv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const present = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(present)
        ? present
        : isFormulaError(type)
          ? type
          : fv(values[0]!, values[1]!, values[2]!, present, type);
    },
  ),
  defineFunction(
    {
      name: "PV",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pmt" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : pv(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
  defineFunction(
    {
      name: "PMT",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "nper" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : pmt(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
  defineFunction(
    {
      name: "NPER",
      category: "Financial",
      minArgs: 3,
      maxArgs: 5,
      arguments: [
        { name: "rate" },
        { name: "pmt" },
        { name: "pv" },
        { name: "fv", optional: true },
        { name: "type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const values = argumentsFor(context, 3);
      if (isFormulaError(values)) return values;
      const future = context.argumentCount > 3 ? number(context, 3) : 0;
      const type = paymentType(context, 4);
      return isFormulaError(future)
        ? future
        : isFormulaError(type)
          ? type
          : nper(values[0]!, values[1]!, values[2]!, future, type);
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
