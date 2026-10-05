import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type CellAddress,
  type CellValue,
} from "../../workbook.js";
import type { SheetPivotTable } from "../../pivot-tables.js";
import { createTestWorkbookSession } from "../helpers.js";
export const records: CellValue[][] = [
  ["Region", "Quarter", "Amount", "Units"],
  ["East", "Q1", 10, 2],
  ["East", "Q1", 20, 3],
  ["East", "Q2", 30, 4],
  ["West", "Q1", 40, 5],
];
export function fixture(data: CellValue[][] = records, start: CellAddress = { row: 0, column: 0 }) {
  const session = createTestWorkbookSession();
  const source = getActiveSheet(session.workbook);
  source.name = "Source";
  const destination = createSheet("Pivot", "pivot-output");
  insertSheet(session.workbook, destination);
  data.forEach((row, r) =>
    row.forEach((value, c) =>
      setCellContent(
        source,
        { row: start.row + r, column: start.column + c },
        value === null ? null : { kind: "literal", value },
      ),
    ),
  );
  const table: SheetPivotTable = {
    id: "pivot",
    name: "Sales",
    sourceSheetId: source.id,
    source: {
      start: { ...start },
      end: { row: start.row + data.length - 1, column: start.column + data[0]!.length - 1 },
    },
    anchor: { row: 2, column: 2 },
    outputRange: null,
    rowFields: [0],
    columnFields: [1],
    values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
    filters: [],
    rowTotals: true,
    columnTotals: true,
    includeHidden: false,
    sort: "source",
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
  };
  return { session, workbook: session.workbook, source, destination, table };
}
