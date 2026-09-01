import type { Point } from "./geometry.js";
import { createCellSelection, type CellSelection } from "./selection.js";
import { createGridExtent, type GridExtent } from "./extent.js";

export type SheetGridViewState = {
  selection: CellSelection;
  scrollPosition: Point;
  gridExtent: GridExtent;
};

export function createSheetGridViewState(options?: {
  selection?: CellSelection;
  scrollPosition?: Point;
  gridExtent?: GridExtent;
}): SheetGridViewState {
  return {
    selection: options?.selection
      ? {
          active: { ...options.selection.active },
          anchor: { ...options.selection.anchor },
          focus: { ...options.selection.focus },
          mode: options.selection.mode,
        }
      : createCellSelection({ row: 0, column: 0 }),
    scrollPosition: options?.scrollPosition ? { ...options.scrollPosition } : { x: 0, y: 0 },
    gridExtent: options?.gridExtent ? { ...options.gridExtent } : createGridExtent(),
  };
}
