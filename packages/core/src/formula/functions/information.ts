import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, formulaError, scalar } from "./helpers.js";

export const INFORMATION_FUNCTIONS = [
  defineFunction(
    {
      name: "ISBLANK",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => scalar(context.evaluateArgument(0)) === null,
  ),
  defineFunction(
    {
      name: "ISNUMBER",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => typeof scalar(context.evaluateArgument(0)) === "number",
  ),
  defineFunction(
    {
      name: "ISTEXT",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => typeof scalar(context.evaluateArgument(0)) === "string",
  ),
  defineFunction(
    {
      name: "ISLOGICAL",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => typeof scalar(context.evaluateArgument(0)) === "boolean",
  ),
  defineFunction(
    {
      name: "ISERROR",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => isFormulaError(scalar(context.evaluateArgument(0))),
  ),
  defineFunction(
    {
      name: "ISERR",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      return isFormulaError(value) && value.code !== "NA";
    },
  ),
  defineFunction(
    {
      name: "ISNA",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      return isFormulaError(value) && value.code === "NA";
    },
  ),
  defineFunction(
    {
      name: "NA",
      category: "Information",
      minArgs: 0,
      maxArgs: 0,
      arguments: [],
      lazy: false,
    },
    () => formulaError("NA"),
  ),
  defineFunction(
    {
      name: "N",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      if (isFormulaError(value)) return value;
      return typeof value === "number" ? value : typeof value === "boolean" ? Number(value) : 0;
    },
  ),
  defineFunction(
    {
      name: "TYPE",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      return isFormulaError(value)
        ? 16
        : typeof value === "number"
          ? 1
          : typeof value === "string"
            ? 2
            : typeof value === "boolean"
              ? 4
              : 1;
    },
  ),
  defineFunction(
    {
      name: "ERROR.TYPE",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "error_val" }],
      lazy: false,
    },
    (context) => {
      const value = scalar(context.evaluateArgument(0));
      if (!isFormulaError(value)) return formulaError("NA");
      return (
        (
          {
            NULL: 1,
            DIV0: 2,
            VALUE: 3,
            REF: 4,
            NAME: 5,
            NUM: 6,
            NA: 7,
          } as Record<string, number>
        )[value.code] ?? formulaError("NA")
      );
    },
  ),
  defineFunction(
    {
      name: "ISNONTEXT",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "value" }],
      lazy: false,
    },
    (context) => typeof scalar(context.evaluateArgument(0)) !== "string",
  ),
  defineFunction(
    {
      name: "ISEVEN",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => parity(context, true),
  ),
  defineFunction(
    {
      name: "ISODD",
      category: "Information",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "number" }],
      lazy: false,
    },
    (context) => parity(context, false),
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

function parity(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  even: boolean,
): FormulaValue {
  const value = scalar(context.evaluateArgument(0));
  return typeof value === "number" && Number.isFinite(value)
    ? Math.abs(Math.trunc(value)) % 2 === (even ? 0 : 1)
    : isFormulaError(value)
      ? value
      : formulaError("VALUE");
}
