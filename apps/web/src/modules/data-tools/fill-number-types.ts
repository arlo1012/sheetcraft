export type FillNumberSequenceDraft = {
  axis: "rows" | "columns";
  start: number;
  step: number;
};

export type FillRankDraft = {
  sourceRange: string;
  destination: string;
  order: "ascending" | "descending";
  ties: "competition" | "dense" | "ordinal";
  overwrite: boolean;
};
