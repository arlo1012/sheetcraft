import {
  collectFormulaEvaluationDependencies,
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  isFormulaError,
  parseFormula,
  type FormulaExpression,
  type FormulaValue,
} from "@idea10/core/formula";
import type { Sheet } from "@idea10/core/workbook";

type FormulaCell = Readonly<{ key: string; row: number; column: number }>;

function hasSupportedExpression(expression: FormulaExpression): boolean {
  if (expression.kind === "error") return !["NAME", "PARSE", "CYCLE"].includes(expression.code);
  if (expression.kind === "identifier") return false;
  if (expression.kind === "unary") return hasSupportedExpression(expression.operand);
  if (expression.kind === "binary")
    return hasSupportedExpression(expression.left) && hasSupportedExpression(expression.right);
  if (expression.kind === "function")
    return (
      DEFAULT_FORMULA_FUNCTION_REGISTRY.get(expression.name) !== undefined &&
      expression.args.every(hasSupportedExpression)
    );
  return true;
}

export function createFormulaCacheEligibility(
  sheet: Sheet,
): (row: number, column: number) => boolean {
  const formulaByRow = new Map<number, FormulaCell[]>();
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const [row, column] = key.split(":").map(Number);
    if (row === undefined || column === undefined) continue;
    const formula = { key, row, column };
    const rowFormulas = formulaByRow.get(row) ?? [];
    rowFormulas.push(formula);
    formulaByRow.set(row, rowFormulas);
  }
  const formulaRows = [...formulaByRow.keys()].sort((left, right) => left - right);
  for (const formulas of formulaByRow.values())
    formulas.sort((left, right) => left.column - right.column);
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
    const source = sheet.cells.get(key)?.content;
    if (source?.kind !== "formula") return [];
    const parsed = parseFormula(source.formula.source);
    if (!parsed.ok || !hasSupportedExpression(parsed.ast.expression)) return null;
    const dependencies = collectFormulaEvaluationDependencies(parsed.ast);
    const result = dependencies.references.map(
      (reference) => `${reference.row}:${reference.column}`,
    );
    for (const range of dependencies.ranges) {
      const startRow = Math.min(range.start.row, range.end.row);
      const endRow = Math.max(range.start.row, range.end.row);
      const startColumn = Math.min(range.start.column, range.end.column);
      const endColumn = Math.max(range.start.column, range.end.column);
      for (
        let index = lowerBound(formulaRows, startRow);
        (formulaRows[index] ?? Infinity) <= endRow;
        index += 1
      ) {
        for (const formula of formulaByRow.get(formulaRows[index] ?? -1) ?? []) {
          if (formula.column >= startColumn && formula.column <= endColumn)
            result.push(formula.key);
        }
      }
    }
    return result;
  };
  return (row, column) => {
    const root = `${row}:${column}`;
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
