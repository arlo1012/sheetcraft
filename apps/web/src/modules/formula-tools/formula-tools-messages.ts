export type FormulaToolsMessageSchema = {
  formulaTools: {
    toolbar: string;
    insertFunction: string;
    moreFunctions: string;
    autoSum: string;
    autoSumMenu: string;
    nameManager: string;
    calculation: string;
    recalculate: string;
    functionBrowser: string;
    searchFunctions: string;
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
    syntax: string;
    description: string;
    example: string;
    namedRanges: string;
    newName: string;
    name: string;
    scope: string;
    workbook: string;
    reference: string;
    selection: string;
    createFromSelection: string;
    deleteName: string;
    saveName: string;
    cancel: string;
  };
  formulaFunctions: Record<
    string,
    { description: string; signature: string; example: string }
  >;
  formulaArguments: Record<string, string>;
};

export type FormulaToolsMessageKey =
  | `formulaTools.${keyof FormulaToolsMessageSchema["formulaTools"]}`
  | `formulaFunctions.${string}.description`
  | `formulaFunctions.${string}.signature`
  | `formulaFunctions.${string}.example`
  | `formulaArguments.${string}`;
