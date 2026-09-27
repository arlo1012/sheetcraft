import type { DataProofreadingIssueKind } from "./data-proofreading-types";

export type ProofreadingMessageSchema = {
  proofreading: {
    title: string;
    range: string;
    rangePlaceholder: string;
    pickRange: string;
    scan: string;
    rescan: string;
    close: string;
    issues: string;
    noIssues: string;
    scanHint: string;
    type: string;
    address: string;
    currentValue: string;
    proposedValue: string;
    action: string;
    select: string;
    apply: string;
    applyType: string;
    applySelected: string;
    ignore: string;
    ignoreType: string;
    selected: string;
    unsafe: string;
    types: Record<DataProofreadingIssueKind, string>;
    reasons: Record<string, string>;
    invalidRange: string;
    rangeChanged: string;
    scanFailed: string;
    scanTooLarge: string;
    applyFailed: string;
    noSafeSelection: string;
  };
};
