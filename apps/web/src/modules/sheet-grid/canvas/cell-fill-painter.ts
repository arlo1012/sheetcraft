import type { CellFillGradientStop, CellFillPatternStyle, CellStyle } from "@idea10/core/style";
import type { Rect } from "@idea10/sheet-engine/geometry";

const DEFAULT_PATTERN_COLOR = "#000000";
const patternsByContext = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function addStops(gradient: CanvasGradient, stops: readonly CellFillGradientStop[]): void {
  for (const stop of stops)
    gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
}

function paintPatternTile(
  ctx: CanvasRenderingContext2D,
  pattern: CellFillPatternStyle,
  color: string,
): void {
  const light = pattern.startsWith("light");
  const step = ["darkGray", "mediumGray", "lightGray", "gray125", "gray0625"].includes(pattern)
    ? 4
    : 8;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = light ? 0.45 : 1;
  const vertical = () => {
    const offsets = light ? [4] : [2, 6];
    for (const offset of offsets) {
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset, step);
    }
  };
  const horizontal = () => {
    const offsets = light ? [4] : [2, 6];
    for (const offset of offsets) {
      ctx.moveTo(0, offset);
      ctx.lineTo(step, offset);
    }
  };
  const diagonals = (up: boolean) => {
    const starts: readonly (readonly [number, number])[] = up
      ? [
          [-4, 4],
          [0, 8],
          [4, 12],
        ]
      : [
          [-4, 4],
          [0, 0],
          [4, -4],
        ];
    for (const [x, y] of starts) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, up ? y - 8 : y + 8);
    }
  };
  switch (pattern) {
    case "darkVertical":
    case "lightVertical":
      vertical();
      break;
    case "darkHorizontal":
    case "lightHorizontal":
      horizontal();
      break;
    case "darkGrid":
    case "lightGrid":
      vertical();
      horizontal();
      break;
    case "darkDown":
    case "lightDown":
      diagonals(false);
      break;
    case "darkUp":
    case "lightUp":
      diagonals(true);
      break;
    case "darkTrellis":
    case "lightTrellis":
      diagonals(false);
      diagonals(true);
      break;
    case "darkGray":
    case "mediumGray":
    case "lightGray":
    case "gray125":
    case "gray0625": {
      const blocks: readonly (readonly [number, number])[] =
        pattern === "darkGray"
          ? [
              [0, 0],
              [2, 0],
              [0, 2],
            ]
          : pattern === "mediumGray"
            ? [
                [0, 0],
                [2, 2],
              ]
            : pattern === "lightGray"
              ? [[0, 0]]
              : pattern === "gray125"
                ? [
                    [0, 0],
                    [2, 2],
                  ]
                : [[0, 0]];
      const blockSize = ["darkGray", "mediumGray", "lightGray"].includes(pattern) ? 2 : 1;
      for (const [x, y] of blocks) ctx.fillRect(x, y, blockSize, blockSize);
      break;
    }
  }
  if (!["darkGray", "mediumGray", "lightGray", "gray125", "gray0625"].includes(pattern))
    ctx.stroke();
}

function getPattern(
  ctx: CanvasRenderingContext2D,
  pattern: CellFillPatternStyle,
  color: string,
): CanvasPattern {
  const key = `${pattern}:${color}`;
  let patterns = patternsByContext.get(ctx);
  if (!patterns) {
    patterns = new Map();
    patternsByContext.set(ctx, patterns);
  }
  const cached = patterns.get(key);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  const size = ["darkGray", "mediumGray", "lightGray", "gray125", "gray0625"].includes(pattern)
    ? 4
    : 8;
  tile.width = size;
  tile.height = size;
  const tileContext = tile.getContext("2d")!;
  tileContext.beginPath();
  paintPatternTile(tileContext, pattern, color);
  const created = ctx.createPattern(tile, "repeat")!;
  patterns.set(key, created);
  return created;
}

function paintPattern(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  pattern: CellFillPatternStyle,
  color: string,
): void {
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.fillStyle = getPattern(ctx, pattern, color);
  ctx.fillRect(0, 0, rect.width, rect.height);
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
  const paintBand = (points: readonly [number, number][], fill: CanvasGradient) => {
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
  paintBand(
    [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [right, top],
      [left, top],
    ],
    topFill,
  );
  const bottomFill = ctx.createLinearGradient(0, bottom, 0, rect.y + rect.height);
  addStops(bottomFill, gradient.stops);
  paintBand(
    [
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
      [right, bottom],
      [left, bottom],
    ],
    bottomFill,
  );
  const leftFill = ctx.createLinearGradient(left, 0, rect.x, 0);
  addStops(leftFill, gradient.stops);
  paintBand(
    [
      [rect.x, rect.y],
      [left, top],
      [left, bottom],
      [rect.x, rect.y + rect.height],
    ],
    leftFill,
  );
  const rightFill = ctx.createLinearGradient(right, 0, rect.x + rect.width, 0);
  addStops(rightFill, gradient.stops);
  paintBand(
    [
      [rect.x + rect.width, rect.y],
      [right, top],
      [right, bottom],
      [rect.x + rect.width, rect.y + rect.height],
    ],
    rightFill,
  );
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
      const radius =
        (Math.abs(rect.width * Math.cos(radians)) + Math.abs(rect.height * Math.sin(radians))) / 2;
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const fill = ctx.createLinearGradient(
        x - Math.cos(radians) * radius,
        y - Math.sin(radians) * radius,
        x + Math.cos(radians) * radius,
        y + Math.sin(radians) * radius,
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
    paintPattern(ctx, rect, style.fillPattern, style.fillPatternColor ?? DEFAULT_PATTERN_COLOR);
}
