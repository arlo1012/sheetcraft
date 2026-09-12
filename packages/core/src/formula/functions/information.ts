import { isFormulaError } from "../types.js";
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
    { name: "NA", category: "Information", minArgs: 0, maxArgs: 0, arguments: [], lazy: false },
    () => formulaError("NA"),
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
