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
