import { translateFormulaForCopy } from "../formula/references.js";
import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  cloneCellContent,
  createSheetEvaluator,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type SheetFilter,
  type Workbook,
} from "../workbook.js";
import { MergedCellRangeResolver } from "../merged-cells.js";
import { cloneCellStyle, mergeCellStyle, type CellStyle } from "../style.js";
import {
  getCellBorderTargetKey,
  getExactCellBorderPatch,
  reconcileCellBorderTargets,
  type CellBorderPatch,
} from "./borders.js";
import type {
  CellContentChange,
  SetCellContentsCommand,
  SortDirection,
  SortSheetRangeCommand,
} from "./contracts.js";
import { createBatchSetCellContentsCommand } from "./values.js";
import {
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  assertCellRange,
} from "./helpers.js";

type SortEntry = { row: number; value: FormulaValue };

function cloneRange(range: CellRange): CellRange {
  return { start: { ...range.start }, end: { ...range.end } };
}

function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return !(
    left.end.row < right.start.row ||
    right.end.row < left.start.row ||
    left.end.column < right.start.column ||
    right.end.column < left.start.column
  );
}

function getFilterDataRange(filter: SheetFilter): CellRange {
  return {
    start: { row: filter.range.start.row + 1, column: filter.range.start.column },
    end: { ...filter.range.end },
  };
}

function areRangesEqual(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row === right.start.row &&
    left.start.column === right.start.column &&
    left.end.row === right.end.row &&
    left.end.column === right.end.column
  );
}

function getValueRank(value: FormulaValue): number {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return 1;
  if (typeof value === "boolean") return 2;
  if (isFormulaError(value)) return 3;
  return 4;
}

function compareSameRank(left: FormulaValue, right: FormulaValue): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  if (isFormulaError(left) && isFormulaError(right))
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  return 0;
}

function compareSortEntries(left: SortEntry, right: SortEntry, direction: SortDirection): number {
  const rankDifference = getValueRank(left.value) - getValueRank(right.value);
  if (rankDifference !== 0) return rankDifference;
  const sameRank = compareSameRank(left.value, right.value);
  if (sameRank !== 0) return direction === "descending" ? -sameRank : sameRank;
  return left.row - right.row;
}

function isInsideRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function getTranslatedContent(
  content: CellContent | undefined,
  source: CellAddress,
  destination: CellAddress,
): CellContent | undefined {
  if (!content) return undefined;
  if (content.kind === "literal") return cloneCellContent(content);
  if (content.kind === "image") return cloneCellContent(content);
  return {
    kind: "formula",
    formula: {
      source: translateFormulaForCopy(content.formula.source, {
        row: destination.row - source.row,
        column: 0,
      }),
    },
  };
}

function validateSortCommand(
  command: SortSheetRangeCommand,
  sheet: ReturnType<typeof getSheetOrThrow>,
): CellRange {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  if (range.end.row <= range.start.row) {
    throw invalidCommandPayload("range", command.range, "Sorting requires at least two rows.");
  }
  if (
    !Number.isInteger(command.keyColumn) ||
    command.keyColumn < range.start.column ||
    command.keyColumn > range.end.column
  ) {
    throw invalidCommandPayload(
      "keyColumn",
      command.keyColumn,
      "Sort key column is outside the range.",
    );
  }
  if (command.direction !== "ascending" && command.direction !== "descending") {
    throw invalidCommandPayload("direction", command.direction);
  }
  if (sheet.mergedCells.some((merged) => rangesIntersect(range, merged))) {
    throw invalidCommandPayload("range", command.range, "Sorting merged cells is not supported.");
  }
  const filter = sheet.filter;
  if (filter && rangesIntersect(range, filter.range)) {
    const dataRange = getFilterDataRange(filter);
    if (!areRangesEqual(range, dataRange)) {
      throw invalidCommandPayload(
        "range",
        command.range,
        "A filtered range can only be sorted across its complete data rows.",
      );
    }
  }
  return range;
}

export function createSortSheetRangeCommand(
  sheetId: string,
  range: CellRange,
  keyColumn: number,
  direction: SortDirection = "ascending",
): SortSheetRangeCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  return { type: "sortSheetRange", sheetId, range: cloneRange(normalized), keyColumn, direction };
}

export function applySortSheetRangeCommand(
  workbook: Workbook,
  command: SortSheetRangeCommand,
): SetCellContentsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = validateSortCommand(command, sheet);
  const evaluator = createSheetEvaluator(sheet);
  const sortedRows = Array.from(
    { length: range.end.row - range.start.row + 1 },
    (_, offset): SortEntry => {
      const row = range.start.row + offset;
      return { row, value: evaluator.getComputedValue({ row, column: command.keyColumn }) };
    },
  ).sort((left, right) => compareSortEntries(left, right, command.direction));
  const destinationBySourceRow = new Map<number, number>();
  for (let offset = 0; offset < sortedRows.length; offset += 1) {
    const source = sortedRows[offset];
    if (source) destinationBySourceRow.set(source.row, range.start.row + offset);
  }
  if ([...destinationBySourceRow].every(([source, destination]) => source === destination))
    return null;

  // Sorting only relocates sparse cell state inside the requested rectangle.
  // Its inverse therefore snapshots those addresses, rather than the full sheet.
  const captured = [...sheet.cells].flatMap(([key, cell]) => {
    const separator = key.indexOf(":");
    const address = {
      row: Number(key.slice(0, separator)),
      column: Number(key.slice(separator + 1)),
    };
    if (!isInsideRange(address, range)) return [];
    return [
      {
        address,
        ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      },
    ];
  });
  const nextByAddress = new Map<
    string,
    { address: CellAddress; content?: CellContent; style?: CellStyle }
  >();
  const affected = new Map<string, CellAddress>();
  for (const cell of captured) {
    const destinationRow = destinationBySourceRow.get(cell.address.row);
    if (destinationRow === undefined) throw new Error("Missing sorted destination row.");
    const address = { row: destinationRow, column: cell.address.column };
    const key = getCellBorderTargetKey(address);
    nextByAddress.set(key, {
      address,
      ...(cell.content === undefined
        ? {}
        : { content: getTranslatedContent(cell.content, cell.address, address) }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    });
    affected.set(getCellBorderTargetKey(cell.address), cell.address);
    affected.set(key, address);
  }

  const inverseByAddress = new Map<string, CellContentChange>();
  const captureInverse = (address: CellAddress): void => {
    const key = getCellBorderTargetKey(address);
    if (inverseByAddress.has(key)) return;
    inverseByAddress.set(key, {
      sheetId: command.sheetId,
      address: { ...address },
      content: getCellContent(sheet, address),
      style: cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined) ?? null,
    });
  };
  for (const [key, address] of affected) {
    captureInverse(address);
    const next = nextByAddress.get(key);
    setCellContent(sheet, address, next?.content ?? null);
    setCellStyle(sheet, address, next?.style ?? null);
  }

  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const targets = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (const rawAddress of affected.values()) {
    const address = mergeResolver.getAnchor(rawAddress) ?? rawAddress;
    targets.set(getCellBorderTargetKey(address), {
      address,
      patch: getExactCellBorderPatch(getCellStyle(sheet, address)),
    });
  }
  reconcileCellBorderTargets(targets, (rawAddress, patch) => {
    const address = mergeResolver.getAnchor(rawAddress) ?? rawAddress;
    captureInverse(address);
    setCellStyle(sheet, address, mergeCellStyle(getCellStyle(sheet, address), patch));
  });
  return createBatchSetCellContentsCommand([...inverseByAddress.values()]);
}
