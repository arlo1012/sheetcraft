import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getShapeTextCharacterSegments,
  normalizeShapeTextCharacterFormat,
  stripShapeTextCharacterProperties,
  type ShapeTextCharacterFormat,
  type ShapeTextCharacterSource,
  type ShapeTextCharacterProperty,
} from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeFormatField, ShapeFormatValues } from "./shape-format-pane-model";
import { cloneShapeText, normalizeShapeText, type ShapeText } from "@sheetcraft/core/shape-text";
import { normalizeShapeStyle, type ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { resolvePictureColor } from "../../shared/images/picture-paint-color";

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
  if (drawing.shapeText) return cloneShapeText(drawing.shapeText, drawing.text)!;
  // Legacy numeric geometry already carries the original six-pixel inset.
  // A text box has a full-frame text rectangle and retains that inset as margins.
  const marginPt = drawing.kind === "shape" ? 0 : (6 + drawing.strokeWidth) * 0.75;
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
  return { ...base, shapeText: normalizeShapeText(shapeText, drawing.text)! };
}

/** A body edit opts a legacy TextBox into typed paint while retaining its effective text layout. */
export function withDrawingShapeBodyStyle(
  drawing: SheetGraphicDrawing,
  style: ShapeDetailedStyle,
): SheetGraphicDrawing {
  const normalized = normalizeShapeStyle(style);
  if (!normalized) {
    const { shapeStyle: _style, ...base } = drawing;
    return base;
  }
  const next =
    drawing.kind === "textBox" &&
    Object.keys(normalized).some((key) => key !== "format3d" && key !== "rotation3d")
      ? withDrawingShapeText(drawing, materializeDrawingShapeText(drawing))
      : drawing;
  return { ...next, shapeStyle: normalized };
}

export function getDrawingShapeTextFamily(drawing: SheetGraphicDrawing): string {
  return drawing.shapeText?.fontFamily ?? INHERITED_SHAPE_FONT_FAMILY;
}

/** One transient projection of the authoritative string and its sparse typography. */
export function drawingShapeTextCharacterSource(
  drawing: SheetGraphicDrawing,
): ShapeTextCharacterSource {
  return {
    text: drawing.text,
    ...(drawing.shapeText?.characterRuns ? { characterRuns: drawing.shapeText.characterRuns } : {}),
  };
}
export function drawingShapeTextBaseCharacterFormat(
  drawing: SheetGraphicDrawing,
): ShapeTextCharacterFormat {
  const style = drawing.shapeText?.style;
  return normalizeShapeTextCharacterFormat({
    fontFamily: getDrawingShapeTextFamily(drawing),
    fontSize: drawing.fontSize,
    bold: drawing.bold,
    italic: drawing.italic,
    underline: drawing.shapeText?.underline === true,
    strike: drawing.shapeText?.strike === true,
    ...(style?.fill !== undefined ? { fill: style.fill } : { color: drawing.color }),
    line: style?.line ?? { kind: "none" },
    shadow: style?.shadow ?? { kind: "none" },
    reflection: style?.reflection ?? { kind: "none" },
    glow: style?.glow ?? { kind: "none" },
  });
}

/** Basic color swatch readback; advanced fill is not a fabricated solid color. */
export function shapeTextCharacterColorValue(
  format: ShapeTextCharacterFormat,
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): string {
  if (format.color !== undefined) return format.color;
  if (format.fill?.kind === "none") return "transparent";
  if (format.fill?.kind !== "value" || format.fill.value.kind !== "solid") return "";
  const rgb = resolvePictureColor(format.fill.value.color, theme);
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
const characterFields = {
  fontFamily: "fontFamily",
  fontSizePt: "fontSize",
  textBold: "bold",
  textItalic: "italic",
  textUnderline: "underline",
  textStrike: "strike",
  textColor: "color",
} as const;
/** Empty text still exposes its uniform insertion format. Mixed values are never a first-run impersonation. */
export function drawingShapeTextCharacterValues(
  drawing: SheetGraphicDrawing,
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): {
  values: Partial<ShapeFormatValues>;
  mixedFields: ShapeFormatField[];
} {
  const base = drawingShapeTextBaseCharacterFormat(drawing);
  const segments = getShapeTextCharacterSegments(drawingShapeTextCharacterSource(drawing), base);
  const candidates: ShapeTextCharacterFormat[] = segments.length ? segments : [base];
  const values: Partial<ShapeFormatValues> = {},
    mixedFields: ShapeFormatField[] = [];
  for (const [field, property] of Object.entries(characterFields) as [
    keyof typeof characterFields,
    ShapeTextCharacterProperty,
  ][]) {
    const value = (candidate: ShapeTextCharacterFormat) =>
      field === "textColor" ? shapeTextCharacterColorValue(candidate, theme) : candidate[property];
    const first = value(candidates[0]!);
    if (!candidates.every((candidate) => value(candidate) === first)) mixedFields.push(field);
    else
      Object.assign(values, {
        [field]:
          field === "fontSizePt"
            ? (first as number) * 0.75
            : field === "fontFamily" && first === base.fontFamily
              ? (drawing.shapeText?.fontFamily ?? "")
              : first,
      });
  }
  return { values, mixedFields };
}
/** Read glyph categories across the actual attributed source, without selecting an arbitrary run. */
export function drawingShapeTextPaintValues(
  drawing: SheetGraphicDrawing,
  uniform: import("@sheetcraft/core/shape-style").ShapeDetailedStyle,
) {
  const base = drawingShapeTextBaseCharacterFormat(drawing);
  const source = drawingShapeTextCharacterSource(drawing);
  const segments = getShapeTextCharacterSegments(source, base);
  const candidates = segments.length ? segments : [base];
  const style = { ...uniform };
  const mixed: ("fill" | "line" | "shadow" | "reflection" | "glow")[] = [];
  for (const category of ["fill", "line", "shadow", "reflection", "glow"] as const) {
    const entries = candidates.map((format) =>
      category === "fill" && format.color !== undefined
        ? format.color === "transparent"
          ? { kind: "none" as const }
          : {
              kind: "value" as const,
              value: {
                kind: "solid" as const,
                color: { kind: "rgb" as const, rgb: format.color.toUpperCase() },
                opacity: 1,
              },
            }
        : (format[category] ?? uniform[category]),
    );
    const first = entries[0];
    if (entries.every((entry) => JSON.stringify(entry) === JSON.stringify(first)))
      Object.assign(style, { [category]: first });
    else {
      delete style[category];
      mixed.push(category);
    }
  }
  return { style, mixed };
}

/** A whole-object command broadcasts only the named property, retaining unrelated range overrides. */
export function withoutDrawingShapeTextCharacterProperties(
  drawing: SheetGraphicDrawing,
  properties: readonly ShapeTextCharacterProperty[],
): SheetGraphicDrawing {
  if (!drawing.shapeText?.characterRuns) return drawing;
  const source = stripShapeTextCharacterProperties(
    drawingShapeTextCharacterSource(drawing),
    properties,
  );
  const model = materializeDrawingShapeText(drawing);
  if (source.characterRuns) model.characterRuns = [...source.characterRuns];
  else delete model.characterRuns;
  return withDrawingShapeText(drawing, model);
}

export function drawingShapeTextValues(
  drawing: SheetGraphicDrawing,
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): Partial<ShapeFormatValues> {
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
    ...drawingShapeTextCharacterValues(drawing, theme).values,
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
  const characterProperty = characterFields[field as keyof typeof characterFields];
  drawing = characterProperty
    ? withoutDrawingShapeTextCharacterProperties(
        drawing,
        characterProperty === "color" ? ["color", "fill"] : [characterProperty],
      )
    : drawing;
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
    case "textColor": {
      if (value === "") {
        if (model.style) {
          model.style = { ...model.style };
          delete model.style.fill;
        }
        break;
      }
      if (typeof value !== "string" || !/^(#[0-9a-f]{6}|transparent)$/i.test(value))
        throw new TypeError("Shape text color must be RGB or transparent.");
      drawing = { ...drawing, color: value.toLowerCase() };
      model.style = {
        ...model.style,
        fill:
          value === "transparent"
            ? { kind: "none" }
            : {
                kind: "value",
                value: {
                  kind: "solid",
                  color: { kind: "rgb", rgb: value.toLowerCase() },
                  opacity: 1,
                },
              },
      };
      break;
    }
    case "fontSizePt":
      drawing = { ...drawing, fontSize: ((value as number) * 4) / 3 };
      break;
    case "textBold":
      drawing = { ...drawing, bold: booleanValue() };
      break;
    case "textItalic":
      drawing = { ...drawing, italic: booleanValue() };
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
