import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";

export function nativeChartFixture() {
  const idFactory = createSequentialIdFactory();
  const workbook = createWorkbook({ idFactory });
  const source = getActiveSheet(workbook);
  source.name = "Source";
  const rows = [
    ["region", "product", "amount"],
    ["north", "apple", 100],
    ["north", "pear", 80],
    ["south", "apple", 120],
    ["south", "pear", 90],
    ["east", "apple", 60],
    ["east", "pear", 70],
  ];
  rows.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value: value! }),
    ),
  );
  const output = createSheet("Report", "report");
  insertSheet(workbook, output);
  const table: SheetPivotTable = {
    id: "pivot",
    name: "PivotTable1",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 6, column: 2 } },
    anchor: { row: 2, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [1],
    values: [{ field: 2, aggregate: "sum", caption: "Sum of amount" }],
    filters: [],
    sort: "ascending",
    rowTotals: true,
    columnTotals: true,
    includeHidden: true,
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
    reportLayout: {
      rowLabel: "Row Labels",
      columnLabel: "Column Labels",
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    },
    presentation: {
      layout: "compact",
      subtotals: "off",
      repeatLabels: false,
      blankRows: false,
      rowHeaders: true,
      columnHeaders: true,
      bandedRows: false,
      bandedColumns: false,
    },
  };
  const session = createWorkbookSession({ workbook, idFactory });
  executeWorkbookCommand(
    session,
    createSetPivotTableCommand(output.id, table, { chartId: "chart" }),
  );
  return {
    workbook,
    source,
    output,
    session,
    pivot: output.pivotTables![0]!,
    chart: output.drawings![0]!,
  };
}
