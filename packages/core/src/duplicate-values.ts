import {
  createCellKey,
  createWorkbookEvaluator,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
  type Workbook,
} from "./workbook.js";
import type { CellContent, FormulaValue } from "./formula/types.js";

type DuplicateValue = { address: CellAddress; key: string; value: FormulaValue };

/** Duplicate comparison is case-insensitive for text; numbers and text remain distinct. */
export function getDuplicateValueKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return `n:${value}`;
  if (typeof value === "string") return `s:${value.toLowerCase()}`;
  if (typeof value === "boolean") return `b:${value}`;
  return `e:${JSON.stringify(value)}`;
}
function inRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}
function parseAddress(key: string): CellAddress {
  const separator = key.indexOf(":");
  return { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) };
}

/** Resolve formula roots before collecting spills, including roots outside the compared range. */
function collectDuplicateValues(sheet: Sheet, evaluator: SheetEvaluator): DuplicateValue[] {
  const addresses = new Map<string, CellAddress>();
  for (const [key, cell] of sheet.cells) {
    if (!cell.content) continue;
    const address = parseAddress(key);
    addresses.set(key, address);
    if (cell.content.kind === "formula") evaluator.getComputedValue(address);
  }
  for (const projection of evaluator.getSpillProjections?.() ?? []) {
    addresses.set(createCellKey(projection.address), projection.address);
  }
  const values: DuplicateValue[] = [];
  for (const address of addresses.values()) {
    const value = evaluator.getComputedValue(address);
    const key = getDuplicateValueKey(value);
    if (key !== null) values.push({ address, key, value });
  }
  return values;
}
function countValues(values: readonly DuplicateValue[], range: CellRange): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (inRange(value.address, range)) counts.set(value.key, (counts.get(value.key) ?? 0) + 1);
  }
  return counts;
}
export function getDuplicateValueCounts(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  evaluator = createWorkbookEvaluator(workbook, sheetId),
): Map<string, number> {
  const sheet = workbook.sheets.get(sheetId);
  return sheet ? countValues(collectDuplicateValues(sheet, evaluator), range) : new Map();
}

/**
 * Returns each non-blank compared value once, in row-major first-occurrence order.
 * Formula cells are represented by their evaluated values so generated output never
 * carries references back to the source sheet.
 */
export function getDuplicateValueSummaries(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  evaluator = createWorkbookEvaluator(workbook, sheetId),
): Array<{ value: FormulaValue; count: number }> {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) return [];
  const values = collectDuplicateValues(sheet, evaluator)
    .filter((value) => inRange(value.address, range))
    .sort(
      (left, right) =>
        left.address.row - right.address.row || left.address.column - right.address.column,
    );
  const summaries = new Map<string, { value: FormulaValue; count: number }>();
  for (const value of values) {
    const summary = summaries.get(value.key);
    if (summary) summary.count += 1;
    else summaries.set(value.key, { value: value.value, count: 1 });
  }
  return [...summaries.values()];
}

/** Create once per document display revision; scrolling reuses the sparse value index. */
export function createDuplicateHighlightResolver(
  sheet: Sheet,
  evaluator: SheetEvaluator,
): (address: CellAddress) => { fillColor?: string; textColor?: string } | undefined {
  const rules = (sheet.duplicateRules ?? []).filter((rule) => rule.kind === "highlight");
  const counts = new Map<string, Map<string, number>>();
  let values: DuplicateValue[] | undefined;
  return (address) => {
    for (const rule of rules) {
      if (!inRange(address, rule.range)) continue;
      let count = counts.get(rule.id);
      if (!count) {
        values ??= collectDuplicateValues(sheet, evaluator);
        count = countValues(values, rule.range);
        counts.set(rule.id, count);
      }
      const key = getDuplicateValueKey(evaluator.getComputedValue(address));
      if (key !== null && (count.get(key) ?? 0) > 1)
        return {
          ...(rule.fillColor ? { fillColor: rule.fillColor } : {}),
          ...(rule.textColor ? { textColor: rule.textColor } : {}),
        };
    }
    return undefined;
  };
}

/**
 * Finds the existing cells that violate one or more duplicate-entry rejection rules.
 *
 * This is deliberately a sparse, read-only diagnosis: it does not add an exception
 * to a rule or mutate the workbook. Consumers may keep their own ignored-issue UI
 * state while continuing to render the remaining issues.
 */
export function getDuplicateEntryIssues(
  sheet: Sheet,
  evaluator: SheetEvaluator,
): Array<{ address: CellAddress; ruleIds: string[]; valueKey: string }> {
  const rules = (sheet.duplicateRules ?? []).filter((rule) => rule.kind === "reject");
  if (!rules.length) return [];

  const values = collectDuplicateValues(sheet, evaluator);
  const issues = new Map<string, { address: CellAddress; ruleIds: string[]; valueKey: string }>();
  for (const rule of rules) {
    const counts = countValues(values, rule.range);
    for (const value of values) {
      if (!inRange(value.address, rule.range) || (counts.get(value.key) ?? 0) <= 1) continue;
      const addressKey = createCellKey(value.address);
      const issue = issues.get(addressKey);
      if (issue) issue.ruleIds.push(rule.id);
      else {
        issues.set(addressKey, {
          address: { ...value.address },
          ruleIds: [rule.id],
          valueKey: value.key,
        });
      }
    }
  }
  return [...issues.values()].sort(
    (left, right) =>
      left.address.row - right.address.row || left.address.column - right.address.column,
  );
}

export type DuplicateEntryChange = {
  sheetId: string;
  address: CellAddress;
  content: CellContent | null;
};
/** Evaluate the complete prospective batch without mutating the document or history. */
export function validateDuplicateEntries(
  workbook: Workbook,
  changes: readonly DuplicateEntryChange[],
  options: { includeUnchanged?: boolean } = {},
): { valid: true } | { valid: false; sheetId: string; address: CellAddress; ruleId: string } {
  const contentChanged = (change: DuplicateEntryChange) =>
    JSON.stringify(
      workbook.sheets.get(change.sheetId)?.cells.get(createCellKey(change.address))?.content ??
        null,
    ) !== JSON.stringify(change.content);
  // Direct input may explicitly re-enter an existing value. General mutations,
  // including format-only changes, still validate only changed content by default.
  const shouldValidate = (change: DuplicateEntryChange) =>
    options.includeUnchanged || contentChanged(change);
  if (
    !changes.some(
      (change) =>
        shouldValidate(change) &&
        (workbook.sheets.get(change.sheetId)?.duplicateRules ?? []).some(
          (rule) => rule.kind === "reject" && inRange(change.address, rule.range),
        ),
    )
  )
    return { valid: true };

  const shadowWorkbook: Workbook = { ...workbook, sheets: new Map(workbook.sheets) };
  const bySheet = new Map<string, Map<string, DuplicateEntryChange>>();
  for (const change of changes) {
    let entries = bySheet.get(change.sheetId);
    if (!entries) {
      entries = new Map();
      bySheet.set(change.sheetId, entries);
    }
    entries.set(createCellKey(change.address), change);
  }
  for (const [sheetId, entries] of bySheet) {
    const original = workbook.sheets.get(sheetId);
    if (!original) continue;
    const sheet: Sheet = { ...original, cells: new Map(original.cells) };
    for (const [key, change] of entries) {
      const current = sheet.cells.get(key) ?? {};
      if (change.content) sheet.cells.set(key, { ...current, content: change.content });
      else if (current.style) sheet.cells.set(key, { style: current.style });
      else sheet.cells.delete(key);
    }
    shadowWorkbook.sheets.set(sheetId, sheet);
  }
  for (const [sheetId, entries] of bySheet) {
    const sheet = shadowWorkbook.sheets.get(sheetId);
    if (!sheet) continue;
    const relevant = [...entries.values()].filter(shouldValidate);
    const rules = (sheet.duplicateRules ?? []).filter(
      (rule) =>
        rule.kind === "reject" && relevant.some((change) => inRange(change.address, rule.range)),
    );
    if (!rules.length) continue;
    const evaluator = createWorkbookEvaluator(shadowWorkbook, sheetId);
    const values = collectDuplicateValues(sheet, evaluator);
    for (const rule of rules) {
      const counts = countValues(values, rule.range);
      for (const change of relevant) {
        if (!inRange(change.address, rule.range)) continue;
        const key = getDuplicateValueKey(evaluator.getComputedValue(change.address));
        if (key !== null && (counts.get(key) ?? 0) > 1)
          return { valid: false, sheetId, address: { ...change.address }, ruleId: rule.id };
      }
    }
  }
  return { valid: true };
}
