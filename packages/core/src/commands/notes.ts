import {
  cloneCellNote,
  getCellNote,
  normalizeCellNote,
  setCellNote,
  type CellAddress,
  type CellNote,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellNotesCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

export function createSetCellNoteCommand(
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
  note: CellNote | null,
): SetCellNotesCommand {
  getSheetOrThrow(workbook, sheetId);
  return createSetCellNotesCommand(sheetId, [{ address, note }]);
}

export function createSetCellNotesCommand(
  sheetId: string,
  changes: readonly { address: CellAddress; note: CellNote | null }[],
): SetCellNotesCommand {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new TypeError("Cell note changes must not be empty.");
  }
  const addresses = new Set<string>();
  return {
    type: "setCellNotes",
    sheetId,
    changes: changes.map((change, index) => {
      assertCellAddress(change.address);
      const key = `${change.address.row}:${change.address.column}`;
      if (addresses.has(key)) throw new TypeError("Cell note changes must not repeat an address.");
      addresses.add(key);
      return {
        address: { ...change.address },
        note:
          validateCommandPayload(`changes.${index}.note`, change.note, () =>
            normalizeCellNote(change.note),
          ) ?? null,
      };
    }),
  };
}

/** Clears existing notes in a range with one history entry. */
export function createClearCellNotesCommand(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
): SetCellNotesCommand | null {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  const sheet = getSheetOrThrow(workbook, sheetId);
  const changes = [...sheet.cells].flatMap(([key, cell]) => {
    if (!cell.note) return [];
    const separator = key.indexOf(":");
    const address = {
      row: Number(key.slice(0, separator)),
      column: Number(key.slice(separator + 1)),
    };
    return address.row >= normalizedRange.start.row &&
      address.row <= normalizedRange.end.row &&
      address.column >= normalizedRange.start.column &&
      address.column <= normalizedRange.end.column
      ? [{ address, note: null }]
      : [];
  });
  return changes.length ? createSetCellNotesCommand(sheetId, changes) : null;
}

export function applySetCellNotesCommand(
  workbook: Workbook,
  command: SetCellNotesCommand,
): SetCellNotesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (!Array.isArray(command.changes) || command.changes.length === 0) {
    throw new TypeError("Cell note changes must not be empty.");
  }
  const addresses = new Set<string>();
  const changes = command.changes.map((change) => {
    assertCellAddress(change.address);
    const key = `${change.address.row}:${change.address.column}`;
    if (addresses.has(key)) throw new TypeError("Cell note changes must not repeat an address.");
    addresses.add(key);
    return {
      address: { ...change.address },
      note: validateCommandPayload("note", change.note, () => normalizeCellNote(change.note)),
    };
  });
  const inverse: Array<{ address: CellAddress; note: CellNote | null }> = [];
  for (const change of changes) {
    const previous = cloneCellNote(getCellNote(sheet, change.address)) ?? null;
    if (setCellNote(sheet, change.address, change.note)) {
      inverse.unshift({ address: { ...change.address }, note: previous });
    }
  }
  return inverse.length
    ? { type: "setCellNotes", sheetId: command.sheetId, changes: inverse }
    : null;
}
