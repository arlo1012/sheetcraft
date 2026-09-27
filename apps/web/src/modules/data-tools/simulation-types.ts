export type SimulationCellReference = string;

export type GoalSeekDraft = {
  formulaCell: SimulationCellReference;
  targetValue: string;
  changingCell: SimulationCellReference;
};

export type PlanningDirection = "maximize" | "minimize" | "target";
export type PlanningVariableKind = "continuous" | "integer" | "binary";
export type PlanningRelation = "lte" | "gte" | "eq";

export type PlanningVariableDraft = {
  id: string;
  cell: SimulationCellReference;
  kind: PlanningVariableKind;
  lower: string;
  upper: string;
};

export type PlanningConstraintDraft = {
  id: string;
  left: SimulationCellReference;
  relation: PlanningRelation;
  right: string;
};

export type PlanningDraft = {
  objective: SimulationCellReference;
  direction: PlanningDirection;
  targetValue: string;
  variables: PlanningVariableDraft[];
  constraints: PlanningConstraintDraft[];
  nonnegative: boolean;
};

export type SimulationSolveStatus =
  | "optimal"
  | "feasible"
  | "infeasible"
  | "unbounded"
  | "unsupported"
  | "invalid"
  | "limit"
  | "error";

export type SimulationResult = {
  status: SimulationSolveStatus;
  changes: Array<{ cell: SimulationCellReference; value: number }>;
  objectiveValue?: number;
  targetResidual?: number;
  diagnostics: readonly string[];
  exploredNodes?: number;
};

export type SimulationDialog = "goalSeek" | "planning" | undefined;
