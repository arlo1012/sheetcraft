export type DataTableMessageSchema = {
  dataTable: {
    title: string;
    range: string;
    rowInput: string;
    columnInput: string;
    selectRange: string;
    selectCell: string;
    rangePlaceholder: string;
    inputPlaceholder: string;
    instructions: string;
    instructionsRow: string;
    instructionsColumn: string;
    instructionsBoth: string;
    recalculation: string;
    preview: string;
    previewSize: string;
    previewLimited: string;
    previewHelp: string;
    solve: string;
    create: string;
    cancel: string;
    close: string;
    invalidRange: string;
    invalidInput: string;
    invalidFormula: string;
    overlap: string;
    protected: string;
    limit: string;
    formulaError: string;
  };
};

export type DataTableMessageKey = `dataTable.${keyof DataTableMessageSchema["dataTable"]}`;
