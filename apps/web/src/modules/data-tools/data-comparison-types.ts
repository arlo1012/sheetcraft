export type DataComparisonAction =
  | "markDuplicate"
  | "extractDuplicate"
  | "markUnique"
  | "extractUnique";

export type DataComparisonDraft = {
  scope: "single" | "double";
  firstRange: string;
  secondRange: string;
  comparisonMode: "cells" | "rows";
  columns: number[];
  hasHeader: boolean;
  side: "first" | "second" | "both";
  fillColor: string;
};
