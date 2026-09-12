import { getFormulaAst } from "./parser.js";
import { formatFormulaReference, parseFormulaReference } from "./reference-model.js";
import type { FormulaAddress, FormulaExpression, FormulaReference } from "./types.js";
import type { Sheet, Workbook } from "../workbook.js";

/** Rewrites qualified references to one sheet while retaining sparse cell storage. */
export function rewriteQualifiedReferencesForSheet(
  workbook: Workbook,
  targetSheetId: string,
  transform: ((address: FormulaAddress) => FormulaAddress | null) | null,
): void {
  const sheetsByName = () =>
    [...workbook.sheets.values()].reduce(
      (result, sheet) => result.set(sheet.name.toLowerCase(), sheet.id),
      new Map<string, string>(),
    );
  for (const sheet of workbook.sheets.values()) {
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const source = cell.content.formula.source;
      const replacements: Array<{ start: number; end: number; value: string }> = [];
      for (const candidate of qualifiedReferenceCandidates(source)) {
        const reference = parseFormulaReference(source.slice(candidate.start, candidate.end), {
          currentSheetId: sheet.id,
          resolveSheetId: (name) => sheetsByName().get(name.toLowerCase()),
          startOffset: candidate.start,
        });
        if (!reference || reference.target.sheetId !== targetSheetId) continue;
        if (!transform) {
          replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
          continue;
        }
        const start = transform(reference.target.range.start);
        const end = transform(reference.target.range.end);
        if (!start || !end) {
          replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
          continue;
        }
        const value = formatFormulaReference(
          { ...reference, target: { sheetId: targetSheetId, range: { start, end } } },
          (id) => workbook.sheets.get(id)?.name,
        );
        if (value) replacements.push({ start: candidate.start, end: candidate.end, value });
      }
      replaceFormulaReferences(sheet, key, source, replacements);
    }
  }
}

export function renameQualifiedReferencesForSheet(
  workbook: Workbook,
  previousName: string,
  nextName: string,
): void {
  const formatted = /^[\p{L}\p{N}_.]+$/u.test(nextName)
    ? nextName
    : `'${nextName.replaceAll("'", "''")}'`;
  for (const sheet of workbook.sheets.values()) {
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const source = cell.content.formula.source;
      const replacements = qualifiedReferenceCandidates(source)
        .filter((candidate) => candidate.sheetName.toLowerCase() === previousName.toLowerCase())
        .map((candidate) => ({
          start: candidate.start,
          end: candidate.end,
          value: `${formatted}!${source.slice(candidate.referenceStart, candidate.end)}`,
        }));
      replaceFormulaReferences(sheet, key, source, replacements);
    }
  }
}

type QualifiedReferenceCandidate = {
  start: number;
  end: number;
  referenceStart: number;
  sheetName: string;
};

/**
 * AST spans identify only formula references, so strings and function text are
 * never considered. The reference parser keeps the A1 span after its qualifier;
 * this derives the qualifier's source boundary from that verified reference.
 */
function qualifiedReferenceCandidates(source: string): QualifiedReferenceCandidate[] {
  const ast = getFormulaAst(source);
  if (!ast) return [];
  const candidates: QualifiedReferenceCandidate[] = [];
  const visit = (expression: FormulaExpression): void => {
    if (expression.kind === "reference") {
      add(expression.reference, expression.reference.end);
      return;
    }
    if (expression.kind === "range") {
      add(expression.range.start, expression.range.end.end);
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
    if (expression.kind === "function") for (const argument of expression.args) visit(argument);
  };
  const add = (reference: FormulaReference, end: number) => {
    if (!reference.sheetName) return;
    const start = qualifiedReferenceStart(source, reference.start);
    if (start !== null) candidates.push({ start, end, referenceStart: reference.start, sheetName: reference.sheetName });
  };
  visit(ast.expression);
  return candidates;
}

function qualifiedReferenceStart(source: string, referenceStart: number): number | null {
  const bang = referenceStart - 1;
  if (source[bang] !== "!") return null;
  if (source[bang - 1] !== "'") {
    let start = bang;
    while (start > 0 && /[\p{L}\p{N}_.]/u.test(source[start - 1]!)) start -= 1;
    return start < bang ? start : null;
  }
  // Sheet names are limited to 31 characters, so this is a bounded scan.
  const lowerBound = Math.max(0, bang - 33);
  for (let start = lowerBound; start < bang - 1; start += 1) {
    if (source[start] !== "'") continue;
    let offset = start + 1;
    while (offset < bang - 1) {
      if (source[offset] !== "'") {
        offset += 1;
        continue;
      }
      if (source[offset + 1] === "'") {
        offset += 2;
        continue;
      }
      break;
    }
    if (offset === bang - 1) return start;
  }
  return null;
}

function replaceFormulaReferences(
  sheet: Sheet,
  key: string,
  source: string,
  replacements: readonly { start: number; end: number; value: string }[],
): void {
  if (!replacements.length) return;
  let next = source;
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start))
    next = `${next.slice(0, replacement.start)}${replacement.value}${next.slice(replacement.end)}`;
  sheet.cells.set(key, { ...sheet.cells.get(key)!, content: { kind: "formula", formula: { source: next } } });
}
