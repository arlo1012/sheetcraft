import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeFormatField, ShapeFormatValues } from "./shape-format-pane-model";
import { cloneShapeText, normalizeShapeText, type ShapeText } from "@sheetcraft/core/shape-text";

/** This is the existing application text stack, not a claimed available font face. */
export const INHERITED_SHAPE_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** New objects deliberately opt into the desktop-like text layout. Existing objects never do so on read. */
export function createDefaultShapeText(): ShapeText {
  return {
    layout: {
      blockAlignment: "start",
      direction: "horizontal",
      lineOrder: "rtl",
      marginsPt: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "left",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: { kind: "normal" },
    },
  };
}

/** Materialize only when the user edits a new text field. Preserve the old effective layout first. */
export function materializeDrawingShapeText(drawing: SheetGraphicDrawing): ShapeText {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new TypeError("Shape text requires a shape or text box.");
  if (drawing.shapeText) return cloneShapeText(drawing.shapeText)!;
  // Legacy numeric geometry already carries the original six-pixel inset.
  // A text box has a full-frame text rectangle and retains that inset as margins.
  const marginPt = drawing.kind === "shape" ? 0 : 4.5;
  const next = createDefaultShapeText();
  next.layout.blockAlignment = "center";
  next.layout.direction = drawing.textDirection === "vertical" ? "vertical-rl" : "horizontal";
  next.layout.marginsPt = {
    leftPt: marginPt,
    rightPt: marginPt,
    topPt: marginPt,
    bottomPt: marginPt,
  };
  next.paragraph.alignment = "center";
  return next;
}

/** A single owner replaces the legacy direction flag; stored text and basic font fields stay untouched. */
export function withDrawingShapeText(
  drawing: SheetGraphicDrawing,
  shapeText: ShapeText,
): SheetGraphicDrawing {
  if (drawing.kind !== "shape" && drawing.kind !== "textBox")
    throw new TypeError("Shape text requires a shape or text box.");
  const { textDirection: _legacyDirection, ...base } = drawing;
  return { ...base, shapeText: normalizeShapeText(shapeText)! };
}

export function getDrawingShapeTextFamily(drawing: SheetGraphicDrawing): string {
  return drawing.shapeText?.fontFamily ?? INHERITED_SHAPE_FONT_FAMILY;
}

export function drawingShapeTextValues(drawing: SheetGraphicDrawing): Partial<ShapeFormatValues> {
  const model = materializeDrawingShapeText(drawing);
  const layout = model.layout;
  return {
    shapeKeepTextFlat: layout.keepFlat,
    textVerticalAlignment:
      layout.blockAlignment === "start"
        ? "top"
        : layout.blockAlignment === "end"
          ? "bottom"
          : "middle",
    textDirection: layout.direction,
    textLineOrder: layout.lineOrder,
    textMarginLeftPt: layout.marginsPt.leftPt,
    textMarginRightPt: layout.marginsPt.rightPt,
    textMarginTopPt: layout.marginsPt.topPt,
    textMarginBottomPt: layout.marginsPt.bottomPt,
    textResizeToFit: layout.autoFit === "resize-shape",
    textOverflow: layout.overflow,
    textWrap: layout.wrap,
    fontFamily: model.fontFamily ?? "",
    textUnderline: model.underline === true,
    textStrike: model.strike === true,
    paragraphAlignment: model.paragraph.alignment,
    paragraphBeforePt: model.paragraph.beforePt,
    paragraphAfterPt: model.paragraph.afterPt,
    paragraphLineSpacing: model.paragraph.lineSpacing.kind,
    paragraphLineSpacingPt:
      model.paragraph.lineSpacing.kind === "exact"
        ? model.paragraph.lineSpacing.pt
        : drawing.fontSize * 0.75 * 1.2,
  };
}

/** Only explicitly edited fields opt a legacy drawing into the durable layout. */
export function editDrawingShapeTextField<K extends ShapeFormatField>(
  drawing: SheetGraphicDrawing,
  field: K,
  value: ShapeFormatValues[K],
): SheetGraphicDrawing | undefined {
  const model = materializeDrawingShapeText(drawing);
  const layout = model.layout;
  const booleanValue = () => {
    if (typeof value !== "boolean") throw new TypeError("Shape text flag requires a boolean.");
    return value;
  };
  switch (field) {
    case "shapeKeepTextFlat":
      layout.keepFlat = value as boolean;
      break;
    case "textVerticalAlignment":
      layout.blockAlignment =
        value === "top"
          ? "start"
          : value === "bottom"
            ? "end"
            : value === "middle"
              ? "center"
              : (() => {
                  throw new TypeError("Invalid block alignment.");
                })();
      break;
    case "textDirection":
      layout.direction = value as ShapeFormatValues["textDirection"];
      break;
    case "textLineOrder":
      layout.lineOrder = value as "rtl" | "ltr";
      break;
    case "textMarginLeftPt":
      layout.marginsPt.leftPt = value as number;
      break;
    case "textMarginRightPt":
      layout.marginsPt.rightPt = value as number;
      break;
    case "textMarginTopPt":
      layout.marginsPt.topPt = value as number;
      break;
    case "textMarginBottomPt":
      layout.marginsPt.bottomPt = value as number;
      break;
    case "textResizeToFit":
      layout.autoFit = booleanValue() ? "resize-shape" : "none";
      break;
    case "textOverflow":
      layout.overflow = value as boolean;
      break;
    case "textWrap":
      layout.wrap = value as boolean;
      break;
    case "fontFamily": {
      const family = (value as string).trim();
      if (family) model.fontFamily = family;
      else delete model.fontFamily;
      break;
    }
    case "textUnderline":
      if (booleanValue()) model.underline = true;
      else delete model.underline;
      break;
    case "textStrike":
      if (booleanValue()) model.strike = true;
      else delete model.strike;
      break;
    case "paragraphAlignment":
      model.paragraph.alignment = value as ShapeFormatValues["paragraphAlignment"];
      break;
    case "paragraphBeforePt":
      model.paragraph.beforePt = value as number;
      break;
    case "paragraphAfterPt":
      model.paragraph.afterPt = value as number;
      break;
    case "paragraphLineSpacing":
      model.paragraph.lineSpacing =
        value === "normal"
          ? { kind: "normal" }
          : value === "exact"
            ? { kind: "exact", pt: drawing.fontSize * 0.75 * 1.2 }
            : (() => {
                throw new TypeError("Invalid line spacing.");
              })();
      break;
    case "paragraphLineSpacingPt":
      model.paragraph.lineSpacing = { kind: "exact", pt: value as number };
      break;
    default:
      return;
  }
  return withDrawingShapeText(drawing, model);
}
