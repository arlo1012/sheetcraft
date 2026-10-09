import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  isFormulaError,
  parseFormula,
  type FormulaExpression,
  type FormulaValue,
} from "@sheetcraft/core/formula";
import { resolveTableReferenceBounds } from "@sheetcraft/core/commands";
import { getDefinedName, type CellAddress, type Workbook } from "@sheetcraft/core/workbook";

type FormulaCell = Readonly<{ key: string; row: number; column: number; sheetId: string }>;
type FormulaIndex = { rows: number[]; byRow: Map<number, FormulaCell[]> };

export function createFormulaCacheEligibility(
  workbook: Workbook,
): (sheetId: string, row: number, column: number) => boolean {
  const keyFor = (sheetId: string, row: number, column: number) =>
    JSON.stringify([sheetId, row, column]);
  const formulas = new Map<string, FormulaCell>();
  const indexes = new Map<string, FormulaIndex>();
  const sheetsByName = new Map<string, string>();
  for (const sheet of workbook.sheets.values()) {
    sheetsByName.set(sheet.name.toLocaleLowerCase("en-US"), sheet.id);
    const byRow = new Map<number, FormulaCell[]>();
    for (const [cellKey, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const [row, column] = cellKey.split(":").map(Number);
      if (row === undefined || column === undefined) continue;
      const key = keyFor(sheet.id, row, column);
      const formula = { key, row, column, sheetId: sheet.id };
      formulas.set(key, formula);
      const rowFormulas = byRow.get(row) ?? [];
      rowFormulas.push(formula);
      byRow.set(row, rowFormulas);
    }
    for (const row of byRow.values()) row.sort((left, right) => left.column - right.column);
    indexes.set(sheet.id, { rows: [...byRow.keys()].sort((left, right) => left - right), byRow });
  }
  const safe = new Map<string, boolean>();
  const lowerBound = (values: readonly number[], target: number): number => {
    let start = 0;
    let end = values.length;
    while (start < end) {
      const middle = Math.floor((start + end) / 2);
      if ((values[middle] ?? 0) < target) start = middle + 1;
      else end = middle;
    }
    return start;
  };
  const dependenciesFor = (key: string): string[] | null => {
    const formula = formulas.get(key);
    if (!formula) return [];
    const source = workbook.sheets
      .get(formula.sheetId)
      ?.cells.get(`${formula.row}:${formula.column}`)?.content;
    if (source?.kind !== "formula") return [];
    const parsed = parseFormula(source.formula.source);
    if (!parsed.ok) return null;
    const result = new Set<string>();
    const sheetIdFor = (sheetName: string | undefined) =>
      sheetName ? sheetsByName.get(sheetName.toLocaleLowerCase("en-US")) : formula.sheetId;
    const addRange = (sheetId: string | undefined, start: CellAddress, end: CellAddress) => {
      if (sheetId !== undefined && start.row === end.row && start.column === end.column) {
        const dependency = keyFor(sheetId, start.row, start.column);
        if (formulas.has(dependency)) result.add(dependency);
        return;
      }
      const index = sheetId === undefined ? undefined : indexes.get(sheetId);
      // A genuinely missing sheet is evaluated as Excel's #REF!, not as a
      // dependency on a same-position cell in the current sheet.
      if (!index) return;
      const startRow = Math.min(start.row, end.row);
      const endRow = Math.max(start.row, end.row);
      const startColumn = Math.min(start.column, end.column);
      const endColumn = Math.max(start.column, end.column);
      for (
        let offset = lowerBound(index.rows, startRow);
        (index.rows[offset] ?? Infinity) <= endRow;
        offset += 1
      ) {
        for (const dependency of index.byRow.get(index.rows[offset] ?? -1) ?? []) {
          if (dependency.column >= startColumn && dependency.column <= endColumn)
            result.add(dependency.key);
        }
      }
    };
    const visit = (expression: FormulaExpression): boolean => {
      if (expression.kind === "error") return !["NAME", "PARSE", "CYCLE"].includes(expression.code);
      // Whole-axis sources stay intact, but remain conservatively uncached.
      if (expression.kind === "axis-range") return false;
      if (expression.kind === "reference" || expression.kind === "spill") {
        addRange(
          sheetIdFor(expression.reference.sheetName),
          expression.reference,
          expression.reference,
        );
      } else if (expression.kind === "range") {
        addRange(
          sheetIdFor(expression.range.start.sheetName),
          expression.range.start,
          expression.range.end,
        );
      } else if (expression.kind === "identifier") {
        const named = getDefinedName(workbook, expression.name, formula.sheetId);
        if (!named) return false;
        addRange(named.reference.sheetId, named.reference.start, named.reference.end);
      } else if (expression.kind === "structured-reference") {
        const bounds = resolveTableReferenceBounds(
          workbook,
          formula.sheetId,
          expression.reference,
          formula,
        );
        if (!bounds) return false;
        addRange(bounds.sheetId, bounds.start, bounds.end);
      } else if (expression.kind === "unary") return visit(expression.operand);
      else if (expression.kind === "binary")
        return visit(expression.left) && visit(expression.right);
      else if (expression.kind === "array") return expression.rows.every((row) => row.every(visit));
      else if (expression.kind === "function")
        return (
          DEFAULT_FORMULA_FUNCTION_REGISTRY.get(expression.name) !== undefined &&
          expression.args.every(visit)
        );
      return true;
    };
    return visit(parsed.ast.expression) ? [...result] : null;
  };
  return (sheetId, row, column) => {
    const root = keyFor(sheetId, row, column);
    if (safe.has(root)) return safe.get(root) ?? false;
    const visiting = new Set<string>();
    const frames: Array<{ key: string; dependencies?: readonly string[] }> = [{ key: root }];
    while (frames.length) {
      const frame = frames.pop();
      if (!frame || safe.has(frame.key)) continue;
      if (frame.dependencies) {
        safe.set(
          frame.key,
          frame.dependencies.every((dependency) => safe.get(dependency) !== false),
        );
        visiting.delete(frame.key);
        continue;
      }
      if (visiting.has(frame.key)) {
        safe.set(frame.key, false);
        continue;
      }
      const dependencies = dependenciesFor(frame.key);
      if (dependencies === null) {
        safe.set(frame.key, false);
        continue;
      }
      if (dependencies.length === 0) {
        safe.set(frame.key, true);
        continue;
      }
      visiting.add(frame.key);
      frames.push({ key: frame.key, dependencies });
      for (const dependency of [...dependencies].reverse()) {
        if (!safe.has(dependency)) frames.push({ key: dependency });
      }
    }
    return safe.get(root) ?? false;
  };
}

export function formulaCacheValue(value: FormulaValue): unknown | undefined {
  if (!isFormulaError(value)) return value === null ? 0 : value;
  if (["NAME", "PARSE", "CYCLE"].includes(value.code)) return undefined;
  if (value.code === "NULL") return { error: "#NULL!" };
  if (value.code === "DIV0") return { error: "#DIV/0!" };
  if (value.code === "VALUE") return { error: "#VALUE!" };
  if (value.code === "REF") return { error: "#REF!" };
  if (value.code === "NUM") return { error: "#NUM!" };
  if (value.code === "NA") return { error: "#N/A" };
  if (value.code === "SPILL") return { error: "#SPILL!" };
  if (value.code === "CALC") return { error: "#CALC!" };
  return { error: "#GETTING_DATA" };
}
