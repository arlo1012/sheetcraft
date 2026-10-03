import { translateFormulaForCopy } from "../formula/references.js";
import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  cloneCellContent,
  cloneCellHyperlink,
  cloneCellNamedStyleBinding,
  createWorkbookEvaluator,
  createSheetEvaluator,
  getCellContent,
  getCellHyperlink,
  getCellStyle,
  getCellNamedStyle,
  setCellHyperlink,
  setCellNamedStyle,
  setCellContent,
  type CellAddress,
  type CellRange,
  type SheetFilter,
  type Workbook,
} from "../workbook.js";
import type { ExcelDateSystem } from "../formula/date-system.js";
import {
  createConditionalFormatVisualResolver,
  isConditionalFormatIcon,
} from "../conditional-formatting.js";
import { createCellColorResolver, getCellColor, type CellColorTarget } from "../cell-color.js";
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
  SortDirection,
  SortIcon,
  SortKey,
  SortMethod,
  SortSheetRangeCommand,
  WorkbookCommand,
} from "./contracts.js";
import {
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  assertCellRange,
} from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

type SortEntry = {
  row: number;
  values: FormulaValue[];
  colors: Array<string | null | undefined>;
  icons: Array<SortIcon | null | undefined>;
};

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
    start: {
      row: filter.range.start.row + 1,
      column: filter.range.start.column,
    },
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

type SortTextComparator = (left: string, right: string) => number;

function compareLegacyText(left: string, right: string, caseSensitive: boolean): number {
  const comparableLeft = caseSensitive ? left : left.toLowerCase();
  const comparableRight = caseSensitive ? right : right.toLowerCase();
  return comparableLeft < comparableRight ? -1 : comparableLeft > comparableRight ? 1 : 0;
}

function createSortTextComparator(
  sortMethod: SortMethod | undefined,
  caseSensitive: boolean,
): SortTextComparator {
  if (!sortMethod) return (left, right) => compareLegacyText(left, right, caseSensitive);
  const collator = new Intl.Collator(`zh-u-co-${sortMethod}`, {
    usage: "sort",
    sensitivity: caseSensitive ? "variant" : "base",
    caseFirst: "upper",
    numeric: false,
  });
  return (left, right) => collator.compare(left, right);
}

function compareSameRank(
  left: FormulaValue,
  right: FormulaValue,
  compareText: SortTextComparator,
): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") return compareText(left, right);
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  if (isFormulaError(left) && isFormulaError(right))
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  return 0;
}

function compareSortValues(
  left: FormulaValue,
  right: FormulaValue,
  direction: SortDirection,
  compareText: SortTextComparator,
): number {
  const rankDifference = getValueRank(left) - getValueRank(right);
  if (rankDifference !== 0) return rankDifference;
  const sameRank = compareSameRank(left, right, compareText);
  if (sameRank !== 0) return direction === "descending" ? -sameRank : sameRank;
  return 0;
}

type CustomOrderRanks = ReadonlyMap<string, number>;

function normalizeCustomOrderValue(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

function createCustomOrderRanks(
  customOrder: readonly string[],
  caseSensitive: boolean,
): CustomOrderRanks {
  const ranks = new Map<string, number>();
  for (const [index, value] of customOrder.entries()) {
    const normalized = normalizeCustomOrderValue(value, caseSensitive);
    if (!ranks.has(normalized)) ranks.set(normalized, index);
  }
  return ranks;
}

function getCustomOrderRank(
  value: FormulaValue,
  ranks: CustomOrderRanks,
  caseSensitive: boolean,
): number | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    return undefined;
  return ranks.get(normalizeCustomOrderValue(String(value), caseSensitive));
}

function compareCustomSortValues(
  left: FormulaValue,
  right: FormulaValue,
  direction: SortDirection,
  caseSensitive: boolean,
  compareText: SortTextComparator,
  ranks: CustomOrderRanks,
): number {
  const leftRank = getCustomOrderRank(left, ranks, caseSensitive);
  const rightRank = getCustomOrderRank(right, ranks, caseSensitive);
  if (leftRank !== undefined || rightRank !== undefined) {
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    const difference = leftRank - rightRank;
    return direction === "descending" ? -difference : difference;
  }
  return compareSortValues(left, right, direction, compareText);
}

function normalizeSortColor(color: string): string {
  return color.toLowerCase();
}

function colorTarget(sortOn: "cellColor" | "fontColor"): CellColorTarget {
  return sortOn === "cellColor" ? "fill" : "text";
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
  return getCellColor(sheet, address, colorTarget(sortOn));
}

/**
 * Creates one reusable effective-style resolver for color-sort discovery and execution.
 * The layer order matches the sheet display: table, direct, duplicate highlight, conditional format.
 */
export function createSortCellColorResolver(
  sheet: ReturnType<typeof getSheetOrThrow>,
  evaluator = createSheetEvaluator(sheet),
  options?: { dateSystem?: ExcelDateSystem },
): (address: CellAddress, sortOn: "cellColor" | "fontColor") => string | null | undefined {
  const resolveColor = createCellColorResolver(sheet, evaluator, options);
  return (address, sortOn) => resolveColor(address, colorTarget(sortOn));
}

/** Resolves the currently displayed conditional-format icon for icon-sort discovery and execution. */
export function createSortCellIconResolver(
  sheet: ReturnType<typeof getSheetOrThrow>,
  evaluator = createSheetEvaluator(sheet),
  options?: { dateSystem?: ExcelDateSystem },
): (address: CellAddress) => SortIcon | null {
  const resolveConditionalFormat = createConditionalFormatVisualResolver(sheet, evaluator, options);
  return (address) => {
    const icon = resolveConditionalFormat(address)?.iconSet;
    return icon && !icon.hidden ? { iconSet: icon.iconSet, iconIndex: icon.iconIndex } : null;
  };
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

function compareIconSortValues(
  left: SortIcon | null | undefined,
  right: SortIcon | null | undefined,
  key: SortKey,
): number {
  const selected = key.icon;
  const matches = (icon: SortIcon | null | undefined): boolean =>
    icon === null
      ? selected === null
      : icon !== undefined &&
        selected !== null &&
        selected !== undefined &&
        icon.iconSet === selected.iconSet &&
        icon.iconIndex === selected.iconIndex;
  const leftMatches = matches(left);
  const rightMatches = matches(right);
  if (leftMatches === rightMatches) return 0;
  return key.direction === "ascending" ? (leftMatches ? -1 : 1) : leftMatches ? 1 : -1;
}

function compareSortEntries(
  left: SortEntry,
  right: SortEntry,
  keys: readonly SortKey[],
  caseSensitive: boolean,
  compareText: SortTextComparator,
  customOrderRanks: readonly (CustomOrderRanks | undefined)[],
): number {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!key) continue;
    const customRanks = customOrderRanks[index];
    const compared =
      key.sortOn === "cellColor" || key.sortOn === "fontColor"
        ? compareColorSortValues(left.colors[index], right.colors[index], key)
        : key.sortOn === "icon"
          ? compareIconSortValues(left.icons[index], right.icons[index], key)
          : customRanks
            ? compareCustomSortValues(
                left.values[index]!,
                right.values[index]!,
                key.direction,
                caseSensitive,
                compareText,
                customRanks,
              )
            : compareSortValues(
                left.values[index]!,
                right.values[index]!,
                key.direction,
                compareText,
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
  if (
    command.sortMethod !== undefined &&
    command.sortMethod !== "pinyin" &&
    command.sortMethod !== "stroke"
  )
    throw invalidCommandPayload("sortMethod", command.sortMethod);
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
      key.sortOn !== "fontColor" &&
      key.sortOn !== "icon"
    )
      throw invalidCommandPayload("sortKeys", command.sortKeys);
    const isColorSort = key.sortOn === "cellColor" || key.sortOn === "fontColor";
    const isIconSort = key.sortOn === "icon";
    if ((isColorSort || isIconSort) && key.customOrder !== undefined)
      throw invalidCommandPayload(
        "sortKeys",
        command.sortKeys,
        "Custom orders are only supported for value sorts.",
      );
    if (
      key.customOrder !== undefined &&
      (!Array.isArray(key.customOrder) ||
        key.customOrder.length === 0 ||
        key.customOrder.some((value) => typeof value !== "string" || value.trim().length === 0))
    )
      throw invalidCommandPayload(
        "sortKeys",
        command.sortKeys,
        "Custom orders must contain at least one non-blank string.",
      );
    if (!isColorSort && "color" in key) throw invalidCommandPayload("sortKeys", command.sortKeys);
    if (!isIconSort && "icon" in key) throw invalidCommandPayload("sortKeys", command.sortKeys);
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
    if (isIconSort) {
      if (!("icon" in key)) throw invalidCommandPayload("sortKeys", command.sortKeys);
      if (
        key.icon !== null &&
        (!key.icon || !isConditionalFormatIcon(key.icon.iconSet, key.icon.iconIndex))
      )
        throw invalidCommandPayload("sortKeys", command.sortKeys, "Sort icon is not valid.");
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
  return {
    type: "sortSheetRange",
    sheetId,
    range: cloneRange(normalized),
    keyColumn,
    direction,
  };
}

/** Creates a stable, multi-column sort while retaining the legacy single-key factory. */
export function createMultiKeySortSheetRangeCommand(
  sheetId: string,
  range: CellRange,
  sortKeys: readonly SortKey[],
  options?: {
    hasHeader?: boolean;
    caseSensitive?: boolean;
    sortMethod?: SortMethod;
  },
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
    sortKeys: sortKeys.map((key) => ({
      ...key,
      ...(key.customOrder === undefined ? {} : { customOrder: [...key.customOrder] }),
      ...(key.icon === undefined || key.icon === null ? {} : { icon: { ...key.icon } }),
    })),
    ...(options?.hasHeader ? { hasHeader: true } : {}),
    ...(options?.caseSensitive !== undefined ? { caseSensitive: options.caseSensitive } : {}),
    ...(options?.sortMethod !== undefined ? { sortMethod: options.sortMethod } : {}),
  };
}

export function applySortSheetRangeCommand(
  workbook: Workbook,
  command: SortSheetRangeCommand,
): WorkbookCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = validateSortCommand(command, sheet);
  const keys: readonly SortKey[] = command.sortKeys?.length
    ? command.sortKeys
    : [{ column: command.keyColumn, direction: command.direction }];
  const caseSensitive = command.caseSensitive ?? true;
  const compareText = createSortTextComparator(command.sortMethod, caseSensitive);
  const customOrderRanks = keys.map((key) =>
    key.customOrder ? createCustomOrderRanks(key.customOrder, caseSensitive) : undefined,
  );
  const dataStart = range.start.row + (command.hasHeader ? 1 : 0);
  if (dataStart >= range.end.row + 1) return null;
  const sortableRange = { ...range, start: { ...range.start, row: dataStart } };
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const resolveSortColor = createSortCellColorResolver(sheet, evaluator, {
    dateSystem: workbook.dateSystem,
  });
  const resolveSortIcon = createSortCellIconResolver(sheet, evaluator, {
    dateSystem: workbook.dateSystem,
  });
  const sortedRows = Array.from(
    { length: range.end.row - dataStart + 1 },
    (_, offset): SortEntry => {
      const row = dataStart + offset;
      return {
        row,
        values: keys.map((key) => evaluator.getComputedValue({ row, column: key.column })),
        colors: keys.map((key) =>
          key.sortOn === "cellColor" || key.sortOn === "fontColor"
            ? resolveSortColor({ row, column: key.column }, key.sortOn)
            : undefined,
        ),
        icons: keys.map((key) =>
          key.sortOn === "icon" ? resolveSortIcon({ row, column: key.column }) : undefined,
        ),
      };
    },
  ).sort((left, right) =>
    compareSortEntries(left, right, keys, caseSensitive, compareText, customOrderRanks),
  );
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
        ...(cell.namedStyle ? { namedStyle: cloneCellNamedStyleBinding(cell.namedStyle) } : {}),
        ...(cell.hyperlink ? { hyperlink: cloneCellHyperlink(cell.hyperlink) } : {}),
      },
    ];
  });
  const nextByAddress = new Map<
    string,
    {
      address: CellAddress;
      content?: CellContent;
      style?: CellStyle;
      namedStyle?: import("../workbook.js").CellNamedStyleBinding;
      hyperlink?: import("../workbook.js").CellHyperlink;
    }
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
        : {
            content: getTranslatedContent(cell.content, cell.address, address),
          }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      ...(cell.namedStyle ? { namedStyle: cloneCellNamedStyleBinding(cell.namedStyle) } : {}),
      ...(cell.hyperlink ? { hyperlink: cloneCellHyperlink(cell.hyperlink) } : {}),
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
      namedStyle: cloneCellNamedStyleBinding(getCellNamedStyle(sheet, address)) ?? null,
      hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, address)) ?? null,
    });
  };
  for (const [key, address] of affected) {
    captureInverse(address);
    const next = nextByAddress.get(key);
    setCellContent(sheet, address, next?.content ?? null);
    setCellNamedStyle(sheet, address, next?.style ?? null, next?.namedStyle ?? null);
    setCellHyperlink(sheet, address, next?.hyperlink ?? null);
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
    setCellNamedStyle(
      sheet,
      address,
      mergeCellStyle(getCellStyle(sheet, address), patch),
      getCellNamedStyle(sheet, address),
    );
  });
  return createBatchSetCellContentsCommand([...inverseByAddress.values()]);
}
