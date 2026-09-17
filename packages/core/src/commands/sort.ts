import { translateFormulaForCopy } from "../formula/references.js";
import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  cloneCellContent,
  createWorkbookEvaluator,
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
import {
  cloneCellStyle,
  DEFAULT_CELL_TEXT_COLOR,
  mergeCellStyle,
  type CellStyle,
} from "../style.js";
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
  SortKey,
  SortSheetRangeCommand,
} from "./contracts.js";
import { createBatchSetCellContentsCommand } from "./values.js";
import {
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  assertCellRange,
} from "./helpers.js";

type SortEntry = { row: number; values: FormulaValue[]; colors: Array<string | null | undefined> };

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

function compareSameRank(left: FormulaValue, right: FormulaValue, caseSensitive: boolean): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") {
    const comparableLeft = caseSensitive ? left : left.toLowerCase();
    const comparableRight = caseSensitive ? right : right.toLowerCase();
    return comparableLeft < comparableRight ? -1 : comparableLeft > comparableRight ? 1 : 0;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  if (isFormulaError(left) && isFormulaError(right))
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  return 0;
}

function compareSortValues(
  left: FormulaValue,
  right: FormulaValue,
  direction: SortDirection,
  caseSensitive: boolean,
): number {
  const rankDifference = getValueRank(left) - getValueRank(right);
  if (rankDifference !== 0) return rankDifference;
  const sameRank = compareSameRank(left, right, caseSensitive);
  if (sameRank !== 0) return direction === "descending" ? -sameRank : sameRank;
  return 0;
}

function normalizeSortColor(color: string): string {
  return color.toLowerCase();
}

/**
 * Returns the color represented by a cell for color-sort discovery and comparison.
 * A gradient is deliberately `undefined`: it cannot be represented by one solid color.
 */
export function getSortCellColor(
  sheet: ReturnType<typeof getSheetOrThrow>,
  address: CellAddress,
  sortOn: "cellColor" | "fontColor",
): string | null | undefined {
  const style = getCellStyle(sheet, address);
  if (sortOn === "fontColor")
    return normalizeSortColor(style?.textColor ?? DEFAULT_CELL_TEXT_COLOR);
  if (style?.fillGradient) return undefined;
  return style?.fillColor ? normalizeSortColor(style.fillColor) : null;
}

function compareColorSortValues(
  left: string | null | undefined,
  right: string | null | undefined,
  key: SortKey,
): number {
  const selected = key.color;
  const isSelected = (color: string | null | undefined): boolean =>
    color === null
      ? selected === null
      : typeof color === "string" && typeof selected === "string"
        ? normalizeSortColor(color) === normalizeSortColor(selected)
        : false;
  const leftMatches = isSelected(left);
  const rightMatches = isSelected(right);
  if (leftMatches === rightMatches) return 0;
  if (key.direction === "ascending") return leftMatches ? -1 : 1;
  return leftMatches ? 1 : -1;
}

function compareSortEntries(
  left: SortEntry,
  right: SortEntry,
  keys: readonly SortKey[],
  caseSensitive: boolean,
): number {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!key) continue;
    const compared =
      key.sortOn === "cellColor" || key.sortOn === "fontColor"
        ? compareColorSortValues(left.colors[index], right.colors[index], key)
        : compareSortValues(
            left.values[index]!,
            right.values[index]!,
            key.direction,
            caseSensitive,
          );
    if (compared !== 0) return compared;
  }
  // Stable even if the JS engine implementation changes.
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
  if (content.kind !== "formula") return cloneCellContent(content);
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
  if (command.caseSensitive !== undefined && typeof command.caseSensitive !== "boolean")
    throw invalidCommandPayload("caseSensitive", command.caseSensitive);
  const keys: readonly SortKey[] = command.sortKeys?.length
    ? command.sortKeys
    : [{ column: command.keyColumn, direction: command.direction }];
  if (!keys.length) throw invalidCommandPayload("sortKeys", command.sortKeys);
  for (const key of keys) {
    if (!key || typeof key !== "object") throw invalidCommandPayload("sortKeys", command.sortKeys);
    if (
      !Number.isInteger(key.column) ||
      key.column < range.start.column ||
      key.column > range.end.column
    )
      throw invalidCommandPayload(
        "sortKeys",
        command.sortKeys,
        "Sort key column is outside the range.",
      );
    if (key.direction !== "ascending" && key.direction !== "descending")
      throw invalidCommandPayload("sortKeys", command.sortKeys);
    if (
      key.sortOn !== undefined &&
      key.sortOn !== "value" &&
      key.sortOn !== "cellColor" &&
      key.sortOn !== "fontColor"
    )
      throw invalidCommandPayload("sortKeys", command.sortKeys);
    const isColorSort = key.sortOn === "cellColor" || key.sortOn === "fontColor";
    if (!isColorSort && "color" in key) throw invalidCommandPayload("sortKeys", command.sortKeys);
    if (isColorSort) {
      if (!("color" in key)) throw invalidCommandPayload("sortKeys", command.sortKeys);
      if (key.color === null && key.sortOn === "fontColor")
        throw invalidCommandPayload(
          "sortKeys",
          command.sortKeys,
          "Font color sorting requires a color.",
        );
      if (
        key.color !== null &&
        (typeof key.color !== "string" || !/^#[0-9a-f]{6}$/i.test(key.color))
      )
        throw invalidCommandPayload(
          "sortKeys",
          command.sortKeys,
          "Sort colors must be six-digit hex values.",
        );
    }
  }
  if (sheet.mergedCells.some((merged) => rangesIntersect(range, merged))) {
    throw invalidCommandPayload("range", command.range, "Sorting merged cells is not supported.");
  }
  const filter = sheet.filter;
  if (filter?.advanced && rangesIntersect(range, filter.range)) {
    throw invalidCommandPayload(
      "range",
      command.range,
      "Sorting an active advanced filter range is not supported.",
    );
  }
  if (filter && rangesIntersect(range, filter.range)) {
    const dataRange = getFilterDataRange(filter);
    const completeFilterRange = areRangesEqual(range, filter.range) && command.hasHeader === true;
    if (!completeFilterRange && !areRangesEqual(range, dataRange)) {
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

/** Creates a stable, multi-column sort while retaining the legacy single-key factory. */
export function createMultiKeySortSheetRangeCommand(
  sheetId: string,
  range: CellRange,
  sortKeys: readonly SortKey[],
  options?: { hasHeader?: boolean; caseSensitive?: boolean },
): SortSheetRangeCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  const first = sortKeys[0];
  if (!first) throw new RangeError("Sorting requires at least one key.");
  return {
    type: "sortSheetRange",
    sheetId,
    range: cloneRange(normalized),
    // These two fields preserve transport compatibility with old snapshots.
    keyColumn: first.column,
    direction: first.direction,
    sortKeys: sortKeys.map((key) => ({ ...key })),
    ...(options?.hasHeader ? { hasHeader: true } : {}),
    ...(options?.caseSensitive !== undefined ? { caseSensitive: options.caseSensitive } : {}),
  };
}

export function applySortSheetRangeCommand(
  workbook: Workbook,
  command: SortSheetRangeCommand,
): SetCellContentsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = validateSortCommand(command, sheet);
  const keys: readonly SortKey[] = command.sortKeys?.length
    ? command.sortKeys
    : [{ column: command.keyColumn, direction: command.direction }];
  const caseSensitive = command.caseSensitive ?? true;
  const dataStart = range.start.row + (command.hasHeader ? 1 : 0);
  if (dataStart >= range.end.row + 1) return null;
  const sortableRange = { ...range, start: { ...range.start, row: dataStart } };
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const sortedRows = Array.from(
    { length: range.end.row - dataStart + 1 },
    (_, offset): SortEntry => {
      const row = dataStart + offset;
      return {
        row,
        values: keys.map((key) => evaluator.getComputedValue({ row, column: key.column })),
        colors: keys.map((key) =>
          key.sortOn === "cellColor" || key.sortOn === "fontColor"
            ? getSortCellColor(sheet, { row, column: key.column }, key.sortOn)
            : undefined,
        ),
      };
    },
  ).sort((left, right) => compareSortEntries(left, right, keys, caseSensitive));
  const destinationBySourceRow = new Map<number, number>();
  for (let offset = 0; offset < sortedRows.length; offset += 1) {
    const source = sortedRows[offset];
    if (source) destinationBySourceRow.set(source.row, dataStart + offset);
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
    if (!isInsideRange(address, sortableRange)) return [];
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
