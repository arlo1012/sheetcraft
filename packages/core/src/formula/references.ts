import { getFormulaAst, parseFormula } from "./parser.js";
import {
  MAX_FORMULA_COLUMNS,
  MAX_FORMULA_ROWS,
  type FormulaAddress,
  type FormulaAxisRange,
  type FormulaAst,
  type FormulaAxisTransform,
  type FormulaCopyOffset,
  type FormulaExpression,
  type FormulaRange,
  type FormulaReference,
  type StructuredFormulaReference,
} from "./types.js";

type Replacement = { start: number; end: number; text: string };

export type StructuredReferenceA1Bounds = {
  start: FormulaAddress;
  end: FormulaAddress;
  /** Include this sheet qualifier in the generated A1 reference when provided. */
  sheetName?: string;
  /** Fixed table regions must remain fixed when retained as a column template. */
  absolute?: boolean;
};

/**
 * Converts parser-confirmed structured references to their current A1 bounds.
 * The caller owns workbook/table lookup, including the formula cell's row context.
 */
export function convertStructuredReferencesToA1(
  source: string,
  resolve: (
    reference: StructuredFormulaReference,
    formulaAddress?: FormulaAddress,
  ) => StructuredReferenceA1Bounds | null,
  formulaAddress?: FormulaAddress,
  options?: {
    /** Keep references outside this conversion's target table unchanged. */
    shouldConvert?: (
      reference: StructuredFormulaReference,
      formulaAddress?: FormulaAddress,
    ) => boolean;
  },
): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind !== "structured-reference") return;
    if (options?.shouldConvert && !options.shouldConvert(expression.reference, formulaAddress))
      return;
    const bounds = resolve(expression.reference, formulaAddress);
    replacements.push({
      start: expression.start,
      end: expression.end,
      text: bounds ? formatStructuredReferenceA1(bounds) : "#REF!",
    });
  });
  return applyReplacements(source, replacements);
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
  } else if (expression.kind === "array") {
    for (const row of expression.rows) for (const item of row) walkExpression(item, visit);
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

function formatStructuredReferenceA1(bounds: StructuredReferenceA1Bounds): string {
  const absolute = bounds.absolute ? "$" : "";
  const start = `${absolute}${columnIndexToLabel(bounds.start.column)}${absolute}${bounds.start.row + 1}`;
  const end = `${absolute}${columnIndexToLabel(bounds.end.column)}${absolute}${bounds.end.row + 1}`;
  const qualifier = bounds.sheetName
    ? `${formatStructuredReferenceSheetName(bounds.sheetName)}!`
    : "";
  return `${qualifier}${start}${start === end ? "" : `:${end}`}`;
}

function formatStructuredReferenceSheetName(name: string): string {
  return /^[\p{L}\p{N}_.]+$/u.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

function formatAxisRange(
  range: Extract<FormulaExpression, { kind: "axis-range" }>["range"],
  start: number,
  end: number,
): string {
  const format = (value: number, absolute: boolean) =>
    `${absolute ? "$" : ""}${range.axis === "column" ? columnIndexToLabel(value) : value + 1}`;
  return `${format(start, range.startAbsolute)}:${format(end, range.endAbsolute)}`;
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
    if (expression.kind === "spill") references.push({ ...expression.reference });
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

/** Collects whole-row and whole-column ranges, including their absolute markers. */
export function collectFormulaAxisRanges(sourceOrAst: string | FormulaAst): FormulaAxisRange[] {
  const ast = getAst(sourceOrAst);
  if (!ast) return [];
  const ranges: FormulaAxisRange[] = [];
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "axis-range") ranges.push({ ...expression.range });
  });
  return ranges;
}

/** Whether a formula contains an array constant, which some persisted formula slots forbid. */
export function formulaHasArrayConstant(sourceOrAst: string | FormulaAst): boolean {
  const ast = getAst(sourceOrAst);
  if (!ast) return false;
  let found = false;
  walkExpression(ast.expression, (expression) => {
    if (expression.kind === "array") found = true;
  });
  return found;
}

/** Rewrites only parser-confirmed table names, never text inside strings or identifiers. */
export function renameTableReferences(
  source: string,
  previousName: string,
  nextName: string,
): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (
      expression.kind === "structured-reference" &&
      expression.reference.tableName?.toLocaleLowerCase("en-US") ===
        previousName.toLocaleLowerCase("en-US") &&
      expression.reference.tableNameStart !== undefined &&
      expression.reference.tableNameEnd !== undefined
    ) {
      replacements.push({
        start: expression.reference.tableNameStart,
        end: expression.reference.tableNameEnd,
        text: nextName,
      });
    }
  });
  return applyReplacements(source, replacements);
}

/** Rewrites parsed selectors; implicit selectors require a proven owning table. */
export function renameTableColumnReferences(
  source: string,
  tableName: string,
  previousName: string,
  nextName: string,
  owningTableName?: string,
): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (
      expression.kind !== "structured-reference" ||
      (expression.reference.tableName ?? owningTableName)?.toLocaleLowerCase("en-US") !==
        tableName.toLocaleLowerCase("en-US")
    )
      return;
    for (const column of expression.reference.columns) {
      if (column.name.toLocaleLowerCase("en-US") === previousName.toLocaleLowerCase("en-US")) {
        replacements.push({ start: column.start, end: column.end, text: nextName });
      }
    }
  });
  return applyReplacements(source, replacements);
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
    if (expression.kind === "spill") {
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
    if (expression.kind === "array") {
      for (const row of expression.rows) for (const item of row) visit(item);
      return;
    }
    if (expression.kind !== "function") return;
    for (const argument of expression.args) visit(argument);
  };
  visit(ast.expression);
  return { references, ranges };
}

export function translateFormulaForCopy(
  source: string,
  offset: FormulaCopyOffset,
  options: { includeSheetQualifiedReferences?: boolean } = {},
): string {
  const ast = getFormulaAst(source);
  if (!ast) return source;
  const replacements: Replacement[] = [];
  walkExpression(ast.expression, (expression) => {
    if (
      expression.kind === "axis-range" &&
      (!expression.range.sheetName || options.includeSheetQualifiedReferences)
    ) {
      const delta = expression.range.axis === "row" ? offset.row : offset.column;
      const start = expression.range.start + (expression.range.startAbsolute ? 0 : delta);
      const end = expression.range.end + (expression.range.endAbsolute ? 0 : delta);
      const maximum = expression.range.axis === "row" ? MAX_FORMULA_ROWS : MAX_FORMULA_COLUMNS;
      replacements.push({
        start: expression.range.startOffset,
        end: expression.range.endOffset,
        text:
          start < 0 || end < 0 || start >= maximum || end >= maximum
            ? "#REF!"
            : formatAxisRange(expression.range, start, end),
      });
      return;
    }
    if (expression.kind === "range") {
      if (expression.range.start.sheetName && !options.includeSheetQualifiedReferences) return;
      const translate = (reference: FormulaReference) => ({
        row: reference.row + (reference.rowAbsolute ? 0 : offset.row),
        column: reference.column + (reference.columnAbsolute ? 0 : offset.column),
      });
      const start = translate(expression.range.start),
        end = translate(expression.range.end);
      replacements.push({
        start: expression.range.startOffset,
        end: expression.range.endOffset,
        text:
          isAddressInBounds(start) && isAddressInBounds(end)
            ? `${formatReference(expression.range.start, start)}:${formatReference(expression.range.end, end)}`
            : "#REF!",
      });
      return;
    }
    const reference =
      expression.kind === "reference" || expression.kind === "spill" ? expression.reference : null;
    if (!reference || (reference.sheetName && !options.includeSheetQualifiedReferences)) return;
    const address = {
      row: reference.row + (reference.rowAbsolute ? 0 : offset.row),
      column: reference.column + (reference.columnAbsolute ? 0 : offset.column),
    };
    replacements.push({
      start: reference.start,
      end: reference.end,
      text: isAddressInBounds(address) ? formatReference(reference, address) : "#REF!",
    });
  });
  return applyReplacements(ast.source, replacements);
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
    } else if (expression.kind === "spill") {
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
  reference: Pick<FormulaReference, "row" | "column">,
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
    } else if (expression.kind === "spill") {
      if (expression.reference.sheetName) return;
      const address = transformAxisReference(expression.reference, transform);
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: address ? formatReference(expression.reference, address) : "#REF!",
      });
    } else if (expression.kind === "axis-range") {
      if (expression.range.sheetName || expression.range.axis !== transform.axis) return;
      const start = transformAxisReference(
        transform.axis === "row"
          ? { row: expression.range.start, column: 0 }
          : { row: 0, column: expression.range.start },
        transform,
      );
      const end = transformAxisReference(
        transform.axis === "row"
          ? { row: expression.range.end, column: 0 }
          : { row: 0, column: expression.range.end },
        transform,
      );
      if (!start || !end) {
        replacements.push({
          start: expression.range.startOffset,
          end: expression.range.endOffset,
          text: "#REF!",
        });
      } else {
        replacements.push({
          start: expression.range.startOffset,
          end: expression.range.endOffset,
          text: formatAxisRange(
            expression.range,
            transform.axis === "row" ? start.row : start.column,
            transform.axis === "row" ? end.row : end.column,
          ),
        });
      }
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

/** Rewrites unqualified A1 references through a rectangular structural mapping. */
export function transformFormulaReferences(
  source: string,
  transform: (address: FormulaAddress) => FormulaAddress | null,
  transformRange?: (range: { start: FormulaAddress; end: FormulaAddress }) => {
    start: FormulaAddress;
    end: FormulaAddress;
  } | null,
): string {
  const parsed = parseFormula(source);
  if (!parsed.ok) return source;
  const replacements: Replacement[] = [];
  const rewrite = (reference: FormulaReference) => {
    const address = transform(reference);
    return address ? formatReference(reference, address) : "#REF!";
  };
  walkExpression(parsed.ast.expression, (expression) => {
    if (expression.kind === "reference" && !expression.reference.sheetName) {
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: rewrite(expression.reference),
      });
    } else if (expression.kind === "spill" && !expression.reference.sheetName) {
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: rewrite(expression.reference),
      });
    } else if (expression.kind === "range" && !expression.range.start.sheetName) {
      const range = transformRange?.({
        start: expression.range.start,
        end: expression.range.end,
      });
      if (transformRange && !range) {
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
        text: range
          ? formatReference(expression.range.start, range.start)
          : rewrite(expression.range.start),
      });
      replacements.push({
        start: expression.range.end.start,
        end: expression.range.end.end,
        text: range
          ? formatReference(expression.range.end, range.end)
          : rewrite(expression.range.end),
      });
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
  const mapAxisRange = (
    range: Extract<FormulaExpression, { kind: "axis-range" }>["range"],
  ): { start: number; end: number } => ({
    start: mapAxis(range.start),
    end: mapAxis(range.end),
  });
  walkExpression(parsed.ast.expression, (expression) => {
    if (expression.kind === "reference") {
      if (expression.reference.sheetName) return;
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: formatReference(expression.reference, mapReference(expression.reference)),
      });
    } else if (expression.kind === "spill") {
      if (expression.reference.sheetName) return;
      replacements.push({
        start: expression.reference.start,
        end: expression.reference.end,
        text: formatReference(expression.reference, mapReference(expression.reference)),
      });
    } else if (expression.kind === "axis-range") {
      if (expression.range.sheetName || expression.range.axis !== transform.axis) return;
      const range = mapAxisRange(expression.range);
      replacements.push({
        start: expression.range.startOffset,
        end: expression.range.endOffset,
        text: formatAxisRange(expression.range, range.start, range.end),
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
