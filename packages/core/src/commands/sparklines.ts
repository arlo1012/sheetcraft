import {
  cloneCellSparkline,
  normalizeCellSparkline,
  getSheetSparklines,
  expandSparklineGroups,
  type CellSparkline,
} from "../sparklines.js";
import {
  getCellSparkline,
  setCellSparkline,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellSparklinesCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

/** Selected sparklines adopt the primary member's shared settings and retain their own sources. */
export function createGroupCellSparklinesCommand(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  primary: CellAddress,
  groupId: string,
): SetCellSparklinesCommand | null {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  const entries = getSheetSparklines(getSheetOrThrow(workbook, sheetId), normalizedRange);
  if (entries.length < 2) return null;
  const first =
    entries.find(
      ({ address }) => address.row === primary.row && address.column === primary.column,
    ) ?? entries[0]!;
  return createSetCellSparklinesCommand(
    sheetId,
    entries.map(({ address, value }) => ({
      address,
      sparkline: { ...first.value, groupId, source: value.source },
    })),
  );
}

/** Dissolve each selected group, including peers outside the current selection. */
export function createUngroupCellSparklinesCommand(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
): SetCellSparklinesCommand | null {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  const sheet = getSheetOrThrow(workbook, sheetId);
  const entries = expandSparklineGroups(sheet, getSheetSparklines(sheet, normalizedRange));
  const changes = entries
    .filter(({ value }) => value.groupId !== undefined)
    .map(({ address, value }) => {
      const { groupId: _groupId, ...sparkline } = value;
      return { address, sparkline };
    });
  return changes.length ? createSetCellSparklinesCommand(sheetId, changes) : null;
}

export function createSetCellSparklineCommand(
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
  sparkline: CellSparkline | null,
): SetCellSparklinesCommand {
  getSheetOrThrow(workbook, sheetId);
  return createSetCellSparklinesCommand(sheetId, [{ address, sparkline }]);
}

export function createSetCellSparklinesCommand(
  sheetId: string,
  changes: readonly { address: CellAddress; sparkline: CellSparkline | null }[],
): SetCellSparklinesCommand {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new TypeError("Sparkline changes must not be empty.");
  }
  const addresses = new Set<string>();
  return {
    type: "setCellSparklines",
    sheetId,
    changes: changes.map((change, index) => {
      assertCellAddress(change.address);
      const key = `${change.address.row}:${change.address.column}`;
      if (addresses.has(key)) throw new TypeError("Sparkline changes must not repeat an address.");
      addresses.add(key);
      return {
        address: { ...change.address },
        sparkline:
          validateCommandPayload(`changes.${index}.sparkline`, change.sparkline, () =>
            normalizeCellSparkline(change.sparkline),
          ) ?? null,
      };
    }),
  };
}

/** Clears existing sparklines in a range with one history entry. */
export function createClearCellSparklinesCommand(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
): SetCellSparklinesCommand | null {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  const sheet = getSheetOrThrow(workbook, sheetId);
  const changes = [...sheet.cells].flatMap(([key, cell]) => {
    if (!cell.sparkline) return [];
    const separator = key.indexOf(":");
    const address = {
      row: Number(key.slice(0, separator)),
      column: Number(key.slice(separator + 1)),
    };
    return address.row >= normalizedRange.start.row &&
      address.row <= normalizedRange.end.row &&
      address.column >= normalizedRange.start.column &&
      address.column <= normalizedRange.end.column
      ? [{ address, sparkline: null }]
      : [];
  });
  return changes.length ? createSetCellSparklinesCommand(sheetId, changes) : null;
}

export function applySetCellSparklinesCommand(
  workbook: Workbook,
  command: SetCellSparklinesCommand,
): SetCellSparklinesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (!Array.isArray(command.changes) || command.changes.length === 0) {
    throw new TypeError("Sparkline changes must not be empty.");
  }
  const addresses = new Set<string>();
  const changes = command.changes.map((change) => {
    assertCellAddress(change.address);
    const key = `${change.address.row}:${change.address.column}`;
    if (addresses.has(key)) throw new TypeError("Sparkline changes must not repeat an address.");
    addresses.add(key);
    return {
      address: { ...change.address },
      sparkline: validateCommandPayload("sparkline", change.sparkline, () =>
        normalizeCellSparkline(change.sparkline),
      ),
    };
  });
  const inverse: Array<{ address: CellAddress; sparkline: CellSparkline | null }> = [];
  for (const change of changes) {
    const previous = cloneCellSparkline(getCellSparkline(sheet, change.address)) ?? null;
    if (setCellSparkline(sheet, change.address, change.sparkline)) {
      inverse.unshift({ address: { ...change.address }, sparkline: previous });
    }
  }
  return inverse.length
    ? { type: "setCellSparklines", sheetId: command.sheetId, changes: inverse }
    : null;
}
