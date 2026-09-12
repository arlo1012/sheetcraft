import { isFormulaError, type FormulaValue } from "../types.js";
import type {
  FormulaFunctionArgument,
  FormulaFunctionDefinition,
} from "./contracts.js";
import {
  compareValues,
  defineFunction,
  formulaError,
  isOmittedArgument,
  scalar,
  wildcardMatch,
} from "./helpers.js";

type Database = { headers: FormulaValue[]; rows: FormulaValue[][] };

function matrix(
  argument: FormulaFunctionArgument,
): FormulaValue[][] | ReturnType<typeof formulaError> {
  if (argument.kind !== "range" || !argument.bounds)
    return formulaError("VALUE");
  const rows = argument.bounds.end.row - argument.bounds.start.row + 1;
  const columns = argument.bounds.end.column - argument.bounds.start.column + 1;
  if (rows < 1 || columns < 1 || rows * columns > 100_000)
    return formulaError("VALUE");
  if (!argument.getValue) return formulaError("VALUE");
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      argument.getValue!(
        argument.bounds!.start.row + row,
        argument.bounds!.start.column + column,
      ),
    ),
  );
}
function criteriaMatches(
  value: FormulaValue,
  criterion: FormulaValue,
): boolean | FormulaValue {
  if (isFormulaError(value)) return value;
  if (isFormulaError(criterion)) return criterion;
  if (criterion === null || criterion === "")
    return value === null || value === "";
  if (typeof criterion !== "string") {
    const comparison = compareValues(value, criterion);
    return isFormulaError(comparison) ? comparison : comparison === 0;
  }
  const found = criterion.match(/^(<=|>=|<>|=|<|>)(.*)$/);
  const operator = found?.[1] ?? "=";
  const raw = found?.[2] ?? criterion;
  const parsed =
    raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  const comparison = compareValues(value, parsed);
  if (isFormulaError(comparison)) return comparison;
  const equals = /[*?~]/.test(raw)
    ? wildcardMatch(String(value ?? ""), raw)
    : found
      ? comparison === 0
      : typeof parsed === "string"
        ? String(value ?? "")
            .toLocaleUpperCase()
            .startsWith(parsed.toLocaleUpperCase())
        : comparison === 0;
  if (operator === "=") return equals;
  if (operator === "<>") return !equals;
  if (operator === ">") return comparison > 0;
  if (operator === ">=") return comparison >= 0;
  if (operator === "<") return comparison < 0;
  return comparison <= 0;
}
function fieldIndex(
  database: Database,
  field: FormulaValue,
): number | ReturnType<typeof formulaError> {
  if (typeof field === "number")
    return Number.isInteger(field) &&
      field >= 1 &&
      field <= database.headers.length
      ? field - 1
      : formulaError("VALUE");
  if (typeof field !== "string") return formulaError("VALUE");
  const index = database.headers.findIndex(
    (header) =>
      String(header).toLocaleUpperCase() === field.toLocaleUpperCase(),
  );
  return index < 0 ? formulaError("VALUE") : index;
}
function records(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
):
  | { database: Database; field: number | null; rows: FormulaValue[][] }
  | ReturnType<typeof formulaError> {
  const source = matrix(context.evaluateArgument(0));
  const criteria = matrix(context.evaluateArgument(2));
  const field = scalar(context.evaluateArgument(1));
  if (!Array.isArray(source)) return source;
  if (!Array.isArray(criteria)) return criteria;
  if (isFormulaError(field)) return field;
  const [headers, ...data] = source;
  if (!headers || !criteria.length) return formulaError("VALUE");
  const database = { headers, rows: data };
  const index = isOmittedArgument(context.evaluateArgument(1))
    ? null
    : fieldIndex(database, field);
  if (isFormulaError(index)) return index;
  const matches = data.filter((row) => {
    for (const criterionRow of criteria.slice(1)) {
      let accepts = true;
      for (let column = 0; column < criteria[0]!.length; column += 1) {
        const header = criteria[0]![column];
        const criterion = criterionRow![column];
        if (
          header === null ||
          header === "" ||
          criterion === null ||
          criterion === ""
        )
          continue;
        const dataColumn = database.headers.findIndex(
          (item) =>
            String(item).toLocaleUpperCase() ===
            String(header).toLocaleUpperCase(),
        );
        if (dataColumn < 0) {
          accepts = false;
          break;
        }
        const matched = criteriaMatches(
          row[dataColumn] ?? null,
          criterion ?? null,
        );
        if (isFormulaError(matched) || !matched) {
          accepts = false;
          break;
        }
      }
      if (accepts) return true;
    }
    return false;
  });
  return { database, field: index, rows: matches };
}
function numbers(
  rows: FormulaValue[][],
  field: number,
): number[] | FormulaValue {
  const result: number[] = [];
  for (const row of rows) {
    const value = row[field] ?? null;
    if (isFormulaError(value)) return value;
    if (typeof value === "number") result.push(value);
  }
  return result;
}
function databaseAggregate(
  context: Parameters<FormulaFunctionDefinition["evaluate"]>[0],
  kind: string,
): FormulaValue {
  const result = records(context);
  if ("kind" in result) return result;
  if (result.field === null && (kind === "DCOUNT" || kind === "DCOUNTA"))
    return result.rows.length;
  if (result.field === null) return formulaError("VALUE");
  const field = result.field;
  const values = numbers(result.rows, field);
  if (!Array.isArray(values)) return values;
  if (kind === "DCOUNT") return values.length;
  if (kind === "DCOUNTA")
    return result.rows.filter((row) => row[field] !== null).length;
  if (kind === "DGET")
    return result.rows.length === 1
      ? (result.rows[0]![field] ?? null)
      : formulaError(result.rows.length ? "NUM" : "VALUE");
  if (kind === "DSUM") return values.reduce((sum, value) => sum + value, 0);
  if (kind === "DPRODUCT")
    return values.reduce((product, value) => product * value, 1);
  if (kind === "DMAX") return values.length ? Math.max(...values) : 0;
  if (kind === "DMIN") return values.length ? Math.min(...values) : 0;
  if (!values.length) return formulaError("DIV0");
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (kind === "DAVERAGE") return mean;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - (kind.endsWith("P") ? 0 : 1));
  if (!Number.isFinite(variance)) return formulaError("DIV0");
  return kind.startsWith("DSTDEV") ? Math.sqrt(variance) : variance;
}
const DATABASE_NAMES = [
  "DAVERAGE",
  "DCOUNT",
  "DCOUNTA",
  "DGET",
  "DMAX",
  "DMIN",
  "DPRODUCT",
  "DSTDEV",
  "DSTDEVP",
  "DSUM",
  "DVAR",
  "DVARP",
] as const;
export const DATABASE_FUNCTIONS = DATABASE_NAMES.map((name) =>
  defineFunction(
    {
      name,
      category: "Database",
      minArgs: 3,
      maxArgs: 3,
      arguments: [
        { name: "database" },
        { name: "field", optional: name === "DCOUNT" || name === "DCOUNTA" },
        { name: "criteria" },
      ],
      lazy: false,
    },
    (context) => databaseAggregate(context, name),
  ),
) satisfies readonly FormulaFunctionDefinition[];
