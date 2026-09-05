import type { Sheet } from "@idea10/core/workbook";

/** Pinned tabs keep their workbook order within a separate leading group. */
export function getVisibleSheets(sheets: readonly Sheet[]): Sheet[] {
  const visible = sheets.filter((sheet) => !sheet.properties.hidden);
  return [
    ...visible.filter((sheet) => sheet.properties.pinned),
    ...visible.filter((sheet) => !sheet.properties.pinned),
  ];
}
