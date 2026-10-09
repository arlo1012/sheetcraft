import type { CellFillMode } from "@idea10/core/cell-autofill";
import type { CellRange } from "@idea10/core/workbook";

export type GridFillFeedback =
  | "rangeTooLarge"
  | "readOnly"
  | "pivotResultProtected"
  | "mergedCells"
  | "hiddenCells"
  | "outOfBounds"
  | "documentChanged"
  | "unsupportedContent"
  | "noAdjacentData"
  | "duplicate"
  | "failed";

export type GridFillSession = Readonly<{
  id: number;
  sheetId: string;
  range: CellRange;
  mode: CellFillMode;
  availableModes: readonly CellFillMode[];
  revision: number;
}>;

export type GridFillRequest =
  | {
      type: "fill";
      sheetId: string;
      source: CellRange;
      range: CellRange;
      revision: number;
      copy?: boolean;
    }
  | { type: "mode"; sessionId: number; mode: CellFillMode };

export type GridFillResult =
  | { ok: true; session: GridFillSession }
  | { ok: false; reason: GridFillFeedback };
