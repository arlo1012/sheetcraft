import { assertPictureObjectsForSheet } from "../picture-object-sheet.js";
import { assertShapeObjectsForSheet } from "../shape-object-sheet.js";
import {
  DEFAULT_COLUMN_WIDTH,
  getDefaultRowHeight,
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getDefaultColumnWidth,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  setDefaultColumnWidth,
  setColumnWidth,
  setSheetDimensionHidden,
  setRowHeight,
  type Sheet,
  type Workbook,
} from "../workbook.js";
import type {
  ResetSheetDimensionSizesCommand,
  ResizeSheetDimensionCommand,
  ResizeSheetDimensionsCommand,
  RestoreSheetDimensionStateCommand,
  SetSheetDefaultColumnWidthCommand,
  SetSheetDimensionHiddenCommand,
  SetSheetDimensionSizesCommand,
} from "./contracts.js";
import { getSheetOrThrow, invalidCommandPayload } from "./helpers.js";
import { createSetSheetFloatingImagesCommand } from "./images.js";

export function createResizeSheetDimensionCommand(
  sheetId: string,
  axis: ResizeSheetDimensionCommand["axis"],
  index: number,
  size: number,
): ResizeSheetDimensionCommand {
  return { type: "resizeSheetDimension", sheetId, axis, index, size };
}

export function createResizeSheetDimensionsCommand(
  sheetId: string,
  axis: ResizeSheetDimensionsCommand["axis"],
  indexes: number[],
  size: number,
): ResizeSheetDimensionsCommand {
  return { type: "resizeSheetDimensions", sheetId, axis, indexes, size };
}

export function createSetSheetDimensionSizesCommand(
  sheetId: string,
  axis: SetSheetDimensionSizesCommand["axis"],
  changes: SetSheetDimensionSizesCommand["changes"],
): SetSheetDimensionSizesCommand {
  return { type: "setSheetDimensionSizes", sheetId, axis, changes };
}

export function createSetSheetDimensionHiddenCommand(
  sheetId: string,
  axis: SetSheetDimensionHiddenCommand["axis"],
  indexes: number[],
  hidden: boolean,
): SetSheetDimensionHiddenCommand {
  return { type: "setSheetDimensionHidden", sheetId, axis, indexes, hidden };
}

export function createResetSheetDimensionSizesCommand(
  sheetId: string,
  axis: ResetSheetDimensionSizesCommand["axis"],
  indexes: number[],
): ResetSheetDimensionSizesCommand {
  return { type: "resetSheetDimensionSizes", sheetId, axis, indexes };
}

export function createSetSheetDefaultColumnWidthCommand(
  sheetId: string,
  width: number,
): SetSheetDefaultColumnWidthCommand {
  return { type: "setSheetDefaultColumnWidth", sheetId, width };
}

function assertAxis(axis: unknown): asserts axis is "row" | "column" {
  if (axis !== "row" && axis !== "column") throw invalidCommandPayload("axis", axis);
}

function assertIndex(axis: "row" | "column", index: unknown): asserts index is number {
  const maximumIndex = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= maximumIndex) {
    throw invalidCommandPayload("index", index);
  }
}

function assertSize(axis: "row" | "column", size: unknown, field = "size"): asserts size is number {
  const minimumSize = axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
  const maximumSize = axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < minimumSize ||
    size > maximumSize
  ) {
    throw invalidCommandPayload(field, size);
  }
}

function normalizedIndexes(axis: "row" | "column", indexes: unknown): number[] {
  if (!Array.isArray(indexes) || indexes.length === 0)
    throw invalidCommandPayload("indexes", indexes);
  const result = [...new Set(indexes)];
  for (const index of result) assertIndex(axis, index);
  return result.sort((left, right) => left - right);
}

function createRestoreSheetDimensionStateCommand(
  sheetId: string,
  axis: "row" | "column",
  sheet: Sheet,
): RestoreSheetDimensionStateCommand {
  const dimensions = axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  const hiddenIndexes = [
    ...(axis === "row" ? (sheet.hiddenRows ?? []) : (sheet.hiddenColumns ?? [])),
  ];
  return {
    type: "restoreSheetDimensionState",
    sheetId,
    axis,
    dimensions: [...dimensions].map(([index, size]) => ({ index, size })),
    hiddenIndexes,
    floatingImageState: sheet.floatingImages.map(cloneFloatingImage),
    ...(axis === "row"
      ? { defaultRowHeight: getDefaultRowHeight(sheet) }
      : { defaultColumnWidth: getDefaultColumnWidth(sheet) }),
  };
}

function setSize(sheet: Sheet, axis: "row" | "column", index: number, size: number) {
  return axis === "row" ? setRowHeight(sheet, index, size) : setColumnWidth(sheet, index, size);
}

function preflightDimensionMutation(sheet: Sheet, mutate: (shadow: Sheet) => void): void {
  const shadow: Sheet = {
    ...sheet,
    rowHeights: new Map(sheet.rowHeights),
    columnWidths: new Map(sheet.columnWidths),
    hiddenRows: new Set(sheet.hiddenRows),
    hiddenColumns: new Set(sheet.hiddenColumns),
  };
  mutate(shadow);
  assertPictureObjectsForSheet(shadow.floatingImages, shadow);
  assertShapeObjectsForSheet(shadow.drawings, shadow);
}

export function applyResizeSheetDimensionCommand(
  workbook: Workbook,
  command: ResizeSheetDimensionCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  assertIndex(command.axis, command.index);
  assertSize(command.axis, command.size);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  preflightDimensionMutation(sheet, (shadow) => {
    setSize(shadow, command.axis, command.index, command.size);
  });
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  const changed =
    command.axis === "row"
      ? setRowHeight(sheet, command.index, command.size)
      : setColumnWidth(sheet, command.index, command.size);
  return changed ? inverse : null;
}

export function applyResizeSheetDimensionsCommand(
  workbook: Workbook,
  command: ResizeSheetDimensionsCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  const indexes = normalizedIndexes(command.axis, command.indexes);
  assertSize(command.axis, command.size);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const changedIndexes = indexes.filter((index) =>
    command.axis === "row"
      ? (sheet.rowHeights.get(index) ?? getDefaultRowHeight(sheet)) !== command.size
      : (sheet.columnWidths.get(index) ?? getDefaultColumnWidth(sheet)) !== command.size,
  );
  if (changedIndexes.length === 0) return null;
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  preflightDimensionMutation(sheet, (shadow) => {
    for (const index of changedIndexes) setSize(shadow, command.axis, index, command.size);
  });
  for (const index of changedIndexes) setSize(sheet, command.axis, index, command.size);
  return inverse;
}

export function applySetSheetDimensionSizesCommand(
  workbook: Workbook,
  command: SetSheetDimensionSizesCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  if (!Array.isArray(command.changes) || command.changes.length === 0)
    throw invalidCommandPayload("changes", command.changes);
  const seen = new Set<number>();
  for (const change of command.changes) {
    if (!change || typeof change !== "object") throw invalidCommandPayload("changes", change);
    assertIndex(command.axis, change.index);
    assertSize(command.axis, change.size, "changes.size");
    if (seen.has(change.index)) throw invalidCommandPayload("changes", command.changes);
    seen.add(change.index);
  }
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const changes = command.changes.filter((change) =>
    command.axis === "row"
      ? (sheet.rowHeights.get(change.index) ?? getDefaultRowHeight(sheet)) !== change.size
      : (sheet.columnWidths.get(change.index) ?? getDefaultColumnWidth(sheet)) !== change.size,
  );
  if (changes.length === 0) return null;
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  preflightDimensionMutation(sheet, (shadow) => {
    for (const change of changes) setSize(shadow, command.axis, change.index, change.size);
  });
  for (const change of changes) setSize(sheet, command.axis, change.index, change.size);
  return inverse;
}

export function applySetSheetDimensionHiddenCommand(
  workbook: Workbook,
  command: SetSheetDimensionHiddenCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  const indexes = normalizedIndexes(command.axis, command.indexes);
  if (typeof command.hidden !== "boolean") throw invalidCommandPayload("hidden", command.hidden);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const hidden = command.axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  if (indexes.every((index) => (hidden?.has(index) ?? false) === command.hidden)) return null;
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  preflightDimensionMutation(sheet, (shadow) => {
    for (const index of indexes)
      setSheetDimensionHidden(shadow, command.axis, index, command.hidden);
  });
  for (const index of indexes) setSheetDimensionHidden(sheet, command.axis, index, command.hidden);
  return inverse;
}

export function applyResetSheetDimensionSizesCommand(
  workbook: Workbook,
  command: ResetSheetDimensionSizesCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  const indexes = normalizedIndexes(command.axis, command.indexes);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const dimensions = command.axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  if (indexes.every((index) => !dimensions.has(index))) return null;
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  preflightDimensionMutation(sheet, (shadow) => {
    const next = command.axis === "row" ? shadow.rowHeights : shadow.columnWidths;
    for (const index of indexes) next.delete(index);
  });
  for (const index of indexes) dimensions.delete(index);
  return inverse;
}

export function applySetSheetDefaultColumnWidthCommand(
  workbook: Workbook,
  command: SetSheetDefaultColumnWidthCommand,
): RestoreSheetDimensionStateCommand | null {
  assertSize("column", command.width, "width");
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (getDefaultColumnWidth(sheet) === command.width) return null;
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, "column", sheet);
  preflightDimensionMutation(sheet, (shadow) => {
    setDefaultColumnWidth(shadow, command.width);
  });
  setDefaultColumnWidth(sheet, command.width);
  return inverse;
}

export function applyRestoreSheetDimensionStateCommand(
  workbook: Workbook,
  command: RestoreSheetDimensionStateCommand,
): RestoreSheetDimensionStateCommand | null {
  assertAxis(command.axis);
  if (!Array.isArray(command.dimensions) || !Array.isArray(command.hiddenIndexes))
    throw invalidCommandPayload("state", command);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const dimensions = command.axis === "row" ? sheet.rowHeights : sheet.columnWidths;
  const maximum = command.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  // Older row inverses did not own a baseline; retain the target default.
  const defaultRowHeight =
    command.defaultRowHeight === undefined ? getDefaultRowHeight(sheet) : command.defaultRowHeight;
  const defaultColumnWidth = command.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH;
  if (command.axis === "row") assertSize("row", defaultRowHeight, "defaultRowHeight");
  if (command.axis === "column") assertSize("column", defaultColumnWidth, "defaultColumnWidth");
  const seen = new Set<number>();
  for (const dimension of command.dimensions) {
    if (!dimension || typeof dimension !== "object")
      throw invalidCommandPayload("dimensions", dimension);
    assertIndex(command.axis, dimension.index);
    assertSize(command.axis, dimension.size, "dimensions.size");
    if (
      (command.axis === "row" && dimension.size === defaultRowHeight) ||
      (command.axis === "column" && dimension.size === defaultColumnWidth)
    )
      throw invalidCommandPayload("dimensions", command.dimensions);
    if (seen.has(dimension.index)) throw invalidCommandPayload("dimensions", command.dimensions);
    seen.add(dimension.index);
  }
  const hidden = new Set<number>();
  for (const index of command.hiddenIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= maximum)
      throw invalidCommandPayload("hiddenIndexes", command.hiddenIndexes);
    if (hidden.has(index)) throw invalidCommandPayload("hiddenIndexes", command.hiddenIndexes);
    hidden.add(index);
  }
  const pictures =
    command.floatingImageState === undefined
      ? undefined
      : createSetSheetFloatingImagesCommand(command.sheetId, command.floatingImageState).images;
  const currentHidden = command.axis === "row" ? sheet.hiddenRows : sheet.hiddenColumns;
  const unchanged =
    dimensions.size === command.dimensions.length &&
    command.dimensions.every(({ index, size }) => dimensions.get(index) === size) &&
    (currentHidden?.size ?? 0) === hidden.size &&
    [...hidden].every((index) => currentHidden?.has(index)) &&
    (command.axis === "row"
      ? getDefaultRowHeight(sheet) === defaultRowHeight
      : getDefaultColumnWidth(sheet) === defaultColumnWidth) &&
    (pictures === undefined || areFloatingImageCollectionsEqual(sheet.floatingImages, pictures));
  if (unchanged) return null;
  preflightDimensionMutation(sheet, (shadow) => {
    const nextDimensions = new Map(command.dimensions.map((entry) => [entry.index, entry.size]));
    if (command.axis === "row") {
      shadow.defaultRowHeight = defaultRowHeight;
      shadow.rowHeights = nextDimensions;
      shadow.hiddenRows = hidden;
    } else {
      shadow.columnWidths = nextDimensions;
      shadow.hiddenColumns = hidden;
      shadow.defaultColumnWidth = defaultColumnWidth;
    }
    shadow.floatingImages = pictures ?? sheet.floatingImages;
  });
  const inverse = createRestoreSheetDimensionStateCommand(command.sheetId, command.axis, sheet);
  dimensions.clear();
  for (const dimension of command.dimensions) dimensions.set(dimension.index, dimension.size);
  if (command.axis === "row") {
    sheet.defaultRowHeight = defaultRowHeight;
    sheet.hiddenRows = hidden;
  } else {
    sheet.hiddenColumns = hidden;
    sheet.defaultColumnWidth = defaultColumnWidth;
  }
  if (pictures !== undefined) sheet.floatingImages = pictures;
  return inverse;
}
