import type { ConsolidateFunction } from "@sheetcraft/core/commands";

export type ConsolidateDraft = {
  sources: string[];
  destination: string;
  function: ConsolidateFunction;
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
