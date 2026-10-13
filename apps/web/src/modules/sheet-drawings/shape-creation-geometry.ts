import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import { reanchorFloatingImageAtSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { ShapeGalleryChoice } from "./shape-gallery";

export type ShapeCreationPoint = Readonly<{ x: number; y: number }>;
export type ShapeCreationViewportPoint = Readonly<{
  point: ShapeCreationPoint;
  paneId: FrozenPaneId;
}>;
export type ShapeDrawingCreationRequest = Readonly<{
  /** Supplies a fresh identity and valid ordinary appearance fields; never mutated. */
  base: SheetGraphicDrawing;
  choice: ShapeGalleryChoice;
  start: ShapeCreationPoint;
  /** Required for a drag. Clicks use the choice's default dimensions. */
  end?: ShapeCreationPoint;
  layout: SheetViewportLayout;
  mode: "click" | "drag";
  /** Filled shapes/text boxes become squares; lines snap to the nearest 45 degrees. */
  shiftKey?: boolean;
}>;

export const SHAPE_CREATION_LIMITS = Object.freeze({
  extent: 16_384,
  coordinate: 10_000_000,
  endpointError: 0.5,
});
const paneIds: readonly FrozenPaneId[] = ["topLeft", "top", "left", "body"];
type Rect = { x: number; y: number; width: number; height: number };

function finitePoint(point: ShapeCreationPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
function sheetPointWithinBounds(point: ShapeCreationPoint, layout: SheetViewportLayout): boolean {
  const total = layout.getTotalSize();
  return (
    finitePoint(point) &&
    Number.isFinite(total.width) &&
    Number.isFinite(total.height) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= Math.min(total.width, SHAPE_CREATION_LIMITS.coordinate) &&
    point.y <= Math.min(total.height, SHAPE_CREATION_LIMITS.coordinate)
  );
}
function contains(rect: Rect, point: ShapeCreationPoint): boolean {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

/**
 * Inverts the drawing layer's pane translation without rounding to a cell.
 * Input is local to the grid viewport (the caller subtracts headers and zoom).
 * A fresh pointer-down must hit a nonempty pane clip and a real cell; page
 * margins/gaps and headers are rejected. Clips use half-open right/bottom edges.
 *
 * After pointer capture, supplying the original pane permits movement beyond
 * its clip, including across frozen boundaries. That same pane's affine mapping
 * remains authoritative: there is no pane switch, autoscroll or origin clamp.
 * Negative, nonfinite, outside-sheet and over-budget results return null. The
 * caller must cancel capture if its layout changes during the gesture.
 */
export function shapeCreationPointFromViewport(
  point: ShapeCreationPoint,
  layout: SheetViewportLayout,
  capturedPaneId?: FrozenPaneId,
): ShapeCreationViewportPoint | null {
  if (!finitePoint(point)) return null;
  const paneId = capturedPaneId ?? paneIds.find((id) => contains(layout.panes[id].clip, point));
  if (!paneId || !paneIds.includes(paneId)) return null;
  const clip = layout.panes[paneId].clip;
  if (clip.width <= 0 || clip.height <= 0) return null;
  const translation = getPicturePaneTranslation(paneId, layout);
  const sheetPoint = { x: point.x - translation.x, y: point.y - translation.y };
  if (!sheetPointWithinBounds(sheetPoint, layout)) return null;
  if (capturedPaneId === undefined) {
    const address = layout.getCellAtViewportPoint(point);
    if (!address) return null;
    const merged = layout.getMergedRangeAt(address);
    const cell = merged ? layout.getRangeRect(merged) : layout.getCellRect(address);
    if (!cell || !contains(cell, sheetPoint)) return null;
  }
  return { point: sheetPoint, paneId };
}

function clickSize(choice: ShapeGalleryChoice): Readonly<{ width: number; height: number }> {
  if (choice.kind === "line") return { width: 120, height: choice.preset === "line" ? 1 : 80 };
  if (choice.kind === "textBox" && choice.direction === "vertical")
    return { width: 120, height: 240 };
  return { width: 240, height: 120 };
}
function constrainedDelta(dx: number, dy: number, line: boolean): ShapeCreationPoint {
  if (!line) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: dx < 0 ? -side : side, y: dy < 0 ? -side : side };
  }
  const length = Math.hypot(dx, dy);
  const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  // Exact zero on the cardinal axes avoids accidental flips or off-axis drift.
  const diagonal = length / Math.SQRT2;
  switch (octant) {
    case 0:
      return { x: length, y: 0 };
    case 1:
      return { x: diagonal, y: diagonal };
    case 2:
      return { x: 0, y: length };
    case 3:
      return { x: -diagonal, y: diagonal };
    case 4:
      return { x: -length, y: 0 };
    case 5:
      return { x: -diagonal, y: -diagonal };
    case 6:
      return { x: 0, y: -length };
    default:
      return { x: diagonal, y: -diagonal };
  }
}
function rectWithinBounds(rect: Rect, layout: SheetViewportLayout): boolean {
  return (
    [rect.width, rect.height].every(
      (extent) => Number.isFinite(extent) && extent >= 1 && extent <= SHAPE_CREATION_LIMITS.extent,
    ) &&
    sheetPointWithinBounds(rect, layout) &&
    sheetPointWithinBounds({ x: rect.x + rect.width, y: rect.y + rect.height }, layout)
  );
}

/**
 * Creates a detached drawing using continuous sheet-space gesture coordinates.
 * Click and drag are explicit: callers own their movement threshold. A zero
 * drag returns null. Invalid coordinates or extents are rejected, never clamped.
 * Presets/text boxes use an ordinary bounding rectangle with no drag flips.
 * Line/connector paths keep their original preset and begin/end decorations;
 * sparse flips map the canonical path start to the dragged start in all quadrants.
 *
 * Persisted dimensions must be >=1. A thin line axis is expanded symmetrically,
 * so each successful path endpoint remains within 0.5px Euclidean distance of
 * its requested endpoint (after Shift constraint). A drag too small to meet that
 * contract, or too close to a sheet border for symmetric expansion, returns
 * null. In particular, an exactly horizontal line at y=0 or vertical line at
 * x=0 is rejected; an ordinary click there can still create a default drawing.
 */
export function createShapeDrawingFromChoice(
  request: ShapeDrawingCreationRequest,
): SheetGraphicDrawing | null {
  const { base, choice, start, end, layout, mode, shiftKey = false } = request;
  if (choice.kind === "drawingTool" || !sheetPointWithinBounds(start, layout)) return null;
  const isLine = choice.kind === "line";
  let dx = 0,
    dy = 0,
    rect: Rect;
  if (mode === "click") {
    rect = { ...start, ...clickSize(choice) };
  } else {
    if (!end || !sheetPointWithinBounds(end, layout)) return null;
    dx = end.x - start.x;
    dy = end.y - start.y;
    if (
      (dx === 0 && dy === 0) ||
      Math.abs(dx) > SHAPE_CREATION_LIMITS.extent ||
      Math.abs(dy) > SHAPE_CREATION_LIMITS.extent
    )
      return null;
    if (shiftKey) {
      const constrained = constrainedDelta(dx, dy, isLine);
      dx = constrained.x;
      dy = constrained.y;
    }
    const target = { x: start.x + dx, y: start.y + dy };
    if (!sheetPointWithinBounds(target, layout)) return null;
    const width = Math.max(1, Math.abs(dx)),
      height = Math.max(1, Math.abs(dy));
    const padX = isLine ? (width - Math.abs(dx)) / 2 : 0,
      padY = isLine ? (height - Math.abs(dy)) / 2 : 0;
    if (isLine && Math.hypot(padX, padY) > SHAPE_CREATION_LIMITS.endpointError) return null;
    rect = {
      x: Math.min(start.x, target.x) - padX,
      y: Math.min(start.y, target.y) - padY,
      width,
      height,
    };
  }
  if (!rectWithinBounds(rect, layout)) return null;

  const drawing = { ...base, anchor: { ...base.anchor }, rotation: 0 };
  delete drawing.shapeGeometry;
  delete drawing.shapeLineEnds;
  delete drawing.textDirection;
  delete drawing.shapeFlipX;
  delete drawing.shapeFlipY;
  if (choice.kind === "textBox") {
    drawing.kind = "textBox";
    drawing.shape = "rectangle";
    drawing.fill = "#ffffff";
    drawing.stroke = "#bcbcbc";
    drawing.strokeWidth = 1;
    if (drawing.shapeText) {
      drawing.shapeText = {
        ...drawing.shapeText,
        layout: {
          ...drawing.shapeText.layout,
          direction: choice.direction === "vertical" ? "vertical-rl" : "horizontal",
        },
      };
    } else if (choice.direction === "vertical") drawing.textDirection = "vertical";
  } else {
    drawing.kind = "shape";
    drawing.shape = isLine ? "line" : "rectangle";
    drawing.shapeGeometry = { preset: choice.preset };
    if (choice.kind === "line") {
      drawing.fill = "transparent";
      if (choice.beginArrow === "triangle" || choice.endArrow === "triangle")
        drawing.shapeLineEnds = {
          ...(choice.beginArrow === "triangle" ? { begin: { kind: "triangle" as const } } : {}),
          ...(choice.endArrow === "triangle" ? { end: { kind: "triangle" as const } } : {}),
        };
      if (dx < 0) drawing.shapeFlipX = true;
      if (dy < 0) drawing.shapeFlipY = true;
    }
  }
  const anchored = reanchorFloatingImageAtSheetRect(drawing, rect, layout);
  if (
    !anchored ||
    ![anchored.offsetX, anchored.offsetY].every(
      (offset) => Number.isFinite(offset) && offset >= 0 && offset <= 1_000_000,
    )
  )
    return null;
  // Merged anchors can precede the containing cell; the persisted offsets still
  // resolve to the same continuous position through the shared reanchor helper.
  return anchored;
}
