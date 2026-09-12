import { isFormulaError, type FormulaValue } from "../types.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionDefinition,
} from "./contracts.js";
import {
  compareValues,
  defineFunction,
  finiteNumber,
  formulaError,
  scalar,
  wildcardMatch,
} from "./helpers.js";

function aggregateNumbers(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  directCoercion = true,
): number[] | FormulaValue {
  const result: number[] = [];
  for (let index = 0; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    for (const value of argument.kind === "range"
      ? argument.values
      : [argument.value]) {
      if (isFormulaError(value)) return value;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return formulaError("VALUE");
        result.push(value);
      } else if (
        directCoercion &&
        argument.kind === "scalar" &&
        argument.source !== "reference"
      ) {
        if (typeof value === "boolean") result.push(Number(value));
        else if (
          typeof value === "string" &&
          value.trim() !== "" &&
          Number.isFinite(Number(value))
        )
          result.push(Number(value));
      }
    }
  }
  return result;
}
function numericAggregate(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  operation: "average" | "min" | "max",
): FormulaValue {
  const values = aggregateNumbers(context);
  if (!Array.isArray(values)) return values;
  if (operation === "average") {
    if (!values.length) return formulaError("DIV0");
    let mean = 0;
    for (let index = 0; index < values.length; index += 1)
      mean += (values[index]! - mean) / (index + 1);
    return Number.isFinite(mean) ? mean : formulaError("NUM");
  }
  return values.length
    ? operation === "min"
      ? Math.min(...values)
      : Math.max(...values)
    : 0;
}
function argumentValues(argument: FormulaFunctionArgument): FormulaValue[] {
  return argument.kind === "range" ? [...argument.values] : [argument.value];
}
function criteriaMatch(
  value: FormulaValue,
  criteria: FormulaValue,
): boolean | FormulaValue {
  if (isFormulaError(value)) return value;
  if (isFormulaError(criteria)) return criteria;
  if (typeof criteria === "string") {
    const found = criteria.match(/^(<=|>=|<>|=|<|>)(.*)$/);
    const operator = found?.[1] ?? "=";
    const operand = found?.[2] ?? criteria;
    const numeric = Number(operand);
    const right: FormulaValue =
      operand !== "" && Number.isFinite(numeric) ? numeric : operand;
    const comparison = compareValues(value, right);
    if (isFormulaError(comparison)) return comparison;
    const matches = /[*?~]/.test(operand)
      ? wildcardMatch(String(value ?? ""), operand)
      : comparison === 0;
    if (operator === "=") return matches;
    if (operator === "<>") return !matches;
    if (operator === ">") return comparison > 0;
    if (operator === ">=") return comparison >= 0;
    if (operator === "<") return comparison < 0;
    return comparison <= 0;
  }
  const comparison = compareValues(value, criteria);
  return isFormulaError(comparison) ? comparison : comparison === 0;
}
function sameShape(
  left: FormulaFunctionArgument,
  right: FormulaFunctionArgument,
): boolean {
  if (left.kind !== "range" || right.kind !== "range")
    return argumentValues(left).length === argumentValues(right).length;
  if (!left.bounds || !right.bounds)
    return argumentValues(left).length === argumentValues(right).length;
  return (
    left.bounds.end.row - left.bounds.start.row ===
      right.bounds.end.row - right.bounds.start.row &&
    left.bounds.end.column - left.bounds.start.column ===
      right.bounds.end.column - right.bounds.start.column
  );
}
function anchoredValue(
  target: FormulaFunctionArgument,
  anchor: FormulaFunctionArgument,
  index: number,
): FormulaValue {
  if (anchor.kind !== "range" || !anchor.bounds)
    return argumentValues(target)[index] ?? null;
  const origin =
    target.kind === "range" ? target.bounds?.start : target.address;
  const read = target.getValue;
  if (!origin) return argumentValues(target)[index] ?? null;
  const width = anchor.bounds.end.column - anchor.bounds.start.column + 1;
  const row = origin.row + Math.floor(index / width);
  const column = origin.column + (index % width);
  if (read) return read(row, column);
  if (target.kind === "scalar") return index === 0 ? target.value : null;
  if (!target.bounds) return argumentValues(target)[index] ?? null;
  const targetWidth = target.bounds.end.column - target.bounds.start.column + 1;
  return row <= target.bounds.end.row && column <= target.bounds.end.column
    ? (argumentValues(target)[
        (row - target.bounds.start.row) * targetWidth +
          column -
          target.bounds.start.column
      ] ?? null)
    : null;
}
function conditional(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  mode: "count" | "sum" | "average",
  anchorValueRange = false,
): FormulaValue {
  const anchor = context.evaluateArgument(0);
  const criteriaRange = argumentValues(anchor);
  const criteriaPairs =
    mode === "count" ? context.argumentCount - 1 : context.argumentCount - 2;
  const valueArgument =
    mode === "count"
      ? undefined
      : context.evaluateArgument(context.argumentCount - 1);
  if (valueArgument && !anchorValueRange && !sameShape(valueArgument, anchor))
    return formulaError("VALUE");
  let count = 0;
  let total = 0;
  let mean = 0;
  for (let row = 0; row < criteriaRange.length; row += 1) {
    let matches = true;
    for (let pair = 0; pair < criteriaPairs; pair += 2) {
      const rangeArgument = context.evaluateArgument(pair);
      if (!sameShape(rangeArgument, anchor)) return formulaError("VALUE");
      const range = argumentValues(rangeArgument);
      const match = criteriaMatch(
        range[row]!,
        scalar(context.evaluateArgument(pair + 1)),
      );
      if (isFormulaError(match)) return match;
      if (!match) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (mode === "count") {
      count += 1;
      continue;
    }
    const value = anchorValueRange
      ? anchoredValue(valueArgument!, anchor, row)
      : argumentValues(valueArgument!)[row]!;
    if (isFormulaError(value)) return value;
    if (typeof value === "number") {
      count += 1;
      if (mode === "sum") {
        total += value;
        if (!Number.isFinite(total)) return formulaError("NUM");
      } else {
        mean += (value - mean) / count;
        if (!Number.isFinite(mean)) return formulaError("NUM");
      }
    }
  }
  return mode === "count"
    ? count
    : mode === "sum"
      ? total
      : count
        ? mean
        : formulaError("DIV0");
}

export const STATISTICAL_FUNCTIONS = [
  defineFunction(
    {
      name: "AVERAGE",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => numericAggregate(context, "average"),
  ),
  defineFunction(
    {
      name: "COUNT",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "value1" }, { name: "value2", optional: true }],
      lazy: false,
    },
    count,
  ),
  defineFunction(
    {
      name: "COUNTA",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "value1" }, { name: "value2", optional: true }],
      lazy: false,
    },
    (context) => {
      let count = 0;
      for (let i = 0; i < context.argumentCount; i += 1)
        for (const value of argumentValues(context.evaluateArgument(i)))
          if (value !== null) count += 1;
      return count;
    },
  ),
  defineFunction(
    {
      name: "COUNTBLANK",
      category: "Statistical",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "range" }],
      lazy: false,
    },
    (context) =>
      argumentValues(context.evaluateArgument(0)).filter(
        (value) => value === null || value === "",
      ).length,
  ),
  defineFunction(
    {
      name: "MIN",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => numericAggregate(context, "min"),
  ),
  defineFunction(
    {
      name: "MAX",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => numericAggregate(context, "max"),
  ),
  defineFunction(
    {
      name: "COUNTIF",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "range" }, { name: "criteria" }],
      lazy: false,
    },
    (context) => conditional(context, "count"),
  ),
  defineFunction(
    {
      name: "COUNTIFS",
      category: "Statistical",
      minArgs: 2,
      maxArgs: null,
      arguments: [{ name: "criteria_range1" }, { name: "criteria1" }],
      lazy: false,
    },
    (context) =>
      context.argumentCount % 2 === 0
        ? conditional(context, "count")
        : formulaError("VALUE"),
  ),
  defineFunction(
    {
      name: "SUMIF",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "range" },
        { name: "criteria" },
        { name: "sum_range", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      if (context.argumentCount === 2)
        return conditional(
          {
            ...context,
            argumentCount: 3,
            evaluateArgument: (i) =>
              i === 2
                ? context.evaluateArgument(0)
                : context.evaluateArgument(i),
          },
          "sum",
          true,
        );
      return conditional(context, "sum", true);
    },
  ),
  defineFunction(
    {
      name: "SUMIFS",
      category: "Statistical",
      minArgs: 3,
      maxArgs: null,
      arguments: [
        { name: "sum_range" },
        { name: "criteria_range1" },
        { name: "criteria1" },
      ],
      lazy: false,
    },
    (context) => {
      if (context.argumentCount % 2 === 0) return formulaError("VALUE");
      const sum = context.evaluateArgument(0);
      return conditional(
        {
          ...context,
          argumentCount: context.argumentCount,
          evaluateArgument: (i) =>
            i === context.argumentCount - 1
              ? sum
              : context.evaluateArgument(i + 1),
        },
        "sum",
      );
    },
  ),
  defineFunction(
    {
      name: "AVERAGEIF",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "range" },
        { name: "criteria" },
        { name: "average_range", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      if (context.argumentCount === 2)
        return conditional(
          {
            ...context,
            argumentCount: 3,
            evaluateArgument: (i) =>
              i === 2
                ? context.evaluateArgument(0)
                : context.evaluateArgument(i),
          },
          "average",
          true,
        );
      return conditional(context, "average", true);
    },
  ),
  defineFunction(
    {
      name: "AVERAGEIFS",
      category: "Statistical",
      minArgs: 3,
      maxArgs: null,
      arguments: [
        { name: "average_range" },
        { name: "criteria_range1" },
        { name: "criteria1" },
      ],
      lazy: false,
    },
    (context) => {
      if (context.argumentCount % 2 === 0) return formulaError("VALUE");
      const average = context.evaluateArgument(0);
      return conditional(
        {
          ...context,
          argumentCount: context.argumentCount,
          evaluateArgument: (i) =>
            i === context.argumentCount - 1
              ? average
              : context.evaluateArgument(i + 1),
        },
        "average",
      );
    },
  ),
  defineFunction(
    {
      name: "MEDIAN",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => {
      const values = aggregateNumbers(context);
      if (!Array.isArray(values)) return values;
      if (!values.length) return formulaError("NUM");
      values.sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      return values.length % 2
        ? values[middle]!
        : values[middle - 1]! / 2 + values[middle]! / 2;
    },
  ),
  defineFunction(
    {
      name: "LARGE",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "array" }, { name: "k" }],
      lazy: false,
    },
    (context) => nth(context, "large"),
  ),
  defineFunction(
    {
      name: "SMALL",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "array" }, { name: "k" }],
      lazy: false,
    },
    (context) => nth(context, "small"),
  ),
  defineFunction(
    {
      name: "RANK",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "ref" },
        { name: "order", optional: true },
      ],
      lazy: false,
    },
    rank,
  ),
  defineFunction(
    {
      name: "RANK.EQ",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "ref" },
        { name: "order", optional: true },
      ],
      lazy: false,
    },
    rank,
  ),
  defineFunction(
    {
      name: "RANK.AVG",
      category: "Statistical",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "number" },
        { name: "ref" },
        { name: "order", optional: true },
      ],
      lazy: false,
    },
    rankAverage,
  ),
  ...[
    "VAR.S",
    "VAR.P",
    "STDEV.S",
    "STDEV.P",
    "AVEDEV",
    "DEVSQ",
    "GEOMEAN",
    "HARMEAN",
  ].map((name) =>
    defineFunction(
      {
        name,
        category: "Statistical",
        minArgs: 1,
        maxArgs: null,
        arguments: [{ name: "number1" }, { name: "number2", optional: true }],
        lazy: false,
      },
      (context) => dispersion(context, name),
    ),
  ),
  ...["PERCENTILE.INC", "PERCENTILE.EXC", "QUARTILE.INC", "QUARTILE.EXC"].map(
    (name) =>
      defineFunction(
        {
          name,
          category: "Statistical",
          minArgs: 2,
          maxArgs: 2,
          arguments: [
            { name: "array" },
            { name: name.startsWith("QUARTILE") ? "quart" : "k" },
          ],
          lazy: false,
        },
        (context) =>
          percentile(
            context,
            name.endsWith(".EXC"),
            name.startsWith("QUARTILE"),
          ),
      ),
  ),
  ...["PERCENTRANK.INC", "PERCENTRANK.EXC"].map((name) =>
    defineFunction(
      {
        name,
        category: "Statistical",
        minArgs: 2,
        maxArgs: 3,
        arguments: [
          { name: "array" },
          { name: "x" },
          { name: "significance", optional: true },
        ],
        lazy: false,
      },
      (context) => percentRank(context, name.endsWith(".EXC")),
    ),
  ),
  defineFunction(
    {
      name: "MODE.SNGL",
      category: "Statistical",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    modeSingle,
  ),
  defineFunction(
    {
      name: "STDEV",
      category: "Compatibility",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => dispersion(context, "STDEV.S"),
  ),
  defineFunction(
    {
      name: "STDEVP",
      category: "Compatibility",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => dispersion(context, "STDEV.P"),
  ),
  defineFunction(
    {
      name: "VAR",
      category: "Compatibility",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => dispersion(context, "VAR.S"),
  ),
  defineFunction(
    {
      name: "VARP",
      category: "Compatibility",
      minArgs: 1,
      maxArgs: null,
      arguments: [{ name: "number1" }, { name: "number2", optional: true }],
      lazy: false,
    },
    (context) => dispersion(context, "VAR.P"),
  ),
  defineFunction(
    {
      name: "PERCENTILE",
      category: "Compatibility",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "array" }, { name: "k" }],
      lazy: false,
    },
    (context) => percentile(context, false, false),
  ),
  defineFunction(
    {
      name: "QUARTILE",
      category: "Compatibility",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "array" }, { name: "quart" }],
      lazy: false,
    },
    (context) => percentile(context, false, true),
  ),
  defineFunction(
    {
      name: "PERCENTRANK",
      category: "Compatibility",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "array" },
        { name: "x" },
        { name: "significance", optional: true },
      ],
      lazy: false,
    },
    (context) => percentRank(context, false),
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

function numericValues(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): number[] | FormulaValue {
  return aggregateNumbers(context);
}
function dispersion(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  kind: string,
): FormulaValue {
  const values = numericValues(context);
  if (!Array.isArray(values)) return values;
  if (!values.length) return formulaError("DIV0");
  if (kind === "GEOMEAN") {
    if (values.some((value) => value <= 0)) return formulaError("NUM");
    const result = Math.exp(
      values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
    );
    return Number.isFinite(result) ? result : formulaError("NUM");
  }
  if (kind === "HARMEAN") {
    if (values.some((value) => value <= 0)) return formulaError("NUM");
    return values.length / values.reduce((sum, value) => sum + 1 / value, 0);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (kind === "DEVSQ") return squares;
  if (kind === "AVEDEV")
    return (
      values.reduce((sum, value) => sum + Math.abs(value - mean), 0) /
      values.length
    );
  const sample = kind.endsWith(".S");
  if (sample && values.length < 2) return formulaError("DIV0");
  const variance = squares / (values.length - (sample ? 1 : 0));
  return kind.startsWith("STDEV") ? Math.sqrt(variance) : variance;
}
function rangeNumbers(
  argument: FormulaFunctionArgument,
): number[] | FormulaValue {
  const result: number[] = [];
  for (const value of argumentValues(argument)) {
    if (isFormulaError(value)) return value;
    if (typeof value === "number") result.push(value);
  }
  return result;
}
function percentile(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  exclusive: boolean,
  quartile: boolean,
): FormulaValue {
  const values = rangeNumbers(context.evaluateArgument(0));
  const kValue = finiteNumber(scalar(context.evaluateArgument(1)));
  if (!Array.isArray(values)) return values;
  if (isFormulaError(kValue)) return kValue;
  const k = quartile ? kValue / 4 : kValue;
  if (!values.length || k < 0 || k > 1 || (exclusive && (k <= 0 || k >= 1)))
    return formulaError("NUM");
  values.sort((a, b) => a - b);
  const index = exclusive
    ? k * (values.length + 1) - 1
    : k * (values.length - 1);
  if (index < 0 || index > values.length - 1) return formulaError("NUM");
  const lower = Math.floor(index);
  return (
    values[lower]! +
    (values[Math.ceil(index)]! - values[lower]!) * (index - lower)
  );
}
function percentRank(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  exclusive: boolean,
): FormulaValue {
  const values = rangeNumbers(context.evaluateArgument(0));
  const x = finiteNumber(scalar(context.evaluateArgument(1)));
  const significance =
    context.argumentCount === 3
      ? finiteNumber(scalar(context.evaluateArgument(2)))
      : 3;
  if (!Array.isArray(values)) return values;
  if (isFormulaError(x)) return x;
  if (
    isFormulaError(significance) ||
    !Number.isInteger(significance) ||
    significance < 1
  )
    return formulaError("NUM");
  values.sort((a, b) => a - b);
  const found = values.indexOf(x);
  let rank: number;
  if (found >= 0) rank = found;
  else {
    const upper = values.findIndex((value) => value > x);
    if (upper < 0 || upper === 0) return formulaError("NA");
    rank =
      upper -
      1 +
      (x - values[upper - 1]!) / (values[upper]! - values[upper - 1]!);
  }
  const denominator = exclusive ? values.length + 1 : values.length - 1;
  const offset = exclusive ? 1 : 0;
  if (denominator <= 0) return formulaError("NUM");
  return (
    Math.floor(((rank + offset) / denominator) * 10 ** significance) /
    10 ** significance
  );
}
function modeSingle(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const values = numericValues(context);
  if (!Array.isArray(values)) return values;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let mode = 0,
    maximum = 1;
  for (const [value, count] of counts)
    if (count > maximum) {
      mode = value;
      maximum = count;
    }
  return maximum === 1 ? formulaError("NA") : mode;
}
function rankAverage(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const base = rank(context);
  if (isFormulaError(base)) return base;
  if (typeof base !== "number") return formulaError("VALUE");
  const n = finiteNumber(scalar(context.evaluateArgument(0)));
  if (isFormulaError(n)) return n;
  const values = rangeNumbers(context.evaluateArgument(1));
  if (!Array.isArray(values)) return values;
  const order =
    context.argumentCount === 3
      ? finiteNumber(scalar(context.evaluateArgument(2)))
      : 0;
  if (isFormulaError(order)) return order;
  const equal = values.filter((value) => value === n).length;
  return base + (equal - 1) / 2;
}
function nth(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  order: "large" | "small",
): FormulaValue {
  const values: number[] = [];
  for (const value of argumentValues(context.evaluateArgument(0))) {
    if (isFormulaError(value)) return value;
    if (typeof value === "number") values.push(value);
  }
  const k = finiteNumber(scalar(context.evaluateArgument(1)));
  if (isFormulaError(k)) return k;
  if (!Number.isInteger(k) || k < 1 || k > values.length)
    return formulaError("NUM");
  values.sort(order === "large" ? (a, b) => b - a : (a, b) => a - b);
  return values[k - 1]!;
}
function count(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  let count = 0;
  for (let index = 0; index < context.argumentCount; index += 1) {
    const argument = context.evaluateArgument(index);
    for (const value of argumentValues(argument)) {
      if (isFormulaError(value)) {
        if (argument.kind === "scalar" && argument.source !== "reference")
          return value;
        continue;
      }
      if (typeof value === "number") count += 1;
      else if (
        argument.kind === "scalar" &&
        argument.source !== "reference" &&
        (typeof value === "boolean" ||
          (typeof value === "string" &&
            value.trim() !== "" &&
            Number.isFinite(Number(value))))
      )
        count += 1;
    }
  }
  return count;
}
function rank(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const n = finiteNumber(scalar(context.evaluateArgument(0)));
  if (isFormulaError(n)) return n;
  const values: number[] = [];
  for (const value of argumentValues(context.evaluateArgument(1))) {
    if (isFormulaError(value)) return value;
    if (typeof value === "number") values.push(value);
  }
  const order =
    context.argumentCount === 3
      ? finiteNumber(scalar(context.evaluateArgument(2)))
      : 0;
  if (isFormulaError(order)) return order;
  if (!values.includes(n)) return formulaError("NA");
  return (
    values.filter((value) => (order === 0 ? value > n : value < n)).length + 1
  );
}
