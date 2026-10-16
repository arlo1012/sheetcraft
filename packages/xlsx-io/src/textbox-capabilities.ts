import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { getShapeTextCharacterSegments } from "@sheetcraft/core/shape-text-character-runs";
import { resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import type { Sheet } from "@sheetcraft/core/workbook";
import { XlsxCompatibilityError } from "./types.js";

const ROOT = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "shapeFrame",
  "shapeText",
  "shapeStyle",
  "shapeProperties",
];
/** Inspect descriptors before reading any nested source value. */
function dataPath(value: unknown, path: string, seen = new Set<object>()): string | undefined {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return path;
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return path;
  } else if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return path;
  for (const key of Reflect.ownKeys(value)) {
    const next = path ? `${path}.${String(key)}` : String(key);
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in field)) return next;
    const bad = dataPath(field.value, next, seen);
    if (bad) return bad;
  }
  seen.delete(value);
}
const rgb = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const exact = (value: number, unit: number) =>
  Number.isSafeInteger(Math.round(value * unit)) &&
  Math.abs(value * unit - Math.round(value * unit)) < 1e-7;
const font = (value: unknown) =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  !/[,"']/.test(value) &&
  !value.startsWith("+") &&
  !/^(?:serif|sans-serif|monospace|system-ui|inherit|initial|unset|cursive|fantasy|ui-.*)$/i.test(
    value,
  );
function xmlSafe(value: string): boolean {
  return Array.from(value).every((c) => {
    const n = c.codePointAt(0)!;
    return (
      n === 9 ||
      n === 10 ||
      n === 13 ||
      (n >= 32 && n <= 0xd7ff) ||
      (n >= 0xe000 && n <= 0xfffd) ||
      (n >= 0x10000 && n <= 0x10ffff)
    );
  });
}
function unknownKey(value: unknown, keys: readonly string[], path: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return path;
  const key = Object.keys(value).find((key) => !keys.includes(key));
  return key === undefined ? undefined : `${path}.${key}`;
}
const EFFECTS = ["shadow", "reflection", "glow", "softEdges", "format3d", "rotation3d"];
function styleKeys(value: unknown, path: string): string | undefined {
  const bad = unknownKey(value, ["fill", "line", ...EFFECTS], path);
  if (bad) return bad;
  for (const [key, choice] of Object.entries(value as Record<string, { kind: string }>)) {
    const unknown = unknownKey(
      choice,
      choice?.kind === "none" ? ["kind"] : ["kind", "value"],
      `${path}.${key}`,
    );
    if (unknown) return unknown;
  }
}
function paintPath(value: unknown, path: string): string | undefined {
  const paint = value as { kind: string; color?: { kind: string; rgb?: string }; opacity?: number };
  if (paint.kind !== "solid") return `${path}.kind`;
  const unknown =
    unknownKey(paint, ["kind", "color", "opacity"], path) ??
    unknownKey(paint.color, ["kind", "rgb"], `${path}.color`);
  if (unknown) return unknown;
  if (paint.color?.kind !== "rgb" || !rgb(paint.color.rgb)) return `${path}.color`;
  if (paint.opacity !== 1) return `${path}.opacity`;
}
/** Returns a relative source path. Absence means the complete narrow native slice is supported. */
function unsupportedPath(drawing: SheetDrawing, sheet?: Sheet): string | undefined {
  const unsafe = dataPath(drawing, "");
  if (unsafe !== undefined) return unsafe || "shapeFrame";
  if (drawing.kind !== "textBox") return "kind";
  if (!("shapeFrame" in drawing)) return "shapeFrame";
  for (const key of Object.keys(drawing)) if (!ROOT.includes(key)) return key;
  const d = drawing as SheetFramedGraphicDrawing;
  if (d.shape !== "rectangle") return "shape";
  if (d.rotation !== 0) return "rotation";
  if (d.shapeProperties && Object.keys(d.shapeProperties).length)
    return `shapeProperties.${Object.keys(d.shapeProperties)[0]}`;
  if (!xmlSafe(d.name)) return "name";
  if (!xmlSafe(d.text) || d.text.includes("\r") || d.text.split("\n").length > 10000) return "text";
  if (!rgb(d.color)) return "color";
  if (!exact(d.fontSize, 75)) return "fontSize";
  if (!exact(d.strokeWidth, 9525)) return "strokeWidth";
  if (!d.shapeText) return "shapeText";
  const t = d.shapeText;
  if (!font(t.fontFamily)) return "shapeText.fontFamily";
  for (const key of Object.keys(t))
    if (!["layout", "paragraph", "fontFamily", "characterRuns", "style"].includes(key))
      return `shapeText.${key}`;
  const layoutUnknown =
    unknownKey(
      t.layout,
      [
        "blockAlignment",
        "direction",
        "lineOrder",
        "marginsPt",
        "wrap",
        "overflow",
        "autoFit",
        "keepFlat",
      ],
      "shapeText.layout",
    ) ??
    unknownKey(
      t.layout.marginsPt,
      ["leftPt", "rightPt", "topPt", "bottomPt"],
      "shapeText.layout.marginsPt",
    ) ??
    unknownKey(
      t.paragraph,
      ["alignment", "beforePt", "afterPt", "lineSpacing"],
      "shapeText.paragraph",
    ) ??
    unknownKey(t.paragraph.lineSpacing, ["kind", "pt"], "shapeText.paragraph.lineSpacing");
  if (layoutUnknown) return layoutUnknown;
  if (t.style) {
    const unknown = styleKeys(t.style, "shapeText.style");
    if (unknown) return unknown;
    for (const [key, choice] of Object.entries(t.style)) {
      if (key === "fill" && choice?.kind === "value") {
        const bad = paintPath(choice.value, "shapeText.style.fill.value");
        if (bad) return bad;
      } else if (choice?.kind !== "none") return `shapeText.style.${key}`;
    }
    if (t.style.fill?.kind === "none") return "shapeText.style.fill";
  }
  if (t.layout.direction !== "horizontal") return "shapeText.layout.direction";
  if (t.layout.autoFit !== "none") return "shapeText.layout.autoFit";
  if (t.layout.keepFlat) return "shapeText.layout.keepFlat";
  if (t.paragraph.alignment === "justify") return "shapeText.paragraph.alignment";
  if (t.paragraph.beforePt !== 0) return "shapeText.paragraph.beforePt";
  if (t.paragraph.afterPt !== 0) return "shapeText.paragraph.afterPt";
  if (t.paragraph.lineSpacing.kind !== "normal") return "shapeText.paragraph.lineSpacing";
  for (const [key, value] of Object.entries(t.layout.marginsPt))
    if (!exact(value, 12700)) return `shapeText.layout.marginsPt.${key}`;
  for (const [index, run] of (t.characterRuns ?? []).entries()) {
    const path = `shapeText.characterRuns[${index}]`;
    for (const key of Object.keys(run))
      if (
        ![
          "start",
          "end",
          "fontFamily",
          "fontSize",
          "bold",
          "italic",
          "color",
          "underline",
          "strike",
        ].includes(key)
      )
        return `${path}.${key}`;
    if (run.underline) return `${path}.underline`;
    if (run.strike) return `${path}.strike`;
    if (run.fontFamily !== undefined && !font(run.fontFamily)) return `${path}.fontFamily`;
    if (run.fontSize !== undefined && !exact(run.fontSize, 75)) return `${path}.fontSize`;
    if (run.color !== undefined && !rgb(run.color)) return `${path}.color`;
  }
  if (d.shapeStyle) {
    const unknown = styleKeys(d.shapeStyle, "shapeStyle");
    if (unknown) return unknown;
  }
  for (const [key, choice] of Object.entries(d.shapeStyle ?? {}))
    if (!["fill", "line"].includes(key) && choice?.kind !== "none") return `shapeStyle.${key}`;
  if (d.shapeStyle?.fill?.kind === "value") {
    const bad = paintPath(d.shapeStyle.fill.value, "shapeStyle.fill.value");
    if (bad) return bad;
  }
  if (d.shapeStyle?.line?.kind === "value") {
    const line = d.shapeStyle.line.value,
      path = "shapeStyle.line.value";
    const bad =
      unknownKey(
        line,
        ["paint", "widthPt", "compound", "dash", "cap", "join", "miterLimit"],
        path,
      ) ?? paintPath(line.paint, `${path}.paint`);
    if (bad) return bad;
    if (line.compound !== "single") return `${path}.compound`;
    if (line.dash !== "solid") return `${path}.dash`;
    if (line.widthPt <= 0 || line.widthPt > 24 || !exact(line.widthPt, 12700))
      return `${path}.widthPt`;
    if (!exact(line.miterLimit, 100000)) return `${path}.miterLimit`;
  }
  try {
    normalizeSheetDrawing(d);
  } catch {
    return "shapeFrame";
  }
  // A paragraph separator can carry a run style only when the two adjacent
  // nonempty paragraphs agree. Isolated LF typography/empty-line sizing remains
  // outside this slice until its Core and desktop layout semantics are verified.
  const glyph = t.style?.fill;
  const color =
    glyph?.kind === "value" && glyph.value.kind === "solid" && glyph.value.color.kind === "rgb"
      ? glyph.value.color.rgb
      : d.color;
  const segments = getShapeTextCharacterSegments(
    { text: d.text, characterRuns: t.characterRuns },
    { fontFamily: t.fontFamily!, fontSize: d.fontSize, bold: d.bold, italic: d.italic, color },
  );
  const appearance = (index: number): string => {
    const segment = segments[index]!;
    return JSON.stringify([
      segment.fontFamily,
      segment.fontSize,
      segment.bold,
      segment.italic,
      segment.color?.toUpperCase(),
    ]);
  };
  const baseAppearance = JSON.stringify([
    t.fontFamily,
    d.fontSize,
    d.bold,
    d.italic,
    color.toUpperCase(),
  ]);
  let segmentIndex = 0,
    runIndex = 0;
  for (
    let offset = d.text.indexOf("\n");
    offset !== -1;
    offset = d.text.indexOf("\n", offset + 1)
  ) {
    while (t.characterRuns?.[runIndex] && t.characterRuns[runIndex]!.end <= offset) runIndex++;
    const run = t.characterRuns?.[runIndex];
    if (!run || run.start > offset) continue;
    const path = `shapeText.characterRuns[${runIndex}]`;
    while (segments[segmentIndex]!.end <= offset - 1) segmentIndex++;
    const previous = appearance(segmentIndex);
    while (segments[segmentIndex]!.end <= offset) segmentIndex++;
    const separator = appearance(segmentIndex);
    if (separator === baseAppearance) continue;
    if (
      offset === 0 ||
      offset === d.text.length - 1 ||
      d.text[offset - 1] === "\n" ||
      d.text[offset + 1] === "\n"
    )
      return path;
    while (segments[segmentIndex]!.end <= offset + 1) segmentIndex++;
    if (previous !== separator || separator !== appearance(segmentIndex)) return path;
  }
  const anchor = d.shapeFrame.anchor;
  if (anchor.mode === "fixed") {
    if (anchor.x < 0 || anchor.y < 0) return "shapeFrame.anchor";
  }
  if (sheet) {
    try {
      const metrics = createPictureSheetMetrics(sheet),
        resolved = resolveShapeFrame(d.shapeFrame, metrics, 0);
      if (resolved.collapsed || resolved.rect.width < 1 || resolved.rect.height < 1)
        return "shapeFrame";
      const points =
        anchor.mode === "fixed"
          ? []
          : anchor.mode === "move-only"
            ? [anchor.origin]
            : [anchor.start, anchor.end];
      for (const point of points)
        for (const axis of ["column", "row"] as const) {
          const p = point[axis],
            metric = axis === "column" ? metrics.columns : metrics.rows;
          if (p.index >= metric.count || p.offset < 0 || p.offset > metric.visibleSize(p.index))
            return "shapeFrame.anchor";
        }
      if (
        Object.values(resolved.rect).some(
          (n) => !Number.isSafeInteger(Math.round(n * 9525)) || n < 0,
        )
      )
        return "shapeFrame.anchor";
    } catch {
      return "shapeFrame";
    }
  }
}
export function getNativeTextBoxUnsupportedPath(
  drawing: SheetDrawing,
  sheet?: Sheet,
): string | undefined {
  try {
    return unsupportedPath(drawing, sheet);
  } catch {
    return "shapeFrame";
  }
}
export function assertSupportedNativeTextBox(
  drawing: SheetDrawing,
  sheet: Sheet,
  location: string,
): asserts drawing is SheetFramedGraphicDrawing {
  const path = getNativeTextBoxUnsupportedPath(drawing, sheet);
  if (path !== undefined)
    throw new XlsxCompatibilityError(
      `Text box is outside the supported native slice at ${location}.${path}.`,
      {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: [`${location}.${path}`],
          },
        ],
      },
    );
}
