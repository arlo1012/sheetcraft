import type { TableMessageSchema } from "./table-messages";

export const tablesEnUS: TableMessageSchema = {
  tables: {
    create: "Create table",
    applyStyle: "Apply table style",
    sourceRange: "Table data source",
    styleOnly: "Apply the style only",
    headerRows: "Number of header rows",
    convertAndApply: "Convert to a table and apply the style",
    invalidHeaderRows:
      "Header row count must be a whole number between 0 and the number of rows in the selected range.",
    settings: "Table settings",
    tools: "Table tools",
    resize: "Resize table",
    calculatedColumn: "Apply formula to column",
    calculatedFormula: "Column formula",
    calculatedOverwriteHint:
      "Replace every data cell in {table}[{column}] ({range}), including existing values, formulas, blank exceptions and filtered rows. Headers and totals are preserved. You can undo this action.",
    calculatedAnchorHint:
      "Write the formula for the first data cell, {address}. Relative references are adjusted for each row.",
    applyColumn: "Replace entire data column",
    invalidCalculatedFormula: "Enter a valid formula beginning with =.",
    calculatedUnavailable:
      "Could not apply this calculated column. Check the formula and the cells’ protection or validation rules. Your draft and workbook are unchanged.",
    calculatedChanged:
      "The workbook changed while this dialog was open. Your formula draft is retained; close and reopen the column operation before applying it.",
    range: "Table data range",
    selectRange: "Select table range",
    hasHeaders: "My table has headers",
    generatedHeaders: "When unchecked, a header row is added above the data.",
    name: "Table name",
    headerRow: "Header row",
    totalRow: "Total row",
    firstColumn: "First column",
    lastColumn: "Last column",
    bandedRows: "Banded rows",
    bandedColumns: "Banded columns",
    filterButton: "Filter buttons",
    styleOptions: "Table style options",
    convertToRange: "Convert to range",
    convertHint: "Keep the data and current appearance, and remove the table and its filters.",
    structuredHint: "Use {name}[Column] in formulas to reference this table's data.",
    invalidRange: "Select a valid cell range on the current worksheet.",
    invalidName:
      "Start with a letter or underscore. Do not use a cell address or an existing name.",
    overlap: "Tables cannot overlap other tables or merged cells.",
    failed: "Unable to apply the table settings. Check the name and range.",
    advancedFilterRowChange:
      "This row change cannot preserve the active advanced filter. Clear that filter first. Your data is unchanged.",
    confirm: "OK",
    cancel: "Cancel",
  },
};
