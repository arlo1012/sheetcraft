import type { DataTableMessageSchema } from "./data-table-messages";

export const dataTableEnUS = {
  dataTable: {
    title: "Data Table",
    range: "Table range",
    rowInput: "Row input cell",
    columnInput: "Column input cell",
    selectRange: "Select range",
    selectCell: "Select cell",
    rangePlaceholder: "Sheet1!A1:F8",
    inputPlaceholder: "A1",
    instructions:
      "Top-row trial values use the row input cell; first-column trial values use the column input cell. Enter either input cell, or both.",
    instructionsRow:
      "Top-row trial values use the row input cell; place formulas in the first column below the top row.",
    instructionsColumn:
      "First-column trial values use the column input cell; place formulas in the top row after the first column.",
    instructionsBoth:
      "Top-row and first-column trial values use their input cells; place the formula in the upper-left cell.",
    recalculation:
      "Results update automatically when trial values or source formulas change, following the workbook calculation mode.",
    preview: "Preview",
    previewSize: "{rows} rows × {columns} columns",
    previewLimited: "Showing the first 8 rows and 8 columns.",
    previewHelp:
      "Only cells inside the selected range are filled. The top row and first column are preserved; existing results are replaced.",
    solve: "Preview",
    create: "Create table",
    cancel: "Cancel",
    close: "Close",
    invalidRange: "Select a valid table range.",
    invalidInput: "Enter a valid input cell.",
    invalidFormula: "The table's formula cell must contain a formula.",
    overlap: "Avoid merged or spilled cells, and keep input cells outside the table range.",
    protected: "The data table range contains protected cells.",
    limit: "A data table supports up to 1,000 result cells.",
    formulaError: "The data table formula could not be calculated.",
  },
} satisfies DataTableMessageSchema;
