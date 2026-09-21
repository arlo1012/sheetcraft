export type FormulaToolsMessageSchema = {
  formulaTools: {
    toolbar: string;
    insertFunction: string;
    moreFunctions: string;
    autoSum: string;
    autoSumMenu: string;
    nameManager: string;
    createNamesFromSelection: string;
    quickCreateNames: string;
    nameFromTopRow: string;
    nameFromLeftColumn: string;
    nameFromBottomRow: string;
    nameFromRightColumn: string;
    namesCreated: string;
    namesNotCreated: string;
    calculation: string;
    calculationOptions: string;
    automaticCalculation: string;
    manualCalculation: string;
    iterativeCalculation: string;
    maximumIterations: string;
    maximumChange: string;
    recalculate: string;
    functionBrowser: string;
    searchFunctions: string;
    selectFunction: string;
    recent: string;
    allFunctions: string;
    noFunctions: string;
    categories: string;
    math: string;
    logical: string;
    statistical: string;
    text: string;
    dateTime: string;
    financial: string;
    information: string;
    lookup: string;
    engineering: string;
    database: string;
    compatibility: string;
    syntax: string;
    description: string;
    example: string;
    namedRanges: string;
    newName: string;
    editName: string;
    filterNames: string;
    comment: string;
    value: string;
    searchNames: string;
    worksheetNames: string;
    namesWithErrors: string;
    namesWithoutErrors: string;
    definedNames: string;
    tableNames: string;
    clearNameFilters: string;
    noMatchingNames: string;

    allNames: string;
    workbookNames: string;
    currentSheetNames: string;
    noNames: string;
    resetReference: string;
    saveReference: string;
    close: string;
    name: string;
    nameCannotStartWithNumber: string;
    scope: string;
    workbook: string;
    reference: string;
    selection: string;
    selectRange: string;
    confirmRange: string;
    createFromSelection: string;
    deleteName: string;
    saveName: string;
    cancel: string;
  };
  formulaFunctions: Record<string, { description: string; signature: string; example: string }>;
  formulaArguments: Record<string, string>;
};

export type FormulaToolsMessageKey =
  | `formulaTools.${keyof FormulaToolsMessageSchema["formulaTools"]}`
  | `formulaFunctions.${string}.description`
  | `formulaFunctions.${string}.signature`
  | `formulaFunctions.${string}.example`
  | `formulaArguments.${string}`;
