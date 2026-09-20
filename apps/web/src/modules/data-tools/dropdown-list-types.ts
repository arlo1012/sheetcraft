export type DropdownListDraft = {
  mode: "manual" | "range";
  items: string[];
  source: string;
  applyToMatching: boolean;
  clear: boolean;
};

export type DropdownListInitial = DropdownListDraft & {
  canApplyToMatching: boolean;
};
