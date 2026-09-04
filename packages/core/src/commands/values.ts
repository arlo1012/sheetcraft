import { getCellMatrixSize } from "../clipboard.js";
import {
  cloneCellStyle,
  mergeCellStyle,
  normalizeCellStyle,
  type CellStyle,
  type CellStylePatch,
} from "../style.js";
import {
  getCellStyle,
  getCellContent,
  setCellStyle,
  setCellContent,
  createSheetSparseState,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import { cloneCellContent } from "../workbook.js";
import type { CellContent } from "../formula/types.js";
import { transformFormulaForMove } from "../formula/references.js";
import {
  doMergedCellRangesIntersect,
  expandSelectionToMergedCellRanges,
  MergedCellRangeResolver,
} from "../merged-cells.js";
import {
  getExactCellBorderPatch,
  getCellBorderTargetKey,
  reconcileCellBorderTargets,
  type CellBorderPatch,
} from "./borders.js";
import type {
  CellContentChange,
  ClearCellRangeCommand,
  MoveCellRangeCommand,
  RestoreFullSheetStateCommand,
  SetCellContentsCommand,
} from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  parseCellKey,
  validateCommandPayload,
} from "./helpers.js";

function normalizeCommandCellContent(value: unknown, field: string): CellContent | null {
  if (value === null) return null;
  try {
    // Validates and deep-clones through the sheet model's public contract.
    const temporary = {
      id: "validation",
      name: "Validation",
      cells: new Map(),
      rowHeights: new Map(),
      columnWidths: new Map(),
      freezePanes: { rows: 0, columns: 0 },
      filter: null,
      mergedCells: [],
    };
    setCellContent(temporary, { row: 0, column: 0 }, value as CellContent);
    return getCellContent(temporary, { row: 0, column: 0 });
  } catch {
    throw invalidCommandPayload(field, value);
  }
}

export function createSetCellContentCommand(
  sheetId: string,
  address: CellAddress,
  content: CellContent | null,
): SetCellContentsCommand {
  return {
    type: "setCellContents",
    changes: [
      {
        sheetId,
        address: { ...address },
        content: normalizeCommandCellContent(content, "content"),
      },
    ],
  };
}

export function createBatchSetCellContentsCommand(
  changes: readonly CellContentChange[],
  options?: { reconcileBorders?: boolean },
): SetCellContentsCommand {
  return {
    type: "setCellContents",
    changes: changes.map((change, index) => ({
      sheetId: change.sheetId,
      address: { ...change.address },
      content: normalizeCommandCellContent(change.content, `changes.${index}.content`),
      ...("style" in change
        ? {
            style:
              validateCommandPayload(`changes.${index}.style`, change.style, () =>
                cloneCellStyle(change.style ?? undefined),
              ) ?? null,
          }
        : {}),
    })),
    ...(options?.reconcileBorders ? { reconcileBorders: true } : {}),
  };
}

export function createClearCellRangeCommand(
  sheetId: string,
  range: CellRange,
): ClearCellRangeCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  return { type: "clearCellRange", sheetId, range: normalizedRange };
}

export function createMoveCellRangeCommand(
  sheetId: string,
  source: CellRange,
  destination: CellAddress,
): MoveCellRangeCommand {
  const range = normalizeRange(source);
  assertCellRange(range);
  const end = {
    row: destination.row + range.end.row - range.start.row,
    column: destination.column + range.end.column - range.start.column,
  };
  assertCellAddress(destination);
  assertCellAddress(end);
  return { type: "moveCellRange", sheetId, source: range, destination: { ...destination } };
}

export function createPasteCellContentsCommand(
  sheetId: string,
  anchor: CellAddress,
  contents: readonly (readonly (CellContent | null)[])[],
  options?: {
    clearRange?: CellRange;
    styles?: readonly (readonly (CellStyle | null)[])[];
  },
): SetCellContentsCommand {
  const size = validateCommandPayload("contents", contents, () => getCellMatrixSize(contents));
  const end = {
    row: anchor.row + size.rowCount - 1,
    column: anchor.column + size.columnCount - 1,
  };
  assertCellAddress(anchor);
  assertCellAddress(end);
  if (
    options?.styles &&
    (options.styles.length !== size.rowCount ||
      options.styles.some((row) => row.length !== size.columnCount))
  ) {
    throw invalidCommandPayload(
      "styles",
      options.styles,
      "Pasted cell styles must match the pasted value matrix.",
    );
  }

  const changes = new Map<string, CellContentChange>();
  const setChange = (
    address: CellAddress,
    content: CellContent | null,
    style?: CellStyle | null,
  ) => {
    changes.set(`${address.row}:${address.column}`, {
      sheetId,
      address: { ...address },
      content,
      ...(style === undefined ? {} : { style: style ? cloneCellStyle(style) : null }),
    });
  };

  if (options?.clearRange) {
    const clearRange = normalizeRange(options.clearRange);
    assertCellRange(clearRange);
    for (let row = clearRange.start.row; row <= clearRange.end.row; row += 1) {
      for (let column = clearRange.start.column; column <= clearRange.end.column; column += 1) {
        setChange({ row, column }, null, null);
      }
    }
  }
  for (let row = 0; row < size.rowCount; row += 1) {
    for (let column = 0; column < size.columnCount; column += 1) {
      const address = { row: anchor.row + row, column: anchor.column + column };
      const content = contents[row]?.[column] ?? null;
      setChange(
        address,
        content,
        options?.styles ? (options.styles[row]?.[column] ?? null) : undefined,
      );
    }
  }
  return createBatchSetCellContentsCommand([...changes.values()], {
    reconcileBorders: Boolean(options?.styles),
  });
}

export function applySetCellContentsCommand(
  workbook: Workbook,
  command: SetCellContentsCommand,
): SetCellContentsCommand | null {
  if (!Array.isArray(command.changes)) {
    throw invalidCommandPayload("changes", command.changes);
  }
  const resolvers = new Map<string, MergedCellRangeResolver>();
  const getResolver = (sheetId: string) => {
    const cached = resolvers.get(sheetId);
    if (cached) return cached;
    const resolver = new MergedCellRangeResolver(getSheetOrThrow(workbook, sheetId).mergedCells);
    resolvers.set(sheetId, resolver);
    return resolver;
  };
  const addresses = new Set<string>();
  const normalizedChanges = command.changes.map((change, index) => {
    if (!change || typeof change !== "object") {
      throw invalidCommandPayload(`changes.${index}`, change);
    }
    if (!change.address || typeof change.address !== "object") {
      throw invalidCommandPayload(`changes.${index}.address`, change.address);
    }
    assertCellAddress(change.address);
    getSheetOrThrow(workbook, change.sheetId);
    const key = `${change.sheetId}:${change.address.row}:${change.address.column}`;
    if (addresses.has(key)) {
      throw invalidCommandPayload(
        `changes.${index}.address`,
        change.address,
        "Duplicate cell change.",
      );
    }
    addresses.add(key);
    const anchor = getResolver(change.sheetId).getAnchor(change.address);
    if (
      command.changes.length > 1 &&
      anchor &&
      (anchor.row !== change.address.row || anchor.column !== change.address.column)
    ) {
      throw invalidCommandPayload(
        `changes.${index}.address`,
        change.address,
        "Batch cell updates cannot target a merged cell tail.",
      );
    }
    return {
      sheetId: change.sheetId,
      // A direct edit of a displayed merge tail belongs to its sole anchor.
      address: anchor ?? { ...change.address },
      content: normalizeCommandCellContent(change.content, `changes.${index}.content`),
      ...(Object.hasOwn(change, "style")
        ? {
            style:
              validateCommandPayload(`changes.${index}.style`, change.style, () =>
                normalizeCellStyle(change.style),
              ) ?? null,
          }
        : {}),
    } satisfies CellContentChange;
  });
  const reverseChanges: CellContentChange[] = [];
  const reverseChangesByAddress = new Map<string, CellContentChange>();
  const initialStates = new Map<
    string,
    {
      sheetId: string;
      address: CellAddress;
      content: CellContent | null;
      style: CellStyle | undefined;
    }
  >();
  const getChangeKey = (sheetId: string, address: CellAddress) =>
    `${sheetId}:${address.row}:${address.column}`;

  for (const change of normalizedChanges) {
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const key = getChangeKey(change.sheetId, change.address);
    if (initialStates.has(key)) continue;
    initialStates.set(key, {
      sheetId: change.sheetId,
      address: { ...change.address },
      content: getCellContent(sheet, change.address),
      style: cloneCellStyle(getCellStyle(sheet, change.address) as CellStyle | undefined),
    });
  }

  const recordReverseChange = (
    sheetId: string,
    address: CellAddress,
    includeStyle: boolean,
    fallback?: { content: CellContent | null; style: CellStyle | undefined },
  ) => {
    const key = getChangeKey(sheetId, address);
    const previous =
      initialStates.get(key) ??
      (fallback ? { sheetId, address: { ...address }, ...fallback } : undefined);
    if (!previous)
      throw new Error(`Missing previous state for cell ${address.row}:${address.column}.`);
    const existing = reverseChangesByAddress.get(key);
    if (existing) {
      if (includeStyle && !("style" in existing))
        Object.assign(existing, { style: previous.style ?? null });
      return;
    }
    const reverseChange: CellContentChange = {
      sheetId,
      address: { ...address },
      content: previous.content,
      ...(includeStyle ? { style: previous.style ?? null } : {}),
    };
    reverseChanges.unshift(reverseChange);
    reverseChangesByAddress.set(key, reverseChange);
  };

  for (const change of normalizedChanges) {
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const valueChanged = setCellContent(sheet, change.address, change.content);
    const styleChanged =
      "style" in change ? setCellStyle(sheet, change.address, change.style) : false;
    if (valueChanged || styleChanged) {
      recordReverseChange(change.sheetId, change.address, "style" in change);
    }
  }

  if (command.reconcileBorders) {
    const targetsBySheet = new Map<
      string,
      Map<string, { address: CellAddress; patch: CellBorderPatch }>
    >();
    for (const change of normalizedChanges) {
      if (!("style" in change)) continue;
      const targets = targetsBySheet.get(change.sheetId) ?? new Map();
      targets.set(getCellBorderTargetKey(change.address), {
        address: { ...change.address },
        patch: getExactCellBorderPatch(normalizeCellStyle(change.style)),
      });
      targetsBySheet.set(change.sheetId, targets);
    }
    for (const [sheetId, targets] of targetsBySheet) {
      const cleanupPatches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
      reconcileCellBorderTargets(targets, (address, patch) => {
        const mergeAwareAddress = getResolver(sheetId).getAnchor(address) ?? address;
        const key = getCellBorderTargetKey(mergeAwareAddress);
        const existing = cleanupPatches.get(key);
        if (existing) Object.assign(existing.patch, patch);
        else cleanupPatches.set(key, { address: { ...mergeAwareAddress }, patch: { ...patch } });
      });
      const sheet = getSheetOrThrow(workbook, sheetId);
      for (const { address, patch } of cleanupPatches.values()) {
        const previousContent = getCellContent(sheet, address);
        const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
        if (setCellStyle(sheet, address, mergeCellStyle(previousStyle, patch))) {
          recordReverseChange(sheetId, address, true, {
            content: previousContent,
            style: previousStyle,
          });
        }
      }
    }
  }
  return reverseChanges.length > 0 ? createBatchSetCellContentsCommand(reverseChanges) : null;
}

export function applyClearCellRangeCommand(
  workbook: Workbook,
  command: ClearCellRangeCommand,
): SetCellContentsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const range = expandSelectionToMergedCellRanges(normalizeRange(command.range), sheet.mergedCells);
  assertCellRange(range);
  const reverseChanges: CellContentChange[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      address.row < range.start.row ||
      address.row > range.end.row ||
      address.column < range.start.column ||
      address.column > range.end.column ||
      cell.content === undefined
    ) {
      continue;
    }
    reverseChanges.push({
      sheetId: command.sheetId,
      address,
      content: cloneCellContent(cell.content),
    });
    setCellContent(sheet, address, null);
  }
  return reverseChanges.length > 0 ? createBatchSetCellContentsCommand(reverseChanges) : null;
}

export function applyMoveCellRangeCommand(
  workbook: Workbook,
  command: MoveCellRangeCommand,
): RestoreFullSheetStateCommand | null {
  const source = normalizeRange(command.source);
  assertCellRange(source);
  assertCellAddress(command.destination);
  const end = {
    row: command.destination.row + source.end.row - source.start.row,
    column: command.destination.column + source.end.column - source.start.column,
  };
  assertCellAddress(end);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const destination = { start: { ...command.destination }, end };
  if (
    sheet.mergedCells.some(
      (merged) =>
        doMergedCellRangesIntersect(merged, source) ||
        doMergedCellRangesIntersect(merged, destination),
    )
  ) {
    throw invalidCommandPayload(
      "source",
      command.source,
      "Moving merged cells is not supported until merged move semantics are defined.",
    );
  }
  if (
    source.start.row === command.destination.row &&
    source.start.column === command.destination.column
  )
    return null;
  const previous = createSheetSparseState(sheet);
  const captured = [...sheet.cells].flatMap(([key, cell]) => {
    const address = parseCellKey(key);
    return address.row >= source.start.row &&
      address.row <= source.end.row &&
      address.column >= source.start.column &&
      address.column <= source.end.column
      ? [
          {
            address,
            content: cell.content ? cloneCellContent(cell.content) : undefined,
            style: cloneCellStyle(cell.style),
          },
        ]
      : [];
  });
  const isIn = (address: CellAddress, range: CellRange) =>
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column;
  const affected = new Map<string, CellAddress>();
  for (const [key] of sheet.cells) {
    const address = parseCellKey(key);
    if (isIn(address, source) || isIn(address, destination)) affected.set(key, address);
  }
  // Sparse clear gives blank source cells overwrite semantics without iterating the rectangle.
  for (const address of affected.values()) {
    setCellContent(sheet, address, null);
    setCellStyle(sheet, address, null);
  }
  for (const cell of captured) {
    const address = {
      row: command.destination.row + cell.address.row - source.start.row,
      column: command.destination.column + cell.address.column - source.start.column,
    };
    setCellContent(sheet, address, cell.content ?? null);
    setCellStyle(sheet, address, cell.style ?? null);
    affected.set(`${address.row}:${address.column}`, address);
  }
  for (const [key, cell] of sheet.cells)
    if (cell.content?.kind === "formula") {
      const next = transformFormulaForMove(
        cell.content.formula.source,
        source,
        command.destination,
      );
      if (next !== cell.content.formula.source)
        sheet.cells.set(key, { ...cell, content: { kind: "formula", formula: { source: next } } });
    }
  const targets = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (const address of affected.values())
    targets.set(getCellBorderTargetKey(address), {
      address,
      patch: getExactCellBorderPatch(getCellStyle(sheet, address)),
    });
  reconcileCellBorderTargets(targets, (address, patch) =>
    setCellStyle(sheet, address, mergeCellStyle(getCellStyle(sheet, address), patch)),
  );
  const current = createSheetSparseState(sheet);
  if (JSON.stringify(current) === JSON.stringify(previous)) return null;
  return { type: "restoreSheetState", sheetId: command.sheetId, state: previous };
}
