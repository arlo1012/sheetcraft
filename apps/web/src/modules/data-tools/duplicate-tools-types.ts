export type DuplicateToolMode = "highlight" | "count" | "reject";

export type DuplicateToolDraft = {
  range: string;
  hasHeader: boolean;
  fillColor: string;
  destination: string;
  overwrite: boolean;
};
