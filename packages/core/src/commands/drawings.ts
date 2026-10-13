import { assertShapeObjectsForSheet } from "../shape-object-sheet.js";
import { normalizeSheetDrawings, type SheetDrawing } from "../sheet-drawings.js";
import { readPictureDataArray } from "../picture-data-array.js";
import { MAX_SHAPE_GROUP_NODES } from "../shape-group-limits.js";
import { normalizeShapeDrawingForest } from "../shape-group-planning.js";
import { MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH } from "../text-box-reference.js";
import type { Workbook } from "../workbook.js";
import type {
  ReplaceSheetDrawingCollectionsCommand,
  SetSheetDrawingsCommand,
} from "./contracts.js";
import { getSheetOrThrow, invalidCommandPayload, validateCommandPayload } from "./helpers.js";
export function createSetSheetDrawingsCommand(
  sheetId: string,
  drawings: readonly SheetDrawing[],
): SetSheetDrawingsCommand {
  return {
    type: "setSheetDrawings",
    sheetId,
    drawings: validateCommandPayload("drawings", drawings, () => normalizeSheetDrawings(drawings)),
  };
}
export function applySetSheetDrawingsCommand(
  workbook: Workbook,
  command: SetSheetDrawingsCommand,
): SetSheetDrawingsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const next = createSetSheetDrawingsCommand(command.sheetId, command.drawings);
  assertShapeObjectsForSheet(next.drawings, sheet);
  if (JSON.stringify(sheet.drawings ?? []) === JSON.stringify(next.drawings)) return null;
  const inverse = createSetSheetDrawingsCommand(command.sheetId, sheet.drawings ?? []);
  sheet.drawings = next.drawings;
  return inverse;
}

function dataRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} requires an ordinary data record.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} requires an ordinary data record.`);
  const source: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in field))
      throw new TypeError(`${name} requires known own data fields, not accessors.`);
    source[key] = field.value as unknown;
  }
  return source;
}

// Legacy leaves also cross this command boundary. Detach all nested data before
// their older normalizers can read fields or call ordinary array methods.
function detachDrawingData(value: unknown): unknown {
  const active = new WeakSet<object>();
  const detached = new WeakMap<object, object>();
  let count = 0;
  function visit(source: unknown, depth: number): unknown {
    if (++count > 1_000_000 || depth > 128)
      throw new RangeError("Drawing collection data budget exceeded.");
    if (
      source === null ||
      source === undefined ||
      ["string", "number", "boolean"].includes(typeof source)
    )
      return source;
    if (typeof source !== "object") throw new TypeError("Drawing collections require data only.");
    if (active.has(source)) throw new TypeError("Cyclic drawing collection data.");
    const previous = detached.get(source);
    if (previous) return previous;
    active.add(source);
    let result: object;
    if (Array.isArray(source)) {
      const entries = readPictureDataArray(source, "drawing collection data", 100_000);
      const array: unknown[] = [];
      result = array;
      detached.set(source, result);
      for (const entry of entries) array.push(visit(entry, depth + 1));
    } else {
      const prototype: unknown = Object.getPrototypeOf(source);
      if (prototype !== null && prototype !== Object.prototype)
        throw new TypeError("Drawing collections require ordinary nested data records.");
      const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      result = record;
      detached.set(source, result);
      for (const key of Reflect.ownKeys(source)) {
        const field = Object.getOwnPropertyDescriptor(source, key)!;
        if (typeof key !== "string" || !("value" in field))
          throw new TypeError("Drawing collections require own nested data fields, not accessors.");
        record[key] = visit(field.value as unknown, depth + 1);
      }
    }
    active.delete(source);
    return result;
  }
  return visit(value, 0);
}

const drawingDataKeys = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "anchor",
  "offsetX",
  "offsetY",
  "width",
  "height",
  "shapeGeometry",
  "shapePath",
  "shapeLineEnds",
  "shapeConnector",
  "shapeFlipX",
  "shapeFlipY",
  "hidden",
  "shapeStyle",
  "shapeText",
  "textReference",
  "wordArt",
  "textDirection",
  "shapeFrame",
  "shapeProperties",
  "groupEffects",
  "group3d",
  "members",
  "chart",
  "camera",
  "attachment",
  "control",
] as const;

const drawingPayloadOwners = [
  ["members", "shapeGroup"],
  ["chart", "chart"],
  ["camera", "camera"],
  ["attachment", "attachment"],
  ["control", "control"],
] as const;

function normalizeDrawingCollection(value: unknown): SheetDrawing[] {
  const roots = readPictureDataArray(
    value as readonly unknown[],
    "drawing collection",
    MAX_SHAPE_GROUP_NODES,
  );
  for (const root of roots) {
    const source = dataRecord(root, drawingDataKeys, "Drawing collection root");
    for (const [key, kind] of drawingPayloadOwners)
      if (Object.hasOwn(source, key) && source.kind !== kind)
        throw new TypeError(`Drawing payload ${key} does not belong to this drawing kind.`);
  }
  const detached = detachDrawingData(roots) as SheetDrawing[];
  // Canonical shape/group normalizers enforce their own exact nested contracts.
  // Older placement records have no such field check, so enforce it here too.
  for (const root of detached)
    if ("anchor" in root) dataRecord(root.anchor, ["row", "column"], "Drawing anchor");
  return normalizeShapeDrawingForest(detached);
}

export function createReplaceSheetDrawingCollectionsCommand(
  collections: readonly {
    sheetId: string;
    expectedDrawings: readonly SheetDrawing[];
    drawings: readonly SheetDrawing[];
  }[],
): ReplaceSheetDrawingCollectionsCommand {
  return validateCommandPayload("collections", collections, () => {
    const entries = readPictureDataArray(collections, "drawing collection replacements", 2);
    if (entries.length !== 2)
      throw new TypeError("Exactly two drawing collection replacements are required.");
    const ids = new Set<string>();
    const normalized = entries.map((entry) => {
      const source = dataRecord(
        entry,
        ["sheetId", "expectedDrawings", "drawings"],
        "Drawing collection replacement",
      );
      const sheetId = source.sheetId;
      if (
        typeof sheetId !== "string" ||
        !sheetId.trim() ||
        sheetId.length > MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH ||
        ids.has(sheetId)
      )
        throw new TypeError("Drawing replacements require distinct bounded sheet IDs.");
      ids.add(sheetId);
      return {
        sheetId,
        expectedDrawings: normalizeDrawingCollection(source.expectedDrawings),
        drawings: normalizeDrawingCollection(source.drawings),
      };
    });
    return {
      type: "replaceSheetDrawingCollections",
      collections: [normalized[0]!, normalized[1]!],
    };
  });
}

/** Admit the full command before any protection guard can consume caller data. */
export function normalizeReplaceSheetDrawingCollectionsCommand(
  command: ReplaceSheetDrawingCollectionsCommand,
): ReplaceSheetDrawingCollectionsCommand {
  return validateCommandPayload("replaceSheetDrawingCollections", command, () => {
    const source = dataRecord(command, ["type", "collections"], "Drawing replacement command");
    if (source.type !== "replaceSheetDrawingCollections")
      throw new TypeError("Invalid drawing replacement command type.");
    return createReplaceSheetDrawingCollectionsCommand(
      source.collections as ReplaceSheetDrawingCollectionsCommand["collections"],
    );
  });
}

export function applyReplaceSheetDrawingCollectionsCommand(
  workbook: Workbook,
  command: ReplaceSheetDrawingCollectionsCommand,
): ReplaceSheetDrawingCollectionsCommand | null {
  const next = normalizeReplaceSheetDrawingCollectionsCommand(command);
  const [first, second] = next.collections;
  const firstSheet = getSheetOrThrow(workbook, first.sheetId);
  const secondSheet = getSheetOrThrow(workbook, second.sheetId);
  const previous = [firstSheet, secondSheet].map((sheet) =>
    validateCommandPayload("drawings", sheet.id, () =>
      normalizeDrawingCollection(sheet.drawings ?? []),
    ),
  );
  for (const [index, entry] of next.collections.entries()) {
    if (JSON.stringify(entry.expectedDrawings) !== JSON.stringify(previous[index]))
      throw invalidCommandPayload(
        "expectedDrawings",
        entry.sheetId,
        "The sheet drawing collection changed after this replacement was planned.",
      );
  }
  assertShapeObjectsForSheet(first.drawings, firstSheet);
  assertShapeObjectsForSheet(second.drawings, secondSheet);
  // Construct and normalize the complete same-type inverse before either write.
  const inverse = createReplaceSheetDrawingCollectionsCommand([
    { sheetId: first.sheetId, expectedDrawings: first.drawings, drawings: previous[0]! },
    { sheetId: second.sheetId, expectedDrawings: second.drawings, drawings: previous[1]! },
  ]);
  if (
    JSON.stringify(previous[0]) === JSON.stringify(first.drawings) &&
    JSON.stringify(previous[1]) === JSON.stringify(second.drawings)
  )
    return null;
  firstSheet.drawings = first.drawings;
  secondSheet.drawings = second.drawings;
  return inverse;
}
