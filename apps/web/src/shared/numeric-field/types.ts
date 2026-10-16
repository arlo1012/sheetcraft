export type NumericValue =
  | { kind: "value"; value: number }
  | { kind: "mixed" }
  | { kind: "auto" }
  | { kind: "empty" };
export type NumericCandidate = Exclude<NumericValue, { kind: "mixed" }>;
export interface NumericBounds {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
}
export interface NumericFieldSpec {
  displayUnit?: string;
  toDisplay?: (value: number) => number;
  fromDisplay?: (value: number) => number;
  /** Presentation only. Never quantizes an untouched canonical value. */
  displayPrecision?: number;
  displayStep?: number;
  canonicalBounds?: NumericBounds;
  integer?: boolean;
  allowAuto?: boolean;
  allowEmpty?: boolean;
  parsePolicy?: { scientific?: boolean; decimalComma?: boolean };
  validateCanonical?: (value: number) => string | undefined;
}
export interface NumericCommitContext {
  ownerKey: string;
  sessionId: string;
  source: "enter" | "blur" | "step" | "auto" | "external";
}
export type NumericCommitResult =
  | { accepted: true; value?: NumericCandidate }
  | { accepted: false; error: string };
export interface NumericDraftChange {
  text: string;
  dirty: boolean;
  composing: boolean;
  valid: boolean;
  stale: boolean;
  ownerKey: string;
}
export interface NumericDraftInputs {
  value: NumericValue;
  spec: NumericFieldSpec;
  ownerKey: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalidMessage: string;
  rejectedMessage: string;
  staleMessage?: string;
  onCommit: (value: NumericCandidate, context: NumericCommitContext) => NumericCommitResult;
}
