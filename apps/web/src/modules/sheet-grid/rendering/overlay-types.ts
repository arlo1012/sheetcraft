import type { SheetDimensionAxis } from "@sheetcraft/core/workbook";
import type { SheetViewportRangeFragment } from "@sheetcraft/sheet-engine/viewport-layout";

export type FormulaReferenceOverlay = Readonly<{
  key: string;
  colorIndex: number;
  rects: readonly SheetViewportRangeFragment[];
  active: boolean;
}>;

export type SheetFreezeDragOverlay = Readonly<{
  axis: SheetDimensionAxis;
  previewPosition: number;
  label: string;
}>;

export type SheetAxisOperationOverlay = Readonly<{
  axis: SheetDimensionAxis;
  offset: number;
  label: string;
}>;

export type FreezeHandleTarget = "rowStarter" | "columnStarter" | "rowBoundary" | "columnBoundary";

/** Visual state only. The fixed native buttons continue to own focus and pointer input. */
export type SheetFreezeHandlesOverlay = Readonly<{
  visible: boolean;
  disabled?: boolean;
  hovered?: FreezeHandleTarget | null;
  focused?: FreezeHandleTarget | null;
}>;

/**
 * All range fragments are in body viewport coordinates. The renderer translates
 * them through `frame.body` once, so overlay drawing and cell drawing share a
 * surface coordinate system without DOM positioning.
 */
export type SheetOverlayState = Readonly<{
  rangeRects?: readonly SheetViewportRangeFragment[];
  activeRects?: readonly SheetViewportRangeFragment[];
  editing?: boolean;
  referenceGroups?: readonly FormulaReferenceOverlay[];
  clipboardRects?: readonly SheetViewportRangeFragment[];
  clipboardMode?: "copy" | "cut" | null;
  fillPreviewRects?: readonly SheetViewportRangeFragment[];
  readingRects?: readonly SheetViewportRangeFragment[];
  readingColor?: string;
  freezeDrag?: SheetFreezeDragOverlay | null;
  axisOperationPreview?: SheetAxisOperationOverlay | null;
  freezeHandles?: SheetFreezeHandlesOverlay | null;
}>;

/** Resolved colors from the shared theme adapter; painters never inspect CSS. */
export type SheetOverlayPalette = Readonly<{
  actionPrimary: string;
  mutedText: string;
  panel: string;
  inverseText: string;
  iconHover: string;
  formulaReferenceColors: readonly string[];
  readingColor?: string;
}>;
