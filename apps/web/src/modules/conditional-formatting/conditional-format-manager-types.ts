import type { SheetConditionalFormatRule } from "@sheetcraft/core/conditional-formatting";

export type ConditionalFormatManagerSheet = {
  id: string;
  name: string;
  rules: readonly SheetConditionalFormatRule[];
  selectionRanges: string;
  protected?: boolean;
};

export type ConditionalFormatSheetChange = {
  sheetId: string;
  rules: SheetConditionalFormatRule[];
};
