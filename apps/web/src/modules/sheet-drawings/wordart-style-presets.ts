import {
  cloneShapeStyle,
  normalizeShapeStyle,
  type ShapeColor,
  type ShapeDetailedStyle,
  type ShapeLine,
  type ShapePaint,
  type ShapePatternPreset,
  type ShapeShadow,
} from "@sheetcraft/core/shape-style";
import type { ThemeColorSlot } from "@sheetcraft/core/workbook-theme";

export type WordArtStyleLocale = "en-US" | "zh-CN";
export type WordArtStyleLabel = Readonly<Record<WordArtStyleLocale, string>>;
export type WordArtStylePreset = Readonly<{
  id: string;
  label: WordArtStyleLabel;
  /** Only the first style's numeric recipe was measured in the desktop reference. */
  provenance: "measured-first-style" | "product-owned";
  /** Glyph appearance only. No text, font size, layout, frame or transform changes. */
  style: Readonly<Required<ShapeDetailedStyle>>;
}>;

const rgb = (color: string): ShapeColor => ({ kind: "rgb", rgb: color });
const theme = (slot: ThemeColorSlot, tint?: number): ShapeColor => ({
  kind: "theme",
  reference: tint === undefined ? { slot } : { slot, tint },
});
const solid = (color: ShapeColor): ShapePaint => ({ kind: "solid", color, opacity: 1 });
function gradient(
  first: ShapeColor,
  last: ShapeColor,
  angleDeg = 90,
  middle?: ShapeColor,
): ShapePaint {
  return {
    kind: "linear",
    opacity: 1,
    rotateWithShape: true,
    angleDeg,
    stops: [
      { offset: 0, color: first, opacity: 1, brightness: 0 },
      ...(middle ? [{ offset: 0.5, color: middle, opacity: 1, brightness: 0 }] : []),
      { offset: 1, color: last, opacity: 1, brightness: 0 },
    ],
  };
}
function pattern(preset: ShapePatternPreset, foreground: ShapeColor): ShapePaint {
  return {
    kind: "pattern",
    preset,
    foreground,
    background: theme("light1"),
    opacity: 1,
    rotateWithShape: true,
  };
}
function outline(color: ShapeColor, widthPt = 1): ShapeDetailedStyle["line"] {
  const value: ShapeLine = {
    paint: solid(color),
    widthPt,
    compound: "single",
    dash: "solid",
    cap: "butt",
    join: "round",
    miterLimit: 4,
  };
  return { kind: "value", value };
}
function shadow(
  opacity = 0.4,
  blurPt = 3,
  distancePt = 1.5,
  color: ShapeColor = rgb("#000000"),
): ShapeDetailedStyle["shadow"] {
  const value: ShapeShadow = {
    kind: "outer",
    color,
    opacity,
    scale: 1,
    blurPt,
    distancePt,
    angleDeg: 45,
    anchor: "center",
  };
  return { kind: "value", value };
}
const reflection: ShapeDetailedStyle["reflection"] = {
  kind: "value",
  value: { size: 0.4, opacity: 0.45, blurPt: 0.5, distancePt: 1 },
};
function glow(color: ShapeColor, sizePt = 4): ShapeDetailedStyle["glow"] {
  return { kind: "value", value: { color, opacity: 0.55, sizePt } };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
function preset(
  id: string,
  en: string,
  zh: string,
  fill: ShapePaint | null,
  effects: ShapeDetailedStyle = {},
  provenance: WordArtStylePreset["provenance"] = "product-owned",
): WordArtStylePreset {
  const style = normalizeShapeStyle({
    fill: fill ? { kind: "value", value: fill } : { kind: "none" },
    line: { kind: "none" },
    shadow: { kind: "none" },
    reflection: { kind: "none" },
    glow: { kind: "none" },
    softEdges: { kind: "none" },
    format3d: { kind: "none" },
    rotation3d: { kind: "none" },
    ...effects,
  }) as Required<ShapeDetailedStyle>;
  return freeze({ id, label: { "en-US": en, "zh-CN": zh }, provenance, style });
}

/**
 * A product-owned 25-choice gallery, ordered as 10 + 10 + 5 at its full width.
 * The desktop reference establishes the count and first style only. The other
 * numeric recipes and names are authored here, not claimed WPS preset mappings.
 * Theme bindings stay live when this exact glyph style is inserted or reapplied.
 */
export const WORDART_STYLE_PRESETS: readonly WordArtStylePreset[] = freeze([
  preset(
    "black-soft-shadow",
    "Black fill, soft shadow",
    "黑色填充，柔和阴影",
    solid(rgb("#000000")),
    { shadow: shadow() },
    "measured-first-style",
  ),
  preset("accent1-shadow", "Accent 1, soft shadow", "强调色 1，柔和阴影", solid(theme("accent1")), {
    shadow: shadow(0.3, 2, 1),
  }),
  preset(
    "accent6-filled-outline",
    "Accent 6, light fill and outline",
    "强调色 6，浅色填充与轮廓",
    solid(theme("accent6", 0.8)),
    {
      line: outline(theme("accent6"), 1.5),
    },
  ),
  preset("accent5-outline", "Accent 5 outline", "强调色 5 轮廓", null, {
    line: outline(theme("accent5"), 1.25),
  }),
  preset("accent3-solid", "Accent 3 solid fill", "强调色 3 纯色填充", solid(theme("accent3"))),
  preset("neutral-solid", "Gray solid fill", "灰色纯色填充", solid(theme("dark1", 0.4))),
  preset(
    "accent5-reflection",
    "Accent 5 gradient, reflection",
    "强调色 5 渐变，映像",
    gradient(theme("accent5", -0.35), theme("accent5", 0.45)),
    {
      reflection,
    },
  ),
  preset(
    "accent3-filled-outline",
    "Accent 3, light fill and outline",
    "强调色 3，浅色填充与轮廓",
    solid(theme("accent3", 0.7)),
    {
      line: outline(theme("accent3"), 1.25),
    },
  ),
  preset(
    "accent1-filled-outline",
    "Accent 1, light fill and outline",
    "强调色 1，浅色填充与轮廓",
    solid(theme("light1")),
    {
      line: outline(theme("accent1"), 1.25),
      shadow: shadow(0.15, 1, 1),
    },
  ),
  preset("gold-solid", "Gold solid fill", "金色纯色填充", solid(rgb("#B38F00"))),
  preset(
    "black-white-outline",
    "Black fill, white outline and shadow",
    "黑色填充，白色轮廓与阴影",
    solid(rgb("#000000")),
    {
      line: outline(theme("light1"), 1),
      shadow: shadow(0.55, 2, 2),
    },
  ),
  preset(
    "dark-accent5-outline",
    "Dark fill, Accent 5 outline",
    "深色填充，强调色 5 轮廓",
    solid(theme("dark1")),
    {
      line: outline(theme("accent5"), 1.5),
    },
  ),
  preset(
    "accent5-shadow",
    "Accent 5 fill and colored shadow",
    "强调色 5 填充与彩色阴影",
    solid(theme("accent5")),
    {
      shadow: shadow(0.55, 1.5, 2, theme("accent5", -0.4)),
    },
  ),
  preset("accent6-outline", "Accent 6 outline", "强调色 6 轮廓", null, {
    line: outline(theme("accent6"), 1.25),
  }),
  preset(
    "silver-gradient",
    "Silver gradient and gray outline",
    "银色渐变与灰色轮廓",
    gradient(theme("dark1", 0.5), theme("dark1", 0.35), 0, theme("light1")),
    {
      line: outline(theme("dark1", 0.5), 0.75),
      shadow: shadow(0.2, 1, 1),
    },
  ),
  preset(
    "dark-diagonal-pattern",
    "Dark diagonal stripes",
    "深色斜条纹",
    pattern("dnDiag", theme("dark1")),
    {
      line: outline(theme("dark1"), 0.75),
      shadow: shadow(0.35, 1.5, 1.5),
    },
  ),
  preset(
    "gold-horizontal-pattern",
    "Gold horizontal stripes",
    "金色横条纹",
    pattern("horz", rgb("#B38F00")),
    {
      line: outline(rgb("#806600"), 1),
    },
  ),
  preset(
    "accent1-diagonal-pattern",
    "Accent 1 diagonal stripes",
    "强调色 1 斜条纹",
    pattern("dnDiag", theme("accent1")),
    {
      line: outline(theme("accent1"), 1),
    },
  ),
  preset(
    "accent5-cross-pattern",
    "Accent 5 crosshatch",
    "强调色 5 交叉线纹",
    pattern("diagCross", theme("accent5")),
    {
      line: outline(theme("accent5"), 0.75),
    },
  ),
  preset(
    "dark-wide-pattern",
    "Dark wide diagonal stripes",
    "深色宽斜条纹",
    pattern("wdUpDiag", theme("dark2")),
    {
      line: outline(theme("dark2"), 1),
    },
  ),
  preset("accent1-outline-glow", "Accent 1 outline and glow", "强调色 1 轮廓与发光", null, {
    line: outline(theme("accent1"), 1),
    glow: glow(theme("accent1"), 3),
  }),
  preset(
    "accent5-outline-reflection",
    "Accent 5 outline and reflection",
    "强调色 5 轮廓与映像",
    null,
    {
      line: outline(theme("accent5"), 1),
      reflection,
    },
  ),
  preset(
    "accent1-gradient",
    "Accent 1 shaded gradient",
    "强调色 1 明暗渐变",
    gradient(theme("accent1", 0.5), theme("accent1", -0.4)),
    {
      shadow: shadow(0.25, 2, 1),
    },
  ),
  preset(
    "accent5-gradient-glow",
    "Accent 5 gradient and glow",
    "强调色 5 渐变与发光",
    gradient(theme("accent5", 0.35), theme("accent5", -0.45)),
    {
      glow: glow(theme("accent5"), 2),
    },
  ),
  preset(
    "accent4-accent2-gradient",
    "Accent 4 to Accent 2 gradient",
    "强调色 4 至强调色 2 渐变",
    gradient(theme("accent4"), theme("accent2")),
    {
      shadow: shadow(0.2, 1.5, 1),
    },
  ),
]);

export const WORDART_STYLE_PRESET_COUNT = WORDART_STYLE_PRESETS.length;
export const WORDART_STYLE_GALLERY_LABELS = freeze({
  "en-US": {
    gallery: "Preset WordArt",
    selected: "Selected",
    pending: "Applying WordArt style…",
    rejected: "This WordArt style could not be applied. Try again.",
  },
  "zh-CN": {
    gallery: "预设艺术字",
    selected: "已选择",
    pending: "正在应用艺术字样式…",
    rejected: "暂时无法应用此艺术字样式，请重试。",
  },
} satisfies Record<WordArtStyleLocale, Record<string, string>>);

export function getWordArtStylePreset(id: string): WordArtStylePreset | undefined {
  return WORDART_STYLE_PRESETS.find((choice) => choice.id === id);
}

/** Replace glyph style wholesale with this fresh complete recipe. Do not merge
 * sparse categories into an old style, or absent effects would survive reapply. */
export function materializeWordArtStylePreset(
  choice: WordArtStylePreset | string,
): Required<ShapeDetailedStyle> {
  const canonical = getWordArtStylePreset(typeof choice === "string" ? choice : choice.id);
  if (!canonical) throw new RangeError("Unknown WordArt style preset.");
  return cloneShapeStyle(canonical.style)! as Required<ShapeDetailedStyle>;
}
