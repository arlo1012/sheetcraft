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
  DefinedName,
} from "../workbook.js";

export type CellContentChange = {
  sheetId: string;
  address: CellAddress;
  content: CellContent | null;
  style?: CellStyle | null;
};

export type SetCellContentsCommand = {
  type: "setCellContents";
  changes: CellContentChange[];
  reconcileBorders?: true;
};

export type ClearCellRangeCommand = {
  type: "clearCellRange";
  sheetId: string;
  range: CellRange;
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
  changes: Array<{ address: CellAddress; style: CellStyle | null }>;
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

export type SortSheetRangeCommand = {
  type: "sortSheetRange";
  sheetId: string;
  range: CellRange;
  keyColumn: number;
  direction: SortDirection;
  sortKeys?: Array<{ column: number; direction: SortDirection }>;
  hasHeader?: boolean;
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
export type SplitColumnCommand = {
  type: "splitColumn";
  sheetId: string;
  sourceColumn: number;
  range?: CellRange;
  destinationColumn: number;
  mode: "delimiter" | "fixedWidth";
  delimiter?: string;
  fixedWidths?: number[];
  parseQuoted?: boolean;
  columnTypes?: Array<"general" | "text">;
  overwrite?: boolean;
};
export type RemoveDuplicatesCommand = {
  type: "removeDuplicates";
  sheetId: string;
  range: CellRange;
  keyColumns: number[];
  hasHeader?: boolean;
};
export type ApplySubtotalsCommand = {
  type: "applySubtotals";
  sheetId: string;
  range: CellRange;
  groupByColumns: number[];
  summaryColumns: number[];
  operation: "sum" | "count" | "average" | "min" | "max";
  hasHeader?: boolean;
  subtotalId?: string;
  labels?: { subtotal: string; grandTotal: string };
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
export type SetSheetOutlineLevelCommand = {
  type: "setSheetOutlineLevel";
  sheetId: string;
  axis: SheetDimensionAxis;
  level: number;
};

export type AddSheetCommand = {
  type: "addSheet";
  sheet: SheetSnapshot;
  index: number;
  activeSheetId: string;
  /** Formula text on surviving sheets restored by a delete-sheet inverse. */
  formulaSources?: FormulaSourceRestore[];
  definedNames?: DefinedName[];
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
};

/** Exact formula source associated with a command inverse. */
export type FormulaSourceRestore = {
  sheetId: string;
  address: CellAddress;
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

export type WorkbookCommand =
  | SetWorkbookDateSystemCommand
  | SetWorkbookCalculationCommand
  | SetDefinedNamesCommand
  | SetCellContentsCommand
  | ClearCellRangeCommand
  | MoveCellRangeCommand
  | InsertCellsCommand
  | DeleteCellsCommand
  | RestoreCellShiftCommand
  | BatchDeleteSheetAxesCommand
  | ApplyCellStyleCommand
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
  | ClearSheetDataValidationsCommand
  | AddSheetOutlineGroupCommand
  | RemoveSheetOutlineGroupCommand
  | SetSheetOutlineGroupCollapsedCommand
  | SetSheetOutlineLevelCommand
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
  | "cells.edit"
  | "cells.paste"
  | "cells.move"
  | "cells.insert"
  | "cells.delete"
  | "cells.clear"
  | "format.cells"
  | "format.borders"
  | "dimensions.resize"
  | "dimensions.hide"
  | "dimensions.reset"
  | "dimensions.defaultWidth"
  | "view.freeze"
  | "cells.merge"
  | "cells.unmerge"
  | "data.filter"
  | "data.sort"
  | "data.validation"
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
    case "setWorkbookDateSystem":
      return "workbook.dateSystem";
    case "setWorkbookCalculation":
      return "workbook.calculation";
    case "setCellContents":
      return "cells.edit";
    case "clearCellRange":
      return "cells.clear";
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
    case "adjustCellNumberFormatDecimals":
    case "adjustCellIndent":
      return "format.cells";
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
    case "addSheetOutlineGroup":
    case "removeSheetOutlineGroup":
    case "setSheetOutlineGroupCollapsed":
    case "setSheetOutlineLevel":
      return "data.outline";
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
