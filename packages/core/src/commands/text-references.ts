import {
  mapSheetDrawingChartReferences,
  mapChartSourceVectorCells,
} from "../chart-source-references.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "../sheet-limits.js";
import { readPictureDataArray } from "../picture-data-array.js";
import { normalizeSheetDrawings, type SheetDrawing } from "../sheet-drawings.js";
import { assertShapeObjectsForSheet } from "../shape-object-sheet.js";
import {
  mapSheetDrawingTextReferences,
  MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH,
  normalizeTextBoxTextReference,
  type TextReferenceDrawingState,
} from "../text-box-reference.js";
import {
  normalizeSheetSparseState,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";
import { getSheetOrThrow, invalidCommandPayload } from "./helpers.js";

/** Lossless external-owner inverse payloads, detached before any target mutation. */
export function cloneExternalDrawingCollections(
  values: readonly TextReferenceDrawingState[],
): TextReferenceDrawingState[] {
  const entries = readPictureDataArray(values, "external drawing collections", 10000);
  const ids = new Set<string>();
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new TypeError("External drawing collections require ordinary records.");
    const prototype: unknown = Object.getPrototypeOf(entry);
    if (prototype !== null && prototype !== Object.prototype)
      throw new TypeError("External drawing collections require ordinary records.");
    for (const key of Reflect.ownKeys(entry)) {
      if (
        (key !== "sheetId" && key !== "drawings") ||
        !("value" in Object.getOwnPropertyDescriptor(entry, key)!)
      )
        throw new TypeError(
          "External drawing collections require only own sheetId and drawings data.",
        );
    }
    const idField = Object.getOwnPropertyDescriptor(entry, "sheetId");
    const drawingsField = Object.getOwnPropertyDescriptor(entry, "drawings");
    const sheetId: unknown = idField?.value;
    if (
      typeof sheetId !== "string" ||
      !sheetId.trim() ||
      sheetId.length > MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH ||
      ids.has(sheetId) ||
      !drawingsField ||
      drawingsField.value === undefined
    )
      throw new TypeError(
        "External drawing collections require distinct bounded sheet IDs and drawing forests.",
      );
    ids.add(sheetId);
    return {
      sheetId,
      drawings: normalizeSheetDrawings(drawingsField.value as readonly SheetDrawing[]),
    };
  });
}

/** The new inverse field has no legacy null/undefined elision and never evaluates accessors. */
export function readExternalDrawingCollections(
  owner: object,
): TextReferenceDrawingState[] | undefined {
  const field = Object.getOwnPropertyDescriptor(owner, "externalDrawingCollections");
  if (!field) {
    if ("externalDrawingCollections" in owner)
      throw new TypeError("External drawing collections must be own data fields.");
    return;
  }
  if (!("value" in field) || field.value === undefined || field.value === null)
    throw new TypeError("External drawing collections require explicit own collection data.");
  return cloneExternalDrawingCollections(field.value as readonly TextReferenceDrawingState[]);
}

/** Reference maintenance can change a cell/tombstone only. Identities and every other field stay exact. */
function referenceMaintenanceSignature(
  drawings: readonly SheetDrawing[],
  targetSheetId: string,
): string {
  return JSON.stringify(
    mapSheetDrawingChartReferences(
      mapSheetDrawingTextReferences(drawings, (reference) =>
        reference.sheetId === targetSheetId
          ? { sheetId: reference.sheetId, cell: null }
          : reference,
      ),
      (reference) =>
        reference.sheetId === targetSheetId ? { ...reference, cell: null } : reference,
      (reference) =>
        reference.sheetId === targetSheetId ? { ...reference, range: null } : reference,
    ),
  );
}
export type PreparedExternalDrawingCollections = {
  previous: TextReferenceDrawingState[];
  next: TextReferenceDrawingState[];
};
export function prepareExternalDrawingCollections(
  workbook: Workbook,
  ownSheetId: string,
  values: readonly TextReferenceDrawingState[] | undefined,
  association?: {
    mapCell: (cell: CellAddress) => CellAddress | null;
    mapRange?: (range: CellRange) => CellRange | null;
    direction: "restore" | "reapply";
  },
): PreparedExternalDrawingCollections {
  const previous: TextReferenceDrawingState[] = [],
    next: TextReferenceDrawingState[] = [];
  for (const entry of cloneExternalDrawingCollections(values === undefined ? [] : values)) {
    if (entry.sheetId === ownSheetId)
      throw invalidCommandPayload(
        "externalDrawingCollections",
        entry.sheetId,
        "The target sheet owns its drawing forest in its local state.",
      );
    const sheet = getSheetOrThrow(workbook, entry.sheetId);
    const original = normalizeSheetDrawings(sheet.drawings);
    if (
      referenceMaintenanceSignature(original, ownSheetId) !==
      referenceMaintenanceSignature(entry.drawings, ownSheetId)
    )
      throw invalidCommandPayload(
        "externalDrawingCollections",
        entry.sheetId,
        "Structural reference maintenance cannot change owner identity, target sheet, geometry, text, runs, or appearance.",
      );
    if (association) {
      const prior = association.direction === "restore" ? entry.drawings : original;
      const expected = mapLocalTextReferences(
        prior,
        ownSheetId,
        association.mapCell,
        association.mapRange,
      );
      const current = association.direction === "restore" ? original : entry.drawings;
      if (JSON.stringify(expected) !== JSON.stringify(current))
        throw invalidCommandPayload(
          "externalDrawingCollections",
          entry.sheetId,
          "External reference restore is not associated with this structural inverse.",
        );
    }
    // Locked external objects admit only this proven reference maintenance, like formula rewrites.
    assertShapeObjectsForSheet(entry.drawings, sheet);
    if (JSON.stringify(original) === JSON.stringify(entry.drawings)) continue;
    previous.push({ sheetId: sheet.id, drawings: original });
    next.push(entry);
  }
  return { previous, next };
}
/** Batch admission scans source data only, including dormant tombstones and hidden descendants. */
export function hasWorkbookTextReferencesToSheet(workbook: Workbook, sheetId: string): boolean {
  let found = false;
  for (const sheet of workbook.sheets.values()) {
    const inspect = <T extends { sheetId: string }>(reference: T): T => {
      found ||= reference.sheetId === sheetId;
      return reference;
    };
    mapSheetDrawingChartReferences(
      mapSheetDrawingTextReferences(sheet.drawings, inspect),
      inspect,
      inspect,
    );
  }
  return found;
}

export function planExternalTextReferenceChanges(
  workbook: Workbook,
  targetSheetId: string,
  mapCell: (cell: CellAddress) => CellAddress | null,
  mapRange?: (range: CellRange) => CellRange | null,
): PreparedExternalDrawingCollections {
  return prepareExternalDrawingCollections(
    workbook,
    targetSheetId,
    [...workbook.sheets.values()].flatMap((sheet) => {
      if (sheet.id === targetSheetId) return [];
      const original = normalizeSheetDrawings(sheet.drawings);
      const drawings = mapLocalTextReferences(original, targetSheetId, mapCell, mapRange);
      return JSON.stringify(drawings) === JSON.stringify(original)
        ? []
        : [{ sheetId: sheet.id, drawings }];
    }),
  );
}
export function commitExternalDrawingCollections(
  workbook: Workbook,
  prepared: PreparedExternalDrawingCollections,
): boolean {
  // All IDs and forests were admitted together, before the first own-sheet write.
  for (const entry of prepared.next) workbook.sheets.get(entry.sheetId)!.drawings = entry.drawings;
  return prepared.next.length > 0;
}
export function mapLocalTextReferences(
  drawings: readonly SheetDrawing[] | undefined,
  targetSheetId: string,
  mapCell: (cell: CellAddress) => CellAddress | null,
  mapRange: (range: CellRange) => CellRange | null = (range) =>
    mapChartSourceVectorCells(range, mapCell),
): SheetDrawing[] {
  return mapSheetDrawingChartReferences(
    mapSheetDrawingTextReferences(drawings, (reference) =>
      reference.sheetId === targetSheetId && reference.cell !== null
        ? { sheetId: reference.sheetId, cell: mapCell({ ...reference.cell }) }
        : reference,
    ),
    (reference) =>
      reference.sheetId === targetSheetId && reference.cell !== null
        ? { ...reference, cell: mapCell({ ...reference.cell }) }
        : reference,
    (reference) =>
      reference.sheetId === targetSheetId && reference.range !== null
        ? {
            ...reference,
            range: mapRange({
              start: { ...reference.range.start },
              end: { ...reference.range.end },
            }),
          }
        : reference,
  );
}
/** Resolve the final whole forest against next metrics without mutating any sheet. */
export function preflightTextReferenceSparseState(sheet: Sheet, state: SheetSparseState): void {
  const normalized = normalizeSheetSparseState(state);
  const shadow: Sheet = {
    ...sheet,
    rowHeights: new Map(normalized.rowHeights.map((entry) => [entry.index, entry.size])),
    columnWidths: new Map(normalized.columnWidths.map((entry) => [entry.index, entry.size])),
    hiddenRows: new Set(normalized.hiddenRows ?? []),
    hiddenColumns: new Set(normalized.hiddenColumns ?? []),
    defaultColumnWidth: normalized.defaultColumnWidth,
  };
  assertShapeObjectsForSheet(normalized.drawings, shadow);
}

/** Internal history association only; never persisted in workbook snapshots. */
export type TextReferenceTransform = {
  sheetId: string;
  direction: "restore" | "reapply";
  operation:
    | {
        type: "moveSheetAxis";
        axis: "row" | "column";
        index: number;
        count: number;
        toIndex: number;
      }
    | {
        type: "moveCellRange";
        source: import("../workbook.js").CellRange;
        destination: CellAddress;
      };
};
function transformRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Text reference transforms require ordinary records.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Text reference transforms require ordinary records.");
  const source: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError("Text reference transforms require known own data fields.");
    source[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(source, key) || source[key] === undefined)
      throw new TypeError("Text reference transforms require complete data fields.");
  return source;
}
export function readTextReferenceTransform(
  command: object,
  sheetId: string,
): { transform: TextReferenceTransform; mapCell: (cell: CellAddress) => CellAddress } | undefined {
  const field = Object.getOwnPropertyDescriptor(command, "textReferenceTransform");
  if (!field) {
    if ("textReferenceTransform" in command)
      throw new TypeError("Text reference transforms must be own data fields.");
    return;
  }
  if (!("value" in field)) throw new TypeError("Text reference transforms cannot be accessors.");
  const source = transformRecord(field.value, ["sheetId", "direction", "operation"]);
  if (
    source.sheetId !== sheetId ||
    (source.direction !== "restore" && source.direction !== "reapply")
  )
    throw new TypeError(
      "Text reference transforms must target their command sheet and a known direction.",
    );
  const tag =
    source.operation && typeof source.operation === "object"
      ? Object.getOwnPropertyDescriptor(source.operation, "type")?.value
      : undefined;
  if (tag === "moveSheetAxis") {
    const move = transformRecord(source.operation, ["type", "axis", "index", "count", "toIndex"]);
    if (move.axis !== "row" && move.axis !== "column")
      throw new TypeError("Unknown text reference axis.");
    const maximum = move.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
    const valid = (value: unknown): value is number =>
      typeof value === "number" && Number.isInteger(value);
    if (
      !valid(move.index) ||
      !valid(move.count) ||
      !valid(move.toIndex) ||
      move.index < 0 ||
      move.count < 1 ||
      move.index + move.count > maximum ||
      move.toIndex < 0 ||
      move.toIndex + move.count > maximum
    )
      throw new RangeError("Text reference axis movements must remain bounded.");
    const operation: Extract<TextReferenceTransform["operation"], { type: "moveSheetAxis" }> = {
      type: "moveSheetAxis",
      axis: move.axis,
      index: move.index,
      count: move.count,
      toIndex: move.toIndex,
    };
    const mapCell = (cell: CellAddress): CellAddress => {
      const value = cell[operation.axis],
        { index, count, toIndex } = operation;
      const next =
        value >= index && value < index + count
          ? toIndex + value - index
          : toIndex < index
            ? value >= toIndex && value < index
              ? value + count
              : value
            : value >= index + count && value < toIndex + count
              ? value - count
              : value;
      return { ...cell, [operation.axis]: next };
    };
    return { transform: { sheetId, direction: source.direction, operation }, mapCell };
  }
  if (tag === "moveCellRange") {
    const move = transformRecord(source.operation, ["type", "source", "destination"]);
    const range = transformRecord(move.source, ["start", "end"]);
    const address = (value: unknown) =>
      normalizeTextBoxTextReference({ sheetId, cell: value }).cell!;
    const start = address(range.start),
      end = address(range.end),
      destination = address(move.destination);
    if (
      start.row > end.row ||
      start.column > end.column ||
      destination.row + end.row - start.row >= MAX_SHEET_ROWS ||
      destination.column + end.column - start.column >= MAX_SHEET_COLUMNS
    )
      throw new RangeError("Text reference cell movements must remain bounded.");
    const operation: Extract<TextReferenceTransform["operation"], { type: "moveCellRange" }> = {
      type: "moveCellRange",
      source: { start, end },
      destination,
    };
    return {
      transform: { sheetId, direction: source.direction, operation },
      mapCell: (cell) =>
        cell.row >= start.row &&
        cell.row <= end.row &&
        cell.column >= start.column &&
        cell.column <= end.column
          ? {
              row: cell.row + destination.row - start.row,
              column: cell.column + destination.column - start.column,
            }
          : { ...cell },
    };
  }
  throw new TypeError("Unknown text reference movement operation.");
}
