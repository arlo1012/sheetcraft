import type {
  CellRange,
  DataValidationOperator,
  SheetDataValidation,
  SheetFilterColumn,
  SheetFilterValue,
} from "@idea10/core/workbook";

export type DataToolAxis = "rows" | "columns";
export type DataToolSortDirection = "ascending" | "descending";
export type DataToolFilterValueOption = { key: SheetFilterValue; label: string; count: number };
export type DataToolCapabilities = {
  sort: boolean;
  split: boolean;
  removeDuplicates: boolean;
  subtotal: boolean;
  ungroupRows: boolean;
  ungroupColumns: boolean;
  expand: boolean;
  collapse: boolean;
  clearFilter: boolean;
};
export type DataToolFilterCriteria = SheetFilterColumn["condition"];
export type DataToolFilterAnchor = { x: number; y: number; width?: number; height?: number };
export type DataToolColumn = { column: number; label: string; header?: string };
export type DataToolRangeSnapshot = { sheetId: string; generation: number; range: CellRange };
export type SortLevel = { column: number; direction: DataToolSortDirection };
export type SortInitial = {
  hasHeader: boolean;
  headerLocked?: boolean;
  column: number;
  direction: "ascending" | "descending";
};
export type SortDraft = {
  range: string;
  hasHeader: boolean;
  caseSensitive?: boolean;
  levels: SortLevel[];
};
export type TextToColumnsDraft = {
  mode: "delimiter" | "fixed-width";
  delimiters: string[];
  otherDelimiter: string;
  fixedWidths: number[];
  columnTypes: Array<"general" | "text">;
  destination: string;
  overwrite: boolean;
};
export type RemoveDuplicatesDraft = { hasHeader: boolean; columns: number[] };
export type AdvancedFilterDraft = {
  mode: "inPlace" | "copy";
  listRange: string;
  criteriaRange: string;
  destination: string;
  uniqueOnly: boolean;
  overwrite: boolean;
};
export type DataValidationDraft = {
  type: "any" | "whole" | "decimal" | "list" | "date" | "time" | "text-length" | "custom";
  operator: DataValidationOperator;
  minimum: string;
  maximum: string;
  source: string;
  ignoreBlank: boolean;
  showDropdown: boolean;
  inputTitle: string;
  inputMessage: string;
  showInputMessage: boolean;
  errorTitle: string;
  errorMessage: string;
  errorStyle: "stop" | "warning" | "information";
  showErrorAlert: boolean;
};
export type SubtotalDraft = {
  groupColumn: number;
  function: "count" | "sum" | "average" | "max" | "min";
  valueColumns: number[];
};
export type DataValidationInitial = Pick<
  SheetDataValidation,
  | "id"
  | "type"
  | "operator"
  | "formula1"
  | "formula2"
  | "list"
  | "allowBlank"
  | "showInput"
  | "showError"
  | "showDropdown"
  | "promptTitle"
  | "prompt"
  | "errorTitle"
  | "error"
  | "errorStyle"
>;
export type FilterColumnPanelState = {
  visible: boolean;
  anchor?: DataToolFilterAnchor;
  column: number;
  columnLabel: string;
  values: readonly DataToolFilterValueOption[];
  appliedKeys: readonly SheetFilterValue[];
  criteria?: DataToolFilterCriteria;
  disabled?: boolean;
};
