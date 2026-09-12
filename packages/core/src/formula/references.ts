import { getFormulaAst, parseFormula } from "./parser.js";
import {
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  type FormulaAddress,
  type FormulaAst,
  type FormulaAxisTransform,
  type FormulaCopyOffset,
  type FormulaExpression,
  type FormulaRange,
  type FormulaReference,
} from "./types.js";

type Replacement = { start: number; end: number; text: string };

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

function isAddressInBounds(address: FormulaAddress): boolean {
  return (
    Number.isInteger(address.row) &&
    Number.isInteger(address.column) &&
    address.row >= 0 &&
    address.column >= 0 &&
    address.row < MAX_FORMULA_ROWS &&
    address.column < MAX_FORMULA_COLUMNS
  );
}

function walkExpression(
  expression: FormulaExpression,
  visit: (expression: FormulaExpression) => void,
): void {
  visit(expression);
  if (expression.kind === "unary") {
    walkExpression(expression.operand, visit);
  } else if (expression.kind === "binary") {
    walkExpression(expression.left, visit);
    walkExpression(expression.right, visit);
  } else if (expression.kind === "function") {
    for (const argument of expression.args) walkExpression(argument, visit);
  }
}

function applyReplacements(source: string, replacements: readonly Replacement[]): string {
  const ordered = [...replacements].sort((left, right) => right.start - left.start);
  let result = source;
  for (const replacement of ordered) {
    result = `${result.slice(0, replacement.start)}${replacement.text}${result.slice(replacement.end)}`;
  }
  return result;
}

function formatReference(reference: FormulaReference, address: FormulaAddress): string {
  return `${reference.columnAbsolute ? "$" : ""}${columnIndexToLabel(address.column)}${
    reference.rowAbsolute ? "$" : ""
  }${address.row + 1}`;
}

function replaceTransformedRanges(
  ast: FormulaAst,
  transform: (reference: FormulaReference) => FormulaAddress | null,
): string {
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "reference") {
      const address = transform(expression.reference);
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: address ? formatReference(expression.reference, address) : "#REF!",
      });
      return;
    }
    if (expression.kind !== "range") return;
    const startAddress = transform(expression.range.start);
    const endAddress = transform(expression.range.end);
    if (!startAddress || !endAddress) {
      replacements.push({
        start: expression.range.startOffset,
        end: expression.range.endOffset,
        text: "#REF!",
      });
      return;
    }
    replacements.push({
      start: expression.range.start.start,
      end: expression.range.start.end,
      text: formatReference(expression.range.start, startAddress),
    });
    replacements.push({
      start: expression.range.end.start,
      end: expression.range.end.end,
      text: formatReference(expression.range.end, endAddress),
    });
  });
  return applyReplacements(ast.source, replacements);
}

function getAst(sourceOrAst: string | FormulaAst): FormulaAst | null {
  return typeof sourceOrAst === "string" ? getFormulaAst(sourceOrAst) : sourceOrAst;
}

export function collectFormulaReferences(sourceOrAst: string | FormulaAst): FormulaReference[] {
  const ast = getAst(sourceOrAst);
  if (!ast) return [];
  const references: FormulaReference[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "reference") references.push({ ...expression.reference });
    if (expression.kind === "range") {
      references.push({ ...expression.range.start }, { ...expression.range.end });
    }
  });
  return references;
}

export function collectFormulaRanges(sourceOrAst: string | FormulaAst): FormulaRange[] {
  const ast = getAst(sourceOrAst);
  if (!ast) return [];
  const ranges: FormulaRange[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "range") {
      ranges.push({
        start: { ...expression.range.start },
        end: { ...expression.range.end },
        startOffset: expression.range.startOffset,
        endOffset: expression.range.endOffset,
      });
    }
  });
  return ranges;
}

/** Collects references/ranges from an expression selected by the runtime scheduler. */
export function collectFormulaEvaluationDependencies(sourceOrAst: string | FormulaAst): {
  references: FormulaReference[];
  ranges: FormulaRange[];
} {
  const ast = getAst(sourceOrAst);
  const references: FormulaReference[] = [];
  const ranges: FormulaRange[] = [];
  if (!ast) return { references, ranges };
  const visit = (expression: FormulaExpression): void => {
    if (expression.kind === "reference") {
      references.push({ ...expression.reference });
      return;
    }
    if (expression.kind === "range") {
      ranges.push({
        start: { ...expression.range.start },
        end: { ...expression.range.end },
        startOffset: expression.range.startOffset,
        endOffset: expression.range.endOffset,
      });
      return;
    }
    if (expression.kind === "unary") {
      visit(expression.operand);
      return;
    }
    if (expression.kind === "binary") {
      visit(expression.left);
      visit(expression.right);
      return;
    }
    if (expression.kind !== "function") return;
    for (const argument of expression.args) visit(argument);
  };
  visit(ast.expression);
  return { references, ranges };
}

export function translateFormulaForCopy(source: string, offset: FormulaCopyOffset): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  return replaceTransformedRanges(ast, (reference) => {
    if (reference.sheetName) return { row: reference.row, column: reference.column };
    const address = {
      row: reference.row + (reference.rowAbsolute ? 0 : offset.row),
      column: reference.column + (reference.columnAbsolute ? 0 : offset.column),
    };
    return isAddressInBounds(address) ? address : null;
  });
}

export function transformFormulaForMove(
  source: string,
  sourceRange: { start: FormulaAddress; end: FormulaAddress },
  destinationStart: FormulaAddress,
): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const minRow = Math.min(sourceRange.start.row, sourceRange.end.row);
  const maxRow = Math.max(sourceRange.start.row, sourceRange.end.row);
  const minColumn = Math.min(sourceRange.start.column, sourceRange.end.column);
  const maxColumn = Math.max(sourceRange.start.column, sourceRange.end.column);
  const map = (address: FormulaAddress): FormulaAddress | null =>
    address.row >= minRow &&
    address.row <= maxRow &&
    address.column >= minColumn &&
    address.column <= maxColumn
      ? {
          row: destinationStart.row + address.row - minRow,
          column: destinationStart.column + address.column - minColumn,
        }
      : null;
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "reference") {
      if (expression.reference.sheetName) return;
      const address = map(expression.reference);
      if (address)
        replacements.push({
          start: expression.reference.start,
          end: expression.reference.end,
          text: formatReference(expression.reference, address),
        });
    } else if (expression.kind === "range") {
      if (expression.range.start.sheetName) return;
      const start = map(expression.range.start);
      const end = map(expression.range.end);
      const rangeMinRow = Math.min(expression.range.start.row, expression.range.end.row);
      const rangeMaxRow = Math.max(expression.range.start.row, expression.range.end.row);
      const rangeMinColumn = Math.min(expression.range.start.column, expression.range.end.column);
      const rangeMaxColumn = Math.max(expression.range.start.column, expression.range.end.column);
      const intersects = !(
        rangeMaxRow < minRow ||
        rangeMinRow > maxRow ||
        rangeMaxColumn < minColumn ||
        rangeMinColumn > maxColumn
      );
      const contained =
        rangeMinRow >= minRow &&
        rangeMaxRow <= maxRow &&
        rangeMinColumn >= minColumn &&
        rangeMaxColumn <= maxColumn;
      if (intersects && !contained)
        replacements.push({
          start: expression.range.startOffset,
          end: expression.range.endOffset,
          text: "#REF!",
        });
      else if (start && end) {
        replacements.push({
          start: expression.range.start.start,
          end: expression.range.start.end,
          text: formatReference(expression.range.start, start),
        });
        replacements.push({
          start: expression.range.end.start,
          end: expression.range.end.end,
          text: formatReference(expression.range.end, end),
        });
      }
    }
  });
  return applyReplacements(ast.source, replacements);
}

function transformAxisReference(
  reference: FormulaReference,
  transform: FormulaAxisTransform,
): FormulaAddress | null {
  const axisValue = transform.axis === "row" ? reference.row : reference.column;
  let nextAxisValue = axisValue;
  if (transform.operation === "insert") {
    if (axisValue >= transform.index) nextAxisValue += transform.count;
  } else if (axisValue >= transform.index && axisValue < transform.index + transform.count) {
    return null;
  } else if (axisValue >= transform.index + transform.count) {
    nextAxisValue -= transform.count;
  }
  const address =
    transform.axis === "row"
      ? { row: nextAxisValue, column: reference.column }
      : { row: reference.row, column: nextAxisValue };
  return isAddressInBounds(address) ? address : null;
}

function transformAxisRange(
  range: FormulaRange,
  transform: FormulaAxisTransform,
): { start: FormulaAddress; end: FormulaAddress } | null {
  if (transform.operation === "insert") {
    const start = transformAxisReference(range.start, transform);
    const end = transformAxisReference(range.end, transform);
    return start && end ? { start, end } : null;
  }
  const startAxis = transform.axis === "row" ? range.start.row : range.start.column;
  const endAxis = transform.axis === "row" ? range.end.row : range.end.column;
  const lower = Math.min(startAxis, endAxis);
  const upper = Math.max(startAxis, endAxis);
  const deletedEnd = transform.index + transform.count;
  if (lower >= transform.index && upper < deletedEnd) return null;
  const adjust = (value: number, lowerEdge: boolean) => {
    if (value < transform.index) return value;
    if (value >= deletedEnd) return value - transform.count;
    return lowerEdge ? transform.index : transform.index - 1;
  };
  const map = (reference: FormulaReference, lowerEdge: boolean): FormulaAddress =>
    transform.axis === "row"
      ? { row: adjust(reference.row, lowerEdge), column: reference.column }
      : { row: reference.row, column: adjust(reference.column, lowerEdge) };
  return {
    start: map(range.start, startAxis === lower),
    end: map(range.end, endAxis === lower),
  };
}

export function transformFormulaForAxis(
  source: string,
  transform: FormulaAxisTransform,
): string {
  const maximum = transform.axis === "row" ? MAX_FORMULA_ROWS : MAX_FORMULA_COLUMNS;
  if (
    !Number.isSafeInteger(transform.index) ||
    !Number.isSafeInteger(transform.count) ||
    transform.index < 0 ||
    transform.index >= maximum ||
    transform.count <= 0 ||
    transform.count > maximum - transform.index
  ) {
    throw new RangeError("Formula axis transforms require an in-bounds index and count.");
  }
  const parsed = parseFormula(source);
  if (!parsed.ok) return source;
  const replacements: Replacement[] = [];
  walkExpression(parsed.ast.expression, (expression) => {
    if (expression.kind === "reference") {
      if (expression.reference.sheetName) return;
      const address = transformAxisReference(expression.reference, transform);
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: address ? formatReference(expression.reference, address) : "#REF!",
      });
    } else if (expression.kind === "range") {
      if (expression.range.start.sheetName) return;
      const range = transformAxisRange(expression.range, transform);
      if (!range) {
        replacements.push({
          start: expression.range.startOffset,
          end: expression.range.endOffset,
          text: "#REF!",
        });
      } else {
        replacements.push({
          start: expression.range.start.start,
          end: expression.range.start.end,
          text: formatReference(expression.range.start, range.start),
        });
        replacements.push({
          start: expression.range.end.start,
          end: expression.range.end.end,
          text: formatReference(expression.range.end, range.end),
        });
      }
    }
  });
  return applyReplacements(parsed.ast.source, replacements);
}

/**
 * Rewrites references after an entire row or column band is repositioned.
 * `toIndex` is the band's final start index, rather than an insertion cursor.
 */
export function transformFormulaForAxisMove(
  source: string,
  transform: { axis: "row" | "column"; index: number; count: number; toIndex: number },
): string {
  const maximum = transform.axis === "row" ? MAX_FORMULA_ROWS : MAX_FORMULA_COLUMNS;
  if (
    !Number.isSafeInteger(transform.index) ||
    !Number.isSafeInteger(transform.count) ||
    !Number.isSafeInteger(transform.toIndex) ||
    transform.index < 0 ||
    transform.count <= 0 ||
    transform.index > maximum - transform.count ||
    transform.toIndex < 0 ||
    transform.toIndex > maximum - transform.count
  ) {
    throw new RangeError("Formula axis moves require in-bounds indices.");
  }
  if (transform.index === transform.toIndex) return source;
  const mapAxis = (value: number): number => {
    const sourceEnd = transform.index + transform.count;
    if (value >= transform.index && value < sourceEnd)
      return transform.toIndex + value - transform.index;
    if (transform.toIndex < transform.index) {
      return value >= transform.toIndex && value < transform.index
        ? value + transform.count
        : value;
    }
    return value >= sourceEnd && value < transform.toIndex + transform.count
      ? value - transform.count
      : value;
  };
  const parsed = parseFormula(source);
  if (!parsed.ok) return source;
  const mapReference = (reference: FormulaReference): FormulaAddress =>
    transform.axis === "row"
      ? { row: mapAxis(reference.row), column: reference.column }
      : { row: reference.row, column: mapAxis(reference.column) };
  const replacements: Replacement[] = [];
  walkExpression(parsed.ast.expression, (expression) => {
    if (expression.kind === "reference") {
      if (expression.reference.sheetName) return;
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: formatReference(expression.reference, mapReference(expression.reference)),
      });
    } else if (expression.kind === "range") {
      if (expression.range.start.sheetName) return;
      const start = mapReference(expression.range.start);
      const end = mapReference(expression.range.end);
      replacements.push({
        start: expression.range.start.start,
        end: expression.range.start.end,
        text: formatReference(expression.range.start, start),
      });
      replacements.push({
        start: expression.range.end.start,
        end: expression.range.end.end,
        text: formatReference(expression.range.end, end),
      });
    }
  });
  return applyReplacements(parsed.ast.source, replacements);
}

export function formatFormulaAddress(address: FormulaAddress): string {
  if (!isAddressInBounds(address)) {
    throw new RangeError("Formula address is outside the worksheet.");
  }
  return `${columnIndexToLabel(address.column)}${address.row + 1}`;
}
