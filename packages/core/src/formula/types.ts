export const MAX_FORMULA_ROWS = 1_048_576;
export const MAX_FORMULA_COLUMNS = 16_384;

export type FormulaScalar = string | number | boolean | null;

export type FormulaErrorCode = "PARSE" | "REF" | "CYCLE" | "VALUE" | "DIV0" | "NAME";

export type FormulaError = {
  kind: "formula-error";
  code: FormulaErrorCode;
};

export type FormulaValue = FormulaScalar | FormulaError;

export type CellFormula = {
  source: string;
};

/** A binary image resource owned by the Web storage adapter. */
export type CellImage = {
  assetId: string;
  altText: string;
};

export type CellContent =
  | { kind: "literal"; value: Exclude<FormulaScalar, null> }
  | { kind: "formula"; formula: CellFormula }
  | { kind: "image"; image: CellImage };

export type FormulaAddress = {
  row: number;
  column: number;
};

export type FormulaReference = FormulaAddress & {
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

export type FormulaExpression =
  | { kind: "number"; value: number; start: number; end: number }
  | { kind: "reference"; reference: FormulaReference; start: number; end: number }
  | { kind: "range"; range: FormulaRange; start: number; end: number }
  | { kind: "error"; code: FormulaErrorCode; start: number; end: number }
  | { kind: "identifier"; name: string; start: number; end: number }
  | { kind: "unary"; operator: "+" | "-"; operand: FormulaExpression; start: number; end: number }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/";
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
  resolveCell: (address: FormulaAddress) => FormulaValue;
  resolveRange: (bounds: FormulaRangeBounds) => Iterable<FormulaValue>;
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
  return { kind: "formula-error", code };
}

export function isFormulaError(value: FormulaValue): value is FormulaError {
  return typeof value === "object" && value !== null && value.kind === "formula-error";
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
