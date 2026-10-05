import {
  normalizeProtectionPassword,
  verifyProtectionPassword,
  type ProtectionPassword,
} from "./protection-password.js";
import { expandSelectionToMergedCellRanges } from "./merged-cells.js";
import type { CellAddress, CellRange, Sheet } from "./workbook.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./workbook.js";

export type EditableRange = { name: string; range: CellRange; password?: ProtectionPassword };
export type SheetProtection = {
  editableRanges: EditableRange[];
  password?: ProtectionPassword;
  selectLockedCells?: false;
  selectUnlockedCells?: false;
  insertColumns?: true;
  insertRows?: true;
  insertHyperlinks?: true;
  deleteColumns?: true;
  deleteRows?: true;
  sort?: true;
  autoFilter?: true;
  pivotTables?: true;
  editObjects?: true;
  formatCells?: true;
  formatRows?: true;
  formatColumns?: true;
};

export function normalizeSheetProtection(
  value: SheetProtection | undefined,
): SheetProtection | undefined {
  if (value === undefined) return undefined;
  if (!value || !Array.isArray(value.editableRanges)) throw new Error("Invalid sheet protection.");
  const names = new Set<string>();
  const editableRanges = value.editableRanges.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !entry.name.trim())
      throw new Error("An editable range requires a name.");
    const name = entry.name.trim();
    if (names.has(name.toLowerCase())) throw new Error("Duplicate editable range name.");
    names.add(name.toLowerCase());
    const { start, end } = entry.range ?? {};
    for (const address of [start, end]) {
      if (
        !address ||
        !Number.isSafeInteger(address.row) ||
        !Number.isSafeInteger(address.column) ||
        address.row < 0 ||
        address.row >= MAX_SHEET_ROWS ||
        address.column < 0 ||
        address.column >= MAX_SHEET_COLUMNS
      )
        throw new Error("Invalid editable range.");
    }
    return {
      name,
      ...(entry.password !== undefined
        ? { password: normalizeProtectionPassword(entry.password) }
        : {}),
      range: {
        start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
        end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
      },
    };
  });
  const result: SheetProtection = {
    editableRanges,
    ...(value.password !== undefined
      ? { password: normalizeProtectionPassword(value.password) }
      : {}),
  };
  for (const key of [
    "formatCells",
    "formatRows",
    "formatColumns",
    "insertColumns",
    "insertRows",
    "insertHyperlinks",
    "deleteColumns",
    "deleteRows",
    "sort",
    "autoFilter",
    "pivotTables",
    "editObjects",
  ] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new Error(`Invalid protection option: ${key}.`);
    if (value[key]) result[key] = true;
  }
  for (const key of ["selectLockedCells", "selectUnlockedCells"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new Error("Invalid selection permission.");
    if (value[key] === false) result[key] = false;
  }
  return result;
}

export function isCellLocked(sheet: Sheet, address: CellAddress): boolean {
  return sheet.cells.get(`${address.row}:${address.column}`)?.style?.unlocked !== true;
}
function contains(range: CellRange, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}
export function canEditCell(sheet: Sheet, address: CellAddress): boolean {
  if (!sheet.properties.protected) return true;
  const range = expandSelectionToMergedCellRanges(
    { start: address, end: address },
    sheet.mergedCells,
  );
  if (range.start.row !== range.end.row || range.start.column !== range.end.column)
    return canEditRange(sheet, range);
  return (
    !isCellLocked(sheet, address) ||
    Boolean(
      sheet.protection?.editableRanges.some(
        (entry) => isEditableRangeUnlocked(sheet, entry) && contains(entry.range, address),
      ),
    )
  );
}

/** Checks sparse unlocked cells and range rectangles without walking an entire worksheet. */
export function canEditRange(sheet: Sheet, input: CellRange): boolean {
  if (!sheet.properties.protected) return true;
  const range = {
    start: {
      row: Math.min(input.start.row, input.end.row),
      column: Math.min(input.start.column, input.end.column),
    },
    end: {
      row: Math.max(input.start.row, input.end.row),
      column: Math.max(input.start.column, input.end.column),
    },
  };
  let remaining: CellRange[] = [range];
  for (const entry of sheet.protection?.editableRanges ?? []) {
    if (!isEditableRangeUnlocked(sheet, entry)) continue;
    const allowed = entry.range;
    remaining = remaining.flatMap((part) => {
      const top = Math.max(part.start.row, allowed.start.row);
      const bottom = Math.min(part.end.row, allowed.end.row);
      const left = Math.max(part.start.column, allowed.start.column);
      const right = Math.min(part.end.column, allowed.end.column);
      if (top > bottom || left > right) return [part];
      const pieces: CellRange[] = [];
      if (part.start.row < top)
        pieces.push({ start: { ...part.start }, end: { row: top - 1, column: part.end.column } });
      if (bottom < part.end.row)
        pieces.push({
          start: { row: bottom + 1, column: part.start.column },
          end: { ...part.end },
        });
      if (part.start.column < left)
        pieces.push({
          start: { row: top, column: part.start.column },
          end: { row: bottom, column: left - 1 },
        });
      if (right < part.end.column)
        pieces.push({
          start: { row: top, column: right + 1 },
          end: { row: bottom, column: part.end.column },
        });
      return pieces;
    });
    if (!remaining.length) return true;
  }
  let unlockedCount = 0;
  const required = remaining.reduce(
    (sum, part) =>
      sum + (part.end.row - part.start.row + 1) * (part.end.column - part.start.column + 1),
    0,
  );
  if (required > sheet.cells.size) return false;
  for (const [key, cell] of sheet.cells) {
    if (!cell.style?.unlocked) continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    if (remaining.some((part) => contains(part, { row, column }))) unlockedCount++;
  }
  return unlockedCount === required;
}

function isEditableRangeUnlocked(sheet: Sheet, entry: EditableRange): boolean {
  return (
    !entry.password ||
    Boolean(
      sheet.protectionAccess?.some(
        (access) =>
          access.name === entry.name && access.verifier === JSON.stringify(entry.password),
      ),
    )
  );
}

/** Session-only access: excluded from snapshots and invalidated by replacing protection settings. */
export function unlockEditableRange(sheet: Sheet, name: string, password: string): boolean {
  const range = sheet.protection?.editableRanges.find((entry) => entry.name === name);
  if (!range || !verifyProtectionPassword(password, range.password)) return false;
  sheet.protectionAccess = [
    ...(sheet.protectionAccess ?? []).filter((access) => access.name !== name),
    { name, verifier: JSON.stringify(range.password) },
  ];
  return true;
}
export function getProtectedEditableRanges(sheet: Sheet, range: CellRange): EditableRange[] {
  return (sheet.protection?.editableRanges ?? []).filter(
    (entry) =>
      entry.password &&
      !isEditableRangeUnlocked(sheet, entry) &&
      entry.range.start.row <= range.end.row &&
      entry.range.end.row >= range.start.row &&
      entry.range.start.column <= range.end.column &&
      entry.range.end.column >= range.start.column,
  );
}
export function canSelectCell(sheet: Sheet, address: CellAddress): boolean {
  if (!sheet.properties.protected) return true;
  return isCellLocked(sheet, address)
    ? sheet.protection?.selectLockedCells !== false
    : sheet.protection?.selectUnlockedCells !== false;
}

export type SheetProtectionPermission =
  | "formatCells"
  | "formatRows"
  | "formatColumns"
  | "insertColumns"
  | "insertRows"
  | "insertHyperlinks"
  | "deleteColumns"
  | "deleteRows"
  | "sort"
  | "autoFilter"
  | "pivotTables"
  | "editObjects";
export function canUseSheetPermission(
  sheet: Sheet,
  permission: SheetProtectionPermission,
): boolean {
  return !sheet.properties.protected || sheet.protection?.[permission] === true;
}
