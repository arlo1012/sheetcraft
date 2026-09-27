import { clearConditionalFormatRanges } from "./conditional-formatting-transfer.js";
import {
  cloneConditionalFormatRule,
  type SheetConditionalFormatRule,
} from "./conditional-formatting.js";
import { WorkbookDomainError } from "./errors.js";
import {
  collectFormulaRanges,
  collectFormulaReferences,
  transformFormulaForMove,
  translateFormulaForCopy,
} from "./formula/references.js";
import type { FormulaReference } from "./formula/types.js";
import type { CellAddress, CellRange, Workbook } from "./workbook.js";

const MAX_SPLIT_FORMULA_CELLS = 4_096;

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function destinationRange(source: CellRange, destination: CellAddress): CellRange {
  return {
    start: { ...destination },
    end: {
      row: destination.row + source.end.row - source.start.row,
      column: destination.column + source.end.column - source.start.column,
    },
  };
}

/**
 * Maps references for a cut move. It is deliberately exported separately so the
 * workbook-level qualified-reference rewriter can update formula conditions on
 * other sheets in the same atomic command.
 */
export function createConditionalFormatMoveReferenceTransform(
  sourceInput: CellRange,
  destination: CellAddress,
): (address: CellAddress) => CellAddress {
  const source = normalizeRange(sourceInput);
  return (address) =>
    address.row >= source.start.row &&
    address.row <= source.end.row &&
    address.column >= source.start.column &&
    address.column <= source.end.column
      ? {
          row: destination.row + address.row - source.start.row,
          column: destination.column + address.column - source.start.column,
        }
      : { ...address };
}

function qualifiedSheetReferencePattern(sheetName: string): RegExp {
  const escapedName = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quotedName = sheetName.replaceAll("'", "''").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:${escapedName}|'${quotedName}')!`, "i");
}

/**
 * The workbook-level qualified-reference rewriter operates on a stored formula
 * source. That source is ambiguous for a multi-cell conditional-format rule,
 * because each cell has a different relative instance. Reject these cases before
 * mutation until they are represented as per-cell rules by a workbook transaction.
 */
export function assertConditionalFormatCrossSheetMoveSupported(
  workbook: Workbook,
  targetSheetId: string,
): void {
  const target = workbook.sheets.get(targetSheetId);
  if (!target) return;
  const pattern = qualifiedSheetReferencePattern(target.name);
  for (const sheet of workbook.sheets.values()) {
    for (const rule of sheet.conditionalFormats ?? []) {
      if (rule.condition.kind !== "formula" || !pattern.test(rule.condition.formula)) continue;
      const scopeSize = rangeSize(rule.ranges);
      const singleCell =
        scopeSize === 1 &&
        rule.ranges.length === 1 &&
        rule.ranges[0]!.start.row === rule.anchor.row &&
        rule.ranges[0]!.start.column === rule.anchor.column;
      if (singleCell) continue;
      throw new WorkbookDomainError(
        {
          code: "invalid_command_payload",
          details: { field: "conditionalFormats", value: rule.id },
        },
        "Moving cells cannot safely rewrite a multi-cell conditional-format formula that references this sheet.",
      );
    }
  }
}

function intersection(left: CellRange, right: CellRange): CellRange | undefined {
  const start = {
    row: Math.max(left.start.row, right.start.row),
    column: Math.max(left.start.column, right.start.column),
  };
  const end = {
    row: Math.min(left.end.row, right.end.row),
    column: Math.min(left.end.column, right.end.column),
  };
  return start.row <= end.row && start.column <= end.column ? { start, end } : undefined;
}

function moveRange(range: CellRange, source: CellRange, destination: CellAddress): CellRange {
  return {
    start: {
      row: destination.row + range.start.row - source.start.row,
      column: destination.column + range.start.column - source.start.column,
    },
    end: {
      row: destination.row + range.end.row - source.start.row,
      column: destination.column + range.end.column - source.start.column,
    },
  };
}

function rangeSize(ranges: readonly CellRange[]): number {
  return ranges.reduce(
    (size, range) =>
      size + (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1),
    0,
  );
}

function uniqueId(ids: Set<string>, base: string): string {
  let suffix = 1;
  let id = `${base}-move-${suffix}`;
  while (ids.has(id)) id = `${base}-move-${++suffix}`;
  ids.add(id);
  return id;
}

function contextualFormula(rule: SheetConditionalFormatRule, address: CellAddress): string {
  if (rule.condition.kind !== "formula")
    throw new Error("Expected a formula conditional-format rule.");
  return translateFormulaForCopy(rule.condition.formula, {
    row: address.row - rule.anchor.row,
    column: address.column - rule.anchor.column,
  });
}

function formulaRuleAt(
  rule: SheetConditionalFormatRule,
  id: string,
  range: CellRange,
  formula: string,
): SheetConditionalFormatRule {
  const next = cloneConditionalFormatRule(rule);
  return {
    ...next,
    id,
    ranges: [range],
    anchor: { ...range.start },
    condition: { kind: "formula", formula },
  };
}

function translatedReference(
  reference: FormulaReference,
  anchor: CellAddress,
  address: CellAddress,
): CellAddress {
  return {
    row: reference.row + (reference.rowAbsolute ? 0 : address.row - anchor.row),
    column: reference.column + (reference.columnAbsolute ? 0 : address.column - anchor.column),
  };
}

function intersectsReferenceScope(
  start: CellAddress,
  end: CellAddress,
  source: CellRange,
): boolean {
  return !(
    Math.max(start.row, end.row) < source.start.row ||
    Math.min(start.row, end.row) > source.end.row ||
    Math.max(start.column, end.column) < source.start.column ||
    Math.min(start.column, end.column) > source.end.column
  );
}

/** True only when an instance of the formula can reference a moved cell. */
function formulaMayReferenceSource(
  rule: SheetConditionalFormatRule,
  ranges: readonly CellRange[],
  source: CellRange,
): boolean {
  if (rule.condition.kind !== "formula") return false;
  const references = collectFormulaReferences(rule.condition.formula);
  const formulaRanges = collectFormulaRanges(rule.condition.formula);
  for (const scope of ranges) {
    for (const reference of references) {
      if (reference.sheetName) continue;
      if (
        intersectsReferenceScope(
          translatedReference(reference, rule.anchor, scope.start),
          translatedReference(reference, rule.anchor, scope.end),
          source,
        )
      )
        return true;
    }
    for (const formulaRange of formulaRanges) {
      if (formulaRange.start.sheetName) continue;
      if (
        intersectsReferenceScope(
          translatedReference(formulaRange.start, rule.anchor, scope.start),
          translatedReference(formulaRange.end, rule.anchor, scope.end),
          source,
        )
      )
        return true;
    }
  }
  return false;
}

type FormulaContext = { from: CellAddress; to: CellAddress };

function expandContexts(
  ranges: readonly CellRange[],
  map: (address: CellAddress) => CellAddress,
): FormulaContext[] {
  const contexts: FormulaContext[] = [];
  for (const range of ranges) {
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        const from = { row, column };
        contexts.push({ from, to: map(from) });
      }
    }
  }
  return contexts;
}

function formulaScopesForMove(
  rule: SheetConditionalFormatRule,
  ranges: CellRange[],
  source: CellRange,
  destination: CellAddress,
  map: (address: CellAddress) => CellAddress,
  ids: Set<string>,
  firstId: string,
): SheetConditionalFormatRule[] {
  if (!ranges.length) return [];
  const outputRanges = ranges.map((range) => ({ start: map(range.start), end: map(range.end) }));
  const first = { from: ranges[0]!.start, to: map(ranges[0]!.start) };
  const baseFormula = transformFormulaForMove(
    contextualFormula(rule, first.from),
    source,
    destination,
  );
  if (!formulaMayReferenceSource(rule, ranges, source)) {
    return [
      {
        ...rule,
        id: firstId,
        ranges: outputRanges,
        anchor: { ...first.to },
        condition: { kind: "formula", formula: baseFormula },
      },
    ];
  }
  const size = rangeSize(ranges);
  if (size > MAX_SPLIT_FORMULA_CELLS) {
    throw new WorkbookDomainError(
      { code: "invalid_command_payload", details: { field: "conditionalFormats", value: size } },
      "Moving cells would require splitting a conditional-format formula rule into too many rules.",
    );
  }
  const contexts = expandContexts(ranges, map);
  const formulas = contexts.map((context) =>
    transformFormulaForMove(contextualFormula(rule, context.from), source, destination),
  );
  const isUniform = contexts.every(
    (context, index) =>
      formulas[index] ===
      translateFormulaForCopy(baseFormula, {
        row: context.to.row - first.to.row,
        column: context.to.column - first.to.column,
      }),
  );
  if (isUniform) {
    return [
      {
        ...rule,
        id: firstId,
        ranges: outputRanges,
        anchor: { ...first.to },
        condition: { kind: "formula", formula: baseFormula },
      },
    ];
  }
  return contexts.map((context, index) =>
    formulaRuleAt(
      rule,
      index === 0 ? firstId : uniqueId(ids, rule.id),
      { start: context.to, end: { ...context.to } },
      formulas[index]!,
    ),
  );
}

/**
 * Moves conditional-format scopes as a cut operation. Existing scopes at the destination
 * are overwritten. Formula rules are made contextual before references into the moved
 * rectangle are transformed, which preserves both relative and absolute references.
 *
 * A formula rule that must be represented cell-by-cell is split up to the explicit
 * guard limit. Above it, this throws before the caller has mutated a workbook.
 */
export function moveConditionalFormatRules(
  rules: readonly SheetConditionalFormatRule[],
  sourceInput: CellRange,
  destination: CellAddress,
): SheetConditionalFormatRule[] {
  const source = normalizeRange(sourceInput);
  const destinationScope = destinationRange(source, destination);
  const ids = new Set(rules.map((rule) => rule.id));
  const result: SheetConditionalFormatRule[] = [];

  for (const original of rules) {
    const rule = cloneConditionalFormatRule(original);
    const movedSourceRanges = rule.ranges.flatMap((range) => {
      const overlap = intersection(range, source);
      return overlap ? [overlap] : [];
    });
    const movedRanges = movedSourceRanges.map((range) => moveRange(range, source, destination));
    const remainingRanges =
      clearConditionalFormatRanges([rule], [source, destinationScope])[0]?.ranges ?? [];

    const remaining: SheetConditionalFormatRule[] = !remainingRanges.length
      ? []
      : rule.condition.kind !== "formula"
        ? [{ ...rule, ranges: remainingRanges }]
        : formulaScopesForMove(
            rule,
            remainingRanges,
            source,
            destination,
            (address) => address,
            ids,
            rule.id,
          );

    result.push(...remaining);
    if (!movedRanges.length) continue;
    const movedId = remaining.length ? uniqueId(ids, rule.id) : rule.id;
    if (rule.condition.kind !== "formula") {
      result.push({
        ...rule,
        id: movedId,
        ranges: movedRanges,
        anchor: { ...movedRanges[0]!.start },
      });
      continue;
    }
    result.push(
      ...formulaScopesForMove(
        rule,
        movedSourceRanges,
        source,
        destination,
        (address) => moveRange({ start: address, end: address }, source, destination).start,
        ids,
        movedId,
      ),
    );
  }
  return result;
}
