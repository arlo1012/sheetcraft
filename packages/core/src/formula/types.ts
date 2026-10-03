export const MAX_FORMULA_ROWS = 1_048_576;
export const MAX_FORMULA_COLUMNS = 16_384;

export type FormulaScalar = string | number | boolean | null;

/** Canonical, locale-independent tokens. PARSE/CYCLE are product diagnostics. */
export const FORMULA_ERROR_TOKENS = {
  NULL: "#NULL!",
  DIV0: "#DIV/0!",
  VALUE: "#VALUE!",
  REF: "#REF!",
  NAME: "#NAME?",
  NUM: "#NUM!",
  NA: "#N/A",
  SPILL: "#SPILL!",
  CALC: "#CALC!",
  GETTING_DATA: "#GETTING_DATA",
  PARSE: "#PARSE!",
  CYCLE: "#CYCLE!",
} as const;

export type FormulaErrorCode = keyof typeof FORMULA_ERROR_TOKENS;

export type FormulaError = {
  kind: "formula-error";
  code: FormulaErrorCode;
};

export type FormulaValue = FormulaScalar | FormulaError;

/** A transient rectangular result. It is never persisted as cell content. */
export type FormulaArray = Readonly<{
  kind: "formula-array";
  rows: readonly (readonly FormulaValue[])[];
}>;
/** Internal evaluation result; public cell values remain FormulaValue scalars. */
export type FormulaRuntimeValue = FormulaValue | FormulaArray;

export type FormulaAxisRange = Readonly<{
  axis: "row" | "column";
  start: number;
  end: number;
  startAbsolute: boolean;
  endAbsolute: boolean;
  sheetName?: string;
  startOffset: number;
  endOffset: number;
}>;

export type CellFormula = {
  source: string;
};

/** A binary image resource owned by the Web storage adapter. */
export type CellImage = {
  assetId: string;
  altText: string;
  transform?: ImageTransform;
};

export type CellContent =
  | { kind: "literal"; value: Exclude<FormulaScalar, null> }
  | { kind: "error"; error: FormulaError }
  | { kind: "formula"; formula: CellFormula }
  | { kind: "image"; image: CellImage };

export type FormulaAddress = {
  row: number;
  column: number;
};

export type FormulaReference = FormulaAddress & {
  /** Written sheet qualifier, when the reference targets another sheet. */
  sheetName?: string;
  rowAbsolute: boolean;
  columnAbsolute: boolean;
  start: number;
  end: number;
};

export type FormulaRange = {
  start: FormulaReference;
  end: FormulaReference;
  startOffset: number;
  endOffset: number;
};

export type FormulaRangeBounds = {
  start: FormulaAddress;
  end: FormulaAddress;
};

export type StructuredReferenceScope = "data" | "all" | "headers" | "totals" | "this-row";

/** A parsed Excel table reference. Offsets point at the original formula source. */
export type StructuredFormulaReference = {
  /** Omitted for an implicit current-table reference such as `[@Amount]`. */
  tableName?: string;
  tableNameStart?: number;
  tableNameEnd?: number;
  scope: StructuredReferenceScope;
  columns: Array<{ name: string; start: number; end: number }>;
  start: number;
  end: number;
};

export type FormulaStructuredReferenceResolution = {
  value: FormulaRuntimeValue;
  range?: {
    bounds: FormulaRangeBounds & { sheetName?: string };
    values: Iterable<FormulaValue>;
    entries?: Iterable<import("./functions/contracts.js").FormulaRangeEntry>;
    getValue?: (row: number, column: number) => FormulaValue;
  };
};

export type FormulaExpression =
  | { kind: "number"; value: number; start: number; end: number }
  | { kind: "string"; value: string; start: number; end: number }
  | { kind: "boolean"; value: boolean; start: number; end: number }
  /** A deliberately empty function argument, such as the second argument in `=F(1,,3)`. */
  | { kind: "omitted"; start: number; end: number }
  /** A dynamic-array spill reference such as `A1#`. */
  | { kind: "spill"; reference: FormulaReference; start: number; end: number }
  | {
      kind: "reference";
      reference: FormulaReference;
      start: number;
      end: number;
    }
  | { kind: "range"; range: FormulaRange; start: number; end: number }
  | { kind: "axis-range"; range: FormulaAxisRange; start: number; end: number }
  | {
      kind: "structured-reference";
      reference: StructuredFormulaReference;
      start: number;
      end: number;
    }
  | { kind: "array"; rows: FormulaExpression[][]; start: number; end: number }
  | { kind: "error"; code: FormulaErrorCode; start: number; end: number }
  | { kind: "identifier"; name: string; start: number; end: number }
  | {
      kind: "unary";
      operator: "+" | "-";
      operand: FormulaExpression;
      start: number;
      end: number;
    }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=";
      left: FormulaExpression;
      right: FormulaExpression;
      start: number;
      end: number;
    }
  | {
      kind: "function";
      name: string;
      args: FormulaExpression[];
      start: number;
      end: number;
    };

export type FormulaAst = {
  source: string;
  expression: FormulaExpression;
};

export type FormulaParseFailure = {
  ok: false;
  error: FormulaError;
  offset: number;
};

export type FormulaParseSuccess = {
  ok: true;
  ast: FormulaAst;
};

export type FormulaParseResult = FormulaParseSuccess | FormulaParseFailure;

export type FormulaResolver = (address: FormulaAddress) => FormulaValue;

export type FormulaEvaluationResolver = {
  resolveCell: (address: FormulaAddress & { sheetName?: string }) => FormulaValue;
  resolveRange: (bounds: FormulaRangeBounds & { sheetName?: string }) => Iterable<FormulaValue>;
  resolveRangeEntries?: (
    bounds: FormulaRangeBounds & { sheetName?: string },
  ) => Iterable<import("./functions/contracts.js").FormulaRangeEntry>;
  resolveSpill?: (address: FormulaAddress & { sheetName?: string }) => FormulaRuntimeValue;
  resolveName?: (
    name: string,
  ) => FormulaValue | (FormulaRangeBounds & { sheetName?: string }) | undefined;
  resolveStructuredReference?: (
    reference: StructuredFormulaReference,
    address?: FormulaAddress,
  ) => FormulaStructuredReferenceResolution | undefined;
};

export type FormulaAxis = "row" | "column";
export type FormulaAxisOperation = "insert" | "delete";

export type FormulaAxisTransform = {
  axis: FormulaAxis;
  operation: FormulaAxisOperation;
  index: number;
  count: number;
};

export type FormulaCopyOffset = {
  row: number;
  column: number;
};

export function createFormulaError(code: FormulaErrorCode): FormulaError {
  if (!isFormulaErrorCode(code)) throw new TypeError("Invalid formula error code.");
  return { kind: "formula-error", code };
}

export function isFormulaErrorCode(value: unknown): value is FormulaErrorCode {
  return typeof value === "string" && Object.hasOwn(FORMULA_ERROR_TOKENS, value);
}

export function isFormulaError(value: unknown): value is FormulaError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "formula-error" &&
    "code" in value &&
    isFormulaErrorCode(value.code)
  );
}

export function formulaErrorCodeFromToken(token: string): FormulaErrorCode | null {
  const normalized = token.toUpperCase();
  return (
    (Object.keys(FORMULA_ERROR_TOKENS) as FormulaErrorCode[]).find(
      (code) => FORMULA_ERROR_TOKENS[code] === normalized,
    ) ?? null
  );
}

export function isCellFormula(content: CellContent | null | undefined): content is {
  kind: "formula";
  formula: CellFormula;
} {
  return content?.kind === "formula";
}

export function createCellFormula(source: string): CellFormula {
  return { source };
}
import type { ImageTransform } from "../image-transform.js";
