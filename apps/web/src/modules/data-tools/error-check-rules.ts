import { validateCellContentDataValidation } from "@sheetcraft/core/data-validation";
import { getDuplicateEntryIssues } from "@sheetcraft/core/duplicate-values";
import {
  collectFormulaRanges,
  collectFormulaReferences,
  getFormulaAst,
  isFormulaError,
  translateFormulaForCopy,
} from "@sheetcraft/core/formula";
import { isNumericText } from "@sheetcraft/core/input";
import {
  createCellKey,
  createWorkbookEvaluator,
  getTableDataRows,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { ErrorCheckRuleKey } from "./duplicate-error-preferences";

export type ErrorCheckKind =
  | "duplicate"
  | "calculation-incomplete"
  | "formula-error"
  | "data-validation"
  | "number-stored-as-text"
  | "two-digit-year"
  | "irregular-date"
  | "leading-trailing-spaces"
  | "calculated-column"
  | "inconsistent-formula"
  | "formula-omitting-cells"
  | "unlocked-formula"
  | "formula-refers-to-empty";

export type ErrorCheckIssue = {
  address: CellAddress;
  kind: ErrorCheckKind;
  signature: string;
};

export const ERROR_CHECK_KIND_TO_SETTING: Readonly<Record<ErrorCheckKind, ErrorCheckRuleKey>> = {
  duplicate: "duplicateEntries",
  "calculation-incomplete": "calculationIncomplete",
  "formula-error": "formulaError",
  "data-validation": "dataValidation",
  "number-stored-as-text": "numberStoredAsText",
  "two-digit-year": "twoDigitYear",
  "irregular-date": "irregularDate",
  "leading-trailing-spaces": "leadingTrailingSpaces",
  "calculated-column": "calculatedColumn",
  "inconsistent-formula": "inconsistentFormula",
  "formula-omitting-cells": "formulaOmittingCells",
  "unlocked-formula": "unlockedFormula",
  "formula-refers-to-empty": "formulaRefersToEmpty",
};

const KIND_PRIORITY: Readonly<Record<ErrorCheckKind, number>> = {
  duplicate: 0,
  "calculation-incomplete": 1,
  "formula-error": 2,
  "data-validation": 3,
  "number-stored-as-text": 4,
  "two-digit-year": 5,
  "irregular-date": 6,
  "leading-trailing-spaces": 7,
  "calculated-column": 8,
  "inconsistent-formula": 9,
  "formula-omitting-cells": 10,
  "unlocked-formula": 11,
  "formula-refers-to-empty": 12,
};

export function pickPrimaryErrorCheckKind(issues: readonly ErrorCheckIssue[]): ErrorCheckKind {
  let primary = issues[0]!.kind;
  let best = KIND_PRIORITY[primary];
  for (let index = 1; index < issues.length; index++) {
    const candidate = issues[index]!.kind;
    const rank = KIND_PRIORITY[candidate];
    if (rank < best) {
      best = rank;
      primary = candidate;
    }
  }
  return primary;
}

export function stableErrorValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function parseCellKey(cellKey: string): CellAddress {
  const separator = cellKey.indexOf(":");
  return {
    row: Number(cellKey.slice(0, separator)),
    column: Number(cellKey.slice(separator + 1)),
  };
}

function normalizeFormulaText(source: string): string {
  return source.trim().replace(/\s+/gu, "").toUpperCase();
}

function formulasMatchRelatively(
  sourceA: string,
  addrA: CellAddress,
  sourceB: string,
  addrB: CellAddress,
): boolean {
  const translated = translateFormulaForCopy(
    sourceA,
    { row: addrB.row - addrA.row, column: addrB.column - addrA.column },
    { includeSheetQualifiedReferences: true },
  );
  return normalizeFormulaText(translated) === normalizeFormulaText(sourceB);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isTwoDigitYearDateText(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;

  const ymdChinese = /^(\d{2})年(\d{1,2})月(\d{1,2})[日号]?$/u.exec(text);
  if (ymdChinese) {
    return isValidCalendarDate(
      2000 + Number(ymdChinese[1]),
      Number(ymdChinese[2]),
      Number(ymdChinese[3]),
    );
  }

  const ymdDot = /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/u.exec(text);
  if (ymdDot) {
    const a = Number(ymdDot[1]),
      b = Number(ymdDot[2]),
      c = Number(ymdDot[3]);
    return isValidCalendarDate(2000 + a, b, c);
  }

  const slashOrDash = /^(\d{1,2})([/-])(\d{1,2})\2(\d{1,2})$/u.exec(text);
  if (slashOrDash) {
    const first = slashOrDash[1]!,
      second = slashOrDash[3]!,
      third = slashOrDash[4]!;
    const a = Number(first),
      b = Number(second),
      c = Number(third);
    if (first.length === 2 && isValidCalendarDate(2000 + a, b, c)) return true;
    if (
      third.length === 2 &&
      (isValidCalendarDate(2000 + c, a, b) || isValidCalendarDate(2000 + c, b, a))
    ) {
      return true;
    }
  }
  return false;
}

function isIrregularDateText(raw: string): boolean {
  const text = raw.trim();
  if (!text || isTwoDigitYearDateText(text)) return false;

  const dotted = /^((?:19|20)\d{2})\.(\d{1,2})\.(\d{1,2})$/u.exec(text);
  if (dotted) return true;

  const mixed = /^((?:19|20)\d{2})([/.-])(\d{1,2})([/.-])(\d{1,2})$/u.exec(text);
  if (mixed && mixed[2] !== mixed[4]) return true;

  const chinese = /^((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/u.exec(text);
  if (chinese) return true;

  const spaced = /^((?:19|20)\d{2})\s*([/-])\s*(\d{1,2})\s*\2\s*(\d{1,2})$/u.exec(text);
  if (spaced) {
    const hasSpaces = /\s/u.test(text);
    const valid = isValidCalendarDate(Number(spaced[1]), Number(spaced[3]), Number(spaced[4]));
    if (hasSpaces || !valid) return true;
  }

  return false;
}

function inRange(address: CellAddress, range: CellRange): boolean {
  const top = Math.min(range.start.row, range.end.row);
  const bottom = Math.max(range.start.row, range.end.row);
  const left = Math.min(range.start.column, range.end.column);
  const right = Math.max(range.start.column, range.end.column);
  return (
    address.row >= top && address.row <= bottom && address.column >= left && address.column <= right
  );
}

function isRangeOverlapping(
  aTop: number,
  aBottom: number,
  aLeft: number,
  aRight: number,
  bTop: number,
  bBottom: number,
  bLeft: number,
  bRight: number,
): boolean {
  return aTop <= bBottom && bTop <= aBottom && aLeft <= bRight && bLeft <= aRight;
}

function resolveSheetByName(workbook: Workbook, sheetName: string): Sheet | undefined {
  const target = sheetName.toLowerCase();
  for (const candidate of workbook.sheets.values()) {
    if (candidate.name.toLowerCase() === target) return candidate;
  }
  return undefined;
}

function isAdjacentOmittedNumeric(
  sheet: Sheet,
  evaluator: SheetEvaluator,
  candidate: CellAddress,
  owner: CellAddress,
  rangeTop: number,
  rangeBottom: number,
  rangeLeft: number,
  rangeRight: number,
): boolean {
  if (candidate.row < 0 || candidate.column < 0) return false;
  if (candidate.row === owner.row && candidate.column === owner.column) return false;
  const cell = sheet.cells.get(createCellKey(candidate));
  if (!cell?.content) return false;
  const computed = evaluator.getComputedValue(candidate);
  if (typeof computed !== "number" || !Number.isFinite(computed)) return false;

  // Avoid false positives when another summary formula sits directly adjacent to the range.
  if (cell.content.kind === "formula") {
    const ast = getFormulaAst(cell.content.formula.source);
    if (ast) {
      for (const ref of collectFormulaReferences(ast)) {
        if (!ref.sheetName && ref.row === owner.row && ref.column === owner.column) {
          return false;
        }
      }
      for (const rng of collectFormulaRanges(ast)) {
        if (rng.start.sheetName || rng.end.sheetName) continue;
        const rTop = Math.min(rng.start.row, rng.end.row);
        const rBottom = Math.max(rng.start.row, rng.end.row);
        const rLeft = Math.min(rng.start.column, rng.end.column);
        const rRight = Math.max(rng.start.column, rng.end.column);
        if (
          isRangeOverlapping(
            rangeTop,
            rangeBottom,
            rangeLeft,
            rangeRight,
            rTop,
            rBottom,
            rLeft,
            rRight,
          )
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

function duplicateIssueSignature(
  sheet: Sheet,
  evaluator: SheetEvaluator,
  issue: ReturnType<typeof getDuplicateEntryIssues>[number],
): string {
  const rules = (sheet.duplicateRules ?? [])
    .filter((rule) => issue.ruleIds.includes(rule.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rule) => ({ id: rule.id, range: rule.range }));
  return stableErrorValue({
    valueKey: issue.valueKey,
    content: sheet.cells.get(createCellKey(issue.address))?.content ?? null,
    computedValue: evaluator.getComputedValue(issue.address),
    rules,
  });
}

function detectCalculatedColumnIssues(sheet: Sheet): ErrorCheckIssue[] {
  const tables = sheet.tables ?? [];
  if (!tables.length) return [];
  const issues: ErrorCheckIssue[] = [];

  for (const table of tables) {
    const { start: startRow, end: endRow } = getTableDataRows(table);
    if (endRow < startRow) continue;
    const rowCount = endRow - startRow + 1;

    for (let colOffset = 0; colOffset < table.columns.length; colOffset++) {
      const columnDef = table.columns[colOffset]!;
      const col = table.range.start.column + colOffset;

      if (columnDef.calculatedColumnFormula) {
        for (let row = startRow; row <= endRow; row++) {
          const address = { row, column: col };
          const cell = sheet.cells.get(createCellKey(address));
          const expected = translateFormulaForCopy(
            columnDef.calculatedColumnFormula,
            { row: row - startRow, column: 0 },
            { includeSheetQualifiedReferences: true },
          );
          const actual = cell?.content?.kind === "formula" ? cell.content.formula.source : null;
          if (!actual || normalizeFormulaText(actual) !== normalizeFormulaText(expected)) {
            issues.push({
              address,
              kind: "calculated-column",
              signature: stableErrorValue({
                tableId: table.id,
                columnId: columnDef.id,
                expected: normalizeFormulaText(expected),
                content: cell?.content ?? null,
              }),
            });
          }
        }
        continue;
      }

      if (rowCount < 3) continue;
      // Fallback: if the majority of data rows share one relative formula pattern,
      // flag cells in that column that diverge from it.
      const entries: Array<{ row: number; source: string | null }> = [];
      for (let row = startRow; row <= endRow; row++) {
        const cell = sheet.cells.get(createCellKey({ row, column: col }));
        entries.push({
          row,
          source: cell?.content?.kind === "formula" ? cell.content.formula.source : null,
        });
      }
      const formulaEntries = entries.filter(
        (entry): entry is { row: number; source: string } => entry.source !== null,
      );
      if (formulaEntries.length < 2) continue;

      let bestAnchor: { row: number; source: string } | undefined;
      let bestCount = 0;
      for (const candidate of formulaEntries) {
        let count = 0;
        for (const other of formulaEntries) {
          if (
            formulasMatchRelatively(
              candidate.source,
              { row: candidate.row, column: col },
              other.source,
              { row: other.row, column: col },
            )
          ) {
            count++;
          }
        }
        if (count > bestCount) {
          bestCount = count;
          bestAnchor = candidate;
        }
      }
      if (!bestAnchor || bestCount < 2 || bestCount <= rowCount / 2) continue;

      for (const entry of entries) {
        const address = { row: entry.row, column: col };
        const matches =
          entry.source !== null &&
          formulasMatchRelatively(
            bestAnchor.source,
            { row: bestAnchor.row, column: col },
            entry.source,
            address,
          );
        if (!matches) {
          const cell = sheet.cells.get(createCellKey(address));
          issues.push({
            address,
            kind: "calculated-column",
            signature: stableErrorValue({
              tableId: table.id,
              columnId: columnDef.id,
              anchor: bestAnchor.source,
              content: cell?.content ?? null,
            }),
          });
        }
      }
    }
  }

  return issues;
}

function detectInconsistentFormulaIssues(
  formulaCells: ReadonlyMap<string, { address: CellAddress; source: string }>,
): ErrorCheckIssue[] {
  if (formulaCells.size < 3) return [];
  const issues: ErrorCheckIssue[] = [];

  const formulaAt = (row: number, column: number) =>
    formulaCells.get(createCellKey({ row, column }));

  for (const entry of formulaCells.values()) {
    const { address, source } = entry;
    const { row, column } = address;

    const checkAxis = (dr: number, dc: number): boolean => {
      const prev1 = formulaAt(row - dr, column - dc);
      const next1 = formulaAt(row + dr, column + dc);
      if (
        prev1 &&
        next1 &&
        formulasMatchRelatively(prev1.source, prev1.address, next1.source, next1.address) &&
        !formulasMatchRelatively(prev1.source, prev1.address, source, address)
      ) {
        return true;
      }
      const prev2 = prev1 ? formulaAt(row - dr * 2, column - dc * 2) : undefined;
      if (
        prev1 &&
        prev2 &&
        formulasMatchRelatively(prev2.source, prev2.address, prev1.source, prev1.address) &&
        !formulasMatchRelatively(prev1.source, prev1.address, source, address)
      ) {
        return true;
      }
      const next2 = next1 ? formulaAt(row + dr * 2, column + dc * 2) : undefined;
      if (
        next1 &&
        next2 &&
        formulasMatchRelatively(next1.source, next1.address, next2.source, next2.address) &&
        !formulasMatchRelatively(next1.source, next1.address, source, address)
      ) {
        return true;
      }
      return false;
    };

    if (checkAxis(1, 0) || checkAxis(0, 1)) {
      const neighborSources = [
        formulaAt(row - 1, column)?.source ?? null,
        formulaAt(row + 1, column)?.source ?? null,
        formulaAt(row, column - 1)?.source ?? null,
        formulaAt(row, column + 1)?.source ?? null,
      ];
      issues.push({
        address,
        kind: "inconsistent-formula",
        signature: stableErrorValue({ source, neighborSources }),
      });
    }
  }

  return issues;
}

/** Collects all background error-check issues for one sheet snapshot. */
export function collectSheetErrorIssues(
  workbook: Workbook,
  sheet: Sheet,
  evaluator: SheetEvaluator,
): ErrorCheckIssue[] {
  const issues: ErrorCheckIssue[] = [];

  for (const duplicate of getDuplicateEntryIssues(sheet, evaluator)) {
    issues.push({
      address: duplicate.address,
      kind: "duplicate",
      signature: duplicateIssueSignature(sheet, evaluator, duplicate),
    });
  }

  const formulaCells = new Map<string, { address: CellAddress; source: string }>();
  const validations = sheet.dataValidations ?? [];
  let freshEvaluator: SheetEvaluator | undefined;
  const isManualMode = workbook.calculation.mode === "manual";

  for (const [cellKey, cell] of sheet.cells) {
    const content = cell.content;
    if (!content) continue;
    const address = parseCellKey(cellKey);

    // Data validation check (sparse: only cells that exist in the sheet).
    if (validations.length > 0) {
      for (const rule of validations) {
        if (!inRange(address, rule.range)) continue;
        const result = validateCellContentDataValidation(rule, content, {
          workbook,
          sheet,
          address,
        });
        if (!result.valid) {
          issues.push({
            address,
            kind: "data-validation",
            signature: stableErrorValue({
              content,
              computed: content.kind === "formula" ? evaluator.getComputedValue(address) : null,
              rule,
            }),
          });
          break;
        }
      }
    }

    if (content.kind === "literal" && typeof content.value === "string") {
      const value = content.value;
      if (isNumericText(value)) {
        issues.push({
          address,
          kind: "number-stored-as-text",
          signature: stableErrorValue({ content }),
        });
      }
      if (value.length > 0 && value !== value.trim()) {
        issues.push({
          address,
          kind: "leading-trailing-spaces",
          signature: stableErrorValue({ value }),
        });
      }
      if (isTwoDigitYearDateText(value)) {
        issues.push({
          address,
          kind: "two-digit-year",
          signature: stableErrorValue({ value }),
        });
      } else if (isIrregularDateText(value)) {
        issues.push({
          address,
          kind: "irregular-date",
          signature: stableErrorValue({ value }),
        });
      }
      continue;
    }

    if (content.kind !== "formula") continue;
    const source = content.formula.source;
    formulaCells.set(cellKey, { address, source });

    // Unlocked cell containing a formula.
    if (cell.style?.unlocked === true) {
      issues.push({
        address,
        kind: "unlocked-formula",
        signature: stableErrorValue({ source, unlocked: true }),
      });
    }

    const computed = evaluator.getComputedValue(address);
    if (isFormulaError(computed)) {
      if (computed.code === "CYCLE") {
        issues.push({
          address,
          kind: "calculation-incomplete",
          signature: stableErrorValue({ source, code: computed.code }),
        });
      }
      issues.push({
        address,
        kind: "formula-error",
        signature: stableErrorValue({ source, code: computed.code }),
      });
    } else if (isManualMode) {
      freshEvaluator ??= createWorkbookEvaluator(workbook, sheet.id);
      const freshValue = freshEvaluator.getComputedValue(address);
      if (stableErrorValue(computed) !== stableErrorValue(freshValue)) {
        issues.push({
          address,
          kind: "calculation-incomplete",
          signature: stableErrorValue({ source, displayed: computed, expected: freshValue }),
        });
      }
    }

    const ast = getFormulaAst(source);
    if (!ast) continue;

    const ranges = collectFormulaRanges(ast);
    const references = collectFormulaReferences(ast);

    // Formula omitting adjacent numeric cells.
    const omittedCells: string[] = [];
    for (const range of ranges) {
      if (range.start.sheetName || range.end.sheetName) continue;
      const top = Math.min(range.start.row, range.end.row);
      const bottom = Math.max(range.start.row, range.end.row);
      const left = Math.min(range.start.column, range.end.column);
      const right = Math.max(range.start.column, range.end.column);

      if (left === right) {
        for (const candidate of [
          { row: top - 1, column: left },
          { row: bottom + 1, column: left },
        ]) {
          if (
            isAdjacentOmittedNumeric(sheet, evaluator, candidate, address, top, bottom, left, right)
          ) {
            omittedCells.push(createCellKey(candidate));
          }
        }
      } else if (top === bottom) {
        for (const candidate of [
          { row: top, column: left - 1 },
          { row: top, column: right + 1 },
        ]) {
          if (
            isAdjacentOmittedNumeric(sheet, evaluator, candidate, address, top, bottom, left, right)
          ) {
            omittedCells.push(createCellKey(candidate));
          }
        }
      }
    }
    if (omittedCells.length > 0) {
      omittedCells.sort();
      issues.push({
        address,
        kind: "formula-omitting-cells",
        signature: stableErrorValue({ source, omittedCells }),
      });
    }

    // Formula referring directly to empty cells (excluding range endpoints).
    const emptyRefs: string[] = [];
    for (const ref of references) {
      const isRangeEndpoint = ranges.some(
        (range) => ref.start === range.startOffset || ref.end === range.endOffset,
      );
      if (isRangeEndpoint) continue;
      const targetSheet = ref.sheetName ? resolveSheetByName(workbook, ref.sheetName) : sheet;
      if (!targetSheet) continue;
      const targetAddress = { row: ref.row, column: ref.column };
      const targetKey = createCellKey(targetAddress);
      const targetCell = targetSheet.cells.get(targetKey);
      const hasLiteralOrFormula =
        targetCell?.content !== undefined &&
        !(
          targetCell.content.kind === "literal" &&
          (targetCell.content.value === null || targetCell.content.value === "")
        );
      if (hasLiteralOrFormula) continue;
      const targetEval =
        targetSheet.id === sheet.id ? evaluator : evaluator.forSheet?.(targetSheet.id);
      const spilled = targetEval?.getComputedValue(targetAddress);
      if (spilled === null || spilled === undefined) {
        emptyRefs.push(`${targetSheet.id}|${targetKey}`);
      }
    }
    if (emptyRefs.length > 0) {
      emptyRefs.sort();
      issues.push({
        address,
        kind: "formula-refers-to-empty",
        signature: stableErrorValue({ source, emptyRefs }),
      });
    }
  }

  issues.push(...detectCalculatedColumnIssues(sheet));
  issues.push(...detectInconsistentFormulaIssues(formulaCells));

  return issues;
}
