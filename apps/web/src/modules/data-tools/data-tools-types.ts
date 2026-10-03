import type { SortIcon, SortKey, SortMethod } from "@idea10/core/commands";
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
  clearOutline: boolean;
  expand: boolean;
  collapse: boolean;
  clearFilter: boolean;
};
export type DataToolFilterCriteria = SheetFilterColumn["condition"];
export type FilterColorSort =
  | { sortOn: "cellColor"; color: string | null }
  | { sortOn: "fontColor"; color: string };
export type DataToolFilterAnchor = { x: number; y: number; width?: number; height?: number };
export type DataToolColumn = { column: number; label: string; header?: string };
export type DataToolRangeSnapshot = { sheetId: string; generation: number; range: CellRange };
export type SortLevel = SortKey;
export type SortColorColumn = {
  column: number;
  cellColors: Array<string | null>;
  fontColors: string[];
  headerCellColor?: string | null;
  headerFontColor: string;
};
export type SortIconColumn = {
  column: number;
  icons: Array<SortIcon | null>;
  headerIcon: SortIcon | null;
};
export type SortInitial = {
  hasHeader: boolean;
  headerLocked?: boolean;
  column: number;
  direction: "ascending" | "descending";
  levels?: SortLevel[];
  caseSensitive?: boolean;
  sortMethod?: SortMethod;
};
export type SortDraft = {
  range: string;
  hasHeader: boolean;
  caseSensitive?: boolean;
  sortMethod?: SortMethod;
  levels: SortLevel[];
};
export type TextToColumnsDraft = {
  source?: string;
  mode: "auto" | "delimiter" | "fixed-width" | "text-type" | "keyword";
  autoSuggestionId?: string;
  delimiters: string[];
  otherDelimiter: string;
  otherDelimiterMode?: "characters" | "token";
  textTypes?: Array<"chinese" | "english" | "number">;
  keywords?: string[];
  keywordPosition?: "before" | "after";
  keepKeywords?: boolean;
  fixedWidths: number[];
  columnTypes: Array<"general" | "text" | "date" | "skip">;
  dateOrders?: Array<"YMD" | "MDY" | "DMY" | "YDM" | "MYD" | "DYM">;
  textQualifier?: '"' | "'" | "none";
  mergeDelimiters?: boolean;
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
  function: "count" | "sum" | "average" | "max" | "min" | "product";
  valueColumns: number[];
  replaceExisting: boolean;
  pageBreaks: boolean;
  summaryBelow: boolean;
};
export type DataValidationInitial = Pick<
  SheetDataValidation,
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
> & {
  id?: SheetDataValidation["id"];
};
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
