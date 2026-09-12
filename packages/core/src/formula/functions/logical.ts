import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionDefinition } from "./contracts.js";
import { condition, defineFunction, formulaError, scalar } from "./helpers.js";

function booleanAggregate(context: Parameters<FormulaFunctionDefinition["evaluate"]>[0], operator: "and" | "or" | "xor"): FormulaValue {
  let count = 0;
  let truthy = 0;
  for (let index = 0; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    for (const value of argument.kind === "range" ? argument.values : [argument.value]) {
      if (value === null || typeof value === "string") continue;
      const item = condition(value);
      if (isFormulaError(item)) return item;
      count += 1;
      if (item) truthy += 1;
    }
  }
  if (count === 0) return formulaError("VALUE");
  return operator === "and" ? truthy === count : operator === "or" ? truthy > 0 : truthy % 2 === 1;
}

export const LOGICAL_FUNCTIONS = [
  defineFunction({ name: "IF", category: "Logical", minArgs: 2, maxArgs: 3, arguments: [{ name: "logical_test" }, { name: "value_if_true" }, { name: "value_if_false", optional: true }], lazy: true }, (context) => {
    const test = condition(scalar(context.evaluateArgument(0)));
    if (isFormulaError(test)) return test;
    return context.argumentCount === 2 && !test ? false : scalar(context.evaluateArgument(test ? 1 : 2));
  }, (context) => { const test = condition(scalar(context.evaluateArgument(0))); return isFormulaError(test) ? [0] : test ? [0, 1] : context.argumentCount === 2 ? [0] : [0, 2]; }),
  defineFunction({ name: "IFERROR", category: "Logical", minArgs: 2, maxArgs: 2, arguments: [{ name: "value" }, { name: "value_if_error" }], lazy: true }, (context) => { const value = scalar(context.evaluateArgument(0)); return isFormulaError(value) ? scalar(context.evaluateArgument(1)) : value; }, (context) => isFormulaError(scalar(context.evaluateArgument(0))) ? [0, 1] : [0]),
  defineFunction({ name: "IFNA", category: "Logical", minArgs: 2, maxArgs: 2, arguments: [{ name: "value" }, { name: "value_if_na" }], lazy: true }, (context) => { const value = scalar(context.evaluateArgument(0)); return isFormulaError(value) && value.code === "NA" ? scalar(context.evaluateArgument(1)) : value; }, (context) => { const value = scalar(context.evaluateArgument(0)); return isFormulaError(value) && value.code === "NA" ? [0, 1] : [0]; }),
  defineFunction({ name: "AND", category: "Logical", minArgs: 1, maxArgs: null, arguments: [{ name: "logical1" }, { name: "logical2", optional: true }], lazy: false }, (context) => booleanAggregate(context, "and")),
  defineFunction({ name: "OR", category: "Logical", minArgs: 1, maxArgs: null, arguments: [{ name: "logical1" }, { name: "logical2", optional: true }], lazy: false }, (context) => booleanAggregate(context, "or")),
  defineFunction({ name: "XOR", category: "Logical", minArgs: 1, maxArgs: null, arguments: [{ name: "logical1" }, { name: "logical2", optional: true }], lazy: false }, (context) => booleanAggregate(context, "xor")),
  defineFunction({ name: "NOT", category: "Logical", minArgs: 1, maxArgs: 1, arguments: [{ name: "logical" }], lazy: false }, (context) => { const value = condition(scalar(context.evaluateArgument(0))); return isFormulaError(value) ? value : !value; }),
  defineFunction({ name: "TRUE", category: "Logical", minArgs: 0, maxArgs: 0, arguments: [], lazy: false }, () => true),
  defineFunction({ name: "FALSE", category: "Logical", minArgs: 0, maxArgs: 0, arguments: [], lazy: false }, () => false),
  defineFunction({ name: "IFS", category: "Logical", minArgs: 2, maxArgs: null, arguments: [{ name: "logical_test1" }, { name: "value_if_true1" }], lazy: true }, (context) => {
    if (context.argumentCount % 2 !== 0) return formulaError("VALUE");
    for (let index = 0; index < context.argumentCount; index += 2) { const test = condition(scalar(context.evaluateArgument(index))); if (isFormulaError(test)) return test; if (test) return scalar(context.evaluateArgument(index + 1)); }
    return formulaError("NA");
  }, (context) => { if (context.argumentCount % 2 !== 0) return Array.from({ length: context.argumentCount }, (_, index) => index); for (let index = 0; index < context.argumentCount; index += 2) { const test = condition(scalar(context.evaluateArgument(index))); if (isFormulaError(test) || test) return [index, ...(test ? [index + 1] : [])]; } return Array.from({ length: context.argumentCount }, (_, index) => index); }),
  defineFunction({ name: "SWITCH", category: "Logical", minArgs: 3, maxArgs: null, arguments: [{ name: "expression" }, { name: "value1" }, { name: "result1" }, { name: "default", optional: true }], lazy: true }, (context) => {
    const expression = scalar(context.evaluateArgument(0)); if (isFormulaError(expression)) return expression;
    const pairsEnd = context.argumentCount % 2 === 0 ? context.argumentCount - 1 : context.argumentCount;
    for (let index = 1; index < pairsEnd; index += 2) { const value = scalar(context.evaluateArgument(index)); if (isFormulaError(value)) return value; if (value === expression || String(value).toUpperCase() === String(expression).toUpperCase()) return scalar(context.evaluateArgument(index + 1)); }
    return context.argumentCount % 2 === 0 ? scalar(context.evaluateArgument(context.argumentCount - 1)) : formulaError("NA");
  }, (context) => {
    const expression = scalar(context.evaluateArgument(0));
    if (isFormulaError(expression)) return [0];
    const pairsEnd = context.argumentCount % 2 === 0 ? context.argumentCount - 1 : context.argumentCount;
    for (let index = 1; index < pairsEnd; index += 2) {
      const value = scalar(context.evaluateArgument(index));
      if (isFormulaError(value)) return [0, index];
      if (value === expression || String(value).toUpperCase() === String(expression).toUpperCase()) return [0, index, index + 1];
    }
    return context.argumentCount % 2 === 0 ? [0, context.argumentCount - 1] : Array.from({ length: context.argumentCount }, (_, index) => index);
  }),
] as const satisfies readonly FormulaFunctionDefinition[];
