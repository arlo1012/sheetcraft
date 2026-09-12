import type { ExcelDateParts, ExcelDateSystem } from "../date-system.js";
import type {
  FormulaAddress,
  FormulaRangeBounds,
  FormulaRuntimeValue,
  FormulaValue,
} from "../types.js";

export type FormulaRangeEntry = Readonly<{
  address: FormulaAddress;
  value: FormulaValue;
  hidden: boolean;
  filtered: boolean;
  nestedSubtotal: boolean;
}>;

export type FormulaFunctionArgumentMetadata = Readonly<{ name: string; optional?: boolean }>;

/** Runtime-neutral information suitable for formula completion and argument help. */
export type FormulaFunctionMetadata = Readonly<{
  name: string;
  category: string;
  minArgs: number;
  maxArgs: number | null;
  arguments: readonly FormulaFunctionArgumentMetadata[];
  lazy: boolean;
  /** The function can return a dynamic array without an array input. */
  arrayResult?: boolean;
}>;

/** A range is enumerated in row-major order. getValue uses sheet coordinates. */
export type FormulaFunctionArgument =
  | Readonly<{
      kind: "scalar";
      /**
       * An expression argument may produce a dynamic array. Functions that
       * need one value should use `scalar()`; array-aware functions can retain
       * the complete runtime value.
       */
      value: FormulaRuntimeValue;
      source: "literal" | "reference" | "expression" | "omitted";
      /** Present for a direct cell reference when a function needs its anchor. */
      address?: FormulaAddress;
      getValue?: (row: number, column: number) => FormulaValue;
      entries?: Iterable<FormulaRangeEntry>;
    }>
  | Readonly<{
      kind: "range";
      values: Iterable<FormulaValue>;
      entries?: Iterable<FormulaRangeEntry>;
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
  address?: FormulaAddress;
}>;

export type FormulaFunctionDefinition = Readonly<{
  metadata: FormulaFunctionMetadata;
  evaluate: (context: FormulaFunctionContext) => FormulaRuntimeValue;
  selectDependencyArguments?: (context: FormulaFunctionContext) => readonly number[];
}>;

export type FormulaFunctionRegistry = Readonly<{
  get: (name: string) => FormulaFunctionDefinition | undefined;
  list: () => readonly FormulaFunctionMetadata[];
}>;
