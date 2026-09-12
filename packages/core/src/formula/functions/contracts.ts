import type { ExcelDateParts, ExcelDateSystem } from "../date-system.js";
import type { FormulaAddress, FormulaRangeBounds, FormulaValue } from "../types.js";

export type FormulaFunctionArgumentMetadata = Readonly<{ name: string; optional?: boolean }>;

/** Runtime-neutral information suitable for formula completion and argument help. */
export type FormulaFunctionMetadata = Readonly<{
  name: string;
  category: string;
  minArgs: number;
  maxArgs: number | null;
  arguments: readonly FormulaFunctionArgumentMetadata[];
  lazy: boolean;
}>;

/** A range is enumerated in row-major order. getValue uses sheet coordinates. */
export type FormulaFunctionArgument =
  | Readonly<{
      kind: "scalar";
      value: FormulaValue;
      source: "literal" | "reference" | "expression";
      /** Present for a direct cell reference when a function needs its anchor. */
      address?: FormulaAddress;
      getValue?: (row: number, column: number) => FormulaValue;
    }>
  | Readonly<{
      kind: "range";
      values: Iterable<FormulaValue>;
      bounds?: FormulaRangeBounds;
      getValue?: (row: number, column: number) => FormulaValue;
    }>;

/** Arguments are evaluated only when the function requests them. */
export type FormulaFunctionContext = Readonly<{
  argumentCount: number;
  evaluateArgument: (index: number) => FormulaFunctionArgument;
  /** Workbook-local calculation options supplied by the evaluator. */
  dateSystem?: ExcelDateSystem;
  /** Clock injection keeps volatile functions deterministic for callers that need it. */
  now?: () => ExcelDateParts;
}>;

export type FormulaFunctionDefinition = Readonly<{
  metadata: FormulaFunctionMetadata;
  evaluate: (context: FormulaFunctionContext) => FormulaValue;
  selectDependencyArguments?: (context: FormulaFunctionContext) => readonly number[];
}>;

export type FormulaFunctionRegistry = Readonly<{
  get: (name: string) => FormulaFunctionDefinition | undefined;
  list: () => readonly FormulaFunctionMetadata[];
}>;
