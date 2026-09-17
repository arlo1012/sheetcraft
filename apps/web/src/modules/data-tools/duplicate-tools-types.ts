export type DuplicateToolMode = "highlight" | "count" | "reject";

export type DuplicateToolDraft = {
  range: string;
  fillColor: string;
  destination: string;
  overwrite: boolean;
};
