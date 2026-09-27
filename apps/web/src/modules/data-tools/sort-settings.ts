import type { DataToolRangeSnapshot, SortInitial, SortLevel } from "./data-tools-types";

type SortTarget = Pick<DataToolRangeSnapshot, "sheetId" | "range">;
const STORAGE_VERSION = 1;

function storageKey(workbookId: string, target: SortTarget): string {
  const { start, end } = target.range;
  return `idea10.sort.settings:${JSON.stringify([
    workbookId,
    target.sheetId,
    Math.min(start.row, end.row),
    Math.min(start.column, end.column),
    Math.max(start.row, end.row),
    Math.max(start.column, end.column),
  ])}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDirection(value: unknown): boolean {
  return value === "ascending" || value === "descending";
}

function isColumn(value: unknown, target: SortTarget): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= Math.min(target.range.start.column, target.range.end.column) &&
    value <= Math.max(target.range.start.column, target.range.end.column)
  );
}

function isLevel(value: unknown, target: SortTarget): value is SortLevel {
  if (!isRecord(value) || !isColumn(value.column, target) || !isDirection(value.direction))
    return false;
  if (value.sortOn === "cellColor" || value.sortOn === "fontColor")
    return (
      value.customOrder === undefined &&
      ((value.sortOn === "cellColor" && value.color === null) ||
        (typeof value.color === "string" && value.color.trim().length > 0))
    );
  return (
    (value.sortOn === undefined || value.sortOn === "value") &&
    (value.customOrder === undefined ||
      (Array.isArray(value.customOrder) &&
        value.customOrder.length > 0 &&
        value.customOrder.every((item) => typeof item === "string" && item.trim().length > 0)))
  );
}

/** Browser preferences are scoped to a stable document identity, sheet, and exact range. */
export function readSortSettings(workbookId: string, target: SortTarget): SortInitial | undefined {
  try {
    const record: unknown = JSON.parse(
      globalThis.localStorage.getItem(storageKey(workbookId, target)) ?? "null",
    );
    if (!isRecord(record) || record.version !== STORAGE_VERSION || !isRecord(record.settings))
      return undefined;
    const settings = record.settings;
    if (
      typeof settings.hasHeader !== "boolean" ||
      typeof settings.caseSensitive !== "boolean" ||
      !isColumn(settings.column, target) ||
      !isDirection(settings.direction) ||
      !Array.isArray(settings.levels) ||
      settings.levels.length === 0 ||
      !settings.levels.every((level) => isLevel(level, target))
    )
      return undefined;
    return {
      hasHeader: settings.hasHeader,
      caseSensitive: settings.caseSensitive,
      column: settings.column,
      direction: settings.direction as SortInitial["direction"],
      levels: settings.levels,
    };
  } catch {
    return undefined;
  }
}

export function writeSortSettings(
  workbookId: string,
  target: SortTarget,
  settings: SortInitial,
): boolean {
  try {
    // Header locking is determined from the current filter when the dialog opens.
    const { hasHeader, caseSensitive, column, direction, levels } = settings;
    globalThis.localStorage.setItem(
      storageKey(workbookId, target),
      JSON.stringify({
        version: STORAGE_VERSION,
        settings: { hasHeader, caseSensitive: caseSensitive ?? false, column, direction, levels },
      }),
    );
    return true;
  } catch {
    return false;
  }
}
