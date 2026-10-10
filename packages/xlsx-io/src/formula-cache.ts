import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  isFormulaError,
  normalizeFormulaFunctionName,
  parseFormula,
  type FormulaExpression,
  type FormulaValue,
} from "@sheetcraft/core/formula";
import { resolveTableReferenceBounds } from "@sheetcraft/core/commands";
import {
  getDefinedName,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type SheetEvaluator,
  type Workbook,
} from "@sheetcraft/core/workbook";

type FormulaCell = Readonly<{
  key: string;
  row: number;
  column: number;
  sheetId: string;
  source: string;
}>;
type IndexedCell = Readonly<{ key: string; row: number; column: number; sheetId: string }>;
type CellIndex = { rows: number[]; byRow: Map<number, IndexedCell[]> };
type FormulaDependencies = { safe: boolean; formulas: string[]; cells: IndexedCell[] };
const keyFor = (sheetId: string, row: number, column: number) =>
  JSON.stringify([sheetId, row, column]);

function lowerBound(values: readonly number[], target: number): number {
  let start = 0;
  let end = values.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if ((values[middle] ?? 0) < target) start = middle + 1;
    else end = middle;
  }
  return start;
}

// Mirrors the evaluator's conservative spill discovery boundary. An absent
// referenced cell can otherwise silently acquire an unindexed formula source.
function canSpill(expression: FormulaExpression): boolean {
  const pending = [expression];
  while (pending.length) {
    const next = pending.pop()!;
    if (
      ["array", "range", "axis-range", "structured-reference", "spill", "identifier"].includes(
        next.kind,
      )
    )
      return true;
    if (next.kind === "function") {
      const name = normalizeFormulaFunctionName(next.name);
      if (["IF", "IFERROR", "IFNA", "IFS", "SWITCH", "CHOOSE", "INDEX"].includes(name))
        pending.push(...next.args);
      else if (DEFAULT_FORMULA_FUNCTION_REGISTRY.get(name)?.metadata.arrayResult) return true;
    } else if (next.kind === "unary") pending.push(next.operand);
    else if (next.kind === "binary") pending.push(next.left, next.right);
  }
  return false;
}

function createFormulaDependencyAnalysis(workbook: Workbook, iterative: boolean) {
  const formulas = new Map<string, FormulaCell>();
  const indexes = new Map<string, CellIndex>();
  const sheetsByName = new Map<string, string>();
  const possibleSpills = new Map<string, FormulaCell[]>();
  const expressions = new Map<string, FormulaExpression>();
  for (const sheet of workbook.sheets.values()) {
    sheetsByName.set(sheet.name.toLocaleLowerCase("en-US"), sheet.id);
    const byRow = new Map<number, IndexedCell[]>();
    for (const [cellKey, cell] of sheet.cells) {
      const [row, column] = cellKey.split(":").map(Number);
      if (row === undefined || column === undefined) continue;
      const key = keyFor(sheet.id, row, column);
      const indexed = { key, row, column, sheetId: sheet.id };
      if (cell.content?.kind === "formula") {
        const formula = { ...indexed, source: cell.content.formula.source };
        formulas.set(key, formula);
        if (iterative) {
          const parsed = parseFormula(formula.source);
          if (parsed.ok) {
            expressions.set(key, parsed.ast.expression);
            if (canSpill(parsed.ast.expression)) {
              const roots = possibleSpills.get(sheet.id) ?? [];
              roots.push(formula);
              possibleSpills.set(sheet.id, roots);
            }
          }
        }
      } else if (!iterative) continue;
      const cells = byRow.get(row) ?? [];
      cells.push(indexed);
      byRow.set(row, cells);
    }
    for (const row of byRow.values()) row.sort((left, right) => left.column - right.column);
    indexes.set(sheet.id, { rows: [...byRow.keys()].sort((left, right) => left - right), byRow });
  }
  const inBounds = (address: CellAddress) =>
    Number.isInteger(address.row) &&
    Number.isInteger(address.column) &&
    address.row >= 0 &&
    address.row < MAX_SHEET_ROWS &&
    address.column >= 0 &&
    address.column < MAX_SHEET_COLUMNS;
  const dependenciesFor = (key: string): FormulaDependencies => {
    const formula = formulas.get(key);
    if (!formula) return { safe: true, formulas: [], cells: [] };
    const parsed = iterative ? undefined : parseFormula(formula.source);
    const expression = iterative
      ? expressions.get(key)
      : parsed?.ok
        ? parsed.ast.expression
        : undefined;
    if (!expression) return { safe: false, formulas: [], cells: [] };
    // This extension handles definite scalar sources only; scalar aggregates
    // over ranges/names/tables are fine, uncertain range-returning shapes are not.
    let safe = !iterative || (inBounds(formula) && !canSpill(expression));
    const dependencies = new Set<string>();
    const cells = new Map<string, IndexedCell>();
    const sheetIdFor = (sheetName: string | undefined) => {
      if (iterative && sheetName && (sheetName.includes("[") || sheetName.includes("]"))) {
        safe = false;
        return undefined;
      }
      return sheetName ? sheetsByName.get(sheetName.toLocaleLowerCase("en-US")) : formula.sheetId;
    };
    const addCell = (cell: IndexedCell) => {
      if (formulas.has(cell.key)) dependencies.add(cell.key);
      if (!iterative) return;
      cells.set(cell.key, cell);
      const content = workbook.sheets
        .get(cell.sheetId)
        ?.cells.get(`${cell.row}:${cell.column}`)?.content;
      if (
        content?.kind === "error" ||
        content?.kind === "image" ||
        (content?.kind === "literal" &&
          typeof content.value === "number" &&
          !Number.isFinite(content.value))
      )
        safe = false;
    };
    const addRange = (sheetId: string | undefined, start: CellAddress, end: CellAddress) => {
      if (
        iterative &&
        (sheetId === undefined ||
          !workbook.sheets.has(sheetId) ||
          !inBounds(start) ||
          !inBounds(end))
      ) {
        safe = false;
        return;
      }
      const index = sheetId === undefined ? undefined : indexes.get(sheetId);
      // The ordinary acyclic path intentionally preserves Excel #REF! caches.
      if (!index) return;
      const startRow = Math.min(start.row, end.row);
      const endRow = Math.max(start.row, end.row);
      const startColumn = Math.min(start.column, end.column);
      const endColumn = Math.max(start.column, end.column);
      if (
        iterative &&
        (possibleSpills.get(sheetId!) ?? []).some(
          (root) => root.row <= endRow && root.column <= endColumn,
        )
      )
        safe = false;
      if (startRow === endRow && startColumn === endColumn) {
        const dependency = keyFor(sheetId!, startRow, startColumn);
        if (formulas.has(dependency)) dependencies.add(dependency);
        if (iterative) {
          const cell = index.byRow.get(startRow)?.find((cell) => cell.column === startColumn);
          if (cell) addCell(cell);
        }
        return;
      }
      for (
        let offset = lowerBound(index.rows, startRow);
        (index.rows[offset] ?? Infinity) <= endRow;
        offset += 1
      ) {
        for (const cell of index.byRow.get(index.rows[offset] ?? -1) ?? []) {
          if (cell.column >= startColumn && cell.column <= endColumn) addCell(cell);
        }
      }
    };
    const pending = [expression];
    while (pending.length) {
      const next = pending.pop()!;
      if (next.kind === "error") {
        if (iterative || ["NAME", "PARSE", "CYCLE"].includes(next.code)) safe = false;
      } else if (next.kind === "number" && iterative && !Number.isFinite(next.value)) safe = false;
      else if (next.kind === "axis-range") safe = false;
      else if (next.kind === "reference" || next.kind === "spill") {
        if (iterative && next.kind === "spill") safe = false;
        addRange(sheetIdFor(next.reference.sheetName), next.reference, next.reference);
      } else if (next.kind === "range") {
        const sheetId = sheetIdFor(next.range.start.sheetName);
        if (
          iterative &&
          next.range.end.sheetName &&
          sheetIdFor(next.range.end.sheetName) !== sheetId
        )
          safe = false;
        addRange(sheetId, next.range.start, next.range.end);
      } else if (next.kind === "identifier") {
        const named = getDefinedName(workbook, next.name, formula.sheetId);
        if (!named) safe = false;
        else addRange(named.reference.sheetId, named.reference.start, named.reference.end);
      } else if (next.kind === "structured-reference") {
        const bounds = resolveTableReferenceBounds(
          workbook,
          formula.sheetId,
          next.reference,
          formula,
        );
        if (!bounds) safe = false;
        else addRange(bounds.sheetId, bounds.start, bounds.end);
      } else if (next.kind === "unary") pending.push(next.operand);
      else if (next.kind === "binary") pending.push(next.left, next.right);
      else if (next.kind === "array") {
        if (iterative) safe = false;
        for (const row of next.rows) pending.push(...row);
      } else if (next.kind === "function") {
        const name = normalizeFormulaFunctionName(next.name);
        const definition = DEFAULT_FORMULA_FUNCTION_REGISTRY.get(name);
        if (
          !definition ||
          (iterative &&
            ((definition.metadata.arrayResult && canSpill(next)) ||
              ["RAND", "RANDBETWEEN", "NOW", "TODAY", "SUMIF"].includes(name)))
        )
          safe = false;
        pending.push(...next.args);
      }
    }
    return { safe, formulas: [...dependencies], cells: [...cells.values()] };
  };
  return { formulas, dependenciesFor };
}

export function createFormulaCacheEligibility(
  workbook: Workbook,
): (sheetId: string, row: number, column: number) => boolean {
  const { dependenciesFor } = createFormulaDependencyAnalysis(workbook, false);
  const safe = new Map<string, boolean>();
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
      const analysis = dependenciesFor(frame.key);
      if (!analysis.safe) {
        safe.set(frame.key, false);
        continue;
      }
      const dependencies = analysis.formulas;
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

function cyclicFormulaKeys(
  forward: ReadonlyMap<string, readonly string[]>,
  reverse: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const visited = new Set<string>();
  const order: string[] = [];
  for (const root of forward.keys()) {
    if (visited.has(root)) continue;
    const stack: Array<{ key: string; finish?: boolean }> = [{ key: root }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.finish) {
        order.push(frame.key);
        continue;
      }
      if (visited.has(frame.key)) continue;
      visited.add(frame.key);
      stack.push({ key: frame.key, finish: true });
      for (const dependency of forward.get(frame.key) ?? []) {
        if (!visited.has(dependency)) stack.push({ key: dependency });
      }
    }
  }
  visited.clear();
  const cyclic = new Set<string>();
  for (const root of order.reverse()) {
    if (visited.has(root)) continue;
    const members: string[] = [];
    const stack = [root];
    while (stack.length) {
      const key = stack.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);
      members.push(key);
      for (const dependency of reverse.get(key) ?? []) {
        if (!visited.has(dependency)) stack.push(dependency);
      }
    }
    if (members.length > 1 || forward.get(root)?.includes(root)) {
      for (const key of members) cyclic.add(key);
    }
  }
  return cyclic;
}

function reverseClosure(
  roots: Iterable<string>,
  reverse: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const result = new Set<string>();
  const pending = [...roots];
  while (pending.length) {
    const key = pending.pop()!;
    if (result.has(key)) continue;
    result.add(key);
    pending.push(...(reverse.get(key) ?? []));
  }
  return result;
}

/**
 * Prepares genuine numeric caches from one shared calculation memo. Static
 * closure checks and original-source residuals qualify values; neither the
 * rechecked number nor a manufactured seed is ever used as the cached result.
 */
export function createIterativeFormulaCache(
  workbook: Workbook,
  evaluator: SheetEvaluator,
): (sheetId: string, row: number, column: number) => number | undefined {
  const empty = () => undefined;
  if (!workbook.calculation.iterative || !evaluator.forSheet || !evaluator.evaluateFormula)
    return empty;
  const { formulas, dependenciesFor } = createFormulaDependencyAnalysis(workbook, true);
  const analysis = new Map<string, FormulaDependencies>();
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const key of formulas.keys()) reverse.set(key, []);
  const invalid = new Set<string>();
  for (const key of formulas.keys()) {
    const dependencies = dependenciesFor(key);
    analysis.set(key, dependencies);
    forward.set(key, dependencies.formulas);
    if (!dependencies.safe) invalid.add(key);
    for (const dependency of dependencies.formulas) reverse.get(dependency)?.push(key);
  }
  const cyclic = cyclicFormulaKeys(forward, reverse);
  const unsafe = reverseClosure(invalid, reverse);
  const candidates = reverseClosure(cyclic, reverse);
  for (const key of unsafe) candidates.delete(key);
  if (!candidates.size) return empty;
  const views = new Map<string, SheetEvaluator>();
  for (const formula of formulas.values()) {
    if (views.has(formula.sheetId)) continue;
    const view = evaluator.forSheet(formula.sheetId);
    if (!view.evaluateFormula) return empty;
    views.set(formula.sheetId, view);
  }
  const valueFor = (formula: FormulaCell) => views.get(formula.sheetId)!.getComputedValue(formula);
  // A later discovered SCC can make Core advance earlier SCCs globally.
  // Finish the cycle prepass before capturing any cache or evaluating consumers.
  for (const key of cyclic) {
    if (candidates.has(key)) valueFor(formulas.get(key)!);
  }
  const closure = new Set<string>();
  const pending = [...candidates];
  while (pending.length) {
    const key = pending.pop()!;
    if (closure.has(key)) continue;
    closure.add(key);
    pending.push(...(forward.get(key) ?? []));
  }
  for (const key of closure) valueFor(formulas.get(key)!);
  // Freeze every newly allowed output against this same memo snapshot. Later
  // unrelated filter/simulation reads must not mix epochs into these caches.
  const values = new Map<string, FormulaValue>();
  for (const key of closure) values.set(key, valueFor(formulas.get(key)!));
  const finite = (value: FormulaValue): value is number =>
    typeof value === "number" && Number.isFinite(value);
  for (const key of closure) {
    const formula = formulas.get(key)!;
    const value = values.get(key)!;
    if (isFormulaError(value) || (typeof value === "number" && !Number.isFinite(value))) {
      invalid.add(key);
      continue;
    }
    const rechecked = views.get(formula.sheetId)!.evaluateFormula!(formula.source, formula);
    if (cyclic.has(key)) {
      if (
        !finite(value) ||
        !finite(rechecked) ||
        Math.abs(rechecked - value) > workbook.calculation.maxChange
      )
        invalid.add(key);
    } else if (isFormulaError(rechecked) || !Object.is(value, rechecked)) {
      // Core can retain an old acyclic bridge memo when a later SCC advances
      // its input. Do not publish that mixed-epoch bridge or its dependents.
      invalid.add(key);
    }
    for (const cell of analysis.get(key)!.cells) {
      const dependency = views.get(cell.sheetId)!.getComputedValue(cell);
      if (
        isFormulaError(dependency) ||
        (typeof dependency === "number" && !Number.isFinite(dependency))
      )
        invalid.add(key);
    }
  }
  const rejected = reverseClosure(invalid, reverse);
  const cache = new Map<string, number>();
  for (const key of candidates) {
    const value = values.get(key)!;
    if (!rejected.has(key) && finite(value)) cache.set(key, value);
  }
  return (sheetId, row, column) => cache.get(keyFor(sheetId, row, column));
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
