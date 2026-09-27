import { collectFormulaRanges, collectFormulaReferences, getFormulaAst } from "./formula/index.js";
import { isFormulaError, type FormulaExpression } from "./formula/types.js";
import {
  createCellKey,
  createWorkbookEvaluator,
  isCellAddressInBounds,
  setCellContent,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "./workbook.js";
import { createBatchSetCellContentsCommand } from "./commands/values.js";
import { assertFillDataValidation } from "./commands/fill-validation.js";
import { validateDuplicateEntries } from "./duplicate-values.js";
import { invalidCommandPayload } from "./commands/helpers.js";
import type { SetCellContentsCommand } from "./commands/contracts.js";

export type GoalSeekRequest = {
  target: { sheetId: string; address: CellAddress };
  variable: { sheetId: string; address: CellAddress };
  targetValue: number;
  maxIterations?: number;
  tolerance?: number;
};

export type GoalSeekSuccess = {
  status: "success";
  value: number;
  achievedValue: number;
  iterations: number;
};
export type GoalSeekFailure = {
  status: "invalid-input" | "no-solution" | "iteration-limit" | "nondeterministic";
  iterations: number;
  value?: number;
  achievedValue?: number;
};
export type GoalSeekResult = GoalSeekSuccess | GoalSeekFailure;

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-9;
const MAX_ABS_VARIABLE = 1e12;
const MAX_DEPENDENCY_CELLS = 100_000;
const MAX_TRIALS = 1_000;

function sameAddress(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}
function contains(range: { start: CellAddress; end: CellAddress }, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}
/** The seek shadow owns only the writable variable sheet; every other sheet stays read-only. */
function createEvaluationShadow(workbook: Workbook, variableSheetId: string): Workbook {
  const variable = workbook.sheets.get(variableSheetId)!;
  return {
    ...workbook,
    sheets: new Map(workbook.sheets).set(variableSheetId, {
      ...variable,
      cells: new Map(variable.cells),
    }),
  };
}
function numericLiteral(sheet: Sheet, address: CellAddress): number | undefined {
  const content = sheet.cells.get(createCellKey(address))?.content;
  if (!content) return 0;
  return content.kind === "literal" &&
    typeof content.value === "number" &&
    Number.isFinite(content.value)
    ? content.value
    : undefined;
}
function result(status: GoalSeekFailure["status"], iterations = 0): GoalSeekFailure {
  return { status, iterations };
}
function residualTolerance(request: GoalSeekRequest, tolerance: number): number {
  return tolerance * Math.max(1, Math.abs(request.targetValue));
}

/** Returns true when the target formula or a direct formula dependency calls a volatile function. */
function formulaTokens(expression: FormulaExpression): {
  functions: Set<string>;
  identifiers: Set<string>;
  axes: Array<Extract<FormulaExpression, { kind: "axis-range" }>>;
} {
  const functions = new Set<string>(),
    identifiers = new Set<string>();
  const axes: Array<Extract<FormulaExpression, { kind: "axis-range" }>> = [];
  const visit = (node: FormulaExpression): void => {
    if (node.kind === "function") {
      functions.add(node.name.toUpperCase());
      node.args.forEach(visit);
    } else if (node.kind === "identifier") identifiers.add(node.name.toUpperCase());
    else if (node.kind === "axis-range") axes.push(node);
    else if (node.kind === "unary") visit(node.operand);
    else if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
    } else if (node.kind === "array") node.rows.flat().forEach(visit);
  };
  visit(expression);
  return { functions, identifiers, axes };
}

function hasVolatileDependency(workbook: Workbook, target: GoalSeekRequest["target"]): boolean {
  const pending = [target];
  const seen = new Set<string>();
  while (pending.length) {
    if (seen.size >= MAX_DEPENDENCY_CELLS) return true;
    const current = pending.pop()!;
    const key = `${current.sheetId}|${createCellKey(current.address)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sheet = workbook.sheets.get(current.sheetId);
    const content = sheet?.cells.get(createCellKey(current.address))?.content;
    if (content?.kind !== "formula") continue;
    const ast = getFormulaAst(content.formula.source);
    if (!ast) return true;
    const tokens = formulaTokens(ast.expression);
    if (
      ["NOW", "TODAY", "RAND", "RANDBETWEEN", "INDIRECT", "OFFSET"].some((name) =>
        tokens.functions.has(name),
      )
    )
      return true;
    const addReferencedSheet = (sheetName: string | undefined) =>
      sheetName
        ? [...workbook.sheets.values()].find(
            (candidate) =>
              candidate.name.toLocaleLowerCase("en-US") === sheetName.toLocaleLowerCase("en-US"),
          )
        : sheet;
    for (const reference of collectFormulaReferences(content.formula.source)) {
      const referenceSheet = addReferencedSheet(reference.sheetName);
      if (referenceSheet)
        pending.push({
          sheetId: referenceSheet.id,
          address: { row: reference.row, column: reference.column },
        });
    }
    for (const range of collectFormulaRanges(content.formula.source)) {
      const rangeSheet = addReferencedSheet(range.start.sheetName ?? range.end.sheetName);
      if (!rangeSheet) continue;
      const top = Math.min(range.start.row, range.end.row),
        bottom = Math.max(range.start.row, range.end.row);
      const left = Math.min(range.start.column, range.end.column),
        right = Math.max(range.start.column, range.end.column);
      for (const [cellKey, cell] of rangeSheet.cells) {
        if (!cell.content) continue;
        const [row, column] = cellKey.split(":").map(Number) as [number, number];
        if (row >= top && row <= bottom && column >= left && column <= right)
          pending.push({ sheetId: rangeSheet.id, address: { row, column } });
      }
    }
    for (const axis of tokens.axes) {
      const axisSheet = addReferencedSheet(axis.range.sheetName);
      if (!axisSheet) continue;
      const start = Math.min(axis.range.start, axis.range.end),
        end = Math.max(axis.range.start, axis.range.end);
      for (const [cellKey, cell] of axisSheet.cells) {
        if (!cell.content) continue;
        const [row, column] = cellKey.split(":").map(Number) as [number, number];
        if (
          (axis.range.axis === "column" ? column : row) >= start &&
          (axis.range.axis === "column" ? column : row) <= end
        )
          pending.push({ sheetId: axisSheet.id, address: { row, column } });
      }
    }
    for (const name of workbook.definedNames.values()) {
      if (name.scopeSheetId && name.scopeSheetId !== current.sheetId) continue;
      if (!tokens.identifiers.has(name.name.toUpperCase())) continue;
      const namedSheet = workbook.sheets.get(name.reference.sheetId);
      if (!namedSheet) continue;
      for (const [cellKey, cell] of namedSheet.cells) {
        if (!cell.content) continue;
        const [row, column] = cellKey.split(":").map(Number) as [number, number];
        if (contains(name.reference, { row, column }))
          pending.push({ sheetId: namedSheet.id, address: { row, column } });
      }
    }
  }
  return false;
}

function validateRequest(
  workbook: Workbook,
  request: GoalSeekRequest,
):
  | {
      maxIterations: number;
      tolerance: number;
      initial: number;
    }
  | undefined {
  if (
    !workbook ||
    !request ||
    typeof request !== "object" ||
    !request.target ||
    !request.variable ||
    typeof request.target.sheetId !== "string" ||
    typeof request.variable.sheetId !== "string" ||
    !Number.isFinite(request.targetValue)
  )
    return undefined;
  if (
    !isCellAddressInBounds(request.target.address) ||
    !isCellAddressInBounds(request.variable.address)
  )
    return undefined;
  if (
    request.target.sheetId === request.variable.sheetId &&
    sameAddress(request.target.address, request.variable.address)
  )
    return undefined;
  const maxIterations = request.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = request.tolerance ?? DEFAULT_TOLERANCE;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_TRIALS)
    return undefined;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 1) return undefined;
  const targetSheet = workbook.sheets.get(request.target.sheetId);
  const variableSheet = workbook.sheets.get(request.variable.sheetId);
  if (
    !targetSheet ||
    !variableSheet ||
    targetSheet.cells.get(createCellKey(request.target.address))?.content?.kind !== "formula"
  )
    return undefined;
  if (
    variableSheet.properties.protected ||
    variableSheet.mergedCells.some((range) => contains(range, request.variable.address))
  )
    return undefined;
  const initial = numericLiteral(variableSheet, request.variable.address);
  return initial === undefined ? undefined : { maxIterations, tolerance, initial };
}

function isSpillProjection(workbook: Workbook, sheetId: string, address: CellAddress): boolean {
  const sheet = workbook.sheets.get(sheetId)!;
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind === "formula") {
      const [row, column] = key.split(":").map(Number) as [number, number];
      evaluator.getComputedValue({ row, column });
    }
  }
  return [...(evaluator.getSpillProjections?.() ?? [])].some((item) =>
    sameAddress(item.address, address),
  );
}

function evaluate(workbook: Workbook, request: GoalSeekRequest, value: number): number | undefined {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_VARIABLE) return undefined;
  const variableSheet = workbook.sheets.get(request.variable.sheetId)!;
  setCellContent(variableSheet, request.variable.address, { kind: "literal", value });
  // A new evaluator per trial is intentional: it makes seek independent of manual-calculation caches.
  const target = createWorkbookEvaluator(workbook, request.target.sheetId).getComputedValue(
    request.target.address,
  );
  return typeof target === "number" && Number.isFinite(target) && !isFormulaError(target)
    ? target
    : undefined;
}

/** Finds a scalar numeric literal that makes a target formula reach targetValue without mutating workbook. */
export function solveGoalSeek(workbook: Workbook, request: GoalSeekRequest): GoalSeekResult {
  const valid = validateRequest(workbook, request);
  if (!valid) return result("invalid-input");
  if (hasVolatileDependency(workbook, request.target)) return result("nondeterministic");
  if (isSpillProjection(workbook, request.variable.sheetId, request.variable.address))
    return result("invalid-input");
  const shadow = createEvaluationShadow(workbook, request.variable.sheetId);
  const evaluateAt = (value: number) => evaluate(shadow, request, value);
  const allowedResidual = residualTolerance(request, valid.tolerance);
  let iterations = 0;
  const initialValue = evaluateAt(valid.initial);
  if (initialValue === undefined) return result("no-solution", iterations);
  let initialResidual = initialValue - request.targetValue;
  if (Math.abs(initialResidual) <= allowedResidual)
    return { status: "success", value: valid.initial, achievedValue: initialValue, iterations };

  let left = valid.initial,
    right = valid.initial;
  let leftResidual = initialResidual,
    rightResidual = initialResidual;
  let foundBracket = false;
  let varied = false;
  let secantPrevious = valid.initial,
    secantPreviousResidual = initialResidual;
  let secantCurrent = valid.initial,
    secantCurrentResidual = initialResidual;
  const bracketLimit = Math.max(1, Math.floor(valid.maxIterations / 2));
  for (let step = 1; iterations < bracketLimit && step <= 60; step += 1) {
    const distance = Math.min(
      MAX_ABS_VARIABLE,
      Math.max(1, Math.abs(valid.initial)) * 2 ** (step - 1),
    );
    for (const candidate of [valid.initial - distance, valid.initial + distance]) {
      if (iterations >= valid.maxIterations) break;
      const achieved = evaluateAt(candidate);
      iterations += 1;
      if (achieved === undefined) continue;
      const residual = achieved - request.targetValue;
      varied ||= residual !== initialResidual;
      if (secantCurrentResidual === secantPreviousResidual && residual !== secantCurrentResidual) {
        secantCurrent = candidate;
        secantCurrentResidual = residual;
      }
      if (Math.abs(residual) <= allowedResidual)
        return { status: "success", value: candidate, achievedValue: achieved, iterations };
      if (leftResidual * residual < 0) {
        right = candidate;
        rightResidual = residual;
        foundBracket = true;
        break;
      }
      if (rightResidual * residual < 0) {
        left = candidate;
        leftResidual = residual;
        foundBracket = true;
        break;
      }
      if (candidate < left) {
        left = candidate;
        leftResidual = residual;
      }
      if (candidate > right) {
        right = candidate;
        rightResidual = residual;
      }
    }
    if (foundBracket) break;
  }
  if (!foundBracket) {
    if (!varied) return result("no-solution", iterations);
    // A tangent root (for example (x - 3)^2 = 0) has no sign change. Try bounded secants.
    let previous = secantPrevious,
      previousResidual = secantPreviousResidual;
    let current = secantCurrent,
      currentResidual = secantCurrentResidual;
    while (iterations < valid.maxIterations && currentResidual !== previousResidual) {
      const candidate =
        current - (currentResidual * (current - previous)) / (currentResidual - previousResidual);
      if (!Number.isFinite(candidate) || Math.abs(candidate) > MAX_ABS_VARIABLE) break;
      const achieved = evaluateAt(candidate);
      iterations += 1;
      if (achieved === undefined) break;
      const residual = achieved - request.targetValue;
      if (Math.abs(residual) <= allowedResidual)
        return { status: "success", value: candidate, achievedValue: achieved, iterations };
      previous = current;
      previousResidual = currentResidual;
      current = candidate;
      currentResidual = residual;
    }
    return result(
      iterations >= valid.maxIterations ? "iteration-limit" : "no-solution",
      iterations,
    );
  }

  let bestValue = Math.abs(leftResidual) < Math.abs(rightResidual) ? left : right;
  let bestResidual = Math.min(Math.abs(leftResidual), Math.abs(rightResidual));
  let bestAchieved =
    bestValue === left ? leftResidual + request.targetValue : rightResidual + request.targetValue;
  while (iterations < valid.maxIterations) {
    const midpoint = (left + right) / 2;
    // Secant is faster near smooth roots; bisection keeps the bracket sound.
    const secant =
      rightResidual === leftResidual
        ? midpoint
        : right - (rightResidual * (right - left)) / (rightResidual - leftResidual);
    const candidate =
      Number.isFinite(secant) && secant > left && secant < right ? secant : midpoint;
    const achieved = evaluateAt(candidate);
    iterations += 1;
    if (achieved === undefined) return result("no-solution", iterations);
    const residual = achieved - request.targetValue;
    if (Math.abs(residual) < bestResidual) {
      bestValue = candidate;
      bestResidual = Math.abs(residual);
      bestAchieved = achieved;
    }
    if (Math.abs(residual) <= allowedResidual)
      return { status: "success", value: candidate, achievedValue: achieved, iterations };
    if (leftResidual * residual < 0) {
      right = candidate;
      rightResidual = residual;
    } else {
      left = candidate;
      leftResidual = residual;
    }
  }
  return { status: "iteration-limit", iterations, value: bestValue, achievedValue: bestAchieved };
}

/** Builds the one undoable value edit only after independently rechecking the solved result. */
export function createApplyGoalSeekCommand(
  workbook: Workbook,
  request: GoalSeekRequest,
  seekResult: GoalSeekResult,
): SetCellContentsCommand {
  if (seekResult.status !== "success")
    throw invalidCommandPayload("result", seekResult, "Goal seek did not succeed.");
  const valid = validateRequest(workbook, request);
  if (!valid || hasVolatileDependency(workbook, request.target))
    throw invalidCommandPayload("request", request, "Goal seek request is no longer valid.");
  if (isSpillProjection(workbook, request.variable.sheetId, request.variable.address))
    throw invalidCommandPayload(
      "variable",
      request.variable.address,
      "Cannot change a dynamic-array spill cell.",
    );
  const shadow = createEvaluationShadow(workbook, request.variable.sheetId);
  const achieved = evaluate(shadow, request, seekResult.value);
  if (
    achieved === undefined ||
    Math.abs(achieved - request.targetValue) > residualTolerance(request, valid.tolerance)
  )
    throw invalidCommandPayload(
      "result",
      seekResult,
      "Goal seek result no longer reaches the target.",
    );
  const command = createBatchSetCellContentsCommand([
    {
      sheetId: request.variable.sheetId,
      address: request.variable.address,
      content: { kind: "literal", value: seekResult.value },
    },
  ]);
  assertFillDataValidation(workbook, command);
  const duplicates = validateDuplicateEntries(workbook, command.changes);
  if (!duplicates.valid)
    throw invalidCommandPayload(
      "variable",
      request.variable.address,
      "Goal seek result violates duplicate-entry validation.",
    );
  return command;
}
