import type { ProtectionPassword } from "../protection-password.js";
import type { SheetProtection } from "../protection.js";
import type { SheetSnapshot } from "../serialization.js";
import type { ExcelDateSystem } from "../formula/date-system.js";
import type { WorkbookCalculationSettings } from "../calculation.js";
import type { CellContent } from "../formula/types.js";
import type {
  CellBorderAction,
  CellBorderFormatPatch,
  CellStyle,
  CellStylePatch,
} from "../style.js";
import type { CellHyperlink, CellNamedStyleBinding, CellNote } from "../workbook.js";
import type {
  CellAddress,
  CellRange,
  FreezePanes,
  SheetDimensionAxis,
  SheetFilter,
  SheetMetadata,
  SheetProperties,
  SheetSparseCell,
  SheetSparseDimension,
  SheetSparseState,
  FloatingImage,
  SheetDataValidation,
  SheetOutlineGroup,
  SheetConditionalFormatRule,
  DefinedName,
  SheetTable,
} from "../workbook.js";
import type { TableStyleDefinition } from "../table-styles.js";
import type { PivotTableStyleDefinition } from "../pivot-table-styles.js";
import type { CellStyleDefinition } from "../cell-styles.js";
import type { ConditionalFormatIconSet } from "../conditional-formatting.js";
import type { SheetPageSetup } from "../page-setup.js";
import type { SheetPageDecoration, SheetWatermark, WatermarkPreset } from "../page-decoration.js";
import type { WorkbookTheme } from "../workbook-theme.js";

export type SetSheetProtectionCommand = {
  type: "setSheetProtection";
  sheetId: string;
  protected: boolean;
  protection?: SheetProtection;
  currentPassword?: string;
};
export type SetWorkbookStructureProtectionCommand = {
  type: "setWorkbookStructureProtection";
  protected: boolean;
  password?: ProtectionPassword;
  currentPassword?: string;
};

export type CellContentChange = {
  sheetId: string;
  address: CellAddress;
  content: CellContent | null;
  style?: CellStyle | null;
  namedStyle?: CellNamedStyleBinding | null;
  hyperlink?: CellHyperlink | null;
  note?: CellNote | null;
};

export type SetCellContentsCommand = {
  type: "setCellContents";
  changes: CellContentChange[];
  /** Optional rule updates applied atomically with clipboard cell changes. */
  conditionalFormats?: Array<{ sheetId: string; rules: SheetConditionalFormatRule[] }>;
  reconcileBorders?: true;
};

export type ClearCellRangeCommand = {
  type: "clearCellRange";
  sheetId: string;
  range: CellRange;
};

export type CreateTableCommand = {
  type: "createTable";
  sheetId: string;
  table: SheetTable;
  hasHeaders?: boolean;
};
export type UpdateTableCommand = {
  type: "updateTable";
  sheetId: string;
  tableId: string;
  changes: Partial<Omit<SheetTable, "id" | "columns" | "filter">>;
};
export type ResizeTableCommand = {
  type: "resizeTable";
  sheetId: string;
  tableId: string;
  range: CellRange;
};
export type RemoveTableCommand = { type: "removeTable"; sheetId: string; tableId: string };
export type ApplyTableStyleToRangeCommand = {
  type: "applyTableStyleToRange";
  sheetId: string;
  range: CellRange;
  style: TableStyleDefinition;
  headerRows: number;
};
export type SetWorkbookTableStylesCommand = {
  type: "setWorkbookTableStyles";
  styles: TableStyleDefinition[];
  defaultTableStyleId?: string;
};
export type SetWorkbookPivotTableStylesCommand = {
  type: "setWorkbookPivotTableStyles";
  styles: PivotTableStyleDefinition[];
  defaultPivotTableStyleId?: string;
};
export type SetWorkbookCellStylesCommand = {
  type: "setWorkbookCellStyles";
  styles: CellStyleDefinition[];
  /** Internal binding snapshots used to restore deletions and named-style edits exactly. */
  namedStyleCells?: Array<{
    sheetId: string;
    address: CellAddress;
    style: CellStyle | null;
    namedStyle: CellNamedStyleBinding | null;
  }>;
};
/** Internal inverse for table operations that also rewrite formulas on other sheets. */
export type RestoreTableTransactionCommand = {
  type: "restoreTableTransaction";
  states: Array<{ sheetId: string; state: SheetSparseState }>;
  tableStyles: TableStyleDefinition[];
  defaultTableStyleId?: string;
  pivotTableStyles?: PivotTableStyleDefinition[];
  defaultPivotTableStyleId?: string;
};

export type MoveCellRangeCommand = {
  type: "moveCellRange";
  sheetId: string;
  source: CellRange;
  destination: CellAddress;
};

export type InsertCellsCommand = {
  type: "insertCells";
  sheetId: string;
  range: CellRange;
  direction: "right" | "down";
};

export type DeleteCellsCommand = {
  type: "deleteCells";
  sheetId: string;
  range: CellRange;
  direction: "left" | "up";
};

/** Internal lossless inverse for a rectangular cell shift. */
export type RestoreCellShiftCommand = {
  type: "restoreCellShift";
  sheetId: string;
  state: SheetSparseState;
  direction: InsertCellsCommand["direction"] | DeleteCellsCommand["direction"];
  range: CellRange;
  operation: "insert" | "delete";
  workbookFormulaSources: FormulaSourceRestore[];
  definedNames: DefinedName[];
};

/** One history entry for disjoint deletions from a single sheet axis. */
export type BatchDeleteSheetAxesCommand = {
  type: "batchDeleteSheetAxes";
  sheetId: string;
  commands: Array<DeleteSheetAxisCommand | RestoreSheetAxisSliceCommand>;
};

export type ApplyCellStyleCommand = {
  type: "applyCellStyle";
  sheetId: string;
  range: CellRange;
  patch: CellStylePatch;
  styleId?: string;
  includes?: import("../cell-styles.js").CellStyleInclude[];
};

export type SetCellHyperlinkCommand = {
  type: "setCellHyperlink";
  sheetId: string;
  address: CellAddress;
  hyperlink: CellHyperlink | null;
  /** When provided, atomically replaces the displayed literal text. */
  displayText?: string;
  /** Internal complete inverse used to undo a hyperlink edit without losing a formula or formatting. */
  restore?: {
    content: CellContent | null;
    style: CellStyle | null;
    namedStyle: CellNamedStyleBinding | null;
    hyperlink: CellHyperlink | null;
  };
};

export type SetCellNotesCommand = {
  type: "setCellNotes";
  sheetId: string;
  changes: Array<{ address: CellAddress; note: CellNote | null }>;
};

export type MarkCellHyperlinkVisitedCommand = {
  type: "markCellHyperlinkVisited";
  sheetId: string;
  address: CellAddress;
  visited?: boolean;
};

export type ApplyCellBordersCommand = {
  type: "applyCellBorders";
  sheetId: string;
  range: CellRange;
  action: CellBorderAction;
};

export type CellFormatChange = {
  style?: CellStylePatch;
  borders?: CellBorderAction[];
  borderFormat?: CellBorderFormatPatch;
  /** Changes merged-cell state as part of the same undoable cell-format command. */
  merge?: boolean;
};

export type ApplyCellFormatCommand = {
  type: "applyCellFormat";
  sheetId: string;
  range: CellRange;
  change: CellFormatChange;
};

export type AdjustCellNumberFormatDecimalsCommand = {
  type: "adjustCellNumberFormatDecimals";
  sheetId: string;
  range: CellRange;
  delta: -1 | 1;
};

export type AdjustCellIndentCommand = {
  type: "adjustCellIndent";
  sheetId: string;
  range: CellRange;
  delta: -1 | 1;
};

export type RestoreCellStylesCommand = {
  type: "restoreCellStyles";
  sheetId: string;
  changes: Array<{
    address: CellAddress;
    style: CellStyle | null;
    namedStyle?: CellNamedStyleBinding | null;
  }>;
};

export type ResizeSheetDimensionCommand = {
  type: "resizeSheetDimension";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  size: number;
};

export type ResizeSheetDimensionsCommand = {
  type: "resizeSheetDimensions";
  sheetId: string;
  axis: SheetDimensionAxis;
  indexes: number[];
  size: number;
};

/** Applies potentially different explicit sizes in one atomic history action. */
export type SetSheetDimensionSizesCommand = {
  type: "setSheetDimensionSizes";
  sheetId: string;
  axis: SheetDimensionAxis;
  changes: SheetSparseDimension[];
};

export type SetSheetDimensionHiddenCommand = {
  type: "setSheetDimensionHidden";
  sheetId: string;
  axis: SheetDimensionAxis;
  indexes: number[];
  hidden: boolean;
};

/** Removes explicit axis sizes, restoring automatic/default dimensions. */
export type ResetSheetDimensionSizesCommand = {
  type: "resetSheetDimensionSizes";
  sheetId: string;
  axis: SheetDimensionAxis;
  indexes: number[];
};

export type SetSheetDefaultColumnWidthCommand = {
  type: "setSheetDefaultColumnWidth";
  sheetId: string;
  width: number;
};

/** Internal exact sparse axis state used for lossless history inverses. */
export type RestoreSheetDimensionStateCommand = {
  type: "restoreSheetDimensionState";
  sheetId: string;
  axis: SheetDimensionAxis;
  dimensions: SheetSparseDimension[];
  hiddenIndexes: number[];
  defaultColumnWidth?: number;
};

export type SetSheetFreezePanesCommand = {
  type: "setSheetFreezePanes";
  sheetId: string;
  freezePanes: FreezePanes;
};

export type CellMergeMode = "all" | "center" | "same-columns" | "same-rows" | "content" | "across";

export type MergeCellsCommand = {
  type: "mergeCells";
  sheetId: string;
  range: CellRange;
  /** Omitted for the legacy ordinary rectangular merge. */
  mode?: CellMergeMode;
  /** Locale used to materialize formatted text when merging content. */
  locale?: string;
};

export type UnmergeCellsCommand = {
  type: "unmergeCells";
  sheetId: string;
  range: CellRange;
};

export type SetSheetFilterCommand = {
  type: "setSheetFilter";
  sheetId: string;
  filter: SheetFilter | null;
};

export type SortDirection = "ascending" | "descending";
/** Chinese collation used by an explicit value-sort option. */
export type SortMethod = "pinyin" | "stroke";

/** A visible conditional-format icon as it appears in a cell. */
export type SortIcon = { iconSet: ConditionalFormatIconSet; iconIndex: number };

export type SortKey = {
  column: number;
  direction: SortDirection;
  /** Omitted retains value sorting for saved commands created before color sorting. */
  sortOn?: "value" | "cellColor" | "fontColor" | "icon";
  /** Explicit value order for value sorts. Unlisted values use the ordinary value comparison. */
  customOrder?: string[];
  /** Required by color sorts. `null` selects cells without a fill for `cellColor`. */
  color?: string | null;
  /** Required by icon sorts. `null` selects cells without a visible icon. */
  icon?: SortIcon | null;
};

export type SortSheetRangeCommand = {
  type: "sortSheetRange";
  sheetId: string;
  range: CellRange;
  keyColumn: number;
  direction: SortDirection;
  sortKeys?: SortKey[];
  hasHeader?: boolean;
  /** Omitted preserves the legacy case-sensitive text ordering. */
  caseSensitive?: boolean;
  /** Omitted preserves the legacy code-point text ordering. */
  sortMethod?: SortMethod;
};
export type AdvancedFilterCommand = {
  type: "advancedFilter";
  sheetId: string;
  listRange: CellRange;
  criteria?: { sheetId: string; range: CellRange };
  mode: "inPlace" | "copy";
  destination?: { sheetId: string; address: CellAddress };
  uniqueOnly: boolean;
  overwrite: boolean;
};
export type SplitTextMode = "delimiter" | "fixedWidth" | "textType" | "keyword";
export type SplitTextType = "chinese" | "english" | "number";
export type SplitDateOrder = "YMD" | "MDY" | "DMY" | "YDM" | "MYD" | "DYM";

/** Runtime-neutral rules for turning one text value into fields. */
export type SplitTextOptions = {
  mode: SplitTextMode;
  /** Legacy delimiter syntax: every character is an independent delimiter. */
  delimiter?: string;
  /** Atomic delimiter tokens. Longer tokens take precedence over shorter ones. */
  delimiters?: string[];
  fixedWidths?: number[];
  textQualifier?: '"' | "'" | "none";
  mergeDelimiters?: boolean;
  parseQuoted?: boolean;
  textTypes?: SplitTextType[];
  keywords?: string[];
  keywordPosition?: "before" | "after";
  keepKeywords?: boolean;
};

export type SplitColumnCommand = SplitTextOptions & {
  type: "splitColumn";
  sheetId: string;
  sourceColumn: number;
  range?: CellRange;
  destinationColumn: number;
  /** Output conversions. Skipped source fields do not consume a destination column. */
  columnTypes?: Array<"general" | "text" | "date" | "skip">;
  /** Date component order for each output field when its type is `date`. */
  dateOrders?: SplitDateOrder[];
  /** Zero-based output start row; defaults to the first source row. */
  destinationRow?: number;
  overwrite?: boolean;
};
export type RemoveDuplicatesCommand = {
  type: "removeDuplicates";
  sheetId: string;
  range: CellRange;
  keyColumns: number[];
  hasHeader?: boolean;
  /** Targets the complete structured table even when the current selection is one cell. */
  tableId?: string;
};
export type ApplySubtotalsCommand = {
  type: "applySubtotals";
  sheetId: string;
  range: CellRange;
  groupByColumns: number[];
  summaryColumns: number[];
  operation: "sum" | "count" | "average" | "min" | "max" | "product";
  hasHeader?: boolean;
  subtotalId?: string;
  labels?: { subtotal: string; grandTotal: string };
  replaceExisting?: boolean;
  pageBreaks?: boolean;
  summaryBelow?: boolean;
};
export type RemoveSubtotalsCommand = {
  type: "removeSubtotals";
  sheetId: string;
  subtotalId?: string;
};

export type SetSheetDataValidationsCommand = {
  type: "setSheetDataValidations";
  sheetId: string;
  rules: SheetDataValidation[];
};
export type ClearSheetDataValidationsCommand = {
  type: "clearSheetDataValidations";
  sheetId: string;
  range?: CellRange;
};
export type AddSheetOutlineGroupCommand = {
  type: "addSheetOutlineGroup";
  sheetId: string;
  group: SheetOutlineGroup;
};
export type RemoveSheetOutlineGroupCommand = {
  type: "removeSheetOutlineGroup";
  sheetId: string;
  id: string;
};
export type SetSheetOutlineGroupCollapsedCommand = {
  type: "setSheetOutlineGroupCollapsed";
  sheetId: string;
  id: string;
  collapsed: boolean;
};
/** Sets multiple outline controls in one history operation. */
export type SetSheetOutlineGroupsCollapsedCommand = {
  type: "setSheetOutlineGroupsCollapsed";
  sheetId: string;
  ids: string[];
  collapsed: boolean;
};
export type SetSheetOutlineLevelCommand = {
  type: "setSheetOutlineLevel";
  sheetId: string;
  axis: SheetDimensionAxis;
  level: number;
};
/** Removes all row and column outline groups while preserving sheet contents and dimensions. */
export type ClearSheetOutlineCommand = {
  type: "clearSheetOutline";
  sheetId: string;
};
/** Lowers the outline level for the selected row or column band by one. */
export type UngroupSheetRangeCommand = {
  type: "ungroupSheetRange";
  sheetId: string;
  axis: SheetDimensionAxis;
  start: number;
  end: number;
};

export type AddSheetCommand = {
  type: "addSheet";
  sheet: SheetSnapshot;
  index: number;
  activeSheetId: string;
  /** Formula text on surviving sheets restored by a delete-sheet inverse. */
  formulaSources?: FormulaSourceRestore[];
  /** Conditional-format formula text on surviving sheets restored by a delete-sheet inverse. */
  conditionalFormatFormulaSources?: ConditionalFormatFormulaSourceRestore[];
  definedNames?: DefinedName[];
};

export type SetSheetFloatingImagesCommand = {
  type: "setSheetFloatingImages";
  sheetId: string;
  images: FloatingImage[];
};

export type SetFloatingImageCommand = {
  type: "setFloatingImage";
  sheetId: string;
  image: FloatingImage;
  /** Original z-order slot used only by a delete inverse. */
  index?: number;
};

export type DeleteFloatingImageCommand = {
  type: "deleteFloatingImage";
  sheetId: string;
  id: string;
};

export type ConvertFloatingImageToCellCommand = {
  type: "convertFloatingImageToCell";
  sheetId: string;
  id: string;
};

export type FloatingImageSize = {
  width: number;
  height: number;
};

export type ConvertCellImageToFloatingCommand = {
  type: "convertCellImageToFloating";
  sheetId: string;
  address: CellAddress;
  imageId: string;
  size: FloatingImageSize;
};

/** Internal inverse for converting a floating image into an in-cell image. */
export type RestoreFloatingImageToCellCommand = {
  type: "restoreFloatingImageToCell";
  sheetId: string;
  image: FloatingImage;
  index: number;
  address: CellAddress;
  content: CellContent | null;
};

export type DeleteSheetCommand = {
  type: "deleteSheet";
  sheetId: string;
  activeSheetId: string;
};

export type SetSheetPropertiesCommand = {
  type: "setSheetProperties";
  sheetId: string;
  properties: SheetProperties;
  /** Active sheet to restore when this command is used as an inverse. */
  activeSheetId?: string;
};

export type RenameSheetCommand = {
  type: "renameSheet";
  sheetId: string;
  name: string;
  /** Exact raw formula sources restored by a rename inverse. */
  formulaSources?: FormulaSourceRestore[];
  /** Exact conditional-format formula sources restored by a rename inverse. */
  conditionalFormatFormulaSources?: ConditionalFormatFormulaSourceRestore[];
};

/** Exact formula source associated with a command inverse. */
export type FormulaSourceRestore = {
  sheetId: string;
  address: CellAddress;
  source: string;
};

export type ConditionalFormatFormulaSourceRestore = {
  sheetId: string;
  ruleId: string;
  /** Formula slot within the rule; omitted by older command snapshots. */
  formulaIndex?: number;
  source: string;
};

export type UpsertDefinedNameCommand = {
  type: "upsertDefinedName";
  definition: DefinedName;
  /** Exact raw formula sources restored by a defined-name rename inverse. */
  formulaSources?: FormulaSourceRestore[];
};

export type DeleteDefinedNameCommand = {
  type: "deleteDefinedName";
  id: string;
};

/** Adds or removes names as one history entry, without renaming existing definitions. */
export type SetDefinedNamesCommand = {
  type: "setDefinedNames";
  changes: Array<{ id: string; definition: DefinedName | null }>;
};

export type MoveSheetCommand = {
  type: "moveSheet";
  sheetId: string;
  /** Final zero-based sheet index after the move. */
  toIndex: number;
};

export type InsertSheetAxisCommand = {
  type: "insertSheetAxis";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  count: number;
};

export type DeleteSheetAxisCommand = {
  type: "deleteSheetAxis";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  count: number;
};

export type MoveSheetAxisCommand = {
  type: "moveSheetAxis";
  sheetId: string;
  axis: SheetDimensionAxis;
  /** First source row or column. */
  index: number;
  count: number;
  /** Final first row or column after the move. */
  toIndex: number;
  /** `overwrite` is reserved for a future Shift-drag contract. */
  mode?: "insert" | "overwrite";
};

export type RestoreFullSheetStateCommand = {
  type: "restoreSheetState";
  sheetId: string;
  state: SheetSparseState;
  workbookFormulaSources?: FormulaSourceRestore[];
  conditionalFormatFormulaSources?: ConditionalFormatFormulaSourceRestore[];
  definedNames?: DefinedName[];
};
export type SetSheetDuplicateRulesCommand = {
  type: "setSheetDuplicateRules";
  sheetId: string;
  rules: import("../workbook.js").SheetDuplicateRule[];
};
export type ClearSheetDuplicateRulesCommand = {
  type: "clearSheetDuplicateRules";
  sheetId: string;
  kind: "highlight" | "reject";
  range?: CellRange;
};
export type SetSheetConditionalFormatsCommand = {
  type: "setSheetConditionalFormats";
  sheetId: string;
  rules: SheetConditionalFormatRule[];
};
export type SetSheetPageSetupCommand = {
  type: "setSheetPageSetup";
  sheetId: string;
  pageSetup: SheetPageSetup;
};
export type SetSheetPageDecorationCommand = {
  type: "setSheetPageDecoration";
  sheetId: string;
  decoration: SheetPageDecoration;
};
/** Sets or clears one watermark across multiple sheets as one history action. */
export type SetSheetsWatermarkCommand = {
  type: "setSheetsWatermark";
  sheetIds: string[];
  /** Omitted to remove each target's watermark while retaining its background. */
  watermark?: SheetWatermark;
  /** Internal per-sheet inverse for lossless undo. */
  watermarks?: Array<{ sheetId: string; watermark?: SheetWatermark }>;
  /** Optional catalog replacement performed atomically with the sheet updates. */
  watermarkPresets?: WatermarkPreset[];
};
/** Replaces the workbook-local saved watermark gallery. */
export type SetWorkbookWatermarkPresetsCommand = {
  type: "setWorkbookWatermarkPresets";
  presets: WatermarkPreset[];
};
export type ClearSheetConditionalFormatsCommand = {
  type: "clearSheetConditionalFormats";
  sheetId: string;
  range?: CellRange;
};

export type SheetAxisSparseSlice = {
  cells: SheetSparseCell[];
  dimensions: SheetSparseDimension[];
  /** Hidden indexes removed by the structural operation. */
  hiddenIndexes?: number[];
  /** Images removed from the structural operation, preserving their sheet order. */
  floatingImages: Array<{ image: FloatingImage; index: number }>;
  /** Exact raw formula sources before the structural change, for lossless undo. */
  formulaSources?: Array<{ address: CellAddress; source: string }>;
  workbookFormulaSources?: FormulaSourceRestore[];
  conditionalFormatFormulaSources?: ConditionalFormatFormulaSourceRestore[];
  definedNames?: DefinedName[];
  /** Exact sheet metadata before the structural change. */
  metadata: SheetMetadata;
};

/**
 * An inverse for a structural axis change. `operation` is the original
 * operation being reversed; its slice contains only the deleted or truncated
 * sparse entries needed to restore it.
 */
export type RestoreSheetAxisSliceCommand = {
  type: "restoreSheetState";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  operation: "insert" | "delete";
  slice: SheetAxisSparseSlice;
};

export type RestoreSheetStateCommand = RestoreFullSheetStateCommand | RestoreSheetAxisSliceCommand;

export type SetWorkbookDateSystemCommand = {
  type: "setWorkbookDateSystem";
  dateSystem: ExcelDateSystem;
};

export type SetWorkbookCalculationCommand = {
  type: "setWorkbookCalculation";
  calculation: WorkbookCalculationSettings;
};
export type SetWorkbookThemeCommand = {
  type: "setWorkbookTheme";
  theme: WorkbookTheme;
  /** Internal exact snapshots used for undoing theme-bound named cell styles. */
  cellStates?: Array<{
    sheetId: string;
    address: CellAddress;
    style: CellStyle | null;
    namedStyle: CellNamedStyleBinding | null;
  }>;
  /** Internal exact snapshots used for undoing theme-bound structured table styles. */
  tableStyles?: Array<{ sheetId: string; tableId: string; style: TableStyleDefinition | null }>;
};

export type WorkbookCommand =
  | SetSheetProtectionCommand
  | SetWorkbookStructureProtectionCommand
  | SetWorkbookDateSystemCommand
  | SetWorkbookCalculationCommand
  | SetWorkbookThemeCommand
  | SetDefinedNamesCommand
  | SetCellContentsCommand
  | ClearCellRangeCommand
  | CreateTableCommand
  | UpdateTableCommand
  | ResizeTableCommand
  | RemoveTableCommand
  | ApplyTableStyleToRangeCommand
  | SetWorkbookTableStylesCommand
  | SetWorkbookPivotTableStylesCommand
  | SetWorkbookCellStylesCommand
  | RestoreTableTransactionCommand
  | MoveCellRangeCommand
  | InsertCellsCommand
  | DeleteCellsCommand
  | RestoreCellShiftCommand
  | BatchDeleteSheetAxesCommand
  | ApplyCellStyleCommand
  | SetCellHyperlinkCommand
  | SetCellNotesCommand
  | MarkCellHyperlinkVisitedCommand
  | ApplyCellBordersCommand
  | ApplyCellFormatCommand
  | AdjustCellNumberFormatDecimalsCommand
  | AdjustCellIndentCommand
  | RestoreCellStylesCommand
  | ResizeSheetDimensionCommand
  | ResizeSheetDimensionsCommand
  | SetSheetDimensionSizesCommand
  | SetSheetDimensionHiddenCommand
  | ResetSheetDimensionSizesCommand
  | SetSheetDefaultColumnWidthCommand
  | RestoreSheetDimensionStateCommand
  | SetSheetFreezePanesCommand
  | MergeCellsCommand
  | UnmergeCellsCommand
  | SetSheetFilterCommand
  | SortSheetRangeCommand
  | AdvancedFilterCommand
  | SplitColumnCommand
  | RemoveDuplicatesCommand
  | ApplySubtotalsCommand
  | RemoveSubtotalsCommand
  | SetSheetDataValidationsCommand
  | SetSheetDuplicateRulesCommand
  | ClearSheetDuplicateRulesCommand
  | SetSheetConditionalFormatsCommand
  | SetSheetPageSetupCommand
  | SetSheetPageDecorationCommand
  | SetSheetsWatermarkCommand
  | SetWorkbookWatermarkPresetsCommand
  | ClearSheetConditionalFormatsCommand
  | ClearSheetDataValidationsCommand
  | AddSheetOutlineGroupCommand
  | RemoveSheetOutlineGroupCommand
  | SetSheetOutlineGroupCollapsedCommand
  | SetSheetOutlineGroupsCollapsedCommand
  | SetSheetOutlineLevelCommand
  | ClearSheetOutlineCommand
  | UngroupSheetRangeCommand
  | SetSheetFloatingImagesCommand
  | SetFloatingImageCommand
  | DeleteFloatingImageCommand
  | ConvertFloatingImageToCellCommand
  | ConvertCellImageToFloatingCommand
  | RestoreFloatingImageToCellCommand
  | AddSheetCommand
  | DeleteSheetCommand
  | SetSheetPropertiesCommand
  | RenameSheetCommand
  | UpsertDefinedNameCommand
  | DeleteDefinedNameCommand
  | MoveSheetCommand
  | InsertSheetAxisCommand
  | DeleteSheetAxisCommand
  | MoveSheetAxisCommand
  | RestoreSheetStateCommand;

export type WorkbookOperation =
  | "workbook.dateSystem"
  | "workbook.calculation"
  | "workbook.theme"
  | "workbook.cellStyles"
  | "cells.edit"
  | "cells.paste"
  | "cells.move"
  | "cells.insert"
  | "cells.delete"
  | "cells.clear"
  | "table.create"
  | "table.update"
  | "table.remove"
  | "table.styles"
  | "history.restore"
  | "format.cells"
  | "review.note"
  | "format.borders"
  | "dimensions.resize"
  | "dimensions.hide"
  | "dimensions.reset"
  | "dimensions.defaultWidth"
  | "view.freeze"
  | "page.setup"
  | "page.decoration"
  | "cells.merge"
  | "cells.unmerge"
  | "data.filter"
  | "data.sort"
  | "data.validation"
  | "format.conditional"
  | "data.outline"
  | "data.transform"
  | "data.subtotal"
  | "images.floating.set"
  | "images.floating.delete"
  | "images.floating.convert"
  | "images.cell.convert"
  | "sheets.add"
  | "sheets.delete"
  | "sheets.properties"
  | "sheets.rename"
  | "sheets.move"
  | "formulas.names"
  | "structure.insert"
  | "structure.delete"
  | "structure.move"
  | "history.restore";

export function getWorkbookOperation(command: WorkbookCommand): WorkbookOperation {
  switch (command.type) {
    case "setWorkbookStructureProtection":
    case "setSheetProtection":
      return "sheets.properties";
    case "setWorkbookDateSystem":
      return "workbook.dateSystem";
    case "setWorkbookCalculation":
      return "workbook.calculation";
    case "setWorkbookTheme":
      return "workbook.theme";
    case "setWorkbookCellStyles":
      return "workbook.cellStyles";
    case "setCellContents":
      return "cells.edit";
    case "clearCellRange":
      return "cells.clear";
    case "createTable":
      return "table.create";
    case "updateTable":
    case "resizeTable":
      return "table.update";
    case "removeTable":
      return "table.remove";
    case "applyTableStyleToRange":
      return "table.styles";
    case "setWorkbookTableStyles":
    case "setWorkbookPivotTableStyles":
      return "table.styles";
    case "restoreTableTransaction":
      return "history.restore";
    case "moveCellRange":
      return "cells.move";
    case "insertCells":
      return "cells.insert";
    case "deleteCells":
      return "cells.delete";
    case "restoreCellShift":
      return "history.restore";
    case "batchDeleteSheetAxes":
      return "history.restore";
    case "applyCellStyle":
    case "setCellHyperlink":
    case "markCellHyperlinkVisited":
    case "adjustCellNumberFormatDecimals":
    case "adjustCellIndent":
      return "format.cells";
    case "setCellNotes":
      return "review.note";
    case "applyCellBorders":
      return "format.borders";
    case "applyCellFormat":
      return "format.cells";
    case "restoreCellStyles":
    case "restoreSheetState":
      return "history.restore";
    case "resizeSheetDimension":
    case "resizeSheetDimensions":
    case "setSheetDimensionSizes":
      return "dimensions.resize";
    case "setSheetDimensionHidden":
      return "dimensions.hide";
    case "resetSheetDimensionSizes":
      return "dimensions.reset";
    case "setSheetDefaultColumnWidth":
      return "dimensions.defaultWidth";
    case "restoreSheetDimensionState":
      return "history.restore";
    case "setSheetFreezePanes":
      return "view.freeze";
    case "setSheetPageSetup":
      return "page.setup";
    case "setSheetPageDecoration":
      return "page.decoration";
    case "setSheetsWatermark":
    case "setWorkbookWatermarkPresets":
      return "page.decoration";
    case "mergeCells":
      return "cells.merge";
    case "unmergeCells":
      return "cells.unmerge";
    case "setSheetFilter":
      return "data.filter";
    case "sortSheetRange":
      return "data.sort";
    case "advancedFilter":
      return "data.filter";
    case "splitColumn":
    case "removeDuplicates":
      return "data.transform";
    case "applySubtotals":
    case "removeSubtotals":
      return "data.subtotal";
    case "setSheetDataValidations":
    case "clearSheetDataValidations":
      return "data.validation";
    case "setSheetDuplicateRules":
    case "clearSheetDuplicateRules":
      return "data.validation";
    case "setSheetConditionalFormats":
    case "clearSheetConditionalFormats":
      return "format.conditional";
    case "addSheetOutlineGroup":
    case "removeSheetOutlineGroup":
    case "setSheetOutlineGroupCollapsed":
    case "setSheetOutlineGroupsCollapsed":
    case "setSheetOutlineLevel":
    case "clearSheetOutline":
    case "ungroupSheetRange":
      return "data.outline";
    case "setSheetFloatingImages":
    case "setFloatingImage":
      return "images.floating.set";
    case "deleteFloatingImage":
      return "images.floating.delete";
    case "convertFloatingImageToCell":
      return "images.floating.convert";
    case "convertCellImageToFloating":
      return "images.cell.convert";
    case "restoreFloatingImageToCell":
      return "history.restore";
    case "addSheet":
      return "sheets.add";
    case "deleteSheet":
      return "sheets.delete";
    case "setSheetProperties":
      return "sheets.properties";
    case "renameSheet":
      return "sheets.rename";
    case "moveSheet":
      return "sheets.move";
    case "upsertDefinedName":
    case "deleteDefinedName":
    case "setDefinedNames":
      return "formulas.names";
    case "insertSheetAxis":
      return "structure.insert";
    case "deleteSheetAxis":
      return "structure.delete";
    case "moveSheetAxis":
      return "structure.move";
  }
}
