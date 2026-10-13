import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";

export type ShapeCanvasTextEditRequest = Readonly<{
  root: SheetDrawing;
  path?: ShapeGroupPath;
  selection: "all" | "end";
  /** A plain keyboard character appends to the existing drawing text. */
  text?: string;
}>;
