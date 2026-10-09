import type { SheetTable } from "@sheetcraft/core/workbook";

export type CreateTableDraft = {
  range: string;
  mode: "styleOnly" | "table";
  headerRows: number;
  hasHeaders: boolean;
  filterButton: boolean;
};
export type TableSettingsDraft = Pick<
  SheetTable,
  | "name"
  | "headerRow"
  | "totalRow"
  | "firstColumn"
  | "lastColumn"
  | "bandedRows"
  | "bandedColumns"
  | "filterButton"
> & { range: string };

export type TableOptionsPatch = Partial<
  Pick<
    SheetTable,
    | "headerRow"
    | "totalRow"
    | "firstColumn"
    | "lastColumn"
    | "bandedRows"
    | "bandedColumns"
    | "filterButton"
  >
>;
