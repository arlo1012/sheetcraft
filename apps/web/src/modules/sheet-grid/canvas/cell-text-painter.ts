import type { CellStyle } from "@sheetcraft/core/style";
import { type AutoRowHeightFont, getCellTextGraphemes } from "@sheetcraft/sheet-engine/text-layout";
import type { CellTextLayout, CellTextLine } from "../../../shared/cell-text/text-presentation";

type FontMetrics = Readonly<{ ascent: number; descent: number }>;

const metricsByFont = new Map<string, FontMetrics>();

/** Clears cached font-box measurements after the browser loads a font face. */
export function clearCanvasTextMetrics(): void {
  metricsByFont.clear();
}

function font(value: AutoRowHeightFont): string {
  const family = value.family.includes(",") ? value.family : JSON.stringify(value.family);
  return `${value.italic ? "italic " : ""}${value.weight} ${value.size}px ${family}`;
}

function fontMetrics(ctx: CanvasRenderingContext2D, layout: CellTextLayout): FontMetrics {
  const cached = metricsByFont.get(ctx.font);
  if (cached) return cached;
  const measured = ctx.measureText("Mg");
  const metrics = {
    ascent: measured.fontBoundingBoxAscent || layout.font.size * 0.8,
    descent: measured.fontBoundingBoxDescent || layout.font.size * 0.2,
  };
  metricsByFont.set(ctx.font, metrics);
  return metrics;
}

function baseline(layout: CellTextLayout, metrics: FontMetrics, y: number): number {
  return y + (layout.lineHeight - metrics.ascent - metrics.descent) / 2 + metrics.ascent;
}

function attributedLineMetrics(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  line: CellTextLine,
  fallback: FontMetrics,
): FontMetrics {
  if (!line.segments?.length || (line.ascent !== undefined && line.descent !== undefined))
    return fallback;
  let ascent = 0;
  let descent = 0;
  for (const segment of line.segments) {
    ctx.font = font(segment.font);
    const metrics = fontMetrics(ctx, layout);
    ascent = Math.max(ascent, metrics.ascent);
    descent = Math.max(descent, metrics.descent);
  }
  return { ascent, descent };
}

function lineBaseline(layout: CellTextLayout, metrics: FontMetrics, line: CellTextLine): number {
  if (!line.segments) return baseline(layout, metrics, line.y);
  const ascent = line.ascent ?? metrics.ascent;
  const descent = line.descent ?? metrics.descent;
  return line.y + ((line.height ?? layout.lineHeight) - ascent - descent) / 2 + ascent;
}

function textOrigin(line: CellTextLine, textWidth: number): number {
  return line.align === "right"
    ? line.x + line.width - textWidth
    : line.align === "center"
      ? line.x + (line.width - textWidth) / 2
      : line.x;
}

function justificationParts(text: string): { text: string; expands: boolean }[] {
  const cjk = containsCjk(text);
  const parts = cjk ? getCellTextGraphemes(text) : text.split(/(\s+)/u);
  return parts.map((part, index) => ({
    text: part,
    expands: cjk ? index < parts.length - 1 : /^\s+$/u.test(part),
  }));
}

/** The source spans stay logical. This path is used only for conservative LTR paragraphs. */
function paintAttributedLine(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  metrics: FontMetrics,
  line: CellTextLine,
): void {
  const segments = line.segments!;
  metrics = attributedLineMetrics(ctx, layout, line, metrics);
  const y = lineBaseline(layout, metrics, line);
  const width = line.textWidth ?? segments.reduce((sum, segment) => sum + segment.width, 0);
  if (segments.length <= 1) {
    ctx.font = font(segments[0]?.font ?? layout.font);
    if (line.align === "justify") paintJustifiedLine(ctx, layout, metrics, line, layout.direction);
    else {
      ctx.textAlign = line.align;
      const x =
        line.align === "center"
          ? line.x + line.width / 2
          : line.align === "right"
            ? line.x + line.width
            : line.x;
      ctx.fillText(line.text, x, y);
    }
    return;
  }
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  if (line.align !== "justify") {
    let x = textOrigin(line, width);
    for (const segment of segments) {
      ctx.font = font(segment.font);
      ctx.fillText(segment.text, x, y);
      x += segment.width;
    }
    return;
  }
  const start = segments[0]!.start;
  let offset = 0;
  let segmentIndex = 0;
  const parts = justificationParts(line.text).map((part) => {
    const from = start + offset;
    const to = from + part.text.length;
    offset += part.text.length;
    while (segments[segmentIndex] && segments[segmentIndex]!.end <= from) segmentIndex++;
    const fragments: { text: string; font: AutoRowHeightFont; width: number }[] = [];
    for (
      let index = segmentIndex;
      index < segments.length && segments[index]!.start < to;
      index++
    ) {
      const segment = segments[index]!;
      const text = segment.text.slice(
        Math.max(from, segment.start) - segment.start,
        Math.min(to, segment.end) - segment.start,
      );
      ctx.font = font(segment.font);
      fragments.push({ text, font: segment.font, width: ctx.measureText(text).width });
    }
    return { ...part, fragments };
  });
  const gaps = parts.filter((part) => part.expands).length;
  const naturalWidth = parts.reduce(
    (sum, part) => sum + part.fragments.reduce((total, fragment) => total + fragment.width, 0),
    0,
  );
  const gap = gaps ? Math.max(0, (line.width - naturalWidth) / gaps) : 0;
  let x = line.x;
  for (const part of parts) {
    for (const fragment of part.fragments) {
      ctx.font = font(fragment.font);
      ctx.fillText(fragment.text, x, y);
      x += fragment.width;
    }
    if (part.expands) x += gap;
  }
}

function containsCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function paintJustifiedLine(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  metrics: FontMetrics,
  line: CellTextLine,
  direction: CanvasDirection,
): void {
  const cjk = containsCjk(line.text);
  const parts = cjk ? getCellTextGraphemes(line.text) : line.text.split(/(\s+)/u);
  const gaps = cjk ? parts.length - 1 : parts.filter((part) => /^\s+$/u.test(part)).length;
  const y = lineBaseline(layout, metrics, line);
  if (gaps < 1) {
    ctx.fillText(line.text, line.x, y);
    return;
  }
  const textWidth = ctx.measureText(line.text).width;
  const gap = Math.max(0, (line.width - textWidth) / gaps);
  if (direction === "rtl") {
    let x = line.x + line.width;
    ctx.textAlign = "right";
    for (const part of parts) {
      ctx.fillText(part, x, y);
      x -= ctx.measureText(part).width + (cjk || /^\s+$/u.test(part) ? gap : 0);
    }
    return;
  }
  let x = line.x;
  for (const part of parts) {
    ctx.fillText(part, x, y);
    x += ctx.measureText(part).width + (cjk || /^\s+$/u.test(part) ? gap : 0);
  }
}

function paintDecorations(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  metrics: FontMetrics,
  style: Readonly<CellStyle> | undefined,
): void {
  if (!style?.underline && !style?.strikethrough) return;
  const accounting =
    style.underline === "singleAccounting" || style.underline === "doubleAccounting";
  const double = style.underline === "double" || style.underline === "doubleAccounting";
  const thickness = Math.max(1, layout.font.size / 16);
  ctx.lineWidth = thickness;
  for (const line of layout.lines) {
    ctx.font = font(layout.font);
    const currentMetrics = attributedLineMetrics(ctx, layout, line, metrics);
    const naturalWidth = line.textWidth ?? ctx.measureText(line.text).width;
    const expanded =
      line.segments &&
      line.align === "justify" &&
      justificationParts(line.text).some((part) => part.expands);
    const width = expanded ? Math.max(naturalWidth, line.width) : naturalWidth;
    const x = textOrigin(line, width);
    const textBaseline = lineBaseline(layout, currentMetrics, line);
    if (style.underline) {
      const y = textBaseline + (accounting ? layout.font.size * 0.18 : 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
      if (double) {
        ctx.beginPath();
        ctx.moveTo(x, y + thickness + 1);
        ctx.lineTo(x + width, y + thickness + 1);
        ctx.stroke();
      }
    }
    if (style.strikethrough) {
      const y = textBaseline - layout.font.size * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
    }
  }
}

/** Paints an already laid-out cell text run. The caller owns clipping and cell-origin translation. */
export function paintCellText(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  style: Readonly<CellStyle> | undefined,
  color: string,
  options?: { attributedBidiMode?: "dom" | "plain" },
): void {
  if (layout.canvasBidiRequired) {
    // A live grid supplies the native logical-span overlay. Canvas-only consumers
    // retain the whole text with their previous single-family bidi path instead
    // of silently dropping it. Character-font fidelity is unavailable there.
    if (options?.attributedBidiMode === "dom") return;
    paintCellText(
      ctx,
      {
        ...layout,
        canvasBidiRequired: undefined,
        lines: layout.lines.map(({ text, x, y, width, align }) => ({ text, x, y, width, align })),
      },
      style,
      color,
    );
    return;
  }
  ctx.save();
  ctx.font = font(layout.font);
  const metrics = fontMetrics(ctx, layout);
  ctx.fillStyle = style?.textColor ?? color;
  ctx.strokeStyle = style?.textColor ?? color;
  ctx.textBaseline = "alphabetic";
  ctx.direction = layout.direction;
  ctx.translate(layout.x + layout.rotationX, layout.y + layout.rotationY);
  if (layout.angle) ctx.rotate((layout.angle * Math.PI) / 180);
  const scriptOffset =
    style?.fontScript === "superscript"
      ? -layout.font.size * 0.35
      : style?.fontScript === "subscript"
        ? layout.font.size * 0.2
        : 0;
  if (scriptOffset) ctx.translate(0, scriptOffset);
  for (const line of layout.lines) {
    if (line.segments) {
      paintAttributedLine(ctx, layout, metrics, line);
      continue;
    }
    ctx.font = font(layout.font);
    ctx.direction = layout.direction;
    ctx.textAlign = line.align === "justify" ? "left" : line.align;
    if (line.align === "justify") paintJustifiedLine(ctx, layout, metrics, line, layout.direction);
    else {
      const x =
        line.align === "center"
          ? line.x + line.width / 2
          : line.align === "right"
            ? line.x + line.width
            : line.x;
      ctx.fillText(line.text, x, baseline(layout, metrics, line.y));
    }
  }
  ctx.font = font(layout.font);
  paintDecorations(ctx, layout, metrics, style);
  ctx.restore();
}
