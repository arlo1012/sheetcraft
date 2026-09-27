import { computed, nextTick, ref, watch } from "vue";
import {
  createApplyGoalSeekCommand,
  type GoalSeekRequest,
  type GoalSeekResult,
} from "@idea10/core/goal-seek";
import {
  createApplyPlanningCommand,
  type PlanningRequest,
  type PlanningResult,
} from "@idea10/core/planning-solver";
import type { WorkbookCommand } from "@idea10/core/commands";
import {
  getActiveSheet,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { runSimulation } from "./simulation-runner";
import type { SimulationMessageKey } from "./simulation-messages";
import type {
  GoalSeekDraft,
  PlanningConstraintDraft,
  PlanningDraft,
  SimulationDialog,
  SimulationResult,
} from "./simulation-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange; address: CellAddress };
  getGeneration: () => number;
  getRevision?: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
  recalculate?: () => void;
};
type Snapshot = { workbook: Workbook; generation: number; revision: number; sheetId: string };
type SolveState =
  | { snapshot: Snapshot; request: GoalSeekRequest; result: GoalSeekResult }
  | { snapshot: Snapshot; request: PlanningRequest; result: PlanningResult };
type PlanningRequestBuild =
  | { request: PlanningRequest }
  | { error: "simulation.invalidReference" | "simulation.constraintVariableRequired" };
type PlanningVariable = PlanningRequest["variables"][number];
const EMPTY_GOAL = (): GoalSeekDraft => ({ formulaCell: "", targetValue: "", changingCell: "" });
let sequence = 0;
const EMPTY_PLANNING = (): PlanningDraft => ({
  objective: "",
  direction: "maximize",
  method: "simplex",
  targetValue: "",
  variables: [{ id: `variable-${++sequence}`, cell: "", kind: "continuous", lower: "", upper: "" }],
  constraints: [],
  nonnegative: true,
});
const asNumber = (value: string): number | undefined => {
  const result = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(result) ? result : undefined;
};
const sameCell = (range: CellRange) =>
  range.start.row === range.end.row && range.start.column === range.end.column;

export function useSimulationController(options: Options) {
  const { t } = useAppI18n();
  const dialog = ref<SimulationDialog>();
  const busy = ref(false);
  const error = ref("");
  const result = ref<SimulationResult>();
  const goalSeekDraft = ref(EMPTY_GOAL());
  const planningDraft = ref(EMPTY_PLANNING());
  let solved: SolveState | undefined;
  let referenceSheetId: string | undefined;
  const activeSheet = computed(() => getActiveSheet(options.getWorkbook()));
  const disabled = computed(() => options.isBusy() || activeSheet.value.properties.protected);
  const tr = (key: SimulationMessageKey) => t(key);
  function snapshot(): Snapshot | undefined {
    if (disabled.value || !options.flush()) return undefined;
    const workbook = options.getWorkbook();
    const sheetId = referenceSheetId ?? getActiveSheet(workbook).id;
    return workbook.sheets.has(sheetId)
      ? {
          workbook,
          generation: options.getGeneration(),
          revision: options.getRevision?.() ?? options.getGeneration(),
          sheetId,
        }
      : undefined;
  }
  function isCurrent(value: Snapshot) {
    return (
      value.workbook === options.getWorkbook() &&
      value.generation === options.getGeneration() &&
      value.revision === (options.getRevision?.() ?? options.getGeneration()) &&
      options.getWorkbook().sheets.has(value.sheetId)
    );
  }
  function format(sheetId: string, address: CellAddress) {
    const sheet = options.getWorkbook().sheets.get(sheetId);
    return sheet ? formatRangeReference(sheet.name, { start: address, end: address }) : "";
  }
  function resolveCell(
    source: string,
    target: Snapshot,
  ): { sheetId: string; address: CellAddress } | undefined {
    const reference = resolveRangeReference(target.workbook, source, target.sheetId);
    return reference && sameCell(reference.range)
      ? { sheetId: reference.sheetId, address: { ...reference.range.start } }
      : undefined;
  }
  function openGoalSeek() {
    referenceSheetId = getActiveSheet(options.getWorkbook()).id;
    const target = snapshot();
    if (!target) return;
    const cell = format(target.sheetId, options.getSelection().address);
    goalSeekDraft.value = { formulaCell: cell, targetValue: "", changingCell: cell };
    planningDraft.value = EMPTY_PLANNING();
    error.value = "";
    result.value = undefined;
    solved = undefined;
    dialog.value = "goalSeek";
  }
  function openPlanning() {
    referenceSheetId = getActiveSheet(options.getWorkbook()).id;
    const target = snapshot();
    if (!target) return;
    const cell = format(target.sheetId, options.getSelection().address);
    const initial = EMPTY_PLANNING();
    planningDraft.value = {
      ...initial,
      objective: cell,
      variables: [{ ...initial.variables[0]!, cell }],
    };
    error.value = "";
    result.value = undefined;
    solved = undefined;
    dialog.value = "planning";
  }
  function close() {
    if (busy.value) return;
    dialog.value = undefined;
    result.value = undefined;
    solved = undefined;
    error.value = "";
    referenceSheetId = undefined;
    void nextTick(options.focusSheet);
  }
  function planningRequest(draft: PlanningDraft, target: Snapshot): PlanningRequestBuild {
    const objective = resolveCell(draft.objective, target);
    const targetValue = draft.direction === "target" ? asNumber(draft.targetValue) : undefined;
    if (!objective || (draft.direction === "target" && targetValue === undefined))
      return { error: "simulation.invalidReference" };
    const variables: PlanningVariable[] = [];
    const variableIndexes = new Map<string, number>();
    for (const item of draft.variables) {
      const cells = expand(item.cell, target, 50);
      const lower = asOptionalNumber(item.lower);
      const upper = asOptionalNumber(item.upper);
      if (!cells || lower === false || upper === false || variables.length + cells.length > 50)
        return { error: "simulation.invalidReference" };
      for (const cell of cells) {
        const key = cellKey(cell);
        if (variableIndexes.has(key)) return { error: "simulation.invalidReference" };
        variableIndexes.set(key, variables.length);
        variables.push({
          cell,
          kind: item.kind,
          ...(lower === undefined && draft.nonnegative
            ? { lower: 0 }
            : lower === undefined
              ? {}
              : { lower }),
          ...(upper === undefined ? {} : { upper }),
        });
      }
    }
    if (!variables.length) return { error: "simulation.invalidReference" };
    const constraints: Array<PlanningRequest["constraints"][number]> = [];
    for (const item of draft.constraints) {
      const error = appendConstraints(constraints, variables, variableIndexes, item, target);
      if (error) return { error };
    }
    return {
      request: {
        objective,
        direction: draft.direction,
        method: draft.method,
        ...(targetValue === undefined ? {} : { targetValue }),
        variables,
        constraints,
        timeLimitMs: 3000,
      },
    };
  }
  function expand(
    source: string,
    target: Snapshot,
    cap: number,
  ): Array<{ sheetId: string; address: CellAddress }> | undefined {
    const reference = resolveRangeReference(target.workbook, source, target.sheetId);
    if (!reference) return undefined;
    const values = [];
    for (let row = reference.range.start.row; row <= reference.range.end.row; row++)
      for (
        let column = reference.range.start.column;
        column <= reference.range.end.column;
        column++
      ) {
        if (values.length >= cap) return undefined;
        values.push({ sheetId: reference.sheetId, address: { row, column } });
      }
    return values;
  }
  function asOptionalNumber(value: string): number | undefined | false {
    if (!value.trim()) return undefined;
    const number = asNumber(value);
    return number === undefined ? false : number;
  }
  function appendConstraints(
    destination: Array<PlanningRequest["constraints"][number]>,
    variables: PlanningVariable[],
    variableIndexes: ReadonlyMap<string, number>,
    item: PlanningConstraintDraft,
    target: Snapshot,
  ) {
    if (!item.left.trim() && !item.right.trim()) return undefined;
    const left = expand(item.left, target, 200);
    if (!left || destination.length + left.length > 200) return "simulation.invalidReference";
    if (item.relation === "integer" || item.relation === "binary") {
      for (const cell of left) {
        const index = variableIndexes.get(cellKey(cell));
        if (index === undefined) return "simulation.constraintVariableRequired";
        const variable = variables[index]!;
        variables[index] = {
          ...variable,
          kind: variable.kind === "binary" || item.relation === "binary" ? "binary" : "integer",
        };
      }
      return undefined;
    }
    const relation = item.relation;
    const scalar = asNumber(item.right);
    if (scalar !== undefined) {
      for (const cell of left) destination.push({ left: cell, relation, right: scalar });
      return undefined;
    }
    const right = expand(item.right, target, 200);
    if (!right || right.length !== left.length || !sameShape(item.left, item.right, target))
      return "simulation.invalidReference";
    left.forEach((cell, index) => destination.push({ left: cell, relation, right: right[index]! }));
    return undefined;
  }
  function cellKey(cell: { sheetId: string; address: CellAddress }) {
    return `${cell.sheetId}:${cell.address.row}:${cell.address.column}`;
  }
  function sameShape(left: string, right: string, target: Snapshot) {
    const first = resolveRangeReference(target.workbook, left, target.sheetId)?.range;
    const second = resolveRangeReference(target.workbook, right, target.sheetId)?.range;
    return Boolean(
      first &&
      second &&
      first.end.row - first.start.row === second.end.row - second.start.row &&
      first.end.column - first.start.column === second.end.column - second.start.column,
    );
  }
  async function solveGoalSeek(draft: GoalSeekDraft) {
    if (busy.value) return;
    const target = snapshot();
    if (!target) return;
    const formulaCell = resolveCell(draft.formulaCell, target),
      changingCell = resolveCell(draft.changingCell, target),
      targetValue = asNumber(draft.targetValue);
    if (!formulaCell || !changingCell || targetValue === undefined) {
      error.value =
        !formulaCell || !changingCell
          ? tr("simulation.invalidReference")
          : tr("simulation.invalidNumber");
      return;
    }
    const request: GoalSeekRequest = { target: formulaCell, variable: changingCell, targetValue };
    busy.value = true;
    error.value = "";
    result.value = undefined;
    try {
      const raw = (await runSimulation({
        kind: "goalSeek",
        workbook: target.workbook,
        request,
      })) as GoalSeekResult;
      if (!isCurrent(target)) {
        error.value = tr("simulation.stale");
        return;
      }
      const status =
        raw.status === "success"
          ? "optimal"
          : raw.status === "no-solution"
            ? "infeasible"
            : raw.status === "iteration-limit"
              ? "limit"
              : raw.status === "nondeterministic"
                ? "unsupported"
                : "invalid";
      result.value = {
        status,
        changes:
          raw.status === "success"
            ? [{ cell: format(changingCell.sheetId, changingCell.address), value: raw.value }]
            : [],
        objectiveValue: raw.achievedValue,
        targetResidual:
          raw.achievedValue === undefined ? undefined : raw.achievedValue - targetValue,
        diagnostics: [],
      };
      solved = { snapshot: target, request, result: raw };
    } catch {
      error.value = tr("simulation.solveFailed");
    } finally {
      busy.value = false;
    }
  }
  async function solvePlanning(draft: PlanningDraft) {
    if (busy.value) return;
    const target = snapshot();
    if (!target) return;
    const built = planningRequest(draft, target);
    if ("error" in built) {
      error.value = tr(built.error);
      return;
    }
    const { request } = built;
    busy.value = true;
    error.value = "";
    result.value = undefined;
    try {
      const raw = (await runSimulation({
        kind: "planning",
        workbook: target.workbook,
        request,
      })) as PlanningResult;
      if (!isCurrent(target)) {
        error.value = tr("simulation.stale");
        return;
      }
      result.value = {
        status: raw.status,
        changes: raw.changes.map((change) => ({
          cell: format(change.sheetId, change.address),
          value: change.value,
        })),
        objectiveValue: raw.objectiveValue,
        targetResidual: raw.targetResidual,
        diagnostics: raw.diagnostics.map((item) => diagnostic(item.code)),
      };
      solved = { snapshot: target, request, result: raw };
    } catch {
      error.value = tr("simulation.solveFailed");
    } finally {
      busy.value = false;
    }
  }
  function apply() {
    if (!solved || busy.value || options.isBusy() || !options.flush()) return;
    if (!isCurrent(solved.snapshot)) {
      error.value = tr("simulation.stale");
      return;
    }
    try {
      if ("variable" in solved.request) {
        const command = createApplyGoalSeekCommand(
          options.getWorkbook(),
          solved.request,
          solved.result as GoalSeekResult,
        );
        options.execute(command);
      } else {
        const applied = createApplyPlanningCommand(
          options.getWorkbook(),
          solved.request,
          solved.result as PlanningResult,
        );
        if (!applied.ok) {
          error.value = applyError(applied.reason);
          return;
        }
        options.execute(applied.command);
      }
      options.recalculate?.();
      close();
      options.focusSheet();
    } catch {
      error.value = tr("simulation.stale");
    }
  }
  function applyError(reason: string): string {
    return reason === "stale-solution"
      ? tr("simulation.stale")
      : reason === "not-solved" || reason === "invalid-result"
        ? tr("simulation.solveFailed")
        : tr("simulation.invalidReference");
  }
  function diagnostic(code: string): string {
    switch (code) {
      case "feasible-not-proven-optimal":
        return tr("simulation.feasibleNotOptimal");
      case "finite-bounds-required":
        return tr("simulation.finiteBoundsRequired");
      case "local-solution":
        return tr("simulation.localSolution");
      case "heuristic-solution":
        return tr("simulation.heuristicSolution");
      case "invalid-method":
        return tr("simulation.invalidMethod");
      case "volatile-model":
        return tr("simulation.volatileModel");
      case "time-limit":
      case "limit":
        return tr("simulation.statusLimit");
      case "unsupported":
        return tr("simulation.unsupportedModel");
      case "invalid":
        return tr("simulation.invalidReference");
      default:
        return tr("simulation.solveFailed");
    }
  }
  watch(options.getGeneration, () => {
    if (!dialog.value) return;
    result.value = undefined;
    solved = undefined;
    error.value = tr("simulation.stale");
    dialog.value = undefined;
    referenceSheetId = undefined;
  });
  watch(
    () => options.getRevision?.() ?? options.getGeneration(),
    () => {
      if (!dialog.value || !solved) return;
      result.value = undefined;
      solved = undefined;
      error.value = tr("simulation.stale");
    },
  );
  function updateGoalSeekDraft(draft: GoalSeekDraft) {
    if (JSON.stringify(goalSeekDraft.value) === JSON.stringify(draft)) return;
    goalSeekDraft.value = { ...draft };
    result.value = undefined;
    solved = undefined;
    error.value = "";
  }
  function updatePlanningDraft(draft: PlanningDraft) {
    if (JSON.stringify(planningDraft.value) === JSON.stringify(draft)) return;
    planningDraft.value = {
      ...draft,
      variables: draft.variables.map((item) => ({ ...item })),
      constraints: draft.constraints.map((item) => ({ ...item })),
    };
    result.value = undefined;
    solved = undefined;
    error.value = "";
  }
  return {
    simulationDialog: dialog,
    simulationBusy: busy,
    simulationError: error,
    simulationResult: result,
    simulationDisabled: disabled,
    goalSeekDraft,
    planningDraft,
    openGoalSeek,
    openPlanning,
    closeSimulation: close,
    solveGoalSeek,
    solvePlanning,
    applySimulation: apply,
    updateGoalSeekDraft,
    updatePlanningDraft,
  };
}
