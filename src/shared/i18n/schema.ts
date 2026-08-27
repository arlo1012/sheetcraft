export type AppLocale = "zh-CN" | "en-US";

export type MessageSchema = {
  app: {
    workspace: string;
    language: string;
    localeChinese: string;
    localeEnglish: string;
  };
  workspace: {
    editor: string;
    ready: string;
    invalidAddress: string;
    enterSearchTerm: string;
    noMatches: string;
    found: string;
    renameFailed: string;
    sheetNameEmpty: string;
    sheetNameDuplicate: string;
  };
  navigation: {
    sheet: string;
    goToCell: string;
    cellAddress: string;
    findInSheet: string;
    findPlaceholder: string;
    findPrevious: string;
    findNext: string;
  };
  sheetTabs: {
    list: string;
    rename: string;
    renameHint: string;
    deleteActive: string;
    add: string;
  };
  cell: {
    edit: string;
    value: string;
    blank: string;
  };
  grid: {
    worksheet: string;
    selectAll: string;
    selectRow: string;
    selectColumn: string;
    rowHeight: string;
    columnWidth: string;
  };
  clipboard: {
    unavailable: string;
    axisCopyUnsupported: string;
    readyToMove: string;
    copied: string;
    axisPasteUnsupported: string;
    missingText: string;
    rangeMismatch: string;
    moved: string;
    pasted: string;
  };
  axisMenu: {
    rowActions: string;
    columnActions: string;
    insertCount: string;
    rowUnit: string;
    columnUnit: string;
    insertRowAboveOne: string;
    insertRowsAbove: string;
    insertRowBelowOne: string;
    insertRowsBelow: string;
    insertColumnBeforeOne: string;
    insertColumnsBefore: string;
    insertColumnAfterOne: string;
    insertColumnsAfter: string;
    rowHeight: string;
    columnWidth: string;
    pixels: string;
    deleteRowOne: string;
    deleteRows: string;
    deleteColumnOne: string;
    deleteColumns: string;
    clearRowOne: string;
    clearRows: string;
    clearColumnOne: string;
    clearColumns: string;
  };
};

type LeafPath<T> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Key
    : T[Key] extends Record<string, unknown>
      ? `${Key}.${LeafPath<T[Key]>}`
      : never;
}[keyof T & string];

export type MessageKey = LeafPath<MessageSchema>;
export type MessageParams = Record<string, string | number>;
