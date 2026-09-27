import type {
  ConditionalFormatIconSet,
  ConditionalFormatVisual,
} from "@idea10/core/conditional-formatting";
import type { Rect } from "@idea10/sheet-engine/geometry";

const ICON_GAP = 4;

/** Width reserved for a conditional-format icon before cell text is laid out. */
export function getConditionalFormatIconSlot(
  rect: Rect,
  visual: ConditionalFormatVisual | undefined,
): number {
  if (!visual?.iconSet) return 0;
  return Math.max(0, Math.min(rect.height - 4, 18) + ICON_GAP);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function iconCount(iconSet: ConditionalFormatIconSet): number {
  return iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
}

function trafficColor(index: number, count: number): string {
  return count <= 3
    ? (["#e34747", "#f0b429", "#2fa84f"][index] ?? "#2fa84f")
    : (["#d94747", "#ed9b38", "#f0c34e", "#5daf5c", "#3479b9"][index] ?? "#3479b9");
}

function arrowColor(index: number, count: number): string {
  if (count === 3) return ["#d94747", "#f0b429", "#2fa84f"][index] ?? "#2fa84f";
  if (count === 4) return ["#d94747", "#edb13c", "#edb13c", "#2fa84f"][index] ?? "#2fa84f";
  return ["#d94747", "#ed9b38", "#f0c34e", "#edb13c", "#2fa84f"][index] ?? "#2fa84f";
}

function drawArrow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, -size / 2);
  context.lineTo(size / 2, size / 7);
  context.lineTo(size / 5, size / 7);
  context.lineTo(size / 5, size / 2);
  context.lineTo(-size / 5, size / 2);
  context.lineTo(-size / 5, size / 7);
  context.lineTo(-size / 2, size / 7);
  context.closePath();
  context.fill();
  context.restore();
}

function drawSymbol(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
  circled: boolean,
): void {
  const colors = ["#db4c3f", "#e7a82e", "#36a85c"];
  const color = colors[index] ?? colors[2]!;
  if (circled) {
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, size / 9);
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.stroke();
  }
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.5, size / 7);
  context.lineCap = "round";
  context.beginPath();
  if (index === 0) {
    context.moveTo(x - size / 4, y - size / 4);
    context.lineTo(x + size / 4, y + size / 4);
    context.moveTo(x + size / 4, y - size / 4);
    context.lineTo(x - size / 4, y + size / 4);
  } else if (index === 1) {
    context.moveTo(x, y - size / 4);
    context.lineTo(x, y + size / 9);
    context.moveTo(x, y + size / 3);
    context.lineTo(x, y + size / 3 + 0.1);
  } else {
    context.moveTo(x - size / 3, y);
    context.lineTo(x - size / 10, y + size / 4);
    context.lineTo(x + size / 3, y - size / 4);
  }
  context.stroke();
}

function drawRating(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
  count: number,
): void {
  const bars = count;
  const barWidth = Math.max(1.5, size / (bars * 1.7));
  const gap = barWidth * 0.45;
  const left = x - (bars * barWidth + (bars - 1) * gap) / 2;
  context.fillStyle = "#4f81bd";
  for (let bar = 0; bar < bars; bar += 1) {
    const active = bar <= index;
    const height = size * ((bar + 1) / bars);
    context.globalAlpha = active ? 1 : 0.2;
    context.fillRect(left + bar * (barWidth + gap), y + size / 2 - height, barWidth, height);
  }
  context.globalAlpha = 1;
}

function drawQuarter(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
): void {
  const fraction = index / 4;
  if (fraction > 0) {
    context.fillStyle = "#4f81bd";
    context.beginPath();
    context.arc(x, y, size / 2, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    context.lineTo(x, y);
    context.closePath();
    context.fill();
  }
  context.strokeStyle = "#76808c";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, size / 2, 0, Math.PI * 2);
  context.stroke();
}

function drawSign(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
): void {
  const colors = ["#db4c3f", "#e7a82e", "#36a85c"];
  context.fillStyle = colors[index] ?? colors[2]!;
  context.strokeStyle = "rgba(61, 68, 76, 0.7)";
  context.lineWidth = 1;
  context.beginPath();
  if (index === 0) {
    context.moveTo(x, y - size / 2);
    context.lineTo(x + size / 2, y);
    context.lineTo(x, y + size / 2);
    context.lineTo(x - size / 2, y);
    context.closePath();
  } else if (index === 1) {
    context.moveTo(x, y - size / 2);
    context.lineTo(x + size / 2, y + size / 2);
    context.lineTo(x - size / 2, y + size / 2);
    context.closePath();
  } else {
    context.arc(x, y, size / 2, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
}

function drawBoxes(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
): void {
  const box = size / 2;
  const left = x - size / 2;
  const top = y - size / 2;
  for (let item = 0; item < 4; item += 1) {
    context.fillStyle = item < index ? "#4f81bd" : "#d8dde4";
    context.fillRect(
      left + (item % 2) * box + 0.5,
      top + Math.floor(item / 2) * box + 0.5,
      box - 1,
      box - 1,
    );
  }
}

function drawTriangleSet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
): void {
  context.fillStyle = ["#db4c3f", "#e7a82e", "#36a85c"][index] ?? "#36a85c";
  if (index === 1) {
    context.fillRect(x - size / 2, y - size / 8, size, size / 4);
    return;
  }
  context.beginPath();
  if (index === 0) {
    context.moveTo(x - size / 2, y - size / 2);
    context.lineTo(x + size / 2, y - size / 2);
    context.lineTo(x, y + size / 2);
  } else {
    context.moveTo(x, y - size / 2);
    context.lineTo(x + size / 2, y + size / 2);
    context.lineTo(x - size / 2, y + size / 2);
  }
  context.closePath();
  context.fill();
}

function traceStar(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * (Math.PI / 5);
    const distance = point % 2 === 0 ? radius : radius * 0.42;
    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;
    if (point === 0) context.moveTo(targetX, targetY);
    else context.lineTo(targetX, targetY);
  }
  context.closePath();
}

function drawStarSet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  index: number,
): void {
  context.strokeStyle = "#aa8d42";
  context.lineWidth = 1;
  if (index > 0) {
    context.save();
    traceStar(context, x, y, size / 2);
    context.clip();
    context.fillStyle = "#e7b539";
    context.fillRect(x - size / 2, y - size / 2, index === 1 ? size / 2 : size, size);
    context.restore();
  }
  traceStar(context, x, y, size / 2);
  context.stroke();
}

function drawIcon(
  context: CanvasRenderingContext2D,
  rect: Rect,
  iconSet: ConditionalFormatIconSet,
  iconIndex: number,
): void {
  const count = iconCount(iconSet);
  const index = clamp(iconIndex, 0, count - 1);
  const size = Math.max(5, Math.min(rect.height - 6, 16));
  const x = rect.x + 3 + size / 2;
  const y = rect.y + rect.height / 2;
  if (iconSet.includes("Arrows")) {
    const angles =
      count === 3
        ? [Math.PI, Math.PI / 2, 0]
        : count === 4
          ? [Math.PI, Math.PI * 0.75, Math.PI * 0.25, 0]
          : [Math.PI, Math.PI * 0.75, Math.PI / 2, Math.PI / 4, 0];
    drawArrow(
      context,
      x,
      y,
      size,
      angles[index]!,
      iconSet.endsWith("Gray") ? "#7d8590" : arrowColor(index, count),
    );
    return;
  }
  if (iconSet.includes("Flags")) {
    context.strokeStyle = "#65707c";
    context.lineWidth = Math.max(1, size / 9);
    context.beginPath();
    context.moveTo(x - size / 3, y - size / 2);
    context.lineTo(x - size / 3, y + size / 2);
    context.stroke();
    context.fillStyle = trafficColor(index, count);
    context.beginPath();
    context.moveTo(x - size / 3, y - size / 2);
    context.lineTo(x + size / 2, y - size / 3);
    context.lineTo(x - size / 3, y);
    context.closePath();
    context.fill();
    return;
  }
  if (iconSet.includes("TrafficLights")) {
    context.fillStyle =
      iconSet === "fourTrafficLights"
        ? (["#3f454d", "#d94747", "#f0b429", "#2fa84f"][index] ?? "#2fa84f")
        : trafficColor(index, count);
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();
    if (iconSet.endsWith("Rimmed")) {
      context.strokeStyle = "#59616d";
      context.lineWidth = 1;
      context.stroke();
    }
    return;
  }
  if (iconSet.includes("Symbols"))
    return drawSymbol(context, x, y, size, index, iconSet.endsWith("Circled"));
  if (iconSet.includes("Triangles")) return drawTriangleSet(context, x, y, size, index);
  if (iconSet.includes("Stars")) return drawStarSet(context, x, y, size, index);
  if (iconSet.includes("Ratings")) return drawRating(context, x, y, size, index, count);
  if (iconSet.includes("Quarters")) return drawQuarter(context, x, y, size, index);
  if (iconSet.includes("Boxes")) return drawBoxes(context, x, y, size, index);
  if (iconSet.includes("RedToBlack")) {
    context.fillStyle = ["#24292f", "#747b84", "#e5aaa4", "#c63d3d"][index] ?? "#c63d3d";
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  if (iconSet.includes("Signs")) return drawSign(context, x, y, size, index);
}

function paintDataBar(
  context: CanvasRenderingContext2D,
  rect: Rect,
  visual: NonNullable<ConditionalFormatVisual["dataBar"]>,
): void {
  const inset = 2;
  const width = Math.max(0, rect.width - inset * 2);
  const start = clamp(visual.start, 0, 1) * width + rect.x + inset;
  const end = clamp(visual.end, 0, 1) * width + rect.x + inset;
  const axis = clamp(visual.axis, 0, 1) * width + rect.x + inset;
  const x = Math.min(start, end);
  const barWidth = Math.abs(end - start);
  const y = rect.y + 3;
  const height = Math.max(0, rect.height - 6);
  if (barWidth > 0 && height > 0) {
    const negative = Math.min(start, end) < axis;
    const color = negative ? (visual.negativeColor ?? visual.color) : visual.color;
    context.fillStyle = visual.gradient
      ? (() => {
          const gradient = context.createLinearGradient(x, y, x + barWidth, y);
          gradient.addColorStop(0, negative ? `${color}66` : color);
          gradient.addColorStop(1, negative ? color : `${color}66`);
          return gradient;
        })()
      : color;
    context.fillRect(x, y, barWidth, height);
  }
  if (axis > rect.x + inset && axis < rect.x + rect.width - inset) {
    context.strokeStyle = "rgba(69, 76, 85, 0.6)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(Math.round(axis) + 0.5, y);
    context.lineTo(Math.round(axis) + 0.5, y + height);
    context.stroke();
  }
}

/** Paints visual conditional formats after fills and before text. */
export function paintConditionalFormatVisual(
  context: CanvasRenderingContext2D,
  rect: Rect,
  visual: ConditionalFormatVisual | undefined,
): void {
  if (!visual) return;
  if (visual.dataBar) paintDataBar(context, rect, visual.dataBar);
  if (visual.iconSet) drawIcon(context, rect, visual.iconSet.iconSet, visual.iconSet.iconIndex);
}
