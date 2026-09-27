import { cloneCellStyle } from "../style.js";
import {
  createSheetSparseState,
  createWorkbookEvaluator,
  getCellContent,
  getCellStyle,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  setCellContent,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { CellContent, FormulaValue } from "../formula/types.js";
import type { AdvancedFilterCommand, RestoreFullSheetStateCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import type { HiddenRowInterval } from "./filter.js";

type Criterion = { column: number; source: string };
const MAX_ADVANCED_FILTER_CELLS = 1_000_000;

export function createAdvancedFilterCommand(
  sheetId: string,
  listRange: AdvancedFilterCommand["listRange"],
  options: Omit<AdvancedFilterCommand, "type" | "sheetId" | "listRange">,
): AdvancedFilterCommand {
  return {
    type: "advancedFilter",
    sheetId,
    listRange: normalizeRange(listRange),
    ...(options.criteria
      ? {
          criteria: {
            sheetId: options.criteria.sheetId,
            range: normalizeRange(options.criteria.range),
          },
        }
      : {}),
    mode: options.mode,
    ...(options.destination
      ? {
          destination: {
            sheetId: options.destination.sheetId,
            address: { ...options.destination.address },
          },
        }
      : {}),
    uniqueOnly: options.uniqueOnly,
    overwrite: options.overwrite,
  };
}

function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return !(
    left.end.row < right.start.row ||
    left.start.row > right.end.row ||
    left.end.column < right.start.column ||
    left.start.column > right.end.column
  );
}
function getValueText(workbook: Workbook, sheetId: string, address: CellAddress): string {
  const value = createWorkbookEvaluator(workbook, sheetId).getComputedValue(address);
  return value === null ? "" : typeof value === "object" ? `#${value.code}!` : String(value);
}
function getHeaders(workbook: Workbook, sheetId: string, range: CellRange): Map<string, number> {
  const headers = new Map<string, number>();
  for (let column = range.start.column; column <= range.end.column; column += 1) {
    const value = getValueText(workbook, sheetId, { row: range.start.row, column });
    const key = value.toLocaleLowerCase();
    if (!value || headers.has(key))
      throw invalidCommandPayload("headers", range, "List headers must be non-empty and unique.");
    headers.set(key, column);
  }
  return headers;
}
function getCriteria(
  workbook: Workbook,
  headers: Map<string, number>,
  criteria: AdvancedFilterCommand["criteria"],
): Criterion[][] {
  if (!criteria) return [];
  const sheet = getSheetOrThrow(workbook, criteria.sheetId);
  const range = normalizeRange(criteria.range);
  assertCellRange(range);
  if (range.end.row <= range.start.row)
    throw invalidCommandPayload(
      "criteria",
      criteria,
      "Criteria must include a header and a condition row.",
    );
  if (
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) >
    MAX_ADVANCED_FILTER_CELLS
  )
    throw invalidCommandPayload("criteria", criteria, "Criteria range is too large.");
  const columns = Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) => {
    const column = range.start.column + offset;
    return {
      column,
      sourceColumn: headers.get(
        getValueText(workbook, sheet.id, { row: range.start.row, column }).toLocaleLowerCase(),
      ),
    };
  });
  const result: Criterion[][] = [];
  for (let row = range.start.row + 1; row <= range.end.row; row += 1) {
    const criteriaRow: Criterion[] = [];
    for (const entry of columns) {
      const address = { row, column: entry.column };
      const content = getCellContent(sheet, address);
      if (entry.sourceColumn === undefined) {
        if (content)
          throw invalidCommandPayload(
            "headers",
            criteria,
            "Every non-empty criterion must have a matching list header.",
          );
        continue;
      }
      if (!content) continue;
      if (content.kind === "formula" || content.kind === "image")
        throw invalidCommandPayload(
          "criteria",
          criteria,
          "Formula and image criteria are not supported.",
        );
      const source = content.kind === "error" ? `#${content.error.code}!` : String(content.value);
      if (source !== "") criteriaRow.push({ column: entry.sourceColumn, source });
    }
    result.push(criteriaRow);
  }
  return result;
}
function wildcardExpression(source: string): RegExp {
  let expression = "^";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "~" && index + 1 < source.length)
      expression += source[++index]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (character === "*") expression += ".*";
    else if (character === "?") expression += ".";
    else expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${expression}$`, "i");
}
function matchesCriterion(value: FormulaValue, criterion: Criterion): boolean {
  const comparison = /^(<>|>=|<=|=|>|<)(.*)$/s.exec(criterion.source);
  const operator = comparison?.[1] ?? "=";
  const expected = comparison?.[2] ?? criterion.source;
  const actual =
    value === null ? "" : typeof value === "object" ? `#${value.code}!` : String(value);
  if (operator === "=" && expected === "") return value === null;
  if (operator === "<>" && expected === "") return value !== null;
  const target = Number(expected);
  const numericExpected = expected.trim() !== "" && Number.isFinite(target);
  if (numericExpected) {
    if (typeof value !== "number") return false;
    if (operator === ">") return value > target;
    if (operator === ">=") return value >= target;
    if (operator === "<") return value < target;
    if (operator === "<=") return value <= target;
    return operator === "<>" ? value !== target : value === target;
  }
  if (operator === ">")
    return actual.localeCompare(expected, undefined, { sensitivity: "accent" }) > 0;
  if (operator === ">=")
    return actual.localeCompare(expected, undefined, { sensitivity: "accent" }) >= 0;
  if (operator === "<")
    return actual.localeCompare(expected, undefined, { sensitivity: "accent" }) < 0;
  if (operator === "<=")
    return actual.localeCompare(expected, undefined, { sensitivity: "accent" }) <= 0;
  const matches = wildcardExpression(comparison ? expected : `${expected}*`).test(actual);
  return operator === "<>" ? !matches : matches;
}
function evaluatedContent(value: FormulaValue): CellContent | null {
  if (value === null) return null;
  return typeof value === "object"
    ? { kind: "error", error: { kind: "formula-error", code: value.code } }
    : { kind: "literal", value };
}
function getRows(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  criteria: Criterion[][],
  uniqueOnly: boolean,
): number[] {
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  const rows: number[] = [];
  const seen = new Set<string>();
  for (let row = range.start.row + 1; row <= range.end.row; row += 1) {
    if (
      criteria.length &&
      !criteria.some((line) =>
        line.every((criterion) =>
          matchesCriterion(
            evaluator.getComputedValue({ row, column: criterion.column }),
            criterion,
          ),
        ),
      )
    )
      continue;
    const key = JSON.stringify(
      Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) =>
        evaluator.getComputedValue({ row, column: range.start.column + offset }),
      ),
    );
    if (uniqueOnly && seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}
function hiddenRows(range: CellRange, rows: readonly number[]): HiddenRowInterval[] {
  const visible = new Set(rows);
  const hidden: HiddenRowInterval[] = [];
  let start: number | undefined;
  for (let row = range.start.row + 1; row <= range.end.row; row += 1) {
    if (!visible.has(row)) start ??= row;
    else if (start !== undefined) {
      hidden.push({ start, end: row - 1 });
      start = undefined;
    }
  }
  if (start !== undefined) hidden.push({ start, end: range.end.row });
  return hidden;
}
export function applyAdvancedFilterCommand(
  workbook: Workbook,
  command: AdvancedFilterCommand,
): RestoreFullSheetStateCommand | null {
  const source = getSheetOrThrow(workbook, command.sheetId);
  let range: CellRange;
  try {
    range = normalizeRange(command.listRange);
    assertCellRange(range);
  } catch {
    throw invalidCommandPayload("listRange", command.listRange);
  }
  if (range.end.row <= range.start.row)
    throw invalidCommandPayload(
      "listRange",
      command.listRange,
      "Advanced filter requires headers and data.",
    );
  if (
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) >
    MAX_ADVANCED_FILTER_CELLS
  )
    throw invalidCommandPayload(
      "listRange",
      command.listRange,
      "Advanced filter list is too large.",
    );
  if (source.mergedCells.some((merged) => rangesIntersect(merged, range)))
    throw invalidCommandPayload(
      "listRange",
      command.listRange,
      "Advanced filtering merged cells is not supported.",
    );
  if (command.mode !== "inPlace" && command.mode !== "copy")
    throw invalidCommandPayload("mode", command.mode);
  if (typeof command.uniqueOnly !== "boolean")
    throw invalidCommandPayload("uniqueOnly", command.uniqueOnly);
  if (typeof command.overwrite !== "boolean")
    throw invalidCommandPayload("overwrite", command.overwrite);
  let normalizedCriteria: AdvancedFilterCommand["criteria"];
  if (command.criteria) {
    try {
      normalizedCriteria = {
        sheetId: command.criteria.sheetId,
        range: normalizeRange(command.criteria.range),
      };
      assertCellRange(normalizedCriteria.range);
      getSheetOrThrow(workbook, normalizedCriteria.sheetId);
    } catch {
      throw invalidCommandPayload("criteria", command.criteria);
    }
    if (
      normalizedCriteria.sheetId === source.id &&
      rangesIntersect(range, normalizedCriteria.range)
    )
      throw invalidCommandPayload(
        "criteria",
        command.criteria,
        "Criteria cannot overlap the source list.",
      );
  }
  const criteria = getCriteria(
    workbook,
    getHeaders(workbook, source.id, range),
    normalizedCriteria,
  );
  const rows = getRows(workbook, source.id, range, criteria, command.uniqueOnly);
  if (command.mode === "inPlace") {
    const next = {
      range,
      columns: [],
      advanced: {
        ...(normalizedCriteria ? { criteria: normalizedCriteria } : {}),
        uniqueOnly: command.uniqueOnly,
        hiddenRows: hiddenRows(range, rows),
      },
    };
    if (JSON.stringify(source.filter) === JSON.stringify(next)) return null;
    const previous = createSheetSparseState(source);
    source.filter = next;
    return { type: "restoreSheetState", sheetId: source.id, state: previous };
  }
  if (!command.destination)
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Advanced filter copy requires a destination.",
    );
  const target = getSheetOrThrow(workbook, command.destination.sheetId);
  try {
    assertCellAddress(command.destination.address);
  } catch {
    throw invalidCommandPayload("destination", command.destination);
  }
  const output = {
    start: command.destination.address,
    end: {
      row: command.destination.address.row + rows.length,
      column: command.destination.address.column + range.end.column - range.start.column,
    },
  };
  if (output.end.row >= MAX_SHEET_ROWS || output.end.column >= MAX_SHEET_COLUMNS)
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Advanced filter result exceeds sheet bounds.",
    );
  if (target.mergedCells.some((merged) => rangesIntersect(merged, output)))
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Destination cannot intersect merged cells.",
    );
  if (
    (target.id === source.id && rangesIntersect(output, range)) ||
    (normalizedCriteria &&
      target.id === normalizedCriteria.sheetId &&
      rangesIntersect(output, normalizedCriteria.range))
  )
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Destination cannot overlap the source list or criteria.",
    );
  if (!command.overwrite)
    for (let row = output.start.row; row <= output.end.row; row += 1)
      for (let column = output.start.column; column <= output.end.column; column += 1)
        if (getCellContent(target, { row, column }) || getCellStyle(target, { row, column }))
          throw invalidCommandPayload(
            "overwrite",
            command.overwrite,
            "Advanced filter would overwrite existing cells.",
          );
  const previous = createSheetSparseState(target);
  const evaluator = createWorkbookEvaluator(workbook, source.id);
  const sourceRows = [range.start.row, ...rows];
  const values = sourceRows.flatMap((row, outputRow) =>
    Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) => {
      const from = { row, column: range.start.column + offset };
      return {
        to: { row: output.start.row + outputRow, column: output.start.column + offset },
        content: evaluatedContent(evaluator.getComputedValue(from)),
        style: cloneCellStyle(getCellStyle(source, from)),
      };
    }),
  );
  for (const value of values) {
    setCellContent(target, value.to, value.content);
    setCellStyle(target, value.to, value.style);
  }
  return { type: "restoreSheetState", sheetId: target.id, state: previous };
}
