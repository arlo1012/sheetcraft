import type { Workbook, CellAddress } from "@idea10/core/workbook";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
import { formatCellAddress } from "@idea10/core/coordinates";
import { readXlsxWorksheetStyleIds } from "./hyperlinks.js";
import { attr, child, nodes, parseXml } from "./pivot-xml.js";

/** Reuse the generated style table's IDs, including custom date/currency formats. */
export function createPivotNumberFormatReader(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
): (table: SheetPivotTable, fieldCount: number) => number[] {
  const sheets = [...workbook.sheets.values()];
  const sheetStyles = readXlsxWorksheetStyleIds(entries);
  const formats = nodes(
    child(child(parseXml(entries["xl/styles.xml"]), "styleSheet"), "cellXfs").xf,
  ).map((xf) => Number(attr(xf, "numFmtId", "0")));
  const formatAt = (sheetId: string, address: CellAddress): number => {
    const index = sheets.findIndex((sheet) => sheet.id === sheetId);
    const styleId = sheetStyles[index]?.get(formatCellAddress(address));
    return styleId === undefined ? 0 : (formats[styleId] ?? 0);
  };
  return (table, fieldCount) =>
    Array.from({ length: fieldCount }, (_, field) => {
      if (!table.consolidation)
        return table.source
          ? formatAt(table.sourceSheetId, {
              row: table.source.start.row + 1,
              column: table.source.start.column + field,
            })
          : 0;
      const area = table.consolidation.ranges[0];
      if (!area?.range || field > 2) return 0;
      return formatAt(area.sheetId, {
        row: area.range.start.row + (field === 1 ? 0 : 1),
        column: area.range.start.column + (field === 0 ? 0 : 1),
      });
    });
}
