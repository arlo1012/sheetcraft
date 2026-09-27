import type { SheetSearchOptions } from "@idea10/core/search";
import type { CellAddress } from "@idea10/core/workbook";

export type WorkbookFindOptions = Required<
  Pick<SheetSearchOptions, "order" | "lookIn" | "matchCase" | "matchEntireCell" | "matchWidth">
> & { scope: "sheet" | "workbook" };

export const DEFAULT_WORKBOOK_FIND_OPTIONS: WorkbookFindOptions = {
  scope: "sheet",
  order: "rows",
  lookIn: "smart",
  matchCase: false,
  matchEntireCell: false,
  matchWidth: false,
};

export type WorkbookFindResult = {
  workbookName: string;
  sheetId: string;
  sheetName: string;
  definedName: string;
  address: CellAddress;
  addressLabel: string;
  value: string;
  formula: string;
};

export type WorkbookFindFormatMode = "fill" | "font" | "colors" | "all";
