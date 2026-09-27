export type DataTableDraft = {
  range: string;
  rowInput: string;
  columnInput: string;
};

export type DataTablePreview = {
  rows: number;
  columns: number;
  values: Array<Array<string | number | boolean | null>>;
};
