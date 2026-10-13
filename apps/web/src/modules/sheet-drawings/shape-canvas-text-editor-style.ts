import type { CSSProperties } from "vue";
import type { ShapeTextLayoutResult } from "./shape-text-layout";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { getDrawingShapeTextFamily, materializeDrawingShapeText } from "./shape-text-options";

/**
 * Uniform editing appearance only. The owner supplies the actual text rectangle,
 * sheet/page clip, zoom and rotation. A textarea does not replace native final
 * layout: per-paragraph spacing and glyph effects remain on the painted text.
 */
export function shapeCanvasTextEditorStyle(drawing: SheetGraphicDrawing, scale = 1): CSSProperties {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new RangeError("Shape text editing scale must be finite and positive.");
  const text = materializeDrawingShapeText(drawing);
  const { layout, paragraph } = text;
  const margins = layout.marginsPt;
  const px = (points: number) => `${(points * 96 * scale) / 72}px`;
  const decorations = [text.underline ? "underline" : "", text.strike ? "line-through" : ""]
    .filter(Boolean)
    .join(" ");
  const writingMode: CSSProperties["writingMode"] =
    layout.direction === "horizontal"
      ? "horizontal-tb"
      : layout.direction === "rotate-90"
        ? "sideways-rl"
        : layout.direction === "rotate-270"
          ? "sideways-lr"
          : layout.direction === "vertical-lr" ||
              (layout.direction === "stacked" && layout.lineOrder === "ltr")
            ? "vertical-lr"
            : "vertical-rl";
  return {
    fontFamily: getDrawingShapeTextFamily(drawing),
    fontSize: `${drawing.fontSize * scale}px`,
    fontWeight: drawing.bold ? 700 : 400,
    fontStyle: drawing.italic ? "italic" : "normal",
    color: drawing.color,
    textDecoration: decorations || "none",
    textAlign: paragraph.alignment,
    lineHeight: paragraph.lineSpacing.kind === "exact" ? px(paragraph.lineSpacing.pt) : "normal",
    paddingLeft: px(margins.leftPt),
    paddingRight: px(margins.rightPt),
    paddingTop: px(margins.topPt),
    paddingBottom: px(margins.bottomPt),
    whiteSpace: layout.wrap ? "pre-wrap" : "pre",
    overflowWrap: layout.wrap ? "break-word" : "normal",
    writingMode,
    textOrientation: layout.direction === "stacked" ? "upright" : "mixed",
  };
}

/** Reuse the actual layout's block origin so entering edit does not move centered
 * or bottom/right-aligned text back to the beginning of its shape textRect. */
export function shapeCanvasTextBlockStyle(
  drawing: SheetGraphicDrawing,
  layout: ShapeTextLayoutResult,
  scale = 1,
): CSSProperties {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid text editing scale.");
  const first = layout.lines[0];
  if (!first || !Number.isFinite(first.blockStart) || !Number.isFinite(first.blockAdvance))
    return {};
  const options = materializeDrawingShapeText(drawing),
    direction = options.layout.direction,
    margins = options.layout.marginsPt,
    offset = Math.max(0, first.blockStart) * scale,
    px = (pt: number) => (pt * 96 * scale) / 72;
  const block =
    direction === "horizontal"
      ? { paddingTop: `${px(margins.topPt) + offset}px` }
      : direction === "rotate-270" ||
          direction === "vertical-lr" ||
          (direction === "stacked" && options.layout.lineOrder === "ltr")
        ? { paddingLeft: `${px(margins.leftPt) + offset}px` }
        : { paddingRight: `${px(margins.rightPt) + offset}px` };
  return {
    ...block,
    ...(options.paragraph.lineSpacing.kind === "normal" && first.blockAdvance > 0
      ? { lineHeight: `${first.blockAdvance * scale}px` }
      : {}),
  };
}
