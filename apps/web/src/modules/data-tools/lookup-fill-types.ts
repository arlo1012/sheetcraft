export type LookupFillFieldDraft = { sourceColumn: number; targetColumn: number };
export type LookupFillDraft = {
  sourceRange: string;
  targetRange: string;
  hasHeader: boolean;
  matchFields: LookupFillFieldDraft[];
  fillFields: LookupFillFieldDraft[];
  matchMode: "first" | "last";
  overwrite: boolean;
};
