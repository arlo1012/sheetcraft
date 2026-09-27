import { createBatchSetCellContentsCommand } from "./commands/values.js";
import { assertFillDataValidation } from "./commands/fill-validation.js";
import { validateDuplicateEntries } from "./duplicate-values.js";
import { WorkbookDomainError } from "./errors.js";
import { isFormulaError } from "./formula/types.js";
import { formatFormulaAddress } from "./formula/references.js";
import {
  createCellKey,
  createWorkbookEvaluator,
  getCellContent,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "./workbook.js";

export type DataTableAddress = Readonly<{ sheetId: string; address: CellAddress }>;
export type DataTableRequest = Readonly<{
  sheetId: string;
  range: CellRange;
  rowInput?: DataTableAddress;
  columnInput?: DataTableAddress;
}>;
export type DataTableFailure = {
  ok: false;
  reason:
    | "invalid-range"
    | "invalid-input"
    | "invalid-formula"
    | "overlap"
    | "protected"
    | "limit"
    | "formula-error";
};
export type DataTablePreview =
  | { ok: true; rows: number; columns: number; values: (string | number | boolean | null)[][] }
  | DataTableFailure;
export type DataTablePreviewResult = DataTablePreview;

const MAX_RESULTS = 1_000;
type Validated = {
  range: CellRange;
  rowInput?: DataTableAddress;
  columnInput?: DataTableAddress;
  rows: number;
  columns: number;
};

function inRange(range: CellRange, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}
function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return !(
    left.end.row < right.start.row ||
    left.start.row > right.end.row ||
    left.end.column < right.start.column ||
    left.start.column > right.end.column
  );
}
function overlapsSpill(workbook: Workbook, sheetId: string, range: CellRange): boolean {
  const sheet = workbook.sheets.get(sheetId)!;
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    evaluator.getComputedValue({ row, column });
  }
  return [...(evaluator.getSpillProjections?.() ?? [])].some((projection) =>
    inRange(range, projection.address),
  );
}
function isSpillProjection(workbook: Workbook, sheetId: string, address: CellAddress): boolean {
  return overlapsSpill(workbook, sheetId, { start: address, end: address });
}
function sameAddress(left: DataTableAddress, right: DataTableAddress): boolean {
  return (
    left.sheetId === right.sheetId &&
    left.address.row === right.address.row &&
    left.address.column === right.address.column
  );
}
function formulaCell(workbook: Workbook, sheetId: string, address: CellAddress): boolean {
  return getCellContent(workbook.sheets.get(sheetId)!, address)?.kind === "formula";
}
function headerNumbers(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  rowInput: boolean,
  columnInput: boolean,
): boolean {
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  if (rowInput)
    for (let column = range.start.column + 1; column <= range.end.column; column += 1) {
      const value = evaluator.getComputedValue({ row: range.start.row, column });
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
    }
  if (columnInput)
    for (let row = range.start.row + 1; row <= range.end.row; row += 1) {
      const value = evaluator.getComputedValue({ row, column: range.start.column });
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
    }
  return true;
}
function validate(workbook: Workbook, request: DataTableRequest): Validated | DataTableFailure {
  const sheet = workbook.sheets.get(request?.sheetId);
  if (
    !sheet ||
    !request?.range ||
    !isCellAddressInBounds(request.range.start) ||
    !isCellAddressInBounds(request.range.end)
  )
    return { ok: false, reason: "invalid-range" };
  const range = {
    start: {
      row: Math.min(request.range.start.row, request.range.end.row),
      column: Math.min(request.range.start.column, request.range.end.column),
    },
    end: {
      row: Math.max(request.range.start.row, request.range.end.row),
      column: Math.max(request.range.start.column, request.range.end.column),
    },
  };
  if (sheet.mergedCells.some((merged) => rangesIntersect(merged, range)))
    return { ok: false, reason: "overlap" };
  if ((!request.rowInput && !request.columnInput) || sheet.properties.protected)
    return {
      ok: false,
      reason: request.rowInput || request.columnInput ? "protected" : "invalid-input",
    };
  for (const input of [request.rowInput, request.columnInput]) {
    if (!input) continue;
    if (!workbook.sheets.has(input.sheetId) || !isCellAddressInBounds(input.address))
      return { ok: false, reason: "invalid-input" };
    if (input.sheetId === request.sheetId && inRange(range, input.address))
      return { ok: false, reason: "overlap" };
    if (isSpillProjection(workbook, input.sheetId, input.address))
      return { ok: false, reason: "overlap" };
    const content = getCellContent(workbook.sheets.get(input.sheetId)!, input.address);
    if (content && (content.kind !== "literal" || typeof content.value !== "number"))
      return { ok: false, reason: "invalid-input" };
  }
  if (request.rowInput && request.columnInput && sameAddress(request.rowInput, request.columnInput))
    return { ok: false, reason: "invalid-input" };
  const rows = range.end.row - range.start.row;
  const columns = range.end.column - range.start.column;
  if (!rows || !columns) return { ok: false, reason: "invalid-range" };
  const resultCount = rows * columns;
  if (resultCount > MAX_RESULTS) return { ok: false, reason: "limit" };
  if (
    overlapsSpill(workbook, sheet.id, {
      start: { row: range.start.row + 1, column: range.start.column + 1 },
      end: range.end,
    })
  )
    return { ok: false, reason: "overlap" };
  if (!headerNumbers(workbook, sheet.id, range, !!request.rowInput, !!request.columnInput))
    return { ok: false, reason: "invalid-input" };
  if (request.rowInput && request.columnInput) {
    if (!formulaCell(workbook, sheet.id, range.start))
      return { ok: false, reason: "invalid-formula" };
  } else if (request.rowInput) {
    for (let row = range.start.row + 1; row <= range.end.row; row += 1)
      if (!formulaCell(workbook, sheet.id, { row, column: range.start.column }))
        return { ok: false, reason: "invalid-formula" };
  } else {
    for (let column = range.start.column + 1; column <= range.end.column; column += 1)
      if (!formulaCell(workbook, sheet.id, { row: range.start.row, column }))
        return { ok: false, reason: "invalid-formula" };
  }
  return { range, rowInput: request.rowInput, columnInput: request.columnInput, rows, columns };
}
function quoteSheet(name: string): string {
  return /^[\p{L}\p{N}_.]+$/u.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}
function absoluteAddress(address: CellAddress): string {
  const value = formatFormulaAddress(address);
  return value.replace(/^([A-Z]+)(\d+)$/, (_, column: string, row: string) => `$${column}$${row}`);
}
function ref(workbook: Workbook, currentSheetId: string, value: DataTableAddress): string {
  const prefix =
    value.sheetId === currentSheetId
      ? ""
      : `${quoteSheet(workbook.sheets.get(value.sheetId)!.name)}!`;
  return `${prefix}${absoluteAddress(value.address)}`;
}
function localRef(address: CellAddress): string {
  return absoluteAddress(address);
}
function outputFormula(
  workbook: Workbook,
  sheetId: string,
  input: Validated,
  row: number,
  column: number,
): string {
  const target =
    input.rowInput && input.columnInput
      ? input.range.start
      : input.rowInput
        ? { row, column: input.range.start.column }
        : { row: input.range.start.row, column };
  const rowInput = input.rowInput ?? input.columnInput!;
  const rowValue = input.rowInput
    ? { row: input.range.start.row, column }
    : { row, column: input.range.start.column };
  const args = [localRef(target), ref(workbook, sheetId, rowInput), localRef(rowValue)];
  if (input.rowInput && input.columnInput)
    args.push(
      ref(workbook, sheetId, input.columnInput),
      localRef({ row, column: input.range.start.column }),
    );
  return `=SIMTABLE(${args.join(",")})`;
}

export function previewDataTable(workbook: Workbook, request: DataTableRequest): DataTablePreview {
  const valid = validate(workbook, request);
  if ("reason" in valid) return valid;
  let command;
  try {
    command = createDataTableCommand(workbook, request);
  } catch {
    return { ok: false, reason: "formula-error" };
  }
  const shadow = {
    ...workbook,
    sheets: new Map(workbook.sheets).set(request.sheetId, {
      ...workbook.sheets.get(request.sheetId)!,
      cells: new Map(workbook.sheets.get(request.sheetId)!.cells),
    }),
  };
  for (const change of command.changes)
    shadow.sheets
      .get(change.sheetId)!
      .cells.set(createCellKey(change.address), { content: change.content! });
  const evaluator = createWorkbookEvaluator(shadow, request.sheetId);
  const values: (string | number | boolean | null)[][] = [];
  for (let row = valid.range.start.row + 1; row <= valid.range.end.row; row += 1) {
    const line: (string | number | boolean | null)[] = [];
    for (let column = valid.range.start.column + 1; column <= valid.range.end.column; column += 1) {
      const value = evaluator.getComputedValue({ row, column });
      if (isFormulaError(value)) return { ok: false, reason: "formula-error" };
      line.push(value);
    }
    values.push(line);
  }
  return { ok: true, rows: valid.rows, columns: valid.columns, values };
}

export function createDataTableCommand(workbook: Workbook, request: DataTableRequest) {
  const valid = validate(workbook, request);
  if ("reason" in valid)
    throw new WorkbookDomainError(
      { code: "invalid_command_payload", details: { field: "dataTable", reason: valid.reason } },
      `Invalid data table: ${valid.reason}.`,
    );
  const changes = [];
  for (let row = valid.range.start.row + 1; row <= valid.range.end.row; row += 1)
    for (let column = valid.range.start.column + 1; column <= valid.range.end.column; column += 1)
      changes.push({
        sheetId: request.sheetId,
        address: { row, column },
        content: {
          kind: "formula" as const,
          formula: { source: outputFormula(workbook, request.sheetId, valid, row, column) },
        },
      });
  const command = createBatchSetCellContentsCommand(changes);
  assertFillDataValidation(workbook, command);
  const duplicates = validateDuplicateEntries(workbook, command.changes);
  if (!duplicates.valid)
    throw new WorkbookDomainError(
      { code: "invalid_command_payload", details: { field: "dataTable", reason: "duplicate" } },
      "Data table results violate duplicate-entry validation.",
    );
  return command;
}
