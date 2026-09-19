export type ConsolidateDraft = {
  sources: string[];
  destination: string;
  function: "sum" | "count" | "average" | "min" | "max";
  topRow: boolean;
  leftColumn: boolean;
  overwrite: boolean;
};

export type ConsolidatePreview = {
  rows: number;
  columns: number;
  sourceCells: number;
  outputCells: number;
  numericValues: number;
  sample: Array<Array<string | number | boolean>>;
};
