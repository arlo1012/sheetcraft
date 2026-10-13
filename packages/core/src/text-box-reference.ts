import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import { normalizeSheetDrawings, type SheetDrawing } from "./sheet-drawings.js";
import type { ShapeGroupChild } from "./shape-group.js";
import type { CellAddress, Workbook } from "./workbook.js";

/** A stable sheet identity and an absolute single cell. Null is a deleted-cell tombstone. */
export type TextBoxTextReference = { sheetId: string; cell: CellAddress | null };
export const MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH = 1024;

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${name} field.`);
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in field)) throw new TypeError(`${name} cannot contain accessors.`);
    result[key] = field.value as unknown;
  }
  for (const key of keys)
    if (!Object.hasOwn(result, key)) throw new TypeError(`${name} requires own ${key} data.`);
  return result;
}

/** No undefined-field elision: presence always owns a complete bounded reference. */
export function normalizeTextBoxTextReference(value: unknown): TextBoxTextReference {
  const source = record(value, ["sheetId", "cell"], "text box reference");
  if (
    typeof source.sheetId !== "string" ||
    !source.sheetId.trim() ||
    source.sheetId.length > MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH
  )
    throw new RangeError("Text box reference sheet ID must be a bounded nonempty string.");
  if (source.cell === null) return { sheetId: source.sheetId, cell: null };
  const cell = record(source.cell, ["row", "column"], "text box reference cell");
  if (
    typeof cell.row !== "number" ||
    !Number.isInteger(cell.row) ||
    cell.row < 0 ||
    cell.row >= MAX_SHEET_ROWS ||
    typeof cell.column !== "number" ||
    !Number.isInteger(cell.column) ||
    cell.column < 0 ||
    cell.column >= MAX_SHEET_COLUMNS
  )
    throw new RangeError("Text box references require a bounded single cell.");
  return { sheetId: source.sheetId, cell: { row: cell.row, column: cell.column } };
}

/** Pure, bounded whole-forest mapping. Hidden and nested owners are included. */
export function mapSheetDrawingTextReferences(
  values: readonly SheetDrawing[] | undefined,
  map: (reference: TextBoxTextReference) => TextBoxTextReference,
): SheetDrawing[] {
  const forest = normalizeSheetDrawings(values);
  const visit = <T extends SheetDrawing | ShapeGroupChild>(node: T): T => {
    if (node.kind === "shapeGroup")
      return { ...node, members: node.members.map((child) => visit(child)) } as T;
    if (node.kind !== "textBox" || !node.textReference) return node;
    return { ...node, textReference: normalizeTextBoxTextReference(map(node.textReference)) } as T;
  };
  // A callback cannot invalidate ownership, connector relations or linked text invariants.
  return normalizeSheetDrawings(forest.map((node) => visit(node)));
}

export type TextReferenceDrawingState = { sheetId: string; drawings: SheetDrawing[] };
/** Changed owners only; neither the workbook nor the callback's input aliases are mutated. */
export function mapWorkbookTextReferences(
  workbook: Workbook,
  targetSheetId: string,
  mapCell: (cell: CellAddress) => CellAddress | null,
): TextReferenceDrawingState[] {
  const result: TextReferenceDrawingState[] = [];
  for (const sheet of workbook.sheets.values()) {
    const original = normalizeSheetDrawings(sheet.drawings);
    const drawings = mapSheetDrawingTextReferences(original, (reference) =>
      reference.sheetId === targetSheetId && reference.cell !== null
        ? { sheetId: reference.sheetId, cell: mapCell({ ...reference.cell }) }
        : reference,
    );
    if (JSON.stringify(drawings) !== JSON.stringify(original))
      result.push({ sheetId: sheet.id, drawings });
  }
  return result;
}
