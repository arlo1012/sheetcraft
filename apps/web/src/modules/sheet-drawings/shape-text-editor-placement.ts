import type { CSSProperties } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getDrawingShapeTextRect } from "./shape-text-runtime";

/** The same logical viewport fragment as the drawing, before its owner zoom. */
export function shapeTextEditorPlacement(
  drawing: SheetGraphicDrawing,
  fragment: FloatingImageViewportFragment,
): Readonly<{ frame: CSSProperties; input: CSSProperties }> | undefined {
  const rect = getDrawingShapeTextRect(drawing);
  if (
    !rect ||
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      drawing.rotation,
      fragment.rect.x,
      fragment.rect.y,
      fragment.rect.width,
      fragment.rect.height,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    drawing.width <= 0 ||
    drawing.height <= 0
  )
    return;
  const sx = fragment.rect.width / drawing.width,
    sy = fragment.rect.height / drawing.height;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return;
  return {
    frame: {
      left: `${fragment.rect.x}px`,
      top: `${fragment.rect.y}px`,
      width: `${fragment.rect.width}px`,
      height: `${fragment.rect.height}px`,
      transform: `rotate(${drawing.rotation}deg)`,
      transformOrigin: "50% 50%",
    },
    input: {
      left: `${rect.x * sx}px`,
      top: `${rect.y * sy}px`,
      width: `${rect.width * sx}px`,
      height: `${rect.height * sy}px`,
      ...(drawing.shapeFlipY ? { transform: "rotate(180deg)", transformOrigin: "50% 50%" } : {}),
    },
  };
}
