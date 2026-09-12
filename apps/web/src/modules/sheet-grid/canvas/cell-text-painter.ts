import type { CellStyle } from "@idea10/core/style";
import type { CellTextLayout, CellTextLine } from "../../../shared/cell-text/text-presentation";

function font(layout: CellTextLayout): string {
  const family = layout.font.family.includes(",") ? layout.font.family : JSON.stringify(layout.font.family);
  return `${layout.font.italic ? "italic " : ""}${layout.font.weight} ${layout.font.size}px ${family}`;
}

function baseline(ctx: CanvasRenderingContext2D, layout: CellTextLayout, y: number): number {
  const metrics = ctx.measureText("Mg");
  const ascent = metrics.fontBoundingBoxAscent || layout.font.size * 0.8;
  const descent = metrics.fontBoundingBoxDescent || layout.font.size * 0.2;
  return y + (layout.lineHeight - ascent - descent) / 2 + ascent;
}

function containsCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function paintJustifiedLine(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  line: CellTextLine,
  direction: CanvasDirection,
): void {
  const cjk = containsCjk(line.text);
  const parts = cjk ? Array.from(line.text) : line.text.split(/(\s+)/u);
  const gaps = cjk ? parts.length - 1 : parts.filter((part) => /^\s+$/u.test(part)).length;
  const y = baseline(ctx, layout, line.y);
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
  style: Readonly<CellStyle> | undefined,
): void {
  if (!style?.underline && !style?.strikethrough) return;
  const accounting = style.underline === "singleAccounting" || style.underline === "doubleAccounting";
  const double = style.underline === "double" || style.underline === "doubleAccounting";
  const thickness = Math.max(1, layout.font.size / 16);
  ctx.lineWidth = thickness;
  for (const line of layout.lines) {
    const width = ctx.measureText(line.text).width;
    const x = line.align === "right" ? line.x + line.width - width : line.align === "center" ? line.x + (line.width - width) / 2 : line.x;
    const textBaseline = baseline(ctx, layout, line.y);
    if (style.underline) {
      const y = textBaseline + (accounting ? layout.font.size * 0.18 : 1);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
      if (double) { ctx.beginPath(); ctx.moveTo(x, y + thickness + 1); ctx.lineTo(x + width, y + thickness + 1); ctx.stroke(); }
    }
    if (style.strikethrough) {
      const y = textBaseline - layout.font.size * 0.32;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
    }
  }
}

/** Paints an already laid-out cell text run. The caller owns clipping and cell-origin translation. */
export function paintCellText(
  ctx: CanvasRenderingContext2D,
  layout: CellTextLayout,
  style: Readonly<CellStyle> | undefined,
  color: string,
): void {
  ctx.save();
  ctx.font = font(layout);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.direction = layout.direction;
  ctx.translate(layout.x + layout.rotationX, layout.y + layout.rotationY);
  if (layout.angle) ctx.rotate((layout.angle * Math.PI) / 180);
  const scriptOffset = style?.fontScript === "superscript" ? -layout.font.size * 0.35 : style?.fontScript === "subscript" ? layout.font.size * 0.2 : 0;
  if (scriptOffset) ctx.translate(0, scriptOffset);
  for (const line of layout.lines) {
    ctx.textAlign = line.align === "justify" ? "left" : line.align;
    if (line.align === "justify") paintJustifiedLine(ctx, layout, line, layout.direction);
    else ctx.fillText(line.text, line.x, baseline(ctx, layout, line.y));
  }
  paintDecorations(ctx, layout, style);
  ctx.restore();
}
