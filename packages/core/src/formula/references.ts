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

export function translateFormulaForCopy(source: string, offset: FormulaCopyOffset): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  return replaceTransformedRanges(ast, (reference) => {
    const address = {
      row: reference.row + (reference.rowAbsolute ? 0 : offset.row),
      column: reference.column + (reference.columnAbsolute ? 0 : offset.column),
    };
    return isAddressInBounds(address) ? address : null;
  });
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

export function transformFormulaForAxis(source: string, transform: FormulaAxisTransform): string {
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
  return replaceTransformedRanges(parsed.ast, (reference) =>
    transformAxisReference(reference, transform),
  );
}

export function formatFormulaAddress(address: FormulaAddress): string {
  if (!isAddressInBounds(address)) {
    throw new RangeError("Formula address is outside the worksheet.");
  }
  return `${columnIndexToLabel(address.column)}${address.row + 1}`;
}
