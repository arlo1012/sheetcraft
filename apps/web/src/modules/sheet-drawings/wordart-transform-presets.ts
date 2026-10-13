import {
  evaluateTextWarp,
  sampleTextWarpBoundaries,
  sampleTextWarpFraction,
  type ShapeTextWarp,
  type TextWarpPathCommand,
  type TextWarpPoint,
  type TextWarpPresetName,
} from "@sheetcraft/core/text-warps";

export type WordArtTransformLocale = "en-US" | "zh-CN";
export type WordArtTransformLabel = Readonly<Record<WordArtTransformLocale, string>>;
export type WordArtTransformFamily = "none" | "follow-path" | "envelope";
export type WordArtTransformPreset = Readonly<{
  /** textNoShape is a gallery identity only; the model represents it by absence. */
  id: "textNoShape" | TextWarpPresetName;
  family: WordArtTransformFamily;
  label: WordArtTransformLabel;
  warp?: ShapeTextWarp;
}>;
export type WordArtTransformSelectionContext = Readonly<{
  ownerId?: string | number;
  /** An async owner should check this before applying a pending intent. */
  isCurrent: () => boolean;
}>;

function preset(
  id: WordArtTransformPreset["id"],
  family: WordArtTransformFamily,
  en: string,
  zh: string,
): WordArtTransformPreset {
  return Object.freeze({
    id,
    family,
    label: Object.freeze({ "en-US": en, "zh-CN": zh }),
    ...(id === "textNoShape" ? {} : { warp: Object.freeze({ preset: id }) }),
  });
}

/**
 * The desktop reference establishes 1 + 4 + 36 choices and their section hierarchy.
 * These bilingual descriptions are product-owned names tied to standard identities,
 * not a claim about unobserved WPS tooltips or an imported picture-crop catalog.
 */
export const WORDART_TRANSFORM_PRESETS: readonly WordArtTransformPreset[] = Object.freeze([
  preset("textNoShape", "none", "No transform", "无转换"),
  preset("textArchUp", "follow-path", "Upper arc", "上弧路径"),
  preset("textArchDown", "follow-path", "Lower arc", "下弧路径"),
  preset("textCircle", "follow-path", "Circle path", "圆环路径"),
  preset("textButton", "follow-path", "Button paths", "按钮路径"),
  preset("textPlain", "envelope", "Plain band", "平直带形"),
  preset("textStop", "envelope", "Stop band", "停止标志带形"),
  preset("textTriangle", "envelope", "Triangle up", "向上三角"),
  preset("textTriangleInverted", "envelope", "Triangle down", "向下三角"),
  preset("textChevron", "envelope", "Chevron up", "向上尖角"),
  preset("textChevronInverted", "envelope", "Chevron down", "向下尖角"),
  preset("textRingInside", "envelope", "Inner ring", "内环带形"),
  preset("textRingOutside", "envelope", "Outer ring", "外环带形"),
  preset("textArchUpPour", "envelope", "Upper arc band", "上弧带形"),
  preset("textArchDownPour", "envelope", "Lower arc band", "下弧带形"),
  preset("textCirclePour", "envelope", "Circle band", "圆环带形"),
  preset("textButtonPour", "envelope", "Button bands", "按钮带形"),
  preset("textCurveUp", "envelope", "Curve up", "向上曲线"),
  preset("textCurveDown", "envelope", "Curve down", "向下曲线"),
  preset("textCanUp", "envelope", "Can up", "上凸罐形"),
  preset("textCanDown", "envelope", "Can down", "下凸罐形"),
  preset("textWave1", "envelope", "Wave 1", "波浪一"),
  preset("textWave2", "envelope", "Wave 2", "波浪二"),
  preset("textDoubleWave1", "envelope", "Double wave", "双重波浪"),
  preset("textWave4", "envelope", "Wave 4", "波浪四"),
  preset("textInflate", "envelope", "Inflate", "整体膨胀"),
  preset("textDeflate", "envelope", "Deflate", "整体收缩"),
  preset("textInflateBottom", "envelope", "Inflate bottom", "底部膨胀"),
  preset("textDeflateBottom", "envelope", "Deflate bottom", "底部收缩"),
  preset("textInflateTop", "envelope", "Inflate top", "顶部膨胀"),
  preset("textDeflateTop", "envelope", "Deflate top", "顶部收缩"),
  preset("textDeflateInflate", "envelope", "Deflate–inflate", "先缩后胀"),
  preset("textDeflateInflateDeflate", "envelope", "Deflate–inflate–deflate", "缩胀缩"),
  preset("textFadeRight", "envelope", "Fade right", "向右渐细"),
  preset("textFadeLeft", "envelope", "Fade left", "向左渐细"),
  preset("textFadeUp", "envelope", "Fade up", "向上渐细"),
  preset("textFadeDown", "envelope", "Fade down", "向下渐细"),
  preset("textSlantUp", "envelope", "Slant up", "向上倾斜"),
  preset("textSlantDown", "envelope", "Slant down", "向下倾斜"),
  preset("textCascadeUp", "envelope", "Cascade up", "向上阶梯"),
  preset("textCascadeDown", "envelope", "Cascade down", "向下阶梯"),
]);

export const WORDART_TRANSFORM_PRESET_COUNT = WORDART_TRANSFORM_PRESETS.length;
export const WORDART_FOLLOW_PATH_PRESETS = Object.freeze(
  WORDART_TRANSFORM_PRESETS.filter((choice) => choice.family === "follow-path"),
);
export const WORDART_ENVELOPE_PRESETS = Object.freeze(
  WORDART_TRANSFORM_PRESETS.filter((choice) => choice.family === "envelope"),
);
export const WORDART_NO_TRANSFORM_PRESET = WORDART_TRANSFORM_PRESETS[0]!;

export function getWordArtTransformPreset(id: string): WordArtTransformPreset | undefined {
  return WORDART_TRANSFORM_PRESETS.find((choice) => choice.id === id);
}

/** Return a detached intent; removal carries no active preset or adjustments. */
export function materializeWordArtTransformPreset(
  choice: WordArtTransformPreset | string,
): ShapeTextWarp | undefined {
  const canonical = getWordArtTransformPreset(typeof choice === "string" ? choice : choice.id);
  if (!canonical) throw new RangeError("Unknown WordArt transform choice.");
  return canonical.warp ? { preset: canonical.warp.preset } : undefined;
}

export const WORDART_TRANSFORM_GALLERY_LABELS = Object.freeze({
  "en-US": Object.freeze({
    gallery: "Text transform",
    none: "No transform",
    followPath: "Follow path",
    envelope: "Warp",
    diagrams: "Standard geometry diagrams",
    followPathNote:
      "Follow path supports printable ASCII, horizontal left-to-right text, and independent glyphs without cross-glyph kerning or ligatures.",
    envelopeNote: "Warps the whole shaped text run.",
    pending: "Applying transform…",
    rejected: "This transform could not be applied to the current text. Previous selection kept.",
    selected: "Selected",
    mixed: "Mixed transforms",
  }),
  "zh-CN": Object.freeze({
    gallery: "文字转换",
    none: "无转换",
    followPath: "沿路径排列",
    envelope: "扭曲",
    diagrams: "标准几何示意图",
    followPathNote:
      "沿路径排列仅支持可打印 ASCII、横排从左到右的独立字形；不支持跨字字距调整或连字。",
    envelopeNote: "对完整排版后的文字行进行扭曲。",
    pending: "正在应用转换…",
    rejected: "此转换无法应用于当前文字。已保留原选择。",
    selected: "已选",
    mixed: "多种转换",
  }),
});

export type WordArtTransformDiagram = Readonly<{
  /** These are geometry guides, not shaped glyph previews. */
  untransformed: boolean;
  tracks: readonly Readonly<{ boundary: string; ticks: string; direction: string }>[];
  bands: readonly Readonly<{ top: string; bottom: string; rungs: string }>[];
}>;
const diagramCache = new Map<WordArtTransformPreset["id"], WordArtTransformDiagram>();
const number = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError("Non-finite transform diagram coordinate.");
  return String(Math.round(value * 1000) / 1000);
};

/**
 * Render evaluated standard commands only. Arcs are split into quarter-turn-or-less
 * SVG segments so full circles retain their authored direction. Bounds, tangents,
 * and band correspondence come from Core's bounded geometry sampler.
 */
export function getWordArtTransformDiagram(
  choice: WordArtTransformPreset,
): WordArtTransformDiagram {
  const canonical = getWordArtTransformPreset(choice.id);
  if (!canonical) throw new RangeError("Unknown WordArt transform diagram.");
  const cached = diagramCache.get(canonical.id);
  if (cached) return cached;
  if (!canonical.warp) {
    const diagram = Object.freeze({
      untransformed: true,
      tracks: Object.freeze([]),
      bands: Object.freeze([]),
    });
    diagramCache.set(canonical.id, diagram);
    return diagram;
  }
  const geometry = evaluateTextWarp(canonical.warp, 120, 50);
  const sampled = sampleTextWarpBoundaries(geometry.boundaries, {
    width: 120,
    height: 50,
    positionTolerance: 0.25,
    lengthTolerance: 0.05,
    maxSamplesPerPath: 1024,
    maxSamplesPerObject: 4096,
  });
  const left = Math.min(...sampled.boundaries.map((boundary) => boundary.bounds.left));
  const top = Math.min(...sampled.boundaries.map((boundary) => boundary.bounds.top));
  const right = Math.max(...sampled.boundaries.map((boundary) => boundary.bounds.right));
  const bottom = Math.max(...sampled.boundaries.map((boundary) => boundary.bounds.bottom));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const scale = Math.min(104 / width, 44 / height);
  const offsetX = (120 - width * scale) / 2 - left * scale;
  const offsetY = (64 - height * scale) / 2 - top * scale;
  const point = (p: TextWarpPoint): TextWarpPoint => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });
  const pair = (p: TextWarpPoint): string => `${number(p.x)} ${number(p.y)}`;
  const line = (a: TextWarpPoint, b: TextWarpPoint): string => `M ${pair(a)} L ${pair(b)}`;
  function path(commands: readonly TextWarpPathCommand[]): string {
    return commands
      .map((command) => {
        if (command[0] !== "A") {
          const points: string[] = [];
          for (let i = 1; i < command.length; i += 2)
            points.push(pair(point({ x: command[i] as number, y: command[i + 1] as number })));
          return `${command[0]} ${points.join(" ")}`;
        }
        const [, rx, ry, cx, cy, start, end] = command;
        const count = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
        return Array.from({ length: count }, (_, index) => {
          const angle = start + ((end - start) * (index + 1)) / count;
          const target = point({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
          return `A ${number(rx * scale)} ${number(ry * scale)} 0 0 ${end >= start ? 1 : 0} ${pair(target)}`;
        }).join(" ");
      })
      .join(" ");
  }
  const paths = geometry.boundaries.map((boundary) => path(boundary.commands));
  const tracks = geometry.tracks.map(({ pathIndex }) => {
    const boundary = sampled.boundaries[pathIndex]!;
    const ticks = Array.from({ length: 7 }, (_, index) => {
      const sample = sampleTextWarpFraction(boundary, 0.1 + index * 0.1);
      const normal = sample.normal;
      if (!normal) return "";
      const p = point(sample.position);
      return line(
        { x: p.x - normal.x * 4, y: p.y - normal.y * 4 },
        { x: p.x + normal.x, y: p.y + normal.y },
      );
    }).join(" ");
    const arrow = sampleTextWarpFraction(boundary, 0.88);
    const p = point(arrow.position);
    const t = arrow.tangent;
    const n = arrow.normal;
    const direction =
      t && n
        ? `M ${pair({ x: p.x - t.x * 4 + n.x * 2, y: p.y - t.y * 4 + n.y * 2 })} L ${pair(p)} L ${pair({ x: p.x - t.x * 4 - n.x * 2, y: p.y - t.y * 4 - n.y * 2 })}`
        : "";
    return Object.freeze({ boundary: paths[pathIndex]!, ticks, direction });
  });
  const bands = geometry.bands.map(({ topPathIndex, bottomPathIndex }) => {
    const upper = sampled.boundaries[topPathIndex]!;
    const lower = sampled.boundaries[bottomPathIndex]!;
    const rungs = Array.from({ length: 9 }, (_, index) => {
      const fraction = index / 8;
      return line(
        point(sampleTextWarpFraction(upper, fraction).position),
        point(sampleTextWarpFraction(lower, fraction).position),
      );
    }).join(" ");
    return Object.freeze({ top: paths[topPathIndex]!, bottom: paths[bottomPathIndex]!, rungs });
  });
  const diagram = Object.freeze({
    untransformed: false,
    tracks: Object.freeze(tracks),
    bands: Object.freeze(bands),
  });
  diagramCache.set(canonical.id, diagram);
  return diagram;
}
