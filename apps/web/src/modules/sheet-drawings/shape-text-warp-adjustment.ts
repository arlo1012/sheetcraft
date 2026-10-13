import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeAdjustmentHandle } from "@sheetcraft/core/shape-presets";
import {
  evaluateTextWarp,
  moveTextWarpAdjustment,
  TEXT_WARP_GEOMETRY_LIMITS,
  type ShapeTextWarp,
} from "@sheetcraft/core/text-warps";
import { standardShapeFlipPoint } from "./shape-geometry";
import { getDrawingShapeTextRect } from "./shape-text-runtime";
import type { ShapeTextRect } from "./shape-text-layout";

type Point = Readonly<{ x: number; y: number }>;
export type DrawingShapeTextWarpAdjustment = Readonly<{
  /** Original declared handle identity; filtering never renumbers handles. */
  index: number;
  kind: ShapeAdjustmentHandle["kind"];
  fields: ShapeAdjustmentHandle["fields"];
  /** Unreflected body-local position, including the actual native textRect origin. */
  position: Point;
  /** Painted body-local position, before the caller applies frame rotation. */
  paintedPosition: Point;
}>;

function finitePoint(point: Point): boolean {
  return (
    !!point &&
    [point.x, point.y].every(
      (value) =>
        Number.isFinite(value) && Math.abs(value) <= TEXT_WARP_GEOMETRY_LIMITS.maximumCoordinate,
    )
  );
}

function selectable(handle: ShapeAdjustmentHandle): boolean {
  return (
    handle.fields.length > 0 &&
    !handle.fields.some((field) => field.disabled) &&
    handle.fields.every((field) =>
      [field.minimum, field.maximum, field.value].every(Number.isFinite),
    ) &&
    handle.fields.some((field) => field.maximum > field.minimum)
  );
}

function source(drawing: SheetGraphicDrawing):
  | {
      warp: ShapeTextWarp;
      textRect: ShapeTextRect;
      handles: readonly ShapeAdjustmentHandle[];
    }
  | undefined {
  const warp = drawing.shapeText?.warp;
  if (
    !warp ||
    (drawing.kind !== "shape" && drawing.kind !== "textBox") ||
    ![drawing.width, drawing.height].every((value) => Number.isFinite(value) && value > 0)
  )
    return;
  try {
    // Active warps retain the exact native, unreflected rectangle here. Physical
    // margins, glyph ink, body bounds and reflected text bounds are not substitutes.
    const textRect = getDrawingShapeTextRect(drawing);
    if (!textRect || !finitePoint(textRect)) return;
    const geometry = evaluateTextWarp(warp, textRect.width, textRect.height);
    return { warp, textRect, handles: geometry.handles };
  } catch {
    return;
  }
}

/** Selectable glyph-transform handles, independent of ordinary body adjustment handles. */
export function getDrawingShapeTextWarpAdjustments(
  drawing: SheetGraphicDrawing,
): readonly DrawingShapeTextWarpAdjustment[] {
  const value = source(drawing);
  if (!value) return [];
  return value.handles.flatMap((handle, index) => {
    if (!selectable(handle)) return [];
    const position = {
      x: value.textRect.x + handle.position.x,
      y: value.textRect.y + handle.position.y,
    };
    const paintedPosition = standardShapeFlipPoint(drawing, position);
    if (!finitePoint(position) || !finitePoint(paintedPosition)) return [];
    return [{ index, kind: handle.kind, fields: handle.fields, position, paintedPosition }];
  });
}

/**
 * Invert a painted body-local target through full-frame reflection and the exact
 * native textRect origin. World-to-frame rotation belongs to the caller.
 * No text, layout, style, body geometry, dimensions or frame fields are changed.
 */
export function moveDrawingShapeTextWarpAdjustment(
  drawing: SheetGraphicDrawing,
  handleIndex: number,
  paintedLocalTarget: Point,
): SheetGraphicDrawing | undefined {
  if (!Number.isSafeInteger(handleIndex) || handleIndex < 0 || !finitePoint(paintedLocalTarget))
    return;
  const value = source(drawing);
  const handle = value?.handles[handleIndex];
  if (!value || !handle || !selectable(handle)) return;
  const local = standardShapeFlipPoint(drawing, paintedLocalTarget);
  try {
    const warp = moveTextWarpAdjustment(
      value.warp,
      value.textRect.width,
      value.textRect.height,
      handleIndex,
      { x: local.x - value.textRect.x, y: local.y - value.textRect.y },
    );
    // Verify in the same original rectangle, never a moved body-size approximation.
    evaluateTextWarp(warp, value.textRect.width, value.textRect.height);
    return { ...drawing, shapeText: { ...drawing.shapeText!, warp } };
  } catch {
    return;
  }
}

/** Keyboard deltas use painted frame axes, matching the visible selection handle. */
export function nudgeDrawingShapeTextWarpAdjustment(
  drawing: SheetGraphicDrawing,
  handleIndex: number,
  paintedLocalDelta: Point,
): SheetGraphicDrawing | undefined {
  if (!finitePoint(paintedLocalDelta)) return;
  const handle = getDrawingShapeTextWarpAdjustments(drawing).find(
    (candidate) => candidate.index === handleIndex,
  );
  return handle
    ? moveDrawingShapeTextWarpAdjustment(drawing, handleIndex, {
        x: handle.paintedPosition.x + paintedLocalDelta.x,
        y: handle.paintedPosition.y + paintedLocalDelta.y,
      })
    : undefined;
}
