import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { CellAddress } from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "./drawing-defaults";
import { frameShapeView } from "./shape-view-layout";
import { materializeWordArtStylePreset, type WordArtStylePreset } from "./wordart-style-presets";

export type ModernWordArtInsertionOptions = {
  id: string;
  name: string;
  placeholder: string;
  address: CellAddress;
  metrics: PictureSheetMetrics;
  choice: WordArtStylePreset | string;
  /** A real preferred family supplied by the host. Omit to inherit the app font stack. */
  fontFamily?: string;
};

/** New WordArt is ordinary source-editable shape text. Legacy kind=wordArt stays separate. */
export function createModernWordArtDrawing(
  options: ModernWordArtInsertionOptions,
): SheetFramedGraphicDrawing {
  const { address, metrics } = options;
  if (
    !Number.isSafeInteger(address.row) ||
    !Number.isSafeInteger(address.column) ||
    address.row < 0 ||
    address.column < 0 ||
    address.row >= metrics.rows.count ||
    address.column >= metrics.columns.count
  )
    throw new RangeError("WordArt insertion address is outside the worksheet.");
  const base = createGraphicDrawing(options.id, "shape", options.name, { ...address });
  const shapeText = base.shapeText!;
  const framed = frameShapeView(
    {
      ...base,
      wordArt: true,
      text: options.placeholder,
      fontSize: 96,
      bold: true,
      italic: false,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      shapeStyle: { fill: { kind: "none" }, line: { kind: "none" } },
      shapeText: {
        ...shapeText,
        layout: { ...shapeText.layout, wrap: false, overflow: true, autoFit: "resize-shape" },
        ...(options.fontFamily === undefined ? {} : { fontFamily: options.fontFamily }),
        style: materializeWordArtStylePreset(options.choice),
      },
    },
    metrics,
    "move-only",
  );
  // Canonical properties are sparse: absent means aspect=false, locked=true, print=true.
  return normalizeSheetDrawing(framed);
}
