import type { CellRange, SheetDimensionAxis } from "@idea10/core/workbook";
import type { CellMergeMode } from "@idea10/core/commands";
import type { CellStylePatch, CellBorderAction, CellBorderFormatPatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import type { HomeDataToolState, MergeCellsState } from "../home-tools/components/data-tool-state";

export type SheetContextMenuState = {
  format: SelectionCellStyleState;
  formattingDisabled: boolean;
  data: HomeDataToolState;
  merge: MergeCellsState;
};

export type SheetContextAction =
  | { type: "insert"; axis: SheetDimensionAxis; direction: "before" | "after"; count: number }
  | { type: "delete"; axis: SheetDimensionAxis }
  | { type: "resize"; axis: SheetDimensionAxis; size: number }
  | { type: "autoFit"; axis: SheetDimensionAxis }
  | { type: "visibility"; axis: SheetDimensionAxis; hidden: boolean }
  | {
      type: "cellOperation";
      operation: "insert" | "delete";
      direction: "right" | "down" | "left" | "up" | "row" | "column";
    }
  | { type: "deleteEmptyRows" }
  | { type: "clear"; mode: "contents" | "formats" | "all" }
  | { type: "formatCells" }
  | { type: "formatPainter" }
  | { type: "sort"; direction: "ascending" | "descending" }
  | { type: "filter" }
  | { type: "clearFilter" }
  | { type: "columnStatistics" }
  | { type: "chooseFromColumn" }
  | { type: "applyBorders"; action: CellBorderAction }
  | { type: "updateBorderFormat"; patch: CellBorderFormatPatch }
  | { type: "applyStyle"; patch: CellStylePatch }
  | { type: "merge"; mode: CellMergeMode }
  | { type: "unmerge" }
  | { type: "autoSum" };

export type SheetContextRequest = {
  action: SheetContextAction;
  range: CellRange;
};
