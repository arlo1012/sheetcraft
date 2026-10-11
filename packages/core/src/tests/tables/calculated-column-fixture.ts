import { createSetCellContentCommand } from "../../commands/values.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { createCreateTableCommand } from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import { createWorkbook, getCellContent, setCellContent } from "../../workbook.js";
import { createWorkbookSession } from "../../history.js";

export function calculatedColumnFixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const sheet = workbook.sheets.get("sheet")!;
  for (const [column, value] of ["Item", "Qty", "Result"].entries())
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
  for (let row = 1; row <= 3; row++)
    setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row + 1 });
  applyWorkbookCommand(
    workbook,
    createCreateTableCommand(sheet.id, {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      columns: ["Item", "Qty", "Result"].map((name, index) => ({ id: `col-${index}`, name })),
      style: createBuiltinTableStyles("#4f81bd")[1]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  const session = createWorkbookSession({ workbook, idFactory: () => "id" });
  const formula = (row: number, source = `=B${row + 1}*2`) =>
    createSetCellContentCommand(
      sheet.id,
      { row, column: 2 },
      { kind: "formula", formula: { source } },
      { inputIntent: "manual" },
    );
  const sources = () => [1, 2, 3].map((row) => getCellContent(sheet, { row, column: 2 }));
  return { workbook, sheet, session, formula, sources };
}
