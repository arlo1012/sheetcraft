import { isFormulaError, type FormulaValue } from "../types.js";
import { formulaArray } from "../runtime.js";
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

function range(
  argument: FormulaFunctionArgument,
): FormulaValue[] | ReturnType<typeof formulaError> {
  return argument.kind === "range"
    ? [...argument.values]
    : formulaError("VALUE");
}
function dimensions(
  argument: FormulaFunctionArgument,
): { rows: number; columns: number } | ReturnType<typeof formulaError> {
  if (argument.kind !== "range" || !argument.bounds)
    return formulaError("VALUE");
  return {
    rows: argument.bounds.end.row - argument.bounds.start.row + 1,
    columns: argument.bounds.end.column - argument.bounds.start.column + 1,
  };
}
function exactIndex(
  lookup: FormulaValue,
  values: FormulaValue[],
  wildcard = false,
  reverse = false,
): number | ReturnType<typeof formulaError> {
  const indexes = reverse ? [...values.keys()].reverse() : [...values.keys()];
  for (const index of indexes) {
    const value = values[index]!;
    const comparison = compareValues(value, lookup);
    if (isFormulaError(comparison)) return comparison;
    if (
      comparison === 0 ||
      (wildcard &&
        typeof lookup === "string" &&
        wildcardMatch(String(value ?? ""), lookup))
    )
      return index;
  }
  return formulaError("NA");
}
function approximateIndex(
  lookup: FormulaValue,
  values: FormulaValue[],
  descending = false,
): number | ReturnType<typeof formulaError> {
  let result = -1;
  for (let index = 0; index < values.length; index += 1) {
    const comparison = compareValues(values[index]!, lookup);
    if (isFormulaError(comparison)) return comparison;
    if (comparison === 0) return index;
    if (descending ? comparison >= 0 : comparison <= 0) result = index;
    else break;
  }
  return result < 0 ? formulaError("NA") : result;
}
export const LOOKUP_FUNCTIONS = [
  defineFunction(
    {
      name: "INDEX",
      category: "Lookup",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "array" },
        { name: "row_num" },
        { name: "column_num", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const array = range(context.evaluateArgument(0));
      const shape = dimensions(context.evaluateArgument(0));
      const row = finiteNumber(scalar(context.evaluateArgument(1)));
      const column =
        context.argumentCount === 3
          ? finiteNumber(scalar(context.evaluateArgument(2)))
          : 1;
      if (isFormulaError(array)) return array;
      if (isFormulaError(shape)) return shape;
      if (isFormulaError(row)) return row;
      if (isFormulaError(column)) return column;
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        row < 0 ||
        column < 0 ||
        row > shape.rows ||
        column > shape.columns ||
        (row === 0 && column === 0 && shape.rows === 0)
      )
        return formulaError("REF");
      if (row === 0 && column === 0)
        return formulaArray(
          Array.from({ length: shape.rows }, (_, index) =>
            array.slice(index * shape.columns, (index + 1) * shape.columns),
          ),
        );
      if (row === 0)
        return formulaArray(
          Array.from({ length: shape.rows }, (_, index) => [
            array[index * shape.columns + column - 1] ?? null,
          ]),
        );
      if (column === 0)
        return formulaArray([
          array.slice((row - 1) * shape.columns, row * shape.columns),
        ]);
      return array[(row - 1) * shape.columns + column - 1] ?? null;
    },
  ),
  defineFunction(
    {
      name: "MATCH",
      category: "Lookup",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "lookup_value" },
        { name: "lookup_array" },
        { name: "match_type", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const lookup = scalar(context.evaluateArgument(0));
      const array = range(context.evaluateArgument(1));
      const type =
        context.argumentCount === 3
          ? finiteNumber(scalar(context.evaluateArgument(2)))
          : 1;
      if (isFormulaError(lookup)) return lookup;
      if (isFormulaError(array)) return array;
      if (isFormulaError(type) || ![1, 0, -1].includes(type))
        return isFormulaError(type) ? type : formulaError("NUM");
      const index =
        type === 0
          ? exactIndex(lookup, array, true)
          : approximateIndex(lookup, array, type === -1);
      return isFormulaError(index) ? index : index + 1;
    },
  ),
  defineFunction(
    {
      name: "VLOOKUP",
      category: "Lookup",
      minArgs: 3,
      maxArgs: 4,
      arguments: [
        { name: "lookup_value" },
        { name: "table_array" },
        { name: "col_index_num" },
        { name: "range_lookup", optional: true },
      ],
      lazy: false,
    },
    (context) => vertical(context, "VLOOKUP"),
  ),
  defineFunction(
    {
      name: "HLOOKUP",
      category: "Lookup",
      minArgs: 3,
      maxArgs: 4,
      arguments: [
        { name: "lookup_value" },
        { name: "table_array" },
        { name: "row_index_num" },
        { name: "range_lookup", optional: true },
      ],
      lazy: false,
    },
    (context) => vertical(context, "HLOOKUP"),
  ),
  defineFunction(
    {
      name: "XLOOKUP",
      category: "Lookup",
      minArgs: 3,
      maxArgs: 6,
      arguments: [
        { name: "lookup_value" },
        { name: "lookup_array" },
        { name: "return_array" },
        { name: "if_not_found", optional: true },
        { name: "match_mode", optional: true },
        { name: "search_mode", optional: true },
      ],
      lazy: false,
    },
    xlookup,
  ),
  defineFunction(
    {
      name: "XMATCH",
      category: "Lookup",
      minArgs: 2,
      maxArgs: 4,
      arguments: [
        { name: "lookup_value" },
        { name: "lookup_array" },
        { name: "match_mode", optional: true },
        { name: "search_mode", optional: true },
      ],
      lazy: false,
    },
    xmatch,
  ),
  defineFunction(
    {
      name: "LOOKUP",
      category: "Lookup",
      minArgs: 2,
      maxArgs: 3,
      arguments: [
        { name: "lookup_value" },
        { name: "lookup_vector" },
        { name: "result_vector", optional: true },
      ],
      lazy: false,
    },
    lookup,
  ),
  defineFunction(
    {
      name: "CHOOSE",
      category: "Lookup",
      minArgs: 2,
      maxArgs: null,
      arguments: [
        { name: "index_num" },
        { name: "value1" },
        { name: "value2", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const index = finiteNumber(scalar(context.evaluateArgument(0)));
      if (isFormulaError(index)) return index;
      return !Number.isInteger(index) ||
        index < 1 ||
        index >= context.argumentCount
        ? formulaError("VALUE")
        : scalar(context.evaluateArgument(index));
    },
  ),
  defineFunction(
    {
      name: "AREAS",
      category: "Lookup",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "reference" }],
      lazy: false,
    },
    () => 1,
  ),
  defineFunction(
    {
      name: "ROWS",
      category: "Lookup",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "array" }],
      lazy: false,
    },
    (context) => {
      const size = dimensions(context.evaluateArgument(0));
      return isFormulaError(size) ? size : size.rows;
    },
  ),
  defineFunction(
    {
      name: "COLUMNS",
      category: "Lookup",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "array" }],
      lazy: false,
    },
    (context) => {
      const size = dimensions(context.evaluateArgument(0));
      return isFormulaError(size) ? size : size.columns;
    },
  ),
  defineFunction(
    {
      name: "ROW",
      category: "Lookup",
      minArgs: 0,
      maxArgs: 1,
      arguments: [{ name: "reference", optional: true }],
      lazy: false,
    },
    (context) => coordinate(context, "row"),
  ),
  defineFunction(
    {
      name: "COLUMN",
      category: "Lookup",
      minArgs: 0,
      maxArgs: 1,
      arguments: [{ name: "reference", optional: true }],
      lazy: false,
    },
    (context) => coordinate(context, "column"),
  ),
  defineFunction(
    {
      name: "ADDRESS",
      category: "Lookup",
      minArgs: 2,
      maxArgs: 5,
      arguments: [
        { name: "row_num" },
        { name: "column_num" },
        { name: "abs_num", optional: true },
        { name: "a1", optional: true },
        { name: "sheet_text", optional: true },
      ],
      lazy: false,
    },
    address,
  ),
] as const satisfies readonly FormulaFunctionDefinition[];

function xmatch(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const lookupValue = scalar(context.evaluateArgument(0));
  const array = range(context.evaluateArgument(1));
  const mode =
    context.argumentCount >= 3
      ? finiteNumber(scalar(context.evaluateArgument(2)))
      : 0;
  const search =
    context.argumentCount === 4
      ? finiteNumber(scalar(context.evaluateArgument(3)))
      : 1;
  if (isFormulaError(lookupValue)) return lookupValue;
  if (isFormulaError(array)) return array;
  if (
    isFormulaError(mode) ||
    isFormulaError(search) ||
    ![0, -1, 1, 2].includes(mode) ||
    ![1, -1, 2, -2].includes(search)
  )
    return formulaError("VALUE");
  const found =
    search === 2 || search === -2
      ? binaryLookup(lookupValue, array, mode, search === -2)
      : linearLookup(lookupValue, array, mode, search === -1);
  return isFormulaError(found) ? found : found + 1;
}
function lookup(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const lookupValue = scalar(context.evaluateArgument(0));
  if (isFormulaError(lookupValue)) return lookupValue;
  const lookupArgument = context.evaluateArgument(1);
  const table = range(lookupArgument);
  const shape = dimensions(lookupArgument);
  if (isFormulaError(table)) return table;
  if (isFormulaError(shape)) return shape;
  let keys: FormulaValue[];
  let returns: FormulaValue[];
  if (context.argumentCount === 2) {
    if (shape.rows >= shape.columns) {
      keys = Array.from(
        { length: shape.rows },
        (_, row) => table[row * shape.columns]!,
      );
      returns = Array.from(
        { length: shape.rows },
        (_, row) => table[(row + 1) * shape.columns - 1]!,
      );
    } else {
      keys = table.slice(0, shape.columns);
      returns = table.slice((shape.rows - 1) * shape.columns);
    }
  } else {
    const returnArgument = context.evaluateArgument(2);
    const result = range(returnArgument);
    const resultShape = dimensions(returnArgument);
    if (isFormulaError(result)) return result;
    if (isFormulaError(resultShape)) return resultShape;
    if (
      (shape.rows !== 1 && shape.columns !== 1) ||
      (resultShape.rows !== 1 && resultShape.columns !== 1)
    )
      return formulaError("NA");
    keys = table;
    returns = result;
  }
  if (keys.length !== returns.length) return formulaError("NA");
  let found = -1;
  for (let i = 0; i < keys.length; i += 1) {
    const comparison = compareValues(keys[i]!, lookupValue);
    if (isFormulaError(comparison)) return comparison;
    if (comparison <= 0) found = i;
    else break;
  }
  return found < 0 ? formulaError("NA") : returns[found]!;
}
function coordinate(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  part: "row" | "column",
): FormulaValue {
  if (context.argumentCount === 0)
    return context.address ? context.address[part] + 1 : formulaError("VALUE");
  const argument = context.evaluateArgument(0);
  const address =
    argument.kind === "range" ? argument.bounds?.start : argument.address;
  return address ? address[part] + 1 : formulaError("VALUE");
}
function address(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const row = finiteNumber(scalar(context.evaluateArgument(0)));
  const column = finiteNumber(scalar(context.evaluateArgument(1)));
  const abs =
    context.argumentCount >= 3
      ? finiteNumber(scalar(context.evaluateArgument(2)))
      : 1;
  const a1 =
    context.argumentCount >= 4 ? scalar(context.evaluateArgument(3)) : true;
  const sheet =
    context.argumentCount === 5 ? scalar(context.evaluateArgument(4)) : null;
  if (isFormulaError(row)) return row;
  if (isFormulaError(column)) return column;
  if (isFormulaError(abs)) return abs;
  if (isFormulaError(a1) || (typeof a1 !== "boolean" && typeof a1 !== "number"))
    return formulaError("VALUE");
  if (isFormulaError(sheet) || (sheet !== null && typeof sheet !== "string"))
    return formulaError("VALUE");
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 1 ||
    column < 1 ||
    ![1, 2, 3, 4].includes(abs)
  )
    return formulaError("VALUE");
  const useA1 = typeof a1 === "boolean" ? a1 : a1 !== 0;
  let letters = "";
  for (let index = column; index; index = Math.floor((index - 1) / 26))
    letters = String.fromCharCode(65 + ((index - 1) % 26)) + letters;
  const reference = useA1
    ? `${abs === 1 || abs === 3 ? "$" : ""}${letters}${abs === 1 || abs === 2 ? "$" : ""}${row}`
    : `${abs === 1 || abs === 2 ? "R" + row : "R[" + row + "]"}${abs === 1 || abs === 3 ? "C" + column : "C[" + column + "]"}`;
  return sheet === null
    ? reference
    : `${sheet.includes(" ") ? `'${sheet.replaceAll("'", "''")}'` : sheet}!${reference}`;
}
function vertical(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  direction: "VLOOKUP" | "HLOOKUP",
): FormulaValue {
  const lookup = scalar(context.evaluateArgument(0));
  const table = range(context.evaluateArgument(1));
  const shape = dimensions(context.evaluateArgument(1));
  const index = finiteNumber(scalar(context.evaluateArgument(2)));
  const approximate =
    context.argumentCount === 4 ? scalar(context.evaluateArgument(3)) : true;
  if (isFormulaError(lookup)) return lookup;
  if (isFormulaError(table)) return table;
  if (isFormulaError(shape)) return shape;
  if (isFormulaError(index)) return index;
  const approximateMatch =
    typeof approximate === "boolean"
      ? approximate
      : typeof approximate === "number"
        ? approximate !== 0
        : null;
  if (approximateMatch === null || !Number.isInteger(index))
    return formulaError("VALUE");
  const max = direction === "VLOOKUP" ? shape.columns : shape.rows;
  if (index < 1 || index > max) return formulaError("REF");
  const candidates =
    direction === "VLOOKUP"
      ? Array.from({ length: shape.rows }, (_, r) => table[r * shape.columns]!)
      : table.slice(0, shape.columns);
  const found = approximateMatch
    ? approximateIndex(lookup, candidates)
    : exactIndex(lookup, candidates);
  if (isFormulaError(found)) return found;
  return direction === "VLOOKUP"
    ? table[found * shape.columns + index - 1]!
    : table[(index - 1) * shape.columns + found]!;
}
function xlookup(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
): FormulaValue {
  const lookup = scalar(context.evaluateArgument(0));
  const keys = range(context.evaluateArgument(1));
  const returns = range(context.evaluateArgument(2));
  if (isFormulaError(lookup)) return lookup;
  if (isFormulaError(keys)) return keys;
  if (isFormulaError(returns)) return returns;
  if (keys.length !== returns.length) return formulaError("VALUE");
  const ifMissing =
    context.argumentCount >= 4
      ? scalar(context.evaluateArgument(3))
      : formulaError("NA");
  const mode =
    context.argumentCount >= 5
      ? finiteNumber(scalar(context.evaluateArgument(4)))
      : 0;
  const search =
    context.argumentCount >= 6
      ? finiteNumber(scalar(context.evaluateArgument(5)))
      : 1;
  if (
    isFormulaError(mode) ||
    isFormulaError(search) ||
    ![0, -1, 1, 2].includes(mode) ||
    ![1, -1, 2, -2].includes(search)
  )
    return formulaError("VALUE");
  const found =
    search === 2 || search === -2
      ? binaryLookup(lookup, keys, mode, search === -2)
      : linearLookup(lookup, keys, mode, search === -1);
  return isFormulaError(found) ? ifMissing : returns[found]!;
}
function linearLookup(
  lookup: FormulaValue,
  values: FormulaValue[],
  mode: number,
  reverse: boolean,
): number | ReturnType<typeof formulaError> {
  if (mode === 0 || mode === 2)
    return exactIndex(lookup, values, mode === 2, reverse);
  const indexes = reverse ? [...values.keys()].reverse() : [...values.keys()];
  let closest = -1;
  for (const index of indexes) {
    const comparison = compareValues(values[index]!, lookup);
    if (isFormulaError(comparison)) return comparison;
    if (comparison === 0) return index;
    if ((mode === -1 && comparison <= 0) || (mode === 1 && comparison >= 0))
      closest = index;
  }
  return closest < 0 ? formulaError("NA") : closest;
}
function binaryLookup(
  lookup: FormulaValue,
  values: FormulaValue[],
  mode: number,
  descending: boolean,
): number | ReturnType<typeof formulaError> {
  let low = 0,
    high = values.length - 1,
    closest = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const comparison = compareValues(values[middle]!, lookup);
    if (isFormulaError(comparison)) return comparison;
    if (comparison === 0) return middle;
    if ((mode === -1 && comparison < 0) || (mode === 1 && comparison > 0))
      closest = middle;
    const ordered = descending ? -comparison : comparison;
    if (ordered < 0) low = middle + 1;
    else high = middle - 1;
  }
  return closest < 0 ? formulaError("NA") : closest;
}
