import solver, { type ModelDefinition, type SolveResult } from "javascript-lp-solver";
import { assertFillDataValidation } from "./commands/fill-validation.js";
import { createBatchSetCellContentsCommand } from "./commands/values.js";
import { validateDuplicateEntries } from "./duplicate-values.js";
import { hasVolatileDependency } from "./goal-seek.js";
import {
  evaluateFormulaAst,
  getFormulaAst,
  isFormulaError,
  type FormulaExpression,
} from "./formula/index.js";
import { MergedCellRangeResolver } from "./merged-cells.js";
import {
  createCellKey,
  createWorkbookEvaluator,
  getDefinedName,
  isCellAddressInBounds,
  setCellContent,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "./workbook.js";
import type { WorkbookCommand } from "./commands/contracts.js";
import { solveGrg } from "./planning-grg.js";
import { solveMixedGrg } from "./planning-grg-discrete.js";
import { solveEvolutionary } from "./planning-evolutionary.js";

const MAX_VARIABLES = 50;
const MAX_CONSTRAINTS = 200;
const MAX_AFFINE_CELLS = 10_000;
const MAX_SOLVE_TIME_MS = 2_000;
const EPSILON = 1e-8;

export type PlanningCellRef = Readonly<{ sheetId: string; address: CellAddress }>;
export type PlanningVariableKind = "continuous" | "integer" | "binary";
export type PlanningDirection = "maximize" | "minimize" | "target";
/** Solver engines corresponding to the familiar Excel/WPS Solver choices. */
export type PlanningMethod = "simplex" | "grg" | "evolutionary";
export type PlanningRelation = "lte" | "gte" | "eq";
export type PlanningVariable = Readonly<{
  cell: PlanningCellRef;
  kind: PlanningVariableKind;
  lower?: number;
  upper?: number;
}>;
export type PlanningConstraint = Readonly<{
  left: PlanningCellRef;
  relation: PlanningRelation;
  right: PlanningCellRef | number;
}>;
export type PlanningRequest = Readonly<{
  objective: PlanningCellRef;
  direction: PlanningDirection;
  targetValue?: number;
  variables: readonly PlanningVariable[];
  constraints: readonly PlanningConstraint[];
  timeLimitMs?: number;
  /** Defaults to Simplex LP to preserve existing workbooks. */
  method?: PlanningMethod;
}>;
export type PlanningChange = Readonly<{ sheetId: string; address: CellAddress; value: number }>;
export type PlanningDiagnostic = Readonly<{
  code: string;
  message: string;
  cell?: PlanningCellRef;
}>;
export type PlanningStatus =
  | "optimal"
  | "feasible"
  | "infeasible"
  | "unbounded"
  | "unsupported"
  | "invalid"
  | "limit"
  | "error";
export type PlanningResult = Readonly<{
  status: PlanningStatus;
  changes: readonly PlanningChange[];
  diagnostics: readonly PlanningDiagnostic[];
  objectiveValue?: number;
  targetResidual?: number;
  elapsedMs?: number;
  /** Internal preflight identity used to reject stale results before writing. */
  modelSignature?: string;
}>;

export type ApplyPlanningCommandResult =
  | Readonly<{ ok: true; command: WorkbookCommand }>
  | Readonly<{
      ok: false;
      reason:
        | "not-solved"
        | "stale-solution"
        | "protected-sheet"
        | "merged-tail"
        | "data-validation"
        | "duplicate-entry"
        | "invalid-result";
      message: string;
    }>;

type Affine = { constant: number; coefficients: Map<number, number> };
type BuiltModel = {
  variables: readonly PlanningVariable[];
  objective: Affine;
  constraints: Array<{
    coefficients: Map<number, number>;
    relation: PlanningRelation;
    rhs: number;
  }>;
  signature: string;
};

class PlanningFailure extends Error {
  constructor(
    readonly kind: "invalid" | "unsupported" | "limit",
    message: string,
    readonly cell?: PlanningCellRef,
  ) {
    super(message);
  }
}

function keyOf(reference: PlanningCellRef): string {
  return `${reference.sheetId}|${reference.address.row}:${reference.address.column}`;
}
function cloneAddress(address: CellAddress): CellAddress {
  return { row: address.row, column: address.column };
}
function cloneReference(reference: PlanningCellRef): PlanningCellRef {
  return { sheetId: reference.sheetId, address: cloneAddress(reference.address) };
}
function stable(value: unknown): string {
  return JSON.stringify(value);
}
function zero(): Affine {
  return { constant: 0, coefficients: new Map() };
}
function constant(value: number): Affine {
  return { constant: finite(value, "Planning arithmetic overflowed."), coefficients: new Map() };
}
function add(left: Affine, right: Affine, factor = 1): Affine {
  const coefficients = new Map(left.coefficients);
  for (const [index, value] of right.coefficients) {
    const next = (coefficients.get(index) ?? 0) + factor * value;
    finite(next, "Planning arithmetic overflowed.");
    if (next === 0) coefficients.delete(index);
    else coefficients.set(index, next);
  }
  return {
    constant: finite(left.constant + factor * right.constant, "Planning arithmetic overflowed."),
    coefficients,
  };
}
function scale(value: Affine, factor: number): Affine {
  const coefficients = new Map<number, number>();
  for (const [index, coefficient] of value.coefficients) {
    const next = coefficient * factor;
    finite(next, "Planning arithmetic overflowed.");
    if (next !== 0) coefficients.set(index, next);
  }
  return {
    constant: finite(value.constant * factor, "Planning arithmetic overflowed."),
    coefficients,
  };
}
function isConstant(value: Affine): boolean {
  return value.coefficients.size === 0;
}
function finite(value: number, message: string): number {
  if (!Number.isFinite(value)) throw new PlanningFailure("unsupported", message);
  return value;
}

function resolveSheet(workbook: Workbook, current: Sheet, name: string | undefined): Sheet {
  if (!name) return current;
  const sheet = [...workbook.sheets.values()].find(
    (candidate) => candidate.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"),
  );
  if (!sheet) throw new PlanningFailure("invalid", `Formula references missing sheet ${name}.`);
  return sheet;
}

function assertReference(workbook: Workbook, reference: PlanningCellRef): Sheet {
  const sheet = workbook.sheets.get(reference.sheetId);
  if (!sheet)
    throw new PlanningFailure(
      "invalid",
      "A planning reference points to a missing sheet.",
      reference,
    );
  if (
    !Number.isInteger(reference.address.row) ||
    !Number.isInteger(reference.address.column) ||
    !isCellAddressInBounds(reference.address)
  )
    throw new PlanningFailure("invalid", "A planning reference is outside the sheet.", reference);
  return sheet;
}

function contains(range: { start: CellAddress; end: CellAddress }, address: CellAddress): boolean {
  return (
    address.row >= Math.min(range.start.row, range.end.row) &&
    address.row <= Math.max(range.start.row, range.end.row) &&
    address.column >= Math.min(range.start.column, range.end.column) &&
    address.column <= Math.max(range.start.column, range.end.column)
  );
}

function spillProjectionKeys(workbook: Workbook): Set<string> {
  const evaluator = createWorkbookEvaluator(workbook, workbook.activeSheetId);
  const projections = new Set<string>();
  let formulas = 0;
  for (const sheet of workbook.sheets.values()) {
    const view = evaluator.forSheet?.(sheet.id) ?? createWorkbookEvaluator(workbook, sheet.id);
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      if (++formulas > MAX_AFFINE_CELLS)
        throw new PlanningFailure("limit", "Planning formula traversal is too large.");
      const [row, column] = key.split(":").map(Number) as [number, number];
      view.getComputedValue({ row, column });
    }
    for (const projection of view.getSpillProjections?.() ?? [])
      projections.add(`${sheet.id}|${createCellKey(projection.address)}`);
  }
  return projections;
}

function readNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new PlanningFailure("unsupported", message);
  return value;
}

function buildModel(workbook: Workbook, request: PlanningRequest): BuiltModel {
  if (!Array.isArray(request.variables) || !request.variables.length)
    throw new PlanningFailure("invalid", "Planning requires at least one changing cell.");
  if (request.variables.length > MAX_VARIABLES)
    throw new PlanningFailure(
      "limit",
      `Planning supports at most ${MAX_VARIABLES} changing cells.`,
    );
  if (!Array.isArray(request.constraints) || request.constraints.length > MAX_CONSTRAINTS)
    throw new PlanningFailure("limit", `Planning supports at most ${MAX_CONSTRAINTS} constraints.`);
  if (!["maximize", "minimize", "target"].includes(request.direction))
    throw new PlanningFailure("invalid", "Planning direction is invalid.");
  if (request.direction === "target" && !Number.isFinite(request.targetValue))
    throw new PlanningFailure("invalid", "A target value is required for target planning.");
  if (
    request.timeLimitMs !== undefined &&
    (!Number.isFinite(request.timeLimitMs) || request.timeLimitMs <= 0)
  )
    throw new PlanningFailure("invalid", "Planning time limit must be finite.");

  const variables = request.variables.map((variable) => ({
    ...variable,
    cell: cloneReference(variable.cell),
  }));
  const variableIndexes = new Map<string, number>();
  const spillKeys = spillProjectionKeys(workbook);
  for (const [index, variable] of variables.entries()) {
    const variableSheet = assertReference(workbook, variable.cell);
    if (!["continuous", "integer", "binary"].includes(variable.kind))
      throw new PlanningFailure("invalid", "A planning variable kind is invalid.", variable.cell);
    if (
      (variable.lower !== undefined && !Number.isFinite(variable.lower)) ||
      (variable.upper !== undefined && !Number.isFinite(variable.upper)) ||
      (variable.lower !== undefined &&
        variable.upper !== undefined &&
        variable.lower > variable.upper)
    )
      throw new PlanningFailure("invalid", "A planning variable bound is invalid.", variable.cell);
    if (
      variable.kind === "binary" &&
      ((variable.lower !== undefined && variable.lower < 0) ||
        (variable.upper !== undefined && variable.upper > 1))
    )
      throw new PlanningFailure(
        "invalid",
        "Binary variables must remain between zero and one.",
        variable.cell,
      );
    if (variableSheet.properties.protected)
      throw new PlanningFailure(
        "invalid",
        "A changing cell is on a protected sheet.",
        variable.cell,
      );
    if (variableSheet.mergedCells.some((range) => contains(range, variable.cell.address)))
      throw new PlanningFailure("invalid", "A changing cell cannot be merged.", variable.cell);
    if (spillKeys.has(keyOf(variable.cell)))
      throw new PlanningFailure(
        "invalid",
        "A changing cell cannot be a spill result.",
        variable.cell,
      );
    const source = variableSheet.cells.get(createCellKey(variable.cell.address))?.content;
    if (source?.kind === "formula")
      throw new PlanningFailure(
        "invalid",
        "A changing cell cannot contain a formula.",
        variable.cell,
      );
    if (
      source &&
      (source.kind !== "literal" ||
        typeof source.value !== "number" ||
        !Number.isFinite(source.value))
    )
      throw new PlanningFailure(
        "invalid",
        "A changing cell must contain a finite number or be blank.",
        variable.cell,
      );
    const key = keyOf(variable.cell);
    if (variableIndexes.has(key))
      throw new PlanningFailure("invalid", "Changing cells must be unique.", variable.cell);
    variableIndexes.set(key, index);
  }
  assertReference(workbook, request.objective);

  let visitedCells = 0;
  const cellCache = new Map<string, Affine>();
  const visiting = new Set<string>();
  const affineCell = (reference: PlanningCellRef): Affine => {
    const key = keyOf(reference);
    const variableIndex = variableIndexes.get(key);
    if (variableIndex !== undefined)
      return { constant: 0, coefficients: new Map([[variableIndex, 1]]) };
    const cached = cellCache.get(key);
    if (cached) return cached;
    if (++visitedCells > MAX_AFFINE_CELLS)
      throw new PlanningFailure("limit", "Planning formula traversal is too large.", reference);
    if (visiting.has(key))
      throw new PlanningFailure(
        "unsupported",
        "Planning does not support circular formulas.",
        reference,
      );
    visiting.add(key);
    const sheet = assertReference(workbook, reference);
    const content = sheet.cells.get(createCellKey(reference.address))?.content;
    let value: Affine;
    if (!content) value = zero();
    else if (content.kind === "literal")
      value = constant(readNumber(content.value, "Planning formulas must resolve to numbers."));
    else if (content.kind === "formula") {
      const ast = getFormulaAst(content.formula.source);
      if (!ast)
        throw new PlanningFailure(
          "unsupported",
          "Planning does not support invalid formulas.",
          reference,
        );
      value = affineExpression(ast.expression, sheet, content.formula.source);
    } else {
      throw new PlanningFailure(
        "unsupported",
        "Planning does not support error or image cells.",
        reference,
      );
    }
    visiting.delete(key);
    cellCache.set(key, value);
    return value;
  };
  const affineReference = (sheet: Sheet, reference: CellAddress & { sheetName?: string }): Affine =>
    affineCell({
      sheetId: resolveSheet(workbook, sheet, reference.sheetName).id,
      address: cloneAddress(reference),
    });
  const affineRange = (
    sheet: Sheet,
    range: {
      start: CellAddress & { sheetName?: string };
      end: CellAddress & { sheetName?: string };
    },
  ): Affine[] => {
    const target = resolveSheet(workbook, sheet, range.start.sheetName);
    const top = Math.min(range.start.row, range.end.row);
    const bottom = Math.max(range.start.row, range.end.row);
    const left = Math.min(range.start.column, range.end.column);
    const right = Math.max(range.start.column, range.end.column);
    const count = (bottom - top + 1) * (right - left + 1);
    if (count > MAX_AFFINE_CELLS || visitedCells + count > MAX_AFFINE_CELLS)
      throw new PlanningFailure("limit", "Planning range traversal is too large.");
    const values: Affine[] = [];
    for (let row = top; row <= bottom; row += 1)
      for (let column = left; column <= right; column += 1)
        values.push(affineCell({ sheetId: target.id, address: { row, column } }));
    return values;
  };
  const affineExpression = (
    expression: FormulaExpression,
    sheet: Sheet,
    source: string,
  ): Affine => {
    switch (expression.kind) {
      case "number":
        return constant(expression.value);
      case "reference":
        return affineReference(sheet, expression.reference);
      case "unary":
        return expression.operator === "+"
          ? affineExpression(expression.operand, sheet, source)
          : scale(affineExpression(expression.operand, sheet, source), -1);
      case "binary": {
        const left = affineExpression(expression.left, sheet, source);
        const right = affineExpression(expression.right, sheet, source);
        if (expression.operator === "+") return add(left, right);
        if (expression.operator === "-") return add(left, right, -1);
        if (expression.operator === "*") {
          if (isConstant(left)) return scale(right, left.constant);
          if (isConstant(right)) return scale(left, right.constant);
          throw new PlanningFailure(
            "unsupported",
            "Planning does not support products of changing values.",
          );
        }
        if (expression.operator === "/") {
          if (!isConstant(right) || Math.abs(right.constant) <= EPSILON)
            throw new PlanningFailure(
              "unsupported",
              "Planning does not support division by a changing value.",
            );
          return scale(left, 1 / right.constant);
        }
        throw new PlanningFailure("unsupported", "Planning supports only affine arithmetic.");
      }
      case "function": {
        const name = expression.name.toUpperCase();
        if (new Set(["RAND", "RANDBETWEEN", "NOW", "TODAY", "INDIRECT", "OFFSET"]).has(name))
          throw new PlanningFailure("unsupported", `${name} is volatile or dynamic.`);
        if (name === "SUM") {
          return expression.args.reduce((total, argument) => {
            if (argument.kind === "range")
              return affineRange(sheet, argument.range).reduce(
                (sum, value) => add(sum, value),
                total,
              );
            return add(total, affineExpression(argument, sheet, source));
          }, zero());
        }
        if (name === "SUMPRODUCT") {
          const terms = expression.args.map((argument) =>
            argument.kind === "range"
              ? affineRange(sheet, argument.range)
              : [affineExpression(argument, sheet, source)],
          );
          const width = terms[0]?.length ?? 0;
          if (!width || terms.some((term) => term.length !== width))
            throw new PlanningFailure("unsupported", "SUMPRODUCT requires equal non-empty ranges.");
          let result = zero();
          for (let index = 0; index < width; index += 1) {
            let product = constant(1);
            for (const term of terms) {
              const value = term[index]!;
              if (!isConstant(product) && !isConstant(value))
                throw new PlanningFailure(
                  "unsupported",
                  "SUMPRODUCT cannot multiply changing values.",
                );
              product = isConstant(product)
                ? scale(value, product.constant)
                : scale(product, value.constant);
            }
            result = add(result, product);
          }
          return result;
        }
        const arguments_ = expression.args.flatMap((argument) =>
          argument.kind === "range"
            ? affineRange(sheet, argument.range)
            : [affineExpression(argument, sheet, source)],
        );
        if (arguments_.some((argument) => !isConstant(argument)))
          throw new PlanningFailure("unsupported", `${name} depends on a changing value.`);
        const value = evaluateFormulaAst(
          { source, expression },
          {
            resolveCell: (reference) => affineReference(sheet, reference).constant,
            resolveRange: (bounds) =>
              affineRange(sheet, {
                start: {
                  ...bounds.start,
                  ...(bounds.sheetName ? { sheetName: bounds.sheetName } : {}),
                },
                end: {
                  ...bounds.end,
                  ...(bounds.sheetName ? { sheetName: bounds.sheetName } : {}),
                },
              }).map((entry) => entry.constant),
          },
        );
        return constant(readNumber(value, `${name} did not return a finite number.`));
      }
      case "identifier": {
        const name = getDefinedName(workbook, expression.name, sheet.id);
        if (!name)
          throw new PlanningFailure(
            "unsupported",
            `Planning does not support name ${expression.name}.`,
          );
        const count =
          (name.reference.end.row - name.reference.start.row + 1) *
          (name.reference.end.column - name.reference.start.column + 1);
        if (count !== 1)
          throw new PlanningFailure("unsupported", "Planning names must refer to one cell.");
        return affineCell({
          sheetId: name.reference.sheetId,
          address: cloneAddress(name.reference.start),
        });
      }
      default:
        throw new PlanningFailure(
          "unsupported",
          "Planning does not support this formula construct.",
        );
    }
  };

  const objective = affineCell(request.objective);
  const constraints = request.constraints.map((constraint) => {
    assertReference(workbook, constraint.left);
    if (!["lte", "gte", "eq"].includes(constraint.relation))
      throw new PlanningFailure("invalid", "A planning relation is invalid.", constraint.left);
    const left = affineCell(constraint.left);
    const right =
      typeof constraint.right === "number"
        ? constant(finite(constraint.right, "A planning bound must be finite."))
        : affineCell(constraint.right);
    const difference = add(left, right, -1);
    return {
      coefficients: difference.coefficients,
      relation: constraint.relation,
      rhs: -difference.constant,
    };
  });
  if (request.direction === "target") {
    const difference = objective;
    constraints.push({
      coefficients: difference.coefficients,
      relation: "eq",
      rhs: request.targetValue! - difference.constant,
    });
  }
  const signature = stable({
    objective: affineSerializable(objective),
    constraints: constraints.map((constraint) => ({
      ...constraint,
      coefficients: [...constraint.coefficients],
    })),
    variables,
    direction: request.direction,
    targetValue: request.targetValue,
    method: request.method ?? "simplex",
    workbook: workbookPlanningSignature(workbook),
  });
  return { variables, objective, constraints, signature };
}

function affineSerializable(value: Affine) {
  return {
    constant: value.constant,
    coefficients: [...value.coefficients].sort(([a], [b]) => a - b),
  };
}

type NonlinearModel = Readonly<{
  variables: readonly PlanningVariable[];
  signature: string;
}>;

/** A conservative whole-workbook fingerprint. It makes stale nonlinear plans fail closed. */
function workbookPlanningSignature(workbook: Workbook): unknown {
  return [...workbook.sheets.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((sheet) => ({
      id: sheet.id,
      protected: sheet.properties.protected,
      merges: sheet.mergedCells,
      cells: [...sheet.cells.entries()].sort(([left], [right]) => left.localeCompare(right)),
    }));
}

function buildNonlinearModel(workbook: Workbook, request: PlanningRequest): NonlinearModel {
  if (!Array.isArray(request.variables) || !request.variables.length)
    throw new PlanningFailure("invalid", "Planning requires at least one changing cell.");
  if (request.variables.length > MAX_VARIABLES)
    throw new PlanningFailure(
      "limit",
      `Planning supports at most ${MAX_VARIABLES} changing cells.`,
    );
  if (!Array.isArray(request.constraints) || request.constraints.length > MAX_CONSTRAINTS)
    throw new PlanningFailure("limit", `Planning supports at most ${MAX_CONSTRAINTS} constraints.`);
  if (!["maximize", "minimize", "target"].includes(request.direction))
    throw new PlanningFailure("invalid", "Planning direction is invalid.");
  if (request.direction === "target" && !Number.isFinite(request.targetValue))
    throw new PlanningFailure("invalid", "A target value is required for target planning.");
  if (
    request.timeLimitMs !== undefined &&
    (!Number.isFinite(request.timeLimitMs) || request.timeLimitMs <= 0)
  )
    throw new PlanningFailure("invalid", "Planning time limit must be finite.");
  const variables = request.variables.map((variable) => ({
    ...variable,
    cell: cloneReference(variable.cell),
  }));
  const spillKeys = spillProjectionKeys(workbook);
  const seen = new Set<string>();
  for (const variable of variables) {
    const sheet = assertReference(workbook, variable.cell);
    if (!["continuous", "integer", "binary"].includes(variable.kind))
      throw new PlanningFailure("invalid", "A planning variable kind is invalid.", variable.cell);
    if (
      (variable.lower !== undefined && !Number.isFinite(variable.lower)) ||
      (variable.upper !== undefined && !Number.isFinite(variable.upper)) ||
      (variable.lower !== undefined &&
        variable.upper !== undefined &&
        variable.lower > variable.upper)
    )
      throw new PlanningFailure("invalid", "A planning variable bound is invalid.", variable.cell);
    if (
      variable.kind === "binary" &&
      ((variable.lower !== undefined && variable.lower < 0) ||
        (variable.upper !== undefined && variable.upper > 1))
    )
      throw new PlanningFailure(
        "invalid",
        "Binary variables must remain between zero and one.",
        variable.cell,
      );
    if (sheet.properties.protected)
      throw new PlanningFailure(
        "invalid",
        "A changing cell is on a protected sheet.",
        variable.cell,
      );
    if (sheet.mergedCells.some((range) => contains(range, variable.cell.address)))
      throw new PlanningFailure("invalid", "A changing cell cannot be merged.", variable.cell);
    if (spillKeys.has(keyOf(variable.cell)))
      throw new PlanningFailure(
        "invalid",
        "A changing cell cannot be a spill result.",
        variable.cell,
      );
    const content = sheet.cells.get(createCellKey(variable.cell.address))?.content;
    if (content?.kind === "formula")
      throw new PlanningFailure(
        "invalid",
        "A changing cell cannot contain a formula.",
        variable.cell,
      );
    if (
      content &&
      (content.kind !== "literal" ||
        typeof content.value !== "number" ||
        !Number.isFinite(content.value))
    )
      throw new PlanningFailure(
        "invalid",
        "A changing cell must contain a finite number or be blank.",
        variable.cell,
      );
    if (seen.has(keyOf(variable.cell)))
      throw new PlanningFailure("invalid", "Changing cells must be unique.", variable.cell);
    seen.add(keyOf(variable.cell));
  }
  const checked = [
    request.objective,
    ...request.constraints.flatMap((constraint) => [
      constraint.left,
      ...(typeof constraint.right === "number" ? [] : [constraint.right]),
    ]),
  ];
  for (const reference of checked) {
    assertReference(workbook, reference);
    if (hasVolatileDependency(workbook, reference))
      throw new PlanningFailure(
        "unsupported",
        "Planning cannot optimize volatile or dynamic formulas.",
        reference,
      );
  }
  for (const constraint of request.constraints)
    if (!["lte", "gte", "eq"].includes(constraint.relation))
      throw new PlanningFailure("invalid", "A planning relation is invalid.", constraint.left);
  return {
    variables,
    signature: stable({
      request: { ...request, method: request.method ?? "simplex" },
      workbook: workbookPlanningSignature(workbook),
    }),
  };
}

type NonlinearEvaluation = Readonly<{ objective: number; residuals: readonly number[] }>;

/** Evaluates a candidate in a detached workbook, leaving the user workbook untouched. */
function evaluateNonlinearWorkbook(
  workbook: Workbook,
  request: PlanningRequest,
  changes: readonly PlanningChange[],
): NonlinearEvaluation | undefined {
  const sheets = new Map(workbook.sheets);
  const copies = new Map<string, Sheet>();
  for (const change of changes) {
    const source = workbook.sheets.get(change.sheetId);
    if (!source || !Number.isFinite(change.value)) return undefined;
    let copy = copies.get(change.sheetId);
    if (!copy) {
      copy = { ...source, cells: new Map(source.cells) };
      copies.set(change.sheetId, copy);
      sheets.set(copy.id, copy);
    }
    setCellContent(copy, change.address, { kind: "literal", value: change.value });
  }
  const shadow: Workbook = { ...workbook, sheets };
  const values = new Map<string, number>();
  const numeric = (reference: PlanningCellRef): number | undefined => {
    const cached = values.get(keyOf(reference));
    if (cached !== undefined) return cached;
    const value = createWorkbookEvaluator(shadow, reference.sheetId).getComputedValue(
      reference.address,
    );
    if (typeof value !== "number" || !Number.isFinite(value) || isFormulaError(value))
      return undefined;
    values.set(keyOf(reference), value);
    return value;
  };
  const objective = numeric(request.objective);
  if (objective === undefined) return undefined;
  const residuals: number[] = [];
  for (const constraint of request.constraints) {
    const left = numeric(constraint.left);
    const right =
      typeof constraint.right === "number" ? constraint.right : numeric(constraint.right);
    if (left === undefined || right === undefined || !Number.isFinite(right)) return undefined;
    residuals.push(constraint.relation === "gte" ? right - left : left - right);
  }
  if (request.direction === "target") residuals.push(objective - request.targetValue!);
  return { objective, residuals };
}

function failure(error: unknown): PlanningResult {
  if (error instanceof PlanningFailure)
    return {
      status: error.kind,
      changes: [],
      diagnostics: [
        { code: error.kind, message: error.message, ...(error.cell ? { cell: error.cell } : {}) },
      ],
    };
  return {
    status: "error",
    changes: [],
    diagnostics: [
      {
        code: "solver-error",
        message: error instanceof Error ? error.message : "Planning failed.",
      },
    ],
  };
}

function evaluate(value: Affine, changes: readonly PlanningChange[]): number {
  let result = value.constant;
  for (const [index, coefficient] of value.coefficients)
    result += coefficient * changes[index]!.value;
  return result;
}

function solutionViolation(
  built: BuiltModel,
  changes: readonly PlanningChange[],
): string | undefined {
  for (const [index, variable] of built.variables.entries()) {
    const value = changes[index]!.value;
    if (!Number.isFinite(value)) return "The solver returned a non-finite changing-cell value.";
    if (variable.lower !== undefined && value < variable.lower - EPSILON)
      return "The solver returned a value below its lower bound.";
    if (variable.upper !== undefined && value > variable.upper + EPSILON)
      return "The solver returned a value above its upper bound.";
    if (variable.kind !== "continuous" && Math.abs(value - Math.round(value)) > EPSILON)
      return "The solver returned a fractional discrete value.";
    if (variable.kind === "binary" && (value < -EPSILON || value > 1 + EPSILON))
      return "The solver returned a non-binary value.";
  }
  for (const constraint of built.constraints) {
    let activity = 0;
    for (const [index, coefficient] of constraint.coefficients)
      activity += coefficient * changes[index]!.value;
    if (
      (constraint.relation === "lte" && activity > constraint.rhs + EPSILON) ||
      (constraint.relation === "gte" && activity < constraint.rhs - EPSILON) ||
      (constraint.relation === "eq" && Math.abs(activity - constraint.rhs) > EPSILON)
    )
      return "The solver returned a solution that does not satisfy every constraint.";
  }
  return undefined;
}

/** Recalculate the actual workbook formulas in a detached shadow before accepting a plan. */
function actualWorkbookViolation(
  workbook: Workbook,
  built: BuiltModel,
  request: PlanningRequest,
  changes: readonly PlanningChange[],
): string | undefined {
  const sheets = new Map(workbook.sheets);
  const copies = new Map<string, Sheet>();
  for (const change of changes) {
    const source = workbook.sheets.get(change.sheetId);
    if (!source) return "A changing-cell sheet no longer exists.";
    let copy = copies.get(change.sheetId);
    if (!copy) {
      copy = { ...source, cells: new Map(source.cells) };
      copies.set(change.sheetId, copy);
      sheets.set(copy.id, copy);
    }
    setCellContent(copy, change.address, { kind: "literal", value: change.value });
  }
  const shadow: Workbook = { ...workbook, sheets };
  const evaluators = new Map<string, ReturnType<typeof createWorkbookEvaluator>>();
  const numeric = (reference: PlanningCellRef): number | undefined => {
    const evaluator =
      evaluators.get(reference.sheetId) ?? createWorkbookEvaluator(shadow, reference.sheetId);
    evaluators.set(reference.sheetId, evaluator);
    const value = evaluator.getComputedValue(reference.address);
    return typeof value === "number" && Number.isFinite(value) && !isFormulaError(value)
      ? value
      : undefined;
  };
  const objective = numeric(request.objective);
  if (objective === undefined)
    return "The workbook objective does not recalculate to a finite number.";
  for (const constraint of request.constraints) {
    const left = numeric(constraint.left);
    const right =
      typeof constraint.right === "number" ? constraint.right : numeric(constraint.right);
    if (left === undefined || right === undefined)
      return "A planning constraint does not recalculate to a finite number.";
    if (
      (constraint.relation === "lte" && left > right + EPSILON) ||
      (constraint.relation === "gte" && left < right - EPSILON) ||
      (constraint.relation === "eq" && Math.abs(left - right) > EPSILON)
    )
      return "The recalculated workbook does not satisfy every planning constraint.";
  }
  if (request.direction === "target" && Math.abs(objective - request.targetValue!) > EPSILON)
    return "The recalculated workbook does not reach the requested target.";
  const affineObjective = evaluate(built.objective, changes);
  if (Math.abs(affineObjective - objective) > EPSILON * Math.max(1, Math.abs(objective)))
    return "The workbook objective differs from the extracted linear model.";
  return undefined;
}

/** Solves only formulas that can be proven affine in the declared changing cells. */
function solveSimplexPlanning(workbook: Workbook, request: PlanningRequest): PlanningResult {
  let built: BuiltModel;
  try {
    built = buildModel(workbook, request);
  } catch (error) {
    return failure(error);
  }
  const model: ModelDefinition = {
    optimize: "objective",
    opType: request.direction === "minimize" ? "min" : "max",
    constraints: {},
    variables: {},
    options: {
      timeout: Math.min(MAX_SOLVE_TIME_MS, Math.max(1, request.timeLimitMs ?? MAX_SOLVE_TIME_MS)),
      presolve: true,
    },
  };
  const ids = built.variables.map((_, index) => `v${index}`);
  for (const [index, variable] of built.variables.entries()) {
    const id = ids[index]!;
    const coefficients: Record<string, number> = {
      objective:
        request.direction === "target" ? 0 : (built.objective.coefficients.get(index) ?? 0),
    };
    model.variables[id] = coefficients;
    if (variable.kind === "integer") (model.ints ??= {})[id] = 1;
    if (variable.kind === "binary") (model.binaries ??= {})[id] = 1;
    if (variable.kind !== "binary" && (variable.lower === undefined || variable.lower < 0))
      (model.unrestricted ??= {})[id] = 1;
    const lower = variable.kind === "binary" ? Math.max(0, variable.lower ?? 0) : variable.lower;
    const upper = variable.kind === "binary" ? Math.min(1, variable.upper ?? 1) : variable.upper;
    if (lower !== undefined) {
      const name = `lower_${index}`;
      model.constraints[name] = { min: lower };
      coefficients[name] = 1;
    }
    if (upper !== undefined) {
      const name = `upper_${index}`;
      model.constraints[name] = { max: upper };
      coefficients[name] = 1;
    }
  }
  for (const [constraintIndex, constraint] of built.constraints.entries()) {
    const name = `constraint_${constraintIndex}`;
    model.constraints[name] =
      constraint.relation === "lte"
        ? { max: constraint.rhs }
        : constraint.relation === "gte"
          ? { min: constraint.rhs }
          : { equal: constraint.rhs };
    for (const [variableIndex, coefficient] of constraint.coefficients)
      model.variables[ids[variableIndex]!]![name] = coefficient;
  }
  const started = Date.now();
  let raw: SolveResult;
  try {
    // The package's NodeNext declaration is surfaced as a CommonJS namespace by
    // TypeScript although its ESM/browser entry exports this default solver object.
    raw = (
      solver as unknown as {
        Solve: (definition: ModelDefinition, precision?: number) => SolveResult;
      }
    ).Solve(model, 1e-12);
  } catch (error) {
    return failure(error);
  }
  const elapsedMs = Date.now() - started;
  if (!raw.feasible)
    return {
      status: "infeasible",
      changes: [],
      diagnostics: [],
      elapsedMs,
      modelSignature: built.signature,
    };
  if (raw.bounded === false)
    return {
      status: "unbounded",
      changes: [],
      diagnostics: [],
      elapsedMs,
      modelSignature: built.signature,
    };
  const changes = built.variables.map((variable, index) => {
    const rawValue = Number(raw[ids[index]!] ?? 0);
    const value = variable.kind === "continuous" ? rawValue : Math.round(rawValue);
    return {
      sheetId: variable.cell.sheetId,
      address: cloneAddress(variable.cell.address),
      value,
    };
  });
  const violation = solutionViolation(built, changes);
  if (violation)
    return {
      status: "error",
      changes: [],
      diagnostics: [{ code: "invalid-solution", message: violation }],
      elapsedMs,
    };
  const actualViolation = actualWorkbookViolation(workbook, built, request, changes);
  if (actualViolation)
    return {
      status: "error",
      changes: [],
      diagnostics: [{ code: "actual-workbook-mismatch", message: actualViolation }],
      elapsedMs,
    };
  const hasDiscrete = built.variables.some((variable) => variable.kind !== "continuous");
  const limit = Math.min(MAX_SOLVE_TIME_MS, Math.max(1, request.timeLimitMs ?? MAX_SOLVE_TIME_MS));
  const status: PlanningStatus =
    elapsedMs >= limit ? "limit" : hasDiscrete ? "feasible" : "optimal";
  const objectiveValue = evaluate(built.objective, changes);
  return {
    status,
    changes,
    diagnostics:
      status === "feasible"
        ? [
            {
              code: "feasible-not-proven-optimal",
              message: "A feasible integer solution was found; optimality is not proven.",
            },
          ]
        : status === "limit"
          ? [
              {
                code: "time-limit",
                message: "Planning reached its time limit after finding a feasible solution.",
              },
            ]
          : [],
    objectiveValue,
    ...(request.direction === "target"
      ? { targetResidual: objectiveValue - request.targetValue! }
      : {}),
    elapsedMs,
    modelSignature: built.signature,
  };
}

function nonlinearViolation(
  workbook: Workbook,
  request: PlanningRequest,
  built: NonlinearModel,
  changes: readonly PlanningChange[],
): string | undefined {
  if (changes.length !== built.variables.length) return "Planning returned an incomplete solution.";
  for (const [index, variable] of built.variables.entries()) {
    const change = changes[index]!;
    if (keyOf(change) !== keyOf(variable.cell) || !Number.isFinite(change.value))
      return "Planning returned an invalid changing-cell value.";
    if (variable.lower !== undefined && change.value < variable.lower - EPSILON)
      return "The solver returned a value below its lower bound.";
    if (variable.upper !== undefined && change.value > variable.upper + EPSILON)
      return "The solver returned a value above its upper bound.";
    if (
      variable.kind !== "continuous" &&
      Math.abs(change.value - Math.round(change.value)) > EPSILON
    )
      return "The solver returned a fractional discrete value.";
    if (variable.kind === "binary" && (change.value < -EPSILON || change.value > 1 + EPSILON))
      return "The solver returned a non-binary value.";
  }
  const evaluated = evaluateNonlinearWorkbook(workbook, request, changes);
  if (!evaluated) return "The workbook does not recalculate to finite numeric planning values.";
  for (const [index, constraint] of request.constraints.entries()) {
    const residual = evaluated.residuals[index]!;
    if (
      (constraint.relation === "eq" && Math.abs(residual) > 1e-6) ||
      (constraint.relation !== "eq" && residual > 1e-6)
    )
      return "The recalculated workbook does not satisfy every planning constraint.";
  }
  if (request.direction === "target" && Math.abs(evaluated.objective - request.targetValue!) > 1e-6)
    return "The recalculated workbook does not reach the requested target.";
  return undefined;
}

function solveNonlinearPlanning(
  workbook: Workbook,
  request: PlanningRequest,
  method: "grg" | "evolutionary",
): PlanningResult {
  let built: NonlinearModel;
  try {
    built = buildNonlinearModel(workbook, request);
  } catch (error) {
    return failure(error);
  }
  const limit = Math.min(MAX_SOLVE_TIME_MS, Math.max(1, request.timeLimitMs ?? MAX_SOLVE_TIME_MS));
  const deadlineMs = Date.now() + limit;
  const initial = built.variables.map((variable) => {
    const content = workbook.sheets
      .get(variable.cell.sheetId)!
      .cells.get(createCellKey(variable.cell.address))?.content;
    return content?.kind === "literal" ? (content.value as number) : 0;
  });
  const bounds = built.variables.map((variable, index) => ({
    lower:
      variable.kind === "binary"
        ? Math.max(0, variable.lower ?? 0)
        : (variable.lower ?? -1_000_000),
    upper:
      variable.kind === "binary" ? Math.min(1, variable.upper ?? 1) : (variable.upper ?? 1_000_000),
    kind: variable.kind,
    initial: initial[index]!,
  }));
  if (
    (method === "evolutionary" || method === "grg") &&
    built.variables.some(
      (variable) =>
        variable.kind !== "binary" &&
        (variable.lower === undefined || variable.upper === undefined),
    )
  )
    return {
      status: "invalid",
      changes: [],
      modelSignature: built.signature,
      diagnostics: [
        {
          code: "finite-bounds-required",
          message: `${method === "grg" ? "GRG Nonlinear" : "Evolutionary"} solving requires a finite lower and upper bound for every changing cell.`,
        },
      ],
    };
  const changesAt = (point: readonly number[]): PlanningChange[] =>
    built.variables.map((variable, index) => ({
      sheetId: variable.cell.sheetId,
      address: cloneAddress(variable.cell.address),
      value: point[index]!,
    }));
  const evaluate = (point: readonly number[]) => {
    const actual = evaluateNonlinearWorkbook(workbook, request, changesAt(point));
    if (!actual)
      return { objective: Number.MAX_VALUE, equalities: [Number.MAX_VALUE], inequalities: [] };
    const equalities: number[] = [];
    const inequalities: number[] = [];
    for (const [index, constraint] of request.constraints.entries())
      (constraint.relation === "eq" ? equalities : inequalities).push(actual.residuals[index]!);
    if (request.direction === "target") equalities.push(actual.objective - request.targetValue!);
    return {
      objective:
        request.direction === "maximize"
          ? -actual.objective
          : request.direction === "target"
            ? (actual.objective - request.targetValue!) ** 2
            : actual.objective,
      equalities,
      inequalities,
    };
  };
  const started = Date.now();
  const grgModel = {
    bounds: bounds.map(({ lower, upper }) => ({ lower, upper })),
    initial,
    evaluate,
  };
  const raw =
    method === "grg"
      ? built.variables.some((variable) => variable.kind !== "continuous")
        ? solveMixedGrg(
            grgModel,
            built.variables.map((variable) => variable.kind),
            { deadlineMs },
          )
        : solveGrg(grgModel, { deadlineMs })
      : undefined;
  const evolutionary =
    method === "evolutionary"
      ? solveEvolutionary(
          {
            bounds: bounds.map(({ lower, upper, kind }) => ({ lower, upper, kind })),
            initial,
            evaluate,
          },
          { deadlineMs },
        )
      : undefined;
  const elapsedMs = Date.now() - started;
  const status = raw?.status ?? evolutionary!.status;
  const point = raw?.point ?? evolutionary?.vector;
  if (!point || status === "error")
    return {
      status: status === "error" ? "error" : status === "infeasible" ? "infeasible" : "limit",
      changes: [],
      elapsedMs,
      modelSignature: built.signature,
      diagnostics:
        status === "limit"
          ? [
              {
                code: "time-limit",
                message: "The solver stopped before finding a verified feasible solution.",
              },
            ]
          : [],
    };
  const changes = changesAt(
    point.map((value, index) =>
      built.variables[index]!.kind === "continuous" ? value : Math.round(value),
    ),
  );
  const violation = nonlinearViolation(workbook, request, built, changes);
  if (violation)
    return {
      status: "error",
      changes: [],
      elapsedMs,
      modelSignature: built.signature,
      diagnostics: [{ code: "invalid-solution", message: violation }],
    };
  const actual = evaluateNonlinearWorkbook(workbook, request, changes)!;
  return {
    status: "feasible",
    changes,
    objectiveValue: actual.objective,
    ...(request.direction === "target"
      ? { targetResidual: actual.objective - request.targetValue! }
      : {}),
    elapsedMs,
    modelSignature: built.signature,
    diagnostics:
      status === "limit"
        ? [
            {
              code: "time-limit",
              message: "The solver reached its time limit after finding a feasible solution.",
            },
          ]
        : [
            {
              code: method === "grg" ? "local-solution" : "heuristic-solution",
              message:
                method === "grg"
                  ? "GRG found a locally feasible solution; global optimality is not proven."
                  : "Evolutionary solving found a feasible solution; global optimality is not proven.",
            },
          ],
  };
}

/** Dispatches to Simplex LP, GRG Nonlinear, or Evolutionary Solver. */
export function solvePlanning(workbook: Workbook, request: PlanningRequest): PlanningResult {
  const method = request.method ?? "simplex";
  if (method === "simplex") return solveSimplexPlanning(workbook, request);
  if (method === "grg" || method === "evolutionary")
    return solveNonlinearPlanning(workbook, request, method);
  return {
    status: "invalid",
    changes: [],
    diagnostics: [{ code: "invalid-method", message: "Planning method is invalid." }],
  };
}

/** Revalidates a detached solution and creates one undoable, checked final write. */
export function createApplyPlanningCommand(
  workbook: Workbook,
  request: PlanningRequest,
  result: PlanningResult,
): ApplyPlanningCommandResult {
  if (result.status !== "optimal" && result.status !== "feasible")
    return {
      ok: false,
      reason: "not-solved",
      message: "Planning did not produce an applicable solution.",
    };
  let built: BuiltModel | NonlinearModel;
  try {
    built =
      (request.method ?? "simplex") === "simplex"
        ? buildModel(workbook, request)
        : buildNonlinearModel(workbook, request);
  } catch {
    return {
      ok: false,
      reason: "stale-solution",
      message: "The planning model changed before it could be applied.",
    };
  }
  if (!result.modelSignature || result.modelSignature !== built.signature)
    return {
      ok: false,
      reason: "stale-solution",
      message: "The planning model changed before it could be applied.",
    };
  if (result.changes.length !== built.variables.length)
    return {
      ok: false,
      reason: "invalid-result",
      message: "Planning returned an incomplete solution.",
    };
  for (const [index, change] of result.changes.entries()) {
    const variable = built.variables[index]!;
    if (keyOf(change) !== keyOf(variable.cell) || !Number.isFinite(change.value))
      return {
        ok: false,
        reason: "invalid-result",
        message: "Planning returned an invalid changing-cell value.",
      };
    const sheet = workbook.sheets.get(change.sheetId)!;
    if (sheet.properties.protected)
      return {
        ok: false,
        reason: "protected-sheet",
        message: "A changing cell is on a protected sheet.",
      };
    const anchor = new MergedCellRangeResolver(sheet.mergedCells).getAnchor(change.address);
    if (anchor && (anchor.row !== change.address.row || anchor.column !== change.address.column))
      return {
        ok: false,
        reason: "merged-tail",
        message: "A changing cell is inside a merged cell.",
      };
    if (
      variable.kind !== "continuous" &&
      Math.abs(change.value - Math.round(change.value)) > EPSILON
    )
      return {
        ok: false,
        reason: "invalid-result",
        message: "Planning returned a non-integer discrete value.",
      };
    if (variable.kind === "binary" && (change.value < -EPSILON || change.value > 1 + EPSILON))
      return {
        ok: false,
        reason: "invalid-result",
        message: "Planning returned an invalid binary value.",
      };
  }
  const violation =
    (request.method ?? "simplex") === "simplex"
      ? solutionViolation(built as BuiltModel, result.changes)
      : nonlinearViolation(workbook, request, built as NonlinearModel, result.changes);
  if (violation) return { ok: false, reason: "invalid-result", message: violation };
  const actualViolation =
    (request.method ?? "simplex") === "simplex"
      ? actualWorkbookViolation(workbook, built as BuiltModel, request, result.changes)
      : undefined;
  if (actualViolation) return { ok: false, reason: "invalid-result", message: actualViolation };
  const changes = result.changes.map((change) => ({
    sheetId: change.sheetId,
    address: cloneAddress(change.address),
    content: { kind: "literal" as const, value: change.value },
  }));
  const command = createBatchSetCellContentsCommand(changes);
  try {
    assertFillDataValidation(workbook, command);
  } catch (error) {
    return {
      ok: false,
      reason: "data-validation",
      message: error instanceof Error ? error.message : "The solution violates data validation.",
    };
  }
  const duplicate = validateDuplicateEntries(workbook, changes);
  if (!duplicate.valid)
    return {
      ok: false,
      reason: "duplicate-entry",
      message: "The solution violates a duplicate-entry rule.",
    };
  return { ok: true, command };
}
