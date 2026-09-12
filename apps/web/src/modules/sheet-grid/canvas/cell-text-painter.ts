import type { CellStyle } from "@idea10/core/style";
import type { CellTextLayout, CellTextLine } from "../../../shared/cell-text/text-presentation";

function font(layout: CellTextLayout): string {
  const family = layout.font.family.includes(",") ? layout.font.family : JSON.stringify(layout.font.family);
  return `${layout.font.italic ? "italic " : ""}${layout.font.weight} ${layout.font.size}px ${family}`;
}

function paintJustifiedLine(
  ctx: CanvasRenderingContext2D,
  line: CellTextLine,
  direction: CanvasDirection,
): void {
  const glyphs = Array.from(line.text);
  if (glyphs.length < 2) {
    ctx.fillText(line.text, line.x, line.y);
    return;
  }
  const textWidth = ctx.measureText(line.text).width;
  const gap = Math.max(0, (line.width - textWidth) / (glyphs.length - 1));
  if (direction === "rtl") {
    let x = line.x + line.width;
    for (const glyph of glyphs) {
      x -= ctx.measureText(glyph).width;
      ctx.fillText(glyph, x, line.y);
      x -= gap;
    }
    return;
  }
  let x = line.x;
  for (const glyph of glyphs) {
    ctx.fillText(glyph, x, line.y);
    x += ctx.measureText(glyph).width + gap;
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
    if (style.underline) {
      const y = line.y + layout.font.size + (accounting ? layout.font.size * 0.18 : 1);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
      if (double) { ctx.beginPath(); ctx.moveTo(x, y + thickness + 1); ctx.lineTo(x + width, y + thickness + 1); ctx.stroke(); }
    }
    if (style.strikethrough) {
      const y = line.y + layout.font.size * 0.52;
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
  ctx.textBaseline = "top";
  ctx.direction = layout.direction;
  ctx.translate(layout.x + layout.rotationX, layout.y + layout.rotationY);
  if (layout.angle) ctx.rotate((layout.angle * Math.PI) / 180);
  const scriptOffset = style?.fontScript === "superscript" ? -layout.font.size * 0.35 : style?.fontScript === "subscript" ? layout.font.size * 0.2 : 0;
  if (scriptOffset) ctx.translate(0, scriptOffset);
  for (const line of layout.lines) {
    ctx.textAlign = line.align === "justify" ? "left" : line.align;
    if (line.align === "justify") paintJustifiedLine(ctx, line, layout.direction);
    else ctx.fillText(line.text, line.x, line.y);
  }
  paintDecorations(ctx, layout, style);
  ctx.restore();
}
