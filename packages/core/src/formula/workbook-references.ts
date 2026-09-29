import { getFormulaAst } from "./parser.js";
import { formatFormulaReference, parseFormulaReference } from "./reference-model.js";
import type { FormulaAddress, FormulaExpression, FormulaReference } from "./types.js";
import {
  conditionalFormatFormulaSources,
  mapConditionalFormatFormulas,
} from "../conditional-formatting.js";
import type { CellAddress, Sheet, Workbook } from "../workbook.js";

/** Exact conditional-format formula text retained by sheet-operation inverses. */
export type ConditionalFormatFormulaSource = {
  sheetId: string;
  ruleId: string;
  formulaIndex?: number;
  source: string;
};

function replaceConditionalFormatFormula(
  sheet: Sheet,
  ruleId: string,
  formulaIndex: number,
  source: string,
  replacements: readonly { start: number; end: number; value: string }[],
): void {
  if (!replacements.length) return;
  const rules = sheet.conditionalFormats;
  if (!rules) return;
  const index = rules.findIndex((rule) => rule.id === ruleId);
  const rule = rules[index];
  if (!rule) return;
  let next = source;
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start))
    next = `${next.slice(0, replacement.start)}${replacement.value}${next.slice(replacement.end)}`;
  let currentIndex = 0;
  rules[index] = mapConditionalFormatFormulas(rule, (candidate) =>
    currentIndex++ === formulaIndex && candidate === source ? next : candidate,
  );
}

/** Captures formula conditions on every rule except an optionally removed sheet. */
export function getConditionalFormatFormulaSources(
  workbook: Workbook,
  excludedSheetId?: string,
): ConditionalFormatFormulaSource[] {
  return [...workbook.sheets.values()].flatMap((sheet) =>
    sheet.id === excludedSheetId
      ? []
      : (sheet.conditionalFormats ?? []).flatMap((rule) =>
          conditionalFormatFormulaSources(rule).map((source, formulaIndex) => ({
            sheetId: sheet.id,
            ruleId: rule.id,
            formulaIndex,
            source,
          })),
        ),
  );
}

/** Restores conditional-format formula text without changing rule order or other metadata. */
export function restoreConditionalFormatFormulaSources(
  workbook: Workbook,
  sources: readonly ConditionalFormatFormulaSource[],
): void {
  for (const source of sources) {
    const sheet = workbook.sheets.get(source.sheetId);
    const rules = sheet?.conditionalFormats;
    const index = rules?.findIndex((rule) => rule.id === source.ruleId) ?? -1;
    const rule = index >= 0 ? rules?.[index] : undefined;
    if (!rules || !rule) continue;
    let formulaIndex = 0;
    rules[index] = mapConditionalFormatFormulas(rule, (candidate) =>
      formulaIndex++ === (source.formulaIndex ?? 0) ? source.source : candidate,
    );
  }
}

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
        if (candidate.kind === "axis") {
          if (sheetsByName().get(candidate.sheetName.toLowerCase()) !== targetSheetId) continue;
          if (!transform) {
            replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
            continue;
          }
          const addressFor = (value: number): FormulaAddress =>
            candidate.axis === "row" ? { row: value, column: 0 } : { row: 0, column: value };
          const start = transform(addressFor(candidate.rangeStart));
          const end = transform(addressFor(candidate.rangeEnd));
          if (!start && !end) {
            replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
            continue;
          }
          const startValue =
            candidate.axis === "row" ? (start ?? end)!.row : (start ?? end)!.column;
          const endValue = candidate.axis === "row" ? (end ?? start)!.row : (end ?? start)!.column;
          const format = (value: number, absolute: boolean) =>
            `${absolute ? "$" : ""}${candidate.axis === "column" ? columnIndexToLabel(value) : value + 1}`;
          const sheetName = workbook.sheets.get(targetSheetId)?.name;
          if (!sheetName) continue;
          replacements.push({
            start: candidate.start,
            end: candidate.end,
            value: `${formatSheetName(sheetName)}!${format(startValue, candidate.startAbsolute)}:${format(endValue, candidate.endAbsolute)}`,
          });
          continue;
        }
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

/** Rewrites qualified sheet references in conditional-format formula conditions. */
export function rewriteConditionalFormatQualifiedReferencesForSheet(
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
    for (const rule of sheet.conditionalFormats ?? []) {
      for (const [formulaIndex, source] of conditionalFormatFormulaSources(rule).entries()) {
        const replacements: Array<{ start: number; end: number; value: string }> = [];
        for (const candidate of qualifiedReferenceCandidates(source)) {
          if (candidate.kind === "axis") {
            if (sheetsByName().get(candidate.sheetName.toLowerCase()) !== targetSheetId) continue;
            if (!transform) {
              replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
              continue;
            }
            const addressFor = (value: number): FormulaAddress =>
              candidate.axis === "row" ? { row: value, column: 0 } : { row: 0, column: value };
            const start = transform(addressFor(candidate.rangeStart));
            const end = transform(addressFor(candidate.rangeEnd));
            if (!start && !end) {
              replacements.push({ start: candidate.start, end: candidate.end, value: "#REF!" });
              continue;
            }
            const startValue =
              candidate.axis === "row" ? (start ?? end)!.row : (start ?? end)!.column;
            const endValue =
              candidate.axis === "row" ? (end ?? start)!.row : (end ?? start)!.column;
            const format = (value: number, absolute: boolean) =>
              `${absolute ? "$" : ""}${candidate.axis === "column" ? columnIndexToLabel(value) : value + 1}`;
            const sheetName = workbook.sheets.get(targetSheetId)?.name;
            if (!sheetName) continue;
            replacements.push({
              start: candidate.start,
              end: candidate.end,
              value: `${formatSheetName(sheetName)}!${format(startValue, candidate.startAbsolute)}:${format(endValue, candidate.endAbsolute)}`,
            });
            continue;
          }
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
        replaceConditionalFormatFormula(sheet, rule.id, formulaIndex, source, replacements);
      }
    }
  }
}

export function renameQualifiedReferencesForSheet(
  workbook: Workbook,
  previousName: string,
  nextName: string,
): FormulaSource[] {
  const formulaSources: FormulaSource[] = [];
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
      if (replacements.length) {
        formulaSources.push({ sheetId: sheet.id, address: parseCellAddress(key), source });
        replaceFormulaReferences(sheet, key, source, replacements);
      }
    }
  }
  return formulaSources;
}

/** Renames qualified sheet references in conditional-format formula conditions. */
export function renameConditionalFormatQualifiedReferencesForSheet(
  workbook: Workbook,
  previousName: string,
  nextName: string,
): ConditionalFormatFormulaSource[] {
  const sources: ConditionalFormatFormulaSource[] = [];
  const formatted = formatSheetName(nextName);
  for (const sheet of workbook.sheets.values()) {
    for (const rule of sheet.conditionalFormats ?? []) {
      for (const [formulaIndex, source] of conditionalFormatFormulaSources(rule).entries()) {
        const replacements = qualifiedReferenceCandidates(source)
          .filter((candidate) => candidate.sheetName.toLowerCase() === previousName.toLowerCase())
          .map((candidate) => ({
            start: candidate.start,
            end: candidate.end,
            value: `${formatted}!${source.slice(candidate.referenceStart, candidate.end)}`,
          }));
        if (!replacements.length) continue;
        sources.push({ sheetId: sheet.id, ruleId: rule.id, formulaIndex, source });
        replaceConditionalFormatFormula(sheet, rule.id, formulaIndex, source, replacements);
      }
    }
  }
  return sources;
}

export type FormulaSource = { sheetId: string; address: CellAddress; source: string };

/** Restores only the formula texts transformed by an inverse command. */
export function restoreFormulaSources(
  workbook: Workbook,
  formulaSources: readonly FormulaSource[],
): void {
  for (const formula of formulaSources) {
    const sheet = workbook.sheets.get(formula.sheetId);
    const key = `${formula.address.row}:${formula.address.column}`;
    const cell = sheet?.cells.get(key);
    if (sheet && cell?.content?.kind === "formula") {
      sheet.cells.set(key, {
        ...cell,
        content: { kind: "formula", formula: { source: formula.source } },
      });
    }
  }
}

function parseCellAddress(key: string): CellAddress {
  const [rawRow, rawColumn] = key.split(":");
  return { row: Number(rawRow), column: Number(rawColumn) };
}

type QualifiedReferenceCandidate =
  | {
      kind: "a1";
      start: number;
      end: number;
      referenceStart: number;
      sheetName: string;
    }
  | {
      kind: "axis";
      start: number;
      end: number;
      referenceStart: number;
      sheetName: string;
      axis: "row" | "column";
      rangeStart: number;
      rangeEnd: number;
      startAbsolute: boolean;
      endAbsolute: boolean;
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
    if (expression.kind === "axis-range") {
      if (!expression.range.sheetName) return;
      const start = qualifiedReferenceStart(source, expression.range.startOffset);
      if (start !== null)
        candidates.push({
          kind: "axis",
          start,
          end: expression.range.endOffset,
          referenceStart: expression.range.startOffset,
          sheetName: expression.range.sheetName,
          axis: expression.range.axis,
          rangeStart: expression.range.start,
          rangeEnd: expression.range.end,
          startAbsolute: expression.range.startAbsolute,
          endAbsolute: expression.range.endAbsolute,
        });
      return;
    }
    if (expression.kind === "range") {
      add(expression.range.start, expression.range.end.end);
      return;
    }
    if (expression.kind === "spill") {
      add(expression.reference, expression.end);
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
    if (expression.kind === "function") for (const argument of expression.args) visit(argument);
  };
  const add = (reference: FormulaReference, end: number) => {
    if (!reference.sheetName) return;
    const start = qualifiedReferenceStart(source, reference.start);
    if (start !== null)
      candidates.push({
        kind: "a1",
        start,
        end,
        referenceStart: reference.start,
        sheetName: reference.sheetName,
      });
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

function formatSheetName(name: string): string {
  return /^[\p{L}\p{N}_.]+$/u.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
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
  sheet.cells.set(key, {
    ...sheet.cells.get(key)!,
    content: { kind: "formula", formula: { source: next } },
  });
}
