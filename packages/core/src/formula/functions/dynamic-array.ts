import { createFormulaError, isFormulaError, type FormulaRuntimeValue, type FormulaValue } from "../types.js";
import { formulaArray, isFormulaArray, scalarize } from "../runtime.js";
import type { FormulaFunctionArgument, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, scalar } from "./helpers.js";

type Matrix = FormulaValue[][];
const error = (code: "VALUE" | "NUM" | "CALC") => createFormulaError(code);
const defineDynamic = (
  metadata: FormulaFunctionDefinition["metadata"],
  evaluate: (context: Parameters<FormulaFunctionDefinition["evaluate"]>[0]) => FormulaRuntimeValue,
) => defineFunction(metadata, evaluate as unknown as FormulaFunctionDefinition["evaluate"]);
const number = (argument: FormulaFunctionArgument): number | ReturnType<typeof error> => {
  const value = finiteNumber(scalar(argument));
  return isFormulaError(value) ? value : Math.trunc(value);
};
function matrix(argument: FormulaFunctionArgument): Matrix | FormulaValue {
  if (argument.kind === "scalar") { const value = argument.value as unknown as FormulaRuntimeValue; return isFormulaArray(value) ? value.rows.map((row) => [...row]) : [[scalarize(value)]]; }
  const bounds = argument.bounds;
  if (!bounds || !argument.getValue) return [...argument.values].map((value) => [value]);
  const rows = bounds.end.row - bounds.start.row + 1, columns = bounds.end.column - bounds.start.column + 1;
  if (rows * columns > 100_000) return error("CALC");
  return Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => argument.getValue!(bounds.start.row + r, bounds.start.column + c)));
}
function array(rows: Matrix): FormulaRuntimeValue { return formulaArray(rows); }
function dimensions(rows: Matrix): [number, number] { return [rows.length, rows[0]?.length ?? 0]; }
function compare(left: FormulaValue, right: FormulaValue): number | FormulaValue {
  if (isFormulaError(left)) return left;
  if (isFormulaError(right)) return right;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { sensitivity: "accent" });
}
function includeValue(value: FormulaValue): boolean | FormulaValue {
  if (isFormulaError(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null) return false;
  return error("VALUE");
}

export const DYNAMIC_ARRAY_FUNCTIONS = [
  defineDynamic({ name: "SEQUENCE", category: "Math", minArgs: 1, maxArgs: 4, arguments: [{ name: "rows" }, { name: "columns", optional: true }, { name: "start", optional: true }, { name: "step", optional: true }], lazy: false }, (context) => {
    const rows = number(context.evaluateArgument(0)); const columns = context.argumentCount > 1 ? number(context.evaluateArgument(1)) : 1;
    const start = context.argumentCount > 2 ? finiteNumber(scalar(context.evaluateArgument(2))) : 1; const step = context.argumentCount > 3 ? finiteNumber(scalar(context.evaluateArgument(3))) : 1;
    if (isFormulaError(rows) || isFormulaError(columns) || isFormulaError(start) || isFormulaError(step)) return isFormulaError(rows) ? rows : isFormulaError(columns) ? columns : isFormulaError(start) ? start : step;
    if (rows < 1 || columns < 1 || rows * columns > 1_000_000) return error("NUM");
    return array(Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => start + (r * columns + c) * step)));
  }),
  defineDynamic({ name: "FILTER", category: "Lookup", minArgs: 2, maxArgs: 3, arguments: [{ name: "array" }, { name: "include" }, { name: "if_empty", optional: true }], lazy: false }, (context) => {
    const source = matrix(context.evaluateArgument(0)), include = matrix(context.evaluateArgument(1)); if (!Array.isArray(source)) return source; if (!Array.isArray(include)) return include;
    const [rows, columns] = dimensions(source); const [includeRows, includeColumns] = dimensions(include);
    const byRows = includeRows === rows && includeColumns === 1, byColumns = includeRows === 1 && includeColumns === columns;
    if (!byRows && !byColumns) return error("VALUE"); const included = include.flat().map(includeValue); const failed = included.find(isFormulaError); if (failed) return failed;
    const result = byRows ? source.filter((_, index) => included[index]!) : source.map((row) => row.filter((_, index) => included[index]!));
    return result.length && result[0]?.length ? array(result) : context.argumentCount === 3 ? scalar(context.evaluateArgument(2)) : error("CALC");
  }),
  defineDynamic({ name: "TAKE", category: "Lookup", minArgs: 2, maxArgs: 3, arguments: [{ name: "array" }, { name: "rows" }, { name: "columns", optional: true }], lazy: false }, (c) => takeDrop(c, true)),
  defineDynamic({ name: "DROP", category: "Lookup", minArgs: 2, maxArgs: 3, arguments: [{ name: "array" }, { name: "rows" }, { name: "columns", optional: true }], lazy: false }, (c) => takeDrop(c, false)),
  defineDynamic({ name: "HSTACK", category: "Lookup", minArgs: 1, maxArgs: null, arguments: [{ name: "array1" }, { name: "array2", optional: true }], lazy: false }, (c) => stack(c, "horizontal")),
  defineDynamic({ name: "VSTACK", category: "Lookup", minArgs: 1, maxArgs: null, arguments: [{ name: "array1" }, { name: "array2", optional: true }], lazy: false }, (c) => stack(c, "vertical")),
  defineDynamic({ name: "CHOOSECOLS", category: "Lookup", minArgs: 2, maxArgs: null, arguments: [{ name: "array" }, { name: "col_num1" }], lazy: false }, (c) => choose(c, "column")),
  defineDynamic({ name: "CHOOSEROWS", category: "Lookup", minArgs: 2, maxArgs: null, arguments: [{ name: "array" }, { name: "row_num1" }], lazy: false }, (c) => choose(c, "row")),
  defineDynamic({ name: "SORT", category: "Lookup", minArgs: 1, maxArgs: 4, arguments: [{ name: "array" }, { name: "sort_index", optional: true }, { name: "sort_order", optional: true }, { name: "by_col", optional: true }], lazy: false }, (c) => sort(c)),
  defineDynamic({ name: "UNIQUE", category: "Lookup", minArgs: 1, maxArgs: 3, arguments: [{ name: "array" }, { name: "by_col", optional: true }, { name: "exactly_once", optional: true }], lazy: false }, (c) => unique(c)),
  defineDynamic({ name: "TRANSPOSE", category: "Lookup", minArgs: 1, maxArgs: 1, arguments: [{ name: "array" }], lazy: false }, (c) => { const source = matrix(c.evaluateArgument(0)); if (!Array.isArray(source)) return source; return array(Array.from({ length: source[0]?.length ?? 0 }, (_, column) => source.map((row) => row[column]!))); }),
] as const as readonly FormulaFunctionDefinition[];
function takeDrop(c: Parameters<FormulaFunctionDefinition["evaluate"]>[0], take: boolean): FormulaRuntimeValue { const source = matrix(c.evaluateArgument(0)); const rows = number(c.evaluateArgument(1)), columns = c.argumentCount > 2 ? number(c.evaluateArgument(2)) : undefined; if (!Array.isArray(source)) return source; if (isFormulaError(rows) || isFormulaError(columns)) return isFormulaError(rows) ? rows : columns!; if (!rows || columns === 0) return error("CALC"); const crop = <T>(items: T[], count: number) => take ? (count >= 0 ? items.slice(0, count) : items.slice(count)) : (count >= 0 ? items.slice(count) : items.slice(0, count)); const out = crop(source, rows).map((row) => columns === undefined ? row : crop(row, columns)); return out.length && out[0]?.length ? array(out) : error("CALC"); }
function stack(c: Parameters<FormulaFunctionDefinition["evaluate"]>[0], axis: "horizontal" | "vertical"): FormulaRuntimeValue {
  const matrices = Array.from({ length: c.argumentCount }, (_, i) => matrix(c.evaluateArgument(i)));
  const invalid = matrices.find((item) => !Array.isArray(item));
  if (invalid && !Array.isArray(invalid)) return invalid;
  const input = matrices as Matrix[];
  const width = Math.max(...input.map((item) => dimensions(item)[1]));
  const height = Math.max(...input.map((item) => dimensions(item)[0]));
  if (axis === "horizontal")
    return array(Array.from({ length: height }, (_, row) => input.flatMap((item) => item[row] ?? Array(dimensions(item)[1]).fill(createFormulaError("NA")))));
  return array(input.flatMap((item) => item.map((row) => [...row, ...Array(width - row.length).fill(createFormulaError("NA"))])));
}
function choose(c: Parameters<FormulaFunctionDefinition["evaluate"]>[0], axis: "row" | "column"): FormulaRuntimeValue { const source = matrix(c.evaluateArgument(0)); if (!Array.isArray(source)) return source; const limit = axis === "row" ? source.length : source[0]?.length ?? 0; const indexes: number[] = []; for (let i=1;i<c.argumentCount;i+=1) { const value=number(c.evaluateArgument(i)); if (isFormulaError(value)) return value; const index=value < 0 ? limit+value : value-1; if (index<0 || index>=limit) return error("VALUE"); indexes.push(index); } return axis === "row" ? array(indexes.map((i)=>[...source[i]!])) : array(source.map((row)=>indexes.map((i)=>row[i]!))); }
function sort(c: Parameters<FormulaFunctionDefinition["evaluate"]>[0]): FormulaRuntimeValue { const source = matrix(c.evaluateArgument(0)); if (!Array.isArray(source)) return source; const index = c.argumentCount > 1 ? number(c.evaluateArgument(1)) : 1, order = c.argumentCount > 2 ? number(c.evaluateArgument(2)) : 1, byColumn = c.argumentCount > 3 ? includeValue(scalar(c.evaluateArgument(3))) : false; if (isFormulaError(index) || isFormulaError(order) || isFormulaError(byColumn)) return isFormulaError(index) ? index : isFormulaError(order) ? order : byColumn; const limit = byColumn ? source.length : source[0]?.length ?? 0; if (index < 1 || index > limit || (order !== 1 && order !== -1)) return error("VALUE"); const items = byColumn ? source[0]!.map((_, i) => i) : source.map((_, i) => i); items.sort((a,b) => { const result = compare(byColumn ? source[index-1]![a]! : source[a]![index-1]!, byColumn ? source[index-1]![b]! : source[b]![index-1]!); return typeof result === "number" ? result * order : 0; }); return byColumn ? array(source.map((row) => items.map((item) => row[item]!))) : array(items.map((item) => [...source[item]!])) }
function unique(c: Parameters<FormulaFunctionDefinition["evaluate"]>[0]): FormulaRuntimeValue { const source = matrix(c.evaluateArgument(0)); if (!Array.isArray(source)) return source; const byColumn = c.argumentCount > 1 ? includeValue(scalar(c.evaluateArgument(1))) : false, once = c.argumentCount > 2 ? includeValue(scalar(c.evaluateArgument(2))) : false; if (isFormulaError(byColumn) || isFormulaError(once)) return isFormulaError(byColumn) ? byColumn : once; const units = byColumn ? (source[0] ?? []).map((_, i) => source.map((row) => row[i]!)) : source; const equal = (a: FormulaValue[], b: FormulaValue[]) => a.length === b.length && a.every((v, i) => compare(v, b[i]!) === 0); const results = units.filter((unit, index) => { const count = units.filter((candidate) => equal(unit, candidate)).length; return once ? count === 1 : units.findIndex((candidate) => equal(unit, candidate)) === index; }); if (!results.length) return error("CALC"); return byColumn ? array(Array.from({ length: source.length }, (_, row) => results.map((unit) => unit[row]!))) : array(results.map((unit) => [...unit])); }
