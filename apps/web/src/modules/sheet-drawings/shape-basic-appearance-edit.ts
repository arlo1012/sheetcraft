import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { resolveShapeDetailedPaintStyle } from "./shape-detailed-paint";

/** Legacy editor controls remain real edits when a detailed category already overrides them. */
export function editShapeBasicAppearance(
  drawing: SheetGraphicDrawing,
  field: "fill" | "stroke" | "strokeWidth",
  value: string | number,
): SheetGraphicDrawing {
  const next = { ...drawing, [field]: value };
  if (drawing.kind !== "shape" || !drawing.shapeStyle) return next;
  const style = { ...drawing.shapeStyle };
  if (field === "fill") {
    style.fill =
      next.fill === "transparent"
        ? { kind: "none" }
        : {
            kind: "value",
            value: { kind: "solid", color: { kind: "rgb", rgb: next.fill }, opacity: 1 },
          };
  } else {
    const previous = drawing.shapeStyle.line;
    if (
      (field === "strokeWidth" && next.strokeWidth === 0) ||
      (field === "stroke" && next.stroke === "transparent")
    )
      style.line = { kind: "none" };
    else if (previous?.kind === "value") {
      style.line = {
        kind: "value",
        value: {
          ...previous.value,
          ...(field === "strokeWidth"
            ? { widthPt: next.strokeWidth * 0.75 }
            : { paint: { kind: "solid", color: { kind: "rgb", rgb: next.stroke }, opacity: 1 } }),
        },
      };
    } else {
      const { shapeStyle: _style, ...plain } = next;
      style.line = resolveShapeDetailedPaintStyle(plain).line;
    }
  }
  return { ...next, shapeStyle: style };
}
