import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { normalizeShapeStyle } from "@sheetcraft/core/shape-style";
import {
  materializeDrawingShapeText,
  withoutDrawingShapeTextCharacterProperties,
} from "./shape-text-options";
import { materializeWordArtStylePreset, WORDART_STYLE_PRESETS } from "./wordart-style-presets";

/** Modern identity only; an old wordArt kind or ordinary retained warp never opts in. */
export function isWordArtStyleTarget(drawing: SheetGraphicDrawing): boolean {
  return drawing.kind === "shape" && drawing.wordArt === true && !drawing.shapeConnector;
}

function source(drawing: SheetGraphicDrawing): SheetGraphicDrawing {
  if (!isWordArtStyleTarget(drawing)) throw new TypeError("A modern WordArt owner is required.");
  return withoutDrawingShapeTextCharacterProperties(drawing, ["color", "fill", "line"]);
}

/** The explicit recipe replaces glyph appearance, never text, typography or placement. */
export function applyWordArtStylePreset(
  drawing: SheetGraphicDrawing,
  presetId: string,
): SheetGraphicDrawing {
  const style = materializeWordArtStylePreset(presetId);
  const next = source(drawing),
    text = materializeDrawingShapeText(next);
  return { ...next, shapeText: { ...text, style } };
}

/** Product reset: keep authored character fonts/B/I/U, unlike desktop default-style side effects. */
export function clearWordArtEffects(drawing: SheetGraphicDrawing): SheetGraphicDrawing {
  const next = source(drawing),
    text = materializeDrawingShapeText(next);
  delete text.warp;
  text.style = normalizeShapeStyle({
    fill: {
      kind: "value",
      value: { kind: "solid", color: { kind: "rgb", rgb: "#000000" }, opacity: 1 },
    },
    line: { kind: "none" },
    shadow: { kind: "none" },
    reflection: { kind: "none" },
    glow: { kind: "none" },
    softEdges: { kind: "none" },
    format3d: { kind: "none" },
    rotation3d: { kind: "none" },
  });
  return { ...next, shapeText: text };
}

/** Local glyph overrides are not silently represented by a uniform selected tile. */
export function getAppliedWordArtStyleId(drawing: SheetGraphicDrawing): string | undefined {
  if (!isWordArtStyleTarget(drawing)) return;
  const text = materializeDrawingShapeText(drawing);
  if (
    text.characterRuns?.some(
      (run) => run.color !== undefined || run.fill !== undefined || run.line !== undefined,
    )
  )
    return;
  const current = JSON.stringify(normalizeShapeStyle(text.style));
  return WORDART_STYLE_PRESETS.find((preset) => JSON.stringify(preset.style) === current)?.id;
}
