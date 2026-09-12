import type { CellFillGradientStop, CellFillPatternStyle, CellStyle } from "@idea10/core/style";
import type { Rect } from "@idea10/sheet-engine/geometry";

const DEFAULT_PATTERN_COLOR = "#000000";

function addStops(gradient: CanvasGradient, stops: readonly CellFillGradientStop[]): void {
  for (const stop of stops)
    gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
}

function strokePattern(
  ctx: CanvasRenderingContext2D,
  pattern: CellFillPatternStyle,
  color: string,
  rect: Rect,
): void {
  const light = pattern.startsWith("light");
  const step = ["darkGray", "mediumGray", "lightGray", "gray125", "gray0625"].includes(pattern)
    ? 4
    : 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = light ? 0.45 : 1;
  const startX = Math.floor(rect.x / step) * step - step;
  const startY = Math.floor(rect.y / step) * step - step;
  const vertical = () => {
    for (let x = startX + (light ? 4 : 2); x < rect.x + rect.width + step; x += step) {
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.height);
    }
  };
  const horizontal = () => {
    for (let y = startY + (light ? 4 : 2); y < rect.y + rect.height + step; y += step) {
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.width, y);
    }
  };
  const diagonals = (up: boolean) => {
    for (let offset = -rect.height - step; offset < rect.width + step; offset += step) {
      ctx.moveTo(rect.x + offset, up ? rect.y + rect.height : rect.y);
      ctx.lineTo(rect.x + offset + rect.height, up ? rect.y : rect.y + rect.height);
    }
  };
  switch (pattern) {
    case "darkVertical": case "lightVertical": vertical(); break;
    case "darkHorizontal": case "lightHorizontal": horizontal(); break;
    case "darkGrid": case "lightGrid": vertical(); horizontal(); break;
    case "darkDown": case "lightDown": diagonals(false); break;
    case "darkUp": case "lightUp": diagonals(true); break;
    case "darkTrellis": case "lightTrellis": diagonals(false); diagonals(true); break;
    case "darkGray":
    case "mediumGray":
    case "lightGray":
    case "gray125":
    case "gray0625": {
      const points = pattern === "darkGray" ? [[0, 0], [2, 0], [0, 2]]
        : pattern === "mediumGray" ? [[0, 0], [2, 2]]
          : pattern === "lightGray" ? [[0, 0], [2, 0], [0, 2], [2, 2]]
            : pattern === "gray125" ? [[0, 0], [2, 2]] : [[0, 0]];
      for (let x = startX; x < rect.x + rect.width + step; x += step)
        for (let y = startY; y < rect.y + rect.height + step; y += step)
          for (const [dx, dy] of points) ctx.fillRect(x + dx, y + dy, 1, 1);
      break;
    }
  }
  if (!pattern.includes("Gray")) ctx.stroke();
  ctx.restore();
}

function paintPathGradient(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  gradient: Extract<NonNullable<CellStyle["fillGradient"]>, { type: "path" }>,
): void {
  const left = rect.x + rect.width * gradient.left;
  const right = rect.x + rect.width * gradient.right;
  const top = rect.y + rect.height * gradient.top;
  const bottom = rect.y + rect.height * gradient.bottom;
  const paintBand = (
    points: readonly [number, number][],
    fill: CanvasGradient,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...points[0]!);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  };
  const topFill = ctx.createLinearGradient(0, top, 0, rect.y);
  addStops(topFill, gradient.stops);
  paintBand([[rect.x, rect.y], [rect.x + rect.width, rect.y], [right, top], [left, top]], topFill);
  const bottomFill = ctx.createLinearGradient(0, bottom, 0, rect.y + rect.height);
  addStops(bottomFill, gradient.stops);
  paintBand([[rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height], [right, bottom], [left, bottom]], bottomFill);
  const leftFill = ctx.createLinearGradient(left, 0, rect.x, 0);
  addStops(leftFill, gradient.stops);
  paintBand([[rect.x, rect.y], [left, top], [left, bottom], [rect.x, rect.y + rect.height]], leftFill);
  const rightFill = ctx.createLinearGradient(right, 0, rect.x + rect.width, 0);
  addStops(rightFill, gradient.stops);
  paintBand([[rect.x + rect.width, rect.y], [right, top], [right, bottom], [rect.x + rect.width, rect.y + rect.height]], rightFill);
  ctx.fillStyle = gradient.stops[0]!.color;
  ctx.fillRect(left, top, right - left, bottom - top);
}

/** Paints a cell fill over the caller's default cell surface. */
export function paintCellFill(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  style: Readonly<CellStyle> | undefined,
): void {
  if (!style) return;
  if (style.fillGradient) {
    const gradient = style.fillGradient;
    if (gradient.type === "linear") {
      const radians = (gradient.angle * Math.PI) / 180;
      const radius = Math.hypot(rect.width, rect.height) / 2;
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const fill = ctx.createLinearGradient(
        x - Math.cos(radians) * radius, y - Math.sin(radians) * radius,
        x + Math.cos(radians) * radius, y + Math.sin(radians) * radius,
      );
      addStops(fill, gradient.stops);
      ctx.fillStyle = fill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else paintPathGradient(ctx, rect, gradient);
    return;
  }
  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  if (style.fillPattern)
    strokePattern(ctx, style.fillPattern, style.fillPatternColor ?? DEFAULT_PATTERN_COLOR, rect);
}
