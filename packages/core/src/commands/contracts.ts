import type { SheetSnapshot } from "../serialization.js";
import type { CellContent } from "../formula/types.js";
import type { CellBorderAction, CellStyle, CellStylePatch } from "../style.js";
import type {
  CellAddress,
  CellRange,
  FreezePanes,
  SheetDimensionAxis,
  SheetFilter,
  SheetMetadata,
  SheetSparseCell,
  SheetSparseDimension,
  SheetSparseState,
  FloatingImage,
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

export type AdjustCellNumberFormatDecimalsCommand = {
  type: "adjustCellNumberFormatDecimals";
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

export type SetSheetFreezePanesCommand = {
  type: "setSheetFreezePanes";
  sheetId: string;
  freezePanes: FreezePanes;
};

export type MergeCellsCommand = {
  type: "mergeCells";
  sheetId: string;
  range: CellRange;
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
};

export type AddSheetCommand = {
  type: "addSheet";
  sheet: SheetSnapshot;
  index: number;
  activeSheetId: string;
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

export type DeleteSheetCommand = {
  type: "deleteSheet";
  sheetId: string;
  activeSheetId: string;
};

export type RenameSheetCommand = {
  type: "renameSheet";
  sheetId: string;
  name: string;
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

export type RestoreFullSheetStateCommand = {
  type: "restoreSheetState";
  sheetId: string;
  state: SheetSparseState;
};

export type SheetAxisSparseSlice = {
  cells: SheetSparseCell[];
  dimensions: SheetSparseDimension[];
  /** Images removed from the structural operation, preserving their sheet order. */
  floatingImages: Array<{ image: FloatingImage; index: number }>;
  /** Exact raw formula sources before the structural change, for lossless undo. */
  formulaSources?: Array<{ address: CellAddress; source: string }>;
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

export type WorkbookCommand =
  | SetCellContentsCommand
  | ClearCellRangeCommand
  | MoveCellRangeCommand
  | ApplyCellStyleCommand
  | ApplyCellBordersCommand
  | AdjustCellNumberFormatDecimalsCommand
  | RestoreCellStylesCommand
  | ResizeSheetDimensionCommand
  | SetSheetFreezePanesCommand
  | MergeCellsCommand
  | UnmergeCellsCommand
  | SetSheetFilterCommand
  | SortSheetRangeCommand
  | SetFloatingImageCommand
  | DeleteFloatingImageCommand
  | AddSheetCommand
  | DeleteSheetCommand
  | RenameSheetCommand
  | MoveSheetCommand
  | InsertSheetAxisCommand
  | DeleteSheetAxisCommand
  | RestoreSheetStateCommand;

export type WorkbookOperation =
  | "cells.edit"
  | "cells.paste"
  | "cells.move"
  | "cells.clear"
  | "format.cells"
  | "format.borders"
  | "dimensions.resize"
  | "view.freeze"
  | "cells.merge"
  | "cells.unmerge"
  | "data.filter"
  | "data.sort"
  | "images.floating.set"
  | "images.floating.delete"
  | "sheets.add"
  | "sheets.delete"
  | "sheets.rename"
  | "sheets.move"
  | "structure.insert"
  | "structure.delete"
  | "history.restore";

export function getWorkbookOperation(command: WorkbookCommand): WorkbookOperation {
  switch (command.type) {
    case "setCellContents":
      return "cells.edit";
    case "clearCellRange":
      return "cells.clear";
    case "moveCellRange":
      return "cells.move";
    case "applyCellStyle":
    case "adjustCellNumberFormatDecimals":
      return "format.cells";
    case "applyCellBorders":
      return "format.borders";
    case "restoreCellStyles":
    case "restoreSheetState":
      return "history.restore";
    case "resizeSheetDimension":
      return "dimensions.resize";
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
    case "setFloatingImage":
      return "images.floating.set";
    case "deleteFloatingImage":
      return "images.floating.delete";
    case "addSheet":
      return "sheets.add";
    case "deleteSheet":
      return "sheets.delete";
    case "renameSheet":
      return "sheets.rename";
    case "moveSheet":
      return "sheets.move";
    case "insertSheetAxis":
      return "structure.insert";
    case "deleteSheetAxis":
      return "structure.delete";
  }
}
