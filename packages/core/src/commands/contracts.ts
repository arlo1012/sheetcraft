import type { SheetSnapshotV1 } from "../serialization.js";
import type { CellBorderAction, CellStyle, CellStylePatch } from "../style.js";
import type {
  CellAddress,
  CellRange,
  CellValue,
  SheetDimensionAxis,
  SheetSparseState,
} from "../workbook.js";

export type CellValueChange = {
  sheetId: string;
  address: CellAddress;
  value: CellValue;
  style?: CellStyle | null;
};

export type SetCellValuesCommand = {
  type: "setCellValues";
  changes: CellValueChange[];
  reconcileBorders?: true;
};

export type ClearCellRangeCommand = {
  type: "clearCellRange";
  sheetId: string;
  range: CellRange;
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

export type AddSheetCommand = {
  type: "addSheet";
  sheet: SheetSnapshotV1;
  index: number;
  activeSheetId: string;
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

export type RestoreSheetStateCommand = {
  type: "restoreSheetState";
  sheetId: string;
  state: SheetSparseState;
};

export type WorkbookCommand =
  | SetCellValuesCommand
  | ClearCellRangeCommand
  | ApplyCellStyleCommand
  | ApplyCellBordersCommand
  | RestoreCellStylesCommand
  | ResizeSheetDimensionCommand
  | AddSheetCommand
  | DeleteSheetCommand
  | RenameSheetCommand
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
  | "sheets.add"
  | "sheets.delete"
  | "sheets.rename"
  | "structure.insert"
  | "structure.delete"
  | "history.restore";

export function getWorkbookOperation(command: WorkbookCommand): WorkbookOperation {
  switch (command.type) {
    case "setCellValues":
      return "cells.edit";
    case "clearCellRange":
      return "cells.clear";
    case "applyCellStyle":
      return "format.cells";
    case "applyCellBorders":
      return "format.borders";
    case "restoreCellStyles":
    case "restoreSheetState":
      return "history.restore";
    case "resizeSheetDimension":
      return "dimensions.resize";
    case "addSheet":
      return "sheets.add";
    case "deleteSheet":
      return "sheets.delete";
    case "renameSheet":
      return "sheets.rename";
    case "insertSheetAxis":
      return "structure.insert";
    case "deleteSheetAxis":
      return "structure.delete";
  }
}
