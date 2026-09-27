/** Display model for the data proofreading result list. */
export type DataProofreadingIssueKind =
  | "number"
  | "date"
  | "time"
  | "percent"
  | "currency"
  | "identity";

export type DataProofreadingIssue = {
  id: string;
  type: DataProofreadingIssueKind;
  reason:
    | "textNumber"
    | "textDate"
    | "textTime"
    | "textPercent"
    | "textCurrency"
    | "identityText"
    | "unsafeLeadingZero"
    | "unsafePrecision"
    | "ambiguousDate"
    | "invalidDate"
    | "invalidTime"
    | "unsafeUnderflow";
  address: string;
  currentValue: string;
  proposedValue?: string;
  /** Only a deterministic proposal may be applied by the bulk actions. */
  safe: boolean;
};

export type DataProofreadingDraft = {
  range: string;
};
