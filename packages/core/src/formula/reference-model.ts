import {
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  type FormulaAddress,
  type FormulaReference,
} from "./types.js";

export type FormulaReferenceRangeTarget = Readonly<{
  start: FormulaAddress;
  end: FormulaAddress;
}>;

/** A workbook-stable target, independent of a formula's original spelling. */
export type FormulaReferenceTarget = Readonly<{
  sheetId: string;
  range: FormulaReferenceRangeTarget;
}>;

/** Source-only information for preserving a formula reference during rewrites. */
export type FormulaReferenceSource = Readonly<{
  text: string;
  start: number;
  end: number;
  sheetName: string | null;
  startReference: FormulaReference;
  endReference: FormulaReference | null;
}>;

export type FormulaSheetReference = Readonly<{
  target: FormulaReferenceTarget;
  source: FormulaReferenceSource;
}>;

export type ParseFormulaReferenceOptions = Readonly<{
  currentSheetId: string;
  resolveSheetId: (sheetName: string) => string | null | undefined;
  startOffset?: number;
}>;

/**
 * Parses one complete local A1 reference, including absolute markers.
 *
 * It intentionally does not search within `text`: callers that need token
 * scanning should pass the candidate token only. Offsets refer to the source
 * containing that token, rather than to this argument alone.
 */
export function parseA1FormulaReference(text: string, startOffset = 0): FormulaReference | null {
  assertStartOffset(startOffset);
  assertEndOffset(startOffset, text.length);
  const match = /^(\$?)([A-Za-z]+)(\$?)([1-9]\d*)$/.exec(text);
  if (!match) return null;

  const [, columnMarker, columnLabel, rowMarker, rowLabel] = match;
  if (!columnLabel || !rowLabel) return null;
  const column = columnLabelToIndex(columnLabel);
  const row = Number(rowLabel) - 1;
  if (column === null || !Number.isSafeInteger(row) || row >= MAX_FORMULA_ROWS) return null;

  return {
    row,
    column,
    rowAbsolute: rowMarker === "$",
    columnAbsolute: columnMarker === "$",
    start: startOffset,
    end: startOffset + text.length,
  };
}

/**
 * Parses a complete single-cell or rectangular A1 range with an optional sheet
 * qualifier. Named sheets resolve only through the supplied callback. This
 * model deliberately rejects 3D, external, and structured references.
 */
export function parseFormulaReference(
  text: string,
  options: ParseFormulaReferenceOptions,
): FormulaSheetReference | null {
  const startOffset = options.startOffset ?? 0;
  assertStartOffset(startOffset);
  assertEndOffset(startOffset, text.length);
  if (!isSheetId(options.currentSheetId)) return null;

  const qualifier = parseSheetQualifier(text);
  if (!qualifier) return null;

  const rangeText = text.slice(qualifier.length);
  const range = parseA1Range(rangeText, startOffset + qualifier.length);
  if (!range) return null;

  const sheetId =
    qualifier.sheetName === null
      ? options.currentSheetId
      : options.resolveSheetId(qualifier.sheetName);
  if (!isSheetId(sheetId)) return null;

  return {
    target: {
      sheetId,
      range: {
        start: { row: range.start.row, column: range.start.column },
        end: { row: range.end.row, column: range.end.column },
      },
    },
    source: {
      text,
      start: startOffset,
      end: startOffset + text.length,
      sheetName: qualifier.sheetName,
      startReference: range.start,
      endReference: range.endReference,
    },
  };
}

/**
 * Formats a resolved target as a sheet-qualified A1 reference. The source
 * reference supplies only the original absolute-marker choices; sheet names
 * always come from the current caller-owned ID-to-name mapping. It emits
 * sheet-qualified canonical text; `source.text` remains the exact input text.
 */
export function formatFormulaReference(
  reference: FormulaSheetReference,
  resolveSheetName: (sheetId: string) => string | null | undefined,
): string | null {
  if (!isFormulaSheetReference(reference)) return null;
  const sheetName = resolveSheetName(reference.target.sheetId);
  if (!isSupportedSheetName(sheetName)) return null;

  const start = formatA1Reference(reference.target.range.start, reference.source.startReference);
  const end = reference.source.endReference
    ? `:${formatA1Reference(reference.target.range.end, reference.source.endReference)}`
    : "";
  return `${formatSheetName(sheetName)}!${start}${end}`;
}

function parseA1Range(
  text: string,
  startOffset: number,
): {
  start: FormulaReference;
  end: FormulaReference;
  endReference: FormulaReference | null;
} | null {
  const separator = text.indexOf(":");
  if (separator === -1) {
    const start = parseA1FormulaReference(text, startOffset);
    return start ? { start, end: start, endReference: null } : null;
  }
  if (separator !== text.lastIndexOf(":")) return null;

  const start = parseA1FormulaReference(text.slice(0, separator), startOffset);
  const end = parseA1FormulaReference(text.slice(separator + 1), startOffset + separator + 1);
  return start && end ? { start, end, endReference: end } : null;
}

function parseSheetQualifier(text: string): { sheetName: string | null; length: number } | null {
  if (text.startsWith("'")) {
    let sheetName = "";
    let offset = 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === "'") {
        if (text[offset + 1] === "'") {
          sheetName += "'";
          offset += 2;
          continue;
        }
        return isSupportedSheetName(sheetName) && text[offset + 1] === "!"
          ? { sheetName, length: offset + 2 }
          : null;
      }
      sheetName += character;
      offset += 1;
    }
    return null;
  }

  const firstBang = text.indexOf("!");
  if (firstBang === -1) return { sheetName: null, length: 0 };
  if (firstBang === 0 || firstBang !== text.lastIndexOf("!")) return null;

  const sheetName = text.slice(0, firstBang);
  return isUnquotedSheetName(sheetName) ? { sheetName, length: firstBang + 1 } : null;
}

function columnLabelToIndex(label: string): number | null {
  let value = 0;
  for (const character of label.toUpperCase()) {
    const digit = character.charCodeAt(0) - 64;
    if (digit < 1 || digit > 26) return null;
    value = value * 26 + digit;
    if (value > MAX_FORMULA_COLUMNS) return null;
  }
  return value - 1;
}

function formatA1Reference(address: FormulaAddress, source: FormulaReference): string {
  return `${source.columnAbsolute ? "$" : ""}${columnIndexToLabel(address.column)}${
    source.rowAbsolute ? "$" : ""
  }${address.row + 1}`;
}

function columnIndexToLabel(column: number): string {
  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function formatSheetName(sheetName: string): string {
  return isUnquotedSheetName(sheetName) ? sheetName : `'${sheetName.replaceAll("'", "''")}'`;
}

function isUnquotedSheetName(sheetName: string): boolean {
  return isSupportedSheetName(sheetName) && /^[A-Za-z0-9_.]+$/.test(sheetName);
}

function isSupportedSheetName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 31) return false;
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || "!\\/:?*[]".includes(character)) return false;
  }
  return true;
}

function isSheetId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isAddressInBounds(address: unknown): address is FormulaAddress {
  if (typeof address !== "object" || address === null) return false;
  const { row, column } = address as Partial<FormulaAddress>;
  return (
    typeof row === "number" &&
    typeof column === "number" &&
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    column >= 0 &&
    row < MAX_FORMULA_ROWS &&
    column < MAX_FORMULA_COLUMNS
  );
}

function assertStartOffset(startOffset: number): void {
  if (!Number.isSafeInteger(startOffset) || startOffset < 0) {
    throw new RangeError("Formula reference start offset must be a non-negative safe integer.");
  }
}

function assertEndOffset(startOffset: number, length: number): void {
  if (!Number.isSafeInteger(startOffset + length)) {
    throw new RangeError("Formula reference end offset must be a safe integer.");
  }
}

function isFormulaSheetReference(value: FormulaSheetReference): boolean {
  const target = value?.target;
  const source = value?.source;
  if (
    !isSheetId(target?.sheetId) ||
    !isAddressInBounds(target?.range?.start) ||
    !isAddressInBounds(target?.range?.end) ||
    !isFormulaReferenceSource(source) ||
    (source.endReference === null &&
      (target.range.start.row !== target.range.end.row ||
        target.range.start.column !== target.range.end.column))
  ) {
    return false;
  }
  return true;
}

function isFormulaReferenceSource(source: FormulaReferenceSource | undefined): boolean {
  if (
    typeof source?.text !== "string" ||
    !Number.isSafeInteger(source.start) ||
    !Number.isSafeInteger(source.end) ||
    source.start < 0 ||
    source.end !== source.start + source.text.length ||
    (source.sheetName !== null && !isSupportedSheetName(source.sheetName)) ||
    !isFormulaReference(source.startReference) ||
    (source.endReference !== null && !isFormulaReference(source.endReference))
  ) {
    return false;
  }

  const qualifier = parseSheetQualifier(source.text);
  if (!qualifier || qualifier.sheetName !== source.sheetName) return false;
  const range = parseA1Range(source.text.slice(qualifier.length), source.start + qualifier.length);
  return (
    range !== null &&
    areFormulaReferencesEqual(range.start, source.startReference) &&
    (range.endReference === null
      ? source.endReference === null
      : source.endReference !== null &&
        areFormulaReferencesEqual(range.endReference, source.endReference))
  );
}

function isFormulaReference(value: FormulaReference): boolean {
  return (
    isAddressInBounds(value) &&
    typeof value.rowAbsolute === "boolean" &&
    typeof value.columnAbsolute === "boolean" &&
    Number.isSafeInteger(value.start) &&
    Number.isSafeInteger(value.end) &&
    value.start >= 0 &&
    value.end >= value.start
  );
}

function areFormulaReferencesEqual(left: FormulaReference, right: FormulaReference): boolean {
  return (
    left.row === right.row &&
    left.column === right.column &&
    left.rowAbsolute === right.rowAbsolute &&
    left.columnAbsolute === right.columnAbsolute &&
    left.start === right.start &&
    left.end === right.end
  );
}
